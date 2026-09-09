import type { PortSpec } from './graph-model';

/**
 * The module catalogue for the patch bay.
 *
 * Each one is a synthesis primitive rather than a feature: an oscillator, an
 * envelope, a filter, a resonator. That is the difference between a modular and
 * a preset machine -- the interesting sounds come from wiring primitives in an
 * order nobody shipped, so the set is deliberately finer-grained than racks 1-7
 * and every entry does one thing.
 *
 * Racks 1-7 stay as they are: they are the same synth arranged for speed rather
 * than for exploration, and a player who wants knobs rather than cables should
 * not have to build a voice to get one.
 */
export interface ModuleParam {
	key: string;
	label: string;
	min: number;
	max: number;
	step: number;
	unit?: string;
	def: number;
	/* A parameter that selects rather than sweeps gets buttons instead of a
	   knob -- the same segmented row rack 3 uses for its filter types, because
	   "which one" reads badly as an angle. */
	choices?: string[];
}

export interface ModuleSpec {
	id: string;
	label: string;
	/** Which shelf of the palette it appears on. */
	group: 'SOURCE' | 'SHAPE' | 'RESONATE' | 'MODULATE' | 'UTILITY';
	color: string;
	descKey: string;
	inputs: PortSpec[];
	outputs: PortSpec[];
	params: ModuleParam[];
	/* A live picture of what the knobs are doing, like racks 1-7 carry: an
	   envelope drawn as its own curve says more than four numbers do. */
	viz?: 'adsr' | 'wave' | 'curve';
}

const AUDIO_IN: PortSpec = { id: 'in', label: 'IN', kind: 'audio' };
const AUDIO_OUT: PortSpec = { id: 'out', label: 'OUT', kind: 'audio' };

