import { describe, it, expect } from 'vitest';
import {
	groupAround,
	nodesInGroup,
	moveGroup,
	resizeGroup,
	refitGroup,
	ungroup,
	addGroup,
	renameGroup,
	withoutNode,
	withoutNodes,
	graphOf,
	copyNodes,
	pasteNodes,
	nodesInRect,
	GROUP_PAD,
	GROUP_HEADER,
	ENTRY_ID,
	OUTPUT_ID,
	type RackGraph,
	type GraphNode,
	type GraphGroup
} from '../../src/lib/stores/graph-model';
import { BUILTIN_PREFABS, savePrefab } from '../../src/lib/stores/synth-prefabs';
import { MODULE_SPECS } from '../../src/lib/stores/synth-modules';

/**
 * Groups and prefabs: a box that owns what it encloses, and an arrangement that
 * expands into loose primitives.
 *
 * The property under test throughout is that neither feature is a container. A
 * group is scenery -- removing it must leave its members, and deleting a member
 * must leave the box -- and a prefab is a recording, so what lands is ordinary
 * nodes with fresh ids and nothing that remembers where it came from. Both of
 * those are easy to get wrong in the direction that looks fine until a patch
 * loses work, which is why they are asserted rather than assumed.
 */

const at = (id: string, x: number, y: number): GraphNode => ({ id, type: 'gain', x, y });
/** Every node a uniform 100x50, so the arithmetic in these tests is readable. */
const SIZE = () => ({ w: 100, h: 50 });

const graphOfNodes = (nodes: GraphNode[], groups?: GraphGroup[]): RackGraph => ({
	nodes,
	cables: [],
	...(groups ? { groups } : {})
});

describe('groupAround: the box a selection gets', () => {
	it('clears the nodes it is drawn around, with room for its title', () => {
		/* The padding is not cosmetic. A box exactly the bounding box has its
		   title bar lying over the top edge of its own members, so the label is
		   written across the first card -- and `nodesInGroup` excludes the header
		   band, which would then exclude the very nodes the box was drawn for. */
		const g = groupAround('g1', 'TEST', [at('a', 100, 100), at('b', 300, 200)], SIZE);
		expect(g.x).toBe(100 - GROUP_PAD);
		expect(g.y).toBe(100 - GROUP_PAD - GROUP_HEADER);
		// Right edge of 'b' is 400, left of 'a' is 100.
		expect(g.w).toBe(300 + GROUP_PAD * 2);
		// Bottom of 'b' is 250, top of 'a' is 100.
		expect(g.h).toBe(150 + GROUP_PAD * 2 + GROUP_HEADER);
	});

	it('encloses every node it was drawn around', () => {
		/* The round trip that matters: what goes in must come back out. If the
		   padding and the containment rule disagree by even a pixel, a box drawn
		   around a selection does not own that selection -- and the first drag
		   leaves a node behind. */
		const nodes = [at('a', 100, 100), at('b', 300, 200), at('c', 180, 160)];
		const g = groupAround('g1', 'TEST', nodes, SIZE);
		expect(new Set(nodesInGroup(graphOfNodes(nodes), g, SIZE))).toEqual(new Set(['a', 'b', 'c']));
	});

	it('stays finite when given nothing', () => {
		/* `Math.min()` of an empty list is Infinity, which serialises to null and
		   reads back as a box covering everything. A degenerate box at the origin
		   is at least a thing the caller can see is wrong. */
		const g = groupAround('g1', 'EMPTY', [], SIZE);
		for (const v of [g.x, g.y, g.w, g.h]) expect(Number.isFinite(v)).toBe(true);
	});
});

