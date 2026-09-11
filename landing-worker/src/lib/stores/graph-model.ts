/**
 * The patch graph as data: types, and the questions you can ask of a graph
 * without an audio engine to hand.
 *
 * Split out of synth-graph so it can be tested. The rest of that module edits
 * the active track, which needs Web Audio and the SvelteKit runtime; none of
 * what is here does, and the two rules that matter most -- which cables are
 * legal, and what order nodes are built in -- are exactly the parts worth
 * pinning down with tests.
 */
/**
 * What a socket carries.
 *
 * Two families, and the family is what decides whether a cable is legal:
 * `audio` is sound, `mod` is control. That distinction is not cosmetic -- the
 * engine sorts audio cables topologically and refuses cycles in them, while mod
 * cables are connected afterwards, land on AudioParams, and may cycle.
 *
 * Within a family the *role* says what it is for. A role never blocks a cable
 * on its own; it drives what you see -- socket colour and shape, wire colour,
 * and what the search offers when you drag into empty space -- so that "what
 * can I plug in here" is answerable before you try it rather than after.
 */
/* Three families of cable, after Unreal's Blueprints.
 *
 *   exec  -- execution. Which modules this note runs, in what order. White.
 *   audio -- sound.
 *   mod   -- control values.
 *
 * The split is the whole point. Before it, a source scheduled its envelope
 * against the note time and sounded whether or not anything was patched into
 * it: ENTRY could sit unwired and the drum still played, so editing the canvas
 * changed nothing you could hear. Execution being its own wire is what makes a
 * cable mean something -- an unreached module never runs. */
export type PortKind = 'exec' | 'audio' | 'mod';

export type PortRole =
	/** Ordinary sound, mono or stereo -- whatever arrives. */
	| 'signal'
	/** Sound that is definitely one channel. */
	| 'mono'
	/** Sound that is definitely two: a pair travelling one cable. */
	| 'stereo'
	/** One side of a split pair. */
	| 'left'
	| 'right'
	/** A control voltage: an envelope, an LFO, anything that drives a param. */
	| 'cv'
	/** A frequency in Hz: a continuous quantity an oscillator can take. */
	| 'hz'
	/**
	 * A pitch: a place on a scale, counted in semitones.
	 *
	 * Not the same type as a frequency, and not interchangeable with one. Pitch
	 * to frequency is exact; frequency to pitch is a quantisation, and which
	 * note 452 Hz "is" depends on a tuning reference and a rounding rule. Making
	 * them one type would hide that decision inside whichever module happened to
	 * do the conversion -- so the conversion is a node you can see, and an
	 * oscillator takes the frequency because that is what it oscillates at.
	 */
	| 'pitch'
	/** How hard, how much: 0..1. */
	| 'unit'
	/** A count of something -- a key, a step, a mode. */
	| 'index'
	/** A length of time. */
	| 'time'
	/**
	 * True or false.
	 *
	 * A control value like any other -- it travels a `mod` cable and is carried
	 * as a number, zero for false and anything else for true -- but its own role
	 * so the lattice can say where it belongs. A comparison hands one out and a
	 * branch takes one in; sending a cutoff frequency to a branch, or a truth to
	 * a filter, is a patch that means nothing, and this is what lets the canvas
	 * say so before the cable is drawn rather than after it is heard.
	 */
	| 'bool'
	/** Blueprint's white execution pin: this module runs when the note fires. */
	| 'exec';

export interface PortSpec {
	id: string;
	label: string;
	kind: PortKind;
	/** Defaults to the family's ordinary role: `signal` for audio, `cv` for mod. */
	role?: PortRole;
}

/** The role a port plays, falling back to its family's ordinary one. */
export function roleOf(p: { kind: PortKind; role?: PortRole }): PortRole {
	if (p.role) return p.role;
	if (p.kind === 'exec') return 'exec';
	return p.kind === 'audio' ? 'signal' : 'cv';
}