export const MODULE_SPECS: ModuleSpec[] = [
	/* SOURCE: things that make sound from nothing. */
	{
		id: 'osc',
		label: 'OSC',
		group: 'SOURCE',
		color: '#c678dd',
		descKey: 'synthPatch.mod.osc',
		inputs: [{ id: 'fm', label: 'FM', kind: 'mod' }],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'wave', label: 'WAVE', min: 0, max: 3, step: 1, def: 0, choices: ['SIN', 'SAW', 'SQR', 'TRI'] },
			{ key: 'ratio', label: 'RATIO', min: 0.25, max: 8, step: 0.01, unit: '×', def: 1 },
			{ key: 'detune', label: 'DET', min: -50, max: 50, step: 1, unit: 'c', def: 0 },
			{ key: 'level', label: 'LVL', min: 0, max: 100, step: 1, unit: '%', def: 80 }
		]
	},
	{
		id: 'noise',
		label: 'NOISE',
		group: 'SOURCE',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.noise',
		inputs: [],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'colour', label: 'COL', min: 0, max: 2, step: 1, def: 0 },
			{ key: 'level', label: 'LVL', min: 0, max: 100, step: 1, unit: '%', def: 60 }
		]
	},
	{
		id: 'excite',
		label: 'EXCT',
		group: 'SOURCE',
		color: '#e06c75',
		descKey: 'synthPatch.mod.excite',
		inputs: [],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'hardness', label: 'HARD', min: 0, max: 100, step: 1, unit: '%', def: 50 },
			{ key: 'exLength', label: 'LEN', min: 1, max: 60, step: 1, unit: 'ms', def: 6 },
			{ key: 'exTone', label: 'TONE', min: 200, max: 12000, step: 100, unit: 'Hz', def: 3000 }
		]
	},

	/* SHAPE: things that change a signal already flowing. */
	{
		id: 'filter',
		label: 'VCF',
		group: 'SHAPE',
		color: '#56b6c2',
		descKey: 'synthPatch.mod.filter',
		inputs: [AUDIO_IN, { id: 'fm', label: 'FM', kind: 'mod' }],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'type', label: 'TYPE', min: 0, max: 3, step: 1, def: 0, choices: ['LPF', 'BPF', 'HPF', 'NTCH'] },
			{ key: 'cutoff', label: 'FREQ', min: 40, max: 18000, step: 10, unit: 'Hz', def: 4000 },
			{ key: 'q', label: 'RESO', min: 0.1, max: 24, step: 0.1, def: 1 },
			{ key: 'depth', label: 'DEPTH', min: 0, max: 100, step: 1, unit: '%', def: 50 }
		]
	},
	{
		id: 'vca',
		label: 'VCA',
		group: 'SHAPE',
		color: '#98c379',
		descKey: 'synthPatch.mod.vca',
		inputs: [AUDIO_IN, { id: 'cv', label: 'CV', kind: 'mod' }],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'gain', label: 'GAIN', min: 0, max: 200, step: 1, unit: '%', def: 100 },
			{ key: 'depth', label: 'DEPTH', min: 0, max: 100, step: 1, unit: '%', def: 100 }
		]
	},
	{
		id: 'drive',
		label: 'DRIVE',
		group: 'SHAPE',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.drive',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'driveAmt', label: 'AMT', min: 0, max: 100, step: 1, unit: '%', def: 25 },
			{ key: 'driveBias', label: 'BIAS', min: 0, max: 100, step: 1, unit: '%', def: 30 },
			{ key: 'driveTone', label: 'TONE', min: 500, max: 16000, step: 100, unit: 'Hz', def: 8000 }
		]
	},
	{
		id: 'eq',
		label: 'EQ',
		group: 'SHAPE',
		color: '#61afef',
		descKey: 'synthPatch.mod.eq',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'lowGain', label: 'LOW', min: -18, max: 18, step: 0.5, unit: 'dB', def: 0 },
			{ key: 'midGain', label: 'MID', min: -18, max: 18, step: 0.5, unit: 'dB', def: 0 },
			{ key: 'midFreq', label: 'FREQ', min: 200, max: 8000, step: 50, unit: 'Hz', def: 1200 },
			{ key: 'highGain', label: 'HIGH', min: -18, max: 18, step: 0.5, unit: 'dB', def: 0 }
		]
	},

	/* RESONATE: the acoustic primitives -- what a body does to an excitation. */
	{
		id: 'string',
		label: 'STRING',
		group: 'RESONATE',
		color: '#98c379',
		descKey: 'synthPatch.mod.string',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'decayTime', label: 'DECAY', min: 0.05, max: 12, step: 0.05, unit: 's', def: 2 },
			{ key: 'damping', label: 'DAMP', min: 0, max: 100, step: 1, unit: '%', def: 30 },
			{ key: 'stiffness', label: 'STIFF', min: 0, max: 100, step: 1, unit: '%', def: 10 }
		]
	},
	{
		id: 'tube',
		label: 'TUBE',
		group: 'RESONATE',
		color: '#56b6c2',
		descKey: 'synthPatch.mod.tube',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'tubeDecay', label: 'DECAY', min: 0.05, max: 8, step: 0.05, unit: 's', def: 1.2 },
			{ key: 'tubeDamp', label: 'DAMP', min: 0, max: 100, step: 1, unit: '%', def: 40 },
			{ key: 'tubeOdd', label: 'ODD', min: 0, max: 100, step: 1, unit: '%', def: 100 }
		]
	},
	{
		id: 'modes',
		label: 'MODES',
		group: 'RESONATE',
		color: '#c678dd',
		descKey: 'synthPatch.mod.modes',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'mode1', label: 'M1', min: 0.5, max: 12, step: 0.01, unit: '×', def: 1 },
			{ key: 'mode2', label: 'M2', min: 0.5, max: 12, step: 0.01, unit: '×', def: 2.4 },
			{ key: 'mode3', label: 'M3', min: 0.5, max: 12, step: 0.01, unit: '×', def: 4.6 },
			{ key: 'modeQ', label: 'Q', min: 1, max: 60, step: 0.5, def: 14 }
		]
	},
	{
		id: 'body',
		label: 'BODY',
		group: 'RESONATE',
		color: '#d19a66',
		descKey: 'synthPatch.mod.body',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'bodySize', label: 'SIZE', min: 0, max: 100, step: 1, unit: '%', def: 50 },
			{ key: 'bodyDepth', label: 'DEPTH', min: 0, max: 100, step: 1, unit: '%', def: 45 },
			{ key: 'bodyMix', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 60 }
		]
	},

	/* MODULATE: sources of control rather than of sound. */
	{
		id: 'env',
		label: 'ENV',
		group: 'MODULATE',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.env',
		inputs: [],
		outputs: [{ id: 'cv', label: 'CV', kind: 'mod' }],
		params: [
			{ key: 'envA', label: 'A', min: 0, max: 4, step: 0.005, unit: 's', def: 0.005 },
			{ key: 'envD', label: 'D', min: 0, max: 6, step: 0.005, unit: 's', def: 0.2 },
			{ key: 'envS', label: 'S', min: 0, max: 100, step: 1, unit: '%', def: 60 },
			{ key: 'envR', label: 'R', min: 0, max: 8, step: 0.005, unit: 's', def: 0.2 }
		],
		viz: 'adsr'
	},
	{
		id: 'lfo',
		label: 'LFO',
		group: 'MODULATE',
		color: '#e06c75',
		descKey: 'synthPatch.mod.lfo',
		inputs: [{ id: 'fm', label: 'FM', kind: 'mod' }],
		outputs: [{ id: 'cv', label: 'CV', kind: 'mod' }],
		params: [
			{ key: 'lfoWave', label: 'WAVE', min: 0, max: 3, step: 1, def: 0, choices: ['SIN', 'SAW', 'SQR', 'TRI'] },
			{ key: 'lfoRate', label: 'RATE', min: 0.02, max: 40, step: 0.01, unit: 'Hz', def: 5 },
			{ key: 'lfoAmt', label: 'AMT', min: 0, max: 100, step: 1, unit: '%', def: 50 }
		],
		viz: 'wave'
	},

	/* UTILITY: the plumbing a patch needs once it stops being a straight line. */
	{
		id: 'mix',
		label: 'MIX',
		group: 'UTILITY',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.mix',
		inputs: [
			{ id: 'in', label: 'A', kind: 'audio' },
			{ id: 'in2', label: 'B', kind: 'audio' }
		],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'mixA', label: 'A', min: 0, max: 100, step: 1, unit: '%', def: 100 },
			{ key: 'mixB', label: 'B', min: 0, max: 100, step: 1, unit: '%', def: 100 }
		]
	}
];

export function moduleSpec(id: string): ModuleSpec | undefined {
	return MODULE_SPECS.find((m) => m.id === id);
}

export const MODULE_GROUPS: ModuleSpec['group'][] = ['SOURCE', 'SHAPE', 'RESONATE', 'MODULATE', 'UTILITY'];
