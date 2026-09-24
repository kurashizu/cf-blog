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

export const LIVE_PARAMS: Record<string, LiveParamDescriptor[]> = {
	[ENV_PROCESSOR]: ENV_PARAMS
};
