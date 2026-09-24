import { describe, it, expect } from 'vitest';
import { modularSynth } from '../../src/lib/synth';
import { FakeCtx, FakeParam, reaches } from './stubs/audio-context';
import { PURE_NODES, isPureNode, isValueNode } from '../../src/lib/stores/node-graph';

/**
 * ADD, MUL, CMP, LOGIC, NOT, CLAMP, TRSP, CONST, TO-FREQ and TO-PITCH used to
 * be pure: pulled once, as a plain number, never an `AudioNode`. HELD reaching
 * MUL's B leg exposed why that is a gap and not a simplification -- a pure
 * node has no `AudioParam` for a live ramp to land on, so the cable was drawn,
 * the socket lit, and what MUL multiplied by was its own unwired identity (1)
 * regardless of what HELD actually carried.
 *
 * These ten now build for real, the same dual shape MAP already had: pulled
 * as a value when nothing feeding them moves, built as an `AudioNode` when
 * something does. `PURE_NODES[type]` is still the single source of truth for
 * the arithmetic -- these tests check the live build against it rather than
 * against a second, hand-derived expectation, so the two paths cannot drift
 * apart without a test noticing.
 */

type Built = { ctx: FakeCtx; voice: Record<string, unknown> | undefined };

/** Play one note on track 0 with `graph` as its patch, against a recording ctx. */
function play(graph: unknown, graphParams: Record<string, number> = {}): Built {
	const ctx = new FakeCtx();
	const S = modularSynth as unknown as Record<string, unknown>;
	S.renderCtx = ctx;
	S.masterFXCtx = null;
	S.delayNode = null;
	S.reverbConvolver = null;
	S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
	(S.activeVoices as Map<string, unknown>).clear();
	const track = (S.tracks as Record<string, unknown>[])[0];
	const saved = JSON.parse(JSON.stringify(track));
	try {
		track.muted = false;
		track.advanced = true;
		track.rackGraph = graph;
		track.graphParams = graphParams;
		const key = (S.triggerTrackVoice as (...a: unknown[]) => string | undefined)(
			0,
			40,
			0,
			0,
			0.4,
			100,
			100
		);
		return { ctx, voice: (S.activeVoices as Map<string, Record<string, unknown>>).get(key!) };
	} finally {
		Object.assign(track, saved);
		S.renderCtx = null;
	}
}

const node = (id: string, type: string) => ({ id, type, x: 0, y: 0 });
const wire = (from: string, fromPort: string, to: string, toPort: string) => ({
	from,
	fromPort,
	to,
	toPort
});
const EXEC = wire('entry', 'then', 'output', 'exec');

/**
 * Only the nodes the ADV graph itself built.
 *
 * A voice builds the racks 1-7 scaffolding first (muted when ADV owns the
 * voice, but still built) and the graph last, so the classic rack's own
 * oscillator sits ahead of the panner and the patch's nodes sit after it --
 * `rack-wiring.test.ts` established this slice first, for the identical
 * reason: `ctx.nodes.find` alone picks up the rack's OSC, not the graph's.
 */
const advNodes = (ctx: FakeCtx) => {
	const i = ctx.nodes.findIndex((n) => n.kind === 'panner');
	return ctx.nodes.slice(i + 1);
};

/** HELD is the one ENTRY outlet that is a ramp rather than a snapshot -- it is
 * the only `const` node whose offset schedules a ramp toward 600 (the
 * ceiling in `synth.ts`), which is what finds it among every leg's own
 * resting-value constant. */
function findHeld(nodes: FakeCtx['nodes']) {
	return nodes.find(
		(n) =>
			n.kind === 'const' &&
			(n as unknown as { offset: { events: unknown[] } }).offset.events.some(
				(e) => Array.isArray(e) && e[0] === 'lin' && e[1] === 600
			)
	);
}

