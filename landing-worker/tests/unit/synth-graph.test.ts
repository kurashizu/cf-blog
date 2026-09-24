import { describe, it, expect } from 'vitest';
import {
	ENTRY_ID,
	OUTPUT_ID,
	startingGraph,
	SEED_OSC_ID,
	SEED_FREQ_ID,
	isFixedNode,
	graphOf,
	wouldCycle,
	topoOrder,
	hasCable,
	withoutNode,
	getGraphParam,
	graphParamKey,
	pruneGraphParams,
	type RackGraph,
	type GraphCable,
	rolesCompatible
} from '../../src/lib/stores/graph-model';
import { MODULE_SPECS } from '../../src/lib/stores/synth-modules';
import { isPureNode } from '../../src/lib/stores/node-graph';

/**
 * The two rules the patch bay rests on: which cables are legal, and what order
 * the nodes get built in.
 *
 * Both are worth pinning down rather than trusting. An audio cycle is not a
 * style preference -- a feedback loop in Web Audio measured stable only to
 * about g = 0.90 and ran away past it -- and a build order that visits a node
 * before its inputs exist produces a voice that is silently wrong rather than
 * one that throws.
 */

const node = (id: string) => ({ id, type: id.replace(/\d+$/, ''), x: 0, y: 0 });
const cable = (from: string, to: string, fromPort = 'out', toPort = 'in'): GraphCable => ({
	from,
	fromPort,
	to,
	toPort
});

function graph(ids: string[], cables: GraphCable[] = []): RackGraph {
	return { nodes: ids.map(node), cables };
}

describe('graphOf', () => {
	/* Every graph has both of its ends, whatever it was read from.
	
	   ENTRY and OUTPUT are missing from the palette on purpose, so a canvas
	   without them cannot be built on -- there is nowhere for the note to
	   arrive and nowhere for the sound to leave. Guaranteeing it here rather
	   than at each place a track is created is the point: one of those places
	   forgot, and entering ADV on a fresh track opened a blank canvas that
	   could not be recovered from without loading someone else's patch. */
	it('hands a well-formed graph back untouched when it already has both ends', () => {
		const g: RackGraph = {
			nodes: [node(ENTRY_ID), node('vcf'), node(OUTPUT_ID)],
			cables: [cable(ENTRY_ID, 'vcf'), cable('vcf', OUTPUT_ID)]
		};
		expect(graphOf({ rackGraph: g })).toBe(g);
	});

	it('restores an entry that is missing, keeping the rest', () => {
		const g: RackGraph = { nodes: [node('vcf'), node(OUTPUT_ID)], cables: [] };
		const out = graphOf({ rackGraph: g });
		expect(out.nodes.map((n) => n.id)).toContain(ENTRY_ID);
		expect(out.nodes.map((n) => n.id)).toContain('vcf');
	});

	it('restores an output clear of the modules already placed', () => {
		const g: RackGraph = {
			nodes: [
				{ id: ENTRY_ID, type: 'in', x: 0, y: 0 },
				{ id: 'vcf', type: 'vcf', x: 900, y: 0 }
			],
			cables: []
		};
		const out = graphOf({ rackGraph: g });
		const put = out.nodes.find((n) => n.id === OUTPUT_ID)!;
		expect(put.x).toBeGreaterThan(900);
	});

	it('does not invent an audio cable across someone else’s patch', () => {
		// Joining the restored pair would connect two ends of a graph that has
		// modules between them, which is a connection nobody made.
		const g: RackGraph = { nodes: [node('vcf')], cables: [] };
		const out = graphOf({ rackGraph: g });
		expect(out.cables.filter((c) => c.toPort !== 'exec')).toEqual([]);
	});

	it('reaches a restored OUT, so migrating a patch does not silence it', () => {
		/* An OUT with an empty exec socket does not run. Injecting one bare
		   turned every patch that predates OUT from audible into silent the
		   moment it was migrated -- it played when loaded and went quiet for
		   good as soon as any node was touched and the migration was committed.

		   Execution is not sound: the exec cable says the end runs, and says
		   nothing about what reaches it. */
		const g: RackGraph = { nodes: [node(ENTRY_ID), node('vcf')], cables: [] };
		const out = graphOf({ rackGraph: g });
		expect(out.cables).toContainEqual({
			from: ENTRY_ID,
			fromPort: 'then',
			to: OUTPUT_ID,
			toPort: 'exec'
		});
	});

	// A patch file is user data and may be hand-edited or from an older build.
	it.each([
		['undefined track', undefined],
		['no graph', {}],
		['nodes not an array', { rackGraph: { nodes: 'x', cables: [] } }],
		['cables not an array', { rackGraph: { nodes: [], cables: null } }]
	])('falls back to a starting graph for %s', (_label, track) => {
		const out = graphOf(track as never);
		expect(out.nodes.map((n) => n.type)).toEqual(['in', 'tofreq', 'osc', 'out']);
		expect(out.cables.length).toBeGreaterThan(0);
	});

	it('seeds a playable patch only when the canvas was blank', () => {
		const blank = graphOf({ rackGraph: { nodes: [], cables: [] } });
		expect(blank.nodes.map((n) => n.type)).toEqual(['in', 'tofreq', 'osc', 'out']);
		/* The note is a pitch and an oscillator takes a frequency, so the
		   converter between them is part of the seed. */
		expect(blank.cables).toContainEqual({
			from: ENTRY_ID,
			fromPort: 'pitch',
			to: SEED_FREQ_ID,
			toPort: 'a'
		});
		expect(blank.cables).toContainEqual({
			from: SEED_FREQ_ID,
			fromPort: 'out',
			to: SEED_OSC_ID,
			toPort: 'pitch'
		});
		expect(blank.cables).toContainEqual({
			from: SEED_OSC_ID,
			fromPort: 'out',
			to: OUTPUT_ID,
			toPort: 'in'
		});
	});
});

