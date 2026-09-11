import { describe, it, expect } from 'vitest';
import { rolesCompatible } from '../../src/lib/stores/graph-model';
import { MAP_SHAPES } from '../../src/lib/stores/synth-modules';
import { modularSynth } from '../../src/lib/synth';
import { FakeCtx, FakeParam, type FakeNode } from './stubs/audio-context';

/** The smallest patch that makes ADV own the voice. */
const ADV_GRAPH = {
	nodes: [
		{ id: 'entry', type: 'in', x: 0, y: 0 },
		{ id: 'o', type: 'osc', x: 1, y: 0 },
		{ id: 'output', type: 'out', x: 2, y: 0 }
	],
	cables: [
		{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
		{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
	]
};
import {
	createResolver,
	execReach,
	execDelays,
	runs,
	isPureNode,
	isValueNode,
	PURE_NODES,
	type EvalGraph,
	type NoteEvent
} from '../../src/lib/stores/node-graph';

/**
 * The ADV pipeline: values in, execution through, sound out.
 *
 * Every rule pinned here was broken at least once while the engine kept them in
 * 46 separate module authors' heads, and none of the breakages threw. They made
 * a socket on a card do nothing, which you can only find by playing that module
 * and listening. See docs/node-graph.md for the contract.
 */

const note: NoteEvent = {
	pitch: 440,
	velocity: 0.8,
	noteIndex: 48,
	gate: 0.5,
	lanes: { vel: 0.9, cutoff: 0.25 }
};

const g = (nodes: [string, string][], cables: EvalGraph['cables'] = []): EvalGraph => ({
	nodes: nodes.map(([id, type]) => ({ id, type })),
	cables
});

const wire = (from: string, fromPort: string, to: string, toPort: string) => ({
	from,
	fromPort,
	to,
	toPort
});

const EXEC = new Set(['exec', 'then']);

describe('resolving an input', () => {
	it('falls back to the declared default when nothing is wired', () => {
		/* The rule the whole design turns on. OSC read the key it was played from
		   whether or not anything was patched into PITCH, so a fixed drone could
		   not be expressed and the cable on the canvas changed nothing. */
		const r = createResolver(g([['osc', 'osc']]), {}, note);
		expect(r.input('osc', 'pitch', 220)).toBe(220);
	});

	it('takes the cable when there is one', () => {
		const r = createResolver(
			g(
				[
					['e', 'in'],
					['osc', 'osc']
				],
				[wire('e', 'pitch', 'osc', 'pitch')]
			),
			{},
			note
		);
		expect(r.input('osc', 'pitch', 220)).toBe(440);
	});

	it('says whether an inlet is wired', () => {
		const graph = g(
			[
				['e', 'in'],
				['osc', 'osc']
			],
			[wire('e', 'pitch', 'osc', 'pitch')]
		);
		const r = createResolver(graph, {}, note);
		expect(r.isWired('osc', 'pitch')).toBe(true);
		expect(r.isWired('osc', 'fm')).toBe(false);
	});

	it('reads a knob through the same path, so every parameter is cable-driven', () => {
		const r = createResolver(g([['f', 'filter']]), { 'f.cutoff': 3000 }, note);
		expect(r.input('f', 'cutoff', 800)).toBe(3000);
		const driven = createResolver(
			g(
				[
					['c', 'const'],
					['f', 'filter']
				],
				[wire('c', 'out', 'f', 'cutoff')]
			),
			{ 'f.cutoff': 3000, 'c.value': 120 },
			note
		);
		// The cable wins over the knob: that is what makes a knob an inlet.
		expect(driven.input('f', 'cutoff', 800)).toBe(120);
	});
});

describe('what ENTRY publishes', () => {
	const entry = (port: string, fallback = -1) =>
		createResolver(
			g(
				[
					['e', 'in'],
					['x', 'mul']
				],
				[wire('e', port, 'x', 'a')]
			),
			{},
			note
		).input('x', 'a', fallback);

	it('hands out the note the key played', () => {
		expect(entry('pitch')).toBe(440);
		expect(entry('note')).toBe(48);
	});

	it('hands out how hard and how long', () => {
		/* Velocity reached the amplifier and nothing else before this, so "struck
		   harder means brighter" -- what every struck instrument does -- could
		   not be said at all. */
		expect(entry('vel')).toBe(0.8);
		expect(entry('gate')).toBe(0.5);
	});

	it('hands out one outlet per lane', () => {
		expect(entry('lane:cutoff')).toBe(0.25);
	});

	it('falls back for a lane the track does not carry', () => {
		expect(entry('lane:nope', 7)).toBe(7);
	});
});

describe('the pure nodes', () => {
	const evalPure = (
		type: string,
		inputs: Record<string, number>,
		params: Record<string, number> = {}
	) =>
		PURE_NODES[type](
			{ get: (port, fallback) => inputs[port] ?? fallback },
			(key, def) => params[key] ?? def
		);

	it('adds, multiplies and holds a constant', () => {
		expect(evalPure('const', {}, { value: 12 })).toBe(12);
		expect(evalPure('add', { a: 3, b: 4 })).toBe(7);
		expect(evalPure('mul', { a: 3, b: 4 })).toBe(12);
	});

	it('passes its other leg through when one is unwired', () => {
		/* An operator takes whatever arrives, so it has no knob to declare a
		   range with -- what B is when nothing is patched is a CONST's job, and
		   that is where the kind of number gets said. Unwired, each falls back to
		   the identity for its own operation, so a half-patched ADD does not zero
		   what it was given. */
		expect(evalPure('mul', { a: 5 })).toBe(5);
		expect(evalPure('add', { a: 5 })).toBe(5);
	});

	it('remaps a range and clamps to it', () => {
		/* MAP is what does this now: mapping a range and shaping the way a value
		   crosses it are one operation, and the two cards differed only in
		   whether the line between the ends was straight. */
		/* EASE crosses its range symmetrically, so the midpoint lands in the
		   middle -- which is what this is really asking: that the two ranges are
		   wired up, not that any particular curve is straight. */
		const ease = MAP_SHAPES.findIndex((m) => m.id === 'ease');
		const p = { shape: ease, inLo: 0, inHi: 1, outLo: 200, outHi: 8000 };
		expect(evalPure('map', { a: 0 }, p)).toBe(200);
		expect(evalPure('map', { a: 1 }, p)).toBe(8000);
		expect(evalPure('map', { a: 0.5 }, p)).toBe(4100);
		// Past either end it holds, rather than running off the scale.
		expect(evalPure('map', { a: 2 }, p)).toBe(8000);
		expect(evalPure('map', { a: -1 }, p)).toBe(200);
	});

	it('reads a drawn table, and is a line until one is drawn', () => {
		/* DRAW was a menu entry that did nothing: the evaluator has always read
		   `drawN` and `d0..dN`, and nothing wrote them until the curve editor.
		   Undrawn it has to pass its input through rather than flatten it -- a
		   shape nobody has touched should do nothing. */
		const draw = MAP_SHAPES.findIndex((m) => m.id === 'draw');
		const plain = { shape: draw, inLo: 0, inHi: 1, outLo: 0, outHi: 1 };
		expect(evalPure('map', { a: 0.25 }, plain)).toBeCloseTo(0.25, 6);
		expect(evalPure('map', { a: 0.75 }, plain)).toBeCloseTo(0.75, 6);

		/* Drawn, it follows the table and interpolates between the points, so a
		   curve drawn at four resolution does not arrive as four steps. */
		const table = { ...plain, drawN: 3, d0: 0, d1: 1, d2: 1 };
		expect(evalPure('map', { a: 0 }, table)).toBeCloseTo(0, 6);
		expect(evalPure('map', { a: 0.25 }, table)).toBeCloseTo(0.5, 6);
		expect(evalPure('map', { a: 0.5 }, table)).toBeCloseTo(1, 6);
		expect(evalPure('map', { a: 1 }, table)).toBeCloseTo(1, 6);
	});

	it('survives a zero-width input range', () => {
		// Dividing by the span would be NaN; "always the low end" is the sane
		// reading of a range that has not been set.
		const v = evalPure('map', { a: 5 }, { inLo: 1, inHi: 1, outLo: 10, outHi: 90 });
		expect(Number.isFinite(v)).toBe(true);
		expect(v).toBe(10);
	});

	it('clamps between bounds that are themselves patchable', () => {
		// The bounds are sockets: a clamp works on whatever kind of number it is
		// given, so a knob would have had to pick the range being clamped.
		const at = (a: number) => evalPure('clamp', { a, lo: 2, hi: 8 });
		expect(at(0)).toBe(2);
		expect(at(5)).toBe(5);
		expect(at(99)).toBe(8);
		// And in either order, so the two sockets name a range rather than a
		// sequence.
		expect(evalPure('clamp', { a: 99, lo: 8, hi: 2 })).toBe(8);
	});


	it('bends a unit value with map', () => {
		const shape = (label: string) => MAP_SHAPES.findIndex((m) => m.label === label);
		/* GATE is a threshold rather than a curve: below the middle it is the low
		   end, above it the high one. It replaced a straight line, which with both
		   ranges set was the same as no shape at all. */
		expect(evalPure('map', { a: 0.4 }, { shape: shape('GATE') })).toBe(0);
		expect(evalPure('map', { a: 0.6 }, { shape: shape('GATE') })).toBe(1);
		// EXP opens late, LOG opens early.
		expect(evalPure('map', { a: 0.5 }, { shape: shape('EXP') })).toBeLessThan(0.5);
		expect(evalPure('map', { a: 0.5 }, { shape: shape('LOG') })).toBeGreaterThan(0.5);
		// And the harder pair bends further in the same direction.
		expect(evalPure('map', { a: 0.5 }, { shape: shape('EXP2') })).toBeLessThan(
			evalPure('map', { a: 0.5 }, { shape: shape('EXP') })
		);
		/* Past either end it holds. A value outside the incoming range is not a
		   shape's business -- the range says what arriving means, and beyond it
		   there is nothing to say. */
		expect(evalPure('map', { a: -3 }, { shape: shape('EXP') })).toBe(0);
		expect(evalPure('map', { a: 40 }, { shape: shape('EXP') })).toBe(1);
	});

	it('keeps both ends wherever the shape bends', () => {
		/* Every shape maps 0..1 onto 0..1, so swapping one for another moves how
		   a sweep travels and never where it starts or stops. INV is the one
		   exception and swaps them on purpose.
		
		   WRAP is the other, and for a different reason: it does not clamp at
		   all, so the top of the range is the bottom of the next one and an input
		   of 1 comes out 0. That is the whole of what it is for -- a value that
		   runs past the end and starts over, which is what a phase accumulator
		   does -- and asserting it holds both ends would assert it is not a
		   wrap. Its own behaviour is pinned below. */
		for (let i = 0; i < MAP_SHAPES.length; i++) {
			const m = MAP_SHAPES[i];
			if (m.id === 'draw' || m.id === 'wrap') continue;
			const ends = [
				evalPure('map', { a: 0 }, { shape: i }),
				evalPure('map', { a: 1 }, { shape: i })
			];
			expect(ends.map((v) => Math.round(v)).sort(), m.label).toEqual([0, 1]);
		}
	});

	it('wraps past the end instead of holding there', () => {
		/* The one shape defined by what happens outside the range. CLAMP's
		   opposite number: both answer "what now", one by stopping and one by
		   starting over, and neither reaches the other.
		
		   The negative row is the one that matters. JavaScript's remainder keeps
		   the sign of its dividend, so a bare `x % 1` gives -0.25 for -0.25 --
		   and a quarter turn back from zero is three quarters of a turn, not
		   minus a quarter. OSC's PHS does the same arithmetic for the same
		   reason. */
		const wrap = MAP_SHAPES.findIndex((m) => m.id === 'wrap');
		const at = (a: number) => evalPure('map', { a }, { shape: wrap });
		expect(at(0.25)).toBeCloseTo(0.25, 6);
		expect(at(1.25), 'past the top comes back at the bottom').toBeCloseTo(0.25, 6);
		expect(at(2.5), 'and again, however far past').toBeCloseTo(0.5, 6);
		expect(at(-0.25), 'and below zero counts back from the top').toBeCloseTo(0.75, 6);
		// Exactly the end is the start of the next range, not the end of this one.
		expect(at(1)).toBeCloseTo(0, 6);
	});

	it('turns a sweep into steps, reaching both ends', () => {
		const st4 = MAP_SHAPES.findIndex((m) => m.id === 'step4');
		const step = (x: number) => evalPure('map', { a: x }, { shape: st4 });
		expect(step(0)).toBeCloseTo(0, 6);
		expect(step(1)).toBeCloseTo(1, 6);
		// Four treads: 0, 1/3, 2/3, 1 -- the top one has to be reachable.
		expect(new Set([0, 0.3, 0.6, 0.99].map((v) => step(v).toFixed(3))).size).toBe(4);
	});

	it('leaves DRAW alone until something is drawn', () => {
		const draw = MAP_SHAPES.findIndex((m) => m.id === 'draw');
		expect(evalPure('map', { a: 0.3 }, { shape: draw })).toBeCloseTo(0.3, 6);
	});

	it('follows a drawn table, interpolating between its points', () => {
		const draw = MAP_SHAPES.findIndex((m) => m.id === 'draw');
		// Three points describing an inverted line: 1, 0.5, 0.
		const table = { shape: draw, drawN: 3, d0: 1, d1: 0.5, d2: 0 };
		expect(evalPure('map', { a: 0 }, table)).toBeCloseTo(1, 6);
		expect(evalPure('map', { a: 0.5 }, table)).toBeCloseTo(0.5, 6);
		expect(evalPure('map', { a: 1 }, table)).toBeCloseTo(0, 6);
		// Between two points it interpolates rather than stepping.
		expect(evalPure('map', { a: 0.25 }, table)).toBeCloseTo(0.75, 6);
	});

	it('shapes a signal per sample, with the same curve it computes as a value', () => {
		/* The reason MAP is not a pure node any more. As one, a waveform arriving
		   at its inlet was read as the fallback and vanished -- measured, a TO-CV
		   into MAP's A came out 0 rather than following the wave. A shaping node
		   that cannot shape a signal is the wrong half of the module.
		
		   The table is filled by calling the evaluator, so the curve the engine
		   plays, the value a pure read computes and the line the card draws are
		   one function. Checked by comparing the two at the same points rather
		   than by trusting that they were written the same way. */
		const ctx = new FakeCtx();
		const S = modularSynth as unknown as {
			noiseBuffer: unknown;
			buildGraphNode(...a: unknown[]): { in: unknown; out: unknown } | null;
		};
		S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
		const P: Record<string, number> = {
			shape: MAP_SHAPES.findIndex((m) => m.id === 'exp'),
			inLo: -1,
			inHi: 1,
			outLo: 0,
			outHi: 1
		};
		const made = S.buildGraphNode(
			ctx,
			'map',
			(k: string, d: number) => P[k] ?? d,
			220,
			0,
			0.5,
			[],
			'n1',
			{},
			(_n: string, _p: string, f: number) => f,
			{ velocity: 0.8, noteIndex: 48, tuning: 440 },
			0.5
		);
		expect(made).not.toBe(null);
		const shaper = ctx.nodes.find((n) => n.kind === 'shaper') as unknown as {
			curve: Float32Array;
			oversample: string;
		};
		expect(shaper, 'no waveshaper built').toBeTruthy();
		/* 2x, because a lookup table makes harmonics above the sample rate and
		   they fold back down as tones nobody played. */
		expect(shaper.oversample).toBe('2x');

		/* The table is indexed -1..1 and stores its result normalised to the
		   same span, which is what the gain and offset either side undo. Read a
		   few points back out and they have to be the evaluator's answers. */
		const fromTable = (x: number) => {
			const t = ((x - P.inLo) / (P.inHi - P.inLo)) * 2 - 1;
			const i = Math.round(((t + 1) / 2) * (shaper.curve.length - 1));
			return ((shaper.curve[i] + 1) / 2) * (P.outHi - P.outLo) + P.outLo;
		};
		for (const x of [-1, -0.5, 0, 0.5, 1]) {
			expect(fromTable(x), `x=${x}`).toBeCloseTo(evalPure('map', { a: x }, P), 3);
		}

		// And the ends still hold, which is what clamps a signal past the range.
		expect(fromTable(-1)).toBeCloseTo(P.outLo, 3);
		expect(fromTable(1)).toBeCloseTo(P.outHi, 3);
	});

	it('knows which types are pure, and which merely have a value', () => {
		/* Two questions that used to be one. `isPureNode` answers the engine's --
		   is there nothing to build -- and `isValueNode` the resolver's -- can
		   this be pulled as a number.
		
		   MAP is the node that split them. Its curve is a transfer function: fed
		   ENTRY's velocity it is one number per note, and fed a waveform it has
		   to bend every sample or it is shaping nothing. So it is pullable and
		   buildable at once, and which happens is decided per cable by what sits
		   at the far end. */
		for (const id of ['const', 'add', 'mul', 'clamp']) {
			expect(isPureNode(id), id).toBe(true);
			expect(isValueNode(id), id).toBe(true);
		}
		expect(isPureNode('map')).toBe(false);
		expect(isValueNode('map')).toBe(true);
		for (const id of ['osc', 'out', 'filter', 'when']) {
			expect(isPureNode(id), id).toBe(false);
			expect(isValueNode(id), id).toBe(false);
		}
	});
});

describe('pulling a value through a chain', () => {
	it('walks back through several pure nodes', () => {
		/* Velocity into a cutoff, the way a patch actually says "harder is
		   brighter": VEL 0..1 through a MAP into a filter. */
		const graph = g(
			[
				['e', 'in'],
				['r', 'map'],
				['f', 'filter']
			],
			[wire('e', 'vel', 'r', 'a'), wire('r', 'out', 'f', 'cutoff')]
		);
		const r = createResolver(
			graph,
			{
				'r.shape': MAP_SHAPES.findIndex((m) => m.id === 'ease'),
				'r.inLo': 0,
				'r.inHi': 1,
				'r.outLo': 200,
				'r.outHi': 1200
			},
			note
		);
		/* Velocity 0.8 across 200..1200, eased: the point is that the chain
		   resolves end to end, not which curve carries it. */
		expect(r.input('f', 'cutoff', 0)).toBeCloseTo(200 + 0.896 * 1000, 3);
	});

	it('computes a shared value once', () => {
		// A constant feeding three knobs is pulled three times and computed one.
		const graph = g(
			[
				['c', 'const'],
				['a', 'filter'],
				['b', 'filter'],
				['d', 'filter']
			],
			[
				wire('c', 'out', 'a', 'cutoff'),
				wire('c', 'out', 'b', 'cutoff'),
				wire('c', 'out', 'd', 'cutoff')
			]
		);
		const r = createResolver(graph, { 'c.value': 777 }, note);
		expect(r.input('a', 'cutoff', 0)).toBe(777);
		expect(r.input('b', 'cutoff', 0)).toBe(777);
		expect(r.input('d', 'cutoff', 0)).toBe(777);
	});

	it('resolves a chain of any length, in any read order', () => {
		/* A depth cutoff was doing two jobs and did neither: a legitimate chain of
		   thirty-six additions read 0 rather than its value, and whichever node
		   hit the cutoff memoised that 0 -- so the same node answered 5 or 0
		   depending on which query ran first. Order-dependence in a pure
		   evaluator is the worst kind of wrong: it looks fine until it doesn't. */
		const N = 200;
		/* Seeded by a CONST rather than by a knob: an operator takes whatever
		   arrives and has none, so the value at the head of the chain is a node
		   like any other. */
		const long = {
			nodes: [
				{ id: 'seed', type: 'const' },
				...[...Array(N)].map((_, i) => ({ id: `n${i}`, type: 'add' }))
			],
			cables: [
				wire('seed', 'out', 'n0', 'a'),
				...[...Array(N - 1)].map((_, i) => wire(`n${i}`, 'out', `n${i + 1}`, 'a'))
			]
		};
		const deepFirst = createResolver(long, { 'seed.value': 7 }, note);
		expect(deepFirst.input(`n${N - 1}`, 'a', -1)).toBe(7);

		const shallowFirst = createResolver(long, { 'seed.value': 7 }, note);
		expect(shallowFirst.input('n3', 'a', -1)).toBe(7);
		expect(shallowFirst.input(`n${N - 1}`, 'a', -1)).toBe(7);
		// And the shallow node still reads the same after the deep one.
		expect(shallowFirst.input('n3', 'a', -1)).toBe(7);
	});

	it('does not memoise a value it could not compute', () => {
		/* A node inside a cycle has no value, which is not the same as having the
		   value zero. Writing the zero down would hand it to every later reader
		   as though it were settled. */
		const graph = g(
			[
				['a', 'add'],
				['b', 'add'],
				['out', 'add']
			],
			[wire('a', 'out', 'b', 'a'), wire('b', 'out', 'a', 'a'), wire('a', 'out', 'out', 'a')]
		);
		const r = createResolver(graph, {}, note);
		expect(Number.isFinite(r.input('out', 'a', -1))).toBe(true);
	});

	it('does not hang on a longer cycle', () => {
		const graph = g(
			[
				['a', 'add'],
				['b', 'mul'],
				['c', 'clamp']
			],
			[wire('a', 'out', 'b', 'a'), wire('b', 'out', 'c', 'a'), wire('c', 'out', 'a', 'a')]
		);
		expect(createResolver(graph, {}, note).input('a', 'a', -1)).toBe(0);
	});

	it('does not hang on a cycle', () => {
		/* The editor refuses to draw one, but a patch file is user data and may
		   be hand-edited. A pull-based evaluator would recurse forever. */
		const graph = g(
			[
				['a', 'add'],
				['b', 'add']
			],
			[wire('a', 'out', 'b', 'a'), wire('b', 'out', 'a', 'a')]
		);
		const r = createResolver(graph, {}, note);
		const v = r.input('a', 'a', 0);
		expect(Number.isFinite(v)).toBe(true);
	});

	it('leaves a knob at its own value when a signal is patched into it', () => {
		/* A cable from something with no value to pull -- an oscillator, an ENV,
		   an LFO -- is a signal. The engine connects it to the knob's AudioParam,
		   where it *adds* to the setting, so the setting is the base.
		
		   This used to read 0, and it is the whole reason "ENV into the filter
		   cutoff" was silent: the filter opened at 0 Hz and the envelope added
		   its 0..1 on top of nothing. */
		const graph = g(
			[
				['o', 'osc'],
				['f', 'filter']
			],
			[wire('o', 'out', 'f', 'cutoff')]
		);
		expect(createResolver(graph, { 'f.cutoff': 4000 }, note).input('f', 'cutoff', 99)).toBe(4000);
		// With no stored setting either, the caller's default stands.
		expect(createResolver(graph, {}, note).input('f', 'cutoff', 99)).toBe(99);
	});

	it('ignores a cable from a node that is not there', () => {
		// A dangling cable is not a setting: the knob keeps its own value.
		const graph = g([['f', 'filter']], [wire('ghost', 'out', 'f', 'cutoff')]);
		expect(createResolver(graph, {}, note).input('f', 'cutoff', 99)).toBe(99);
		expect(createResolver(graph, { 'f.cutoff': 700 }, note).input('f', 'cutoff', 99)).toBe(700);
	});
});

describe('execution flow', () => {
	it('runs nothing that execution does not reach, even with no exec cables', () => {
		/* An empty exec socket means the node does not run. Exempting a patch
		   that has drawn no exec cable at all was tried and makes the pin
		   decorative in exactly the case where it is empty: OUT sitting
		   unconnected and sounding anyway. */
		const reach = execReach(
			g([
				['e', 'in'],
				['o', 'out']
			]),
			EXEC
		);
		expect(runs(reach, 'o')).toBe(false);
	});

	it('runs only what ENTRY reaches once any exec cable exists', () => {
		const graph = g(
			[
				['e', 'in'],
				['a', 'out'],
				['b', 'out']
			],
			[wire('e', 'then', 'a', 'exec')]
		);
		const reach = execReach(graph, EXEC);
		expect(reach.gated).toBe(true);
		expect(runs(reach, 'a')).toBe(true);
		// The unwired output is not run: this is the bug where a patch with an
		// empty exec socket still sounded.
		expect(runs(reach, 'b')).toBe(false);
	});

	it('follows a chain through the logic nodes', () => {
		const graph = g(
			[
				['e', 'in'],
				['w', 'when'],
				['act', 'act'],
				['o', 'out']
			],
			[
				wire('e', 'then', 'w', 'exec'),
				wire('w', 'then', 'act', 'exec'),
				wire('e', 'then', 'o', 'exec')
			]
		);
		const reach = execReach(graph, EXEC);
		for (const id of ['w', 'act', 'o']) expect(runs(reach, id)).toBe(true);
	});

	it('does not reach a node wired backwards', () => {
		const graph = g(
			[
				['e', 'in'],
				['o', 'out']
			],
			[wire('o', 'then', 'e', 'exec')]
		);
		const reach = execReach(graph, EXEC);
		expect(runs(reach, 'o')).toBe(false);
	});

	it('terminates on an exec cycle', () => {
		const graph = g(
			[
				['e', 'in'],
				['a', 'wait'],
				['b', 'wait']
			],
			[
				wire('e', 'then', 'a', 'exec'),
				wire('a', 'then', 'b', 'exec'),
				wire('b', 'then', 'a', 'exec')
			]
		);
		const reach = execReach(graph, EXEC);
		expect(runs(reach, 'b')).toBe(true);
	});

	it('ignores a cable that is not exec at both ends', () => {
		// An audio cable is not execution, however it is drawn, so it carries
		// nothing to OUT's exec socket.
		const graph = g(
			[
				['e', 'in'],
				['o', 'out']
			],
			[wire('e', 'pitch', 'o', 'in')]
		);
		expect(runs(execReach(graph, EXEC), 'o')).toBe(false);
	});
});

/**
 * The two instruments stay apart.
 *
 * A track carries both a subtractive voice (racks 1-7) and a patch graph, and
 * the mode says which is playing. Getting this wrong is not subtle to hear and
 * was surprisingly easy to write: the graph replaced the chain output, which
 * looked like isolation and was not, because everything the racks built still
 * ran underneath and the track's own fader was left on a stage the audio no
 * longer passed through.
 *
 * These pin the shape of the fix rather than the audio, which needs a real
 * context: the rack voice is silenced at one choke point, and the graph is
 * routed through the track level rather than around it.
 */
/**
 * Build one note and report what the rack chain and the ADV graph each did.
 *
 * Asked of the graph the engine actually builds, not of the text of synth.ts.
 * The assertions here used to be `expect(SYNTH).toContain('...')` over exact
 * source lines -- which fail when a local is renamed and pass when a node is
 * wired to the wrong place, the precise inversion of what a test is for. One
 * of them included its own indentation and was broken by running a formatter.
 */
function buildVoice(adv: boolean, over: Record<string, unknown> = {}) {
	const ctx = new FakeCtx();
	const S = modularSynth as unknown as Record<string, unknown>;
	S.renderCtx = ctx;
	S.masterFXCtx = null;
	S.delayNode = null;
	S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
	(S.activeVoices as Map<string, unknown>).clear();
	const track = (S.tracks as Record<string, unknown>[])[0];
	const saved = JSON.parse(JSON.stringify(track));
	try {
		Object.assign(track, over);
		track.muted = false;
		track.advanced = adv;
		track.rackGraph = adv ? ADV_GRAPH : undefined;
		const key = (S.triggerTrackVoice as (...a: unknown[]) => string | undefined)(
			0,
			40,
			0,
			0,
			0.4,
			100,
			100
		);
		const voice = (S.activeVoices as Map<string, Record<string, unknown>>).get(key!);
		return { ctx, voice };
	} finally {
		Object.assign(track, saved);
		S.renderCtx = null;
	}
}

describe('ADV and racks 1-7 are one instrument at a time', () => {
	it('silences the rack oscillators when ADV owns the voice', () => {
		/* Every rack source -- both oscillators, the sub, the noise, the ring and
		   fusion paths -- funnels into one mixer before the filter, so muting it
		   there covers all of them and cannot be forgotten when another source is
		   added later. The question is whether that mixer is open. */
		const mixerGain = (r: ReturnType<typeof buildVoice>) => {
			const filter = r.voice?.filter as FakeNode | undefined;
			const mixer = r.ctx.nodes.find(
				(n) => n.kind === 'gain' && n.outgoing.some((e) => e.to === filter)
			) as unknown as { gain: FakeParam } | undefined;
			return mixer?.gain.value ?? -1;
		};
		expect(mixerGain(buildVoice(false))).toBeGreaterThan(0);
		expect(mixerGain(buildVoice(true))).toBe(0);
	});

	it('owns the note whenever ADV is on, empty canvas included', () => {
		/* Keying this off "the graph has nodes" let the racks play through a
		   blank patch: nothing on the canvas and every key still sounding. */
		const ctx = new FakeCtx();
		const S = modularSynth as unknown as Record<string, unknown>;
		S.renderCtx = ctx;
		S.masterFXCtx = null;
		S.delayNode = null;
		S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
		(S.activeVoices as Map<string, unknown>).clear();
		const track = (S.tracks as Record<string, unknown>[])[0];
		const saved = JSON.parse(JSON.stringify(track));
		try {
			track.muted = false;
			track.advanced = true;
			track.rackGraph = { nodes: [], cables: [] };
			const key = (S.triggerTrackVoice as (...a: unknown[]) => string | undefined)(
				0,
				40,
				0,
				0,
				0.4,
				100,
				100
			);
			const voice = (S.activeVoices as Map<string, Record<string, unknown>>).get(key!);
			const filter = voice?.filter as FakeNode | undefined;
			const loudest = filter
				? ctx.nodes
						.filter((n) => n.kind === 'gain' && n.outgoing.some((e) => e.to === filter))
						.reduce((m, g) => Math.max(m, (g as unknown as { gain: FakeParam }).gain.scheduled), 0)
				: 0;
			expect(loudest).toBe(0);
		} finally {
			Object.assign(track, saved);
			S.renderCtx = null;
		}
	});
});

/**
 * Nothing on racks 1-7 reaches an ADV voice.
 *
 * The two share a signal path from the panner down, which is right -- the
 * track's place in the mix belongs to the track -- but everything above that is
 * one instrument or the other. Each of these was a real crossing: rack 7's VOL
 * silenced an ADV patch, rack 7's AIR shelved it, and rack 5's LFO panned and
 * ducked it, all from knobs on the instrument that was not playing.
 */
describe('rack controls do not reach an ADV voice', () => {
	it('skips rack 7 AIR', () => {
		/* The air shelf is a rack 7 control. An ADV voice must not get one, and
		   the voice records its tail nodes, so the shelf either is or is not
		   among them -- a question about the graph rather than about the text. */
		const tailKinds = (adv: boolean) => {
			const { voice } = buildVoice(adv, { airGain: 0.5 });
			return ((voice?.tail as FakeNode[] | undefined) ?? []).map((n) => n.kind);
		};
		expect(tailKinds(false)).toContain('biquad');
		/* No shelf, rather than no tail at all. The tail is the reap list: what a
		   voice connects to the shared reverb has to be on it or the edge outlives
		   the note, so an ADV voice puts its own graph output there. Asserting the
		   list was empty pinned that leak in place -- the question here is whether
		   the *air shelf* crossed over, and a biquad is what one looks like. */
		expect(tailKinds(true)).not.toContain('biquad');
	});

	it('skips the rack LFO', () => {
		/* PITCH and CUTOFF land on rack nodes an ADV voice never builds, but PAN
		   and AMP land on the panner and gain node, which are shared.
		
		   Asserted on the built graph rather than on the text of synth.ts. The
		   substring this used to match included its own indentation, so running
		   a formatter over the file failed the test while the guard it checks
		   was untouched -- the exact failure mode this suite was rewritten to
		   get away from. */
		const built = (adv: boolean) => {
			const ctx = new FakeCtx();
			const S = modularSynth as unknown as Record<string, unknown>;
			S.renderCtx = ctx;
			S.masterFXCtx = null;
			S.delayNode = null;
			S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
			(S.activeVoices as Map<string, unknown>).clear();
			const track = (S.tracks as Record<string, unknown>[])[0];
			const saved = {
				advanced: track.advanced,
				graph: track.rackGraph,
				rate: track.lfoRate,
				pitch: track.pitchModAmount
			};
			try {
				track.advanced = adv;
				track.rackGraph = adv ? ADV_GRAPH : undefined;
				track.lfoRate = 5;
				track.pitchModAmount = 50;
				(S.triggerTrackVoice as (...a: unknown[]) => unknown)(0, 40, 0, 0, 0.3, 100, 100);
				const voice = [...(S.activeVoices as Map<string, { lfo?: unknown }>).values()][0];
				return !!voice?.lfo;
			} finally {
				Object.assign(track, {
					advanced: saved.advanced,
					rackGraph: saved.graph,
					lfoRate: saved.rate,
					pitchModAmount: saved.pitch
				});
				S.renderCtx = null;
			}
		};
		// The rack voice carries an LFO oscillator; the ADV one is not given one.
		expect(built(false)).toBe(true);
		expect(built(true)).toBe(false);
	});

	it('does not scale the graph by a rack preset level', () => {
		/* `presetGain` is the level a rack preset was saved at, and it is applied
		   to the amp envelope's peak. An ADV patch is not that preset -- its
		   level is a VCA on the canvas -- so it is excluded, and turning a rack
		   preset's level must not move it. */
		const peakOf = (adv: boolean, presetGain: number) => {
			const { voice } = buildVoice(adv, { presetGain });
			const g = voice?.gain as unknown as { gain: FakeParam } | undefined;
			// The loudest thing the amp envelope was ever told to reach.
			return Math.max(0, ...(g?.gain.events ?? []).map((e) => e[1]));
		};
		expect(peakOf(false, 0.2)).not.toBeCloseTo(peakOf(false, 1), 6);
		expect(peakOf(true, 0.2)).toBeCloseTo(peakOf(true, 1), 6);
	});

	it('leaves the graph output as the voice, unshaped by the racks', () => {
		/* The rack chain's amp envelope lives on the voice gain node, and the
		   graph replaces the signal upstream of it -- so an ADV voice's sources
		   are the graph's, not the racks'. A rack voice builds oscillators that
		   reach its filter; an ADV voice's filter is fed by nothing at all. */
		const filterFed = (adv: boolean) => {
			const { ctx, voice } = buildVoice(adv);
			const filter = voice?.filter as FakeNode | undefined;
			const mixer = ctx.nodes.find(
				(n) => n.kind === 'gain' && n.outgoing.some((e) => e.to === filter)
			) as unknown as { gain: FakeParam } | undefined;
			return mixer?.gain.value ?? -1;
		};
		expect(filterFed(false)).toBeGreaterThan(0);
		expect(filterFed(true)).toBe(0);
	});
});

/**
 * A pitch is not a frequency.
 *
 * One is a place on a scale, the other a rate in hertz. The conversion one way
 * is exact and the other quantises -- which note 452 Hz "is" depends on a
 * tuning reference and a rounding rule -- so it is a node you can see rather
 * than something an oscillator does quietly with numbers it was handed.
 */
describe('pitch and frequency', () => {
	const conv = (
		type: 'tofreq' | 'topitch' | 'trsp',
		x: number,
		params: Record<string, number> = {},
		ev = note
	) =>
		PURE_NODES[type](
			{ get: (port, fallback) => (port === 'a' ? x : fallback) },
			(key, def) => params[key] ?? def,
			ev
		);

	it('turns a pitch into the frequency it names', () => {
		// Semitones from the reference: 0 is the reference itself, 12 an octave.
		expect(conv('tofreq', 0)).toBeCloseTo(440, 6);
		expect(conv('tofreq', 12)).toBeCloseTo(880, 6);
		expect(conv('tofreq', -12)).toBeCloseTo(220, 6);
	});

	it('reads a frequency back as a pitch, exactly', () => {
		expect(conv('topitch', 440)).toBe(0);
		expect(conv('topitch', 880)).toBe(12);
		/* 452 Hz is between two notes and stays between them. Rounding is QNT's
		   question now, asked on its own card: the converter answering it made
		   the quantise invisible unless you opened this module. */
		expect(conv('topitch', 452)).toBeCloseTo(0.4658, 3);
	});

	it('can hand back the unrounded pitch', () => {
		const exact = conv('topitch', 452, { quantise: 0 });
		expect(exact).toBeGreaterThan(0.4);
		expect(exact).toBeLessThan(0.5);
	});

	it('round-trips through both conversions', () => {
		for (const semis of [-24, -7, 0, 5, 12, 24]) {
			expect(conv('topitch', conv('tofreq', semis))).toBe(semis);
		}
	});

	it('follows the instrument tuning rather than assuming 440', () => {
		/* Master tuning is a real setting, so a patch that converts a pitch
		   agrees with the rest of the synth without being told. */
		const at432 = { ...note, tuning: 432 };
		expect(conv('tofreq', 0, {}, at432)).toBeCloseTo(432, 6);
		expect(conv('topitch', 432, {}, at432)).toBe(0);
		// And a converter may still name its own reference.
		expect(conv('tofreq', 0, { tuning: 415 }, at432)).toBeCloseTo(415, 6);
	});

	it('transposes by whole semitones, on its own card', () => {
		/* TRSP used to be a knob on TO-FREQ. Adding to a pitch is its own
		   operation, and welding it to the converter meant it could not take a
		   cable -- so the transpose was fixed for the life of the patch. */
		/* BY is a socket rather than a knob: what an operand is when nothing is
		   patched is a CONST's job, and that is where the kind of number gets
		   said. So the amount arrives on the inlet. */
		const by = (a: number, b: number) =>
			PURE_NODES.trsp(
				{ get: (port, f) => (port === 'a' ? a : port === 'b' ? b : f) },
				(_k, d) => d,
				note
			);
		expect(by(0, 12)).toBeCloseTo(12, 6);
		expect(by(0, -12)).toBeCloseTo(-12, 6);
		// And the conversion that follows it is the one that was there before.
		expect(conv('tofreq', by(0, 12))).toBeCloseTo(880, 6);
		expect(conv('tofreq', by(0, -12))).toBeCloseTo(220, 6);
	});

	it('survives a frequency of zero or less', () => {
		// log of zero is -Infinity; a silent input is not a pitch.
		expect(conv('topitch', 0)).toBe(0);
		expect(conv('topitch', -5)).toBe(0);
	});

	it('refuses to let a pitch reach a frequency inlet unconverted', () => {
		/* The point of the split. An oscillator takes hertz, so ENTRY's pitch has
		   to pass through a converter -- where the tuning reference is chosen
		   rather than assumed. */
		expect(rolesCompatible('pitch', 'hz')).toBe(false);
		expect(rolesCompatible('hz', 'pitch')).toBe(false);
		expect(rolesCompatible('pitch', 'pitch')).toBe(true);
		expect(rolesCompatible('hz', 'hz')).toBe(true);
	});
});

/**
 * SEQ, and the gap that makes a flam.
 *
 * Blueprint's Sequence runs Then 0 before Then 1. Audio has no "afterwards" --
 * two strikes at the same instant are one strike -- so SEQ says the order as a
 * gap in milliseconds, which is what anyone actually wants it for: a grace
 * note, a flam, the two layers a sampled kick is built from.
 */
describe('execution timing', () => {
	it('delays what follows a gap', () => {
		const graph = g(
			[
				['e', 'in'],
				['s', 'wait'],
				['o', 'out']
			],
			[wire('e', 'then', 's', 'exec'), wire('s', 'then', 'o', 'exec')]
		);
		const at = execDelays(graph, { 's.gapMs': 50 }, EXEC);
		// The gap applies downstream of the SEQ, not to the SEQ itself.
		expect(at.get('s')).toBe(0);
		expect(at.get('o')).toBeCloseTo(0.05, 6);
	});

	it('accumulates along a chain of gaps', () => {
		const graph = g(
			[
				['e', 'in'],
				['a', 'wait'],
				['b', 'wait'],
				['o', 'out']
			],
			[
				wire('e', 'then', 'a', 'exec'),
				wire('a', 'then', 'b', 'exec'),
				wire('b', 'then', 'o', 'exec')
			]
		);
		const at = execDelays(graph, { 'a.gapMs': 50, 'b.gapMs': 30 }, EXEC);
		expect(at.get('o')).toBeCloseTo(0.08, 6);
	});

	it('takes the earliest of two paths', () => {
		/* A node reached by two routes runs at the first of them, as it would in
		   Blueprint -- so a direct cable beats a delayed one however the cables
		   happen to be ordered. */
		const graph = g(
			[
				['e', 'in'],
				['s', 'wait'],
				['o', 'out']
			],
			[
				wire('e', 'then', 's', 'exec'),
				wire('s', 'then', 'o', 'exec'),
				wire('e', 'then', 'o', 'exec')
			]
		);
		expect(execDelays(graph, { 's.gapMs': 100 }, EXEC).get('o')).toBe(0);
	});

	it('terminates on a loop of gaps', () => {
		const graph = g(
			[
				['e', 'in'],
				['a', 'wait'],
				['b', 'wait']
			],
			[
				wire('e', 'then', 'a', 'exec'),
				wire('a', 'then', 'b', 'exec'),
				wire('b', 'then', 'a', 'exec')
			]
		);
		const at = execDelays(graph, { 'a.gapMs': 10, 'b.gapMs': 10 }, EXEC);
		expect(Number.isFinite(at.get('b') ?? NaN)).toBe(true);
	});

	it('treats a missing gap as no gap', () => {
		const graph = g(
			[
				['e', 'in'],
				['s', 'wait'],
				['o', 'out']
			],
			[wire('e', 'then', 's', 'exec'), wire('s', 'then', 'o', 'exec')]
		);
		expect(execDelays(graph, {}, EXEC).get('o')).toBe(0);
		// A negative gap is a hand-edited file, not a rewind.
		expect(execDelays(graph, { 's.gapMs': -500 }, EXEC).get('o')).toBe(0);
	});
});

/**
 * The logic chain is walked, not pattern-matched.
 *
 * `noteActions` hardcoded exactly two hops -- ENTRY to a WHEN, that WHEN to an
 * ACT -- so a SEQ anywhere along the chain dropped the rest of it without a
 * word: the walk found a node that was not a WHEN and gave up. It also
 * disagreed with execReach, which traverses properly, so the audio side and the
 * action side of one patch reached different conclusions about the same white
 * cable.
 *
 * These assert the shape rather than calling the engine, which needs a live
 * synth; the traversal itself is exercised in the browser.
 */
describe('the logic chain', () => {
	/** What the engine decides this note should do, for a given patch. */
	const actionsFor = (
		nodes: [string, string][],
		cables: ReturnType<typeof wire>[],
		params = {}
	) => {
		const S = modularSynth as unknown as Record<string, unknown>;
		const track = (S.tracks as Record<string, unknown>[])[0];
		const saved = JSON.parse(JSON.stringify(track));
		try {
			track.advanced = true;
			track.percussion = true;
			track.rackGraph = { nodes: nodes.map(([id, type]) => ({ id, type, x: 0, y: 0 })), cables };
			track.graphParams = params;
			return (
				S.noteActions as (t: unknown, n: number, id: number) => { cut: boolean; cutGroup: number }
			).call(S, track, 40, 0);
		} finally {
			Object.assign(track, saved);
		}
	};

	it('follows exec cables rather than matching a fixed shape', () => {
		/* The old walk hardcoded two hops -- ENTRY to a WHEN, that WHEN to an ACT
		   -- so a SEQ anywhere along the chain dropped the rest of it silently:
		   the walk found a node that was not a WHEN and gave up. Asked of the
		   answer the engine returns, so inserting a node in the middle is the
		   test rather than the spelling of the traversal. */
		const direct = actionsFor(
			[
				['e', 'in'],
				['a', 'act']
			],
			[wire('e', 'then', 'a', 'exec')],
			{ 'a.actGroup': 3 }
		);
		// The same ACT, one SEQ further along the same white cable.
		const viaSeq = actionsFor(
			[
				['e', 'in'],
				['s', 'wait'],
				['a', 'act']
			],
			[wire('e', 'then', 's', 'exec'), wire('s', 'then', 'a', 'exec')],
			{ 'a.actGroup': 3 }
		);
		expect(direct.cutGroup).toBe(3);
		expect(viaSeq.cutGroup).toBe(3);
	});

	it('treats WHEN as a branch, on the audio side as well as the actions', () => {
		/* Execution carries on past a WHEN only when its test holds -- which is
		   what makes it a branch rather than a node that happens to sit there.
		
		   `execReach` used to take every branch unconditionally while
		   `noteActions` evaluated the test, so the same white cable got two
		   answers: a WHEN muted the right notes and let every note sound. The
		   predicate is now one method both sides call. */
		const graph = g(
			[
				['e', 'in'],
				['w', 'when'],
				['o', 'out']
			],
			[wire('e', 'exec', 'w', 'exec'), wire('w', 'then', 'o', 'exec')]
		);
		// No predicate: every branch is taken, which is what the editor wants.
		expect(runs(execReach(graph, EXEC), 'o')).toBe(true);
		// A test that fails stops execution at the WHEN.
		expect(
			runs(
				execReach(graph, EXEC, 'in', () => false),
				'o'
			)
		).toBe(false);
		expect(
			runs(
				execReach(graph, EXEC, 'in', () => true),
				'o'
			)
		).toBe(true);
		// The WHEN itself still ran -- it was reached, and it asked.
		expect(
			runs(
				execReach(graph, EXEC, 'in', () => false),
				'w'
			)
		).toBe(true);
	});

	it('cannot loop on a cycle of exec cables', () => {
		/* Two WHENs pointing back at each other, with an ACT hanging off one of
		   them. ACT is terminal -- it has no outputs at all -- so a cycle can
		   only be made from the nodes that pass execution on. The walk has to
		   notice it has been somewhere before; if it does not this hangs rather
		   than failing, so the test is that it returns at all, with the ACT
		   beyond the loop still found. */
		const actions = actionsFor(
			[
				['e', 'in'],
				['w1', 'when'],
				['w2', 'when'],
				['a', 'act']
			],
			[
				wire('e', 'then', 'w1', 'exec'),
				wire('w1', 'then', 'w2', 'exec'),
				wire('w2', 'then', 'w1', 'exec'),
				wire('w1', 'then', 'a', 'exec')
			],
			{ 'a.actGroup': 2 }
		);
		expect(actions.cutGroup).toBe(2);
	});

	it('starts each source when its own node runs', () => {
		/* A SEQ gap reached the modules that schedule against the note time --
		   an envelope, a strike -- but every source was started at the note
		   regardless, so an oscillator behind a SEQ played on the beat and the
		   flam the module exists for did not happen. Measured as the start time
		   the oscillator was actually given. */
		const startTimes = (gapMs: number) => {
			const ctx = new FakeCtx();
			const S = modularSynth as unknown as Record<string, unknown>;
			S.renderCtx = ctx;
			S.masterFXCtx = null;
			S.delayNode = null;
			S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
			(S.activeVoices as Map<string, unknown>).clear();
			const track = (S.tracks as Record<string, unknown>[])[0];
			const saved = JSON.parse(JSON.stringify(track));
			try {
				track.muted = false;
				track.advanced = true;
				track.rackGraph = {
					nodes: [
						{ id: 'e', type: 'in', x: 0, y: 0 },
						{ id: 's', type: 'wait', x: 1, y: 0 },
						{ id: 'o', type: 'osc', x: 2, y: 0 },
						{ id: 'out', type: 'out', x: 3, y: 0 }
					],
					cables: [
						{ from: 'e', fromPort: 'then', to: 's', toPort: 'exec' },
						{ from: 's', fromPort: 'then', to: 'out', toPort: 'exec' },
						{ from: 'o', fromPort: 'out', to: 'out', toPort: 'in' }
					]
				};
				track.graphParams = { 's.gapMs': gapMs };
				(S.triggerTrackVoice as (...a: unknown[]) => unknown)(0, 40, 0, 0, 0.4, 100, 100);
				return ctx.nodes.filter((n) => n.kind === 'osc').map((n) => n.startedAt ?? 0);
			} finally {
				Object.assign(track, saved);
				S.renderCtx = null;
			}
		};
		const onBeat = startTimes(0);
		const delayed = startTimes(200);
		expect(onBeat.length).toBeGreaterThan(0);
		// The oscillator behind the SEQ starts later than it would with no gap.
		expect(Math.max(...delayed)).toBeGreaterThan(Math.max(...onBeat));
	});
});
