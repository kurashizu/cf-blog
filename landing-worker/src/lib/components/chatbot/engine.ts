import { BUCKET_URL } from '$shared/site-config';

/**
 * The chatbot's model, and everything configurable about how it generates.
 *
 * This runs on transformers.js rather than MLC web-llm. web-llm is the faster
 * runtime — it compiles a model to purpose-built WebGPU kernels — but it can
 * only load models MLC has compiled, and MLC has no gemma4 and no audio-capable
 * family at all (its registry carries gemma/gemma2/gemma3 and nothing that
 * takes sound). transformers.js runs ONNX graphs, which is how the vision and
 * audio encoders become available at all.
 */

/**
 * The weights and the ONNX runtime are both served from this site's own bucket
 * rather than HuggingFace and jsdelivr. Nothing this page needs comes from a
 * third party at runtime.
 */
export const MODEL_ID = 'gemma-4-E2B-it-ONNX';

/** Where the mirrored model and runtime live. */
export const MODEL_HOST = `${BUCKET_URL}/llm/`;
export const ORT_WASM_PATH = `${BUCKET_URL}/ort/`;

/**
 * Which precision to load each part of the model at. Sizes are the actual
 * bytes fetched, summed from the repo's file listing:
 *
 *   decoder_model_merged_q4f16   1449 MB    the language model
 *   embed_tokens_q4f16           1517 MB    the token embedding table
 *   vision_encoder_q4f16           95 MB    images
 *   audio_encoder_q4f16           163 MB    sound
 *                                ────────
 *                                 3225 MB
 *
 * q4f16 throughout: int4 weights with f16 activations, the smallest
 * combination the export offers. q4 alone more than doubles this.
 */
export const DTYPE = {
	embed_tokens: 'q4f16',
	decoder_model_merged: 'q4f16',
	vision_encoder: 'q4f16',
	audio_encoder: 'q4f16'
} as const;

/**
 * The CPU backend needs a different embedding table.
 *
 * Every quantised `embed_tokens` export — q4f16, q4 and quantized alike —
 * builds its lookup out of `com.microsoft.GatherBlockQuantized`, and the wasm
 * CPU provider has no kernel for the type combination they use, so the session
 * cannot even be created:
 *
 *   Failed to find kernel for com.microsoft.GatherBlockQuantized(1)
 *   (node:'node_embedding_Quant' ep:'CPUExecutionProvider')
 *
 * Only the fp16 export avoids that op, and it is 5248 MB against 1517 — so the
 * CPU path costs 3.7 GB more to download as well as running far slower. The
 * other three parts are unaffected and stay at q4f16.
 */
export const DTYPE_CPU = {
	...DTYPE,
	embed_tokens: 'fp16'
} as const;

export function dtypeFor(backend: Backend) {
	return backend === 'wasm' ? DTYPE_CPU : DTYPE;
}

/** Download size in MB, by part, for what the storage panel reports. */
export const PART_SIZES_MB = {
	decoder: 1449,
	embed: 1517,
	vision: 95,
	audio: 163
} as const;

/** The fp16 embedding table the CPU backend has to use instead. */
export const EMBED_FP16_MB = 5248;

export const TOTAL_DOWNLOAD_MB =
	PART_SIZES_MB.decoder + PART_SIZES_MB.embed + PART_SIZES_MB.vision + PART_SIZES_MB.audio;

/** What the CPU backend downloads, with the larger embedding table. */
export const TOTAL_DOWNLOAD_CPU_MB = TOTAL_DOWNLOAD_MB - PART_SIZES_MB.embed + EMBED_FP16_MB;

/**
 * Where inference runs. WebGPU is dramatically faster; wasm is the fallback for
 * browsers that do not expose WebGPU at all — Firefox on Linux still hides it
 * behind `dom.webgpu.enabled`, and any plain-http origin that is not localhost
 * fails the secure-context requirement regardless of browser.
 *
 * On wasm a 4B model runs at conversational speed only in the loosest sense;
 * expect single-digit tokens per second on a good desktop CPU, and slower on
 * anything portable. It is there so the page works, not so it works well.
 */
export type Backend = 'webgpu' | 'wasm';

export interface ChatConfig {
	backend: Backend | 'auto';
	maxTokens: number;
	temperature: number;
	topP: number;
	topK: number;
	repetitionPenalty: number;
	/** Sample rather than take the most likely token every time. */
	doSample: boolean;
	/** Stop generation when the tail collapses into repetition. */
	loopGuard: boolean;
}

export const DEFAULT_CONFIG: ChatConfig = {
	backend: 'auto',
	maxTokens: 2048,
	temperature: 0.7,
	topP: 0.9,
	topK: 50,
	repetitionPenalty: 1.1,
	doSample: true,
	loopGuard: true
};

export const CONFIG_LIMITS = {
	maxTokens: { min: 64, max: 8192, step: 64 },
	temperature: { min: 0, max: 2, step: 0.05 },
	topP: { min: 0.05, max: 1, step: 0.05 },
	topK: { min: 1, max: 200, step: 1 },
	repetitionPenalty: { min: 1, max: 2, step: 0.05 }
} as const;

const CONFIG_KEY = 'krsz.chatbot.config.v2';

export function loadConfig(): ChatConfig {
	try {
		const raw = localStorage.getItem(CONFIG_KEY);
		if (!raw) return { ...DEFAULT_CONFIG };
		const merged = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<ChatConfig>) };
		// A value stored by an older build could sit outside the current bounds.
		for (const [k, lim] of Object.entries(CONFIG_LIMITS)) {
			const key = k as keyof typeof CONFIG_LIMITS;
			const v = merged[key];
			merged[key] =
				typeof v === 'number' && Number.isFinite(v)
					? Math.min(lim.max, Math.max(lim.min, v))
					: DEFAULT_CONFIG[key];
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

export interface GpuSupport {
	ok: boolean;
	f16: boolean;
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
		// `isSecureContext` separates "this browser cannot" from "this URL is not
		// allowed to" — the second is the common one on a LAN address, and the fix
		// is completely different.
		const insecure = typeof isSecureContext !== 'undefined' && !isSecureContext;
		return {
			ok: false,
			f16: false,
			reason: insecure
				? 'WebGPU needs a secure context, and this page is plain http on a non-localhost address. Use https, or run on the CPU instead.'
				: 'This browser does not expose WebGPU. Chrome/Edge 113+, Safari 18+, or Firefox with dom.webgpu.enabled. You can run on the CPU instead.'
		};
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

/** What a message carries besides text. Images and audio are data URLs. */
export interface Attachment {
	kind: 'image' | 'audio';
	/** Object URL for display; revoked when the turn is dropped. */
	url: string;
	name: string;
}

/** One entry in the chat, in the shape the processor's template expects. */
export interface ChatTurn {
	role: 'user' | 'assistant';
	content: string;
	attachments?: Attachment[];
}

/** Progress while the weights download, aggregated across every file. */
export interface LoadProgress {
	file: string;
	loadedMb: number;
	totalMb: number;
	pct: number;
}
