import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
	addNode,
	clearGraphHistory,
	collapseSelection,
	copySelection,
	editedView,
	enterMacro,
	expandSelection,
	leaveMacro,
	macroPath,
	pasteClipboard,
	setGraphParam,
	undoGraph
} from '../../src/lib/stores/synth-graph';
import { activeTrackId } from '../../src/lib/stores/synth-transport';
import { modularSynth } from '../../src/lib/synth';
import type { RackGraph } from '../../src/lib/stores/graph-model';

/**
 * Editing a macro from the canvas's side: collapsing, opening one, and where
 * an edit made inside it goes. Against the real store and engine track, the
 * way the canvas calls them.
 */

const c = (from: string, fromPort: string, to: string, toPort: string) => ({
	from,
	fromPort,
	to,
	toPort
});

function seed() {
	const graph: RackGraph = {
		nodes: [
			{ id: 'entry', type: 'in', x: 0, y: 0 },
			{ id: 'osc', type: 'osc', x: 100, y: 0 },
			{ id: 'f', type: 'filter', x: 300, y: 0 },
			{ id: 'g', type: 'gain', x: 500, y: 0 },
			{ id: 'output', type: 'out', x: 700, y: 0 }
		],
		cables: [
			c('entry', 'then', 'output', 'exec'),
			c('osc', 'out', 'f', 'in'),
			c('f', 'out', 'g', 'in'),
			c('g', 'out', 'output', 'in')
		]
	};
	modularSynth.updateTrack(get(activeTrackId), {
		advanced: true,
		rackGraph: graph,
		graphParams: { 'f.cutoff': 800, 'g.level': 0.5 }
	});
}

const track = () => modularSynth.getTrack(get(activeTrackId))!;
const view = () => editedView(track(), get(macroPath));

beforeEach(() => {
	macroPath.set([]);
	clearGraphHistory();
	seed();
});

describe('a macro on the canvas', () => {
	it('collapses the selection, taking its knobs inside', () => {
		const v = view();
		const def = collapseSelection(v.graph, new Set(['f', 'g']), v.params, v.waves, v.labels);
		expect(def).toMatch(/^mdef-/);
		const g = track().rackGraph!;
		expect(g.nodes.filter((n) => n.type === 'macro')).toHaveLength(1);
		expect((g.macros![def] as { params: Record<string, number> }).params).toEqual({
			'f.cutoff': 800,
			'g.level': 0.5
		});
		expect(track().graphParams).toEqual({});
	});

	it('writes a knob turned inside a macro to the definition, not the track', () => {
		const v = view();
		const def = collapseSelection(v.graph, new Set(['f', 'g']), v.params, v.waves, v.labels);
		enterMacro(def);
		expect(view().graph.nodes.map((n) => n.id)).toContain('g');
		setGraphParam(view().params, 'g', 'level', 0.25);
		addNode(view().graph, 'shape', 0, 0);
		const d = track().rackGraph!.macros![def] as {
			params: Record<string, number>;
			nodes: { type: string }[];
		};
		expect(d.params['g.level']).toBe(0.25);
		expect(d.nodes.some((n) => n.type === 'shape')).toBe(true);
		expect(track().graphParams).toEqual({});
		// The track's own patch still holds the instance and nothing from inside.
		expect(track().rackGraph!.nodes.some((n) => n.type === 'shape')).toBe(false);
		leaveMacro();
		expect(get(macroPath)).toEqual([]);
	});

	it('undoes an edit made inside a macro', () => {
		const v = view();
		const def = collapseSelection(v.graph, new Set(['f', 'g']), v.params, v.waves, v.labels);
		enterMacro(def);
		setGraphParam(view().params, 'g', 'level', 0.25);
		undoGraph();
		const d = track().rackGraph!.macros![def] as { params: Record<string, number> };
		expect(d.params['g.level']).toBe(0.5);
	});

	it('expands an instance back to its insides, and forgets the unused definition', () => {
		const v = view();
		collapseSelection(v.graph, new Set(['f', 'g']), v.params, v.waves, v.labels);
		const inst = track().rackGraph!.nodes.find((n) => n.type === 'macro')!;
		const w = view();
		expect(expandSelection(w.graph, new Set([inst.id]), w.params, w.waves, w.labels)).toBe(1);
		expect(track().rackGraph!.macros).toBeUndefined();
		expect(track().rackGraph!.nodes.some((n) => n.type === 'filter')).toBe(true);
		expect(Object.values(track().graphParams!)).toContain(800);
	});

	it('pastes an instance with its definition, sharing it when it is the same', () => {
		const v = view();
		const def = collapseSelection(v.graph, new Set(['f', 'g']), v.params, v.waves, v.labels);
		const inst = track().rackGraph!.nodes.find((n) => n.type === 'macro')!;
		copySelection(view().graph, new Set([inst.id]));
		pasteClipboard(view().graph, view().params);
		const g = track().rackGraph!;
		expect(g.nodes.filter((n) => n.type === 'macro' && n.macro === def)).toHaveLength(2);
		expect(Object.keys(g.macros!)).toEqual([def]);
	});
});
