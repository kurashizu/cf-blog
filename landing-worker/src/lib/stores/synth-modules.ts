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
	viz?: 'adsr' | 'wave' | 'pulse' | 'curve' | 'scope' | 'fft' | 'meter';
}

const CV_A: PortSpec = { id: 'a', label: 'A', kind: 'mod' };
const CV_B: PortSpec = { id: 'b', label: 'B', kind: 'mod' };
const CV_OUT: PortSpec = { id: 'out', label: 'OUT', kind: 'mod' };
/**
 * The types a CONST can be, and what each one means.
 *
 * A number on its own is not a value: 440 is a frequency, a duration, or an
 * eighth of a MIDI note depending on what it was meant as, and the socket is
 * where that is said. Each entry names the range the field allows and the role
 * its outlet takes -- which is what `rolesCompatible` then enforces, so a pitch
 * cannot be dropped on an inlet that wanted an amount.
 *
 * The integer widths are the machine's, not the instrument's: they are here so
 * a patch can say "this is a byte" and have the field refuse 300, which is what
 * makes a CONST feeding a sample index or a step count self-documenting.
 */
export const CONST_KINDS: {
	label: string;
	role: PortRole;
	min: number;
	max: number;
	step: number;
	def: number;
	unit?: string;
	/** Shown and typed as a note name, stored as a number. See `pitch` below. */
	notes?: boolean;
}[] = [
	/* Signed and unsigned bytes and words. Integer steps, so the field cannot
	   hold 2.5 where a count is meant. */
	{ label: 'I8', role: 'index', min: -128, max: 127, step: 1, def: 0 },
	{ label: 'U8', role: 'index', min: 0, max: 255, step: 1, def: 0 },
	{ label: 'I32', role: 'index', min: -2147483648, max: 2147483647, step: 1, def: 0 },
	{ label: 'U32', role: 'index', min: 0, max: 4294967295, step: 1, def: 0 },
	/* A signal's own range: what a waveform swings between. */
	{ label: 'AMP', role: 'cv', min: -1, max: 1, step: 0.001, def: 0 },
	/* How much of something, as a fraction. The same 0..1 an inlet declaring
	   `unit` expects, which is what ENTRY's VEL publishes and what PWM's PW
	   reads. */
	{ label: 'PCT', role: 'unit', min: 0, max: 1, step: 0.001, def: 1 },
	/* A plain real number, either sign. */
	{ label: 'F32', role: 'cv', min: -3.4e38, max: 3.4e38, step: 0.001, def: 0 },
	/* The two quantities that are always positive, split apart because the
	   lattice knows the difference: 440 Hz and 440 seconds are both a positive
	   float and only one of them belongs on an oscillator. */
	{ label: 'FRQ', role: 'hz', min: 0, max: 20000, step: 0.01, def: 440, unit: 'Hz' },
	{ label: 'SEC', role: 'time', min: 0, max: 3600, step: 0.001, def: 0.5, unit: 's' },
	/* A note, typed and shown as a name.
	
	   Stored as a MIDI number, which is the one encoding the piano roll, the
	   keyboard and an imported file already agree on -- so a CONST set to C2 and
	   a key pressed at C2 are the same number. Its outlet is a `pitch`, and the
	   engine publishes a pitch as semitones from the tuning reference rather
	   than as MIDI, so the conversion happens on the way out: middle A is 69
	   here and 0 there, and getting that wrong would put every patched note
	   nearly six octaves high. */
	{ label: 'PIT', role: 'pitch', min: 0, max: 127, step: 1, def: 60, notes: true }
];

/**
 * The shapes MAP can bend a value into.
 *
 * All of them take 0..1 to 0..1 and pass both ends through unchanged, so
 * swapping one for another cannot move where a sweep starts or finishes --
 * only how it travels between them. Named here rather than in the evaluator
 * because the card draws the same list it selects from.
 */