describe('wouldCycle', () => {
	it('is false for a cable into a fresh node', () => {
		expect(wouldCycle(graph(['a', 'b']), 'a', 'b')).toBe(false);
	});

	it('catches a direct loop back to the source', () => {
		const g = graph(['a', 'b'], [cable('a', 'b')]);
		expect(wouldCycle(g, 'b', 'a')).toBe(true);
	});

	it('catches a loop around a longer path', () => {
		const g = graph(['a', 'b', 'c', 'd'], [cable('a', 'b'), cable('b', 'c'), cable('c', 'd')]);
		expect(wouldCycle(g, 'd', 'a')).toBe(true);
	});

	it('allows a second path to the same node', () => {
		// a -> b, a -> c, b -> d, c -> d is a diamond, not a cycle.
		const g = graph(['a', 'b', 'c', 'd'], [cable('a', 'b'), cable('a', 'c'), cable('b', 'd')]);
		expect(wouldCycle(g, 'c', 'd')).toBe(false);
	});

	it('calls a node cabled to itself a cycle', () => {
		expect(wouldCycle(graph(['a']), 'a', 'a')).toBe(true);
	});

	// A graph that already contains a cycle must not hang the search.
	it('terminates on a graph that already loops', () => {
		const g = graph(['a', 'b'], [cable('a', 'b'), cable('b', 'a')]);
		expect(wouldCycle(g, 'a', 'b')).toBe(true);
	});
});

