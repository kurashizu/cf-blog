/**
 * The node model, after Unreal's Blueprints.
 *
 * This exists because the engine had the rules written out once per module and
 * so had them wrong in a different way each time. An oscillator read the key it
 * was played from whether or not anything was wired into its PITCH socket; MODES
 * consulted a knob first and the socket never; STRING declared a socket the
 * builder did not read at all. Three sockets on three cards that did nothing,
 * and no way to notice short of playing each one and listening.
 *
 * The fix is not another check. It is that a module should not be able to reach
 * past its own inputs: if every value a node uses arrives already resolved --
 * cable if there is one, declared default if not -- then "an unwired socket
 * falls back to its default" is true by construction rather than by 46 separate
 * authors remembering it.
 *
 * So this module owns the resolution and nothing else does. Blueprint's split
 * is kept exactly:
 *
 *   exec   which nodes run, and in what order. Actions only.
 *   data   values, pulled on demand: a consumer asks, the producer computes.
 *
 * Pure nodes (arithmetic, filters) have no exec pins because asking when they
 * run has no answer; impure ones (a strike, an output) do, because running them
 * does something.
 */

/** A value flowing between nodes. Numbers today; the shape is what matters. */
export type NodeValue = number;

export interface ResolvedInputs {
	/** What arrived at this inlet, already resolved from cable or default. */
	get(port: string, fallback: number): number;
}

export interface EvalNode {
	id: string;
	type: string;
}

export interface EvalCable {
	from: string;
	fromPort: string;
	to: string;
	toPort: string;
}

export interface EvalGraph {
	nodes: EvalNode[];
	cables: EvalCable[];
}

/** Computes a pure node's output from its already-resolved inputs. */
export type PureFn = (
	inputs: ResolvedInputs,
	param: (key: string, def: number) => number,
	/* The note being played, for the few nodes whose default depends on the
	   instrument rather than on their own knobs -- the tuning reference. */
	note?: NoteEvent
) => number;

/**
 * The pure nodes: a value computed from other values, holding no state.
 *
 * Kept as a table rather than a switch so that adding one is adding a row. The
 * engine had this same arithmetic written twice -- once to build the node and
 * once to resolve it -- which is exactly the kind of duplication that drifts.
 */

/* The PIT entry's index in CONST_KINDS, and the MIDI number of the reference.
   Stated here rather than imported: synth-modules imports the port types from
   graph-model and this file is read by the engine, so reaching across for two
   numbers would tie the value evaluator to the catalogue. The pairing is
   pinned by a test instead. */
const CONST_PITCH_KIND = 9;
const MIDI_A4 = 69;

/** Semitones above the reference as a frequency. */
const hzOf = (semis: number, a4: number) => a4 * Math.pow(2, semis / 12);

