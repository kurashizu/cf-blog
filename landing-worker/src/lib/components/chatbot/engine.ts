
/**
 * The chatbot's model, and everything configurable about how it generates.
 *
 * This runs llama.cpp compiled to WebAssembly, through wllama, rather than
 * transformers.js on ONNX. The ONNX path worked but left two things on the
 * table that matter here: it disposed the attention cache after every reply,
 * so each turn re-read the whole conversation before writing a word (measured
 * at ~2.8 ms per token, 1.5 s of silence on a 400-token history), and it had no
 * tool calling. llama.cpp keeps the cache between turns and parses tool calls
 * out of the model's own grammar, and it loads in a quarter of the time.
 */

/**
 * Where the mirrored model and the wasm runtime live.
 *
 * This origin, not the bucket's. The whole site is cross-origin isolated so the
 * VM tab can share memory with its CPU thread, and an isolated document refuses
 * any cross-origin subresource that has not said it consents to being embedded.
 * An R2 custom domain sends no cross-origin-resource-policy and offers nowhere
 * to add one, so the files come through a route on this origin instead, where
 * the question does not arise. See src/routes/model/[file]/+server.ts.
 */
export const MODEL_HOST = '/model/';
export const WASM_PATH = '/model/wllama.wasm';

/**
 * Qwen3.5-2B at Q4_K_M, with the vision projector alongside it.
 *
 * Q4_K_M is the balance the quantization ladder is built around — smaller than
 * Q5 with no visible quality cost on a model this size — and at 1222 MB it also
 * stays under the 2 GB ceiling a single ArrayBuffer can hold, so the weights
 * need no splitting. The projector is a separate file the runtime loads beside
 * the model; without it the model is text-only.
 *
 * This model has no audio tower. The chat takes text and images.
 */
export const MODEL_FILE = 'Qwen3.5-2B-Q4_K_M.gguf';
export const MMPROJ_FILE = 'mmproj-F16.gguf';

/** Download size in MB, by part, for what the storage panel reports. */
export const PART_SIZES_MB = {
	model: 1222,
	vision: 637
} as const;

export const TOTAL_DOWNLOAD_MB = PART_SIZES_MB.model + PART_SIZES_MB.vision;

export interface ChatConfig {
	/** How many tokens of history to keep before /compact is suggested. */
	contextWindow: number;
	maxTokens: number;
	temperature: number;
	topP: number;
	topK: number;
	repetitionPenalty: number;
	/** Sample rather than take the most likely token every time. */
	doSample: boolean;
	/**
	 * deviceId of the microphone to record from. Empty means the system default;
	 * the id is stable per browser profile, and a missing device falls back to
	 * the default rather than failing to record.
	 */
	micId: string;
	/** Stop generation when the tail collapses into repetition. */
	loopGuard: boolean;
}

export const DEFAULT_CONFIG: ChatConfig = {
	// The architecture allows 131072, but every token costs KV-cache memory on
	// the visitor's GPU, so the default is the working budget rather than the
	// ceiling. Raising it in CONFIG takes effect on the next turn.
	contextWindow: 32768,
	maxTokens: 2048,
	temperature: 0.7,
	topP: 0.9,
	topK: 50,
	repetitionPenalty: 1.1,
	doSample: true,
	loopGuard: true,
	micId: ''
};

export const CONFIG_LIMITS = {
	contextWindow: { min: 2048, max: 131072, step: 1024 },
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
	/** One-line summary of why WebGPU is unavailable. */
	reason?: string;
	/** Concrete things the visitor can do about it, in order. */
	fixes?: string[];
	adapterLabel?: string;
}

/**
 * WebGPU is a two-step check: the entry point can exist while no adapter is
 * actually available (blocklisted driver, software fallback disabled), and that
 * second case is the one that shows up on real machines.
 *
 * The three failures need completely different fixes, so each carries its own
 * instructions rather than one generic "unsupported" line.
 */
export async function probeGpu(): Promise<GpuSupport> {
	const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
	if (!gpu) {
		// A page served over plain http from anything but localhost fails the
		// secure-context requirement, and no browser setting works around that —
		// so it has to be told apart from a browser that simply lacks WebGPU.
		const insecure = typeof isSecureContext !== 'undefined' && !isSecureContext;
		if (insecure) {
			return {
				ok: false,
				f16: false,
				reason: 'WebGPU needs a secure context, and this page is plain http on something other than localhost.',
				fixes: [
					'Open the page over https, or from http://localhost — both count as secure.',
					'Chrome can be told to trust this one origin: launch it with --unsafely-treat-insecure-origin-as-secure=<this page’s origin>',
					'Firefox has no equivalent switch, so https is the only route there.'
				]
			};
		}
		return {
			ok: false,
			f16: false,
			reason: 'This browser does not expose WebGPU.',
			fixes: [
				'Chrome or Edge 113+, or Safari 18+, support it without any setting.',
				'Firefox: open about:config and set dom.webgpu.enabled to true, then restart the browser.',
				'Firefox on Linux also needs dom.webgpu.workers.enabled — the model runs in a worker — and a working Vulkan driver (mesa-vulkan-drivers).'
			]
		};
	}
	let adapter: GPUAdapter | null = null;
	try {
		adapter = await gpu.requestAdapter();
	} catch (err) {
		return {
			ok: false,
			f16: false,
			reason: `WebGPU adapter request failed: ${(err as Error).message}`,
			fixes: ['Update your graphics driver, then restart the browser.']
		};
	}
	if (!adapter) {
		return {
			ok: false,
			f16: false,
			reason: 'WebGPU is present but no GPU adapter was granted — usually a blocklisted or missing driver.',
			fixes: [
				'Update your graphics driver and restart the browser.',
				'On Linux, check that Vulkan works: run `vulkaninfo --summary`, and install mesa-vulkan-drivers if it fails.',
				'Chrome: chrome://gpu lists what was blocklisted and why.'
			]
		};
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