describe('topoOrder', () => {
	it('puts a source before what it feeds', () => {
		const cables = [cable('osc', 'vcf'), cable('vcf', 'out')];
		const order = topoOrder(graph(['out', 'vcf', 'osc'], cables), cables);
		expect(order?.map((n) => n.id)).toEqual(['osc', 'vcf', 'out']);
	});

	it('keeps every node, including ones nothing is wired to', () => {
		const cables = [cable('a', 'b')];
		const order = topoOrder(graph(['a', 'b', 'lonely'], cables), cables);
		expect(order?.map((n) => n.id).sort()).toEqual(['a', 'b', 'lonely']);
	});

	it('visits both inputs of a mixer before the mixer', () => {
		const cables = [cable('a', 'mix', 'out', 'a'), cable('b', 'mix', 'out', 'b')];
		const order = topoOrder(graph(['mix', 'a', 'b'], cables), cables)!;
		const at = (id: string) => order.findIndex((n) => n.id === id);
		expect(at('a')).toBeLessThan(at('mix'));
		expect(at('b')).toBeLessThan(at('mix'));
	});

	it('returns null when the audio graph loops', () => {
		const cables = [cable('a', 'b'), cable('b', 'a')];
		expect(topoOrder(graph(['a', 'b'], cables), cables)).toBeNull();
	});

	// Mod cables are excluded from the ordering, so an LFO modulating its own
	// rate must not make the graph unbuildable.
	it('ignores cables it was not given, so modulation may loop', () => {
		const audio = [cable('osc', 'vcf')];
		const g = graph(['osc', 'vcf'], [...audio, cable('vcf', 'osc', 'cv', 'fm')]);
		expect(topoOrder(g, audio)?.map((n) => n.id)).toEqual(['osc', 'vcf']);
	});

	it('orders an empty graph as empty', () => {
		expect(topoOrder(graph([]), [])).toEqual([]);
	});
});

describe('hasCable', () => {
	it('matches only when all four ends agree', () => {
		const g = graph(['a', 'b'], [cable('a', 'b', 'out', 'in')]);
		expect(hasCable(g, cable('a', 'b', 'out', 'in'))).toBe(true);
		expect(hasCable(g, cable('a', 'b', 'out', 'fm'))).toBe(false);
		expect(hasCable(g, cable('a', 'b', 'cv', 'in'))).toBe(false);
		expect(hasCable(g, cable('b', 'a', 'out', 'in'))).toBe(false);
	});
});

describe('withoutNode', () => {
	it('takes the node and every cable touching it', () => {
		const g = graph(['a', 'b', 'c'], [cable('a', 'b'), cable('b', 'c'), cable('a', 'c')]);
		const out = withoutNode(g, 'b');
		expect(out.nodes.map((n) => n.id)).toEqual(['a', 'c']);
		expect(out.cables).toEqual([cable('a', 'c')]);
	});

	it('leaves a graph alone when the node is not in it', () => {
		const g = graph(['a']);
		expect(withoutNode(g, 'nope')).toEqual(g);
	});
});

describe('graph parameters', () => {
	it('keys a parameter by node and name', () => {
		expect(graphParamKey('osc-1', 'ratio')).toBe('osc-1.ratio');
	});

	it('falls back to the default when unset', () => {
		expect(getGraphParam({}, 'osc-1', 'ratio', 2)).toBe(2);
		expect(getGraphParam(undefined, 'osc-1', 'ratio', 2)).toBe(2);
	});

	it('reads a set value, including zero', () => {
		expect(getGraphParam({ 'osc-1.ratio': 0 }, 'osc-1', 'ratio', 2)).toBe(0);
	});

	it('prunes only the named node, not one whose id starts the same', () => {
		const params = { 'osc-1.ratio': 3, 'osc-10.ratio': 4, 'vcf-1.cutoff': 900 };
		expect(pruneGraphParams(params, 'osc-1')).toEqual({ 'osc-10.ratio': 4, 'vcf-1.cutoff': 900 });
	});

	it('prunes nothing from no parameters', () => {
		expect(pruneGraphParams(undefined, 'osc-1')).toEqual({});
	});
});

