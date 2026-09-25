import { describe, it, expect } from 'vitest';
import {
	collapseToMacro,
	expandMacro,
	flattenMacros,
	macroPorts,
	macrosInUse,
	pruneMacros,
	type MacroDef
} from '../../src/lib/stores/macros';
import type { GraphCable, RackGraph } from '../../src/lib/stores/graph-model';

/**
 * Macros as data: what a definition's sockets are, what a patch flattens to,
 * and that collapsing a selection and expanding it again leave the patch
 * saying the same thing. The sound is measured in tests/audio/macro.test.ts.
 */

const c = (from: string, fromPort: string, to: string, toPort: string): GraphCable => ({
	from,
	fromPort,
	to,
	toPort
});

/** A VCA with its level on a CV socket: IN -> GAIN -> OUT, CV -> GAIN.level. */
const vca: MacroDef = {
	name: 'VCA',
	nodes: [
		{ id: 'in', type: 'nodept', x: 0, y: 0 },
		{ id: 'cv', type: 'nodecv', x: 0, y: 90 },
		{ id: 'g', type: 'gain', x: 200, y: 0 },
		{ id: 'out', type: 'nodept', x: 400, y: 0 }
	],
	cables: [c('in', 'out', 'g', 'in'), c('cv', 'out', 'g', 'level'), c('g', 'out', 'out', 'in')],
	params: { 'g.level': 0 },
	labels: { in: 'IN', cv: 'AMT', out: 'OUT' }
};

describe('macroPorts', () => {
	it('reads inlets and outlets off the terminals inside', () => {
		const { inputs, outputs } = macroPorts(vca);
		expect(inputs).toEqual([
			{ id: 'in', label: 'IN', kind: 'audio' },
			{ id: 'cv', label: 'AMT', kind: 'mod' }
		]);
		expect(outputs).toEqual([{ id: 'out', label: 'OUT', kind: 'audio' }]);
	});

	it('does not offer a terminal wired on both sides, which is a wire and not a socket', () => {
		const def: MacroDef = {
			...vca,
			nodes: [...vca.nodes, { id: 'mid', type: 'nodept', x: 300, y: 0 }],
			cables: [c('in', 'out', 'mid', 'in'), c('mid', 'out', 'g', 'in'), c('g', 'out', 'out', 'in')]
		};
		expect(macroPorts(def).inputs.map((p) => p.id)).toEqual(['in', 'cv']);
		expect(macroPorts(def).outputs.map((p) => p.id)).toEqual(['out']);
	});
});

/** An OSC through two instances of the VCA, their amounts from two CONSTs. */
function twoVcas(): RackGraph {
	return {
		nodes: [
			{ id: 'osc', type: 'osc', x: 0, y: 0 },
			{ id: 'k1', type: 'const', x: 0, y: 100 },
			{ id: 'k2', type: 'const', x: 0, y: 200 },
			{ id: 'a', type: 'macro', macro: 'vca', x: 200, y: 0 },
			{ id: 'b', type: 'macro', macro: 'vca', x: 400, y: 0 },
			{ id: 'o', type: 'out', x: 600, y: 0 }
		],
		cables: [
			c('osc', 'out', 'a', 'in'),
			c('k1', 'out', 'a', 'cv'),
			c('a', 'out', 'b', 'in'),
			c('k2', 'out', 'b', 'cv'),
			c('b', 'out', 'o', 'in')
		],
		macros: { vca }
	};
}

