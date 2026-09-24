/**
 * Loading and building the live-DSP worklet, from the engine's side.
 *
 * `addModule` is per context and asynchronous, so every context that builds
 * voices has to have been through `ensureLiveDsp` first: the live one when the
 * synth page mounts, and each offline one (a WAV render, the audit bench)
 * before it builds anything. A context that has not is reported rather than
 * guessed at -- `createLiveDsp` returns null and the caller decides.
 */
import workletUrl from './live-dsp.worklet.ts?worker&url';

/**
 * A context that can hand out worklet nodes without a real audio thread.
 *
 * The unit tests' recording context implements this, so the engine can be
 * built against it and asked what it connected -- the same seam every other
 * `create*` call already goes through.
 */
interface WorkletFactory {
	createAudioWorkletNode(name: string, options: AudioWorkletNodeOptions): AudioWorkletNode;
}

const loading = new WeakMap<BaseAudioContext, Promise<void>>();
const ready = new WeakSet<BaseAudioContext>();

/** Load the processors into `ctx`. Safe to call repeatedly; resolves once. */
export function ensureLiveDsp(ctx: BaseAudioContext): Promise<void> {
	if (ready.has(ctx) || !ctx.audioWorklet) return Promise.resolve();
	let pending = loading.get(ctx);
	if (!pending) {
		pending = ctx.audioWorklet.addModule(workletUrl).then(() => {
			ready.add(ctx);
		});
		loading.set(ctx, pending);
	}
	return pending;
}

/**
 * A worklet node plus the handle the engine stops it with.
 *
 * Voices keep their sources in a list and call `start(t)` / `stop(t)` on each;
 * a worklet node has neither, so `source` is the adapter that goes in that
 * list. `start` is a no-op -- the processor is running from construction and
 * the engine gates it with its own parameters -- and `stop` tells the
 * processor to fall silent at `when` and let itself be collected.
 */
export interface LiveDsp {
	node: AudioWorkletNode;
	param(name: string): AudioParam;
	source: AudioScheduledSourceNode;
}

let warned = false;

/**
 * `tailSeconds` is how long the processor may keep sounding after the voice
 * says stop. A native effect -- a convolver, a delay line -- has no `stop`,
 * so a room kept ringing after the note that fed it was reaped; a processor
 * that obeyed `stop` literally would cut its own reverb off at the voice's
 * end. Such a processor is stopped `tailSeconds` later instead.
 */
export function createLiveDsp(
	ctx: BaseAudioContext,
	name: string,
	options: AudioWorkletNodeOptions = {},
	tailSeconds = 0
): LiveDsp | null {
	const factory = ctx as unknown as Partial<WorkletFactory>;
	let node: AudioWorkletNode;
	try {
		if (typeof factory.createAudioWorkletNode === 'function') {
			node = factory.createAudioWorkletNode(name, options);
		} else {
			if (!ready.has(ctx)) throw new Error('live DSP not loaded into this context');
			node = new AudioWorkletNode(ctx, name, options);
		}
	} catch (e) {
		if (!warned) {
			warned = true;
			console.warn('[synth] live DSP unavailable:', e);
		}
		return null;
	}
	const param = (p: string): AudioParam => {
		const found = node.parameters.get(p);
		if (!found) throw new Error(`${name} has no parameter ${p}`);
		return found;
	};
	let stopped = Infinity;
	const source = {
		start() {},
		stop(when?: number) {
			const at = (when ?? ctx.currentTime) + tailSeconds;
			if (at >= stopped) return;
			stopped = at;
			node.port.postMessage({ stop: at });
		},
		connect: node.connect.bind(node),
		disconnect: node.disconnect.bind(node)
	} as unknown as AudioScheduledSourceNode;
	return { node, param, source };
}
