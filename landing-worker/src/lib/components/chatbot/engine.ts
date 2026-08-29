import type {
	ChatCompletionMessageParam,
	ChatOptions,
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
 * Swapping the model means changing the two ids below AND the stop token ids in
 * CHAT_OPTS — they are the model's tokenizer ids, not portable constants, and a
 * mismatched pair is what makes generation run on past its stop token. Check
 * `added_tokens_decoder` in the model's tokenizer_config.json before changing
 * either.
 *
 * Both builds carry the same int4 weights and download identically (426 MB);
 * they differ only in activation precision, which shows up as runtime VRAM.
 * f16 is preferred because it is faster, but its kernels need the
 * `shader-f16` WebGPU feature — `pickModel()` falls back where it is missing.
 */
export const MODEL_F16 = 'Qwen3.5-0.8B-q4f16_1-MLC';
export const MODEL_F32 = 'Qwen3.5-0.8B-q4f32_1-MLC';

export const BUILDS: Record<string, ModelBuild> = {
	[MODEL_F16]: { id: MODEL_F16, downloadMb: 426, vramMb: 1629 },
	[MODEL_F32]: { id: MODEL_F32, downloadMb: 426, vramMb: 1894 }
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
 * The published `mlc-chat-config.json` describes this model with Qwen2's
 * conversation template, and Qwen2's stop token ids (151643 / 151645) with it.
 * This model's vocabulary is 248320 tokens, where `<|endoftext|>` is 248044 and
 * `<|im_end|>` is 248046 — the declared ids point at unrelated tokens, so
 * generation never stops cleanly. That is what makes it repeat a greeting and
 * ignore the language it was addressed in.
 *
 * The role markup itself (`<|im_start|>` … `<|im_end|>`) is right, so only the
 * ids and stop strings need correcting. chatOpts is merged over the record's
 * overrides last, so this wins.
 */
const STOP_ENDOFTEXT = 248044;
const STOP_IM_END = 248046;

type ConvTemplate = NonNullable<ChatOptions['conv_template']>;

const ROLES = {
	user: '<|im_start|>user',
	assistant: '<|im_start|>assistant',
	tool: '<|im_start|>tool'
} as unknown as ConvTemplate['roles'];

export const CHAT_OPTS: ChatOptions = {
	conv_template: {
		system_template: '<|im_start|>system\n{system_message}<|im_end|>\n',
		system_message: 'You are a helpful assistant.',
		add_role_after_system_message: true,
		// web-llm keys these by its Role enum, whose values are exactly these
		// strings. The enum is not re-exported from the package root, and a static
		// import would pull the whole engine into the page's first chunk.
		roles: ROLES,
		role_templates: {
			user: '{user_message}',
			assistant: '{assistant_message}',
			tool: '{tool_message}'
		},
		seps: ['<|im_end|>\n'],
		role_content_sep: '\n',
		role_empty_sep: '\n',
		stop_str: ['<|endoftext|>', '<|im_end|>'],
		stop_token_ids: [STOP_ENDOFTEXT, STOP_IM_END]
	}
};

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
	temperature: 0.7,
	top_p: 0.9,
	repetition_penalty: 1.1,
	frequency_penalty: 0.3,
	presence_penalty: 0.1
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
		const engine = await CreateWebWorkerMLCEngine(
			worker,
			modelId,
			{ initProgressCallback: onProgress },
			// Corrects the packaged config's Qwen2 stop tokens — see CHAT_OPTS.
			structuredClone(CHAT_OPTS)
		);
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