describe('flattenMacros', () => {
	it("puts each instance's insides in its place, ids and knobs under the instance", () => {
		const flat = flattenMacros(twoVcas(), { 'k1.value': 0.5 });
		const ids = flat.graph.nodes.map((n) => n.id);
		expect(ids).toContain('a/g');
		expect(ids).toContain('b/g');
		expect(ids).not.toContain('a');
		expect(flat.graph.macros).toBeUndefined();
		expect(flat.params).toEqual({ 'k1.value': 0.5, 'a/g.level': 0, 'b/g.level': 0 });
	});

	it('lands a cable on a socket on the terminal behind it, and leaves by the other', () => {
		const flat = flattenMacros(twoVcas()).graph.cables;
		expect(flat).toContainEqual(c('osc', 'out', 'a/in', 'in'));
		expect(flat).toContainEqual(c('k1', 'out', 'a/cv', 'a'));
		expect(flat).toContainEqual(c('a/out', 'out', 'b/in', 'in'));
		expect(flat).toContainEqual(c('b/out', 'out', 'o', 'in'));
		expect(flat).toContainEqual(c('a/cv', 'out', 'a/g', 'level'));
	});

	it('flattens a macro inside a macro', () => {
		const outer: MacroDef = {
			name: 'TWO',
			nodes: [
				{ id: 'in', type: 'nodept', x: 0, y: 0 },
				{ id: 'x', type: 'macro', macro: 'vca', x: 100, y: 0 },
				{ id: 'out', type: 'nodept', x: 200, y: 0 }
			],
			cables: [c('in', 'out', 'x', 'in'), c('x', 'out', 'out', 'in')],
			params: {}
		};
		const g: RackGraph = {
			nodes: [
				{ id: 'osc', type: 'osc', x: 0, y: 0 },
				{ id: 'm', type: 'macro', macro: 'outer', x: 0, y: 0 }
			],
			cables: [c('osc', 'out', 'm', 'in')],
			macros: { vca, outer }
		};
		const flat = flattenMacros(g);
		expect(flat.graph.nodes.map((n) => n.id)).toContain('m/x/g');
		expect(flat.params).toEqual({ 'm/x/g.level': 0 });
		expect(flat.graph.cables).toContainEqual(c('m/in', 'out', 'm/x/in', 'in'));
	});

	it('builds nothing for a definition that is missing or contains itself', () => {
		const loop: MacroDef = {
			name: 'SELF',
			nodes: [{ id: 'me', type: 'macro', macro: 'self', x: 0, y: 0 }],
			cables: [],
			params: {}
		};
		const g: RackGraph = {
			nodes: [
				{ id: 'm', type: 'macro', macro: 'self', x: 0, y: 0 },
				{ id: 'gone', type: 'macro', macro: 'nope', x: 0, y: 0 }
			],
			cables: [],
			macros: { self: loop }
		};
		expect(flattenMacros(g).graph.nodes).toEqual([]);
	});

	it('hands back a patch with no macros as it was', () => {
		const g: RackGraph = { nodes: [{ id: 'osc', type: 'osc', x: 0, y: 0 }], cables: [] };
		expect(flattenMacros(g).graph).toBe(g);
	});
});

const kindOf = (cb: GraphCable) =>
	cb.toPort === 'exec'
		? ('exec' as const)
		: ['level', 'a', 'cutoff'].includes(cb.toPort)
			? ('mod' as const)
			: ('audio' as const);

/** OSC -> FILTER -> GAIN -> OUT, a CONST on the filter's cutoff. */
function chain(): RackGraph {
	return {
		nodes: [
			{ id: 'entry', type: 'in', x: 0, y: 0 },
			{ id: 'osc', type: 'osc', x: 100, y: 0 },
			{ id: 'k', type: 'const', x: 100, y: 100 },
			{ id: 'f', type: 'filter', x: 300, y: 0 },
			{ id: 'g', type: 'gain', x: 500, y: 0 },
			{ id: 'o', type: 'out', x: 700, y: 0 }
		],
		cables: [
			c('entry', 'then', 'o', 'exec'),
			c('osc', 'out', 'f', 'in'),
			c('k', 'out', 'f', 'cutoff'),
			c('f', 'out', 'g', 'in'),
			c('g', 'out', 'o', 'in')
		]
	};
}