/**
 * The two ends every patch has.
 *
 * ENTRY and OUTPUT are not palette items -- a graph without them has nowhere
 * for the note to arrive and nowhere for the sound to leave -- and the editor
 * refuses to delete either. That rule is only worth anything if the graphs
 * shipped with the built-in patches actually carry them, which for a while they
 * did not: the presets were generated from a bare module chain, so opening ADV
 * on a KOTO showed a string and a body floating with no ENTRY in sight. The
 * engine still made a sound, because a graph with no IN feeds every unwired
 * module and a graph with no OUT mixes every unlistened one, so nothing failed
 * loudly -- it just drew a patch you could not have built yourself.
 */
describe('the fixed ends', () => {
	it('starts as the smallest patch that plays', () => {
		/* Not a blank canvas. An empty patch is the honest starting point and
		   the useless one: it says nothing about how the pieces fit, and the
		   first thing anyone does is rebuild this by hand before they can hear
		   anything. */
		const g = startingGraph();
		expect(g.nodes.map((n) => n.type)).toEqual(['in', 'tofreq', 'osc', 'out']);
		expect(g.nodes.map((n) => n.id)).toEqual([ENTRY_ID, SEED_FREQ_ID, SEED_OSC_ID, OUTPUT_ID]);
		// OUT is an action: without the exec cable the sound arrives and is
		// never let out.
		expect(g.cables).toContainEqual({
			from: ENTRY_ID,
			fromPort: 'then',
			to: OUTPUT_ID,
			toPort: 'exec'
		});
	});

	it('protects the last KEY-EVENT and the last OUT, and nothing else', () => {
		const g = startingGraph();
		expect(isFixedNode(g, ENTRY_ID)).toBe(true);
		expect(isFixedNode(g, OUTPUT_ID)).toBe(true);
		// Neither is fixed by its id -- it is being the only one of its kind
		// that protects it, so a second OUT is free to be deleted.
		const withSecondOut: RackGraph = {
			...g,
			nodes: [...g.nodes, node('out2')]
		};
		expect(isFixedNode(withSecondOut, OUTPUT_ID)).toBe(false);
		expect(isFixedNode(withSecondOut, 'out2')).toBe(false);
		expect(isFixedNode(g, 'osc1')).toBe(false);
		expect(isFixedNode(g, 'not-a-node')).toBe(false);
	});

	it('hands back a fresh graph each time, so one patch cannot edit another', () => {
		const a = startingGraph();
		const b = startingGraph();
		const before = b.cables.length;
		a.nodes[0].x = 999;
		a.cables.push(cable(ENTRY_ID, ENTRY_ID));
		expect(b.nodes[0].x).not.toBe(999);
		expect(b.cables).toHaveLength(before);
	});

	it('orders the entry before everything and the output after', () => {
		const g: RackGraph = {
			nodes: [node(OUTPUT_ID), node('str'), node(ENTRY_ID)],
			cables: [cable(ENTRY_ID, 'str'), cable('str', OUTPUT_ID)]
		};
		const order = topoOrder(g, g.cables)?.map((n) => n.id);
		expect(order).toEqual([ENTRY_ID, 'str', OUTPUT_ID]);
	});
});

/**
 * The Blueprint rules: execution is its own wire, and ADV is its own instrument.
 *
 * Both are pinned here because both were silently broken for a long time and
 * neither failed loudly. Every source used to schedule its envelope against the
 * note time and sound whatever the canvas said, so ENTRY could sit unwired and a
 * drum still played -- cables were decorative, and editing them changed nothing
 * you could hear. And ENTRY handed the racks 1-7 voice into every patch, so an
 * ADV kit built entirely from EXCT and MODES still had an oscillator underneath
 * it that could only be silenced by zeroing four gains in each preset.
 */
