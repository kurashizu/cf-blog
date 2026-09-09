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
	group: 'SOURCE' | 'LOGIC' | 'SHAPE' | 'RESONATE' | 'MODULATE' | 'STEREO' | 'MATH' | 'METER' | 'UTILITY';
	color: string;
	descKey: string;
	inputs: PortSpec[];
	outputs: PortSpec[];
	params: ModuleParam[];
	/* A live picture of what the knobs are doing, like racks 1-7 carry: an
	   envelope drawn as its own curve says more than four numbers do. */
	viz?: 'adsr' | 'wave' | 'curve' | 'scope' | 'fft' | 'meter';
}

const AUDIO_IN: PortSpec = { id: 'in', label: 'IN', kind: 'audio' };
const AUDIO_OUT: PortSpec = { id: 'out', label: 'OUT', kind: 'audio' };

export const MODULE_SPECS: ModuleSpec[] = [
	/* SOURCE: things that make sound from nothing -- and the one thing that
	   brings sound in from outside the patch. */
	{
		id: 'in',
		label: 'ENTRY',
		group: 'SOURCE',
		color: '#98c379',
		descKey: 'synthPatch.mod.in',
		inputs: [],
		/* The note itself leaves by TRIG, so the logic chain can hang off it: a
		   cable from there to a WHEN node is "every time this sounds, ask
		   something". Audio leaves by OUT as usual. */
		outputs: [AUDIO_OUT, { id: 'trig', label: 'TRIG', kind: 'mod', role: 'trigger' }],
		params: [{ key: 'inLevel', label: 'LVL', min: 0, max: 200, step: 1, unit: '%', def: 100 }]
	},
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

	{
		id: 'sub',
		label: 'SUB',
		group: 'SOURCE',
		color: '#61afef',
		descKey: 'synthPatch.mod.sub',
		inputs: [],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'subWave', label: 'WAVE', min: 0, max: 3, step: 1, def: 0, choices: ['SIN', 'TRI', 'SAW', 'SQR'] },
			{ key: 'subOct', label: 'OCT', min: 1, max: 3, step: 1, def: 1 },
			{ key: 'subLevel', label: 'LVL', min: 0, max: 100, step: 1, unit: '%', def: 70 }
		]
	},
	{
		id: 'pulse',
		label: 'PULSE',
		group: 'SOURCE',
		color: '#c678dd',
		descKey: 'synthPatch.mod.pulse',
		inputs: [{ id: 'pwm', label: 'PWM', kind: 'mod' }],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'pw', label: 'PW', min: 5, max: 95, step: 1, unit: '%', def: 50 },
			{ key: 'pulseRatio', label: 'RATIO', min: 0.25, max: 8, step: 0.01, unit: '\u00d7', def: 1 },
			{ key: 'pulseLevel', label: 'LVL', min: 0, max: 100, step: 1, unit: '%', def: 80 }
		]
	},
	{
		id: 'bow',
		label: 'BOW',
		group: 'SOURCE',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.bow',
		inputs: [],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'bowPressure', label: 'PRES', min: 0, max: 100, step: 1, unit: '%', def: 50 },
			{ key: 'bowNoise', label: 'HAIR', min: 0, max: 100, step: 1, unit: '%', def: 25 },
			{ key: 'bowBite', label: 'BITE', min: 0, max: 100, step: 1, unit: '%', def: 40 },
			{ key: 'bowLevel', label: 'LVL', min: 0, max: 100, step: 1, unit: '%', def: 70 }
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
			{ key: 'type', label: 'TYPE', min: 0, max: 3, step: 1, def: 0, choices: ['LPF', 'BPF', 'HPF', 'NCH'] },
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
		id: 'blend',
		label: 'BLEND',
		group: 'SHAPE',
		color: '#56b6c2',
		descKey: 'synthPatch.mod.blend',
		inputs: [AUDIO_IN, { id: 'cv', label: 'CV', kind: 'mod' }],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'blendMix', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 50 },
			{ key: 'blendTone', label: 'TONE', min: 100, max: 8000, step: 50, unit: 'Hz', def: 800 }
		]
	},
	{
		id: 'reed',
		label: 'REED',
		group: 'SHAPE',
		color: '#e06c75',
		descKey: 'synthPatch.mod.reed',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'reedStiff', label: 'STIF', min: 0, max: 100, step: 1, unit: '%', def: 50 },
			{ key: 'reedBias', label: 'BIAS', min: 0, max: 100, step: 1, unit: '%', def: 40 }
		]
	},
	{
		id: 'comp',
		label: 'COMP',
		group: 'SHAPE',
		color: '#98c379',
		descKey: 'synthPatch.mod.comp',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'compThresh', label: 'THRS', min: -60, max: 0, step: 1, unit: 'dB', def: -18 },
			{ key: 'compRatio', label: 'RTO', min: 1, max: 20, step: 0.5, def: 4 },
			{ key: 'compAttack', label: 'ATK', min: 0, max: 100, step: 1, unit: 'ms', def: 5 },
			{ key: 'compRelease', label: 'REL', min: 10, max: 1000, step: 10, unit: 'ms', def: 120 }
		]
	},
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

	{
		id: 'comb',
		label: 'COMB',
		group: 'RESONATE',
		color: '#98c379',
		descKey: 'synthPatch.mod.comb',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'combPos', label: 'POS', min: 2, max: 50, step: 1, unit: '%', def: 25 },
			{ key: 'combDepth', label: 'DPTH', min: 0, max: 100, step: 1, unit: '%', def: 80 }
		]
	},
	{
		id: 'space',
		label: 'SPACE',
		group: 'RESONATE',
		color: '#61afef',
		descKey: 'synthPatch.mod.space',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'spaceSize', label: 'SIZE', min: 0, max: 100, step: 1, unit: '%', def: 40 },
			{ key: 'spaceDecay', label: 'DECY', min: 0, max: 100, step: 1, unit: '%', def: 60 },
			{ key: 'spaceMix', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 30 }
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
		id: 'delay',
		label: 'DELAY',
		group: 'UTILITY',
		color: '#d19a66',
		descKey: 'synthPatch.mod.delay',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'dlTime', label: 'TIME', min: 1, max: 2000, step: 1, unit: 'ms', def: 220 },
			{ key: 'dlFeedback', label: 'FDBK', min: 0, max: 85, step: 1, unit: '%', def: 35 },
			{ key: 'dlTone', label: 'TONE', min: 200, max: 12000, step: 100, unit: 'Hz', def: 6000 },
			{ key: 'dlMix', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 30 }
		]
	},
	{
		id: 'pan',
		label: 'PAN',
		group: 'STEREO',
		color: '#c678dd',
		descKey: 'synthPatch.mod.pan',
		inputs: [AUDIO_IN, { id: 'cv', label: 'CV', kind: 'mod' }],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'panPos', label: 'POS', min: -100, max: 100, step: 1, def: 0 },
			{ key: 'panDepth', label: 'DPTH', min: 0, max: 100, step: 1, unit: '%', def: 100 }
		]
	},
	{
		id: 'split',
		label: 'SPLIT',
		group: 'STEREO',
		color: '#56b6c2',
		descKey: 'synthPatch.mod.split',
		inputs: [AUDIO_IN],
		outputs: [
			{ id: 'out', label: 'L', kind: 'audio', role: 'left' },
			{ id: 'r', label: 'R', kind: 'audio', role: 'right' }
		],
		params: []
	},
	{
		id: 'merge',
		label: 'MERGE',
		group: 'STEREO',
		color: '#56b6c2',
		descKey: 'synthPatch.mod.merge',
		inputs: [
			{ id: 'in', label: 'L', kind: 'audio', role: 'left' },
			{ id: 'r', label: 'R', kind: 'audio', role: 'right' }
		],
		outputs: [AUDIO_OUT],
		params: []
	},
	{
		id: 'scope',
		label: 'SCOPE',
		group: 'METER',
		color: '#98c379',
		descKey: 'synthPatch.mod.scope',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [],
		viz: 'scope'
	},
	{
		id: 'fft',
		label: 'FFT',
		group: 'METER',
		color: '#61afef',
		descKey: 'synthPatch.mod.fft',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [],
		viz: 'fft'
	},
	{
		id: 'loud',
		label: 'LOUD',
		group: 'METER',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.loud',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [],
		viz: 'meter'
	},
	{
		/* WHEN: the condition half of the logic chain.
		
		   A cable from ENTRY's TRIG says "each time a note starts, ask this",
		   and what it asks is set by TEST -- always, or only for notes above or
		   below a pitch, or only when something is already sounding. It passes
		   the trigger on through DO when the answer is yes, which is what makes
		   the chain readable left to right: when a note starts, if it is above
		   C3, then mute the others. */
		id: 'when',
		label: 'WHEN',
		group: 'LOGIC',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.when',
		inputs: [{ id: 'trig', label: 'TRIG', kind: 'mod', role: 'trigger' }],
		outputs: [{ id: 'do', label: 'DO', kind: 'mod', role: 'flow' }],
		params: [
			{
				key: 'test',
				label: 'TEST',
				min: 0,
				max: 3,
				step: 1,
				def: 0,
				choices: ['ALWAYS', 'ABOVE', 'BELOW', 'BUSY']
			},
			{ key: 'testNote', label: 'NOTE', min: 0, max: 87, step: 1, def: 48 }
		]
	},
	{
		/* ACT: the action half. What to do when the WHEN before it says yes.
		
		   CUT stops everything else already sounding on this track, which is the
		   mute group written as a chain -- and being a chain it can be made
		   conditional, which a group number cannot. SOLO cuts everything except
		   this note's own group; GLIDE slides in from the last pitch instead of
		   striking. */
		id: 'act',
		label: 'ACT',
		group: 'LOGIC',
		color: '#e06c75',
		descKey: 'synthPatch.mod.act',
		inputs: [{ id: 'do', label: 'DO', kind: 'mod', role: 'flow' }],
		outputs: [],
		params: [
			{ key: 'action', label: 'DO', min: 0, max: 2, step: 1, def: 0, choices: ['CUT', 'SOLO', 'GLIDE'] },
			{ key: 'actGroup', label: 'GRP', min: 0, max: 4, step: 1, def: 0 },
			{ key: 'actMs', label: 'TIME', min: 0, max: 500, step: 5, unit: 'ms', def: 6 }
		]
	},
	{
		id: 'sum',
		label: 'SUM',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.sum',
		inputs: [AUDIO_IN, { id: 'b', label: 'B', kind: 'audio' }],
		outputs: [AUDIO_OUT],
		params: [{ key: 'sumGain', label: 'LVL', min: 0, max: 200, step: 1, unit: '%', def: 100 }]
	},
	{
		/* Not 'sub': that id is the sub-oscillator's, and a duplicate silently
		   shadowed this one -- the engine matched the oscillator and subtraction
		   never happened. */
		id: 'diff',
		label: 'DIFF',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.subtract',
		inputs: [{ id: 'in', label: 'A', kind: 'audio' }, { id: 'b', label: 'B', kind: 'audio' }],
		outputs: [AUDIO_OUT],
		params: [{ key: 'subAmount', label: 'AMT', min: 0, max: 200, step: 1, unit: '%', def: 100 }]
	},
	{
		id: 'ring',
		label: 'RING',
		group: 'MATH',
		color: '#c678dd',
		descKey: 'synthPatch.mod.ring',
		inputs: [{ id: 'in', label: 'A', kind: 'audio' }, { id: 'b', label: 'B', kind: 'audio' }],
		outputs: [AUDIO_OUT],
		params: [{ key: 'ringDepth', label: 'DPTH', min: 0, max: 200, step: 1, unit: '%', def: 100 }]
	},
	{
		id: 'invert',
		label: 'INV',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.invert',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: []
	},
	{
		id: 'out',
		label: 'OUT',
		group: 'UTILITY',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.out',
		inputs: [AUDIO_IN],
		outputs: [],
		params: [
			{ key: 'outMono', label: 'CHAN', min: 0, max: 1, step: 1, def: 0, choices: ['ST', 'MONO'] },
			{ key: 'outPan', label: 'PAN', min: -100, max: 100, step: 1, def: 0 },
			{ key: 'outLevel', label: 'LVL', min: 0, max: 200, step: 1, unit: '%', def: 100 }
		]
	},
	{
		id: 'mix',
		label: 'MIX',
		group: 'UTILITY',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.mix',
		inputs: [
			{ id: 'in', label: 'A', kind: 'audio' },
			{ id: 'b', label: 'B', kind: 'audio' }
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

/* ENTRY and OUTPUT are in every patch already and cannot be removed, so there
   is nothing to drag out of a palette -- but they still need their specs, since
   the canvas draws their ports and knobs from the same place as everything
   else. They are filtered out of the palette rather than deleted. */
/* Which port ids carry control rather than sound.
 *
 * Derived from the catalogue instead of written out, because the engine used to
 * keep its own hardcoded list -- ['fm','cv'] -- and it had fallen behind: pwm,
 * trig and do are all mod ports it classified as audio. A cable into PULSE's
 * PWM inlet went down the audio path, found that PULSE has no audio inlet, and
 * was dropped, so pulse-width modulation could not work at all; the WHEN/ACT
 * chain was being topologically sorted as though triggers were sound.
 *
 * One source of truth: a port is a mod port because its spec says so. */
export const MOD_PORT_IDS: ReadonlySet<string> = new Set(
	MODULE_SPECS.flatMap((m) => [
		...m.inputs.filter((p) => p.kind === 'mod').map((p) => p.id),
		...m.outputs.filter((p) => p.kind === 'mod').map((p) => p.id)
	])
);

export const FIXED_MODULE_IDS = new Set(['in', 'out']);

/** The modules a player can actually add. */
export const PALETTE_SPECS: ModuleSpec[] = MODULE_SPECS.filter((m) => !FIXED_MODULE_IDS.has(m.id));

/* Ordered the way a patch is read: what makes sound, what shapes it, what
   rings, what controls it, then the stereo work, the arithmetic, the meters and
   the plumbing. UTILITY had grown to twelve entries, which is not a category
   any more.

   No IO shelf: ENTRY and OUTPUT are in every patch already. */
export const MODULE_GROUPS: ModuleSpec['group'][] = [
	'SOURCE',
	'LOGIC',
	'SHAPE',
	'RESONATE',
	'MODULATE',
	'STEREO',
	'MATH',
	'METER',
	'UTILITY'
];