describe('nodesInGroup: containment, not overlap', () => {
	const box: GraphGroup = { id: 'g1', label: 'B', x: 0, y: 0, w: 400, h: 400 };

	it('does not own a node that merely overlaps its edge', () => {
		/* The case that separates this predicate from the marquee's, and the
		   reason it is written separately rather than reusing `nodesInRect`.

		   A marquee counts any overlap, which is right for a gesture that ends
		   the moment you release it. A group is standing state re-asked on every
		   drag, so under the overlap rule a node grazing the border would be
		   dragged along by a box that visibly does not contain it -- and two
		   adjacent boxes would both claim whatever sat between them.

		   `edge` straddles the right border: it starts inside at 350 and ends
		   outside at 450. The marquee sees it, the group must not. */
		const edge = at('edge', 350, 100);
		const g = graphOfNodes([edge]);
		expect(nodesInGroup(g, box, SIZE)).toEqual([]);
		// Same node, same rectangle, opposite answer -- which is the whole point.
		expect(nodesInRect(g, { x: box.x, y: box.y, w: box.w, h: box.h }, SIZE)).toEqual(['edge']);
	});

	it('does not own a node under its title bar', () => {
		/* The header is drawn above the members, so a card level with the label
		   is not inside the box in any sense the eye agrees with. */
		const underTitle = at('t', 100, GROUP_HEADER - 10);
		expect(nodesInGroup(graphOfNodes([underTitle]), box, SIZE)).toEqual([]);
	});

	it('never owns ENTRY or OUTPUT', () => {
		/* Both are undeletable and there is exactly one of each, so a box that
		   happened to be drawn over the output would drag the end of the patch
		   around with it. */
		const g = graphOfNodes([
			{ id: ENTRY_ID, type: 'in', x: 100, y: 100 },
			{ id: OUTPUT_ID, type: 'out', x: 200, y: 100 }
		]);
		expect(nodesInGroup(g, box, SIZE)).toEqual([]);
	});
});

describe('moveGroup: capture on press, release on drop', () => {
	it('moves the box and the members it was handed, together', () => {
		const nodes = [at('a', 100, 100), at('b', 200, 100)];
		const box = groupAround('g1', 'B', nodes, SIZE);
		const g = graphOfNodes(nodes, [box]);
		const moved = moveGroup(g, 'g1', new Set(['a', 'b']), 50, 25);
		expect(moved.nodes.map((n) => [n.x, n.y])).toEqual([
			[150, 125],
			[250, 125]
		]);
		expect([moved.groups![0].x, moved.groups![0].y]).toEqual([box.x + 50, box.y + 25]);
	});

	it('carries a node the box has already travelled past', () => {
		/* The shedding bug, stated as a test.

		   A drag is many calls. If membership were recomputed inside this
		   function, a node the moving edge had passed would stop being enclosed
		   and be left standing while the rest of the group walked away -- so the
		   box would arrive somewhere with less in it than it set out with.

		   Here 'a' is deliberately *outside* the box's destination, and the
		   captured set says it is a member anyway. It must move. */
		const nodes = [at('a', 100, 100)];
		const box: GraphGroup = { id: 'g1', label: 'B', x: 0, y: 0, w: 300, h: 300 };
		const g = graphOfNodes(nodes, [box]);
		const moved = moveGroup(g, 'g1', new Set(['a']), 1000, 0);
		expect(moved.nodes[0].x).toBe(1100);
		expect(moved.groups![0].x).toBe(1000);
	});

	it('leaves a graph without that group alone', () => {
		const g = graphOfNodes([at('a', 0, 0)]);
		expect(moveGroup(g, 'nope', new Set(['a']), 10, 10)).toBe(g);
	});
});

describe('resizeGroup: the box changes, the nodes do not', () => {
	it('re-computes membership from the new rectangle without moving anything', () => {
		const nodes = [at('a', 100, 100), at('b', 600, 100)];
		const box: GraphGroup = { id: 'g1', label: 'B', x: 0, y: 0, w: 300, h: 300 };
		const g = graphOfNodes(nodes, [box]);
		expect(nodesInGroup(g, box, SIZE)).toEqual(['a']);

		const wider = resizeGroup(g, 'g1', { x: 0, y: 0, w: 800, h: 300 });
		// Nothing moved.
		expect(wider.nodes.map((n) => n.x)).toEqual([100, 600]);
		// But the box now owns both, because that is what it encloses.
		expect(nodesInGroup(wider, wider.groups![0], SIZE)).toEqual(['a', 'b']);
	});

	it('refuses to invert when dragged past its own corner', () => {
		const g = graphOfNodes([], [{ id: 'g1', label: 'B', x: 0, y: 0, w: 300, h: 300 }]);
		const squashed = resizeGroup(g, 'g1', { x: 0, y: 0, w: -500, h: -500 });
		expect(squashed.groups![0].w).toBeGreaterThan(0);
		expect(squashed.groups![0].h).toBeGreaterThan(0);
	});
});

