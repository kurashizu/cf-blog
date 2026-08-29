import type { ChatCompletionMessageParam, InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm';

export interface ModelChoice {
	id: string;
	label: string;
	/**
	 * Bytes actually fetched over the network, summed from the model repo's file
	 * listing. This is NOT web-llm's `vram_required_MB` — that field is runtime
	 * GPU memory (weights + KV cache + activations) and runs 1.5-4x larger.
	 */
	downloadMb: number;
	/** web-llm's `vram_required_MB`: what the model occupies on the GPU once live. */
	vramMb: number;
	note: string;
}

/**
 * Both builds carry the same int4 weights and download identically (426 MB);
 * they differ only in activation precision, which shows up as runtime VRAM.
 * f16 is the default because it is faster, but its kernels need the
 * `shader-f16` WebGPU feature — `pickModel()` falls back where it is missing.
 */
export const MODEL_F16 = 'Qwen3.5-0.8B-q4f16_1-MLC';
export const MODEL_F32 = 'Qwen3.5-0.8B-q4f32_1-MLC';

export const MODELS: ModelChoice[] = [
	{ id: MODEL_F16, label: 'Qwen3.5 0.8B · q4f16', downloadMb: 426, vramMb: 1629, note: 'default — best Chinese, needs shader-f16' },
	{ id: MODEL_F32, label: 'Qwen3.5 0.8B · q4f32', downloadMb: 426, vramMb: 1894, note: 'same weights, no f16 required' },
	{ id: 'gemma3-1b-it-q4f16_1-MLC', label: 'Gemma 3 1B', downloadMb: 574, vramMb: 711, note: 'lightest on GPU memory' },
	{ id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B', downloadMb: 672, vramMb: 879, note: 'solid English' },
	{ id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', label: 'SmolLM2 360M', downloadMb: 198, vramMb: 376, note: 'tiny — weak at chat' }
];

/**
 * `max_history_size` is deliberately NOT overridden. Despite the name it does
 * not trim conversation history — web-llm only uses it to size the RNN state
 * tensor for recurrent/hybrid models. Multi-turn memory is bounded by
 * `context_window_size` (4096) instead, and the engine slides that window
 * itself. Setting it here would over-allocate state for no benefit.
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

export function modelById(id: string): ModelChoice | undefined {
	return MODELS.find((m) => m.id === id);
}

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

/** Which of the listed models already have their weights cached locally. */
export async function cachedModelIds(): Promise<Set<string>> {
	const { hasModelInCache } = await import('@mlc-ai/web-llm');
	const found = new Set<string>();
	await Promise.all(
		MODELS.map(async (m) => {
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

/** Rough on-disk footprint of the cached models, in MB. */
export function cachedSizeMb(ids: Set<string>): number {
	return MODELS.filter((m) => ids.has(m.id)).reduce((a, m) => a + m.downloadMb, 0);
}

export type { ChatCompletionMessageParam, InitProgressReport, MLCEngineInterface };
