import { describe, it, expect } from 'vitest';
import {
	execReach,
	execDelays,
	createResolver,
	type EvalGraph
} from '../../src/lib/stores/node-graph';
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

describe('WAIT, which is a delay and says so', () => {
	it('holds back everything past it', () => {
		const g: EvalGraph = {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'w', type: 'wait' },
				{ id: 'out', type: 'out' }
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'w', toPort: 'exec' },
				{ from: 'w', fromPort: 'then', to: 'out', toPort: 'exec' }
			]
		};
		const at = execDelays(g, { 'w.gapMs': 50 }, EXEC_PORT_IDS);
		// The gap applies downstream, not to the WAIT itself.
		expect(at.get('w')).toBe(0);
		expect(at.get('out')).toBeCloseTo(0.05, 6);
	});

	it('has one outlet, because there is no order to express', () => {
		/* The name was SEQ, after Blueprint's Sequence, and Sequence orders
		   several branches. This holds one back. A second outlet firing at once
		   beside the late one was tried so a flam would be one card, and dropped:
		   ENTRY already fans out, so the pin bought one fewer cable and nothing
		   new to say. */
		expect(spec('wait').outputs).toHaveLength(1);
		expect(spec('wait').outputs[0].kind).toBe('exec');
	});

	it('is not the delay line, which is a different module and a different word', () => {
		/* One holds audio and hands it back later with the original still in
		   place; the other moves when a node starts and duplicates nothing. */
		expect(spec('delay').inputs.some((q) => q.kind === 'audio')).toBe(true);
		expect(spec('wait').inputs.every((q) => q.kind === 'exec')).toBe(true);
		expect(spec('delay').group).toBe('SHAPE');
		expect(spec('wait').group).toBe('LOGIC');
	});
});

describe('ACT, which reaches sideways', () => {
	it('produces nothing, because what it does is not a value', () => {
		/* Every other module describes the note being built. This one stops the
		   notes already playing, which is a statement about a different voice --
		   so it has an exec inlet and no outlet of any kind. */
		expect(spec('act').outputs).toEqual([]);
		expect(spec('act').inputs.every((q) => q.kind === 'exec')).toBe(true);
	});

	it('is the module a hi-hat needs', () => {
		/* A closed hat has to stop the open one or both ring together, and
		   nothing inside a voice can say that. CUT stops the group; SOLO stops
		   everything but this one. */
		const act = spec('act').params.find((q) => q.key === 'action')!;
		expect(act.choices).toEqual(['CUT', 'SOLO']);
		// A group, so a kit can hold several chokes that ignore each other.
		expect(spec('act').params.some((q) => q.key === 'actGroup')).toBe(true);
	});

	it('fades rather than cutting to silence in one sample', () => {
		// Stopping a sounding oscillator instantly is a click.
		const fade = spec('act').params.find((q) => q.key === 'actMs')!;
		expect(fade.min).toBeGreaterThan(0);
		expect(fade.def).toBe(6);
	});
});
