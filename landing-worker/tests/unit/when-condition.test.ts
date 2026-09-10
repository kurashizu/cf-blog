import { describe, it, expect } from 'vitest';
import { execReach, createResolver, type EvalGraph } from '../../src/lib/stores/node-graph';
import { MODULE_SPECS, CMP_TESTS, EXEC_PORT_IDS } from '../../src/lib/stores/synth-modules';
import { roleOf, rolesCompatible } from '../../src/lib/stores/graph-model';

/**
 * A branch whose question the patch asks.
 *
 * WHEN used to carry a picker with three hardwired answers -- above a note,
 * below a note, is the track busy -- so the only questions a patch could ask
 * were the ones written into the engine, and a fourth meant editing it. The
 * `bool` role, CMP and LOGIC exist so the condition can be built instead. These
 * check that the wiring actually reaches: that a truth can be computed, carried
 * and consumed, and that an unasked WHEN stays open.
 */

const spec = (id: string) => MODULE_SPECS.find((m) => m.id === id)!;
const note = { pitch: 0, velocity: 0.8, noteIndex: 48, gate: 0.5, lanes: {} };

/** ENTRY -> WHEN -> OUT, with whatever feeds the condition. */
function chain(extra: EvalGraph['nodes'] = [], cables: EvalGraph['cables'] = []): EvalGraph {
	return {
		nodes: [
			{ id: 'entry', type: 'in' },
			{ id: 'w', type: 'when' },
			{ id: 'out', type: 'out' },
			...extra
		],
		cables: [
			{ from: 'entry', fromPort: 'then', to: 'w', toPort: 'exec' },
			{ from: 'w', fromPort: 'then', to: 'out', toPort: 'exec' },
			...cables
		]
	};
}

const testIndex = (label: string) => CMP_TESTS.findIndex((t) => t.label === label);