export const PURE_NODES: Record<string, PureFn> = {
	/* Pitch to frequency: exact, and the direction nearly every patch wants. */
	tofreq: (i, p, note) => hzOf(i.get('a', 0), p('tuning', note?.tuning ?? 440)),
	/* Frequency to pitch: the lossy direction. Which note 452 Hz "is" depends on
	   the reference, which is the knob. It answers exactly rather than rounding:
	   a frequency between two notes is between two notes, and a patch that wants
	   whole semitones can say so. */
	topitch: (i, p, note) => {
		const hz = i.get('a', 0);
		if (!(hz > 0)) return 0;
		return 12 * Math.log2(hz / p('tuning', note?.tuning ?? 440));
	},
	/* Semitones onto a pitch, keeping it a pitch. */
	trsp: (i) => i.get('a', 0) + i.get('b', 0),
	/* A control wire with a name on it: whatever arrives, unchanged.

	   Dual like MAP, and for the same reason. Pulled as a number it resolves a
	   chain of constants straight through, so a CONST behind a terminal still
	   reaches the knob it was aimed at; built as a node it passes a live signal
	   per sample, so an envelope routed through one is not frozen at its value
	   when the note began. Registered in NOT_PURE to say the second half is
	   real -- without it a moving signal through a terminal would be read once
	   and held, which is exactly the silent-drop class this codebase keeps
	   finding. */
	nodecv: (i) => i.get('a', 0),
	/* A literal, in whichever type the socket it is going to expects.
	
	   PIT is the one that is not simply its own number. It is typed and stored
	   as MIDI, because that is what the piano roll, the keyboard and an imported
	   file all agree on -- but a `pitch` on a cable is semitones from the tuning
	   reference, where A4 is 0 rather than 69. Converting here means a CONST set
	   to C4 and a key pressed at C4 reach an oscillator as the same note; without
	   it every patched pitch would arrive five and a half octaves high. */
	const: (_i, p) => {
		const v = p('value', 1);
		return p('kind', 0) === CONST_PITCH_KIND ? v - MIDI_A4 : v;
	},
	/* Both operands come off the sockets. An unwired one is the identity for
	   the operation -- adding nothing, multiplying by one -- so a half-patched
	   operator passes its other leg through rather than zeroing it. */
	add: (i) => i.get('a', 0) + i.get('b', 0),
	mul: (i) => i.get('a', 1) * i.get('b', 1),
	/* Two numbers compared, one truth out.

	   The node where a quantity becomes a yes or no, and the only one: every
	   other logic module takes truths and hands one back, so this is the single
	   border crossing between "how much" and "whether". That is why the lattice
	   can keep `bool` to itself -- there is exactly one door, and it is a card
	   on the canvas rather than a rule hidden in a branch.

	   One module with a picker rather than six modules, for the reason MAP has
	   one shape list: the sockets, the output and the shape of the card are
	   identical across all six and only the test differs. Six cards would be
	   six ways to write the same node.

	   The equality tests compare within a tolerance. These are floating-point
	   values that have usually been through a MAP or a division on the way
	   here, and `0.1 + 0.2 === 0.3` is false -- an `=` that is almost never
	   true is a trap rather than a test. */
	cmp: (i, p) => {
		const a = i.get('a', 0);
		const b = i.get('b', 0);
		const near = Math.abs(a - b) <= 1e-9;
		switch (Math.round(p('test', 0))) {
			case 1:
				return a >= b ? 1 : 0;
			case 2:
				return a < b ? 1 : 0;
			case 3:
				return a <= b ? 1 : 0;
			case 4:
				return near ? 1 : 0;
			case 5:
				return near ? 0 : 1;
			default:
				return a > b ? 1 : 0; // GT
		}
	},
	/* Two truths combined.

	   Anything that is not zero is true, because that is what a truth is once it
	   has travelled as a number -- and the only thing that reaches these sockets
	   is a CMP or another logic node, both of which hand out exactly 1 or 0.

	   Unwired reads as false. There is no identity that works for the whole
	   list the way 0 works for ADD -- false is the identity for OR and true is
	   the identity for AND -- so rather than have the fallback change meaning
	   with the picker, an empty socket is simply false everywhere. A half-built
	   AND is off, which is what a half-built gate should be. */
	logic: (i, p) => {
		const a = i.get('a', 0) !== 0;
		const b = i.get('b', 0) !== 0;
		switch (Math.round(p('op', 0))) {
			case 1:
				return a || b ? 1 : 0;
			case 2:
				return a !== b ? 1 : 0; // XOR
			case 3:
				return a && b ? 0 : 1; // NAND
			case 4:
				return a || b ? 0 : 1; // NOR
			default:
				return a && b ? 1 : 0; // AND
		}
	},
	/* The other way round. Its own module rather than a sixth entry in LOGIC's
	   list, because it takes one operand: folding it in would leave a B socket
	   that does nothing whenever NOT is picked, and a socket that means nothing
	   is worse than a card that does one thing. Unwired it reads true, which is
	   NOT of the false an empty socket is. */
	not: (i) => (i.get('a', 0) !== 0 ? 0 : 1),
	/* Bounds in either order. Written the obvious way, MIN 100 with MAX 0 pins
	   the output at 100 for every input -- the node silently becomes a constant
	   and the card still looks like a working clamp. Sorting them means the two
	   knobs name a range rather than an order. */
	clamp: (i, p) => {
		/* Each bound is a socket with a field behind it: `i.get` takes the cable
		   when there is one and the typed number when there is not, which is what
		   makes a limit both something you write down and something that can move
		   with the note. */
		const lo = i.get('lo', p('lo', 0));
		const hi = i.get('hi', p('hi', 1));
		return Math.min(Math.max(i.get('a', 0), Math.min(lo, hi)), Math.max(lo, hi));
	},
	/* A value bent on its way through.
	
	   Every shape maps 0..1 to 0..1 and leaves both ends alone, so changing one
	   for another moves how a sweep travels and never where it starts or stops.
	   Outside that range the value passes through untouched: shaping is defined
	   on the unit interval, and a fractional power of a negative base is NaN. */
	map: (i, p) => {
		/* Normalise, shape, scale.
		
		   The incoming range is mapped onto 0..1, the shape bends it there --
		   which is the only interval a shape is defined on -- and the result is
		   carried out to the outgoing range. That is REMAP and CURVE as one node,
		   because they were one operation: the two cards differed only in whether
		   the line between the ends was straight, and a patch nearly always
		   wanted both. Velocity 0..1 into a cutoff 200..8000, opening late, is
		   one card now rather than two. */
		const lo = p('inLo', 0);
		const hi = p('inHi', 1);
		const span = hi - lo;
		// A zero-width input range means "always the low end" rather than NaN.
		const raw = span === 0 ? 0 : (i.get('a', 0) - lo) / span;
		const x = span === 0 ? 0 : Math.max(0, Math.min(1, raw));
		const outLo = p('outLo', 0);
		const outHi = p('outHi', 1);
		/* No clamp on the way out.

		   Every shape below already returns 0..1, so this clamp could only ever
		   fire on a shape that deliberately leaves the unit interval -- and then
		   it truncated the result instead of carrying it. That is the one thing a
		   MAP must not do: the shape is a function, and where its output lands is
		   the Y range's business alone. A shape reaching 1.2 with Y set to 0..100
		   means 120, not 100. */
		const out = (y: number) => outLo + y * (outHi - outLo);
		/* Indexed by position in MAP_SHAPES, which is the list the card selects
		   from. Kept in the same order for the same reason the waveforms are: two
		   hand-written copies of one order disagree, and the one nobody corrects
		   is the one that draws. A test pins the two together. */
		const stair = (n: number) => Math.min(n - 1, Math.floor(x * n)) / (n - 1);
		switch (Math.round(p('shape', 0))) {
			case 1:
				return out(x * x); // EXP
			case 2:
				return out(x * x * x * x); // EXP2, the harder knee
			case 3:
				return out(Math.sqrt(x)); // LOG
			case 4:
				return out(Math.pow(x, 0.25)); // LOG2
			case 5:
				return out(x * x * (3 - 2 * x)); // EASE, slow at both ends
			case 6:
				return out(stair(4));
			case 7:
				return out(stair(8));
			case 8:
				return out(1 - x); // INV
			case 9: {
				/* Drawn by hand: the shape is a run of points, read through the same
				   `p` every knob uses because a table is stored as its own numbered
				   keys. Between two points it interpolates, so a curve drawn at
				   sixteen resolution does not arrive as sixteen steps.
				
				   Undrawn it is a line. A DRAW that has not been drawn should do
				   nothing rather than flatten what passes through it. */
				const n = Math.max(2, Math.round(p('drawN', 0)));
				if (!p('drawN', 0)) return out(x);
				const at = (k: number) => p(`d${Math.max(0, Math.min(n - 1, k))}`, k / (n - 1));
				const f = x * (n - 1);
				const k0 = Math.floor(f);
				return out(at(k0) + (at(k0 + 1) - at(k0)) * (f - k0));
			}
			case 10: {
				/* WRAP: out the top and back in at the bottom.
				
				   The one shape that reads `raw` rather than `x`, because it is
				   defined by what happens *outside* the range -- every other case
				   here is handed an already-clamped value, and clamping is exactly
				   what this does not do. An input of 2.5 comes out at 0.5, and one
				   of -0.25 at 0.75.
				
				   `((v % 1) + 1) % 1` rather than `v % 1`, since JavaScript's
				   remainder keeps the sign of the dividend: -0.25 % 1 is -0.25, and
				   a phase of minus a quarter turn is three quarters of one. OSC's
				   PHS does the same arithmetic for the same reason. */
				return out(((raw % 1) + 1) % 1);
			}
			default:
				/* GATE: one step, at the middle of the X range.
				
				   Written against the incoming value and `(lo + hi) / 2` rather than
				   against the normalised `x` and a literal 0.5. The two agree
				   arithmetically -- normalising is what makes them agree -- but only
				   one of them says where the threshold comes from. A constant in the
				   function reads as a preset the shape is holding; derived from the
				   range, it is visibly the same X.LO and X.HI the card shows, and
				   moving either moves the step.
				
				   The comparison happens before the clamp for the same reason: an
				   input below X.LO is below the midpoint and an input above X.HI is
				   above it, which is what clamping would have said anyway. */
				/* A zero-width range has no midpoint to be on either side of, and
				   the rest of this node reads that case as "always the low end" --
				   so this does too, rather than stepping high on every input
				   because `a >= lo` is trivially true when lo and hi are equal. */
				return out(span === 0 || i.get('a', 0) < (lo + hi) / 2 ? 0 : 1);
		}
	}
};