export const MAP_SHAPES: { id: string; label: string }[] = [
	/* A single step: everything below the middle comes out at the low end and
	   everything above it at the high end.
	
	   Where a straight line used to sit, and it was doing nothing: with X and Y
	   both set, a line *is* the range remap, so LIN and "no shape at all" were
	   the same card. A threshold is the shape that has no other way of being
	   said -- it turns a continuous value into one of two, which is what a gate
	   is, and no combination of the curves below reaches it. */
	{ id: 'gate', label: 'GATE' },
	/* Slow to start and quick at the end, and its mirror. This is the pair that
	   makes velocity feel right: EXP opens late, so a soft touch stays soft.
	   Two of each, because how far it bends is which shape it is rather than a
	   dial beside the name. */
	{ id: 'exp', label: 'EXP' },
	{ id: 'exp2', label: 'EXP2' },
	{ id: 'log', label: 'LOG' },
	{ id: 'log2', label: 'LOG2' },
	/* Slow at both ends, quick through the middle -- the shape a fade wants. */
	{ id: 'ease', label: 'EASE' },
	/* Discrete: a sweep becomes a run of held values, which is how a continuous
	   control drives something that only has positions. */
	{ id: 'step4', label: 'ST4' },
	{ id: 'step8', label: 'ST8' },
	/* Back the way it came. */
	{ id: 'inv', label: 'INV' },
	/* Drawn by hand, for the shape none of the above is. */
	{ id: 'draw', label: 'DRAW' }
];

/**
 * The tests CMP can apply, in the order its picker offers them.
 *
 * Symbols rather than words: `>` is read faster than `GT` and fits the four
 * characters a label gets. The order is the evaluator's, pinned by a test --
 * two hand-written copies of one order disagree eventually, and the one nobody
 * corrects is the one that draws.
 */
export const CMP_TESTS: { id: string; label: string }[] = [
	{ id: 'gt', label: '>' },
	{ id: 'ge', label: '>=' },
	{ id: 'lt', label: '<' },
	{ id: 'le', label: '<=' },
	/* Equality within a tolerance, because these are floating-point values that
	   have usually been through a MAP or a division on the way here. An `=`
	   that is almost never true would be a trap rather than a test. */
	{ id: 'eq', label: '=' },
	{ id: 'ne', label: '!=' }
];

/** The ways two truths combine. */
export const LOGIC_OPS: { id: string; label: string }[] = [
	{ id: 'and', label: 'AND' },
	{ id: 'or', label: 'OR' },
	{ id: 'xor', label: 'XOR' },
	/* Reachable as AND then NOT, and kept anyway: one card where the
	   composition is two, and "unless both" is a condition patches state
	   directly. A primitive is what is conceptually irreducible, and these are
	   five names for one shape of node rather than five nodes. */
	{ id: 'nand', label: 'NAND' },
	{ id: 'nor', label: 'NOR' }
];

/** MIDI note number for A4, the reference every pitch is counted from. */
export const MIDI_A4 = 69;

/* Sharps rather than flats, and one name per number: a picker that offered
   both spellings would be two buttons for one note. */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** `60` as `C4`. Octave numbering puts middle C at C4, which is what a piano roll shows. */