describe('the condition is a cable', () => {
	it('declares a bool inlet rather than a list of tests', () => {
		const cond = spec('when').inputs.find((q) => q.id === 'cond')!;
		expect(roleOf(cond)).toBe('bool');
		// And CMP is what fills it.
		expect(rolesCompatible(roleOf(spec('cmp').outputs[0]), roleOf(cond))).toBe(true);
	});

	it('keeps only the test the graph cannot compute', () => {
		/* BUSY asks about the engine's own state -- which voices are sounding
		   right now -- and nothing in the graph publishes that. Every other test
		   WHEN used to offer was arithmetic on values ENTRY already hands out,
		   which is why they became cables and this did not. */
		expect(spec('when').params.map((q) => q.key)).toEqual(['busy']);
	});

	it('resolves a truth through the same resolver every module reads', () => {
		/* CMP comparing ENTRY's own note index, which is what "above C3" was as a
		   hardwired test. The point is that the answer now comes from nodes on
		   the canvas rather than from a branch in the engine. */
		const g = chain(
			[
				{ id: 'c', type: 'cmp' },
				{ id: 'k', type: 'const' }
			],
			[
				{ from: 'entry', fromPort: 'note', to: 'c', toPort: 'a' },
				{ from: 'k', fromPort: 'out', to: 'c', toPort: 'b' },
				{ from: 'c', fromPort: 'out', to: 'w', toPort: 'cond' }
			]
		);
		const above = (threshold: number) =>
			createResolver(g, { 'c.test': testIndex('>'), 'k.value': threshold, 'k.kind': 2 }, note).input(
				'w',
				'cond',
				1
			);
		// noteIndex is 48. Above 40 is true; above 60 is not.
		expect(above(40)).toBe(1);
		expect(above(60)).toBe(0);
	});

	it('combines two conditions without a new engine branch', () => {
		/* The thing the picker could never do: "loud enough AND high enough" is
		   one more card, where before it would have been a fourth hardwired test
		   and then a fifth for every other pairing. */
		const g = chain(
			[
				{ id: 'c1', type: 'cmp' },
				{ id: 'c2', type: 'cmp' },
				{ id: 'k1', type: 'const' },
				{ id: 'k2', type: 'const' },
				{ id: 'and', type: 'logic' }
			],
			[
				{ from: 'entry', fromPort: 'note', to: 'c1', toPort: 'a' },
				{ from: 'k1', fromPort: 'out', to: 'c1', toPort: 'b' },
				{ from: 'entry', fromPort: 'vel', to: 'c2', toPort: 'a' },
				{ from: 'k2', fromPort: 'out', to: 'c2', toPort: 'b' },
				{ from: 'c1', fromPort: 'out', to: 'and', toPort: 'a' },
				{ from: 'c2', fromPort: 'out', to: 'and', toPort: 'b' },
				{ from: 'and', fromPort: 'out', to: 'w', toPort: 'cond' }
			]
		);
		const ask = (minNote: number, minVel: number) =>
			createResolver(
				g,
				{
					'c1.test': testIndex('>'),
					'c2.test': testIndex('>'),
					'k1.value': minNote,
					'k1.kind': 2,
					'k2.value': minVel,
					'k2.kind': 5
				},
				note
			).input('w', 'cond', 1);
		// note 48, velocity 0.8.
		expect(ask(40, 0.5)).toBe(1); // both hold
		expect(ask(60, 0.5)).toBe(0); // note fails
		expect(ask(40, 0.9)).toBe(0); // velocity fails
	});

	it('passes when nothing is asked of it', () => {
		/* A WHEN with an empty IF is open, so placing one before deciding what it
		   should test does not silence the patch. */
		const g = chain();
		const reach = execReach(g, EXEC_PORT_IDS, 'in', () => {
			const wired = g.cables.some((c) => c.to === 'w' && c.toPort === 'cond');
			return !wired;
		});
		expect(reach.reached.has('out')).toBe(true);
	});

	it('stops execution at the branch when the test fails', () => {
		/* The half that makes it a branch at all: a WHEN whose answer is no does
		   not pass execution on, so everything downstream of it is silent for
		   this note. */
		const g = chain();
		const open = execReach(g, EXEC_PORT_IDS, 'in', () => true);
		const shut = execReach(g, EXEC_PORT_IDS, 'in', () => false);
		expect(open.reached.has('out')).toBe(true);
		expect(shut.reached.has('out')).toBe(false);
		// The WHEN itself is still reached -- it ran, and it answered.
		expect(shut.reached.has('w')).toBe(true);
	});
});

describe('ENV, the shape over a note', () => {
	it('emits control, which is what puts it on MODULATE', () => {
		expect(spec('env').outputs.every((o) => o.kind === 'mod')).toBe(true);
		expect(spec('env').group).toBe('MODULATE');
	});

	it('can reach a filter cutoff, which is the patch it exists for', () => {
		expect(
			rolesCompatible(
				roleOf(spec('env').outputs[0]),
				roleOf(spec('filter').inputs.find((q) => q.id === 'cutoff')!)
			)
		).toBe(true);
	});

	it('lets an attack be shorter than a millisecond', () => {
		/* A click is a zero-length attack and percussion lives in the first
		   millisecond. A step of 1 ms made every drum in the catalogue share one
		   attack and took the snap out of all of them. */
		const a = spec('env').params.find((q) => q.key === 'envA')!;
		expect(a.min).toBe(0);
		expect(a.step).toBeLessThanOrEqual(0.0001);
	});

	it('offers both curves, because they are not the same shape', () => {
		/* A linear fall to silence sounds like it stops abruptly; a decaying
		   exponential is what a struck string does. But a linear rise is right
		   for an attack and for anything driving a frequency, so neither can be
		   the only answer. */
		const c = spec('env').params.find((q) => q.key === 'envCurve')!;
		expect(c.choices).toEqual(['LIN', 'EXP']);
	});
});
