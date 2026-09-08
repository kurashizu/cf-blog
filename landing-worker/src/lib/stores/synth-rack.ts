import { writable, get } from 'svelte/store';
import { modularSynth } from '../synth';
import { activeTrackId } from './synth-transport';
import { refreshTracks } from './synth-tracks';

/**
 * The patch bay's model: a voice as a list of processors rather than one fixed
 * chain.
 *
 * The engine builds every voice the same way -- sources, fusion, one filter,
 * envelopes, an air shelf -- which is why a drum fitted to a real recording
 * plateaus: a snare's crack is a 2 ms transient and a struck drum is saturated,
 * and neither is reachable by tuning a filter. A chain that is data can carry
 * those stages, and can differ per percussion key, so a kick and a hi-hat need
 * not share a signal path.
 *
 * Stored as ids, not nodes: the engine resolves them when it builds a voice.
 */
export type RackModuleId =
	| 'excite'
	| 'string'
	| 'tube'
	| 'modes'
	| 'body'
	| 'fusion'
	| 'filter'
	| 'transient'
	| 'drive'
	| 'resonators'
	| 'noiseshaper'
	| 'eq'
	| 'air';

/** A knob on a module: the id is its key in the track's rackParams. */
export interface RackParamSpec {
	key: string;
	label: string;
	min: number;
	max: number;
	step: number;
	unit?: string;
	def: number;
}

export interface RackModuleSpec {
	id: RackModuleId;
	/** Short label for the patch bay; four characters, like every other synth label. */
	label: string;
	/** Panel accent, matching the module it corresponds to where one exists. */
	color: string;
	/** One line on what it does, shown under the selected module. */
	descKey: string;
	/** True for stages the engine has always had, so a default chain is honest. */
	builtIn: boolean;
	/** The module's own knobs. Empty for stages whose controls live in racks 1-7. */
	params: RackParamSpec[];
}

/* The set is chosen by what an acoustic instrument actually is: something
   excites a resonator, the resonator drives a body, the body radiates. A
   subtractive synth has no resonator and no body, which is why a drum fitted to
   a real recording plateaus and why a plucked string is out of reach entirely.
   EXCITE, STRING, TUBE, MODES and BODY are those missing stages; the rest are
   shaping the engine already had, now placeable in the path.

     piano    EXCITE(hard) -> STRING(stiff)  -> BODY(soundboard)
     guitar   EXCITE(pluck) -> STRING        -> BODY(box)
     bass     EXCITE(finger)-> STRING(long)  -> BODY(large)
     strings  EXCITE(bow)   -> STRING(bowed) -> BODY
     winds    EXCITE(breath)-> TUBE          -> BODY(bell)
     drums    EXCITE(strike)-> MODES         -> BODY(shell) */
