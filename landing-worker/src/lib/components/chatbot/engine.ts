import type {
	ChatCompletionMessageParam,
	InitProgressReport,
	MLCEngineInterface
} from '@mlc-ai/web-llm';

/**
 * One model, in two builds. Which one runs is decided by the GPU, not by the
 * visitor — the identity is deliberately not surfaced in the UI so the weights
 * can be swapped for a fine-tune without the page contradicting itself.
 * Everything user-facing says "the model".
 */
export interface ModelBuild {
	id: string;
	/** Bytes fetched over the network — NOT web-llm's `vram_required_MB`, which
	 * is runtime GPU memory (weights + KV cache + activations) and runs larger. */
	downloadMb: number;
	/** web-llm's `vram_required_MB`: GPU memory once live. */
	vramMb: number;
}

/**
 * Qwen3-0.6B, chosen after Qwen3.5-0.8B looped badly in multi-turn chat.
 *
 * Qwen3.5 failed for two compounding reasons, neither fixable from here: it is
 * a hybrid Gated DeltaNet (18 linear-attention layers to 6 full-attention) and
 * the only family in web-llm's list carrying a `max_history_size` override —
 * the tell for the recurrent-state path — and its MLC config declares Qwen3's
 * stop token ids against a 248320-token vocabulary where they are undefined.
 * Qwen's own model card warns the 0.8B is "more prone to entering thinking
 * loops … which may prevent it from terminating generation properly".
 *
 * Qwen3-0.6B is the older generation and scores lower on knowledge benchmarks,
 * but it is a plain transformer with a correct `qwen3` template and stop ids
 * (151643 / 151645) that genuinely exist in its 151936-token vocabulary. For a
 * chat toy, terminating correctly beats scoring well.
 *
 * It is also the right pick for Chinese: 24873 whole-word Chinese tokens
 * against Llama-3.2-1B's 3629, which encodes a 23-character Chinese sentence in
 * ~12 tokens where Llama needs ~17. And it is the smallest of the candidates —
 * 335 MB, half of Llama-3.2-1B's 672 MB.
 *
 * Swapping the model again means changing both ids below and re-checking the
 * packaged `mlc-chat-config.json` against the model's own
 * `tokenizer_config.json`: stop token ids belong to a model's tokenizer and are
 * not portable between generations. That mismatch is exactly what broke Qwen3.5.
 *
 * Both builds carry the same int4 weights and download identically; they differ
 * in activation precision, which shows up as runtime VRAM. f16 is preferred
 * because it is faster, but its kernels need `shader-f16` — `pickModel()` falls
 * back where the adapter lacks it.
 */
export const MODEL_F16 = 'Qwen3-0.6B-q4f16_1-MLC';
export const MODEL_F32 = 'Qwen3-0.6B-q4f32_1-MLC';

export const BUILDS: Record<string, ModelBuild> = {
	[MODEL_F16]: { id: MODEL_F16, downloadMb: 335, vramMb: 1403 },
	[MODEL_F32]: { id: MODEL_F32, downloadMb: 335, vramMb: 1925 }
};

/** Every build the page may cache — used by the storage panel. */
export const ALL_BUILDS: ModelBuild[] = Object.values(BUILDS);

/**
 * `max_history_size` is deliberately NOT overridden. Despite the name it does
 * not trim conversation history — web-llm only uses it to size the RNN state
 * tensor for recurrent/hybrid models. Multi-turn memory is bounded by
 * `context_window_size` (4096) instead, and the engine slides that window
 * itself. Setting it here would over-allocate state for no benefit.
 */

/**
 * No `conv_template` override. Qwen3-0.6B's packaged config declares the
 * `qwen3` template with stop tokens 151643 / 151645, which are `<|endoftext|>`
 * and `<|im_end|>` in its own 151936-token vocabulary — verified against the
 * model's `tokenizer_config.json`, so overriding it could only break it.
 *
 * (Qwen3.5 needed one: it declares these same two ids against a 248320-token
 * vocabulary where they are undefined, so generation never stopped cleanly.)
 */

export interface GpuSupport {
	ok: boolean;
	f16: boolean;
	/** Human-readable reason when `ok` is false. */
	reason?: string;
	adapterLabel?: string;
}