describe('a live signal reaches an oscillator through a chain of value nodes', () => {
	it('the reported preset: HELD through TO-FREQ times MUL reaches OSC.pitch', () => {
		/* The exact shape of the reported patch: PITCH through TO-FREQ into MUL's
		   A, HELD straight onto MUL's B, the product driving an oscillator.
		   Before this fix, MUL was never built at all -- HELD's cable was drawn,
		   read back MUL's own unwired identity, and the oscillator sounded
		   exactly as if the cable were not there. */
		const graph = {
			nodes: [
				node('entry', 'in'),
				node('freq', 'tofreq'),
				node('mul', 'mul'),
				node('osc', 'osc'),
				node('output', 'out')
			],
			cables: [
				EXEC,
				wire('entry', 'pitch', 'freq', 'a'),
				wire('freq', 'out', 'mul', 'a'),
				wire('entry', 'held', 'mul', 'b'),
				wire('mul', 'out', 'osc', 'pitch'),
				wire('osc', 'out', 'output', 'in')
			]
		};
		const { ctx } = play(graph);
		const patchNodes = advNodes(ctx);
		const held = findHeld(patchNodes);
		const osc = patchNodes.find((n) => n.kind === 'osc');
		expect(held, 'HELD was not built').toBeTruthy();
		expect(osc, 'OSC was not built').toBeTruthy();
		const freq = (osc as unknown as { frequency: FakeParam }).frequency;
		/* HELD lands on MUL's own gain -- an AudioParam, not a node -- so a
		   plain `reaches()` walk dead-ends there exactly as it should: a
		   param biases the arithmetic *inside* the node it belongs to, and
		   does not itself forward anywhere. The claim this preset makes is
		   two hops: HELD reaches some AudioParam, and that param's *owner*
		   node is the one whose own output reaches OSC's frequency. */
		const heldTargets = held!.outgoing
			.map((e) => e.to)
			.filter((to): to is FakeParam => to instanceof FakeParam);
		expect(heldTargets.length, 'HELD drives no AudioParam at all').toBeGreaterThan(0);
		const reachesThroughOwner = heldTargets.some((param) => reaches(param.owner, freq));
		expect(reachesThroughOwner, "no param HELD drives belongs to a node that reaches OSC's frequency").toBe(
			true
		);
	});
});