describe('collapseToMacro', () => {
	const names = { def: 'd1', instance: 'm1', name: 'tone' };

	it('turns every cable crossing the edge into a socket, and keeps the knobs inside', () => {
		const r = collapseToMacro(
			chain(),
			{ 'f.cutoff': 900, 'g.level': 0.5, 'osc.x': 1 },
			{},
			{},
			new Set(['f', 'g']),
			kindOf,
			names
		);
		if ('error' in r) throw new Error(r.error);
		const def = r.graph.macros!.d1;
		expect(def.name).toBe('TONE');
		expect(def.params).toEqual({ 'f.cutoff': 900, 'g.level': 0.5 });
		expect(r.params).toEqual({ 'osc.x': 1 });
		const ports = macroPorts(def);
		expect(ports.inputs.map((p) => [p.label, p.kind])).toEqual([
			['IN', 'audio'],
			['CV', 'mod']
		]);
		expect(ports.outputs.map((p) => [p.label, p.kind])).toEqual([['OUT', 'audio']]);
		expect(r.graph.nodes.map((n) => n.id).sort()).toEqual(['entry', 'k', 'm1', 'o', 'osc']);
	});

	it('flattens back to the same connections it was collapsed from', () => {
		const r = collapseToMacro(chain(), {}, {}, {}, new Set(['f', 'g']), kindOf, names);
		if ('error' in r) throw new Error(r.error);
		const flat = flattenMacros(r.graph).graph;
		// Follow terminals through: every original cable still has a path.
		const reach = (from: string, to: string) => {
			const seen = new Set([from]);
			const q = [from];
			while (q.length) {
				const id = q.shift()!;
				for (const cb of flat.cables)
					if (cb.from === id && !seen.has(cb.to)) {
						seen.add(cb.to);
						q.push(cb.to);
					}
			}
			return seen.has(to);
		};
		expect(reach('osc', 'm1/f')).toBe(true);
		expect(reach('k', 'm1/f')).toBe(true);
		expect(reach('m1/g', 'o')).toBe(true);
		expect(flat.cables).toContainEqual(c('m1/in2', 'out', 'm1/f', 'cutoff'));
	});

	it('refuses execution: its nodes, and exec cables across the edge', () => {
		expect(collapseToMacro(chain(), {}, {}, {}, new Set(['g', 'o']), kindOf, names)).toEqual({
			error: 'exec'
		});
		expect(collapseToMacro(chain(), {}, {}, {}, new Set(), kindOf, names)).toEqual({
			error: 'empty'
		});
	});
});

describe('expandMacro', () => {
	it('puts the insides back, reconnected, and drops the definition once unused', () => {
		const r = collapseToMacro(chain(), { 'f.cutoff': 900 }, {}, {}, new Set(['f', 'g']), kindOf, {
			def: 'd1',
			instance: 'm1',
			name: 'TONE'
		});
		if ('error' in r) throw new Error(r.error);
		let n = 0;
		const e = expandMacro(r.graph, r.params, r.waves, r.labels, 'm1', (t) => `${t}-${n++}`)!;
		expect(e.graph.macros).toBeUndefined();
		expect(e.graph.nodes.some((x) => x.type === 'macro')).toBe(false);
		const f = e.graph.nodes.find((x) => x.type === 'filter')!;
		expect(e.params).toEqual({ [`${f.id}.cutoff`]: 900 });
		// OSC still reaches the filter, through the terminal that was the socket.
		const into = e.graph.cables.filter((x) => x.to === f.id).map((x) => x.from);
		const term = e.graph.nodes.find((x) => into.includes(x.id) && x.type === 'nodept')!;
		expect(e.graph.cables).toContainEqual(c('osc', 'out', term.id, 'in'));
	});

	it('keeps the definition while another instance still uses it', () => {
		let n = 0;
		const e = expandMacro(twoVcas(), {}, {}, {}, 'a', (t) => `${t}-${n++}`)!;
		expect(Object.keys(e.graph.macros ?? {})).toEqual(['vca']);
		expect([...macrosInUse(e.graph)]).toEqual(['vca']);
	});
});

describe('pruneMacros', () => {
	it('drops a definition nothing places', () => {
		const g = { ...twoVcas(), nodes: twoVcas().nodes.filter((n) => n.type !== 'macro') };
		expect(pruneMacros(g).macros).toBeUndefined();
		expect(pruneMacros(twoVcas()).macros).toEqual({ vca });
	});
});