/**
 * Nodes whose function lives in `PURE_NODES` but which are not pure.
 *
 * MAP is the one. Its curve is the shape of a transfer function, and a
 * transfer function has to be applied to every sample or it cannot shape a
 * waveform at all -- as a pure node it read a signal at its inlet as the
 * fallback, so a wave arriving there vanished rather than being bent.
 *
 * It is built as a WaveShaperNode now, and the table is filled by calling the
 * entry below: the engine, the resolver and the card's preview all run one
 * function, which is what stops the drawn curve and the heard curve drifting
 * apart. So the row stays and only the classification changes.
 */
const NOT_PURE = new Set(['map', 'nodecv']);

/**
 * Does this node hand back a value rather than build audio?
 *
 * Two questions wear one name, and MAP is where they came apart.
 *
 * The *engine* asks it to decide whether to build anything: a node with a
 * value has no audio to make. The *resolver* asks it to decide whether a cable
 * carries a number to be pulled or a signal to be connected. For every other
 * node the answers agree, because a node either computes or it sounds.
 *
 * MAP does both, and has to. Its curve is a transfer function: fed ENTRY's
 * velocity it is one number per note, and fed a waveform it has to bend every
 * sample or it is not shaping anything. Neither use is the odd one -- velocity
 * into a cutoff is the commonest patch in the instrument, and a wave through a
 * curve is what a shaper is.
 *
 * So `isPureNode` answers the engine's question and `isValueNode` the
 * resolver's. MAP is a value node and not a pure one: it is pullable, so a
 * chain of values through it resolves end to end, and it is buildable, so a
 * signal through it is shaped per sample. Which happens is decided per cable by
 * what sits at the far end, which is the rule `read` already applied.
 */