/* Which roles may meet.
 *
 * Deliberately permissive inside a family: L into a mono inlet is a real patch
 * (take the left side and carry on in mono), and an envelope into any param is
 * the point of a modular. What it refuses is the pair that is never meaningful
 * -- sound into a control inlet, or a trigger into something expecting a level
 * -- which is what the two families already encoded. Roles sharpen the message
 * and the highlighting rather than adding new prohibitions. */
export function rolesCompatible(from: PortRole, to: PortRole): boolean {
	const family = (r: PortRole): 'exec' | 'audio' | 'control' => {
		if (r === 'exec') return 'exec';
		if (r === 'signal' || r === 'mono' || r === 'stereo' || r === 'left' || r === 'right')
			return 'audio';
		return 'control';
	};
	// Like joins like. Execution is not sound and sound is not a value; a cable
	// between two of them could not carry anything, so it is not drawn.
	if (family(from) !== family(to)) return false;
	if (family(from) === 'audio') {
		/* One channel and two are different types, and converting between them
		   is a node you can see.
		
		   Web Audio would fold a pair into a mono inlet and centre a single into
		   a stereo one without saying so, which is convenient and hides what
		   happened: a patch that sounds narrow gives no hint that a stereo stage
		   was collapsed three modules upstream. Refusing the cable puts MONO or
		   MERGE on the canvas, where the conversion is visible and movable.
		
		   `signal` stays permissive, for the modules that take whatever arrives
		   and hand back the same shape: a filter does not care how many channels
		   it is given, and making every one of them declare a width would be
		   noise rather than information. */
		if (from === 'signal' || to === 'signal') return true;
		/* Width is the only thing that discriminates, and `left`, `right` and
		   `mono` are all one channel.
		
		   Grouping the sides with `stereo` was the obvious reading and made three
		   ordinary patches undrawable: MONO could not reach OUT at all -- the one
		   thing the module exists to do -- and neither BREAK's MID into MERGE nor
		   SPLIT's L into MAKE would connect, so the two decompose/recompose pairs
		   were walled off from each other. A side of a split pair is a single
		   channel; that is what splitting it produced. */
		const width = (r: PortRole) => (r === 'stereo' ? 2 : 1);
		return width(from) === width(to);
	}
	/* A pitch is not a frequency.
	
	   One is a place on a scale, the other a rate in hertz. Converting is FREQ
	   or PITCH on the canvas: one direction is exact and the other quantises,
	   and which note a stray frequency becomes depends on a tuning reference and
	   a rounding rule. Both are decisions worth seeing rather than ones made
	   silently inside whichever module happened to take the cable. */
	if (from === 'pitch' || to === 'pitch') return from === 'pitch' && to === 'pitch';
	/* A truth is not a quantity.
	
	   Kept apart for the same reason a pitch is: a comparison hands out yes or
	   no, and a cutoff frequency arriving at a branch is a patch that means
	   nothing -- 4000 is not more true than 800. Every other control role is
	   some amount of something and they convert into each other by arithmetic;
	   this one does not, so it only meets its own kind. */
	if (from === 'bool' || to === 'bool') return from === 'bool' && to === 'bool';
	/* A count is not a proportion.

	   `index` is a whole number of things -- a key, a step, a mode -- and the
	   roles it was meeting are all continuous. Arithmetic converts between an
	   amount and a rate; it does not turn "the 60th key" into a fraction of a
	   turn, and the CONST types that carry an index step by 1, so an inlet
	   wanting 0..1 could only ever be handed 0 or 1 from one.

	   This was drawable and silently useless: an I32 of 1 into OSC's PHS is a
	   whole turn, which wraps to no rotation at all, so the cable was visible,
	   the inlet lit, and the sound identical to nothing being patched. The
	   lattice is what says so before the cable is drawn rather than after it is
	   not heard.

	   Not walled off the way `pitch` and `bool` are: an index is still a
	   quantity, so it meets `cv` -- the untyped real number every arithmetic
	   node hands out -- and MAP is the conversion you can see when a count has
	   to become an amount. What it refuses is the inlets that named a unit it
	   cannot satisfy. */
	if (from === 'index' || to === 'index') {
		const other = from === 'index' ? to : from;
		return other === 'index' || other === 'cv';
	}
	return true;
}

