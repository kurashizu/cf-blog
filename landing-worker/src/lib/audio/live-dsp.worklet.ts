/**
 * The synth's AudioWorklet processors: the modules whose settings a native
 * Web Audio node can only take once, when the note starts.
 *
 * An envelope built from `linearRampToValueAtTime` has its attack time baked
 * into the schedule the moment it is written, so a cable into ATTACK could
 * only ever be read as a number at note-on -- and a moving signal there was
 * read as nothing at all. Here every parameter is an a-rate AudioParam the
 * processor reads per sample, so a cable moves it while the note plays.
 *
 * Runs on the audio thread, bundled on its own by Vite (`?worker&url`), so it
 * imports nothing but the shared parameter list.
 */
import {
	ENV_PARAMS,
	ENV_PROCESSOR,
	MAP_PARAMS,
	MAP_PROCESSOR,
	SHAPE_PARAMS,
	SHAPE_PROCESSOR,
	type MapOptions
} from './live-dsp-params';

/* The AudioWorkletGlobalScope, which TypeScript's DOM lib does not describe. */
declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
	readonly port: MessagePort;
	constructor(options?: unknown);
}
declare function registerProcessor(name: string, ctor: unknown): void;

type Params = Record<string, Float32Array>;

/** A parameter's value at sample `i`: one value for the block, or one per sample. */
const at = (values: Float32Array, i: number) => (values.length > 1 ? values[i] : values[0]);

/**
 * Stops cleanly when the engine says the voice is over.
 *
 * A native source is stopped with `.stop(when)`; a processor has no such
 * thing, and one that keeps returning `true` keeps running -- and costing CPU
 * -- after the voice it belonged to has been disconnected and forgotten. The
 * engine posts `{ stop: when }` instead, and the processor falls silent at
 * that sample and returns `false` so the browser can collect it.
 */
class StoppableProcessor extends AudioWorkletProcessor {
	protected stopAt = Infinity;
	constructor(options?: unknown) {
		super(options);
		this.port.onmessage = (e: MessageEvent) => {
			const stop = (e.data as { stop?: number } | null)?.stop;
			if (typeof stop === 'number') this.stopAt = Math.min(this.stopAt, stop);
		};
	}
	protected finished(): boolean {
		return currentTime >= this.stopAt;
	}
}

/* ── ENV ────────────────────────────────────────────────────────────────── */

const FLOOR = 0.0001;
const EXP_FLOOR = 0.0001;

const IDLE = 0;
const ATTACK = 1;
const DECAY = 2;
const SUSTAIN = 3;
const RELEASE = 4;
const DONE = 5;

/**
 * Attack, decay, sustain, release -- the same shape the scheduled envelope drew,
 * stepped per sample so every stage reads its time as it goes.
 *
 * The gate rising starts the attack. The release starts when the gate is down
 * *and* the decay has finished, which is what `t + max(a + d, held)` meant in
 * the scheduled version: a note shorter than its own attack and decay still
 * gets both.
 *
 * Linear stages move by a fixed fraction of their span per sample; curved ones
 * multiply by a fixed ratio per sample, which is what an exponential ramp is.
 * Either way the step is recomputed from the current parameter every sample,
 * so turning or patching ATTACK mid-attack changes how fast it climbs from
 * wherever it has got to.
 */
class EnvProcessor extends StoppableProcessor {
	static get parameterDescriptors() {
		return ENV_PARAMS;
	}
	private stage = IDLE;
	private level = 0;
	private releaseFrom = 0;
	private curved: boolean;
	constructor(options?: { processorOptions?: { curved?: boolean } }) {
		super(options);
		this.curved = !!options?.processorOptions?.curved;
	}
	process(_inputs: Float32Array[][], outputs: Float32Array[][], p: Params): boolean {
		const out = outputs[0]?.[0];
		if (!out) return !this.finished();
		const dt = 1 / sampleRate;
		for (let i = 0; i < out.length; i++) {
			if (currentTime + i * dt >= this.stopAt) {
				out[i] = 0;
				continue;
			}
			const gate = at(p.gate, i) >= 0.5;
			const attack = Math.max(FLOOR, at(p.attack, i));
			const decay = Math.max(FLOOR, at(p.decay, i));
			const sustain = Math.max(EXP_FLOOR, Math.min(1, at(p.sustain, i)));
			const release = Math.max(FLOOR, at(p.release, i));

			if (this.stage === IDLE && gate) {
				this.stage = ATTACK;
				this.level = this.curved ? EXP_FLOOR : 0;
			}
			if (this.stage === ATTACK) {
				if (this.curved) this.level *= Math.pow(1 / EXP_FLOOR, dt / attack);
				else this.level += dt / attack;
				if (this.level >= 1) {
					this.level = 1;
					this.stage = DECAY;
				}
			} else if (this.stage === DECAY) {
				if (this.curved) this.level *= Math.pow(sustain, dt / decay);
				else this.level -= ((1 - sustain) * dt) / decay;
				if (this.level <= sustain) {
					this.level = sustain;
					this.stage = SUSTAIN;
				}
			} else if (this.stage === SUSTAIN) {
				this.level = sustain;
			}
			if (this.stage === SUSTAIN && !gate) {
				this.stage = RELEASE;
				this.releaseFrom = Math.max(EXP_FLOOR, this.level);
			}
			if (this.stage === RELEASE) {
				if (this.curved) this.level *= Math.pow(EXP_FLOOR / this.releaseFrom, dt / release);
				else this.level -= ((this.releaseFrom - EXP_FLOOR) * dt) / release;
				if (this.level <= EXP_FLOOR) {
					this.level = 0;
					this.stage = DONE;
				}
			}
			out[i] = this.stage === DONE ? 0 : this.level;
		}
		return !this.finished();
	}
}

