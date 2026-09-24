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
		/* A knob is not a summing inlet: the resolver reads exactly one cable per
		   socket, so two would mean the value came from whichever was drawn
		   first. Asserted on a knob with no socket of its own -- FILTER's TYPE --
		   because a knob that also declares an inlet is the other case, below. */
		addCable(live(), { from: 'c1', fromPort: 'out', to: 'f', toPort: 'type' }, 'mod');
		expect(live().cables.filter((c) => c.toPort === 'type')).toHaveLength(1);
		addCable(live(), { from: 'c2', fromPort: 'out', to: 'f', toPort: 'type' }, 'mod');
		const onKnob = live().cables.filter((c) => c.toPort === 'type');
		expect(onKnob).toHaveLength(1);
		expect(onKnob[0].from).toBe('c2');
	});

	it('lets a declared inlet take several, because an AudioParam sums', () => {
		/* The other half, and the reason the distinction exists. FILTER's CUTOFF
		   is a knob *and* a socket -- the GAIN/LVL pattern -- so a cable lands on
		   the AudioParam and adds to the knob. An envelope and an LFO both into
		   the cutoff is the patch everybody builds first, and it needs both
		   cables to survive. */
		addCable(live(), { from: 'c1', fromPort: 'out', to: 'f', toPort: 'cutoff' }, 'mod');
		addCable(live(), { from: 'c2', fromPort: 'out', to: 'f', toPort: 'cutoff' }, 'mod');
		expect(live().cables.filter((c) => c.toPort === 'cutoff')).toHaveLength(2);
	});

	/* Waiting on the catalogue. This asserts real behaviour of modules the
	   rebuild has not restored yet -- skipped rather than deleted or
	   weakened, because it is the test that has to pass before the
	   primitive it covers can be called done. */
});

describe('an activation point answers to exactly one event source', () => {
	/* An OUT reached by two event-source outlets would have its whole audio
	   ancestry built by whichever activates first -- including a branch
	   someone drew meaning it to be exclusive to the other one. See the
	   comment on this check in `addCable` for the measured failure. */
	beforeEach(() => {
		activeTrackId.set(TRACK);
		clearGraphHistory();
	});

	it('refuses REL landing on the same OUT that THEN already reaches', () => {
		const graph: RackGraph = {
			nodes: [
				{ id: 'entry', type: 'in', x: 0, y: 0 },
				{ id: 'output', type: 'out', x: 5, y: 0 },
				{ id: 'o', type: 'osc', x: 1, y: 0 }
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
			]
		};
		modularSynth.updateTrack(TRACK, { rackGraph: graph } as never);
		const res = addCable(
			live(),
			{ from: 'entry', fromPort: 'rel', to: 'output', toPort: 'exec' },
			'exec'
		);
		expect(res).toBe('shared-activation');
		expect(live().cables.some((c) => c.fromPort === 'rel')).toBe(false);
	});

	it('refuses ON-CHOKE landing on the same OUT that THEN already reaches', () => {
		const graph: RackGraph = {
			nodes: [
				{ id: 'entry', type: 'in', x: 0, y: 0 },
				{ id: 'onchoke', type: 'onchoke', x: 0, y: 1 },
				{ id: 'output', type: 'out', x: 5, y: 0 },
				{ id: 'o', type: 'osc', x: 1, y: 0 }
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
			]
		};
		modularSynth.updateTrack(TRACK, { rackGraph: graph } as never);
		const res = addCable(
			live(),
			{ from: 'onchoke', fromPort: 'then', to: 'output', toPort: 'exec' },
			'exec'
		);
		expect(res).toBe('shared-activation');
	});

	it('still allows a second OUT reached only by REL', () => {
		/* The fix, not just the refusal: REL's own OUT is a separate node, so
		   it never shares an activation with THEN's and this must go through
		   cleanly. */
		const graph: RackGraph = {
			nodes: [
				{ id: 'entry', type: 'in', x: 0, y: 0 },
				{ id: 'output', type: 'out', x: 5, y: 0 },
				{ id: 'outputRel', type: 'out', x: 5, y: 1 },
				{ id: 'o', type: 'osc', x: 1, y: 0 },
				{ id: 'tail', type: 'osc', x: 1, y: 1 }
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' },
				{ from: 'tail', fromPort: 'out', to: 'outputRel', toPort: 'in' }
			]
		};
		modularSynth.updateTrack(TRACK, { rackGraph: graph } as never);
		const res = addCable(
			live(),
			{ from: 'entry', fromPort: 'rel', to: 'outputRel', toPort: 'exec' },
			'exec'
		);
		expect(res).toBe('ok');
	});

	it('allows WAIT and WHEN between THEN and OUT, and still catches REL sharing past them', () => {
		/* The check has to see through the logic chain, not just a direct
		   cable from the entry itself -- a real patch routes THEN through a
		   WAIT or a WHEN before it ever reaches OUT. */
		const graph: RackGraph = {
			nodes: [
				{ id: 'entry', type: 'in', x: 0, y: 0 },
				{ id: 'w', type: 'wait', x: 2, y: 0 },
				{ id: 'output', type: 'out', x: 5, y: 0 },
				{ id: 'o', type: 'osc', x: 1, y: 0 }
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'w', toPort: 'exec' },
				{ from: 'w', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
			]
		};
		modularSynth.updateTrack(TRACK, { rackGraph: graph } as never);
		const res = addCable(
			live(),
			{ from: 'entry', fromPort: 'rel', to: 'output', toPort: 'exec' },
			'exec'
		);
		expect(res).toBe('shared-activation');
	});

	it('allows a second cable from THEN\'s own already-reaching chain', () => {
		/* Not every second exec cable into an OUT is a second entry -- a
		   branch that rejoins its own source (WHEN's two outcomes both
		   eventually reaching the same OUT, say) must not be refused just for
		   arriving by a second wire. */
		const graph: RackGraph = {
			nodes: [
				{ id: 'entry', type: 'in', x: 0, y: 0 },
				{ id: 'output', type: 'out', x: 5, y: 0 },
				{ id: 'o', type: 'osc', x: 1, y: 0 }
			],
			cables: [{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }]
		};
		modularSynth.updateTrack(TRACK, { rackGraph: graph } as never);
		addCable(live(), { from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' }, 'exec');
		// A second, direct cable from the same THEN outlet to the same OUT.
		const res = addCable(
			live(),
			{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
			'exec'
		);
		// Already a cable, so this is 'duplicate' rather than 'shared-activation'
		// -- the same entry drawn twice, not a second one arriving.
		expect(res).toBe('duplicate');
	});
});
