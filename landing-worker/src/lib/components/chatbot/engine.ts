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
	/** web-llm's `vram_required_MB`, which assumes its own 4096-token window. */
	vramMb: number;
}

/** The window web-llm's `vram_required_MB` figures are quoted at. */
const VRAM_BASE_CTX = 4096;

/**
 * KV cache bytes per token of context, for Qwen3.5-4B at f16.
 *
 * 8 full-attention layers (32 layers, `full_attention_interval: 4`), 4 KV
 * heads, head_dim 256, K and V, 2 bytes each:
 *   2 * 8 * 4 * 256 * 2 = 32768 bytes per token.
 */
const KV_BYTES_PER_TOKEN = 2 * 8 * 4 * 256 * 2;

/**
 * VRAM at a given context window. `vram_required_MB` is quoted at 4096, but the
 * page runs a much wider window by default and the cache scales linearly with
 * it — reporting the unadjusted figure would understate memory by gigabytes.
 */
export function vramAtContext(build: ModelBuild, contextWindow: number): number {
	const delta = ((contextWindow - VRAM_BASE_CTX) * KV_BYTES_PER_TOKEN) / 1048576;
	return Math.max(build.vramMb, Math.round(build.vramMb + delta));
}

/**
 * Qwen3.5-4B. The 0.8B of the same family degenerated badly — reasoning that
 * dissolved into free-associated nouns for 13000 characters — which is what
 * Qwen's card warns about for that size specifically. Four billion parameters
 * buys enough headroom that the failure mode should not appear at all.
 *
 * The cost is real and worth knowing before changing this: 2280 MB to
 * download, and 3868 MB of VRAM at web-llm's 4096-token window, rising to
 * roughly 4.8 GB at the 32768 this page asks for, since the KV cache scales
 * with the window. That rules out most integrated graphics.
 *
 * Two things are still wrong or hostile out of the box, both handled below:
 *
 *  1. Its MLC config declares stop token ids 151643 / 151645, copied from
 *     Qwen3's 151936-token vocabulary. This model's vocabulary is 248320,
 *     where those ids are undefined and the real markers are 248044
 *     (`<|endoftext|>`) and 248046 (`<|im_end|>`) — verified against its own
 *     tokenizer_config.json. Uncorrected, generation never stops cleanly.
 *     CHAT_OPTS fixes this. The 0.8B had the identical defect.
 *  2. web-llm sets `max_history_size: 1` on every Qwen3.5 entry and no other
 *     family. It is a hybrid Gated DeltaNet (32 layers, full attention every
 *     4th), so this sizes the recurrent state and is left alone.
 *
 * Swapping the model means changing both ids below AND re-checking the packaged
 * `mlc-chat-config.json` against the model's own `tokenizer_config.json`. Stop
 * token ids belong to a model's tokenizer and are not portable between
 * generations — that mismatch is bug 1 above.
 *
 * Both builds carry the same int4 weights and download identically (2280 MB);
 * they differ in activation precision, which shows up as runtime VRAM. f16 is
 * preferred because it is faster, but its kernels need `shader-f16` —
 * `pickModel()` falls back where the adapter lacks it.
 */
export const MODEL_F16 = 'Qwen3.5-4B-q4f16_1-MLC';
export const MODEL_F32 = 'Qwen3.5-4B-q4f32_1-MLC';

export const BUILDS: Record<string, ModelBuild> = {
	[MODEL_F16]: { id: MODEL_F16, downloadMb: 2280, vramMb: 3868 },
	[MODEL_F32]: { id: MODEL_F32, downloadMb: 2280, vramMb: 4680 }
};

/** Every build the page may cache — used by the storage panel. */
export const ALL_BUILDS: ModelBuild[] = Object.values(BUILDS);

/**
 * Everything the CONFIG panel can change. Held in one place so the panel, the
 * request, and the engine reload all read the same shape.
 */
export interface ChatConfig {
	contextWindow: number;
	maxTokens: number;
	thinkMaxTokens: number;
	temperature: number;
	topP: number;
	repetitionPenalty: number;
	frequencyPenalty: number;
	presencePenalty: number;
	/** Stop generation when the tail collapses into repetition. */
	loopGuard: boolean;
}

/**
 * The model is trained for 262144 tokens of context and web-llm's record
 * overrides that down to 4096. 32768 is a middle ground that holds a real
 * conversation, at roughly 384 MB of KV cache against 48 MB at 4096 — the
 * weights are only ~426 MB, so the window is the larger cost.
 *
 * Changing `contextWindow` needs the engine reloaded; everything else applies
 * to the next message.
 */
export const DEFAULT_CONFIG: ChatConfig = {
	contextWindow: 32768,
	maxTokens: 2048,
	// Reasoning spends from the same budget as the answer, and this model
	// reasons at length, so thinking turns get materially more room.
	thinkMaxTokens: 4096,
	temperature: 0.6,
	topP: 0.8,
	repetitionPenalty: 1.15,
	frequencyPenalty: 0.5,
	presencePenalty: 0.2,
	loopGuard: true
};