export interface GraphNode {
	/** Unique within the patch; cables refer to it. */
	id: string;
	type: string;
	/** Canvas position, in grid units rather than pixels so a zoom cannot drift it. */
	x: number;
	y: number;
}

export interface GraphCable {
	from: string;
	fromPort: string;
	to: string;
	toPort: string;
}

export interface RackGraph {
	nodes: GraphNode[];
	cables: GraphCable[];
}

export const EMPTY_GRAPH: RackGraph = { nodes: [], cables: [] };

/* ENTRY and OUTPUT are the two ends of every patch, so they are not things you
   add -- a graph without them has nowhere for the note to arrive and nowhere
   for the sound to leave. Every new graph starts with the pair already wired,
   and neither can be deleted.
   
   Their ids are fixed rather than generated: a patch file that names them can
   be read back, and there is only ever one of each. */
export const ENTRY_ID = 'entry';
export const OUTPUT_ID = 'output';

/** The oscillator every blank patch starts as. */
export const SEED_OSC_ID = 'osc-1';

/** The pitch-to-frequency converter every blank patch starts with. */
export const SEED_FREQ_ID = 'freq-1';

/**
 * A new patch: the smallest thing that plays.
 *
 * An oscillator following the keyboard into the output. A blank canvas is the
 * honest starting point and the useless one: it says nothing about how the
 * pieces go together, and the first thing anyone does is rebuild this by hand
 * before they can hear anything at all.
 *
 * It also shows the two rules easiest to miss. PITCH is a cable -- unplug it and
 * the oscillator holds its own frequency, which is what makes a drone or a drum.
 * And the white wire is not a sound: it is what makes OUT run, so a patch wired
 * correctly for audio and missing that one is silent.
 */
export function startingGraph(): RackGraph {
	return {
		/* Spaced for the cards as they actually draw. A card is its controls plus
		   the gutters its port labels need, so TO-FREQ (a PITCH inlet and a FREQ
		   outlet) is far wider than the 176 the old spacing assumed -- and at 192
		   apart the oscillator sat on top of the output. */
		nodes: [
			{ id: ENTRY_ID, type: 'in', x: 48, y: 128 },
			{ id: SEED_FREQ_ID, type: 'tofreq', x: 320, y: 184 },
			{ id: SEED_OSC_ID, type: 'osc', x: 640, y: 128 },
			{ id: OUTPUT_ID, type: 'out', x: 960, y: 128 }
		],
		cables: [
			/* Execution first: OUT hands the patch to the master when the note
			   runs it, so without this the sound arrives and is never let out. */
			{ from: ENTRY_ID, fromPort: 'then', to: OUTPUT_ID, toPort: 'exec' },
			/* The note is a pitch; an oscillator takes a frequency. The converter
			   between them is the third module here rather than something the
			   oscillator does quietly, because the tuning reference is a choice. */
			{ from: ENTRY_ID, fromPort: 'pitch', to: SEED_FREQ_ID, toPort: 'a' },
			{ from: SEED_FREQ_ID, fromPort: 'out', to: SEED_OSC_ID, toPort: 'pitch' },
			{ from: SEED_OSC_ID, fromPort: 'out', to: OUTPUT_ID, toPort: 'in' }
		]
	};
}

/** ENTRY and OUTPUT stay: removing either would break the patch. */
export function isFixedNode(id: string): boolean {
	return id === ENTRY_ID || id === OUTPUT_ID;
}

/* Port ids that were renamed, and what they are now.
 *
 * MIX called its second inlet `in2` while every other two-inlet module called
 * the same thing `b`, so the id you needed depended on which module you were
 * wiring. Saved patches still name the old one; a cable pointing at a port that
 * no longer exists draws to nowhere and carries no sound, so they are rewritten
 * on load rather than left to fail quietly. */