describe('ungroup: scenery comes off, the patch stays', () => {
	it('removes the box and keeps every node it held', () => {
		/* Blueprint's Ctrl+Shift+G, and the single most important assertion here:
		   a version of this that also took the members would make the box a
		   container, which is the thing a group is specifically not. */
		const nodes = [at('a', 100, 100), at('b', 200, 100)];
		const g = graphOfNodes(nodes, [groupAround('g1', 'B', nodes, SIZE)]);
		const after = ungroup(g, 'g1');
		expect(after.nodes.map((n) => n.id)).toEqual(['a', 'b']);
		expect(after.nodes.map((n) => [n.x, n.y])).toEqual([
			[100, 100],
			[200, 100]
		]);
	});

	it('drops the key entirely when the last box goes', () => {
		/* So a patch that never had a group and one whose only group was removed
		   serialise identically, and an old patch round-trips unchanged. */
		const g = graphOfNodes([at('a', 0, 0)], [{ id: 'g1', label: 'B', x: 0, y: 0, w: 1, h: 1 }]);
		expect(ungroup(g, 'g1').groups).toBeUndefined();
	});

	it('keeps the other boxes', () => {
		const g = graphOfNodes(
			[],
			[
				{ id: 'g1', label: 'A', x: 0, y: 0, w: 1, h: 1 },
				{ id: 'g2', label: 'B', x: 0, y: 0, w: 1, h: 1 }
			]
		);
		expect(ungroup(g, 'g1').groups!.map((g) => g.id)).toEqual(['g2']);
	});
});

describe('a box outlives its members', () => {
	/* The mirror of the ungroup rule, and it was a real defect rather than a
	   hypothetical: `withoutNode` and `withoutNodes` rebuilt the graph from two
	   named fields instead of spreading it, so deleting any single node silently
	   dropped every group box in the patch. */
	const boxed = (): RackGraph =>
		graphOfNodes(
			[at('a', 100, 100), at('b', 200, 100)],
			[{ id: 'g1', label: 'B', x: 0, y: 0, w: 500, h: 500 }]
		);

	it('survives one member being deleted', () => {
		expect(withoutNode(boxed(), 'a').groups).toHaveLength(1);
	});

	it('survives every member being deleted', () => {
		const bare = withoutNodes(boxed(), new Set(['a', 'b']));
		expect(bare.nodes).toHaveLength(0);
		expect(bare.groups).toHaveLength(1);
	});
});

describe('groups survive the load path', () => {
	/* Every reader of a graph goes through `graphOf`, so a field it forgets is a
	   field that vanishes when a patch is opened. It rebuilt the object from
	   `nodes` and `cables` in two of its three return paths. */
	it('keeps boxes on a graph that has both ends', () => {
		const g: RackGraph = {
			nodes: [
				{ id: ENTRY_ID, type: 'in', x: 0, y: 0 },
				{ id: OUTPUT_ID, type: 'out', x: 400, y: 0 }
			],
			cables: [{ from: ENTRY_ID, fromPort: 'then', to: OUTPUT_ID, toPort: 'exec' }],
			groups: [{ id: 'g1', label: 'KEEP', x: 0, y: 0, w: 100, h: 100 }]
		};
		expect(graphOf({ rackGraph: g }).groups).toHaveLength(1);
	});

	it('keeps boxes through the port-rename rewrite', () => {
		/* The branch that rebuilt `{ nodes, cables }` by hand. A patch old enough
		   to use `in2` is exactly the patch most likely to be someone's saved
		   work. */
		const g: RackGraph = {
			nodes: [
				{ id: ENTRY_ID, type: 'in', x: 0, y: 0 },
				{ id: 'm', type: 'sum', x: 100, y: 0 },
				{ id: OUTPUT_ID, type: 'out', x: 400, y: 0 }
			],
			cables: [{ from: ENTRY_ID, fromPort: 'out', to: 'm', toPort: 'in2' }],
			groups: [{ id: 'g1', label: 'KEEP', x: 0, y: 0, w: 100, h: 100 }]
		};
		const loaded = graphOf({ rackGraph: g });
		expect(loaded.cables[0].toPort).toBe('b');
		expect(loaded.groups).toHaveLength(1);
	});

	it('keeps boxes when a missing end is restored', () => {
		const g: RackGraph = {
			nodes: [{ id: 'm', type: 'sum', x: 100, y: 0 }],
			cables: [],
			groups: [{ id: 'g1', label: 'KEEP', x: 0, y: 0, w: 100, h: 100 }]
		};
		expect(graphOf({ rackGraph: g }).groups).toHaveLength(1);
	});
});

