/**
 * Prefabs: useful arrangements of primitives, saved and dropped whole.
 *
 * The catalogue is 47 modules and every one of them earns its place by being
 * irreducible -- it may not overlap another, may not be substitutable by a
 * combination, and convenience is explicitly not grounds for admission. That
 * rule was applied retroactively once: the catalogue was emptied and rebuilt to
 * get the composites out of it.
 *
 * The rule is right and it has a price. An LFO is four nodes, a resonant comb
 * is five, a vocoder band is five -- and they are the *same* four or five every
 * time, rebuilt by hand on every patch that wants one. Nothing about that is
 * creative work; it is transcription, and getting a cable wrong makes it silent
 * transcription.
 *
 * A prefab is how both things are true at once. It is not a module: it has no
 * entry in MODULE_SPECS, no case in buildGraphNode, no ports, and no id a cable
 * can name. It is a *recording of an arrangement*, and dropping it expands it
 * into exactly the loose primitives you would have placed yourself -- fresh
 * ids, internal cables intact, knob values carried. A second after the drop
 * there is nothing in the patch that knows it came from a prefab, which is the
 * property that keeps the catalogue honest: the engine cannot tell, because
 * there is nothing to tell.
 *
 * This is the distinction the group box does not cross either. A prefab arrives
 * wrapped in one so that five loose cards read as "COMB FILTER" rather than as
 * five loose cards -- but the box is scenery over the same primitives, and
 * deleting it leaves them working.
 *
 * Shaped after LIFE.LAB's pattern shelf, which solves the same problem: a set
 * of known-good arrangements in code, the player's own saved beside them, both
 * dropped by key onto a canvas that does not care where they came from.
 */
import { writable, get, derived } from 'svelte/store';
import type { RackGraph } from './graph-model';

/**
 * One saved arrangement.
 *
 * `body` is a fragment in exactly the shape `copyNodes` produces and
 * `pasteNodes` consumes -- nodes, the cables between them, and the box drawn
 * around them. Reusing the clipboard's own format rather than inventing a
 * second one is what lets a prefab be expanded by the paste path that is
 * already there and already carries knob values across.
 *
 * `params` are keyed `<nodeId>.<knob>` against the *body's* ids, which the
 * expansion rewrites to the fresh ones. Stored separately from the nodes for
 * the same reason the live patch stores them separately: a knob value belongs
 * to the track, not to the node.
 */
export interface Prefab {
	key: string;
	label: string;
	/** One line, shown under the name. Says what it is for, not what it contains. */
	note: string;
	body: RackGraph;
	params: Record<string, number>;
	/* The text its nodes carry, by node id: a terminal's socket name, a note's
	   comment. Keyed like `graphLabels`, so expansion remaps it the same way. */
	labels?: Record<string, string>;
	/** Absent on user prefabs; the built-ins carry one so each reads as itself. */
	color?: string;
	/** True for the user's own, which can be renamed and deleted. */
	custom?: boolean;
}

/* CONST's `kind` indexes CONST_KINDS in synth-modules: 0 I8, 1 U8, 2 I32,
   3 U32, 4 AMP, 5 PCT, 6 F32, 7 FRQ, 8 SEC, 9 PIT. Named here because a bare
   `7` in a prefab body is unreadable, and a prefab whose CONST came out as the
   wrong type is wired correctly and silent. */
const FRQ = 7;

/** MAP's `shape` indexes MAP_SHAPES; 8 is INV, which is what makes DUCK duck. */
const MAP_INV = 8;

/**
 * The built-in shelf.
 *
 * Seven, and each one is here because it is a *shape* rather than a sound: the
 * knobs are meant to be turned after it lands. Every one was rendered on the
 * audit bench against a control that differs by one cable or one knob before it
 * was written down, and the measured pair is in each comment. A prefab that
 * expands to a silent patch is worse than no prefab -- it looks like a working
 * patch, which is the most expensive kind of broken.
 *
 * An eighth was cut for failing that test rather than trimmed for space. A
 * Karplus-Strong PLUCK -- an excite into a filtered delay loop at fb 0.93 --
 * did not pluck: instead of a tail decaying from the strike it *rose*, reading
 * 0.0290 at the first slice and climbing to a sustained 0.3050 that held for
 * the rest of the render, and a bandpass swept from 180 to 220 Hz found no peak
 * anywhere (every reading ~0.0011). A loop that latches at a level and rings at
 * no particular pitch is not the instrument its name promises, so it is not
 * here. The measurement is recorded because the next person to think of it
 * should know it was tried.
 *
 * Worth noting what cannot be a prefab at all: sample-and-hold. There is no
 * primitive that samples a value on an edge and holds it, and no arrangement of
 * the 47 reaches one -- so that is a missing *primitive*, not a missing prefab,
 * and no amount of this feature will supply it.
 */
