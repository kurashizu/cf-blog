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

/**
 * A labelled rectangle drawn behind the nodes it encloses.
 *
 * Blueprint's comment box, and deliberately only that. It is a *view* over the
 * graph rather than a container in it: the nodes it covers stay top-level, stay
 * individually selectable, and the voice the engine builds is byte-identical
 * whether the box is there or not -- `buildGraphNode` never sees one, and
 * nothing in `topoOrder` or the cable rules knows the type exists.
 *
 * That is what keeps a group from becoming a module by the back door. The
 * catalogue's rule is that a module must be irreducible; a group is a saved
 * *arrangement* of irreducible things, so it must not acquire ports, an id that
 * a cable can name, or a place in the build order. A rectangle with a title has
 * none of those, which is exactly why it is the right shape for this.
 *
 * Membership is geometric rather than stored. A list of member ids has to be
 * maintained on every delete, paste and undo, and the moment it disagrees with
 * what is on screen the box owns nodes that are not in it -- whereas "what does
 * this rectangle enclose" cannot go stale because it is recomputed from the
 * only thing that was ever true. It is also what makes dragging a node in or
 * out of a box change its membership, which is what Blueprint does and what
 * anyone who has used one expects.
 */
export interface GraphGroup {
	id: string;
	/** Shown in the title bar. Uppercased by the editor, like every other name. */
	label: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** The box's tint, as a CSS colour. Prefabs carry their own. */
	color?: string;
	/**
	 * The nodes this box owns, by id.
	 *
	 * Ownership is *stored* rather than read off the geometry, and that is a
	 * deliberate reversal. Purely geometric membership made a box own whatever
	 * it happened to cover, which meant dragging a large group across the canvas
	 * silently stole every node it passed over -- and a node could be claimed by
	 * two overlapping boxes at once with nothing to say which won.
	 *
	 * So a node belongs to exactly one group, decided when the group is made and
	 * changed only by ungrouping. A box drawn over nodes that already belong to
	 * another leaves them where they are; to move a node between groups you
	 * ungroup the one that holds it, which releases its members, and group again.
	 * That is a stricter rule than Blueprint's, and it is the one that makes
	 * "what is in this box" answerable without looking at pixels.
	 *
	 * Optional so that boxes saved before ownership existed still load: absent
	 * means "ask the geometry", which is what those boxes meant when written.
	 */
	members?: string[];
}

