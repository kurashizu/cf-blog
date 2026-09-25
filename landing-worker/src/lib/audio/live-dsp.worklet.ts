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
	SPACE_PARAMS,
	SPACE_PROCESSOR,
	WIRE_PARAMS,
	WIRE_PROCESSOR,
	LOOP_PARAMS,
	LOOP_PROCESSOR,
	type LoopProgram,
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

/** SHAPE's three curves, shared with a compiled loop so a SHAPE sounds the same in one. */
function shapeCurve(kind: number, x: number, d: number): number {
	const v = Math.max(-1, Math.min(1, x));
	if (kind === 1) {
		// HARD: flat above the threshold, the knee a limiter has.
		const lim = 1 - d * 0.9;
		return Math.max(-lim, Math.min(lim, v)) / (lim || 1);
	}
	if (kind === 2) {
		// FOLD: past the limit it turns back rather than flattening.
		const g = v * (1 + d * 4);
		return Math.asin(Math.sin(g * Math.PI * 0.5)) / (Math.PI * 0.5);
	}
	// SOFT: tanh, normalised so the ends stay at the ends whatever the drive.
	const k = 1 + d * 40;
	return Math.tanh(v * k) / Math.tanh(k);
}

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
		return shapeCurve(this.kind, x, d);
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
 * per-sample work is one rotation per partial and one multiply per envelope.
 *
 * Each partial is a phasor -- the cosine and sine of its phase, turned by its
 * frequency's step every sample -- rather than a phase fed to `Math.sin`.
 * Sixteen sines a sample is most of what this processor costs, and a piano's
 * ten-second decays keep all of them running: a chord of eight notes with
 * four strings each measured 70% of a core. The rotation is a third of
 * that. The step is recomputed per block, so a moving PITCH still bends
 * every partial, and the phasor is renormalised per block so rounding cannot
 * grow or shrink it over a long note.
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
	private re = new Float64Array(17);
	private im = new Float64Array(17);
	private stepRe = new Float64Array(17);
	private stepIm = new Float64Array(17);
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
			this.stepRe[n] = Math.cos(TWO_PI * f * dt);
			this.stepIm[n] = Math.sin(TWO_PI * f * dt);
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
		for (let n = 1; n <= 16; n++) {
			const m = Math.hypot(this.re[n], this.im[n]);
			if (m > 0) {
				this.re[n] /= m;
				this.im[n] /= m;
			}
		}
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
					this.re[n] = 1;
					this.im[n] = 0;
				}
			}
			const mix = Math.max(0, Math.min(1, at(p.mix, i) / 100));
			let wet = 0;
			if (this.struck) {
				for (let n = 1; n <= 16; n++) {
					if (!this.freq[n]) continue;
					const st = this.stage[n];
					if (st === P_DONE) continue;
					let e = this.env[n];
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
					const re = this.re[n];
					const im = this.im[n];
					const cr = this.stepRe[n];
					const ci = this.stepIm[n];
					this.re[n] = re * cr - im * ci;
					this.im[n] = im * cr + re * ci;
					if (e > 0) wet += e * this.level[n] * this.im[n];
				}
			}
			const x = input ? input[i] : 0;
			out[i] = x * (1 - mix) + wet * mix * 0.85;
		}
		return !this.finished();
	}
}

registerProcessor(STRINGS_PROCESSOR, StringsProcessor);

/* ── WIRE ───────────────────────────────────────────────────────────────── */

/** Four allpasses of dispersion: enough to stretch a piano's upper partials
    audibly sharp, few enough that the loop stays cheap. */
const WIRE_DISPERSION = 4;
const WIRE_BUFFER = 8192;
/**
 * STIF as an inharmonicity B (partial n at n f0 sqrt(1 + B n^2)), and the
 * allpass corner that produces it. A first-order allpass's dispersion depends
 * on where its corner sits relative to the fundamental, not on its
 * coefficient alone -- one coefficient gave B 0 at A0 and 0.014 at C6 -- so
 * the corner is placed at x times the fundamental, x read off this table of
 * [ln B, ln x], solved numerically for four stages. Holds within ~20% of the
 * target up to C4; above C5 the corner would have to pass Nyquist's side of
 * zero, so the stretch falls short there, where few partials fit anyway.
 */