const RENAMED_PORTS: Record<string, string> = { in2: 'b' };

/**
 * The graph as the editor should see it: always with both of its ends.
 *
 * ENTRY and OUTPUT are not optional and not addable -- they are missing from
 * the palette on purpose -- so a canvas without them cannot be built on: there
 * is nowhere for the note to arrive and nowhere for the sound to leave. Rather
 * than have every path that creates a track remember to seed them (which is
 * exactly what one of them forgot, leaving a fresh ADV track staring at a blank
 * canvas), they are guaranteed here, where every reader passes.
 *
 * A graph is only ever read through this, so restoring a missing end is enough
 * -- nothing downstream has to check. The pair is placed where startingGraph
 * puts them, and are only cabled to each other when the canvas was otherwise
 * empty: joining them across someone's existing patch would invent a
 * connection they did not make.
 */
export function graphOf(track: { rackGraph?: RackGraph } | undefined): RackGraph {
	const g = track?.rackGraph;
	if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.cables)) return startingGraph();

	const cables = g.cables.some((c) => RENAMED_PORTS[c.toPort] || RENAMED_PORTS[c.fromPort])
		? g.cables.map((c) => ({
				...c,
				fromPort: RENAMED_PORTS[c.fromPort] ?? c.fromPort,
				toPort: RENAMED_PORTS[c.toPort] ?? c.toPort
			}))
		: g.cables;

	/* By type as well as by id. Matching the fixed id alone meant a patch whose
	   ENTRY was saved under any other id got a *second* one injected beside it,
	   and two ENTRYs both publish a full set of event pins. */
	const hasEntry = g.nodes.some((n) => n.id === ENTRY_ID || n.type === 'in');
	const hasOutput = g.nodes.some((n) => n.id === OUTPUT_ID || n.type === 'out');
	if (hasEntry && hasOutput) return cables === g.cables ? g : { nodes: g.nodes, cables };

	/* Nothing on the canvas at all: this is a new patch, so it becomes the seed
	   rather than a bare pair of endpoints with the seed's cables pointing at an
	   oscillator that was never added. */
	if (g.nodes.length === 0) return startingGraph();

	/* Restore whichever end is missing.
	
	   By id, not by position: the seed patch has an oscillator in the middle of
	   it now, so `nodes[1]` is no longer the output and taking it by index would
	   graft an OSC onto a patch that only wanted its endpoint back. */
	const seed = startingGraph();
	const seedEntry = seed.nodes.find((n) => n.id === ENTRY_ID)!;
	const seedOutput = seed.nodes.find((n) => n.id === OUTPUT_ID)!;
	const nodes = [...g.nodes];
	if (!hasEntry) nodes.unshift(seedEntry);
	const restored = [...cables];
	if (!hasOutput) {
		// Clear of whatever is already there, so a restored end is not buried.
		const right = g.nodes.reduce((m, n) => Math.max(m, n.x), 0);
		nodes.push({ ...seedOutput, x: Math.max(seedOutput.x, right + 200) });
		/* And reach it, so restoring the end does not silence the patch.
		
		   An OUT with an empty exec socket does not run -- which is the rule --
		   so injecting one bare turned every patch that predates OUT from
		   audible into silent the moment it was migrated: it played when loaded,
		   and went quiet for good as soon as any node was touched and the
		   migrated graph was committed.
		
		   The entry is what execution starts from, so that is the cable to
		   draw. It is the one the seed patch draws too. */
		const entryId = nodes.find((n) => n.type === 'in' || n.id === ENTRY_ID)?.id;
		/* ENTRY's exec outlet is THEN; `exec` is the *inlet* name. Both are in
		   EXEC_PORT_IDS, so the traversal accepted the wrong one and the cable
		   worked -- but it named a socket ENTRY does not publish, which the
		   canvas draws cables from. The seed patch has always used `then`. */
		if (entryId) restored.push({ from: entryId, fromPort: 'then', to: OUTPUT_ID, toPort: 'exec' });
	}

	/* A restored ENTRY has to reach the ends too.
	
	   The `!hasOutput` branch above draws this cable because an OUT nothing
	   reaches does not run. The same is true from the other side: restoring a
	   missing ENTRY beside an OUT that was already there leaves that OUT with
	   an empty exec socket and the patch silent. Only where nothing already
	   reaches the end -- a patch with its own logic chain keeps it. */
	if (!hasEntry) {
		const entryId = nodes.find((n) => n.type === 'in' || n.id === ENTRY_ID)?.id;
		for (const out of nodes.filter((n) => n.type === 'out')) {
			const alreadyReached = restored.some((c) => c.to === out.id && c.toPort === 'exec');
			if (entryId && !alreadyReached) {
				restored.push({ from: entryId, fromPort: 'then', to: out.id, toPort: 'exec' });
			}
		}
	}

	return {
		nodes,
		// A patch that already has modules keeps its own wiring: the seed's
		// cables name nodes it does not have.
		cables: restored
	};
}

