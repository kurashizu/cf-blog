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
	/* Picked from the wave menu rather than turned or typed.
	
	   A periodic wave is its harmonic content, and how many of those there are
	   is not fixed: the four named shapes are joined by however many the player
	   has drawn. A `choices` row cannot say that -- its length is baked into
	   the spec, and the value it stores is a position, so deleting one drawn
	   table would move every other patch's oscillator onto a different shape.
	   The menu stores the wave's own name instead, and `custom:<id>` survives
	   its neighbours being deleted. */
	wave?: boolean;
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
export const CONST_KINDS: {
	label: string;
	role: PortRole;
	min: number;
	max: number;
	step: number;
	def: number;
	unit?: string;
}[] = [
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
	/* The catalogue is being rebuilt out of primitives.
	
	   What was here mixed the two kinds together -- a biquad next to a bowed
	   string, an adder next to a reverb -- and the composites were the ones
	   that could not be taken apart, because each carried its own welded
	   envelope, its own welded crossfade, its own welded filter. Unpicking 48
	   of them in place would have meant holding every intermediate state in the
	   head at once, so the list starts empty instead and each primitive earns
	   its way back: one Web Audio node, or one arithmetic operation, and
	   nothing else in the box with it.
	
	   ENTRY and OUT stay because they are not modules. They are the graph's two
	   ends -- `isFixedNode` refuses to delete either, and `graphOf` puts them
	   back if a saved patch is missing one -- so a catalogue without them has
	   nowhere for a patch to start and nowhere for it to arrive. */
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
		/* One oscillator: a shape and a frequency.
		 *
		 * The way in for every periodic sound, which is the whole of what it is
		 * for. A periodic wave *is* its harmonic content, and the four named
		 * shapes are four points in that space rather than a privileged set --
		 * sine has only the fundamental, triangle weak odd partials, square
		 * strong odd ones, sawtooth all of them. A drawn wave is the same kind
		 * of thing with no name, so it belongs on the same knob rather than
		 * behind a second module.
		 *
		 * It stays one primitive because `setPeriodicWave` is the oscillator's
		 * own method: any wave in that space costs the same single node.
		 *
		 * What rack 1 puts on this list and this does not: PWM and SUPERSAW are
		 * several oscillators and a delay, NOISE is not periodic at all, and
		 * ORGAN and FOLD carry their own banks of knobs. Each is a different
		 * primitive wearing a waveform's name, and pulling them in would make
		 * the one node five.
		 *
		 * FREQ is a cable rather than a given, so an unpatched oscillator holds
		 * its own frequency -- which is what makes a drone or an untuned drum
		 * sayable, and what makes the cable you can see the thing you hear. */
		id: 'osc',
		label: 'OSC',
		group: 'SOURCE',
		color: '#c678dd',
		descKey: 'synthPatch.mod.osc',
		inputs: [{ id: 'pitch', label: 'FREQ', kind: 'mod', role: 'hz' }],
		outputs: [AUDIO_OUT],
		/* The same picker racks 1-7 use, minus the shelves that are not periodic
		   waves: NOISE is not one, and the ADVANCED four are other primitives
		   wearing a waveform's name. BASIC and the drawn tables are what is
		   left, which is exactly the set this module is the way in to. */
		params: [{ key: 'wave', label: 'WAVE', min: 0, max: 3, step: 1, def: 0, wave: true }]
	},
	{
		/* A pitch made into the frequency it names.
		 *
		 * ENTRY publishes a pitch and an oscillator takes a frequency, so this
		 * is the step between them -- and it is a node rather than something the
		 * oscillator does quietly, because the tuning reference is a decision.
		 * A4 is 440 Hz by convention, not by nature, and a patch should be able
		 * to say it took a different one.
		 *
		 * A4 is the only knob. Moving a pitch by semitones is TRSP's own card:
		 * welded here it could not take a cable, so the transpose was fixed for
		 * the life of the patch. A4 stays because it is not an addend -- it is
		 * the base of `a4 * 2^(n/12)`, so without it a semitone has no size --
		 * and it already defaults to the instrument's own tuning rather than
		 * repeating it. */
		id: 'tofreq',
		label: 'TO-FREQ',
		group: 'CONVERT',
		color: '#61afef',
		descKey: 'synthPatch.mod.tofreq',
		inputs: [{ id: 'a', label: 'PITCH', kind: 'mod', role: 'pitch' }],
		outputs: [{ id: 'out', label: 'FREQ', kind: 'mod', role: 'hz' }],
		params: [{ key: 'tuning', label: 'A4', min: 400, max: 480, step: 0.5, unit: 'Hz', def: 440 }]
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

/** The widest card in the catalogue, for laying out a patch with room to spare.
 *
 * `Math.max()` of nothing is `-Infinity`, which is not a width and would be
 * spread through every layout that asks for spacing. While the catalogue is
 * being rebuilt the list is short and could be emptied entirely, so the floor
 * is stated rather than assumed. */
export const WIDEST_MODULE = MODULE_SPECS.length ? Math.max(...MODULE_SPECS.map(moduleWidth)) : 176;

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
