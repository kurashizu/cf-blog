/**
 * The parameters each live-DSP processor exposes, shared by the worklet that
 * reads them and the engine that binds knobs and cables to them.
 *
 * One list, imported on both sides of the thread boundary, so a knob cannot be
 * bound to a parameter the processor never declared -- `AudioWorkletNode`
 * throws on an unknown name in `parameterData`, and silently returns
 * `undefined` from `parameters.get`.
 *
 * Every parameter is a-rate: the whole point of moving a module into a worklet
 * is that a cable can move it sample by sample.
 */

export interface LiveParamDescriptor {
	name: string;
	defaultValue: number;
	minValue?: number;
	maxValue?: number;
	automationRate: 'a-rate' | 'k-rate';
}

const a = (name: string, defaultValue: number, minValue?: number, maxValue?: number) =>
	({ name, defaultValue, minValue, maxValue, automationRate: 'a-rate' }) as LiveParamDescriptor;

/** The name each processor is registered under. */
export const ENV_PROCESSOR = 'krsz-env';

/**
 * ENV: attack, decay and release in seconds, sustain as 0..1, and a gate that
 * is 1 while the note is held. The gate is automated by the engine (up at the
 * note, down when it ends); the other four are the card's knobs, and anything
 * patched into them adds to them.
 */
export const ENV_PARAMS: LiveParamDescriptor[] = [
	a('attack', 0.005),
	a('decay', 0.2),
	a('sustain', 0.6),
	a('release', 0.2),
	a('gate', 0)
];

export const MAP_PROCESSOR = 'krsz-map';

/**
 * MAP: the X range the input is read against and the Y range the result is
 * carried to. The shape is not a parameter -- it is a choice, fixed per note,
 * handed to the processor as a table (see `MapOptions`).
 */
export const MAP_PARAMS: LiveParamDescriptor[] = [
	a('inLo', 0),
	a('inHi', 1),
	a('outLo', 0),
	a('outHi', 1)
];

/**
 * How MAP's processor reads its table.
 *
 * `table` is the shape sampled over 0..1 in and 0..1 out, computed by the
 * same evaluator a pulled MAP uses, so the two cannot disagree. `clamp` holds
 * the ends past the X range, `wrap` folds the input round it (WRAP), and
 * `gate` ignores the table and steps at the midpoint of X (GATE, which is
 * defined on the raw input rather than the normalised one).
 */
export interface MapOptions {
	mode: 'clamp' | 'wrap' | 'gate';
	table: Float32Array;
}

export const SHAPE_PROCESSOR = 'krsz-shape';

/**
 * SHAPE: how hard the signal is driven into the curve, as the card's 0..100.
 * Which curve (SOFT, HARD, FOLD) is a choice, passed as `{ kind }`.
 */
export const SHAPE_PARAMS: LiveParamDescriptor[] = [a('drive', 25)];

export const STRINGS_PROCESSOR = 'krsz-strings';

/**
 * STRING and TUBE: a bank of decaying partials over `pitch` (Hz). Decay in
 * seconds; damping, stiffness and mix as the card's 0..100. The gate is the
 * note, as ENV's is. Which of the two, and TUBE's odd-only switch, are
 * options (`{ tube, oddOnly }`), fixed per note.
 */
export const STRINGS_PARAMS: LiveParamDescriptor[] = [
	a('pitch', 220),
	a('decay', 2),
	a('damping', 40),
	a('stiffness', 10),
	a('mix', 70),
	a('gate', 0)
];

export const MODES_PROCESSOR = 'krsz-modes';

/**
 * MODES: three struck modes and three bandpasses at `root` times each ratio.
 * `base` is the card's BASE (0 = follow `pitch`); `pitch` is the played note
 * or the cable. Whether a cable decides the pitch is an option
 * (`{ pitchWired }`), because BASE only yields to a patch saying otherwise.
 */
export const MODES_PARAMS: LiveParamDescriptor[] = [
	a('pitch', 220),
	a('base', 0),
	a('r1', 1),
	a('r2', 2.4),
	a('r3', 4.1),
	a('q', 14),
	a('mix', 70),
	a('gate', 0)
];