export function isPureNode(type: string): boolean {
	return type in PURE_NODES && !NOT_PURE.has(type);
}

/** Can this node's output be pulled as a number? See `isPureNode`. */
export function isValueNode(type: string): boolean {
	return type in PURE_NODES;
}

/** What ENTRY publishes about the note that is playing. */
export interface NoteEvent {
	pitch: number;
	/**
	 * What A4 is, in hertz.
	 *
	 * The instrument's master tuning, so a patch converting pitch to frequency
	 * agrees with the rest of the synth by default. A converter can still name
	 * its own reference -- an ensemble tuned to A=415 against a modern one is a
	 * real thing to want -- but the setting is where it starts.
	 */
	tuning?: number;
	velocity: number;
	noteIndex: number;
	gate: number;
	/** One value per lane the track carries, keyed by lane id. */
	lanes: Record<string, number>;
}

/**
 * A resolver for one note.
 *
 * Values are pulled, not pushed: nobody runs a pure node, its consumer asks it
 * for a number and it asks its own inputs in turn. That is how Blueprint
 * evaluates a pure node, and it means the arithmetic costs nothing when nothing
 * reads it.
 *
 * Memoised per note, so a value feeding three knobs is computed once. Cycles
 * are caught by tracking the path rather than by counting depth: a hand-edited
 * patch file can hold a loop the editor would refuse to draw, but so can a
 * perfectly legitimate chain of forty additions, and a depth cutoff cannot tell
 * them apart -- it answered 0 for the long chain, memoised that 0, and then
 * handed it to every later reader, so the same node gave different answers
 * depending on which query happened to run first.
 */
