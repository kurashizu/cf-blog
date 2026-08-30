/// <reference lib="webworker" />
/**
 * The model runs here so decoding never competes with the UI for the main
 * thread. transformers.js has no worker protocol of its own (web-llm did), so
 * this defines a small one: `load`, `generate`, `interrupt`, and progress and
 * token events back.
 */
import {
	AutoProcessor,
	AutoModelForImageTextToText,
	InterruptableStoppingCriteria,
	TextStreamer,
	env,
	type PreTrainedModel,
	type Processor
} from '@huggingface/transformers';
import { DTYPE, MODEL_HOST, MODEL_ID, ORT_WASM_PATH } from './engine';

/**
 * Serve both the weights and the runtime from this site's bucket. By default
 * transformers.js fetches models from huggingface.co and onnxruntime-web pulls
 * its wasm from jsdelivr; neither is wanted here.
 *
 * `remotePathTemplate` is flattened to just the model name because the mirror
 * stores files under llm/<model>/… rather than the Hub's <org>/<model>/resolve/
 * <revision>/… layout.
 */
env.remoteHost = MODEL_HOST;
env.remotePathTemplate = '{model}';
// Typed optional because the wasm backend is absent in some builds; in a
// browser it is always present, and without it nothing here could run.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = ORT_WASM_PATH;

let processor: Processor | null = null;
let model: PreTrainedModel | null = null;
let stopper: InterruptableStoppingCriteria | null = null;

type InMsg =
	| { type: 'load' }
	| {
			type: 'generate';
			messages: unknown[];
			images: string[];
			/** Mono PCM at the encoder's sample rate, decoded on the main thread. */
			audio: Float32Array[];
			enableThinking?: boolean;
			opts: Record<string, unknown>;
	  }
	| { type: 'interrupt' };

const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

async function load() {
	if (model) {
		post({ type: 'ready' });
		return;
	}
	// Every file reports separately, so the UI aggregates rather than showing
	// one bar jumping between four downloads.
	const progress_callback = (p: Record<string, unknown>) => post({ type: 'progress', payload: p });

	processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
	model = await AutoModelForImageTextToText.from_pretrained(MODEL_ID, {
		dtype: DTYPE,
		// A string applies to every session; an object would silently leave any
		// part it omits on the default backend, which in a browser is wasm.
		device: 'webgpu',
		progress_callback
	});
	post({ type: 'ready' });
}

/**
 * Decodes a data URL into the shape the processor wants. Images go through
 * RawImage.
 *
 * Audio is decoded on the main thread instead, because the Web Audio API is not
 * exposed to workers in WebKit — `OfflineAudioContext` is simply undefined here,
 * which is what "Can't find variable: OfflineAudioContext" was. The page hands
 * this side finished mono Float32Array samples, so nothing audio-related has to
 * construct an audio context in worker scope.
 */
async function decodeImages(urls: string[]) {
	if (!urls.length) return null;
	const { RawImage } = await import('@huggingface/transformers');
	return Promise.all(urls.map((u) => RawImage.fromURL(u)));
}

async function generate(msg: Extract<InMsg, { type: 'generate' }>) {
	if (!model || !processor) throw new Error('the model is not loaded');

	const images = await decodeImages(msg.images);
	const audio = msg.audio.length ? msg.audio : null;

	// Two steps, and the split matters. apply_chat_template() only renders and
	// tokenizes text: any extra option it does not recognise (`images`, `audio`)
	// falls through to the Jinja template as a variable and is then dropped, so
	// asking it to tokenize directly produced a prompt holding one bare
	// `<|image|>` token with no pixels behind it — which the model read as a typo
	// rather than a picture.
	//
	// Calling the processor with the rendered text is what actually expands each
	// placeholder into its soft-token run and attaches pixel_values /
	// audio features.
	const proc = processor as unknown as {
		apply_chat_template(m: unknown[], o: Record<string, unknown>): string;
		(text: string, images: unknown, audio: unknown): Promise<unknown>;
	};
	const prompt = proc.apply_chat_template(msg.messages, {
		add_generation_prompt: true,
		tokenize: false,
		// The template opens a reasoning channel when this is set.
		enable_thinking: msg.enableThinking ?? false
	});
	const inputs = await proc(prompt, images, audio);

	stopper = new InterruptableStoppingCriteria();

	// Typed optional because a Processor need not carry one; this model's does.
	const tokenizer = processor.tokenizer;
	if (!tokenizer) throw new Error('the processor has no tokenizer');

	const t0 = performance.now();
	let chunks = 0;

	const streamer = new TextStreamer(tokenizer, {
		skip_prompt: true,
		skip_special_tokens: true,
		callback_function: (text: string) => {
			chunks++;
			post({ type: 'token', text });
		}
	});

	try {
		await model.generate({
			...(inputs as object),
			...msg.opts,
			streamer,
			stopping_criteria: stopper
		} as Parameters<PreTrainedModel['generate']>[0]);
		const secs = (performance.now() - t0) / 1000;
		// Streamer callbacks fire per decoded chunk, which for this tokenizer is
		// one token — close enough for a rate readout, and it costs nothing.
		post({ type: 'done', tokensPerSecond: secs > 0 ? chunks / secs : 0 });
	} catch (err) {
		post({ type: 'error', message: (err as Error).message || String(err) });
	} finally {
		stopper = null;
	}
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
	const msg = e.data;
	try {
		if (msg.type === 'load') await load();
		else if (msg.type === 'generate') await generate(msg);
		else if (msg.type === 'interrupt') stopper?.interrupt();
	} catch (err) {
		post({ type: 'error', message: (err as Error).message || String(err) });
	}
};