export const WIRE_PROCESSOR = 'krsz-wire';

/**
 * WIRE: a string as a travelling wave -- a delay line one period long, fed
 * back through the losses. `pitch` in Hz; `decay` is the fundamental's T60
 * in seconds; `damping`, `stiffness` and `position` as the card's percent.
 * No gate: it rings from whatever arrives at its input, which is what makes
 * it struck rather than switched on.
 */
export const WIRE_PARAMS: LiveParamDescriptor[] = [
	a('pitch', 220),
	a('decay', 4),
	a('damping', 30),
	a('stiffness', 10),
	a('position', 12)
];

export const SPACE_PROCESSOR = 'krsz-space';

/**
 * SPACE: SIZE and DECAY as the card's 0..100. The processor puts out the wet
 * signal only, in stereo; the dry/wet crossfade is native, in front of it.
 */
export const SPACE_PARAMS: LiveParamDescriptor[] = [a('size', 40), a('decay', 50)];

export const LOOP_PROCESSOR = 'krsz-loop';

/**
 * A feedback loop compiled into one processor, so it closes in one sample.
 *
 * Web Audio breaks every cycle with a render quantum of delay (128 samples),
 * which put a floor of 2.9 ms under any loop a patch drew with SEND and RTN:
 * no comb shorter than that, no Karplus string above ~340 Hz, no allpass
 * diffuser at all. When every module on the loop is one the processor knows,
 * the engine hands it the loop as a program and runs it sample by sample.
 *
 * Its knobs arrive on numbered slots rather than named parameters, because a
 * processor's parameters are declared once for the class and a loop can hold
 * any mix of modules. The program says which slot is which.
 */
export const LOOP_SLOTS = 32;
export const LOOP_PARAMS: LiveParamDescriptor[] = Array.from({ length: LOOP_SLOTS }, (_, i) =>
	a(`p${i}`, 0)
);

/** One module of a compiled loop, in the order the processor runs them. */
export interface LoopOp {
	/** The module's type: gain, filter, delay, sum, diff, ring, shape, fbsend, fbrtn. */
	type: string;
	/** Members feeding its first inlet, by index in the program, and the input channel carrying what arrives from outside. */
	a: number[];
	aExt: number;
	/** The same for a second inlet (DIFF's and RING's B); -1 where there is none. */
	b: number[];
	bExt: number;
	/** Knob name to slot. */
	slots: Record<string, number>;
	/** FILTER's type or SHAPE's curve; fixed per note, like the card's picker. */
	kind: number;
	/** SEND's and RTN's bus. */
	bus: number;
	/** Samples a DELAY gives back, so the loop it sits in has the period its TIME says. */
	lend: number;
}

export interface LoopProgram {
	ops: LoopOp[];
	/** How many input channels carry signal from outside the loop. */
	inputs: number;
}

export const SH_PROCESSOR = 'krsz-sh';

/** S&H: what it samples and the trigger it samples on, both live. */
export const SH_PARAMS: LiveParamDescriptor[] = [a('in', 0), a('trig', 0)];

export const SLEW_PROCESSOR = 'krsz-slew';

/** SLEW: what it follows, and how long a rise and a fall take, in seconds. */
export const SLEW_PARAMS: LiveParamDescriptor[] = [a('in', 0), a('rise', 0.05), a('fall', 0.05)];

export const LIVE_PARAMS: Record<string, LiveParamDescriptor[]> = {
	[SPACE_PROCESSOR]: SPACE_PARAMS,
	[ENV_PROCESSOR]: ENV_PARAMS,
	[MAP_PROCESSOR]: MAP_PARAMS,
	[SHAPE_PROCESSOR]: SHAPE_PARAMS,
	[STRINGS_PROCESSOR]: STRINGS_PARAMS,
	[MODES_PROCESSOR]: MODES_PARAMS,
	[WIRE_PROCESSOR]: WIRE_PARAMS,
	[LOOP_PROCESSOR]: LOOP_PARAMS,
	[SH_PROCESSOR]: SH_PARAMS,
	[SLEW_PROCESSOR]: SLEW_PARAMS
};