describe('execution flow', () => {
	const specOf = (id: string) => MODULE_SPECS.find((m) => m.id === id)!;

	it('gives ENTRY a THEN pin and no audio outlet', () => {
		const entry = specOf('in');
		expect(entry.outputs.some((p) => p.kind === 'exec')).toBe(true);
		// ADV is a complete signal path; nothing hands racks 1-7 into it.
		expect(entry.outputs.some((p) => p.kind === 'audio')).toBe(false);
	});

	it('publishes what the key press was, so velocity can drive timbre', () => {
		const outs = specOf('in').outputs.map((p) => p.id);
		for (const pin of ['pitch', 'vel', 'note', 'held']) expect(outs).toContain(pin);
	});

	it('keeps exec off the sound modules', () => {
		/* Execution says which nodes run; audio runs because audio is wired into
		   it. Giving a source an exec pin as well meant two cables saying one
		   thing, with silence as the penalty for drawing only the obvious one. */
		/* Asked of whatever the catalogue holds rather than of a fixed roster.
		   The roster named nine modules and had to be edited every time one was
		   added or removed, which during a rebuild is every commit -- and a name
		   that no longer resolves reads the same as a module with no exec pin. */
		const LOGIC = new Set(['in', 'out', 'wait', 'when', 'act', 'onchoke']);
		const sound = MODULE_SPECS.filter((m) => !LOGIC.has(m.id));
		for (const m of sound) {
			expect(
				m.inputs.some((p) => p.kind === 'exec'),
				m.id
			).toBe(false);
			expect(
				m.outputs.some((p) => p.kind === 'exec'),
				m.id
			).toBe(false);
		}
	});

	it('leaves the pure nodes without exec pins, as Blueprint does', () => {
		// A filter starts nothing and holds nothing: asking when it runs has no
		// answer to give. Same for the arithmetic.
		for (const m of MODULE_SPECS.filter((x) => isPureNode(x.id))) {
			expect(
				m.inputs.some((p) => p.kind === 'exec'),
				m.id
			).toBe(false);
		}
	});

	it('keeps each family of cable to itself', () => {
		expect(rolesCompatible('exec', 'exec')).toBe(true);
		expect(rolesCompatible('exec', 'signal')).toBe(false);
		expect(rolesCompatible('signal', 'exec')).toBe(false);
		expect(rolesCompatible('cv', 'exec')).toBe(false);
		// The bug this pins: THEN landed on OUTPUT's audio inlet, because the
		// canvas compared kind and never role.
		expect(rolesCompatible('exec', 'mono')).toBe(false);
		expect(rolesCompatible('cv', 'signal')).toBe(false);
	});

	it('gives WHEN and ACT exec pins rather than a second kind of trigger', () => {
		// ENTRY had a TRIG outlet for the logic chain alongside THEN, which is
		// two pins for one idea: Blueprint runs a branch on the execution wire.
		expect(specOf('in').outputs.some((p) => p.id === 'trig')).toBe(false);
		/* WHEN and ACT are not in the catalogue while it is rebuilt. Asserted
		   only if present rather than deleted, so the rule is waiting for them
		   -- and `in` above still holds, which is what keeps this from passing
		   on an empty catalogue. */
		for (const id of ['when', 'act']) {
			const spec = MODULE_SPECS.find((m) => m.id === id);
			if (!spec) continue;
			expect(
				spec.inputs.some((p) => p.kind === 'exec'),
				id
			).toBe(true);
		}
	});

	it('makes one channel and two different types', () => {
		/* Web Audio would fold a pair into a mono inlet without saying so, and a
		   patch that sounds narrow gives no hint that a stereo stage collapsed
		   three modules upstream. Refusing the cable puts MONO or MERGE on the
		   canvas, where the conversion can be seen. */
		expect(rolesCompatible('stereo', 'mono')).toBe(false);
		expect(rolesCompatible('mono', 'stereo')).toBe(false);
		// `signal` stays permissive: a filter does not care how many channels
		// it is given, and making every one declare a width would be noise.
		expect(rolesCompatible('mono', 'signal')).toBe(true);
		expect(rolesCompatible('signal', 'stereo')).toBe(true);
	});
});