/** Bounds for the CONFIG panel's inputs, and a guard on restored values. */
export const CONFIG_LIMITS = {
	contextWindow: { min: 1024, max: 131072, step: 1024 },
	maxTokens: { min: 64, max: 16384, step: 64 },
	thinkMaxTokens: { min: 256, max: 32768, step: 256 },
	temperature: { min: 0, max: 2, step: 0.05 },
	topP: { min: 0.05, max: 1, step: 0.05 },
	repetitionPenalty: { min: 1, max: 2, step: 0.05 },
	frequencyPenalty: { min: -2, max: 2, step: 0.1 },
	presencePenalty: { min: -2, max: 2, step: 0.1 }
} as const;

const CONFIG_KEY = 'krsz.chatbot.config';

export function loadConfig(): ChatConfig {
	try {
		const raw = localStorage.getItem(CONFIG_KEY);
		if (!raw) return { ...DEFAULT_CONFIG };
		const saved = JSON.parse(raw) as Partial<ChatConfig>;
		const merged = { ...DEFAULT_CONFIG, ...saved };
		// A stored value from an older build could sit outside the current
		// bounds, which the engine would reject on load.
		for (const [k, lim] of Object.entries(CONFIG_LIMITS)) {
			const key = k as keyof typeof CONFIG_LIMITS;
			const v = merged[key];
			if (typeof v !== 'number' || !Number.isFinite(v)) merged[key] = DEFAULT_CONFIG[key];
			else merged[key] = Math.min(lim.max, Math.max(lim.min, v));
		}
		return merged;
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export function saveConfig(c: ChatConfig): void {
	try {
		localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
	} catch {
		/* private window, or storage disabled — the session still works */
	}
}

/** The sampling fields, in the shape a chat completion request wants. */
export function samplingOf(c: ChatConfig) {
	return {
		temperature: c.temperature,
		top_p: c.topP,
		repetition_penalty: c.repetitionPenalty,
		frequency_penalty: c.frequencyPenalty,
		presence_penalty: c.presencePenalty
	};
}

/**
 * Corrects the packaged config's stop tokens. See bug 1 above: it declares
 * Qwen3's 151643 / 151645 against this model's 248320-token vocabulary, where
 * they are undefined. The real ids come from its own `tokenizer_config.json`:
 *
 *   248044 '<|endoftext|>'   248046 '<|im_end|>'   (248045 is '<|im_start|>')
 *
 * The role markup itself is right, so only the ids and stop strings change.
 * web-llm merges chatOpts over the model record's overrides last, so this wins.
 *
 * `max_history_size` is deliberately left alone. Despite the name it does not
 * trim conversation history — web-llm only uses it to size the RNN state tensor
 * that this hybrid architecture needs. Raising it would over-allocate; the real
 * bound on a conversation is `context_window_size`.
 */
const STOP_ENDOFTEXT = 248044;
const STOP_IM_END = 248046;

type ConvTemplate = NonNullable<ChatOptions['conv_template']>;

/**
 * web-llm keys these by its `Role` enum, whose values are exactly these
 * strings. The enum is not re-exported from the package root, and importing it
 * statically would pull the whole engine into the page's first chunk.
 */
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

/**
 * Sampling defaults are tuned for stability rather than flair, because this
 * model's documented failure is looping rather than dullness. See
 * DEFAULT_CONFIG; the CONFIG panel can change any of them.
 *
 * web-llm passes presence, frequency and repetition penalties into one kernel
 * together (they compose; they are not alternatives), and applies them over
 * every token seen so far — so all three can pull in the same direction.
 *
 * - temperature below Qwen's suggested 0.7, and top_p tightened to 0.8: a
 *   narrower, flatter distribution is far less likely to wander into a loop.
 * - repetition_penalty 1.15 acts on any repeated token regardless of count.
 *   Past ~1.2 small models start dodging necessary words and turn stilted.
 * - frequency_penalty scales with how often a token has appeared, which is what
 *   actually breaks a loop already in progress.
 * - presence_penalty stays low on purpose. Qwen suggests 1.5-2.0 against
 *   repetition but warns in the same note that high values cause language
 *   mixing — on a page answering in Chinese that is the worse failure, and it
 *   is a flat penalty on every seen token, which in Chinese hits common
 *   characters hardest.
 *
 * Loads the engine in a Web Worker so token generation never blocks the main
 * thread. The worker module is created here rather than at module scope so a
 * cancelled load leaves nothing behind.
 */
export async function createEngine(
	modelId: string,
	config: ChatConfig,
	onProgress: (r: InitProgressReport) => void
): Promise<{ engine: MLCEngineInterface; worker: Worker }> {
	const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
	const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
	try {
		// Corrects the packaged config's stop tokens (see CHAT_OPTS) and widens
		// the window past web-llm's 4096 override. web-llm keeps a reference to
		// this object, so hand it a copy rather than the module's own.
		const chatOpts: ChatOptions = {
			...structuredClone(CHAT_OPTS),
			context_window_size: config.contextWindow
		};
		const engine = await CreateWebWorkerMLCEngine(
			worker,
			modelId,
			{ initProgressCallback: onProgress },
			chatOpts
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
