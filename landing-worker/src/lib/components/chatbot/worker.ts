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
import { MODEL_HOST, MODEL_ID, ORT_WASM_PATH, dtypeFor } from './engine';

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
	| { type: 'load'; device: 'webgpu' | 'wasm' }
	| {
			type: 'generate';
			messages: unknown[];
			images: string[];
			audio: string[];
			enableThinking?: boolean;
			opts: Record<string, unknown>;
	  }
	| { type: 'interrupt' };

const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

async function load(device: 'webgpu' | 'wasm') {
	if (model) {
		post({ type: 'ready' });
		return;
	}
	// Every file reports separately, so the UI aggregates rather than showing
	// one bar jumping between four downloads.
	const progress_callback = (p: Record<string, unknown>) => post({ type: 'progress', payload: p });

	processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
	model = await AutoModelForImageTextToText.from_pretrained(MODEL_ID, {
		dtype: dtypeFor(device),
		// A string applies to every session; an object would silently leave any
		// part it omits on the default backend, which in a browser is wasm.
		device,
		progress_callback
	});
	post({ type: 'ready', device });
}

/**
 * Decodes a data URL into the shape the processor wants. Images go through
 * RawImage; audio has to become a mono Float32Array at the model's sample rate,
 * which is what the audio tower was trained on.
 */
async function decodeImages(urls: string[]) {
	if (!urls.length) return null;
	const { RawImage } = await import('@huggingface/transformers');
	return Promise.all(urls.map((u) => RawImage.fromURL(u)));
}

const AUDIO_SAMPLE_RATE = 16000;

async function decodeAudio(urls: string[]) {
	if (!urls.length) return null;
	const out: Float32Array[] = [];
	for (const u of urls) {
		const buf = await (await fetch(u)).arrayBuffer();
		// OfflineAudioContext resamples to the rate the encoder expects.
		const ctx = new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE);
		const decoded = await ctx.decodeAudioData(buf);
		if (decoded.numberOfChannels === 1) {
			out.push(decoded.getChannelData(0));
		} else {
			// Downmix: the encoder takes mono.
			const n = decoded.length;
			const mixed = new Float32Array(n);
			for (let c = 0; c < decoded.numberOfChannels; c++) {
				const ch = decoded.getChannelData(c);
				for (let i = 0; i < n; i++) mixed[i] += ch[i] / decoded.numberOfChannels;
			}
			out.push(mixed);
		}
	}
	return out;
}

async function generate(msg: Extract<InMsg, { type: 'generate' }>) {
	if (!model || !processor) throw new Error('the model is not loaded');

	const [images, audio] = await Promise.all([decodeImages(msg.images), decodeAudio(msg.audio)]);

	// The processor turns the chat template plus any media into model inputs.
	const proc = processor as unknown as {
		apply_chat_template(m: unknown[], o: Record<string, unknown>): unknown;
	};
	const inputs = await proc.apply_chat_template(msg.messages, {
		add_generation_prompt: true,
		tokenize: true,
		return_dict: true,
		// The template opens a reasoning channel when this is set.
		enable_thinking: msg.enableThinking ?? false,
		...(images ? { images } : {}),
		...(audio ? { audio } : {})
	});

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
		if (msg.type === 'load') await load(msg.device);
		else if (msg.type === 'generate') await generate(msg);
		else if (msg.type === 'interrupt') stopper?.interrupt();
	} catch (err) {
		post({ type: 'error', message: (err as Error).message || String(err) });
	}
};
