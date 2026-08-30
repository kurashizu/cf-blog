/// <reference lib="webworker" />
/**
 * The model runs here so decoding never competes with the UI for the main
 * thread.
 *
 * wllama exposes an OpenAI-shaped API over llama.cpp compiled to wasm, which
 * brings three things the previous ONNX runtime did not: the attention cache
 * survives between turns (so a reply no longer re-reads the whole conversation
 * before writing a word), tool calls are parsed out of the model's own output,
 * and reasoning arrives in its own field rather than having to be recovered
 * from delimiters inside the text.
 */
// The built ESM rather than the bare specifier: the package has no exports map
// and its `main` points at the TypeScript sources, which svelte-check then type
// checks as if they were ours.
import { Wllama } from '@wllama/wllama/esm/index.js';
import { MMPROJ_FILE, MODEL_FILE, MODEL_HOST, WASM_PATH } from './engine';

let wllama: Wllama | null = null;
/** Set while a reply is streaming, so `interrupt` has something to abort. */
let abort: AbortController | null = null;

type InMsg =
	| { type: 'load'; contextWindow: number }
	| {
			type: 'generate';
			messages: unknown[];
			tools?: unknown[];
			enableThinking?: boolean;
			opts: Record<string, unknown>;
	  }
	| { type: 'interrupt' };

const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

/**
 * wllama's primary build needs both JSPI and Memory64. Firefox releases that
 * expose WebGPU but lack either feature otherwise pass the page's adapter probe
 * and then fall back to a load path whose 4 GiB heap cannot hold this model,
 * projector and a 32K context at the same time.
 */
function needsCompatRuntime(): boolean {
	const wasm = WebAssembly as typeof WebAssembly & { Suspending?: unknown };
	if (typeof wasm.Suspending !== 'function') return true;
	try {
		new WebAssembly.Memory(
			{ address: 'i64', initial: 1n } as unknown as WebAssembly.MemoryDescriptor
		);
		return false;
	} catch {
		return true;
	}
}

async function load(contextWindow: number) {
	if (wllama) {
		post({ type: 'ready' });
		return;
	}
	// The runtime reports load failures through its logger, not by rejecting:
	// without one, a model that fails to come up leaves the page back on the
	// idle screen with nothing said about why.
	const w = new Wllama(
		{ default: WASM_PATH },
		{
			logger: {
				debug: () => {},
				log: () => {},
				warn: (...a: unknown[]) => post({ type: 'log', level: 'warn', text: a.join(' ') }),
				error: (...a: unknown[]) => post({ type: 'log', level: 'error', text: a.join(' ') })
			}
		}
	);
	// This is a no-op on browsers that support the primary runtime. On older
	// Firefox/Safari it selects wllama's matching 3.6.1 Asyncify build, which is
	// able to drive WebGPU without JSPI.
	w.setCompat('default', 'firefox_safari');
	const compat = needsCompatRuntime();
	const effectiveContext = compat ? Math.min(contextWindow, 8192) : contextWindow;
	if (effectiveContext !== contextWindow) {
		post({
			type: 'log',
			level: 'warn',
			text: `compatibility runtime: context limited to ${effectiveContext} tokens to stay below its 4 GiB heap`
		});
	}

	await w.loadModelFromUrl(
		// The projector rides along in the source object rather than in the
		// options; passed as an option it is silently ignored and the model comes
		// up text-only, with nothing to say so.
		{ url: MODEL_HOST + MODEL_FILE, mmprojUrl: MODEL_HOST + MMPROJ_FILE },
		{
			n_ctx: effectiveContext,
			// The UI serialises generations, so the library's four default server
			// slots only reserve memory that this chatbot can never use.
			n_parallel: 1,
			// Everything on the GPU: WebGPU is a hard requirement for this page, so
			// there is no CPU split worth negotiating.
			n_gpu_layers: 999,
			// Render the model's own chat template rather than guessing a format.
			// This is also what makes tool calls and reasoning legible.
			jinja: true,
			progressCallback: ({ loaded, total }: { loaded: number; total: number }) =>
				post({ type: 'progress', loaded, total })
		}
	);
	wllama = w;
	post({ type: 'ready' });
}

interface Delta {
	content?: string;
	reasoning_content?: string;
	/**
	 * Only the opening fragment of a call carries `id` and `name`; every
	 * fragment after it identifies the call by `index` alone, and its
	 * `arguments` are a slice of the JSON to be concatenated.
	 */
	tool_calls?: {
		index: number;
		id?: string;
		function?: { name?: string; arguments?: string };
	}[];
}

async function generate(msg: Extract<InMsg, { type: 'generate' }>) {
	if (!wllama) throw new Error('the model is not loaded');

	abort = new AbortController();
	const t0 = performance.now();
	let tokens = 0;
	// Accumulated across chunks, keyed by the index the runtime repeats on every
	// fragment — the id appears only once, on the first.
	const calls = new Map<number, { id: string; name: string; args: string }>();

	try {
		await wllama.createChatCompletion({
			messages: msg.messages,
			...(msg.tools?.length ? { tools: msg.tools } : {}),
			// Reasoning governs the whole exchange, and the template reads it from
			// here rather than from anything in the messages themselves.
			chat_template_kwargs: { enable_thinking: msg.enableThinking ?? false },
			...msg.opts,
			stream: true,
			abortSignal: abort.signal,
			onData: (chunk: { choices?: { delta?: Delta }[] }) => {
				const d = chunk.choices?.[0]?.delta;
				if (!d) return;
				if (d.reasoning_content) {
					tokens++;
					post({ type: 'reasoning', text: d.reasoning_content });
				}
				if (d.content) {
					tokens++;
					post({ type: 'token', text: d.content });
				}
				for (const c of d.tool_calls ?? []) {
					let slot = calls.get(c.index);
					if (!slot) {
						slot = { id: '', name: '', args: '' };
						calls.set(c.index, slot);
					}
					if (c.id) slot.id = c.id;
					if (c.function?.name) slot.name = c.function.name;
					if (c.function?.arguments) slot.args += c.function.arguments;
				}
			}
			// The call is typed against wllama's own message union, which this
			// worker deliberately keeps opaque: the page owns the conversation.
		} as Parameters<Wllama['createChatCompletion']>[0]);

		const secs = (performance.now() - t0) / 1000;
		post({
			type: 'done',
			tokensPerSecond: secs > 0 ? tokens / secs : 0,
			toolCalls: [...calls.values()]
		});
	} catch (err) {
		// An interrupt arrives here as an abort; that is a normal end, not a
		// failure, and the partial reply on the page stays as it is.
		if (abort?.signal.aborted) post({ type: 'done', tokensPerSecond: 0, toolCalls: [] });
		else post({ type: 'error', message: (err as Error).message || String(err) });
	} finally {
		abort = null;
	}
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
	const msg = e.data;
	try {
		if (msg.type === 'load') await load(msg.contextWindow);
		else if (msg.type === 'generate') await generate(msg);
		else if (msg.type === 'interrupt') abort?.abort();
	} catch (err) {
		post({ type: 'error', message: (err as Error).message || String(err) });
	}
};