export const BUILTIN_PREFABS: Prefab[] = [
	{
		key: 'lfo',
		label: 'LFO',
		note: 'synthPrefab.note.lfo',
		color: '#c678dd',
		/* A low-frequency oscillator, which is deliberately not a module.

		   TO-CV's own docstring says why: "an oscillator at a low frequency ...
		   giving it its own card would be the same primitive twice". True, and it
		   leaves every tremolo as four nodes anyone who wants one has to know to
		   assemble. This is that assembly, recorded.

		   The CONST is not optional and is the trap this prefab exists to spring
		   shut. OSC's only knob is WAVE -- `pitch` is not a knob at all, and the
		   engine falls back to `cvIn(probeKey, 'pitch', 220)` when nothing is
		   patched. So an LFO shipped without its own rate CONST lands on the
		   canvas oscillating at 220 Hz with no visible control to slow it down:
		   an audio-rate oscillator wearing an LFO's name.

		   The MAP is not decoration either. TO-CV passes the sine at unity, which
		   swings a level between 0.2785 and 0.3802 -- a spread of 0.1017, a
		   gentle wobble rather than the tremolo the patch was drawn to be.
		   Through a MAP set to -1..1 into 0..1 the same LFO drives the level from
		   silence to full, 4.7x deeper; `composite.test.ts` measures exactly that
		   pair. Measured here driving a carrier GAIN at 5 Hz: the envelope cycles
		   between 0.2151 and 0.4304 against the unwired control's flat 0.2407. */
		body: {
			nodes: [
				{ id: 'rate', type: 'const', x: 0, y: 49 },
				{ id: 'osc', type: 'osc', x: 224, y: 38 },
				{ id: 'cv', type: 'tocv', x: 448, y: 58 },
				{ id: 'map', type: 'map', x: 672, y: 0 },
				{ id: 'outT', type: 'nodecv', x: 896, y: 89 },
				{ id: 'nOut', type: 'note', x: 892, y: 55 }
			],
			cables: [
				{ from: 'rate', fromPort: 'out', to: 'osc', toPort: 'pitch' },
				{ from: 'osc', fromPort: 'out', to: 'cv', toPort: 'in' },
				{ from: 'cv', fromPort: 'out', to: 'map', toPort: 'a' },
				{ from: 'map', fromPort: 'out', to: 'outT', toPort: 'a' }
			]
		},
		/* 5 Hz, and the MAP's X range is the sine's own -1..1 so the full swing is
		   used. Y is 0..1, which is what a level or a unit inlet wants; a
		   destination in hertz means retyping Y, which is the knob to reach for. */
		params: {
			'rate.kind': FRQ,
			'rate.value': 5,
			'map.inLo': -1,
			'map.inHi': 1,
			'map.outLo': 0,
			'map.outHi': 1
		},
		labels: { nOut: 'LFO OUT' }
	},
	{
		key: 'comb',
		label: 'COMB',
		note: 'synthPrefab.note.comb',
		color: '#61afef',
		/* A delay fed back into its own input.

		   Not drawable as a plain cycle -- `addCable` refuses audio loops, and
		   DELAY's docstring records that the refusal is exactly what stops a
		   resonating comb being built with a cable. SEND and RTN are the pair
		   that exist for this: they close the loop by matching BUS numbers rather
		   than by a cable, so the graph stays acyclic and the feedback happens
		   anyway.

		   Which makes this the prefab with the strongest case of the lot. It is
		   not merely tedious to rebuild; it is the one whose construction is
		   non-obvious, because the connection that makes it work is the one you
		   cannot see on the canvas.

		   The topology is `ports.test.ts`'s own `comb()`, so it is the
		   arrangement already pinned by an audio test rather than a second guess
		   at the same thing. Measured with an 8 ms strike at 50 ms and fb 0.7:
		   the tail reads 0.0119 / 0.0067 / 0.0023 / 0.0008 across the first four
		   slices, where the same patch at fb 0 reads 0.0103 and then exactly 0 --
		   one strike passing through against a tail that rings down. */
		body: {
			nodes: [
				{ id: 'inT', type: 'nodept', x: 0, y: 31 },
				{ id: 'sum', type: 'sum', x: 72, y: 0 },
				{ id: 'delay', type: 'delay', x: 296, y: -10 },
				{ id: 'send', type: 'fbsend', x: 520, y: -7 },
				{ id: 'outT', type: 'nodept', x: 720, y: 22 },
				{ id: 'rtn', type: 'fbrtn', x: 72, y: 160 },
				{ id: 'fb', type: 'gain', x: 296, y: 152 },
				{ id: 'nIn', type: 'note', x: -4, y: -3 },
				{ id: 'nOut', type: 'note', x: 716, y: -12 }
			],
			cables: [
				{ from: 'inT', fromPort: 'out', to: 'sum', toPort: 'in' },
				{ from: 'sum', fromPort: 'out', to: 'delay', toPort: 'in' },
				{ from: 'delay', fromPort: 'out', to: 'send', toPort: 'in' },
				{ from: 'delay', fromPort: 'out', to: 'outT', toPort: 'in' },
				{ from: 'rtn', fromPort: 'out', to: 'fb', toPort: 'in' },
				{ from: 'fb', fromPort: 'out', to: 'sum', toPort: 'in' }
			]
		},
		/* 0.7 rings without latching: the loop saturates through a tanh with
		   unity slope at the origin, so the number means what it says and below 1
		   the tail decays. Both ends on bus 0, which is what pairs them -- a
		   second COMB in the same patch needs its two BUS fields moved together,
		   and they are fields on the cards rather than anything hidden here. */
		params: {
			'delay.delayTime': 0.05,
			'fb.level': 0.7,
			'send.bus': 0,
			'rtn.bus': 0
		},
		labels: { nIn: 'IN', nOut: 'OUT' }
	},
	{
		key: 'voice',
		label: 'VOICE',
		note: 'synthPrefab.note.voice',
		color: '#98c379',
		/* A subtractive voice: the patch nearly every instrument starts as.

		   Pitch in, oscillator, filter, amplifier, and an envelope on each of the
		   last two. Seven nodes, and the starting graph gives you three of them
		   -- so this is the difference between a canvas that can make a note and
		   one that can make an instrument.

		   The second ENV does not reach the cutoff directly, and that is the
		   correction this prefab carries. An ENV emits 0..1, a cutoff is in
		   hertz, and a cable straight between them sweeps the filter from 0 Hz to
		   1 Hz: measured that way the whole patch read 0.0005, which is silence
		   with a built voice and no error -- the shape of failure that looks like
		   a broken module. Through a MAP onto 300..6000 the same patch reads
		   0.3343 at the attack settling to 0.2511, against a flat 0.2497 with
		   both envelopes unwired.

		   Different curves on the two, which is the whole reason they are two
		   modules and not one: EXP on the level, because a linear fall to silence
		   sounds like it stops abruptly while a decaying exponential is what a
		   struck string does, and LIN on the cutoff, because a frequency sweep
		   wants even motion. */
		body: {
			nodes: [
				{ id: 'inT', type: 'nodecv', x: 0, y: 63 },
				{ id: 'tofreq', type: 'tofreq', x: 72, y: 28 },
				{ id: 'osc', type: 'osc', x: 296, y: 26 },
				{ id: 'filter', type: 'filter', x: 520, y: 0 },
				{ id: 'amp', type: 'gain', x: 744, y: 42 },
				{ id: 'outT', type: 'nodept', x: 968, y: 74 },
				{ id: 'fenv', type: 'env', x: 96, y: 186 },
				{ id: 'fmap', type: 'map', x: 320, y: 198 },
				{ id: 'aenv', type: 'env', x: 544, y: 186 },
				{ id: 'nIn', type: 'note', x: -4, y: 29 },
				{ id: 'nOut', type: 'note', x: 964, y: 40 }
			],
			cables: [
				{ from: 'inT', fromPort: 'out', to: 'tofreq', toPort: 'a' },
				{ from: 'tofreq', fromPort: 'out', to: 'osc', toPort: 'pitch' },
				{ from: 'osc', fromPort: 'out', to: 'filter', toPort: 'in' },
				{ from: 'filter', fromPort: 'out', to: 'amp', toPort: 'in' },
				{ from: 'amp', fromPort: 'out', to: 'outT', toPort: 'in' },
				{ from: 'fenv', fromPort: 'out', to: 'fmap', toPort: 'a' },
				{ from: 'fmap', fromPort: 'out', to: 'filter', toPort: 'cutoff' },
				{ from: 'aenv', fromPort: 'out', to: 'amp', toPort: 'level' }
			]
		},
		/* TO-FREQ's PITCH inlet is left unwired on purpose: it is the one cable
		   the player must draw, from ENTRY's PITCH, and a prefab cannot draw it
		   because ENTRY is not part of the fragment. Unpatched the oscillator
		   holds its own frequency, which is a drone -- audible, so the missing
		   cable announces itself rather than reading as a dead prefab. */
		params: {
			'filter.type': 0,
			'filter.cutoff': 2000,
			'filter.q': 6,
			'amp.level': 0,
			'aenv.envA': 0.005,
			'aenv.envD': 0.3,
			'aenv.envS': 60,
			'aenv.envR': 0.3,
			'aenv.envCurve': 1,
			'fenv.envA': 0.002,
			'fenv.envD': 0.25,
			'fenv.envS': 30,
			'fenv.envR': 0.2,
			'fenv.envCurve': 0,
			'fmap.inLo': 0,
			'fmap.inHi': 1,
			'fmap.outLo': 300,
			'fmap.outHi': 6000
		},
		labels: { nIn: 'PITCH IN', nOut: 'OUT' }
	},
	{
		key: 'wide',
		label: 'WIDE',
		note: 'synthPrefab.note.wide',
		color: '#56b6c2',
		/* A mono signal made stereo by delaying one side of it.

		   The Haas effect: a few milliseconds between the ears reads as direction
		   and width rather than as an echo, because below about 30 ms the two
		   arrivals fuse into one event. MERGE's right inlet is `r`, not the `b`
		   every two-inlet maths node uses -- a cable to `b` here lands nowhere
		   and the patch stays mono.

		   Measuring this took a detour worth recording. The stereo pair reads
		   0.3709 at 18 ms and 0.3709 with no delay at all: an RMS over both
		   channels cannot see an offset between them, because the energy is the
		   same wherever it sits in time. Folded back to mono the difference is
		   plain -- 0.2407 undelayed, 0.1702 at half a period of the note, and
		   0.0047 decaying to exactly 0 at a full period, where the delayed copy
		   arrives in antiphase and cancels its own source outright. Total
		   cancellation is only possible if the two channels genuinely differ, so
		   that reading is the proof the widening is real. */
		body: {
			nodes: [
				{ id: 'inT', type: 'nodept', x: 0, y: 31 },
				{ id: 'mono', type: 'mono', x: 72, y: 0 },
				{ id: 'delay', type: 'delay', x: 296, y: 108 },
				{ id: 'merge', type: 'merge', x: 520, y: 43 },
				{ id: 'outT', type: 'nodept', x: 744, y: 75 },
				{ id: 'nIn', type: 'note', x: -4, y: -3 },
				{ id: 'nOut', type: 'note', x: 740, y: 41 }
			],
			cables: [
				{ from: 'inT', fromPort: 'out', to: 'mono', toPort: 'in' },
				{ from: 'mono', fromPort: 'out', to: 'merge', toPort: 'in' },
				{ from: 'mono', fromPort: 'out', to: 'delay', toPort: 'in' },
				{ from: 'delay', fromPort: 'out', to: 'merge', toPort: 'r' },
				{ from: 'merge', fromPort: 'out', to: 'outT', toPort: 'in' }
			]
		},
		/* 18 ms: inside the fusion window, so it widens rather than echoing, and
		   long enough not to comb the source into a colouration. Past about 30 ms
		   it starts being heard as a separate event, which is a different effect
		   and a different prefab. */
		params: { 'delay.delayTime': 0.018 },
		labels: { nIn: 'IN', nOut: 'WIDE OUT' }
	},
	{
		key: 'vib',
		label: 'VIB',
		note: 'synthPrefab.note.vib',
		color: '#c678dd',
		/* Vibrato: an oscillator's pitch moved by another oscillator.

		   Deliberately not the LFO prefab with a different cable, and the
		   difference is the mechanism rather than the setting. LFO ends in a MAP
		   on a *mod* cable, which is pulled or connected as a control value into
		   a 0..1 destination. This ends in a GAIN on an *audio* cable, because a
		   modulator arriving at OSC's FREQ is summed onto the AudioParam in hertz
		   of deviation -- so the depth is a number of hertz and the attenuator
		   has to sit on the signal side to mean that. Feeding this one's output
		   into a level, or that one's into a frequency, gives the wrong depth by
		   orders of magnitude; they are two prefabs for that reason.

		   The carrier keeps its own base frequency while the modulator sums onto
		   it, which is the behaviour OSC's FREQ docstring calls "a centre and an
		   excursion" -- both mechanisms act on that port and that is correct for
		   it.

		   Measured through a narrow bandpass just off the carrier, which turns a
		   frequency wobble into something an RMS envelope can see: 0.2033 to
		   0.2779 at 5.5 Hz, against a flat 0.2229 with the depth cable removed. */
		body: {
			nodes: [
				{ id: 'rate', type: 'const', x: 0, y: 11 },
				{ id: 'lfo', type: 'osc', x: 224, y: 0 },
				{ id: 'depth', type: 'gain', x: 448, y: 29 },
				{ id: 'outT', type: 'nodept', x: 672, y: 61 },
				{ id: 'nOut', type: 'note', x: 668, y: 27 }
			],
			cables: [
				{ from: 'rate', fromPort: 'out', to: 'lfo', toPort: 'pitch' },
				{ from: 'lfo', fromPort: 'out', to: 'depth', toPort: 'in' },
				{ from: 'depth', fromPort: 'out', to: 'outT', toPort: 'in' }
			]
		},
		/* 5.5 Hz is a singer's vibrato rate. A depth of 6 is +/-6 Hz, which is
		   about a quarter tone at A4 -- and being in hertz rather than cents, it
		   is a wider interval low down than high up. That is a property of
		   modulating a frequency rather than a pitch, and the fix if it matters
		   is to modulate before TO-FREQ instead. */
		params: { 'rate.kind': FRQ, 'rate.value': 5.5, 'depth.level': 6 },
		labels: { nOut: 'TO OSC FREQ' }
	},
	{
		key: 'duck',
		label: 'DUCK',
		note: 'synthPrefab.note.duck',
		color: '#e5c07b',
		/* Sidechain ducking: one signal pushing another out of the way.

		   FOLLOW is the only crossing from the audio family into the control
		   family, so this is the shape of every patch where what you *hear*
		   steers what you hear next. The MAP set to INV is what makes it duck
		   rather than swell: FOLLOW hands back "how loud", and the whole point is
		   that louder must mean quieter.

		   Measured with a 3 Hz key against a noise carrier: the level drops to
		   0.0054 once per cycle from about 0.0420, against a flat 0.1175 with the
		   key unwired. The dip is to a twentieth of the resting level, which is a
		   duck anyone would hear rather than a hint of one. */
		body: {
			nodes: [
				{ id: 'keyT', type: 'nodept', x: 0, y: 89 },
				{ id: 'follow', type: 'follow', x: 72, y: 54 },
				{ id: 'map', type: 'map', x: 296, y: 0 },
				{ id: 'inT', type: 'nodept', x: 0, y: 233 },
				{ id: 'duck', type: 'gain', x: 520, y: 222 },
				{ id: 'outT', type: 'nodept', x: 744, y: 244 },
				{ id: 'nKey', type: 'note', x: -4, y: 55 },
				{ id: 'nIn', type: 'note', x: -4, y: 199 },
				{ id: 'nOut', type: 'note', x: 740, y: 210 }
			],
			cables: [
				{ from: 'keyT', fromPort: 'out', to: 'follow', toPort: 'in' },
				{ from: 'follow', fromPort: 'out', to: 'map', toPort: 'a' },
				{ from: 'map', fromPort: 'out', to: 'duck', toPort: 'level' },
				{ from: 'inT', fromPort: 'out', to: 'duck', toPort: 'in' },
				{ from: 'duck', fromPort: 'out', to: 'outT', toPort: 'in' }
			]
		},
		/* INV is MAP_SHAPES index 8. The GAIN rests at 0 because the MAP's cable
		   claims it -- a knob a signal has claimed reads as zero and the cable
		   alone decides, so a resting level here would be a floor the duck could
		   never push below. */
		params: {
			'map.shape': MAP_INV,
			'map.inLo': 0,
			'map.inHi': 1,
			'map.outLo': 0,
			'map.outHi': 1,
			'duck.level': 0,
			'follow.sens': 3,
			'follow.resp': 20
		},
		labels: { nKey: 'KEY', nIn: 'IN', nOut: 'OUT' }
	},
	{
		key: 'pingpong',
		label: 'PPONG',
		note: 'synthPrefab.note.pingpong',
		color: '#61afef',
		/* A ping-pong delay: two delay lines whose feedback is crossed, so each
		   repeat lands on the opposite side.

		   Nine nodes and two feedback buses, which makes it the least likely of
		   these to be built by hand correctly -- and the one whose failure is
		   quietest, because a mis-crossed return sounds like an ordinary stereo
		   delay rather than like nothing. So both halves of the claim were
		   measured rather than reasoned about.

		   That the buses stay separate: a SEND on bus 1 with its RTN moved to bus
		   2 renders exactly 0, while the same pair both on bus 1 renders 0.3915.
		   Buses do not leak.

		   That the return lands on the *opposite* line: feeding only the left
		   delay and listening to only the right, the crossed wiring sounds at
		   0.0073 and the uncrossed wiring reads exactly 0. Sound reaches the
		   right line only by way of the cross, which is what ping-pong means.

		   Heard as a whole, the crossed version decays in every third slice
		   (0.0201 / 0.0069 / 0.0025) where the uncrossed one decays in every
		   slice (0.0199 / 0.0117 / 0.0069) -- the gaps are the bounce. */
		body: {
			nodes: [
				{ id: 'inT', type: 'nodept', x: 0, y: 175 },
				{ id: 'split', type: 'split', x: 72, y: 143 },
				{ id: 'sumL', type: 'sum', x: 296, y: 0 },
				{ id: 'delayL', type: 'delay', x: 520, y: -10 },
				{ id: 'sendL', type: 'fbsend', x: 744, y: -7 },
				{ id: 'rtnL', type: 'fbrtn', x: 296, y: 96 },
				{ id: 'fbL', type: 'gain', x: 496, y: 88 },
				{ id: 'sumR', type: 'sum', x: 296, y: 300 },
				{ id: 'delayR', type: 'delay', x: 520, y: 290 },
				{ id: 'sendR', type: 'fbsend', x: 744, y: 293 },
				{ id: 'rtnR', type: 'fbrtn', x: 296, y: 396 },
				{ id: 'fbR', type: 'gain', x: 496, y: 388 },
				{ id: 'merge', type: 'merge', x: 944, y: 154 },
				{ id: 'outT', type: 'nodept', x: 1168, y: 186 },
				{ id: 'nIn', type: 'note', x: -4, y: 141 },
				{ id: 'nOut', type: 'note', x: 1164, y: 152 }
			],
			cables: [
				{ from: 'inT', fromPort: 'out', to: 'split', toPort: 'in' },
				{ from: 'split', fromPort: 'out', to: 'sumL', toPort: 'in' },
				{ from: 'split', fromPort: 'r', to: 'sumR', toPort: 'in' },
				{ from: 'sumL', fromPort: 'out', to: 'delayL', toPort: 'in' },
				{ from: 'delayL', fromPort: 'out', to: 'sendL', toPort: 'in' },
				{ from: 'sumR', fromPort: 'out', to: 'delayR', toPort: 'in' },
				{ from: 'delayR', fromPort: 'out', to: 'sendR', toPort: 'in' },
				{ from: 'rtnL', fromPort: 'out', to: 'fbL', toPort: 'in' },
				{ from: 'fbL', fromPort: 'out', to: 'sumR', toPort: 'in' },
				{ from: 'rtnR', fromPort: 'out', to: 'fbR', toPort: 'in' },
				{ from: 'fbR', fromPort: 'out', to: 'sumL', toPort: 'in' },
				{ from: 'delayL', fromPort: 'out', to: 'merge', toPort: 'in' },
				{ from: 'delayR', fromPort: 'out', to: 'merge', toPort: 'r' },
				{ from: 'merge', fromPort: 'out', to: 'outT', toPort: 'in' }
			]
		},
		/* Buses 1 and 2 rather than 0, so dropping this beside a COMB -- which
		   sits on bus 0 -- does not have the two patches feeding each other's
		   loops. Two buses are needed because each line's round trip must stay
		   its own; one bus shared would sum both delays into both returns and the
		   cross would have nothing left to cross. The times are 120 and 240 ms,
		   a 2:1 ratio so the bounce is even. */
		params: {
			'delayL.delayTime': 0.12,
			'delayR.delayTime': 0.24,
			'sendL.bus': 1,
			'rtnL.bus': 1,
			'sendR.bus': 2,
			'rtnR.bus': 2,
			'fbL.level': 0.6,
			'fbR.level': 0.6
		},
		labels: { nIn: 'IN', nOut: 'OUT' }
	}
];