export interface RackGraph {
	nodes: GraphNode[];
	cables: GraphCable[];
	/* Absent in every patch saved before groups existed, and absent in most
	   after -- a box is optional scenery. Readers must treat undefined as
	   "none" rather than defaulting it, so that loading an old patch does not
	   rewrite it. */
	groups?: GraphGroup[];
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
	/* `...g` rather than the two named fields: every reader of a graph comes
	   through here, so a field this rebuild forgets is a field that vanishes on
	   load. `groups` was exactly that -- a patch with boxes saved and reopened
	   came back with none, because the port-rename branch listed the two fields
	   it knew about. Spreading keeps whatever else a patch carries. */
	if (hasEntry && hasOutput) return cables === g.cables ? g : { ...g, cables };

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
		...g,
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
	/* Spread, so the boxes survive. A group is scenery drawn *around* nodes
	   rather than a container holding them, so removing one of its members
	   leaves the rectangle exactly where it was -- and rebuilding the graph from
	   two named fields instead of spreading it would have deleted every box in
	   the patch on the first node anyone removed. */
	return {
		...graph,
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
	// Spread for the reason withoutNode does: a box outlives its members.
	return {
		...graph,
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
 * Paste a fragment's groups alongside its nodes.
 *
 * Split out of `pasteNodes` because the two have different id rules: a node's
 * id is minted by the caller's `newId`, which keys it to a module type, while a
 * box has no type and nothing ever refers to it by id. Fresh ids all the same,
 * so pasting a fragment twice does not give two boxes the same name and leave
 * `moveGroup` picking whichever it found first.
 */
function pasteGroups(
	clip: RackGraph,
	offset: number,
	groupId: () => string,
	/* Old id -> new id for the nodes that were pasted alongside. */
	remap: Map<string, string>
): GraphGroup[] {
	return (clip.groups ?? []).map((g) => {
		const members = g.members
			?.map((id) => remap.get(id))
			.filter((id): id is string => id !== undefined);
		return {
			...g,
			id: groupId(),
			x: g.x + offset,
			y: g.y + offset,
			/* Remapped, not copied. A pasted box that kept the original ids would
			   own the nodes it was copied *from* -- so pasting a group would take
			   the first one's contents away from it and leave the copy's own nodes
			   unowned. Members that did not come along are dropped. */
			...(members ? { members } : {})
		};
	});
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
	newId: (type: string) => string,
	/* Only supplied when the fragment is expected to carry boxes -- a prefab
	   does, an ordinary Ctrl+V of loose nodes does not. Absent, any groups on
	   the clipboard are dropped rather than pasted under their original ids,
	   which would give two boxes one name. */
	groupId?: () => string
): { graph: RackGraph; ids: Set<string>; groupIds: string[] } {
	const remap = new Map<string, string>();
	const nodes = clip.nodes.map((n) => {
		const id = newId(n.type);
		remap.set(n.id, id);
		return { ...n, id, x: n.x + offset, y: n.y + offset };
	});
	/* Filtered on the *original* ids, then remapped.

	   This was the other way round, and the order is not cosmetic: after the map
	   step `c.from` is already the fresh id, and `remap` is keyed by the old
	   ones, so `remap.has(c.from)` asked whether a brand-new id was one of the
	   ids being replaced. It never was, so every internal cable was dropped and
	   a pasted fragment arrived as loose unconnected nodes.

	   It went unnoticed because nothing measured it: copy and paste were covered
	   by tests that counted nodes, and a wire missing from a pasted copy is
	   exactly the kind of quiet wrongness this codebase's audio tests exist
	   because of. A prefab is a paste, so it surfaced here -- COMB expanded to
	   five cards with no cables between them. */
	const cables = clip.cables
		.filter((c) => remap.has(c.from) || remap.has(c.to))
		.map((c) => ({ ...c, from: remap.get(c.from) ?? c.from, to: remap.get(c.to) ?? c.to }));
	const groups = groupId ? pasteGroups(clip, offset, groupId, remap) : [];
	return {
		graph: {
			nodes: [...graph.nodes, ...nodes],
			cables: [...graph.cables, ...cables],
			/* Left off entirely when there is nothing to carry and nothing was
			   there, so an ordinary paste into a group-free patch does not add an
			   empty array to every saved file. */
			...(groups.length || graph.groups ? { groups: [...(graph.groups ?? []), ...groups] } : {})
		},
		ids: new Set(remap.values()),
		groupIds: groups.map((g) => g.id)
	};
}

/* ──────────────────────────────────────────────────────────────────────────
   Groups: the box, and what it owns
   ────────────────────────────────────────────────────────────────────────── */

/** How much clear space a group leaves around the nodes it was drawn around. */
export const GROUP_PAD = 24;
/** The title bar's height, which the box grows upward by so it does not cover a node. */
export const GROUP_HEADER = 22;

/**
 * A box drawn around a set of nodes.
 *
 * Sized from where the nodes actually are, with room for the title above them.
 * A box exactly the bounding box would sit under its own members' top edge and
 * the label would be written across the first card in the group.
 */
export function groupAround(
	id: string,
	label: string,
	nodes: GraphNode[],
	size: (node: GraphNode) => { w: number; h: number },
	color?: string
): GraphGroup {
	/* An empty set has no bounding box, and `Math.min()` of nothing is Infinity
	   -- which would serialise as `null` and come back as a box covering the
	   whole canvas. A degenerate box at the origin is at least finite and the
	   caller can see it is wrong. */
	if (!nodes.length) return { id, label, x: 0, y: 0, w: 0, h: 0, ...(color ? { color } : {}) };
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (const n of nodes) {
		const s = size(n);
		x0 = Math.min(x0, n.x);
		y0 = Math.min(y0, n.y);
		x1 = Math.max(x1, n.x + s.w);
		y1 = Math.max(y1, n.y + s.h);
	}
	return {
		id,
		label,
		x: x0 - GROUP_PAD,
		y: y0 - GROUP_PAD - GROUP_HEADER,
		w: x1 - x0 + GROUP_PAD * 2,
		h: y1 - y0 + GROUP_PAD * 2 + GROUP_HEADER,
		...(color ? { color } : {})
	};
}

/**
 * Which nodes a group owns: the ones it fully encloses.
 *
 * *Fully*, unlike a marquee, and the difference is the point. A marquee is a
 * gesture -- it is over the instant you release it, so "anything I touched"
 * is the generous reading and the right one. A group is standing state that
 * gets asked this question again on every drag, and under the touching rule a
 * node merely overlapping the edge of a box would be dragged by it while
 * looking as though it sat outside, and two adjacent boxes would both claim
 * whatever lay on the border between them.
 *
 * The title bar is excluded from the catchment. It is drawn above the nodes,
 * so a card that happens to sit level with the label is not inside the box in
 * any sense the eye agrees with.
 */
export function nodesInGroup(
	graph: RackGraph,
	group: GraphGroup,
	size: (node: GraphNode) => { w: number; h: number }
): string[] {
	/* A box that knows its own members answers from that list and never from the
	   geometry. This is what stops one group stealing another's nodes by being
	   dragged over them, and what makes a node's owner a fact rather than a
	   question about pixels. Filtered against the graph so a member that has been
	   deleted does not linger. */
	if (group.members) {
		const live = new Set(graph.nodes.map((n) => n.id));
		return group.members.filter((id) => live.has(id));
	}
	const top = group.y + GROUP_HEADER;
	const x1 = group.x + group.w;
	const y1 = group.y + group.h;
	return graph.nodes
		.filter((n) => {
			/* ENTRY and OUTPUT are never owned. They cannot be deleted and a patch
			   has exactly one of each, so a box that happened to be drawn over the
			   output would drag the end of the patch around with it. */
			if (isFixedNode(n.id)) return false;
			const s = size(n);
			return n.x >= group.x && n.y >= top && n.x + s.w <= x1 && n.y + s.h <= y1;
		})
		.map((n) => n.id);
}

/**
 * Move a group's box and the nodes it is carrying by the same delta.
 *
 * The members are passed in rather than looked up, and that is the whole
 * correctness argument. A drag is many calls, not one: if each frame asked
 * "what does this box enclose *now*", a node would stop being a member the
 * instant the moving edge passed it and be left standing while the rest of the
 * group walked away. The caller reads membership once, on pointer-down, and
 * hands the same set to every frame of the gesture -- capture on press, release
 * on drop, which is what Blueprint does and the only rule under which a box
 * arrives with everything it set out with.
 */
export function moveGroup(
	graph: RackGraph,
	groupId: string,
	members: Set<string>,
	dx: number,
	dy: number
): RackGraph {
	if (!graph.groups?.some((g) => g.id === groupId)) return graph;
	return {
		...moveNodes(graph, members, dx, dy),
		groups: graph.groups.map((g) => (g.id === groupId ? { ...g, x: g.x + dx, y: g.y + dy } : g))
	};
}

/** Resize a group's box, which re-computes what it owns; the nodes do not move. */
export function resizeGroup(
	graph: RackGraph,
	groupId: string,
	box: { x: number; y: number; w: number; h: number }
): RackGraph {
	/* A box cannot be smaller than its own title, and a negative width would
	   invert it -- so a drag past the opposite corner stops rather than turning
	   the rectangle inside out. */
	const w = Math.max(GROUP_PAD * 2, box.w);
	const h = Math.max(GROUP_HEADER + GROUP_PAD, box.h);
	return {
		...graph,
		groups: graph.groups?.map((g) => (g.id === groupId ? { ...g, x: box.x, y: box.y, w, h } : g))
	};
}

/**
 * Drop a group's box, leaving every node it held exactly where it is.
 *
 * Blueprint's Ctrl+Shift+G. Ungrouping is not a deletion -- the box was
 * scenery, and removing scenery does not remove what it was drawn around. A
 * version of this that also took the members would make the box a container,
 * which is the thing a group is specifically not.
 */
export function ungroup(graph: RackGraph, groupId: string): RackGraph {
	if (!graph.groups?.some((g) => g.id === groupId)) return graph;
	const rest = graph.groups.filter((g) => g.id !== groupId);
	/* The key goes away entirely when the last box does, so a patch that never
	   had a group and one whose only group was removed serialise identically --
	   and an old patch round-trips unchanged. */
	return rest.length ? { ...graph, groups: rest } : { nodes: graph.nodes, cables: graph.cables };
}

/**
 * Which nodes already belong to some box.
 *
 * A node has exactly one owner, so this is what a new group checks against
 * before claiming anything: whatever is already spoken for stays where it is.
 */
export function ownedNodes(graph: RackGraph, except?: string): Set<string> {
	const out = new Set<string>();
	for (const g of graph.groups ?? []) {
		if (g.id === except) continue;
		for (const id of g.members ?? []) out.add(id);
	}
	return out;
}

/** Add a box to the graph. */
export function addGroup(graph: RackGraph, group: GraphGroup): RackGraph {
	return { ...graph, groups: [...(graph.groups ?? []), group] };
}

/**
 * Grow a box until it encloses the nodes it is supposed to own.
 *
 * A box is sized when it is created, from whatever the cards measured *then*.
 * A dropped prefab is created before any of its cards exist, so the only
 * heights available are the ones `bodyHeight` computes from the spec -- and a
 * card that renders taller than its estimate ends up poking out of the bottom
 * of the box drawn for it. Full containment then disowns it: the node is inside
 * the group by every visual reading and outside it by the only one that counts,
 * so dragging the box leaves it behind. That is exactly what happened to the
 * LFO prefab's MAP, which is the tallest card in the catalogue.
 *
 * Re-fitting is preferred to relaxing containment. Membership stays "the box
 * covers it", which is the rule the eye can check; what changes is that the box
 * is made honest once the real heights are in. Only ever grows -- shrinking it
 * would undo a resize the player made by hand.
 */
export function refitGroup(
	graph: RackGraph,
	groupId: string,
	ids: Set<string>,
	size: (node: GraphNode) => { w: number; h: number }
): RackGraph {
	const group = graph.groups?.find((g) => g.id === groupId);
	if (!group || !ids.size) return graph;
	const members = graph.nodes.filter((n) => ids.has(n.id));
	if (!members.length) return graph;
	let x1 = group.x + group.w;
	let y1 = group.y + group.h;
	for (const n of members) {
		const s = size(n);
		x1 = Math.max(x1, n.x + s.w + GROUP_PAD);
		y1 = Math.max(y1, n.y + s.h + GROUP_PAD);
	}
	const w = x1 - group.x;
	const h = y1 - group.y;
	if (w === group.w && h === group.h) return graph;
	return {
		...graph,
		groups: graph.groups?.map((g) => (g.id === groupId ? { ...g, w, h } : g))
	};
}

/** Rename a box. */
export function renameGroup(graph: RackGraph, groupId: string, label: string): RackGraph {
	return {
		...graph,
		groups: graph.groups?.map((g) => (g.id === groupId ? { ...g, label } : g))
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