describe('addGroup and renameGroup', () => {
	it('adds a box to a graph that had none', () => {
		const g = addGroup(graphOfNodes([at('a', 0, 0)]), {
			id: 'g1',
			label: 'NEW',
			x: 0,
			y: 0,
			w: 10,
			h: 10
		});
		expect(g.groups).toHaveLength(1);
	});

	it('renames only the box named', () => {
		const g = graphOfNodes(
			[],
			[
				{ id: 'g1', label: 'A', x: 0, y: 0, w: 1, h: 1 },
				{ id: 'g2', label: 'B', x: 0, y: 0, w: 1, h: 1 }
			]
		);
		expect(renameGroup(g, 'g1', 'Z').groups!.map((x) => x.label)).toEqual(['Z', 'B']);
	});
});

describe('pasteNodes carries boxes when asked to', () => {
	it('gives a pasted box a fresh id, so two copies are two boxes', () => {
		/* Nothing refers to a box by id, but `moveGroup` finds one by it -- so two
		   boxes sharing a name means dragging one moves whichever was found
		   first. */
		const clip: RackGraph = {
			nodes: [at('a', 0, 0)],
			cables: [],
			groups: [{ id: 'g1', label: 'B', x: 0, y: 0, w: 100, h: 100 }]
		};
		let n = 0;
		const out = pasteNodes(
			graphOfNodes([]),
			clip,
			32,
			(t) => `${t}-${n++}`,
			() => `grp-${n++}`
		);
		expect(out.groupIds).toHaveLength(1);
		expect(out.groupIds[0]).not.toBe('g1');
		expect(out.graph.groups![0].x).toBe(32);
	});

	it('drops boxes when no id source is given', () => {
		/* An ordinary Ctrl+V of loose nodes. Pasting the box under its original id
		   would give two boxes one name; dropping it is the honest alternative. */
		const clip: RackGraph = {
			nodes: [at('a', 0, 0)],
			cables: [],
			groups: [{ id: 'g1', label: 'B', x: 0, y: 0, w: 100, h: 100 }]
		};
		const out = pasteNodes(graphOfNodes([]), clip, 32, (t) => `${t}-x`);
		expect(out.groupIds).toEqual([]);
		expect(out.graph.groups).toBeUndefined();
	});

	it('adds no groups key to a paste into a group-free patch', () => {
		/* So an ordinary paste does not start writing an empty array into every
		   saved file. */
		const clip = copyNodes(graphOfNodes([at('a', 0, 0)]), new Set(['a']));
		const out = pasteNodes(graphOfNodes([]), clip, 32, (t) => `${t}-x`);
		expect(out.graph.groups).toBeUndefined();
	});
});