export function createResolver(
	graph: EvalGraph,
	params: Record<string, number>,
	note: NoteEvent,
	entryType = 'in'
) {
	const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
	const entryIds = new Set(graph.nodes.filter((n) => n.type === entryType).map((n) => n.id));
	const memo = new Map<string, number>();

	/* Cables into a given inlet, indexed once: a patch with two hundred cables
	   was being scanned end to end for every socket of every node. */
	const feeds = new Map<string, EvalCable>();
	for (const c of graph.cables) {
		const key = `${c.to}.${c.toPort}`;
		if (!feeds.has(key)) feeds.set(key, c);
	}

	const param = (nodeId: string) => (key: string, def: number) => params[`${nodeId}.${key}`] ?? def;

	/** What ENTRY hands out. Lane outlets are named `lane:<id>`. */
	function entryValue(port: string, fallback: number): number {
		/* A pitch, in semitones from the tuning reference -- not a frequency.
		   An oscillator takes Hz, so a patch converts explicitly through FREQ,
		   which is where the tuning decision lives. */
		if (port === 'pitch') return note.pitch;
		if (port === 'vel') return note.velocity;
		if (port === 'note') return note.noteIndex;
		if (port === 'gate') return note.gate;
		if (port.startsWith('lane:')) return note.lanes[port.slice(5)] ?? fallback;
		return fallback;
	}

	/* The nodes on the path currently being pulled. A node that appears twice
	   closes a cycle, which the editor will not draw but a hand-edited patch
	   file can contain. */
	const onPath = new Set<string>();
	/* Has the pull currently in progress touched a cycle?
	
	   Not memoising the node that closes the loop is not enough on its own: its
	   *ancestors* computed real-looking numbers out of that placeholder zero,
	   and memoising those hands the same poison to every later reader. Whichever
	   end of the loop was queried first got one answer and the other end got
	   another, so a patch played differently depending on the order its nodes
	   happened to sit in the file -- which is exactly the order-dependence the
	   path check replaced a depth counter to be rid of.
	
	   The counter rises when a cycle is found and falls when the pull that found
	   it unwinds, so a value is written down only if nothing under it was
	   guesswork. */
	let cycleHits = 0;

	function valueOf(nodeId: string): number {
		const hit = memo.get(nodeId);
		if (hit !== undefined) return hit;
		const node = nodeById.get(nodeId);
		if (!node) return 0;
		const fn = PURE_NODES[node.type];
		// A node with no entry has no value to pull: its output is sound, and
		// sound is carried by the audio graph rather than computed here.
		if (!fn) return 0;
		/* Part of a cycle. Zero, and deliberately not memoised: this node's real
		   value is undefined rather than zero, and writing the zero down would
		   hand it to every later reader as though it were settled. */
		if (onPath.has(nodeId)) {
			cycleHits++;
			return 0;
		}
		onPath.add(nodeId);
		const before = cycleHits;
		const p = param(nodeId);
		const inputs: ResolvedInputs = {
			get: (port, fallback) => read(nodeId, port, fallback)
		};
		const v = fn(inputs, p, note);
		onPath.delete(nodeId);
		const out = Number.isFinite(v) ? v : 0;
		// Only settled if no cycle was met anywhere beneath this pull.
		if (cycleHits === before) memo.set(nodeId, out);
		return out;
	}

	/**
	 * What arrives at one inlet.
	 *
	 * In order: the cable if one is drawn, then the node's own stored setting,
	 * then the caller's default. The middle step is what makes a knob an inlet
	 * -- `in('cutoff', 800)` returns whatever the knob was turned to, and the
	 * 800 is only the value for a knob that has never been touched. Skipping it
	 * would hand back the code default and quietly ignore every setting in the
	 * patch file.
	 */
	/**
	 * Does a signal land on this inlet -- something connected rather than read?
	 *
	 * The distinction the two mechanisms turn on. A value cable is already in
	 * the number by the time a module reads its knob, because `read` returned it
	 * instead of the stored setting. A signal cable is not: it is connected to
	 * the AudioParam afterwards and *sums* with whatever the knob holds.
	 *
	 * Recursive, because MAP made the question two-sided. MAP is a value node
	 * and also builds audio: fed ENTRY's velocity it is a number pulled once,
	 * fed a waveform it is a WaveShaperNode bending every sample. So what comes
	 * *out* of it is a signal exactly when what went *in* was one, and asking
	 * only about the node's type answered for the wrong half.
	 *
	 * `seen` guards the walk: a hand-edited patch can hold a cycle the editor
	 * would refuse to draw, and a cycle here would recurse until the stack ran
	 * out rather than returning a wrong answer.
	 */
	function emitsSignal(nodeId: string, port: string, seen: Set<string>): boolean {
		const c = feeds.get(`${nodeId}.${port}`);
		if (!c) return false;
		// ENTRY publishes the note's data as values, never as signals.
		if (entryIds.has(c.from)) return false;
		const type = nodeById.get(c.from)?.type ?? '';
		// Anything with no value to pull is sound: an OSC, a FILTER, an ENV.
		if (!isValueNode(type)) return true;
		// A pure node is always a number, whatever reaches it.
		if (isPureNode(type)) return false;
		/* What is left is the dual kind -- MAP -- which is a signal only when it
		   is carrying one. Ask its own inlets. */
		if (seen.has(c.from)) return false;
		seen.add(c.from);
		for (const [key, feed] of feeds) {
			if (!key.startsWith(`${c.from}.`)) continue;
			void feed;
			if (emitsSignal(c.from, key.slice(c.from.length + 1), seen)) return true;
		}
		return false;
	}

	function read(nodeId: string, port: string, fallback: number): number {
		/* A stored value that is not a number is not a value. `valueOf` guards
		   what it computes, but a param read straight off the patch went through
		   untouched -- and a NaN cutoff reaches `frequency.value`, where Web
		   Audio throws and takes the whole note with it. A patch file is user
		   data; the fallback is what an absent knob means, and so is a broken
		   one. */
		const stored = params[`${nodeId}.${port}`];
		const own = Number.isFinite(stored) ? (stored as number) : fallback;
		const c = feeds.get(`${nodeId}.${port}`);
		if (c) {
			if (entryIds.has(c.from)) return entryValue(c.fromPort, fallback);
			/* A cable from something with no value to pull -- an ENV, an LFO, a
			   filter's output -- is a *signal*, and the engine connects it to the
			   knob's AudioParam so it adds to whatever the knob is set to. The
			   knob keeps its own value as the base.
			
			   Returning 0 here is what made "ENV into the cutoff" silent: the
			   filter opened at 0 Hz and the envelope added its 0..1 on top, so a
			   patch anyone would try first played nothing. */
			if (!isValueNode(nodeById.get(c.from)?.type ?? '')) return own;
			return valueOf(c.from);
		}
		return own;
	}

	return {
		/**
		 * The value a node should use for one of its inputs.
		 *
		 * Every module reads through this and none reaches past it, which is what
		 * makes "unwired falls back to the default" true everywhere at once
		 * rather than in each place someone remembered to write it.
		 */
		input: (nodeId: string, port: string, fallback: number) => read(nodeId, port, fallback),
		/** Is anything wired into this inlet? For modules that branch on it. */
		isWired: (nodeId: string, port: string) => feeds.has(`${nodeId}.${port}`),
		/**
		 * Is a *signal* landing on this inlet -- something that will be connected
		 * rather than read?
		 *
		 * The distinction the two mechanisms turn on. A value cable is already in
		 * the number by the time a module reads its knob, because `read` returned
		 * it instead of the stored setting. A signal cable is not: it is connected
		 * to the AudioParam afterwards and *sums* with whatever the knob holds.
		 *
		 * That summing is right for a VCA -- the knob is the resting level and an
		 * envelope opens it from there -- and wrong for everything a player
		 * expects a patch cable to do, which is take over. Telling the two apart
		 * here means the engine can hand back the operation's identity for a knob
		 * a signal has claimed, so the cable is what is heard.
		 */
		isDrivenBySignal: (nodeId: string, port: string) => emitsSignal(nodeId, port, new Set()),
		param
	};
}

