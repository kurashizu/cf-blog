import type { PortSpec, PortRole } from './graph-model';

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
	/* Typed rather than turned.
	
	   A dial answers "how much", by feel, and that is most of an instrument. A
	   literal is the other thing: CONST's job is to say 440, or 0.75, or 48, and
	   spelling that out on a 26px dial spanning four million positions is not
	   possible at all. Numbers you know in advance are typed. */
	field?: boolean;
	/* Read once, when the note starts, and not modulatable.
	
	   Most knobs are AudioParams and a cable into one is heard immediately. Some
	   are not: STRING's DECAY shapes a bank of oscillator envelopes built for
	   this note, SPACE's SIZE is the length of a buffer generated at build,
	   REED's STIFF is the shape of a waveshaper curve. There is no param to
	   connect to, so a cable there could only be read as a number at the moment
	   the note begins.
	
	   Marking them means the canvas stops offering them as modulation targets --
	   it used to offer whichever knob happened to be declared first, which is
	   how SEQ's GAP and SCOPE's SPAN were suggested as places to send an
	   envelope. It is a real constraint, not an oversight, so it is written
	   down rather than quietly wrong. */
	fixed?: boolean;
	/* How the knob's angle maps to its value.
	
	   `linear` is the default and right for most things. `log` is for the
	   multiplying ones -- a ratio, a rate, anything where halving and doubling
	   are the same size of change. On a linear knob a RATIO of 0.25..8 puts 1x a
	   tenth of the way round, so every useful interval is crushed into the first
	   sliver of travel and the whole upper half is octaves nobody reaches for.
	   Logarithmic puts 1x in the middle, an octave down at a quarter turn left
	   and an octave up at a quarter turn right, which is how the ear hears it. */
	scale?: 'linear' | 'log';
}

export interface ModuleSpec {
	id: string;
	label: string;
	/** Which shelf of the palette it appears on. */
	group:
		| 'SOURCE'
		| 'LOGIC'
		| 'SHAPE'
		| 'RESONATE'
		| 'MODULATE'
		| 'STEREO'
		| 'MATH'
		/* Changing what a value *is* rather than what it equals. Kept apart from
		   MATH because that is the distinction the type system exists to make:
		   nothing converts a pitch to a frequency implicitly, so the nodes that
		   do it should be easy to find rather than buried among the operators. */
		| 'CONVERT'
		| 'METER'
		| 'UTILITY';
	color: string;
	descKey: string;
	inputs: PortSpec[];
	outputs: PortSpec[];
	params: ModuleParam[];
	/* A live picture of what the knobs are doing, like racks 1-7 carry: an
	   envelope drawn as its own curve says more than four numbers do. */
	viz?: 'adsr' | 'wave' | 'curve' | 'scope' | 'fft' | 'meter';
}

const CV_A: PortSpec = { id: 'a', label: 'A', kind: 'mod' };
const CV_B: PortSpec = { id: 'b', label: 'B', kind: 'mod' };
const CV_OUT: PortSpec = { id: 'out', label: 'OUT', kind: 'mod' };
/* What each CONST variant emits: the role its outlet takes, and the range the
   value field allows. A pitch runs to 20 kHz and a velocity stops at 1, which is
   the whole reason the variants exist -- one untyped number with a -1000..10000
   range could be wired anywhere and was useful nowhere. */
export const CONST_KINDS: { label: string; role: PortRole; min: number; max: number; step: number; def: number; unit?: string }[] = [
	{ label: 'NUM', role: 'cv', min: -1000, max: 10000, step: 0.01, def: 1 },
	{ label: 'PITCH', role: 'hz', min: 20, max: 20000, step: 1, def: 440, unit: 'Hz' },
	{ label: 'VEL', role: 'unit', min: 0, max: 1, step: 0.01, def: 1 },
	{ label: 'NOTE', role: 'index', min: 0, max: 127, step: 1, def: 48 },
	{ label: 'TIME', role: 'time', min: 0, max: 60, step: 0.001, def: 0.5, unit: 's' }
];

const AUDIO_IN: PortSpec = { id: 'in', label: 'IN', kind: 'audio' };

/* Blueprint's white execution pins.
 *
 * A module with an EXEC_IN is *impure* in Blueprint's sense: running it does
 * something -- a source starts sounding, an envelope begins its curve. It runs
 * when execution reaches it and not otherwise, which is what makes a cable
 * carry meaning.
 *
 * EXEC_OUT is the narrower one: ENTRY, SEQ and WHEN, and nothing else. A THEN
 * pin says "and afterwards, this", and only those three have an afterwards to
 * hand on -- the event fires, the sequence steps, the branch answers.
 *
 * No sound module has either pin. THEN is logic and takes no part in the signal
 * path: audio runs because audio is wired into it, so an exec pin on an OSC
 * would be a second cable required to say what the first already said, with
 * silence as the penalty for drawing only the obvious one.
 *
 * This comment used to name EXCT, MODES and ENV as the three -- from an earlier
 * design where a strike landing was an event you could hang a THEN off. None of
 * them has carried one since; the list was left describing a shape the
 * catalogue no longer had. */