describe('the built-in prefab shelf', () => {
	/* These are shipped data, and the failure mode of shipped data is that it
	   looks right and expands to something that cannot sound. Every one of them
	   was rendered on the audit bench before it was written down -- the numbers
	   are in each prefab's comment -- and these tests guard the structural
	   properties a render would not catch. */

	it('names only modules that exist', () => {
		/* A typo'd type expands to a node the canvas cannot draw and the engine
		   skips: a prefab that lands as a hole. */
		const known = new Set(MODULE_SPECS.map((m) => m.id));
		for (const p of BUILTIN_PREFABS) {
			for (const n of p.body.nodes) {
				expect(known, `${p.label} has an unknown node type ${n.type}`).toContain(n.type);
			}
		}
	});

	it('only cables ports the modules actually publish', () => {
		/* A cable to a port that does not exist draws to nowhere and carries no
		   sound, which is the silent-prefab failure this whole file exists to
		   prevent. Checked against the specs rather than against a list here, so
		   renaming a port breaks this rather than shipping a dead prefab. */
		for (const p of BUILTIN_PREFABS) {
			const typeOf = new Map(p.body.nodes.map((n) => [n.id, n.type]));
			for (const c of p.body.cables) {
				const fromSpec = MODULE_SPECS.find((m) => m.id === typeOf.get(c.from));
				const toSpec = MODULE_SPECS.find((m) => m.id === typeOf.get(c.to));
				expect(fromSpec, `${p.label}: cable from unknown node ${c.from}`).toBeTruthy();
				expect(toSpec, `${p.label}: cable to unknown node ${c.to}`).toBeTruthy();
				expect(
					fromSpec!.outputs.some((o) => o.id === c.fromPort),
					`${p.label}: ${typeOf.get(c.from)} has no outlet ${c.fromPort}`
				).toBe(true);
				/* An inlet or a knob: both take cables, and the knobs are exactly
				   what `params` names. MERGE's right inlet being `r` rather than the
				   `b` every maths node uses is the trap this catches. */
				const isPort = toSpec!.inputs.some((i) => i.id === c.toPort);
				const isKnob = toSpec!.params.some((q) => q.key === c.toPort);
				expect(
					isPort || isKnob,
					`${p.label}: ${typeOf.get(c.to)} has no inlet or knob ${c.toPort}`
				).toBe(true);
			}
		}
	});

	it('sets only knobs its own modules have', () => {
		/* A param key naming a node the body does not contain is written onto the
		   track on every drop and never read -- a patch slowly filling with keys
		   pointing at nothing. */
		for (const p of BUILTIN_PREFABS) {
			const typeOf = new Map(p.body.nodes.map((n) => [n.id, n.type]));
			for (const key of Object.keys(p.params)) {
				const at = key.indexOf('.');
				const id = key.slice(0, at);
				const knob = key.slice(at + 1);
				expect(typeOf.has(id), `${p.label}: param for unknown node ${id}`).toBe(true);
				const spec = MODULE_SPECS.find((m) => m.id === typeOf.get(id));
				expect(
					spec!.params.some((q) => q.key === knob),
					`${p.label}: ${typeOf.get(id)} has no knob ${knob}`
				).toBe(true);
			}
		}
	});

	it('gives every free-running oscillator its own rate', () => {
		/* OSC's only knob is WAVE. `pitch` is not a knob, and the engine falls
		   back to 220 Hz when nothing is patched -- so an oscillator with no cable
		   into FREQ lands at 220 Hz with nothing on its card to change it. For an
		   LFO that is an audio-rate oscillator wearing an LFO's name.

		   Every OSC in a prefab must therefore either be fed a frequency by the
		   prefab itself, or be the one the player is expected to wire up. */
		for (const p of BUILTIN_PREFABS) {
			for (const n of p.body.nodes.filter((n) => n.type === 'osc')) {
				const fed = p.body.cables.some((c) => c.to === n.id && c.toPort === 'pitch');
				expect(fed, `${p.label}: OSC ${n.id} would free-run at 220 Hz`).toBe(true);
			}
		}
	});

	it('carries no ENTRY or OUTPUT', () => {
		/* A prefab that brought the ends of a patch with it would give whatever it
		   was dropped into a second pair. */
		for (const p of BUILTIN_PREFABS) {
			for (const n of p.body.nodes) {
				expect(['in', 'out']).not.toContain(n.type);
			}
		}
	});

	it('has a unique key per prefab', () => {
		const keys = BUILTIN_PREFABS.map((p) => p.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('pairs every feedback SEND with a RTN on the same bus', () => {
		/* SEND and RTN are matched by BUS rather than by a cable, so the pairing
		   is invisible on the canvas -- which makes a mismatched pair the quietest
		   possible defect: the loop simply does not close and the prefab sounds
		   like an ordinary delay. COMB and PPONG both depend on this. */
		for (const p of BUILTIN_PREFABS) {
			const busOf = (id: string) => p.params[`${id}.bus`] ?? 0;
			const sends = p.body.nodes.filter((n) => n.type === 'fbsend').map((n) => busOf(n.id));
			const rtns = p.body.nodes.filter((n) => n.type === 'fbrtn').map((n) => busOf(n.id));
			for (const b of sends) {
				expect(rtns, `${p.label}: a SEND on bus ${b} has no RTN`).toContain(b);
			}
			for (const b of rtns) {
				expect(sends, `${p.label}: a RTN on bus ${b} has no SEND`).toContain(b);
			}
		}
	});

	it('keeps PPONG on its own buses, away from COMB', () => {
		/* Dropping a ping-pong beside a comb must not have the two feeding each
		   other's loops. The buses are a global namespace per voice, so this is a
		   real collision rather than a tidiness point. */
		const comb = BUILTIN_PREFABS.find((p) => p.key === 'comb')!;
		const ppong = BUILTIN_PREFABS.find((p) => p.key === 'pingpong')!;
		const busesOf = (p: typeof comb) =>
			new Set(
				p.body.nodes
					.filter((n) => n.type === 'fbsend' || n.type === 'fbrtn')
					.map((n) => p.params[`${n.id}.bus`] ?? 0)
			);
		const a = busesOf(comb);
		const b = busesOf(ppong);
		for (const bus of b) expect(a.has(bus), `PPONG shares bus ${bus} with COMB`).toBe(false);
	});

	it("crosses PPONG's returns onto the opposite line", () => {
		/* The one thing that makes it a ping-pong rather than two delays, and the
		   one whose failure is inaudible as a failure: a mis-crossed return just
		   sounds like an ordinary stereo delay. Measured on the bench too -- feed
		   the left line, listen to the right, and the crossed wiring sounds while
		   the uncrossed reads exactly 0 -- but the topology is worth pinning here
		   so a well-meaning tidy-up cannot quietly uncross it. */
		const p = BUILTIN_PREFABS.find((x) => x.key === 'pingpong')!;
		const to = (from: string) => p.body.cables.filter((c) => c.from === from).map((c) => c.to);
		expect(to('fbL')).toEqual(['sumR']);
		expect(to('fbR')).toEqual(['sumL']);
	});
});

describe('savePrefab: what a saved selection keeps', () => {
	it('keeps only the knobs of the nodes it saved', () => {
		/* A prefab carrying knob values for nodes it does not contain writes them
		   onto the track on every drop, where nothing ever reads them -- so a
		   patch accumulates keys pointing at nothing, and a later node that
		   happens to reuse an id inherits settings from a prefab it never came
		   from. */
		const body = copyNodes(graphOfNodes([at('a', 0, 0), at('b', 100, 0)]), new Set(['a', 'b']));
		const p = savePrefab('MINE', body, {
			'a.level': 0.5,
			'b.level': 0.25,
			'elsewhere.level': 9
		});
		expect(p.params).toEqual({ 'a.level': 0.5, 'b.level': 0.25 });
	});

	it('deep-copies the body, so editing the canvas does not edit the shelf', () => {
		/* The body handed in is derived from the live graph. Storing it by
		   reference would leave the shelf holding objects the editor goes on
		   mutating, so a prefab saved and then edited would change under its own
		   name -- and the change would persist, because the shelf is written to
		   localStorage. */
		const live = graphOfNodes([at('a', 0, 0)]);
		const body = copyNodes(live, new Set(['a']));
		const p = savePrefab('MINE', body, {});
		body.nodes[0].x = 9999;
		expect(p.body.nodes[0].x).toBe(0);
	});

	it('uppercases and bounds the name', () => {
		expect(
			savePrefab(
				'  a very long name indeed that runs on  ',
				{
					nodes: [at('a', 0, 0)],
					cables: []
				},
				{}
			).label
		).toBe('A VERY LONG NAME IND');
	});

	it('mints a distinct key each time', () => {
		/* Two prefabs sharing a key means `findPrefab` returns whichever is first
		   and the other is undroppable. */
		const body: RackGraph = { nodes: [at('a', 0, 0)], cables: [] };
		const keys = new Set([
			savePrefab('ONE', body, {}).key,
			savePrefab('TWO', body, {}).key,
			savePrefab('THREE', body, {}).key
		]);
		expect(keys.size).toBe(3);
	});
});

describe('expanding a prefab: the paste path, end to end', () => {
	/* `dropPrefab` itself needs Web Audio and the live track, so what is checked
	   here is the pure half it delegates to -- which is where every id and knob
	   decision actually happens. */

	/* One counter for the whole describe, not one per call. `dropPrefab` mints
	   ids from a module-level sequence, so two drops never collide; a counter
	   reset per call would hand the second expansion the same ids as the first
	   and the collision test would pass for the wrong reason. */
	let seq = 0;

	/** The id remapping `dropPrefab` performs, in the same order it performs it. */
	const expand = (body: RackGraph, params: Record<string, number>, into: RackGraph) => {
		const oldIds = body.nodes.map((x) => x.id);
		const out = pasteNodes(into, body, 0, (t) => `${t}-new-${seq++}`);
		const newIds = [...out.ids];
		const gp: Record<string, number> = {};
		oldIds.forEach((oldId, i) => {
			const fresh = newIds[i];
			for (const [k, v] of Object.entries(params)) {
				if (k.startsWith(`${oldId}.`)) gp[`${fresh}.${k.slice(oldId.length + 1)}`] = v;
			}
		});
		return { graph: out.graph, ids: out.ids, params: gp };
	};

	it('carries every knob onto the id its node was given', () => {
		const body: RackGraph = {
			nodes: [at('one', 0, 0), at('two', 100, 0)],
			cables: [{ from: 'one', fromPort: 'out', to: 'two', toPort: 'in' }]
		};
		const r = expand(body, { 'one.level': 0.75, 'two.level': 0.25 }, graphOfNodes([]));
		const ids = [...r.ids];
		expect(r.params).toEqual({ [`${ids[0]}.level`]: 0.75, [`${ids[1]}.level`]: 0.25 });
		// And nothing kept the body's own ids.
		expect(Object.keys(r.params).join()).not.toMatch(/\bone\.|\btwo\./);
	});

	it('rewrites the internal cables to the fresh ids', () => {
		const body: RackGraph = {
			nodes: [at('one', 0, 0), at('two', 100, 0)],
			cables: [{ from: 'one', fromPort: 'out', to: 'two', toPort: 'in' }]
		};
		const r = expand(body, {}, graphOfNodes([]));
		const ids = [...r.ids];
		expect(r.graph.cables).toHaveLength(1);
		expect(r.graph.cables[0].from).toBe(ids[0]);
		expect(r.graph.cables[0].to).toBe(ids[1]);
	});

	it('does not collide with a node already using the body id', () => {
		/* The collision that would be silent: a patch already holding a node
		   called `one` takes a prefab whose body also calls a node `one`. Reusing
		   the id would have the prefab's cables land on the existing node and its
		   knob values overwrite that node's settings. */
		const existing = graphOfNodes([at('one', 500, 500)]);
		const body: RackGraph = { nodes: [at('one', 0, 0)], cables: [] };
		const r = expand(body, { 'one.level': 0.9 }, existing);
		expect(r.graph.nodes).toHaveLength(2);
		expect([...r.ids][0]).not.toBe('one');
		// The node that was already there kept its place and its name.
		expect(r.graph.nodes[0]).toEqual({ id: 'one', type: 'gain', x: 500, y: 500 });
	});

	it('expands the same prefab twice into two independent copies', () => {
		/* A prefab is a recording, so dropping it twice must give two patches that
		   do not share a node -- otherwise the second drop silently re-cables the
		   first. */
		const body: RackGraph = {
			nodes: [at('one', 0, 0), at('two', 100, 0)],
			cables: [{ from: 'one', fromPort: 'out', to: 'two', toPort: 'in' }]
		};
		const first = expand(body, {}, graphOfNodes([]));
		const second = expand(body, {}, first.graph);
		expect(second.graph.nodes).toHaveLength(4);
		for (const id of first.ids) expect(second.ids.has(id)).toBe(false);
		expect(second.graph.cables).toHaveLength(2);
	});

	it('expands every built-in into loose primitives and nothing else', () => {
		/* The property the whole feature rests on: after a drop there is no node
		   in the patch that records where it came from, because there is no such
		   node. Every shipped prefab must expand to nodes whose types are all in
		   MODULE_SPECS -- no synthetic "group" type, no marker. */
		const known = new Set(MODULE_SPECS.map((m) => m.id));
		for (const p of BUILTIN_PREFABS) {
			const r = expand(p.body, p.params, graphOfNodes([]));
			expect(r.graph.nodes).toHaveLength(p.body.nodes.length);
			for (const n of r.graph.nodes) expect(known).toContain(n.type);
			expect(r.graph.cables).toHaveLength(p.body.cables.length);
			// Every knob the prefab set arrived on some node of the expansion.
			expect(Object.keys(r.params)).toHaveLength(Object.keys(p.params).length);
		}
	});
});

/* The bug a player hit within minutes of the feature shipping: the LFO prefab's
   box did not cover its own MAP, so dragging the group left the MAP behind.

   Nothing was wrong with the geometry. The box is sized when it is created, and
   a dropped prefab is created before any of its cards exist -- so the only
   heights available are the ones computed from the spec. MAP is the tallest
   card in the catalogue (a selector, four typed fields and a curve display) and
   renders taller than that estimate, so it hung out of the bottom of the box
   drawn for it. Full containment then disowned it: inside the group by every
   visual reading, outside it by the only one that counted. */
describe('a prefab box and the cards that outgrow their estimate', () => {
	const W = 176;
	const nodes = [
		{ id: 'rate', type: 'const', x: 0, y: 0 },
		{ id: 'osc', type: 'osc', x: 176, y: 0 },
		{ id: 'cv', type: 'tocv', x: 400, y: 0 },
		{ id: 'map', type: 'map', x: 592, y: 0 }
	];
	/* What `bodyHeight` computes from the spec, which is all the canvas has at
	   the moment of the drop. */
	const est: Record<string, number> = { const: 84, osc: 74, tocv: 74, map: 174 };
	const atDrop = (n: GraphNode) => ({ w: W, h: est[n.type] ?? 74 });
	/* What the ResizeObserver reports a frame later. */
	const afterRender = (n: GraphNode) => ({ w: W, h: n.type === 'map' ? 210 : atDrop(n).h });

	it('loses the member that rendered taller than it measured', () => {
		const g = groupAround('g1', 'LFO', nodes, atDrop);
		expect(nodesInGroup({ nodes, cables: [] }, g, afterRender)).not.toContain('map');
	});

	it('keeps every member once the box is refitted to the real heights', () => {
		const g = groupAround('g1', 'LFO', nodes, atDrop);
		const graph: RackGraph = { nodes, cables: [], groups: [g] };
		const fitted = refitGroup(graph, 'g1', new Set(['rate', 'osc', 'cv', 'map']), afterRender);
		const box = fitted.groups!.find((x) => x.id === 'g1')!;
		expect(nodesInGroup(fitted, box, afterRender).sort()).toEqual(['cv', 'map', 'osc', 'rate']);
	});

	it('only ever grows, so a box widened by hand is left alone', () => {
		const graph: RackGraph = {
			nodes,
			cables: [],
			groups: [{ id: 'g1', label: 'LFO', x: -24, y: -46, w: 2000, h: 1000 }]
		};
		expect(refitGroup(graph, 'g1', new Set(['map']), afterRender)).toBe(graph);
	});

	it('is silent when the estimate was already right', () => {
		const g = groupAround('g1', 'LFO', nodes, atDrop);
		const graph: RackGraph = { nodes, cables: [], groups: [g] };
		expect(refitGroup(graph, 'g1', new Set(['rate', 'osc', 'cv', 'map']), atDrop)).toBe(graph);
	});
});