const WIRE_STIFF: [number, number][] = [
	[-10.4143, 3.1966],
	[-9.7212, 2.9978],
	[-9.028, 2.7868],
	[-8.3349, 2.5568],
	[-7.6417, 2.3121],
	[-6.9486, 2.0501],
	[-6.2554, 1.7672],
	[-5.5623, 1.4689],
	[-4.8691, 1.1693],
	[-4.2687, 0.9276]
];
const wireCorner = (lnB: number): number => {
	const t = WIRE_STIFF;
	if (lnB <= t[0][0]) return Math.exp(t[0][1]);
	for (let i = 1; i < t.length; i++)
		if (lnB <= t[i][0]) {
			const u = (lnB - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
			return Math.exp(t[i - 1][1] + u * (t[i][1] - t[i - 1][1]));
		}
	return Math.exp(t[t.length - 1][1]);
};

/**
 * A string as a travelling wave: whatever arrives at the input is added into
 * a delay line one period long, which feeds back through the string's losses.
 *
 * STRING is a bank of sixteen decaying sines, struck by its gate. It cannot be
 * hit -- its input is mixed past the partials, not into them -- and sixteen
 * partials of A0 end at 440 Hz. This one is hit: a hammer's burst excites
 * every mode the loop supports, as many as fit under Nyquist, and a harder,
 * brighter burst leaves more energy in the upper ones.
 *
 * This model was tried before as a DelayNode in a feedback loop, and Web
 * Audio adds at least one 128-sample block to any cycle, which capped the
 * loop gain near 0.90 -- 0.45 s of ring. Run here a sample at a time, the loop
 * is exactly as long as the pitch asks.
 *
 * The loop, per sample: delay line (cubic Lagrange read, so the period is
 * fractional and PITCH can glide) -> one-pole lowpass (DAMP) -> four
 * first-order allpasses (STIF) -> gain (DCAY) -> back in, plus
 * the input through a comb at the strike point (POS: a hammer a fraction p
 * along cannot excite the modes with a node there, so every 1/p-th partial is
 * missing).
 *
 * Every setting means the same thing on every key:
 * - DCAY is the string's own loss, the same for every partial: the
 *   fundamental's T60 with DAMP at 0.
 * - DAMP is a loss by absolute frequency on top of it: a partial at f loses
 *   DAMP x 40 x (f / 1 kHz)^2 dB/s more, so 1 kHz rings the same whether it
 *   is a C6 fundamental or an A0's 36th partial -- and a C8 fundamental, a
 *   4 kHz partial, dies fast, as it does on a piano. Set per key rather than
 *   as one coefficient: a fixed lowpass takes the same bite every trip round
 *   the loop, and C8 goes round 4186 times a second.
 * - STIF is an inharmonicity B, log-scaled from 3e-5 (1%) to 1.4e-2 (100%);
 *   0 is a perfectly harmonic string.
 *
 * The loop gain never exceeds 1 at any frequency: the lowpass is 1 at DC and
 * less above, the allpasses are 1, and the gain is below 1. Making DCAY the
 * fundamental's T60 whatever DAMP said was tried, with a DC blocker in the
 * loop so the gain could pass 1 -- and the blocker's phase lead put a mode
 * near 50 Hz where the loop gain was still ~1, which grew to NaN in 3 s.
 * - PITCH is exact: the delay is shortened by every stage's phase delay at
 *   the fundamental, worked out per block.
 */
class WireProcessor extends StoppableProcessor {
	static get parameterDescriptors() {
		return WIRE_PARAMS;
	}
	private line = new Float32Array(WIRE_BUFFER);
	private hist = new Float32Array(WIRE_BUFFER);
	private w = 0;
	private lp = 0;
	private apX = new Float64Array(WIRE_DISPERSION);
	private apY = new Float64Array(WIRE_DISPERSION);
	private dcX = 0;
	private dcY = 0;
	// Worked out per block.
	private delay = 100;
	private gain = 0.99;
	private a = 0;
	private c = 0;
	private strike = 0;
	/** Phase delay, in samples, of the loop's filters at angular frequency w. */
	private filterDelay(w: number, a: number, c: number): number {
		const sin = Math.sin(w);
		const cos = Math.cos(w);
		// One-pole lowpass (1 - a) / (1 - a z^-1).
		const lpPhase = -Math.atan2(a * sin, 1 - a * cos);
		// Allpass (c + z^-1) / (1 + c z^-1), four of them.
		const apPhase = Math.atan2(-sin, c + cos) - Math.atan2(-c * sin, 1 + c * cos);
		return -(lpPhase + WIRE_DISPERSION * apPhase) / w;
	}
	private plan(p: Params): void {
		const sr = sampleRate;
		const f0 = Math.max(20, Math.min(sr / 6, at(p.pitch, 0)));
		const period = sr / f0;
		const w0 = (TWO_PI * f0) / sr;
		const t60 = Math.max(0.01, at(p.decay, 0));
		const damp = Math.max(0, Math.min(100, at(p.damping, 0))) / 100;
		const stiff = Math.max(0, Math.min(100, at(p.stiffness, 0))) / 100;
		const pos = Math.max(0, Math.min(50, at(p.position, 0))) / 100;
		/* DAMP: per trip the lowpass takes 4.343 b w^2 dB at small w, and the
		   loop makes f0 trips a second, so b follows from the loss wanted at
		   1 kHz and the pitch. b = a / (1 - a)^2, solved for a. */
		const w1k = (TWO_PI * 1000) / sr;
		const b = (damp * 40) / (f0 * 4.343 * w1k * w1k);
		this.a = b > 0 ? Math.min(0.999, (2 * b + 1 - Math.sqrt(4 * b + 1)) / (2 * b)) : 0;
		this.c =
			stiff > 0
				? Math.max(
						-0.985,
						Math.min(0, -1 + wireCorner(Math.log(3e-5 * Math.pow(466.7, stiff))) * w0)
					)
				: 0;
		this.delay = Math.max(
			3,
			Math.min(WIRE_BUFFER - 4, period - this.filterDelay(w0, this.a, this.c))
		);
		// DCAY: 60 dB in t60, a trip at a time.
		this.gain = Math.min(0.99999, Math.pow(10, (-3 * (period / sr)) / t60));
		this.strike = pos > 0 ? Math.max(1, Math.round(pos * period)) : 0;
	}
	process(inputs: Float32Array[][], outputs: Float32Array[][], p: Params): boolean {
		const out = outputs[0]?.[0];
		if (!out) return !this.finished();
		const input = inputs[0]?.[0];
		const dt = 1 / sampleRate;
		this.plan(p);
		const line = this.line;
		const hist = this.hist;
		const mask = WIRE_BUFFER - 1;
		const { delay, gain, a, c, strike } = this;
		const whole = Math.floor(delay);
		const f = delay - whole;
		/* Cubic Lagrange over the four samples around the read point, for a
		   delay of `whole + f`: taps at delays whole-1 .. whole+2, so the delay
		   measured from the first tap is 1 + f. */
		const d = 1 + f;
		const h0 = (-(d - 1) * (d - 2) * (d - 3)) / 6;
		const h1 = (d * (d - 2) * (d - 3)) / 2;
		const h2 = (-d * (d - 1) * (d - 3)) / 2;
		const h3 = (d * (d - 1) * (d - 2)) / 6;
		for (let i = 0; i < out.length; i++) {
			if (currentTime + i * dt >= this.stopAt) {
				out[i] = 0;
				continue;
			}
			const x = input ? input[i] : 0;
			hist[this.w] = x;
			const hit = strike ? x - hist[(this.w - strike) & mask] : x;
			const r = this.w - whole;
			const y =
				h0 * line[(r + 1) & mask] +
				h1 * line[r & mask] +
				h2 * line[(r - 1) & mask] +
				h3 * line[(r - 2) & mask];
			this.lp = (1 - a) * y + a * this.lp;
			let v = this.lp;
			for (let k = 0; k < WIRE_DISPERSION; k++) {
				const yk = c * v + this.apX[k] - c * this.apY[k];
				this.apX[k] = v;
				this.apY[k] = yk;
				v = yk;
			}
			const next = gain * v + hit;
			line[this.w] = next;
			this.w = (this.w + 1) & mask;
			// And one on the way out, for the strike's own offset.
			const o = next - this.dcX + 0.995 * this.dcY;
			this.dcX = next;
			this.dcY = o;
			out[i] = o;
		}
		return !this.finished();
	}
}

registerProcessor(WIRE_PROCESSOR, WireProcessor);

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

/* ── SPACE ──────────────────────────────────────────────────────────────── */

/** An allpass: smears a transient into a cluster without colouring it. */
class Allpass {
	private buf: Float32Array;
	private pos = 0;
	constructor(
		samples: number,
		private g: number
	) {
		this.buf = new Float32Array(Math.max(1, samples));
	}
	step(x: number): number {
		const d = this.buf[this.pos];
		const v = x + this.g * d;
		this.buf[this.pos] = v;
		this.pos = (this.pos + 1) % this.buf.length;
		return d - this.g * v;
	}
}

/* Delay-line lengths in seconds at SIZE's middle, mutually prime in samples
   near enough that their echoes never line up into a pitch. */
const FDN_BASE = [0.0297, 0.0371, 0.0411, 0.0437, 0.0533, 0.0599, 0.0677, 0.0793];
const FDN_N = FDN_BASE.length;
const FDN_MAX_SCALE = 2.5;
/* Wet level, set against the convolver this replaced so SPACE at the same
   settings is about as loud as it was. The convolver's energy grew with the
   length of its room, so the network's output is scaled by sqrt(RT60) too:
   measured against it at four settings, a constant gain put the shortest room
   6 dB over and the longest 5 dB under. */
const SPACE_GAIN = 0.09;

/**
 * A room as a feedback delay network: eight delay lines whose outputs are
 * mixed by a Householder matrix and fed back, each through the gain that
 * makes it fall 60 dB in the room's decay time.
 *
 * SPACE used to convolve with an impulse of noise generated when the note was
 * built: SIZE was its length and DECAY the exponent of its envelope, so both
 * were read once. Here SIZE scales the delay lines and sets the decay time,
 * DECAY shapes it, and both are read every render block.
 *
 * The decay time is set so the tail stops being heard where the old one did.
 * The old impulse's envelope was (1 - t/T)^k, with T = SIZE's seconds and k
 * from DECAY: polynomial, so at a long DECAY it held its level almost to T and
 * then fell away. A network decays exponentially, so no one decay time
 * matches every point; this matches the point 40 dB down -- where a tail
 * drops out of a mix, and where the audio tests read "silent" -- which the
 * old envelope crossed at T * (1 - 0.01^(1/k)), and an exponential crosses at
 * two thirds of its RT60. Matching -60 dB instead ended every long room
 * seconds early, because the polynomial is still loud when the exponential
 * is not.
 *
 * The line lengths glide toward their targets (read with interpolation), so
 * turning SIZE bends the room instead of clicking.
 */
class SpaceProcessor extends StoppableProcessor {
	static get parameterDescriptors() {
		return SPACE_PARAMS;
	}
	private lines: Float32Array[];
	private writePos = 0;
	private delay = new Float64Array(FDN_N);
	private target = new Float64Array(FDN_N);
	private gain = new Float64Array(FDN_N);
	private diffuse = [
		new Allpass(Math.round(0.0047 * sampleRate), 0.6),
		new Allpass(Math.round(0.0017 * sampleRate), 0.6)
	];
	private started = false;
	private taps = new Float64Array(FDN_N);
	private outGain = SPACE_GAIN;
	constructor(options?: unknown) {
		super(options);
		const len = Math.ceil(Math.max(...FDN_BASE) * FDN_MAX_SCALE * sampleRate) + 4;
		this.lines = FDN_BASE.map(() => new Float32Array(len));
	}
	private plan(size: number, decay: number): void {
		const seconds = Math.min(4, Math.max(0.05, (size / 100) * 3));
		const k = 2 * Math.max(0.1, (1 - decay / 100) * 3) + 1;
		const rt60 = Math.max(0.05, 1.5 * seconds * (1 - Math.pow(0.01, 1 / k)));
		const scale = Math.min(FDN_MAX_SCALE, Math.max(0.25, seconds / 1.2));
		this.outGain = SPACE_GAIN * Math.sqrt(rt60 / 1.2);
		for (let i = 0; i < FDN_N; i++) {
			const d = FDN_BASE[i] * scale;
			this.target[i] = d * sampleRate;
			this.gain[i] = Math.pow(10, (-3 * d) / rt60);
		}
		if (!this.started) {
			this.delay.set(this.target);
			this.started = true;
		}
	}
	private read(line: Float32Array, samples: number): number {
		const len = line.length;
		let r = this.writePos - samples;
		while (r < 0) r += len;
		const i0 = Math.floor(r);
		const frac = r - i0;
		const a = line[i0 % len];
		const b = line[(i0 + 1) % len];
		return a + (b - a) * frac;
	}
	process(inputs: Float32Array[][], outputs: Float32Array[][], p: Params): boolean {
		const outL = outputs[0]?.[0];
		const outR = outputs[0]?.[1] ?? outL;
		if (!outL || !outR) return !this.finished();
		const inL = inputs[0]?.[0];
		const inR = inputs[0]?.[1] ?? inL;
		const dt = 1 / sampleRate;
		this.plan(at(p.size, 0), at(p.decay, 0));
		const y = this.taps;
		const len = this.lines[0].length;
		for (let i = 0; i < outL.length; i++) {
			if (currentTime + i * dt >= this.stopAt) {
				outL[i] = 0;
				outR[i] = 0;
				continue;
			}
			const x = inL ? 0.5 * (inL[i] + (inR ? inR[i] : inL[i])) : 0;
			const fed = this.diffuse[1].step(this.diffuse[0].step(x));
			let sum = 0;
			for (let n = 0; n < FDN_N; n++) {
				this.delay[n] += (this.target[n] - this.delay[n]) * 0.0005;
				y[n] = this.read(this.lines[n], this.delay[n]);
				sum += y[n];
			}
			const house = (2 / FDN_N) * sum;
			for (let n = 0; n < FDN_N; n++) {
				const sign = n & 1 ? -1 : 1;
				this.lines[n][this.writePos] = sign * fed + this.gain[n] * (y[n] - house);
			}
			this.writePos = (this.writePos + 1) % len;
			outL[i] = (y[0] - y[2] + y[4] - y[6]) * this.outGain;
			outR[i] = (y[1] - y[3] + y[5] - y[7]) * this.outGain;
		}
		return !this.finished();
	}
}

registerProcessor(SPACE_PROCESSOR, SpaceProcessor);

/* ── LOOP ───────────────────────────────────────────────────────────────── */

/* The filter types in FILTER_TYPES order. */
const LOOP_LP = 0;
const LOOP_HP = 1;
const LOOP_BP = 2;
const LOOP_NOTCH = 3;
const LOOP_LSHELF = 4;
const LOOP_HSHELF = 5;
const LOOP_PEAK = 6;
const LOOP_AP = 7;

/** DELAY's own ceiling, as the native node was built with. */
const LOOP_DELAY_MAX = 4;

/**
 * A biquad with BiquadFilterNode's coefficients -- the formulas the Web Audio
 * spec gives, Q in dB for the low- and highpass as there -- so a FILTER sounds
 * the same inside a compiled loop as outside one. Transposed direct form II.
 */
class LoopBiquad {
	private b0 = 1;
	private b1 = 0;
	private b2 = 0;
	private a1 = 0;
	private a2 = 0;
	private z1 = 0;
	private z2 = 0;
	private f = NaN;
	private q = NaN;
	private g = NaN;
	constructor(private type: number) {}
	private plan(f: number, q: number, g: number) {
		this.f = f;
		this.q = q;
		this.g = g;
		const nyq = sampleRate / 2;
		const w0 = (2 * Math.PI * Math.max(1, Math.min(nyq * 0.999, f))) / sampleRate;
		const cw = Math.cos(w0);
		const sw = Math.sin(w0);
		const A = Math.pow(10, g / 40);
		let b0 = 1;
		let b1 = 0;
		let b2 = 0;
		let a0 = 1;
		let a1 = 0;
		let a2 = 0;
		switch (this.type) {
			case LOOP_LP:
			case LOOP_HP: {
				const alpha = sw / (2 * Math.pow(10, q / 20));
				const k = this.type === LOOP_LP ? 1 - cw : 1 + cw;
				b0 = k / 2;
				b1 = this.type === LOOP_LP ? k : -k;
				b2 = k / 2;
				a0 = 1 + alpha;
				a1 = -2 * cw;
				a2 = 1 - alpha;
				break;
			}
			case LOOP_BP:
			case LOOP_NOTCH:
			case LOOP_AP:
			case LOOP_PEAK: {
				const alpha = sw / (2 * Math.max(1e-4, q));
				a1 = -2 * cw;
				if (this.type === LOOP_BP) {
					b0 = alpha;
					b2 = -alpha;
				} else if (this.type === LOOP_NOTCH) {
					b0 = 1;
					b1 = -2 * cw;
					b2 = 1;
				} else if (this.type === LOOP_AP) {
					b0 = 1 - alpha;
					b1 = -2 * cw;
					b2 = 1 + alpha;
				}
				if (this.type === LOOP_PEAK) {
					b0 = 1 + alpha * A;
					b1 = -2 * cw;
					b2 = 1 - alpha * A;
					a0 = 1 + alpha / A;
					a2 = 1 - alpha / A;
				} else {
					a0 = 1 + alpha;
					a2 = 1 - alpha;
				}
				break;
			}
			case LOOP_LSHELF:
			case LOOP_HSHELF: {
				const alpha = (sw / 2) * Math.SQRT2;
				const r = 2 * Math.sqrt(A) * alpha;
				if (this.type === LOOP_LSHELF) {
					b0 = A * (A + 1 - (A - 1) * cw + r);
					b1 = 2 * A * (A - 1 - (A + 1) * cw);
					b2 = A * (A + 1 - (A - 1) * cw - r);
					a0 = A + 1 + (A - 1) * cw + r;
					a1 = -2 * (A - 1 + (A + 1) * cw);
					a2 = A + 1 + (A - 1) * cw - r;
				} else {
					b0 = A * (A + 1 + (A - 1) * cw + r);
					b1 = -2 * A * (A - 1 + (A + 1) * cw);
					b2 = A * (A + 1 + (A - 1) * cw - r);
					a0 = A + 1 - (A - 1) * cw + r;
					a1 = 2 * (A - 1 - (A + 1) * cw);
					a2 = A + 1 - (A - 1) * cw - r;
				}
				break;
			}
		}
		this.b0 = b0 / a0;
		this.b1 = b1 / a0;
		this.b2 = b2 / a0;
		this.a1 = a1 / a0;
		this.a2 = a2 / a0;
	}
	run(x: number, f: number, q: number, g: number): number {
		if (f !== this.f || q !== this.q || g !== this.g) this.plan(f, q, g);
		const y = this.b0 * x + this.z1;
		this.z1 = this.b1 * x - this.a1 * y + this.z2;
		this.z2 = this.b2 * x - this.a2 * y;
		return y;
	}
}

/**
 * DELAY's line, read between samples with a cubic, as WIRE reads its string.
 *
 * Grown as the time asks rather than allocated at DELAY's 4 s ceiling: a comb
 * of a few milliseconds is the common case, and 768 KB a note for it was
 * garbage on every key.
 */
class LoopDelay {
	private buf = new Float32Array(1024);
	private w = 0;
	private grow(need: number) {
		const n = this.buf.length;
		const size = Math.min(Math.ceil(LOOP_DELAY_MAX * sampleRate) + 8, Math.max(n * 2, need));
		if (size <= n) return;
		const next = new Float32Array(size);
		// Oldest first, so the newest sample lands at the end and the taps still read back from it.
		for (let k = 0; k < n; k++) next[size - n + k] = this.buf[(this.w + 1 + k) % n];
		this.buf = next;
		this.w = size - 1;
	}
	run(x: number, samples: number): number {
		if (samples + 8 > this.buf.length) this.grow(Math.ceil(samples) + 16);
		const buf = this.buf;
		const n = buf.length;
		this.w = (this.w + 1) % n;
		buf[this.w] = x;
		const D = Math.max(0, Math.min(n - 8, samples));
		const i = Math.floor(D);
		const f = D - i;
		const tap = (k: number) => buf[(this.w - k + n * 2) % n];
		// Under one sample there is nothing ahead to fit a cubic to.
		if (i < 1) return tap(0) + (tap(1) - tap(0)) * f;
		const d = f + 1;
		const h0 = (-(d - 1) * (d - 2) * (d - 3)) / 6;
		const h1 = (d * (d - 2) * (d - 3)) / 2;
		const h2 = (-d * (d - 1) * (d - 3)) / 2;
		const h3 = (d * (d - 1) * (d - 2)) / 6;
		return h0 * tap(i - 1) + h1 * tap(i) + h2 * tap(i + 1) + h3 * tap(i + 2);
	}
}

/**
 * A feedback loop run one sample at a time.
 *
 * The engine hands over the loop's modules in an order where every module
 * comes after what feeds it -- RTN first, since what feeds RTN is the SEND of
 * the sample before. Each sample runs them in that order, then passes each
 * bus's SEND total to its RTN for the next sample through SEND's tanh guard,
 * the same curve the block-delayed loop saturates with. Every module's output
 * is also an output channel, so whatever outside the loop listens to one of
 * them can.
 */
class LoopProcessor extends StoppableProcessor {
	static get parameterDescriptors() {
		return LOOP_PARAMS;
	}
	private prog: LoopProgram;
	private reg: Float64Array;
	private sendNext = new Float64Array(8);
	private sendPrev = new Float64Array(8);
	private filters: (LoopBiquad | null)[];
	private delays: (LoopDelay | null)[];
	private shapePrev: Float64Array;
	private slotArrays: Float32Array[] = [];
	constructor(options?: { processorOptions?: { program?: LoopProgram } }) {
		super(options);
		this.prog = options?.processorOptions?.program ?? { ops: [], inputs: 0 };
		const n = this.prog.ops.length;
		this.reg = new Float64Array(n);
		this.shapePrev = new Float64Array(n);
		this.filters = this.prog.ops.map((o) => (o.type === 'filter' ? new LoopBiquad(o.kind) : null));
		this.delays = this.prog.ops.map((o) => (o.type === 'delay' ? new LoopDelay() : null));
	}
	process(inputs: Float32Array[][], outputs: Float32Array[][], p: Params): boolean {
		const ops = this.prog.ops;
		const reg = this.reg;
		const len = outputs[0]?.[0]?.length ?? 128;
		const slots = this.slotArrays;
		for (let s = 0; s < LOOP_PARAMS.length; s++) slots[s] = p[`p${s}`];
		const dt = 1 / sampleRate;
		const ext = (ch: number, i: number) => (ch >= 0 ? (inputs[ch]?.[0]?.[i] ?? 0) : 0);
		for (let i = 0; i < len; i++) {
			if (currentTime + i * dt >= this.stopAt) {
				for (let k = 0; k < ops.length; k++) {
					const out = outputs[k]?.[0];
					if (out) out[i] = 0;
				}
				continue;
			}
			this.sendNext.fill(0);
			for (let k = 0; k < ops.length; k++) {
				const o = ops[k];
				let a = ext(o.aExt, i);
				for (const m of o.a) a += reg[m];
				let y = 0;
				switch (o.type) {
					case 'fbrtn':
						y = this.sendPrev[o.bus];
						break;
					case 'fbsend':
						this.sendNext[o.bus] += a;
						y = a;
						break;
					case 'sum':
						y = a;
						break;
					case 'gain':
						y = a * at(slots[o.slots.level], i);
						break;
					case 'diff':
					case 'ring': {
						let b = ext(o.bExt, i);
						for (const m of o.b) b += reg[m];
						y = o.type === 'diff' ? a - b : a * b * (at(slots[o.slots.ringDepth], i) / 100);
						break;
					}
					case 'shape': {
						const d = Math.max(0, at(slots[o.slots.shapeDrive], i) / 100);
						y =
							0.5 * (shapeCurve(o.kind, a, d) + shapeCurve(o.kind, (a + this.shapePrev[k]) / 2, d));
						this.shapePrev[k] = a;
						break;
					}
					case 'filter':
						y = this.filters[k]!.run(
							a,
							at(slots[o.slots.cutoff], i),
							at(slots[o.slots.q], i),
							at(slots[o.slots.filterGain], i)
						);
						break;
					case 'delay':
						y = this.delays[k]!.run(a, at(slots[o.slots.delayTime], i) * sampleRate - o.lend);
						break;
				}
				// A NaN reaching the master silences every track; a loop is where one would breed.
				reg[k] = Number.isFinite(y) ? y : 0;
				const out = outputs[k]?.[0];
				if (out) out[i] = reg[k];
			}
			for (let b = 0; b < 8; b++) {
				const v = Math.max(-1, Math.min(1, this.sendNext[b]));
				this.sendPrev[b] = Math.tanh(v);
			}
		}
		return !this.finished();
	}
}

registerProcessor(LOOP_PROCESSOR, LoopProcessor);