const EXEC_IN: PortSpec = { id: 'exec', label: '', kind: 'exec', role: 'exec' };
const EXEC_OUT: PortSpec = { id: 'then', label: '', kind: 'exec', role: 'exec' };
const AUDIO_OUT: PortSpec = { id: 'out', label: 'OUT', kind: 'audio' };

/**
 * The oscillator shapes, in the one order everything indexes.
 *
 * The button labels, the engine's `OscillatorType` table and the card's preview
 * drawing were three hand-written copies of this list, and they disagreed:
 * picking SAW gave a triangle, and the card drew a square while the engine
 * played a sawtooth. Two were corrected once and the third was missed, because
 * nothing tied them together. Index this instead of retyping it.
 */
export const WAVE_SHAPES = [
	{ label: 'SIN', type: 'sine' },
	{ label: 'TRI', type: 'triangle' },
	{ label: 'SAW', type: 'sawtooth' },
	{ label: 'SQR', type: 'square' }
] as const;

/** Just the labels, for a `choices` list. */
export const WAVE_LABELS: string[] = WAVE_SHAPES.map((w) => w.label);

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
		/* Blueprint's event node: pressing a key is the event, and THEN is the
		   white pin the rest of the patch hangs off. Whatever THEN reaches runs
		   for this note; whatever it does not reach stays silent.
		
		   TRIG is the older logic pin and stays: a cable from there to a WHEN
		   node asks a question about the note rather than running a module.
		   Audio leaves by OUT as usual. */
		/* No audio outlet. ADV is a complete signal path in its own right and
		   has nothing to do with racks 1-7 -- they are two instruments, and a
		   socket handing one into the other would only invite the confusion the
		   split exists to remove. What the canvas says is what plays. */
		outputs: [
			EXEC_OUT,
			/* What the key press was. Blueprint's event nodes hand you the data
			   the event carried, and these are a note's: which key, how hard, how
			   long. Velocity reached the amp gain and nothing else before this,
			   so a patch could not say "struck harder means brighter" -- which is
			   what every struck instrument does, and why a kit built on one graph
			   sounded like one drum at different pitches. */
			{ id: 'pitch', label: 'PITCH', kind: 'mod', role: 'pitch' },
			{ id: 'vel', label: 'VEL', kind: 'mod', role: 'unit' },
			{ id: 'note', label: 'NOTE', kind: 'mod', role: 'index' },
			{ id: 'gate', label: 'GATE', kind: 'mod', role: 'time' }
		],
		params: []
	},
	{
		id: 'osc',
		label: 'OSC',
		group: 'SOURCE',
		color: '#c678dd',
		descKey: 'synthPatch.mod.osc',
		/* An oscillator, and only that: a shape and a frequency.
		
		   Everything else it used to carry was another primitive in disguise.
		   RATIO multiplied the pitch, which is MUL. DET did the same in cents.
		   LVL scaled the output, which is VCA. FM was an inlet that multiplied
		   what arrived by the note frequency times two -- a depth control that
		   appeared on no card at all.
		
		   PITCH is a cable rather than a given, so the keyboard is something you
		   wire rather than something that happens: unpatched, the oscillator
		   sits at its own frequency, which is what makes a drone or an untuned
		   drum expressible. And because PITCH is an AudioParam, a signal into it
		   *is* FM -- adding to a frequency is the whole definition -- with a VCA
		   in front of it as the depth. */
		inputs: [{ id: 'pitch', label: 'FREQ', kind: 'mod', role: 'hz' }],
		outputs: [AUDIO_OUT],
		params: [
			/* In the engine's order, which is also harmonic order: a sine has no
			   partials, a triangle has weak odd ones, a square strong odd ones, a
			   sawtooth all of them. The labels used to read SIN/SAW/SQR/TRI over
			   that same table, so three of the four buttons named a wave other
			   than the one they selected. */
			{ key: 'wave', label: 'WAVE', min: 0, max: 3, step: 1, def: 0, choices: WAVE_LABELS }
		]
	},
	{
		/* No LVL knob. A level on a source is a VCA welded to it -- the same
		   knob OSC lost -- and it gave "why is this quiet" a second place to
		   hide. Put a VCA after it. */
		id: 'noise',
		label: 'NOISE',
		group: 'SOURCE',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.noise',
		inputs: [],
		outputs: [AUDIO_OUT],
		params: [
			/* Three kinds of noise, not a sweep: a dial reading "0", "1", "2"
			   says nothing about which is which. */
			{ key: 'colour', label: 'COL', min: 0, max: 2, step: 1, def: 0, choices: ['WHT', 'PNK', 'BRN'] }
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
			{ key: 'hardness', label: 'HARD', min: 0, max: 100, step: 1, unit: '%', def: 50, fixed: true },
			{ key: 'exLength', label: 'LEN', min: 1, max: 60, step: 1, unit: 'ms', def: 6, fixed: true },
			{ key: 'exTone', label: 'TONE', min: 200, max: 12000, step: 100, unit: 'Hz', def: 3000, scale: 'log' }
		]
	},

	{
		/* No LVL knob. A level on a source is a VCA welded to it -- the same
		   knob OSC lost -- and it gave "why is this quiet" a second place to
		   hide. Put a VCA after it. */
		id: 'sub',
		label: 'SUB',
		group: 'SOURCE',
		color: '#61afef',
		descKey: 'synthPatch.mod.sub',
		inputs: [{ id: 'pitch', label: 'FREQ', kind: 'mod', role: 'hz' }],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'subWave', label: 'WAVE', min: 0, max: 3, step: 1, def: 0, choices: WAVE_LABELS },
			{ key: 'subOct', label: 'OCT', min: 1, max: 3, step: 1, def: 1, fixed: true }
		]
	},
	{
		/* No LVL knob. A level on a source is a VCA welded to it -- the same
		   knob OSC lost -- and it gave "why is this quiet" a second place to
		   hide. Put a VCA after it. */
		id: 'pulse',
		label: 'PULSE',
		group: 'SOURCE',
		color: '#c678dd',
		descKey: 'synthPatch.mod.pulse',
		inputs: [{ id: 'pitch', label: 'PITCH', kind: 'mod', role: 'hz' }, { id: 'pwm', label: 'PWM', kind: 'mod' }],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'pw', label: 'PW', min: 5, max: 95, step: 1, unit: '%', def: 50, fixed: true }
		]
	},
	{
		/* No LVL knob. A level on a source is a VCA welded to it -- the same
		   knob OSC lost -- and it gave "why is this quiet" a second place to
		   hide. Put a VCA after it. */
		id: 'bow',
		label: 'BOW',
		group: 'SOURCE',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.bow',
		inputs: [{ id: 'pitch', label: 'FREQ', kind: 'mod', role: 'hz' }],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'bowPressure', label: 'PRES', min: 0, max: 100, step: 1, unit: '%', def: 50, fixed: true },
			{ key: 'bowNoise', label: 'HAIR', min: 0, max: 100, step: 1, unit: '%', def: 25, fixed: true },
			{ key: 'bowBite', label: 'BITE', min: 0, max: 100, step: 1, unit: '%', def: 40, fixed: true }
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
			{ key: 'cutoff', label: 'FREQ', min: 40, max: 18000, step: 10, unit: 'Hz', def: 4000, scale: 'log' },
			{ key: 'q', label: 'RESO', min: 0.1, max: 24, step: 0.1, def: 1 },
			/* How far the FM inlet swings the cutoff, in hertz. It read as a
			   percentage and was multiplied by FREQ, so turning the cutoff up
			   also widened the sweep -- one knob quietly scaling another. */
			{ key: 'depth', label: 'DEPTH', min: 0, max: 12000, step: 10, unit: 'Hz', def: 2000 }
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
			/* One knob. DEPTH scaled the CV on its way in -- a second VCA on
			   the first one's control leg -- so a quiet patch had two places to
			   hide. Attenuate a CV where it comes from: LFO has AMT. */
			{ key: 'gain', label: 'GAIN', min: 0, max: 200, step: 1, unit: '%', def: 100 }
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
			{ key: 'driveAmt', label: 'AMT', min: 0, max: 100, step: 1, unit: '%', def: 25, fixed: true },
			{ key: 'driveBias', label: 'BIAS', min: 0, max: 100, step: 1, unit: '%', def: 30, fixed: true },
			{ key: 'driveTone', label: 'TONE', min: 500, max: 16000, step: 100, unit: 'Hz', def: 8000, scale: 'log', fixed: true }
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
			/* The shelf corners were hardcoded at 200 and 5000, so two of the
			   three bands could only be turned up, never aimed. */
			{ key: 'lowFreq', label: 'L.HZ', min: 40, max: 1000, step: 10, unit: 'Hz', def: 200, scale: 'log' },
			{ key: 'midGain', label: 'MID', min: -18, max: 18, step: 0.5, unit: 'dB', def: 0 },
			{ key: 'midFreq', label: 'M.HZ', min: 200, max: 8000, step: 50, unit: 'Hz', def: 1200, scale: 'log' },
			{ key: 'midQ', label: 'M.Q', min: 0.2, max: 12, step: 0.1, def: 1 },
			{ key: 'highGain', label: 'HIGH', min: -18, max: 18, step: 0.5, unit: 'dB', def: 0 },
			{ key: 'highFreq', label: 'H.HZ', min: 1500, max: 16000, step: 100, unit: 'Hz', def: 5000, scale: 'log' }
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
			{ key: 'blendMix', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 50, fixed: true },
			{ key: 'blendTone', label: 'TONE', min: 100, max: 8000, step: 50, unit: 'Hz', def: 800, scale: 'log' }
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
			{ key: 'reedStiff', label: 'STIF', min: 0, max: 100, step: 1, unit: '%', def: 50, fixed: true },
			{ key: 'reedBias', label: 'BIAS', min: 0, max: 100, step: 1, unit: '%', def: 40, fixed: true }
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
			/* Makeup. A compressor that can only make things quieter is half a
			   module: the point of holding a transient down is that the rest
			   comes up. The engine read this all along; nothing declared it, so
			   it sat at 0 dB and could not be reached. */
			{ key: 'compGain', label: 'GAIN', min: 0, max: 24, step: 0.5, unit: 'dB', def: 0, fixed: true },
			{ key: 'compRelease', label: 'REL', min: 10, max: 1000, step: 10, unit: 'ms', def: 120 }
		]
	},
	{
		id: 'string',
		label: 'STRING',
		group: 'RESONATE',
		color: '#98c379',
		descKey: 'synthPatch.mod.string',
		inputs: [{ id: 'pitch', label: 'FREQ', kind: 'mod', role: 'hz' }, AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'decayTime', label: 'DECAY', min: 0.05, max: 12, step: 0.05, unit: 's', def: 2, fixed: true },
			{ key: 'damping', label: 'DAMP', min: 0, max: 100, step: 1, unit: '%', def: 30, fixed: true },
			{ key: 'stiffness', label: 'STIFF', min: 0, max: 100, step: 1, unit: '%', def: 10, fixed: true },
			/* How much of what arrives is replaced by the string ringing.
			
			   The engine read this all along and nothing declared it, so it was
			   always undefined, always 100%, and the dry gain was always 0 --
			   which meant the AUDIO IN socket was structurally discarded. A
			   patch heard the same sine bank whether the strike was wired in or
			   not. Same knob MODES has, for the same reason. */
			{ key: 'strBlend', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 70, fixed: true }
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
			{ key: 'tubeDecay', label: 'DECAY', min: 0.05, max: 8, step: 0.05, unit: 's', def: 1.2, fixed: true },
			{ key: 'tubeDamp', label: 'DAMP', min: 0, max: 100, step: 1, unit: '%', def: 40, fixed: true },
			/* Which partials sound. A cylinder closed at one end has no even
			   harmonics -- that is a clarinet -- and a knob with 101 positions
			   and two outcomes was a switch wearing a dial. */
			{ key: 'tubeOdd', label: 'ODD', min: 0, max: 1, step: 1, def: 1, choices: ['ALL', 'ODD'] },
			/* See STRING's MIX: read by the engine, declared nowhere, so TUBE's
			   AUDIO IN was discarded too. */
			{ key: 'tubeMix', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 70, fixed: true }
		]
	},
	{
		id: 'modes',
		label: 'MODES',
		group: 'RESONATE',
		color: '#c678dd',
		descKey: 'synthPatch.mod.modes',
		inputs: [{ id: 'pitch', label: 'FREQ', kind: 'mod', role: 'hz' }, AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'mode1', label: 'M1', min: 0.5, max: 12, step: 0.01, unit: '×', def: 1, fixed: true },
			{ key: 'mode2', label: 'M2', min: 0.5, max: 12, step: 0.01, unit: '×', def: 2.4, fixed: true },
			{ key: 'mode3', label: 'M3', min: 0.5, max: 12, step: 0.01, unit: '×', def: 4.6, fixed: true },
			{ key: 'modeQ', label: 'Q', min: 1, max: 60, step: 0.5, def: 14, fixed: true },
			/* How much of what arrives is replaced by the body ringing. The
			   engine read this all along and nothing declared it, so the balance
			   between a strike and the thing it strikes had no knob. */
			{ key: 'modeMix', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 70, fixed: true },
			/* The pitch the ratios multiply. 0 follows the key, which is what a
			   marimba wants; any other value pins the resonator to that frequency
			   however it was struck, which is what a drum is -- a kick is 55 Hz
			   whether you hit it from C2 or C5, and in K.MAP the key chooses which
			   instrument sounds rather than what note it plays. */
			/* Up to the top of hearing, because struck bars go there: the kit's
			   triangle is a 4200 Hz body and its click is 2500, both of which
			   were silently clamped to 2000 -- the knob could not reach the
			   value the preset asked for, so those keys never sounded as
			   written. */
			{ key: 'modeHz', label: 'HZ', min: 0, max: 16000, step: 1, unit: 'Hz', def: 0, fixed: true }
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
			{ key: 'bodySize', label: 'SIZE', min: 0, max: 100, step: 1, unit: '%', def: 50, fixed: true },
			{ key: 'bodyDepth', label: 'DEPTH', min: 0, max: 100, step: 1, unit: '%', def: 45, fixed: true },
			{ key: 'bodyMix', label: 'MIX', min: 0, max: 100, step: 1, unit: '%', def: 60, fixed: true }
		]
	},

	{
		id: 'comb',
		label: 'COMB',
		group: 'RESONATE',
		color: '#98c379',
		descKey: 'synthPatch.mod.comb',
		inputs: [{ id: 'pitch', label: 'FREQ', kind: 'mod', role: 'hz' }, AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'combPos', label: 'POS', min: 2, max: 50, step: 1, unit: '%', def: 25, fixed: true },
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
		outputs: [{ id: 'out', label: 'OUT', kind: 'audio', role: 'stereo' }],
		params: [
			{ key: 'spaceSize', label: 'SIZE', min: 0, max: 100, step: 1, unit: '%', def: 40, fixed: true },
			{ key: 'spaceDecay', label: 'DECY', min: 0, max: 100, step: 1, unit: '%', def: 60, fixed: true },
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
			{ key: 'envA', label: 'A', min: 0, max: 4, step: 0.005, unit: 's', def: 0.005, fixed: true },
			{ key: 'envD', label: 'D', min: 0, max: 6, step: 0.005, unit: 's', def: 0.2, fixed: true },
			{ key: 'envS', label: 'S', min: 0, max: 100, step: 1, unit: '%', def: 60, fixed: true },
			{ key: 'envR', label: 'R', min: 0, max: 8, step: 0.005, unit: 's', def: 0.2, fixed: true }
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
			{ key: 'lfoWave', label: 'WAVE', min: 0, max: 3, step: 1, def: 0, choices: WAVE_LABELS },
			{ key: 'lfoRate', label: 'RATE', min: 0.02, max: 40, step: 0.01, unit: 'Hz', def: 5, scale: 'log' },
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
			{ key: 'dlTone', label: 'TONE', min: 200, max: 12000, step: 100, unit: 'Hz', def: 6000, scale: 'log' },
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
		outputs: [{ id: 'out', label: 'OUT', kind: 'audio', role: 'stereo' }],
		params: [
			{ key: 'panPos', label: 'POS', min: -100, max: 100, step: 1, def: 0 }

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
		outputs: [{ id: 'out', label: 'OUT', kind: 'audio', role: 'stereo' }],
		params: []
	},
	{
		/* A meter observes; it does not process.
		
		   These used to pass their input through, so a patch could be built with
		   one in the middle of the chain -- which reads as though looking at a
		   signal were a stage in making it. Tap the signal instead: run a cable
		   from wherever you want to look, and the meter is a leaf. That is also
		   what makes it impossible to break a patch by adding one. */
		id: 'scope',
		label: 'SCOPE',
		group: 'METER',
		color: '#98c379',
		descKey: 'synthPatch.mod.scope',
		inputs: [AUDIO_IN],
		outputs: [],
		params: [
			{ key: 'scopeSpan', label: 'SPAN', min: 1, max: 100, step: 1, unit: 'ms', def: 20, scale: 'log', fixed: true },
			{ key: 'scopeGain', label: 'GAIN', min: 0, max: 40, step: 1, unit: 'dB', def: 0, fixed: true }
		],
		viz: 'scope'
	},
	{
		id: 'fft',
		label: 'FFT',
		group: 'METER',
		color: '#61afef',
		descKey: 'synthPatch.mod.fft',
		inputs: [AUDIO_IN],
		outputs: [],
		params: [
			{ key: 'fftFloor', label: 'FLOOR', min: -120, max: -30, step: 1, unit: 'dB', def: -90, fixed: true },
			{ key: 'fftSmooth', label: 'SMTH', min: 0, max: 95, step: 5, unit: '%', def: 20, fixed: true }
		],
		viz: 'fft'
	},
	{
		id: 'loud',
		label: 'LOUD',
		group: 'METER',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.loud',
		inputs: [AUDIO_IN],
		outputs: [],
		params: [
			{ key: 'loudSmooth', label: 'SMTH', min: 0, max: 95, step: 5, unit: '%', def: 60, fixed: true }
		],
		viz: 'meter'
	},
	{
		/* Blueprint's Sequence, which is the one exec node a patch cannot do
		   without: one input, several outputs, run in order. Here the order is a
		   gap in milliseconds rather than a sequence point, because audio has no
		   "afterwards" -- two strikes at the same instant are one strike. A few
		   milliseconds apart is a flam, a grace note, or the two layers a
		   sampled kick is built from, which is what drummers actually play. */
		id: 'seq',
		label: 'SEQ',
		group: 'LOGIC',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.seq',
		inputs: [EXEC_IN],
		outputs: [EXEC_OUT],
		params: [{ key: 'gapMs', label: 'GAP', min: 0, max: 200, step: 1, unit: 'ms', def: 0, fixed: true }]
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
		inputs: [EXEC_IN],
		outputs: [{ id: 'then', label: 'TRUE', kind: 'exec', role: 'exec' }],
		params: [
			{
				key: 'test',
				label: 'TEST',
				min: 0,
				max: 3,
				step: 1,
				def: 0,
				/* Three or four characters, like every other selector here. The
				   cells are a fixed width so a row of them lines up, and longer
				   words were being cut to "ALW..." -- which is not a label. */
				choices: ['ANY', 'ABV', 'BLW', 'BUSY']
			},
			{ key: 'testNote', label: 'NOTE', min: 0, max: 87, step: 1, def: 48, fixed: true }
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
		inputs: [EXEC_IN],
		outputs: [],
		params: [
			/* GLIDE was a third choice and did nothing: it set a field on the
			   result that nothing read. Glide is rack 2's `glideTime`, and ADV
			   does not answer to racks 1-7 -- so there was nowhere for it to
			   land, and wiring it across would break the isolation on purpose.
			   A choice the engine cannot honour is worse than a missing one. */
			{ key: 'action', label: 'DO', min: 0, max: 1, step: 1, def: 0, choices: ['CUT', 'SOLO'] },
			/* ACT builds to no audio node, so there is nothing for a cable to
			   reach. Without this flag `landingOn` offered ACT as the drop target
			   for any value cable dragged into empty space, and the cable was
			   drawn and carried nothing. */
			{ key: 'actGroup', label: 'GRP', min: 0, max: 4, step: 1, def: 0, fixed: true },
			{ key: 'actMs', label: 'TIME', min: 0, max: 500, step: 5, unit: 'ms', def: 6, fixed: true }
		]
	},
	{
		/* A + B, and nothing else. The LVL knob that used to sit here was a VCA
		   welded onto an adder: two primitives in one box, so "why is this patch
		   quiet" had a second place to hide. Scaling is what VCA is for. */
		id: 'sum',
		label: 'SUM',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.sum',
		inputs: [AUDIO_IN, { id: 'b', label: 'B', kind: 'audio' }],
		outputs: [AUDIO_OUT],
		params: []
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
		// A - B. Scaling the result is VCA's job, as it is for SUM.
		params: []
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
		/* Blueprint's Break Vector, for sound.
		 *
		 * SPLIT next to this takes a stereo pair apart into two audio cables --
		 * two signals you go on processing. This takes a signal apart into the
		 * numbers that describe it: how loud it is, and how far left or right it
		 * sits. Those are values, so they drive knobs.
		 *
		 * The pair is the distinction the pure nodes draw everywhere else: a
		 * channel is sound, a level is a number, and a patch needs both -- "make
		 * the filter follow how loud this is" cannot be said with an audio cable,
		 * because a knob does not take sound. */
		id: 'break',
		label: 'BREAK',
		group: 'STEREO',
		color: '#56b6c2',
		descKey: 'synthPatch.mod.break',
		inputs: [AUDIO_IN],
		outputs: [
			{ id: 'mid', label: 'MID', kind: 'audio', role: 'mono' },
			{ id: 'side', label: 'SIDE', kind: 'audio', role: 'mono' },
			{ id: 'out', label: 'AMP', kind: 'mod' }
		],
		params: []
	},
	{
		/* Blueprint's Make Vector: the parts back into one thing. Mid and side
		   rather than left and right, because that is the pair worth rebuilding
		   by hand -- widening is a gain on the side, and there is no other way
		   to say it. */
		id: 'make',
		label: 'MAKE',
		group: 'STEREO',
		color: '#56b6c2',
		descKey: 'synthPatch.mod.make',
		inputs: [
			{ id: 'in', label: 'MID', kind: 'audio', role: 'mono' },
			{ id: 'b', label: 'SIDE', kind: 'audio', role: 'mono' },
			{ id: 'wide', label: 'WIDE', kind: 'mod', role: 'unit' }
		],
		outputs: [{ id: 'out', label: 'OUT', kind: 'audio', role: 'stereo' }],
		/* No WIDE knob beside the WIDE socket: the knob stopped mattering the
		   moment a cable was drawn. The socket's own default is the width. */
		params: []
	},
	{
		/* Two channels down to one. A stereo source into a mono chain otherwise
		   keeps only whatever the next module happens to take. */
		id: 'mono',
		label: 'MONO',
		group: 'STEREO',
		color: '#56b6c2',
		descKey: 'synthPatch.mod.mono',
		inputs: [AUDIO_IN],
		outputs: [{ id: 'out', label: 'OUT', kind: 'audio', role: 'mono' }],
		params: []
	},
	{
		/* A pitch made into the frequency it names.
		 *
		 * Exact, and the direction you nearly always want: ENTRY publishes a
		 * pitch, an oscillator needs a frequency, and this is the step between.
		 * It is a node rather than something an oscillator does quietly because
		 * the tuning reference is a decision -- A4 is 440 Hz by convention, not
		 * by nature -- and a patch should be able to say it took a different
		 * one. */
		id: 'tofreq',
		label: 'TO-FREQ',
		group: 'CONVERT',
		color: '#61afef',
		descKey: 'synthPatch.mod.tofreq',
		inputs: [{ id: 'a', label: 'PITCH', kind: 'mod', role: 'pitch' }],
		outputs: [{ id: 'out', label: 'FREQ', kind: 'mod', role: 'hz' }],
		params: [
			{ key: 'tuning', label: 'A4', min: 400, max: 480, step: 0.5, unit: 'Hz', def: 440 },
			{ key: 'shift', label: 'TRSP', min: -48, max: 48, step: 1, unit: 'st', def: 0 }
		]
	},
	{
		/* A frequency read back as the pitch nearest to it.
		 *
		 * The lossy direction. 452 Hz is not a pitch; it is between two, and
		 * which one it becomes depends on the reference and on where you round.
		 * Both are knobs here rather than assumptions, and the quantisation is
		 * visible on the canvas -- which is the whole reason the two are separate
		 * types and this is a separate node. */
		id: 'topitch',
		label: 'TO-PITCH',
		group: 'CONVERT',
		color: '#61afef',
		descKey: 'synthPatch.mod.topitch',
		inputs: [{ id: 'a', label: 'FREQ', kind: 'mod', role: 'hz' }],
		outputs: [{ id: 'out', label: 'PITCH', kind: 'mod', role: 'pitch' }],
		params: [
			{ key: 'tuning', label: 'A4', min: 400, max: 480, step: 0.5, unit: 'Hz', def: 440 },
			{ key: 'quantise', label: 'QNT', min: 0, max: 1, step: 1, def: 1, choices: ['OFF', 'SEMI'] }
		]
	},
	{
		/* Blueprint's pure value nodes.
		 *
		 * Everything below computes a number from its inputs and holds no state,
		 * so none of them carry exec pins -- asking when a multiply "runs" has no
		 * answer, exactly as in Blueprint. They exist because ENTRY now publishes
		 * the note's own facts (pitch, velocity, gate) and a patch needs to do
		 * arithmetic on them: half the velocity, add a fixed offset, clamp the
		 * result, then send it at a knob.
		 *
		 * These are control-rate, not audio-rate. SUM and DIFF next to them add
		 * signals; these add values. The distinction is the same one Web Audio
		 * makes between a node's input and its AudioParam, and keeping both is
		 * what lets a patch treat a number as a number. */
		/* A literal, in whichever type the socket it is going to expects.
		 *
		 * One node with variants rather than five near-identical ones: a pitch,
		 * an amount and a length of time are the same idea -- a number you typed
		 * -- and splitting them into separate palette entries would say they were
		 * different things. The variant picks the socket's colour and shape, so a
		 * CONST wired into a frequency looks like a frequency and cannot be
		 * dropped onto something that wanted an amount.
		 *
		 * The type sits in the title bar rather than among the knobs because it
		 * is what the node *is*, not what it is set to -- the same reason a
		 * Blueprint literal shows its type on the node and its value in the
		 * field. */
		id: 'const',
		label: 'CONST',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.const',
		inputs: [],
		outputs: [CV_OUT],
		params: [
			/* Which kind of number this is. It retypes the outlet, so a pitch
			   constant carries a pitch socket and will not drop onto an inlet
			   that wanted an amount -- see CONST_KINDS. */
			{ key: 'kind', label: 'TYPE', min: 0, max: 4, step: 1, def: 0, choices: ['NUM', 'PITCH', 'VEL', 'NOTE', 'TIME'] },
			{ key: 'value', label: 'VAL', min: -20000, max: 20000, step: 0.01, def: 1, field: true }
		]
	},
	{
		id: 'add',
		label: 'ADD',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.add',
		inputs: [CV_A, CV_B],
		outputs: [CV_OUT],
		params: [{ key: 'addB', label: 'B', min: -1000, max: 10000, step: 1, def: 0 }]
	},
	{
		id: 'mul',
		label: 'MUL',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.mul',
		inputs: [CV_A, CV_B],
		outputs: [CV_OUT],
		params: [{ key: 'mulB', label: 'B', min: -100, max: 100, step: 0.01, def: 1 }]
	},
	{
		/* Blueprint's MapRangeClamped, which is the node you actually reach for:
		   velocity arrives 0..1 and a cutoff wants 200..8000, and doing that by
		   hand is a multiply, an add and a clamp every time. */
		id: 'remap',
		label: 'REMAP',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.remap',
		inputs: [CV_A],
		outputs: [CV_OUT],
		params: [
			{ key: 'inLo', label: 'IN.LO', min: -1000, max: 10000, step: 1, def: 0 },
			{ key: 'inHi', label: 'IN.HI', min: -1000, max: 10000, step: 1, def: 1 },
			{ key: 'outLo', label: 'TO.LO', min: -20000, max: 20000, step: 1, def: 0 },
			{ key: 'outHi', label: 'TO.HI', min: -20000, max: 20000, step: 1, def: 100 }
		]
	},
	{
		id: 'clamp',
		label: 'CLAMP',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.clamp',
		inputs: [CV_A],
		outputs: [CV_OUT],
		params: [
			{ key: 'clampLo', label: 'MIN', min: -1000, max: 10000, step: 1, def: 0 },
			{ key: 'clampHi', label: 'MAX', min: -1000, max: 10000, step: 1, def: 1 }
		]
	},
	{
		/* Blueprint's Lerp: A and B with a weight between them. */
		id: 'lerp',
		label: 'LERP',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.lerp',
		inputs: [CV_A, CV_B, { id: 'alpha', label: 'ALPHA', kind: 'mod' }],
		outputs: [CV_OUT],
		params: [{ key: 'lerpAlpha', label: 'ALPHA', min: 0, max: 100, step: 1, unit: '%', def: 50 }]
	},
	{
		id: 'curve',
		label: 'CURVE',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.curve',
		inputs: [CV_A],
		outputs: [CV_OUT],
		params: [{ key: 'exp', label: 'EXP', min: 0.1, max: 8, step: 0.1, def: 1 }]
	},
	{
		id: 'out',
		label: 'OUT',
		group: 'UTILITY',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.out',
		/* Stereo in. Folding to one channel is MONO's job now -- a button here
		   did the same thing invisibly, three panels away from the cable it
		   changed. */
		/* Both chains end here. Audio arrives on IN and goes to the master; the
		   logic chain arrives on the exec pin and is simply over. A patch reads
		   left to right and finishes in one place, rather than having its white
		   wire trail off after the last ACT with nowhere to land. */
		inputs: [EXEC_IN, { id: 'in', label: 'IN', kind: 'audio', role: 'stereo' }],
		outputs: [],
		/* No knobs. OUT sends the patch to the master bus and does nothing else:
		   panning is PAN's job and level is VCA's, both of which are already
		   modules you can put in front of it. A primitive that also mixes is two
		   primitives wearing one coat, and the duplicate controls were a second
		   place to look when a patch came out quiet. */
		params: []
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

/* The exec pins, derived from the catalogue for the same reason the mod ones
   are: a hardcoded list falls behind the modules and misroutes cables. */
export const EXEC_PORT_IDS: ReadonlySet<string> = new Set(
	MODULE_SPECS.flatMap((m) => [
		...m.inputs.filter((p) => p.kind === 'exec').map((p) => p.id),
		...m.outputs.filter((p) => p.kind === 'exec').map((p) => p.id)
	])
);

/**
 * How wide a module's card draws, in canvas units.
 *
 * The card is its controls plus the gutters its port labels are drawn into, so
 * it is not a single constant: a module with a four-character label on both
 * sides is half again as wide as one with none. Laying patches out against a
 * flat 176 put the oscillator on top of the output.
 *
 * Shared with the canvas so a preset and the thing it draws as cannot disagree
 * -- which they did, silently, until the cards grew.
 */
/**
 * How much room one side of a card keeps for its port labels.
 *
 * Each side is padded for the labels on that side, not for the longest label
 * anywhere on the card. TO-FREQ has PITCH in and FREQ out, so both sides are
 * wide; a module with a bare `in` and `out` gets almost none, and padding it as
 * though it had five-character labels left two knobs adrift in a card half
 * again as wide as they needed.
 *
 * Exported because ModuleCard needs the same number to lay its controls out
 * inside the width the canvas drew. It was written out twice, under a comment
 * in each saying the two had to agree -- which is a note asking the next reader
 * to do by hand what an import does for free.
 */
export function labelGutter(ports: { label: string }[]): number {
	const longest = Math.max(0, ...ports.map((p) => p.label.length));
	return longest ? Math.max(12, Math.ceil(14 + longest * 4.4)) : 8;
}

export function moduleWidth(spec: ModuleSpec): number {
	const side = labelGutter;

	/* What the controls themselves need. A row of segmented buttons has to stay
	   legible at 8px, which is what sets the wide case; two knobs side by side
	   want less, and a card with nothing to show wants least. */
	const selectors = spec.params.filter((p) => p.choices);
	const knobs = spec.params.filter((p) => !p.choices && !p.field);
	const fields = spec.params.filter((p) => !p.choices && p.field);
	let controls = 96;
	if (selectors.length) {
		const widest = Math.max(...selectors.map((p) => (p.choices ?? []).length));
		controls = Math.max(controls, widest * 40);
	}
	if (knobs.length) controls = Math.max(controls, knobs.length > 1 ? 128 : 72);
	if (fields.length) controls = Math.max(controls, 104);
	/* A scope or a spectrum is the module rather than a gauge beside one, so it
	   gets room to be read: a trace 112px wide showed that a signal was present
	   and nothing about its shape. */
	if (spec.viz === 'scope' || spec.viz === 'fft') controls = Math.max(controls, 224);
	else if (spec.viz) controls = Math.max(controls, 128);

	return controls + side(spec.inputs) + side(spec.outputs);
}

/** The widest card in the catalogue, for laying out a patch with room to spare. */
export const WIDEST_MODULE = Math.max(...MODULE_SPECS.map(moduleWidth));

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
	'CONVERT',
	'METER',
	'UTILITY'
];
