import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { addCable, clearGraphHistory } from '../../src/lib/stores/synth-graph';
import { activeTrackId } from '../../src/lib/stores/synth-transport';
import { modularSynth } from '../../src/lib/synth';
import type { RackGraph } from '../../src/lib/stores/graph-model';

const TRACK = 1;
const base = (): RackGraph => ({
	nodes: [
		{ id: 'entry', type: 'in', x: 0, y: 0 },
		{ id: 'output', type: 'out', x: 5, y: 0 },
		{ id: 'o', type: 'osc', x: 1, y: 0 },
		{ id: 'f', type: 'filter', x: 2, y: 0 },
		{ id: 'c1', type: 'const', x: 1, y: 1 },
		{ id: 'c2', type: 'const', x: 1, y: 2 }
	],
	cables: [
		{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
		{ from: 'o', fromPort: 'out', to: 'f', toPort: 'in' },
		{ from: 'f', fromPort: 'out', to: 'output', toPort: 'in' }
	]
});
const live = () => modularSynth.getTracks()[TRACK].rackGraph as RackGraph;

describe('a knob takes one cable', () => {
	beforeEach(() => {
		activeTrackId.set(TRACK);
		clearGraphHistory();
		modularSynth.updateTrack(TRACK, { rackGraph: base() } as never);
	});

	it('replaces the cable already on a knob rather than stacking a second', () => {
		addCable(live(), { from: 'c1', fromPort: 'out', to: 'f', toPort: 'cutoff' }, 'mod');
		expect(live().cables.filter((c) => c.toPort === 'cutoff')).toHaveLength(1);
		addCable(live(), { from: 'c2', fromPort: 'out', to: 'f', toPort: 'cutoff' }, 'mod');
		const onKnob = live().cables.filter((c) => c.toPort === 'cutoff');
		expect(onKnob).toHaveLength(1);
		expect(onKnob[0].from).toBe('c2');
	});

	/* Waiting on the catalogue. This asserts real behaviour of modules the
	   rebuild has not restored yet -- skipped rather than deleted or
	   weakened, because it is the test that has to pass before the
	   primitive it covers can be called done. */
	it.skip('still lets several sources sum into a declared inlet', () => {
		addCable(live(), { from: 'c1', fromPort: 'out', to: 'f', toPort: 'fm' }, 'mod');
		addCable(live(), { from: 'c2', fromPort: 'out', to: 'f', toPort: 'fm' }, 'mod');
		expect(live().cables.filter((c) => c.toPort === 'fm')).toHaveLength(2);
	});
});
