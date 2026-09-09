import { describe, it, expect } from 'vitest';
import {
	graphOf,
	wouldCycle,
	topoOrder,
	hasCable,
	withoutNode,
	getGraphParam,
	graphParamKey,
	pruneGraphParams,
	type RackGraph,
	type GraphCable
} from '../../src/lib/stores/graph-model';

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
	it('reads a well-formed graph back', () => {
		const g = graph(['osc', 'vcf'], [cable('osc', 'vcf')]);
		expect(graphOf({ rackGraph: g })).toBe(g);
	});

	// A patch file is user data and may be hand-edited or from an older build.
	it.each([
		['undefined track', undefined],
		['no graph', {}],
		['nodes not an array', { rackGraph: { nodes: 'x', cables: [] } }],
		['cables not an array', { rackGraph: { nodes: [], cables: null } }]
	])('returns an empty graph for %s', (_label, track) => {
		expect(graphOf(track as never)).toEqual({ nodes: [], cables: [] });
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