export type Resolver = ReturnType<typeof createResolver>;

/**
 * Which nodes execution reaches, following the exec cables from ENTRY.
 *
 * An empty exec socket means the node does not run. There is no "unless the
 * patch has no exec cables at all" exemption: that was tried, on the reasoning
 * that a bare source into OUT should play without a second cable, and it makes
 * the pin decorative in precisely the case where it is empty -- OUT sitting
 * with nothing on its exec socket, sounding anyway. A pin that only means
 * something once you have used it elsewhere means nothing.
 *
 * The seed patch draws the cable, so the simplest patch is still one you can
 * play without building it.
 */
export function execReach(
	graph: EvalGraph,
	execPorts: ReadonlySet<string>,
	entryType = 'in',
	/**
	 * Does this WHEN's test hold for this note?
	 *
	 * Optional because the test needs things only the engine knows -- which
	 * voices are sounding right now. Left out, every branch is taken, which is
	 * what the editor and the structural tests want: they ask which nodes a
	 * patch *can* reach, not which it reaches this time.
	 *
	 * Supplied, a WHEN whose test fails stops execution at that node. It used to
	 * branch only on the action side, so `noteActions` and `execReach` gave
	 * different answers about the same white cable: a patch gating *sound* on a
	 * WHEN muted correctly and played every note anyway.
	 */
	whenHolds?: (nodeId: string) => boolean
): {
	gated: boolean;
	reached: Set<string>;
} {
	const execCables = graph.cables.filter(
		(c) => execPorts.has(c.toPort) && execPorts.has(c.fromPort)
	);
	const typeOf = new Map(graph.nodes.map((n) => [n.id, n.type]));

	const reached = new Set<string>();
	const queue = graph.nodes.filter((n) => n.type === entryType).map((n) => n.id);
	for (const id of queue) reached.add(id);
	while (queue.length) {
		const id = queue.shift()!;
		/* A WHEN is reached -- it ran, and it asked -- but execution only leaves
		   it by the outlet its answer chose. With no test to consult, both go. */
		if (whenHolds && typeOf.get(id) === 'when' && !whenHolds(id)) continue;
		for (const c of execCables) {
			if (c.from !== id || reached.has(c.to)) continue;
			reached.add(c.to);
			queue.push(c.to);
		}
	}
	return { gated: true, reached };
}