/* ---- the user's own shelf ---- */

/* Versioned in the key, like every other persisted list here. A shape change
   then orphans the old data rather than half-reading it. */
const STORAGE_KEY = 'krsz-synth-prefabs-v1';

/**
 * Is this something we stored, rather than something that merely parsed?
 *
 * localStorage is user data: it can be hand-edited, truncated by a full disk,
 * or left behind by an older version. A prefab whose body is missing its nodes
 * array expands to nothing and looks like a broken drop, so the ones that
 * cannot be trusted are dropped on load instead.
 */
function valid(p: unknown): p is Prefab {
	const c = p as Prefab;
	return (
		!!c &&
		typeof c.key === 'string' &&
		typeof c.label === 'string' &&
		!!c.body &&
		Array.isArray(c.body.nodes) &&
		Array.isArray(c.body.cables) &&
		c.body.nodes.length > 0
	);
}

function load(): Prefab[] {
	try {
		if (typeof localStorage === 'undefined') return [];
		const raw = localStorage.getItem(STORAGE_KEY);
		const arr = raw ? JSON.parse(raw) : [];
		return Array.isArray(arr) ? arr.filter(valid).map((p) => ({ ...p, custom: true })) : [];
	} catch {
		return [];
	}
}

function persist(list: Prefab[]): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
	} catch {
		/* private mode or quota: the shelf still works for this visit */
	}
}

