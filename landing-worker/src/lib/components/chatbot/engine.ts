import type { ChatCompletionMessageParam, InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm';

export interface ModelChoice {
	id: string;
	label: string;
	/** vram_required_MB straight out of web-llm's prebuiltAppConfig. */
	vramMb: number;
	note: string;
}

/**
 * The f16 build is the default: same int4 weights as the f32 one, 265 MB
 * smaller and faster, but its kernels need the `shader-f16` WebGPU feature.
 * `pickModel()` falls back to the f32 build where the adapter lacks it.
 */
export const MODEL_F16 = 'Qwen3.5-0.8B-q4f16_1-MLC';
export const MODEL_F32 = 'Qwen3.5-0.8B-q4f32_1-MLC';

export const MODELS: ModelChoice[] = [
	{ id: MODEL_F16, label: 'Qwen3.5 0.8B · q4f16', vramMb: 1629, note: 'default — needs shader-f16' },
	{ id: MODEL_F32, label: 'Qwen3.5 0.8B · q4f32', vramMb: 1894, note: 'fallback — no f16 required' },
	{ id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B', vramMb: 879, note: 'smallest good English model' },
	{ id: 'gemma3-1b-it-q4f16_1-MLC', label: 'Gemma 3 1B', vramMb: 711, note: 'fastest to download' },
	{ id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', label: 'SmolLM2 360M', vramMb: 376, note: 'tiny — weak at chat' }
];

/**
 * web-llm's own config sets `max_history_size: 1` on the Qwen3.5 records, which
 * drops everything but the newest turn — the model forgets your first message by
 * the third. The context window is 4096, so let history fill it instead and rely
 * on web-llm sliding the window when it actually runs out.
 */
export const CHAT_OPTS = { max_history_size: 8 } as const;

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
		}, CHAT_OPTS);
		return { engine, worker };
	} catch (err) {
		worker.terminate();
		throw err;
	}
}

export type { ChatCompletionMessageParam, InitProgressReport, MLCEngineInterface };