/**
 * Would this cable close an audio loop? Depth-first from the destination: if it
 * can already reach the source, the new cable completes a cycle.
 *
 * Only audio cables count, and the caller says which those are. Walking every
 * cable refused patches the engine builds happily: an envelope follower taps a
 * signal and drives a filter's cutoff with it, so a mod cable already runs from
 * the follower back towards the filter, and drawing the audio cable that feeds
 * it was reported as a cycle. The engine sorts audio cables alone and connects
 * mod cables afterwards precisely because those may loop.
 */
export function wouldCycle(
	graph: RackGraph,
	from: string,
	to: string,
	isAudio: (cable: GraphCable) => boolean = () => true
): boolean {
	const seen = new Set<string>();
	const stack = [to];
	while (stack.length) {
		const at = stack.pop()!;
		if (at === from) return true;
		if (seen.has(at)) continue;
		seen.add(at);
		for (const c of graph.cables) if (c.from === at && isAudio(c)) stack.push(c.to);
	}
	return false;
}

/**
 * The order to build nodes in: a node's inputs must exist before it does.
 * Kahn's algorithm over the audio cables only, since mod cables may cycle.
 * Returns null when the audio graph has a cycle, which the editor prevents but
 * a hand-edited patch file could still contain.
 */
export function topoOrder(graph: RackGraph, audioCables: GraphCable[]): GraphNode[] | null {
	const indeg = new Map<string, number>();
	for (const n of graph.nodes) indeg.set(n.id, 0);
	for (const c of audioCables) if (indeg.has(c.to)) indeg.set(c.to, (indeg.get(c.to) ?? 0) + 1);

	const queue = graph.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0);
	const out: GraphNode[] = [];
	while (queue.length) {
		const n = queue.shift()!;
		out.push(n);
		for (const c of audioCables) {
			if (c.from !== n.id) continue;
			const left = (indeg.get(c.to) ?? 0) - 1;
			indeg.set(c.to, left);
			if (left === 0) {
				const next = graph.nodes.find((m) => m.id === c.to);
				if (next) queue.push(next);
			}
		}
	}
	return out.length === graph.nodes.length ? out : null;
}

/**
 * A node's parameters live on the track, not on the node, keyed
 * `<nodeId>.<param>` -- the same key the engine reads in buildGraphNode.
 */
export function graphParamKey(nodeId: string, param: string): string {
	return `${nodeId}.${param}`;
}

export function getGraphParam(
	params: Record<string, number> | undefined,
	nodeId: string,
	param: string,
	def: number
): number {
	return params?.[graphParamKey(nodeId, param)] ?? def;
}

