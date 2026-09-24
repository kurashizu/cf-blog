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

export const LIVE_PARAMS: Record<string, LiveParamDescriptor[]> = {
	[ENV_PROCESSOR]: ENV_PARAMS,
	[MAP_PROCESSOR]: MAP_PARAMS,
	[SHAPE_PROCESSOR]: SHAPE_PARAMS,
	[STRINGS_PROCESSOR]: STRINGS_PARAMS,
	[MODES_PROCESSOR]: MODES_PARAMS
};