describe('the ten value nodes, pulled as a number when nothing is live', () => {
	const S = modularSynth as unknown as {
		noiseBuffer: unknown;
		buildGraphNode(...a: unknown[]): {
			in: unknown;
			out: unknown;
			mod: Map<string, unknown>;
		} | null;
	};

	function build(type: string, params: Record<string, number> = {}, note = { velocity: 1, noteIndex: 48, tuning: 440 }) {
		const ctx = new FakeCtx();
		S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
		const p = (k: string, d: number) => params[k] ?? d;
		const made = S.buildGraphNode(ctx, type, p, 220, 0, 0.5, [], 'n1', {}, undefined, note);
		return { ctx, made };
	}

	/** Read a ConstantSourceNode's resting value straight off the fake. */
	const offsetOf = (n: unknown) => (n as { offset: { value: number } }).offset.value;
	/** Read a fixed-curve WaveShaperNode at a chosen point in its own -1..1
	 *  domain, the same table the live build samples at audio rate. */
	const sampleCurve = (n: unknown, t: number) => {
		const curve = (n as { curve: Float32Array }).curve;
		const i = Math.round(((t + 1) / 2) * (curve.length - 1));
		return curve[Math.max(0, Math.min(curve.length - 1, i))];
	};

	it('const matches PURE_NODES.const, including the pitch-kind conversion', () => {
		const { made } = build('const', { kind: 9, value: 69 }); // PIT kind, A4 itself
		expect(offsetOf(made!.out)).toBeCloseTo(
			PURE_NODES.const({ get: () => 0 }, (k, d) => ({ kind: 9, value: 69 })[k] ?? d),
			6
		);
	});

	it('add is ADD\'s own identity (0) on each leg when neither is wired', () => {
		const { ctx, made } = build('add');
		const legs = ctx.nodes.filter((n) => n.kind === 'const');
		expect(legs.map((l) => offsetOf(l)).sort()).toEqual([0, 0]);
		expect(made!.mod.has('a')).toBe(true);
		expect(made!.mod.has('b')).toBe(true);
	});

	it('sub inverts B\'s leg, matching PURE_NODES.sub for both wired and unwired legs', () => {
		const { ctx, made } = build('sub', { a: 5, b: 2 });
		const legs = ctx.nodes.filter((n) => n.kind === 'const');
		expect(legs.map((l) => offsetOf(l)).sort((x, y) => x - y)).toEqual([2, 5]);
		expect(made!.mod.has('a')).toBe(true);
		expect(made!.mod.has('b')).toBe(true);
		// B's leg gain is -1, the same trick DIFF's audio-domain subtraction uses.
		const bLeg = ctx.nodes.find((n) => n.kind === 'gain' && (n as unknown as { gain: { value: number } }).gain.value === -1);
		expect(bLeg, 'no inverted leg built').toBeTruthy();
		expect(
			PURE_NODES.sub({ get: (port, fb) => (port === 'a' ? 5 : port === 'b' ? 2 : fb) }, () => 0)
		).toBe(3);
	});

	it('mul is MUL\'s own identity (1) on each leg when neither is wired', () => {
		const { made } = build('mul');
		// B's identity sits on the gain itself, A's on the carrier leg's rest.
		expect((made!.out as unknown as { gain: { value: number } }).gain.value).toBe(1);
		expect(made!.mod.has('a')).toBe(true);
		expect(made!.mod.has('b')).toBe(true);
	});

	it('trsp adds BY to PITCH the same way ADD adds two bare legs', () => {
		const { ctx } = build('trsp', { b: 7 }); // up a fifth
		const legs = ctx.nodes.filter((n) => n.kind === 'const');
		expect(legs.map((l) => offsetOf(l)).sort((x, y) => x - y)).toEqual([0, 7]);
	});

	it('cmp\'s curve agrees with PURE_NODES.cmp at representative differences', () => {
		for (const test of [0, 1, 2, 3]) {
			const { made } = build('cmp', { test, a: 0, b: 0 });
			const shaper = made!.out;
			// GT/GE/LT/LE only need the sign, which survives at any scale.
			for (const d of [-5, -0.001, 0.001, 5]) {
				const want = PURE_NODES.cmp({ get: (port, fb) => (port === 'a' ? d : port === 'b' ? 0 : fb) }, (k, dv) =>
					k === 'test' ? test : dv
				);
				expect(sampleCurve(shaper, Math.max(-1, Math.min(1, d))), `test ${test} d ${d}`).toBe(want);
			}
		}
	});

	it('cmp\'s equality test reads true only within PURE_NODES.cmp\'s own tolerance', () => {
		const { made } = build('cmp', { test: 4 });
		const shaper = made!.out;
		// The tolerance band is scaled to occupy the shaper's middle half.
		expect(sampleCurve(shaper, 0)).toBe(1);
		expect(sampleCurve(shaper, 0.9)).toBe(0);
		expect(sampleCurve(shaper, -0.9)).toBe(0);
	});

	it('logic\'s curve agrees with PURE_NODES.logic at every combination of two clean booleans', () => {
		for (const op of [0, 1, 2, 3, 4]) {
			const { made } = build('logic', { op });
			const shaper = made!.out;
			for (const [a, b] of [
				[0, 0],
				[0, 1],
				[1, 0],
				[1, 1]
			]) {
				const want = PURE_NODES.logic({ get: (port, fb) => (port === 'a' ? a : port === 'b' ? b : fb) }, (k, dv) =>
					k === 'op' ? op : dv
				);
				const x = a + b - 1; // the same centring the live build applies
				expect(sampleCurve(shaper, x), `op ${op} a${a} b${b}`).toBe(want);
			}
		}
	});

	it('not reads true only where PURE_NODES.not does: exactly zero', () => {
		const { made } = build('not');
		const shaper = made!.out;
		expect(PURE_NODES.not({ get: () => 0 }, () => 0)).toBe(1);
		expect(PURE_NODES.not({ get: () => 5 }, () => 0)).toBe(0);
		expect(PURE_NODES.not({ get: () => -5 }, () => 0)).toBe(0);
		expect(sampleCurve(shaper, 0)).toBe(1);
		expect(sampleCurve(shaper, 1)).toBe(0);
		expect(sampleCurve(shaper, -1)).toBe(0);
	});

	it('clamp\'s ReLU stage is exactly max(0, x) across its own domain', () => {
		/* MIN(a, hi) = a - relu(a - hi) and MAX(x, lo) = x + relu(lo - x) are the
		   two identities the live build composes; FakeCtx records connections
		   and param values but does not render, so it cannot sum a chain of
		   gains the way a real render can -- what it *can* check is that the
		   one nonlinearity both identities share is exactly ReLU, the same
		   function for any bound the node is given. The full arithmetic, bounds
		   included, is exercised end to end by the audio suite. */
		const { ctx } = build('clamp', { lo: 0, hi: 1, a: 0 });
		const shaper = ctx.nodes.find((n) => n.kind === 'shaper');
		expect(shaper, 'no ReLU shaper built').toBeTruthy();
		const curve = (shaper as unknown as { curve: Float32Array }).curve;
		for (const t of [-1, -0.5, 0, 0.25, 0.75, 1]) {
			const i = Math.round(((t + 1) / 2) * (curve.length - 1));
			// 2048 samples across -1..1 puts about 0.001 between two of them,
			// so a sample nearest x is not always exactly at x.
			expect(curve[i], `x=${t}`).toBeCloseTo(Math.max(0, t), 2);
		}
	});

	it('clamp registers a, lo and hi as live mod targets', () => {
		const { made } = build('clamp', { lo: 0, hi: 1 });
		expect(made!.mod.has('a')).toBe(true);
		expect(made!.mod.has('lo')).toBe(true);
		expect(made!.mod.has('hi')).toBe(true);
	});

	it("div's reciprocal curve is 1/x across its own domain, holding the identity (1) inside the dead zone around 0", () => {
		/* Same reasoning CLAMP's own ReLU test gives: FakeCtx records wiring,
		   not sound, so what a unit test can check is that the one
		   nonlinearity DIV's carrier/gain shape depends on is exactly the
		   curve DIV is built from. The scaled two-gain arithmetic around it
		   is exercised end to end by the audio suite, the same as CLAMP's. */
		const { ctx, made } = build('div', { a: 6, b: 2 });
		const shapers = ctx.nodes.filter((n) => n.kind === 'shaper');
		expect(shapers.length).toBe(1);
		const curve = (shapers[0] as unknown as { curve: Float32Array }).curve;
		const DOMAIN = 100;
		for (const x of [-50, -20, 20, 50]) {
			const t = x / DOMAIN;
			const i = Math.round(((t + 1) / 2) * (curve.length - 1));
			expect(curve[i], `x=${x}`).toBeCloseTo(1 / x, 2);
		}
		// Inside the dead zone around exactly 0, matching PURE_NODES.div's own
		// B-at-0 identity rather than jumping to +-Infinity.
		const mid = Math.round(((0 + 1) / 2) * (curve.length - 1));
		expect(curve[mid]).toBe(1);
		expect(PURE_NODES.div({ get: (port, fb) => (port === 'a' ? 6 : port === 'b' ? 2 : fb) }, () => 0)).toBe(3);
		expect(PURE_NODES.div({ get: (port, fb) => (port === 'a' ? 6 : port === 'b' ? 0 : fb) }, () => 0)).toBe(6);
		expect(made!.mod.has('a')).toBe(true);
		expect(made!.mod.has('b')).toBe(true);
	});

	it("mod's trunc curve is exactly Math.trunc across its own domain (toward zero, matching PURE_NODES.mod's own sign), and its dead-zone gate reads 0 only around B=0", () => {
		const { ctx, made } = build('mod', { a: 7, b: 3 });
		const shapers = ctx.nodes.filter((n) => n.kind === 'shaper');
		// bLiveGate (dead-zone gate), bReciprocal, truncated -- the three fixed
		// curves MOD's own A - B*trunc(A/B) identity is built from.
		expect(shapers.length).toBe(3);
		const TRUNC_DOMAIN = 20;
		// Identified by value at the curve's own last sample (x at its most
		// positive): the dead-zone gate and the reciprocal curve both settle
		// near +-1 out there, where only TRUNC keeps climbing past it.
		const truncShaper = shapers.find((n) => {
			const curve = (n as unknown as { curve: Float32Array }).curve;
			return Math.abs(curve[curve.length - 1]) > 10;
		});
		expect(truncShaper, 'no trunc-shaped curve found').toBeTruthy();
		const truncCurve = (truncShaper as unknown as { curve: Float32Array }).curve;
		for (const x of [-15, -8, 9, 17]) {
			const t = x / TRUNC_DOMAIN;
			const i = Math.round(((t + 1) / 2) * (truncCurve.length - 1));
			expect(truncCurve[i], `x=${x}`).toBeCloseTo(Math.trunc(x), 0);
		}
		expect(PURE_NODES.mod({ get: (port, fb) => (port === 'a' ? 7 : port === 'b' ? 3 : fb) }, () => 0)).toBe(1);
		expect(PURE_NODES.mod({ get: (port, fb) => (port === 'a' ? 7 : port === 'b' ? 0 : fb) }, () => 0)).toBe(7);
		expect(PURE_NODES.mod({ get: (port, fb) => (port === 'a' ? -7 : port === 'b' ? 3 : fb) }, () => 0)).toBe(-1);
		expect(made!.mod.has('a')).toBe(true);
		expect(made!.mod.has('b')).toBe(true);
	});
});
