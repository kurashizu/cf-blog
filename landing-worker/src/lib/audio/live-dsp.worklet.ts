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
	STRINGS_PARAMS,
	STRINGS_PROCESSOR,
	MODES_PARAMS,
	MODES_PROCESSOR,
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
	private linearAttack: boolean;
	constructor(options?: { processorOptions?: { curved?: boolean; linearAttack?: boolean } }) {
		super(options);
		this.curved = !!options?.processorOptions?.curved;
		/* A strike (EXCITE's burst) rises in a straight line and falls on a
		   curve: an exponential rise from the floor would spend most of a
		   0.4 ms attack inaudible. */
		this.linearAttack = !!options?.processorOptions?.linearAttack;
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
				if (this.curved && !this.linearAttack) this.level *= Math.pow(1 / EXP_FLOOR, dt / attack);
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

/* ── STRING / TUBE / MODES ──────────────────────────────────────────────── */

/* A partial that has fallen this far below its own level is silence. */
const TAIL = 0.00001;
const TWO_PI = Math.PI * 2;

const P_IDLE = 0;
const P_RISE = 1;
const P_HOLD = 2;
const P_FALL = 3;
const P_DONE = 4;

/**
 * A struck or plucked string, or a blown tube, as a bank of decaying partials.
 *
 * The same additive model the engine built from native nodes -- sixteen sines,
 * each with its own level and its own exponential decay, higher ones dying
 * first, stiffness stretching them sharp -- but with every setting read as it
 * goes. Native, each partial's decay was an automation curve written at the
 * note, so DECAY, DAMP and STIFF were read once, and PITCH set sixteen
 * oscillator frequencies once: a vibrato patched into a STRING was dropped.
 *
 * Levels, decay rates and partial frequencies are worked out once per render
 * block (128 samples, under 3 ms) from the parameters as they stand; the
 * per-sample work is a phase step, one multiply per envelope and a sine.
 *
 * Each partial's envelope is kept relative to its own level (0..1), so moving
 * DAMP or STIFF mid-note rescales what is ringing rather than restarting it.
 * STRING rises in 3 ms and decays from there; TUBE rises over a time that
 * shortens up the series, holds while the gate is up, and only then falls.
 */
class StringsProcessor extends StoppableProcessor {
	static get parameterDescriptors() {
		return STRINGS_PARAMS;
	}
	private tube: boolean;
	private oddOnly: boolean;
	private struck = false;
	private phase = new Float64Array(17);
	private env = new Float64Array(17);
	private stage = new Uint8Array(17);
	private freq = new Float64Array(17);
	private level = new Float64Array(17);
	private fallMul = new Float64Array(17);
	private riseStep = new Float64Array(17);
	constructor(options?: { processorOptions?: { tube?: boolean; oddOnly?: boolean } }) {
		super(options);
		this.tube = !!options?.processorOptions?.tube;
		this.oddOnly = !!options?.processorOptions?.oddOnly;
	}
	/** Recompute every partial's frequency, level and step sizes from sample `i`'s params. */
	private plan(p: Params, i: number, dt: number): void {
		const f0 = Math.max(0, at(p.pitch, i));
		const decay = Math.max(0.05, at(p.decay, i));
		const damp = Math.max(0, at(p.damping, i) / 100);
		const stiff = this.tube ? 0 : Math.max(0, at(p.stiffness, i) / 100);
		for (let n = 1; n <= 16; n++) {
			const f = f0 * n * Math.sqrt(1 + stiff * 0.004 * n * n);
			const skip = (this.oddOnly && n % 2 === 0) || f > 18000;
			this.freq[n] = skip ? 0 : f;
			const amp = 1 / Math.pow(n, 1.9 - stiff * 0.7);
			/* A blown tube loses its upper partials to the bore, so TUBE's damping
			   is on the held level, where it is audible for the whole note. */
			this.level[n] = skip ? 0 : this.tube ? amp / Math.pow(n, damp * 1.6) : amp;
			const dn = decay / Math.pow(n, 0.55 + damp * 1.4 + stiff * 0.5);
			const fall = this.tube ? Math.max(0.02, dn) : dn;
			const lvl = Math.max(TAIL * 2, this.level[n]);
			this.fallMul[n] = Math.pow(TAIL / lvl, dt / fall);
			const rise = this.tube ? Math.max(0.01, 0.04 / (1 + (n - 1) * 0.4)) : 0.003;
			this.riseStep[n] = dt / rise;
		}
	}
	process(inputs: Float32Array[][], outputs: Float32Array[][], p: Params): boolean {
		const out = outputs[0]?.[0];
		if (!out) return !this.finished();
		const input = inputs[0]?.[0];
		const dt = 1 / sampleRate;
		this.plan(p, 0, dt);
		for (let i = 0; i < out.length; i++) {
			if (currentTime + i * dt >= this.stopAt) {
				out[i] = 0;
				continue;
			}
			const gate = at(p.gate, i) >= 0.5;
			if (!this.struck && gate) {
				this.struck = true;
				for (let n = 1; n <= 16; n++) {
					this.stage[n] = P_RISE;
					this.env[n] = 0;
					this.phase[n] = 0;
				}
			}
			const mix = Math.max(0, Math.min(1, at(p.mix, i) / 100));
			let wet = 0;
			if (this.struck) {
				for (let n = 1; n <= 16; n++) {
					const f = this.freq[n];
					if (!f) continue;
					let e = this.env[n];
					const st = this.stage[n];
					if (st === P_RISE) {
						e += this.riseStep[n];
						if (e >= 1) {
							e = 1;
							this.stage[n] = this.tube ? P_HOLD : P_FALL;
						}
					} else if (st === P_HOLD) {
						if (!gate) this.stage[n] = P_FALL;
					} else if (st === P_FALL) {
						e *= this.fallMul[n];
						if (e * this.level[n] <= TAIL) {
							e = 0;
							this.stage[n] = P_DONE;
						}
					}
					this.env[n] = e;
					let ph = this.phase[n] + f * dt;
					ph -= Math.floor(ph);
					this.phase[n] = ph;
					if (e > 0) wet += e * this.level[n] * Math.sin(TWO_PI * ph);
				}
			}
			const x = input ? input[i] : 0;
			out[i] = x * (1 - mix) + wet * mix * 0.85;
		}
		return !this.finished();
	}
}

registerProcessor(STRINGS_PROCESSOR, StringsProcessor);

/** A bandpass biquad in direct form I, RBJ's constant-0-dB-peak form (Web Audio's own). */
class Bandpass {
	private b0 = 0;
	private b2 = 0;
	private a1 = 0;
	private a2 = 0;
	private x1 = 0;
	private x2 = 0;
	private y1 = 0;
	private y2 = 0;
	set(f: number, q: number) {
		const w0 = (TWO_PI * f) / sampleRate;
		const alpha = Math.sin(w0) / (2 * q);
		const a0 = 1 + alpha;
		this.b0 = alpha / a0;
		this.b2 = -alpha / a0;
		this.a1 = (-2 * Math.cos(w0)) / a0;
		this.a2 = (1 - alpha) / a0;
	}
	step(x: number): number {
		const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
		this.x2 = this.x1;
		this.x1 = x;
		this.y2 = this.y1;
		this.y1 = y;
		return y;
	}
}

/**
 * A modal bank: three struck modes, and three bandpasses at the same
 * frequencies colouring whatever is fed in.
 *
 * The modes are sines that start loud and decay, because a resonant filter
 * needs sustained input to ring up and a 10 ms strike never gets it there.
 * The bandpasses keep the module useful on a pad. Both follow the root (BASE,
 * or the note, or a PITCH cable), the ratios and Q per render block, where
 * natively all of it was fixed at the note.
 */
class ModesProcessor extends StoppableProcessor {
	static get parameterDescriptors() {
		return MODES_PARAMS;
	}
	private pitchWired: boolean;
	private struck = false;
	private phase = new Float64Array(3);
	private env = new Float64Array(3);
	private stage = new Uint8Array(3);
	private freq = new Float64Array(3);
	private fallMul = new Float64Array(3);
	private riseStep = new Float64Array(3);
	private bands = [new Bandpass(), new Bandpass(), new Bandpass()];
	private bandGain = 0;
	constructor(options?: { processorOptions?: { pitchWired?: boolean } }) {
		super(options);
		this.pitchWired = !!options?.processorOptions?.pitchWired;
	}
	private plan(p: Params, dt: number, mix: number): void {
		const pitch = at(p.pitch, 0);
		const base = at(p.base, 0);
		/* BASE pins the body to an absolute pitch, which an untuned drum
		   wants; the note (or a PITCH cable) is what a tuned bar follows. Only
		   a cable overrides BASE. */
		const root = this.pitchWired ? pitch : base > 0 ? base : pitch;
		const q = Math.max(1, at(p.q, 0));
		const ratios = [at(p.r1, 0), at(p.r2, 0), at(p.r3, 0)];
		for (let k = 0; k < 3; k++) {
			const r = ratios[k];
			const f = Math.min(18000, Math.max(20, root * r));
			this.freq[k] = f;
			// q/12, scaled down as the mode climbs: higher modes of a struck body die first.
			const decay = Math.max(0.02, q / 12 / Math.pow(Math.max(r, 1e-3), 0.6));
			const amp = 1 / (k + 1);
			this.fallMul[k] = Math.pow(TAIL / amp, dt / decay);
			// A low mode needs a slower rise, or its first step is a broadband click.
			this.riseStep[k] = dt / Math.min(0.008, Math.max(0.0004, 1.2 / f));
			this.bands[k].set(f, q);
		}
		this.bandGain = (mix / 3) * Math.min(1.2, Math.sqrt(q) * 0.25);
	}
	process(inputs: Float32Array[][], outputs: Float32Array[][], p: Params): boolean {
		const out = outputs[0]?.[0];
		if (!out) return !this.finished();
		const input = inputs[0]?.[0];
		const dt = 1 / sampleRate;
		const mix0 = Math.max(0, Math.min(1, at(p.mix, 0) / 100));
		this.plan(p, dt, mix0);
		for (let i = 0; i < out.length; i++) {
			if (currentTime + i * dt >= this.stopAt) {
				out[i] = 0;
				continue;
			}
			if (!this.struck && at(p.gate, i) >= 0.5) {
				this.struck = true;
				for (let k = 0; k < 3; k++) {
					this.stage[k] = P_RISE;
					this.env[k] = 0;
					this.phase[k] = 0;
				}
			}
			const mix = Math.max(0, Math.min(1, at(p.mix, i) / 100));
			let struck = 0;
			if (this.struck) {
				for (let k = 0; k < 3; k++) {
					let e = this.env[k];
					if (this.stage[k] === P_RISE) {
						e += this.riseStep[k];
						if (e >= 1) {
							e = 1;
							this.stage[k] = P_FALL;
						}
					} else if (this.stage[k] === P_FALL) {
						e *= this.fallMul[k];
						if (e / (k + 1) <= TAIL) {
							e = 0;
							this.stage[k] = P_DONE;
						}
					}
					this.env[k] = e;
					let ph = this.phase[k] + this.freq[k] * dt;
					ph -= Math.floor(ph);
					this.phase[k] = ph;
					if (e > 0) struck += (e / (k + 1)) * Math.sin(TWO_PI * ph);
				}
			}
			const x = input ? input[i] : 0;
			let coloured = 0;
			for (let k = 0; k < 3; k++) coloured += this.bands[k].step(x);
			/* The dry strike is scaled by (1 - mix) twice, so a turned-up MIX is a
			   beater on a drum rather than two sounds side by side. */
			out[i] = x * (1 - mix) * (1 - mix) + struck * mix + coloured * this.bandGain;
		}
		return !this.finished();
	}
}

registerProcessor(MODES_PROCESSOR, ModesProcessor);