export function noteName(midi: number): string {
	const n = Math.round(midi);
	return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

/** `C4` back to 60, or null if it is not a note name. */
export function noteNumber(name: string): number | null {
	const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
	if (!m) return null;
	const base = NOTE_NAMES.indexOf(m[1].toUpperCase());
	if (base < 0) return null;
	const alter = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
	const midi = (Number(m[3]) + 1) * 12 + base + alter;
	return midi >= 0 && midi <= 127 ? midi : null;
}

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
		/* PHS is a socket and not a knob, for the reason PW is one: a signal
		   arriving at a knob *adds* to it, so a knob at 0 and a CONST of 0.25
		   would be two opinions about one value, and the pair would sum. What
		   the offset is when nothing is patched is zero, which is the shape the
		   module boots as.

		   Typed `unit` rather than a role of its own. A new role is worth it when
		   a value cannot be converted to its neighbours by arithmetic -- which is
		   why `pitch` and `bool` are separate -- but a phase is a fraction of a
		   turn, and a fraction of a turn is a 0..1 the same way a duty cycle and
		   a velocity are. Giving it its own role would cut every one of those
		   cables for a type safety that is not real: 0.25 of a turn and 0.25 of
		   a pulse width are the same number meaning the same proportion. */
		inputs: [
			{ id: 'pitch', label: 'FREQ', kind: 'mod', role: 'hz' },
			{ id: 'phase', label: 'PHS', kind: 'mod', role: 'unit' }
		],
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
		/* White noise, and only that.
		 *
		 * No COL knob. Pink and brown are white through a one-pole low-pass with
		 * make-up gain -- which is a FILTER and a VCA, both of which are modules
		 * you can already put after it. Welding them here made three settings
		 * that the card called colours and the patch could not take apart.
		 *
		 * No LVL knob either, for the reason every source lost one: a level on a
		 * source is a VCA welded to it, and it gave "why is this quiet" a second
		 * place to hide. */
		id: 'noise',
		label: 'NOISE',
		group: 'SOURCE',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.noise',
		inputs: [],
		outputs: [AUDIO_OUT],
		params: []
	},
	{
		/* A pulse wave, and the width is the point.
		 *
		 * Web Audio has no pulse oscillator, so this is the standard
		 * construction: a sawtooth minus a copy of itself delayed by part of a
		 * period, which leaves a rectangle whose duty cycle is that fraction.
		 * That is a mechanism rather than a thing anyone patches -- nobody
		 * thinks of a pulse as "a saw minus a delayed saw" -- so it lives inside
		 * the module. Handing it out as four cards would put the delay maths on
		 * the player, and the delay has to track the pitch or the width drifts
		 * across the keyboard.
		 *
		 * PW is the knob and MOD is the socket, named apart because they do not
		 * do the same thing. The knob declares the range -- a bare CV inlet has
		 * no units, so a cable could arrive holding anything and the module
		 * would have to guess -- and it is where the width sits when nothing is
		 * patched. A cable *adds* to it, which is what a signal into a knob
		 * always means here, so an LFO through MOD sweeps either side of
		 * whatever PW is set to. Naming both `pw` would have read as one
		 * control and behaved as two: knob 50 plus a CONST of 50 is 100, not
		 * 50. The ends are clamped away because a pulse at 0 or 100 is a
		 * constant, which is silence with the oscillators still running. */
		id: 'pwm',
		label: 'PWM',
		group: 'SOURCE',
		color: '#c678dd',
		descKey: 'synthPatch.mod.pwm',
		inputs: [
			{ id: 'pitch', label: 'FREQ', kind: 'mod', role: 'hz' },
			{ id: 'pw', label: 'PW', kind: 'mod', role: 'unit' }
		],
		outputs: [AUDIO_OUT],
		params: [],
		/* The width is an inlet, so the card draws what is patched into it
		   rather than what a knob says -- see `pulse` in ModuleCard. */
		viz: 'pulse'
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
		/* Sound times a number.
		 *
		 * The audio half of multiplication, and the reason MUL is not it: MUL is
		 * a pure node, so its result is one number pulled once per note, while
		 * multiplying sound happens sample by sample inside the audio graph.
		 * Giving MUL an audio inlet would not merge them -- it would make one
		 * card behave as a pure node or an audio node depending on what was
		 * patched, which is two modules wearing one name. The names differ
		 * because the mechanisms do.
		 *
		 * This is VCA and INV at once, which is what the negative range is for:
		 * -1 is the same signal upside down, and an invert module would be this
		 * one with its knob welded to a single value. Above 1 it is drive into
		 * whatever follows, which is the other thing a level control is for.
		 *
		 * LVL is a knob *and* a modulation target rather than a socket, unlike
		 * PW and PHS: a signal arriving at an AudioParam adds to it, and adding
		 * is what an envelope onto a level should do -- that is a VCA. The trap
		 * PW was pulled out of was a knob that duplicated a *socket*; here there
		 * is one inlet and it is the knob. */
		id: 'gain',
		label: 'GAIN',
		group: 'SHAPE',
		color: '#61afef',
		descKey: 'synthPatch.mod.gain',
		inputs: [AUDIO_IN],
		outputs: [AUDIO_OUT],
		params: [
			{ key: 'level', label: 'LVL', min: -4, max: 4, step: 0.01, def: 1 }
		]
	},
	{
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
			/* Derived from the table rather than repeated here: the two lists
			   disagreeing is exactly the failure the wave order already had
			   three times, and a type that exists in one and not the other
			   would silently select its neighbour. */
			{
				key: 'kind',
				label: 'TYPE',
				min: 0,
				max: CONST_KINDS.length - 1,
				step: 1,
				def: 0,
				choices: CONST_KINDS.map((k) => k.label)
			},
			/* The range shown here is the widest any type allows; the card
			   narrows it to whichever type is selected. */
			{ key: 'value', label: 'VAL', min: -3.4e38, max: 3.4e38, step: 0.001, def: 0, field: true }
		]
	},
	{
		/* A plus B, and nothing else.
		 *
		 * No knob for the second operand. A knob has to declare a range, and the
		 * point of an operator is that it takes whatever arrives: a CONST typed
		 * as I8 into one leg and a PCT into the other is a legitimate patch, and
		 * a knob spanning -1000..10000 would have been a third opinion about
		 * what those are. What B is unwired is a CONST, which is the module for
		 * saying so and can say which kind of number it means. */
		id: 'add',
		label: 'ADD',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.add',
		inputs: [CV_A, CV_B],
		outputs: [CV_OUT],
		params: []
	},
	{
		/* A times B, and nothing else. No knob, for the reason ADD has none:
		 * the operand's range is the operand's business, and CONST is where a
		 * fixed one is typed along with what kind of number it is. */
		id: 'mul',
		label: 'MUL',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.mul',
		inputs: [CV_A, CV_B],
		outputs: [CV_OUT],
		params: []
	},
	{
		/* Where a quantity becomes a truth.
		 *
		 * The only module that crosses from one to the other. Every other logic
		 * node takes truths and returns one, so this is the single door between
		 * "how much" and "whether" -- which is what lets the lattice keep `bool`
		 * to itself without walling the family off from the rest of the patch.
		 *
		 * The test is a picker rather than six separate cards: the two operands,
		 * the single outlet and the whole shape of the node are the same for all
		 * six, and only the comparison differs. That is the same reasoning that
		 * keeps MAP's ten shapes in one list. */
		id: 'cmp',
		label: 'CMP',
		group: 'LOGIC',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.cmp',
		/* No knobs, for the reason ADD has none: what is being compared could be
		   a frequency, a velocity or a step count, and a dial here would be a
		   third opinion about which. A fixed operand is a CONST, which is the
		   module that says what kind of number it is. */
		inputs: [CV_A, CV_B],
		outputs: [{ id: 'out', label: 'OUT', kind: 'mod', role: 'bool' }],
		params: [
			{
				key: 'test',
				label: 'TEST',
				min: 0,
				max: CMP_TESTS.length - 1,
				step: 1,
				def: 0,
				choices: CMP_TESTS.map((t) => t.label)
			}
		]
	},
	{
		/* Two truths combined.
		 *
		 * NAND and NOR are in the list although AND-then-NOT reaches both. They
		 * are one card where the composition is two, and a gate held open unless
		 * both conditions hold is a thing patches ask for directly rather than
		 * as a negated conjunction. The rule this catalogue is built on is that
		 * a primitive is what is conceptually irreducible -- not what has the
		 * fewest nodes -- and these are five names for one shape of node, not
		 * five nodes. */
		id: 'logic',
		label: 'LOGIC',
		group: 'LOGIC',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.logic',
		inputs: [
			{ id: 'a', label: 'A', kind: 'mod', role: 'bool' },
			{ id: 'b', label: 'B', kind: 'mod', role: 'bool' }
		],
		outputs: [{ id: 'out', label: 'OUT', kind: 'mod', role: 'bool' }],
		params: [
			{
				key: 'op',
				label: 'OP',
				min: 0,
				max: LOGIC_OPS.length - 1,
				step: 1,
				def: 0,
				choices: LOGIC_OPS.map((o) => o.label)
			}
		]
	},
	{
		/* The other way round.
		 *
		 * Its own card rather than a sixth entry in LOGIC's picker, because it
		 * takes one operand: inside LOGIC it would leave a B socket that means
		 * nothing whenever NOT was selected, and a socket that does nothing is
		 * worse than a card that does one thing. */
		id: 'not',
		label: 'NOT',
		group: 'LOGIC',
		color: '#e5c07b',
		descKey: 'synthPatch.mod.not',
		inputs: [{ id: 'a', label: 'A', kind: 'mod', role: 'bool' }],
		outputs: [{ id: 'out', label: 'OUT', kind: 'mod', role: 'bool' }],
		params: []
	},
	{
		id: 'clamp',
		label: 'CLAMP',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.clamp',
		/* The bounds are sockets *and* fields, which is the pair MAP's ranges are.
		
		   Typed, because a limit is a number you know: 200 and 8000, not a dial
		   spanning four decades. Patchable, because a limit that moves with the
		   note is a real thing to want -- and a cable wins over the field, the
		   way it does everywhere else, so the number is where the bound sits
		   when nothing is driving it. */
		inputs: [
			CV_A,
			{ id: 'lo', label: 'MIN', kind: 'mod' },
			{ id: 'hi', label: 'MAX', kind: 'mod' }
		],
		outputs: [CV_OUT],
		params: [
			{ key: 'lo', label: 'MIN', min: -3.4e38, max: 3.4e38, step: 0.001, def: 0, field: true },
			{ key: 'hi', label: 'MAX', min: -3.4e38, max: 3.4e38, step: 0.001, def: 1, field: true }
		]
	},
	{
		/* A value bent on its way through, 0..1 in and 0..1 out.
		 *
		 * The shape is the module: how a value crosses a range is a decision as
		 * real as what the range is. Velocity into a cutoff is one thing on a
		 * straight line and another on a curve that opens late, and a staircase
		 * turns a sweep into steps -- which is how a continuous LFO drives a
		 * discrete choice.
		 *
		 * Named MAP rather than CURVE because a staircase is not a curve, and
		 * neither is the straight line it boots as. */
		id: 'map',
		label: 'MAP',
		group: 'MATH',
		color: '#abb2bf',
		descKey: 'synthPatch.mod.map',
		inputs: [CV_A],
		outputs: [CV_OUT],
		/* The shape, and nothing else -- the same shape as OSC, which is a
		   picker and no knobs. How far a curve bends is part of which curve it
		   is, so it belongs in the list rather than beside it: EXP and a hard
		   EXP are two shapes, and giving one of them a dial would have made the
		   card ask two questions to answer one. */
		params: [
			{
				key: 'shape',
				label: 'SHAPE',
				min: 0,
				max: MAP_SHAPES.length - 1,
				step: 1,
				def: 0,
				choices: MAP_SHAPES.map((m) => m.label)
			},
			/* The two ranges the shape runs between: what arrives, and what
			   leaves. Typed rather than turned, because a range is a pair of
			   numbers you know -- velocity is 0..1 and a cutoff is 200..8000, and
			   spelling those out on dials spanning four decades is not possible.
			
			   This is what REMAP was, and why there is no REMAP: mapping a range
			   and shaping the way a value crosses it are the same operation done
			   in one step, and splitting them meant two cards whose only
			   difference was whether the line between the ends was straight. */
			{ key: 'inLo', label: 'X.LO', min: -3.4e38, max: 3.4e38, step: 0.001, def: 0, field: true },
			{ key: 'inHi', label: 'X.HI', min: -3.4e38, max: 3.4e38, step: 0.001, def: 1, field: true },
			{ key: 'outLo', label: 'Y.LO', min: -3.4e38, max: 3.4e38, step: 0.001, def: 0, field: true },
			{ key: 'outHi', label: 'Y.HI', min: -3.4e38, max: 3.4e38, step: 0.001, def: 1, field: true }
		],
		/* Drawn from the shape that is selected, so the card shows the bend the
		   value will take. */
		viz: 'curve'
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
		/* Only the reference, for the same reason TO-FREQ carries only A4.
		   Rounding a pitch to the nearest semitone is QNT the module: a decision
		   about a value, not part of what "how many semitones is this frequency"
		   means. Keeping it here made the quantise invisible unless you opened
		   this card, which is the opposite of what the comment above wants. */
		params: [{ key: 'tuning', label: 'A4', min: 400, max: 480, step: 0.5, unit: 'Hz', def: 440 }]
	},
	{
		/* Move a pitch by whole semitones.
		 *
		 * PITCH in, PITCH out, so the role survives the trip: ADD would do the
		 * arithmetic but its ports are plain `cv`, and running a pitch through
		 * one launders it into a bare number that any control inlet would then
		 * accept. The lattice refuses `pitch` everywhere except another `pitch`
		 * precisely so that cannot happen quietly.
		 *
		 * BY is an inlet and nothing else, for the reason ADD has no knob: what
		 * an operand is when nothing is patched is a CONST's job, and that is
		 * where the kind of number gets said. An LFO into it is a vibrato
		 * measured in semitones; a CONST is the fixed transpose that the welded
		 * knob on TO-FREQ used to be, and unlike that one it can be driven. */
		id: 'trsp',
		label: 'TRSP',
		group: 'CONVERT',
		color: '#61afef',
		descKey: 'synthPatch.mod.trsp',
		inputs: [
			{ id: 'a', label: 'PITCH', kind: 'mod', role: 'pitch' },
			{ id: 'b', label: 'BY', kind: 'mod' }
		],
		outputs: [{ id: 'out', label: 'PITCH', kind: 'mod', role: 'pitch' }],
		params: []
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
	/* A selector is a menu, not a row, so its width is the longest name it has
	   to show rather than the number of choices. It used to be `choices * 40`,
	   from when they were segmented buttons: CONST's ten types would have asked
	   for four hundred pixels, and the card would have been mostly empty. */
	if (selectors.length) {
		const longest = Math.max(...selectors.flatMap((p) => (p.choices ?? []).map((c) => c.length)));
		controls = Math.max(controls, 56 + longest * 6);
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