/** Drop a removed node's parameters, so a patch does not accumulate dead keys. */
export function pruneGraphParams(
	params: Record<string, number> | undefined,
	nodeId: string
): Record<string, number> {
	const out: Record<string, number> = {};
	const prefix = `${nodeId}.`;
	for (const [k, v] of Object.entries(params ?? {})) if (!k.startsWith(prefix)) out[k] = v;
	return out;
}

/** Is this cable already in the graph? Two identical cables are one connection. */
export function hasCable(graph: RackGraph, cable: GraphCable): boolean {
	return graph.cables.some(
		(c) =>
			c.from === cable.from &&
			c.fromPort === cable.fromPort &&
			c.to === cable.to &&
			c.toPort === cable.toPort
	);
}

/** A node's cables go with it; a cable to nothing is not a patch. */
export function withoutNode(graph: RackGraph, id: string): RackGraph {
	return {
		nodes: graph.nodes.filter((n) => n.id !== id),
		cables: graph.cables.filter((c) => c.from !== id && c.to !== id)
	};
}

/** Move a set of nodes by a delta, leaving the rest alone. */
export function moveNodes(graph: RackGraph, ids: Set<string>, dx: number, dy: number): RackGraph {
	return {
		...graph,
		nodes: graph.nodes.map((n) => (ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n))
	};
}

/** Drop a set of nodes and every cable touching them. ENTRY and OUTPUT stay. */
export function withoutNodes(graph: RackGraph, ids: Set<string>): RackGraph {
	const gone = new Set([...ids].filter((id) => !isFixedNode(id)));
	if (!gone.size) return graph;
	return {
		nodes: graph.nodes.filter((n) => !gone.has(n.id)),
		cables: graph.cables.filter((c) => !gone.has(c.from) && !gone.has(c.to))
	};
}

/**
 * Copy a set of nodes and the cables *between* them, ready to paste.
 *
 * Cables leaving the selection are dropped rather than dangling: a copy of half
 * a patch is a patch, not a patch with cables to modules that are not there.
 * ENTRY and OUTPUT are never copied -- there is only ever one of each.
 */
export function copyNodes(graph: RackGraph, ids: Set<string>): RackGraph {
	const take = new Set([...ids].filter((id) => !isFixedNode(id)));
	return {
		nodes: graph.nodes.filter((n) => take.has(n.id)).map((n) => ({ ...n })),
		cables: graph.cables.filter((c) => take.has(c.from) && take.has(c.to)).map((c) => ({ ...c }))
	};
}

/**
 * Paste a copied fragment, offset so it does not land exactly on the original.
 * Every node gets a fresh id, and the cables are rewritten to match, so a
 * fragment can be pasted any number of times.
 */
export function pasteNodes(
	graph: RackGraph,
	clip: RackGraph,
	offset: number,
	newId: (type: string) => string
): { graph: RackGraph; ids: Set<string> } {
	const remap = new Map<string, string>();
	const nodes = clip.nodes.map((n) => {
		const id = newId(n.type);
		remap.set(n.id, id);
		return { ...n, id, x: n.x + offset, y: n.y + offset };
	});
	const cables = clip.cables
		.map((c) => ({ ...c, from: remap.get(c.from) ?? c.from, to: remap.get(c.to) ?? c.to }))
		.filter((c) => remap.has(c.from) || remap.has(c.to));
	return {
		graph: { nodes: [...graph.nodes, ...nodes], cables: [...graph.cables, ...cables] },
		ids: new Set(remap.values())
	};
}

/** Which nodes fall inside a rectangle, for box selection. */
export function nodesInRect(
	graph: RackGraph,
	rect: { x: number; y: number; w: number; h: number },
	size: (node: GraphNode) => { w: number; h: number }
): string[] {
	const x2 = rect.x + rect.w;
	const y2 = rect.y + rect.h;
	return graph.nodes
		.filter((n) => {
			const s = size(n);
			// Any overlap counts, which is what a marquee is expected to do.
			return n.x < x2 && n.x + s.w > rect.x && n.y < y2 && n.y + s.h > rect.y;
		})
		.map((n) => n.id);
}