/**
 * WebGPU is a two-step check: the entry point can exist while no adapter is
 * actually available (blocklisted driver, software fallback disabled), and that
 * second case is the one that shows up on real machines.
 */
export async function probeGpu(): Promise<GpuSupport> {
	const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
	if (!gpu) {
		return { ok: false, f16: false, reason: 'This browser has no WebGPU. Chrome/Edge 113+, or Safari 18+.' };
	}
	let adapter: GPUAdapter | null = null;
	try {
		adapter = await gpu.requestAdapter();
	} catch (err) {
		return { ok: false, f16: false, reason: `WebGPU adapter request failed: ${(err as Error).message}` };
	}
	if (!adapter) {
		return { ok: false, f16: false, reason: 'WebGPU is present but no GPU adapter was granted — often a blocklisted driver.' };
	}
	return {
		ok: true,
		f16: adapter.features.has('shader-f16'),
		adapterLabel: adapter.info?.description || adapter.info?.vendor || undefined
	};
}

/** The f16 build unless the adapter can't run it. */
export function pickModel(gpu: GpuSupport): string {
	return gpu.f16 ? MODEL_F16 : MODEL_F32;
}

export function buildById(id: string): ModelBuild | undefined {
	return BUILDS[id];
}

/** Context window the model is configured with — the budget the UI reports against. */
export const CONTEXT_WINDOW = 4096;

/**
 * Sampling for chat replies.
 *
 * The packaged config ships every penalty disabled (`repetition_penalty: 1.0`,
 * both OpenAI penalties at 0), which leaves a sub-1B model free to fall into a
 * loop and restate the same sentence until it hits max_tokens. A mild
 * repetition penalty plus nucleus sampling is the standard remedy; the values
 * are deliberately gentle, since penalising too hard makes a small model
 * incoherent rather than merely repetitive.
 */
export const SAMPLING = {
	// Qwen3's own recommended non-thinking settings.
	temperature: 0.7,
	top_p: 0.8,
	// Qwen suggests presence_penalty up to 1.5-2.0 against repetition, but warns
	// that high values cause language mixing — which for a page answering in
	// Chinese is a worse failure than the occasional repeat. Kept moderate.
	// Set as a pair: web-llm zeroes one and warns if only the other is given.
	presence_penalty: 0.6,
	frequency_penalty: 0.3
} as const;

/**
 * Loads the engine in a Web Worker so token generation never blocks the main
 * thread. The worker module is created here rather than at module scope so a
 * cancelled load leaves nothing behind.
 */
export async function createEngine(
	modelId: string,
	onProgress: (r: InitProgressReport) => void
): Promise<{ engine: MLCEngineInterface; worker: Worker }> {
	const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
	const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
	try {
		const engine = await CreateWebWorkerMLCEngine(worker, modelId, {
			initProgressCallback: onProgress
		});
		return { engine, worker };
	} catch (err) {
		worker.terminate();
		throw err;
	}
}

/** Which builds already have their weights cached locally. */
export async function cachedModelIds(): Promise<Set<string>> {
	const { hasModelInCache } = await import('@mlc-ai/web-llm');
	const found = new Set<string>();
	await Promise.all(
		ALL_BUILDS.map(async (m) => {
			// A miss throws on some browsers rather than returning false.
			try {
				if (await hasModelInCache(m.id)) found.add(m.id);
			} catch {
				/* treat as not cached */
			}
		})
	);
	return found;
}

/**
 * Drops one model's weights, wasm and config from the browser's cache. The
 * engine holding that model must be unloaded first, or the next load can read
 * a half-deleted entry.
 */
export async function evictModel(modelId: string): Promise<void> {
	const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
	await deleteModelAllInfoInCache(modelId);
}

/** Rough on-disk footprint of the cached builds, in MB. */
export function cachedSizeMb(ids: Set<string>): number {
	return ALL_BUILDS.filter((m) => ids.has(m.id)).reduce((a, m) => a + m.downloadMb, 0);
}

export type { ChatCompletionMessageParam, InitProgressReport, MLCEngineInterface };