/** Does this node run for this note? */
export function runs(reach: { gated: boolean; reached: Set<string> }, id: string): boolean {
	return !reach.gated || reach.reached.has(id);
}

/**
 * How long after the note each node runs, following the exec cables.
 *
 * WAIT is the only node that moves this, and it is a delay rather than a
 * sequence. The name was SEQ, after Blueprint's Sequence, and that was a claim
 * the module could not meet: Sequence orders several branches, and this holds
 * one of them back. With a single outlet there is no order to speak of -- what
 * you can say is "this part starts late", which is what the module does and
 * what it is now called.
 *
 * The thing it is for is a flam, a grace note, or the two layers a sampled kick
 * is built from: some of the patch starting behind the rest. Note that it
 * cannot make one source sound twice -- see the note below on why the delay
 * flows back along the audio cables, and why two strikes need two sources.
 *
 * Not to be confused with SHAPE's DELAY, which is a delay *line*: that one
 * holds audio and hands it back later, leaving the original in place. This one
 * moves when a node starts, and nothing is duplicated.
 *
 * The earliest arrival wins, as it would in Blueprint: a node reached by two
 * paths runs at the first of them.
 */
export function execDelays(
	graph: EvalGraph,
	params: Record<string, number>,
	execPorts: ReadonlySet<string>,
	entryType = 'in'
): Map<string, number> {
	const execCables = graph.cables.filter(
		(c) => execPorts.has(c.toPort) && execPorts.has(c.fromPort)
	);
	const at = new Map<string, number>();
	if (!execCables.length) return at;

	const gapOf = (id: string) => {
		const n = graph.nodes.find((m) => m.id === id);
		if (n?.type !== 'wait') return 0;
		/* Finite, because this becomes a `start()` time. `Math.max(0, NaN)` is
		   NaN, so the floor alone let one through -- and `start(NaN)` throws,
		   which aborts the note mid-build rather than playing it early. JSON
		   cannot carry a NaN, but `setGraphParam` can. */
		const raw = params[`${id}.gapMs`];
		return Number.isFinite(raw) ? Math.max(0, raw as number) / 1000 : 0;
	};

	const queue = graph.nodes.filter((n) => n.type === entryType).map((n) => n.id);
	for (const id of queue) at.set(id, 0);
	let guard = 0;
	while (queue.length && guard++ < 4096) {
		const id = queue.shift()!;
		const after = (at.get(id) ?? 0) + gapOf(id);
		for (const c of execCables) {
			if (c.from !== id) continue;
			const prev = at.get(c.to);
			if (prev !== undefined && prev <= after) continue;
			at.set(c.to, after);
			queue.push(c.to);
		}
	}

	/* Now carry it back up the audio graph.
	
	   Only WAIT, WHEN, ACT and OUT have exec inlets -- sound modules deliberately
	   have none, because THEN is logic and not part of the signal path -- so the
	   walk above assigns a delay to nodes that make no sound and to nothing that
	   does. Every source started at the note however the gap was set, and WAIT,
	   whose whole purpose is the flam, produced a byte-identical render at 0 ms
	   and at 200 ms.
	
	   An OUT that execution reaches late means everything feeding that OUT
	   sounds late, so the delay flows backwards along the audio cables from it.
	
	   A node feeding two OUTs takes the earlier, and this is a real limit rather
	   than a choice: the node is built once and an AudioScheduledSourceNode
	   starts once, so it cannot be both on the beat and 200 ms behind it. One
	   EXCT into an early OUT and a late one is therefore heard twice at the same
	   instant -- no flam. Two EXCTs, one per OUT, gives the flam, and is also
	   what a flam is: two strikes.
	
	   Duplicating the upstream nodes per delay would make the single-source
	   patch work, at the cost of a voice whose node count multiplies with its
	   OUTs and whose two copies drift apart the moment one is edited. Not worth
	   it for a shape that reads as one strike and means two. */
	const audioFeeds = graph.cables.filter((c) => !execPorts.has(c.toPort));
	const back = [...at.keys()].filter((id) => {
		const t = graph.nodes.find((n) => n.id === id)?.type;
		return t === 'out';
	});
	guard = 0;
	while (back.length && guard++ < 4096) {
		const id = back.shift()!;
		const t = at.get(id) ?? 0;
		for (const c of audioFeeds) {
			if (c.to !== id) continue;
			const prev = at.get(c.from);
			if (prev !== undefined && prev <= t) continue;
			at.set(c.from, t);
			back.push(c.from);
		}
	}
	return at;
}