export const RACK_MODULES: RackModuleSpec[] = [
	{
		id: 'excite',
		label: 'EXCT',
		color: '#e06c75',
		descKey: 'synthPatch.mod.excite',
		builtIn: false,
		params: [
			{ key: 'hardness', label: 'HARD', min: 0, max: 100, step: 1, unit: '%', def: 50 },
			{ key: 'exLength', label: 'LEN', min: 1, max: 60, step: 1, unit: 'ms', def: 6 },
			{ key: 'exTone', label: 'TONE', min: 200, max: 12000, step: 100, unit: 'Hz', def: 3000 },
			{ key: 'exNoise', label: 'NZ', min: 0, max: 100, step: 1, unit: '%', def: 70 }
		]
	},
	{
		id: 'string',
		label: 'STRG',
		color: '#98c379',
		descKey: 'synthPatch.mod.string',
		builtIn: false,
		params: [
			{ key: 'decayTime', label: 'DECY', min: 0.05, max: 12, step: 0.05, unit: 's', def: 2 },
			{ key: 'damping', label: 'DAMP', min: 0, max: 100, step: 1, unit: '%', def: 30 },
			{ key: 'stiffness', label: 'STIF', min: 0, max: 100, step: 1, unit: '%', def: 10 },
			{ key: 'strBlend', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 100 }
		]
	},
	{
		id: 'tube',
		label: 'TUBE',
		color: '#56b6c2',
		descKey: 'synthPatch.mod.tube',
		builtIn: false,
		params: [
			{ key: 'tubeDecay', label: 'DECY', min: 0.05, max: 8, step: 0.05, unit: 's', def: 1.2 },
			{ key: 'tubeDamp', label: 'DAMP', min: 0, max: 100, step: 1, unit: '%', def: 40 },
			{ key: 'tubeOdd', label: 'ODD', min: 0, max: 100, step: 1, unit: '%', def: 100 },
			{ key: 'tubeMix', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 100 }
		]
	},
	{
		id: 'modes',
		label: 'MODE',
		color: '#c678dd',
		descKey: 'synthPatch.mod.modes',
		builtIn: false,
		params: [
			{ key: 'mode1', label: 'M1', min: 0.5, max: 12, step: 0.01, unit: '×', def: 1 },
			{ key: 'mode2', label: 'M2', min: 0.5, max: 12, step: 0.01, unit: '×', def: 2.4 },
			{ key: 'mode3', label: 'M3', min: 0.5, max: 12, step: 0.01, unit: '×', def: 4.6 },
			{ key: 'modeQ', label: 'Q', min: 1, max: 60, step: 0.5, def: 14 },
			{ key: 'modeMix', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 100 }
		]
	},
	{
		id: 'body',
		label: 'BODY',
		color: '#d19a66',
		descKey: 'synthPatch.mod.body',
		builtIn: false,
		params: [
			{ key: 'bodySize', label: 'SIZE', min: 0, max: 100, step: 1, unit: '%', def: 50 },
			{ key: 'bodyDepth', label: 'DPTH', min: 0, max: 100, step: 1, unit: '%', def: 45 },
			{ key: 'bodyMix', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 60 }
		]
	},
	{
		id: 'transient',
		label: 'TRAN',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.transient',
		builtIn: false,
		params: [
			{ key: 'trAttack', label: 'ATK', min: -100, max: 100, step: 1, unit: '%', def: 0 },
			{ key: 'trSustain', label: 'SUS', min: -100, max: 100, step: 1, unit: '%', def: 0 },
			{ key: 'trTime', label: 'TIME', min: 1, max: 80, step: 1, unit: 'ms', def: 8 }
		]
	},
	{
		id: 'drive',
		label: 'DRIV',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.drive',
		builtIn: false,
		params: [
			{ key: 'driveAmt', label: 'AMT', min: 0, max: 100, step: 1, unit: '%', def: 25 },
			{ key: 'driveBias', label: 'BIAS', min: 0, max: 100, step: 1, unit: '%', def: 30 },
			{ key: 'driveTone', label: 'TONE', min: 500, max: 16000, step: 100, unit: 'Hz', def: 8000 }
		]
	},
	{
		id: 'noiseshaper',
		label: 'NZSH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.noiseshaper',
		builtIn: false,
		params: [
			{ key: 'nzCut', label: 'CUT', min: 100, max: 18000, step: 100, unit: 'Hz', def: 6000 },
			{ key: 'nzQ', label: 'Q', min: 0.1, max: 20, step: 0.1, def: 1 },
			{ key: 'nzDecay', label: 'DECY', min: 0.005, max: 1.5, step: 0.005, unit: 's', def: 0.08 }
		]
	},
	{ id: 'fusion', label: 'FUSE', color: '#c678dd', descKey: 'synthPatch.mod.fusion', builtIn: true, params: [] },
	{ id: 'filter', label: 'VCF', color: '#56b6c2', descKey: 'synthPatch.mod.filter', builtIn: true, params: [] },
	{
		id: 'resonators',
		label: 'RESO',
		color: '#98c379',
		descKey: 'synthPatch.mod.resonators',
		builtIn: false,
		params: [
			{ key: 'resFreq', label: 'FREQ', min: 60, max: 8000, step: 10, unit: 'Hz', def: 700 },
			{ key: 'resQ', label: 'Q', min: 1, max: 60, step: 0.5, def: 12 },
			{ key: 'resMix', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 50 }
		]
	},
	{ id: 'eq', label: 'EQ', color: '#61afef', descKey: 'synthPatch.mod.eq', builtIn: true, params: [] },
	{ id: 'air', label: 'AIR', color: '#d19a66', descKey: 'synthPatch.mod.air', builtIn: true, params: [] }
];

/** What the engine has always done, in order. A track with no chain uses this. */
export const DEFAULT_CHAIN: RackModuleId[] = ['fusion', 'filter', 'eq', 'air'];

export function moduleSpec(id: RackModuleId): RackModuleSpec | undefined {
	return RACK_MODULES.find((m) => m.id === id);
}

/** The slot the patch bay is editing, or null when the chain itself is selected. */
export const selectedSlot = writable<number | null>(null);

/** The active track's chain, or the default when it has none of its own. */
export function chainOf(track: { rackChain?: string[] } | undefined): RackModuleId[] {
	const raw = track?.rackChain;
	if (!Array.isArray(raw) || !raw.length) return [...DEFAULT_CHAIN];
	return raw.filter((id): id is RackModuleId => RACK_MODULES.some((m) => m.id === id));
}

export function setChain(chain: RackModuleId[]): void {
	modularSynth.updateTrack(get(activeTrackId), { rackChain: [...chain] });
	refreshTracks();
}

/** A module's knob values, falling back to each spec's default. */
export function paramsOf(track: { rackParams?: Record<string, number> } | undefined, id: RackModuleId): Record<string, number> {
	const spec = moduleSpec(id);
	const stored = track?.rackParams ?? {};
	const out: Record<string, number> = {};
	for (const p of spec?.params ?? []) out[p.key] = stored[p.key] ?? p.def;
	return out;
}

export function setParam(key: string, value: number): void {
	const id = get(activeTrackId);
	const track = modularSynth.getTrack(id);
	modularSynth.updateTrack(id, { rackParams: { ...(track?.rackParams ?? {}), [key]: value } });
	refreshTracks();
}