registerProcessor(ENV_PROCESSOR, EnvProcessor);

/* ── MAP ────────────────────────────────────────────────────────────────── */

/**
 * A transfer curve whose ranges move.
 *
 * It was a WaveShaperNode between a gain and an offset, all three set from
 * the X and Y ranges when the note was built -- so a cable into X.LO or Y.HI
 * could only be read once, and a moving one read as 0. Here the ranges are
 * a-rate parameters and the input is normalised against them per sample.
 *
 * The shaper also oversampled 2x, because a table applied to audio makes
 * harmonics above Nyquist. This evaluates the curve at the midpoint between
 * each sample and the last as well and averages the two -- the cheap half of
 * the same idea, and enough to take the edge off a GATE or a staircase
 * driven by a waveform.
 */
class MapProcessor extends StoppableProcessor {
	static get parameterDescriptors() {
		return MAP_PARAMS;
	}
	private table: Float32Array;
	private mode: MapOptions['mode'];
	private prev = 0;
	constructor(options?: { processorOptions?: Partial<MapOptions> }) {
		super(options);
		const o = options?.processorOptions ?? {};
		this.table = o.table && o.table.length > 1 ? o.table : new Float32Array([0, 1]);
		this.mode = o.mode ?? 'clamp';
	}
	private curve(a: number, lo: number, hi: number): number {
		const span = hi - lo;
		if (this.mode === 'gate') return span === 0 || a < (lo + hi) / 2 ? 0 : 1;
		const raw = span === 0 ? 0 : (a - lo) / span;
		const x = this.mode === 'wrap' ? raw - Math.floor(raw) : Math.max(0, Math.min(1, raw));
		const t = this.table;
		const f = x * (t.length - 1);
		const k = Math.min(t.length - 2, Math.floor(f));
		return t[k] + (t[k + 1] - t[k]) * (f - k);
	}
	process(inputs: Float32Array[][], outputs: Float32Array[][], p: Params): boolean {
		const out = outputs[0]?.[0];
		if (!out) return !this.finished();
		const input = inputs[0]?.[0];
		const dt = 1 / sampleRate;
		for (let i = 0; i < out.length; i++) {
			if (currentTime + i * dt >= this.stopAt) {
				out[i] = 0;
				continue;
			}
			const a = input ? input[i] : 0;
			const lo = at(p.inLo, i);
			const hi = at(p.inHi, i);
			const s = 0.5 * (this.curve(a, lo, hi) + this.curve((a + this.prev) / 2, lo, hi));
			this.prev = a;
			const outLo = at(p.outLo, i);
			out[i] = outLo + s * (at(p.outHi, i) - outLo);
		}
		return !this.finished();
	}
}

registerProcessor(MAP_PROCESSOR, MapProcessor);

/* ── SHAPE ──────────────────────────────────────────────────────────────── */

/**
 * Distortion, saturation, wavefolding: one curve applied per sample, bent
 * harder the more DRIVE there is.
 *
 * Each of the three curves depends on DRIVE in a way no gain in front of a
 * fixed table can express -- SOFT renormalises by tanh(k), HARD divides by
 * its own ceiling -- so it was a WaveShaperNode whose table was computed from
 * DRIVE when the note was built, and a cable into DRIVE was read once. Here
 * the curve is computed directly, per sample, from DRIVE as it is.
 *
 * The input is held to -1..1 first, as the table's domain held it. The
 * midpoint average is MAP's, standing in for the shaper's 2x oversampling.
 */
class ShapeProcessor extends StoppableProcessor {
	static get parameterDescriptors() {
		return SHAPE_PARAMS;
	}
	private kind: number;
	private prev = 0;
	constructor(options?: { processorOptions?: { kind?: number } }) {
		super(options);
		this.kind = options?.processorOptions?.kind ?? 0;
	}
	private curve(x: number, d: number): number {
		const v = Math.max(-1, Math.min(1, x));
		if (this.kind === 1) {
			// HARD: flat above the threshold, the knee a limiter has.
			const lim = 1 - d * 0.9;
			return Math.max(-lim, Math.min(lim, v)) / (lim || 1);
		}
		if (this.kind === 2) {
			// FOLD: past the limit it turns back rather than flattening.
			const g = v * (1 + d * 4);
			return Math.asin(Math.sin(g * Math.PI * 0.5)) / (Math.PI * 0.5);
		}
		// SOFT: tanh, normalised so the ends stay at the ends whatever the drive.
		const k = 1 + d * 40;
		return Math.tanh(v * k) / Math.tanh(k);
	}
	process(inputs: Float32Array[][], outputs: Float32Array[][], p: Params): boolean {
		const out = outputs[0]?.[0];
		if (!out) return !this.finished();
		const input = inputs[0]?.[0];
		const dt = 1 / sampleRate;
		for (let i = 0; i < out.length; i++) {
			if (currentTime + i * dt >= this.stopAt) {
				out[i] = 0;
				continue;
			}
			const x = input ? input[i] : 0;
			const d = Math.max(0, at(p.drive, i) / 100);
			out[i] = 0.5 * (this.curve(x, d) + this.curve((x + this.prev) / 2, d));
			this.prev = x;
		}
		return !this.finished();
	}
}

registerProcessor(SHAPE_PROCESSOR, ShapeProcessor);