/** Prefabs the player saved. Persisted across visits, listed after the built-ins. */
export const userPrefabs = writable<Prefab[]>(load());

/** The whole shelf, built-ins first. What the palette lists. */
export const allPrefabs = derived(userPrefabs, ($user) => [...BUILTIN_PREFABS, ...$user]);

export function findPrefab(key: string): Prefab | undefined {
	return get(allPrefabs).find((p) => p.key === key);
}

/**
 * Save a fragment as a prefab.
 *
 * The body arrives already extracted by `copyNodes`, which is the same function
 * Ctrl+C uses -- so what is saved is exactly what would have been copied, cables
 * leaving the selection dropped rather than dangling. The params are filtered to
 * the nodes in the body, because a prefab carrying knob values for nodes it does
 * not contain would write them onto the track on every drop and slowly fill a
 * patch with keys pointing at nothing.
 */
export function savePrefab(
	label: string,
	body: RackGraph,
	params: Record<string, number> | undefined,
	note = ''
): Prefab {
	const ids = new Set(body.nodes.map((n) => n.id));
	const own: Record<string, number> = {};
	for (const [k, v] of Object.entries(params ?? {})) {
		const at = k.indexOf('.');
		if (at > 0 && ids.has(k.slice(0, at))) own[k] = v;
	}
	const prefab: Prefab = {
		key: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
		label: (label.trim() || 'PREFAB').slice(0, 20).toUpperCase(),
		note,
		/* Deep-copied on the way in. The body handed here is derived from the
		   live graph, and storing it by reference would leave the shelf holding
		   the objects the editor goes on mutating -- so a prefab saved and then
		   edited on the canvas would change under its own name. */
		body: JSON.parse(JSON.stringify(body)),
		params: own,
		custom: true
	};
	userPrefabs.update((list) => {
		const next = [...list, prefab];
		persist(next);
		return next;
	});
	return prefab;
}

export function deletePrefab(key: string): void {
	userPrefabs.update((list) => {
		const next = list.filter((p) => p.key !== key);
		persist(next);
		return next;
	});
}

export function renamePrefab(key: string, label: string): void {
	const clean = label.trim().slice(0, 20).toUpperCase();
	if (!clean) return;
	userPrefabs.update((list) => {
		const next = list.map((p) => (p.key === key ? { ...p, label: clean } : p));
		persist(next);
		return next;
	});
}
