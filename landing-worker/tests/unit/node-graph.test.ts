import { describe, it, expect } from 'vitest';
import { rolesCompatible } from '../../src/lib/stores/graph-model';
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

	it('uses its knob for an unwired second operand', () => {
		// A MUL with only A patched is a gain, which is the common case and
		// should not need a second cable to say so.
		expect(evalPure('mul', { a: 5 }, { mulB: 3 })).toBe(15);
		expect(evalPure('add', { a: 5 }, { addB: 3 })).toBe(8);
	});

	it('remaps a range and clamps to it', () => {
		const p = { inLo: 0, inHi: 1, outLo: 200, outHi: 8000 };
		expect(evalPure('remap', { a: 0 }, p)).toBe(200);
		expect(evalPure('remap', { a: 1 }, p)).toBe(8000);
		expect(evalPure('remap', { a: 0.5 }, p)).toBe(4100);
		// Past either end it holds, rather than running off the scale.
		expect(evalPure('remap', { a: 2 }, p)).toBe(8000);
		expect(evalPure('remap', { a: -1 }, p)).toBe(200);
	});

	it('survives a zero-width input range', () => {
		// Dividing by the span would be NaN; "always the low end" is the sane
		// reading of a range that has not been set.
		const v = evalPure('remap', { a: 5 }, { inLo: 1, inHi: 1, outLo: 10, outHi: 90 });
		expect(Number.isFinite(v)).toBe(true);
		expect(v).toBe(10);
	});

	it('clamps between its bounds', () => {
		const p = { clampLo: 2, clampHi: 8 };
		expect(evalPure('clamp', { a: 0 }, p)).toBe(2);
		expect(evalPure('clamp', { a: 5 }, p)).toBe(5);
		expect(evalPure('clamp', { a: 99 }, p)).toBe(8);
	});

	it('blends with lerp', () => {
		expect(evalPure('lerp', { a: 0, b: 10, alpha: 0 })).toBe(0);
		expect(evalPure('lerp', { a: 0, b: 10, alpha: 1 })).toBe(10);
		expect(evalPure('lerp', { a: 0, b: 10, alpha: 0.5 })).toBe(5);
		// Alpha outside 0..1 would extrapolate; it holds instead.
		expect(evalPure('lerp', { a: 0, b: 10, alpha: 4 })).toBe(10);
	});

	it('bends a unit value with curve', () => {
		expect(evalPure('curve', { a: 0.5 }, { exp: 1 })).toBeCloseTo(0.5, 6);
		expect(evalPure('curve', { a: 0.5 }, { exp: 2 })).toBeCloseTo(0.25, 6);
		// Outside 0..1 a fractional power of a negative base is NaN, so the
		// value passes through untouched.
		expect(evalPure('curve', { a: -3 }, { exp: 0.5 })).toBe(-3);
		expect(evalPure('curve', { a: 40 }, { exp: 0.5 })).toBe(40);
	});

	it('knows which types are pure', () => {
		for (const id of ['const', 'add', 'mul', 'remap', 'clamp', 'lerp', 'curve']) {
			expect(isPureNode(id)).toBe(true);
		}
		for (const id of ['osc', 'out', 'filter', 'when']) expect(isPureNode(id)).toBe(false);
	});
});

describe('pulling a value through a chain', () => {
	it('walks back through several pure nodes', () => {
		/* Velocity into a cutoff, the way a patch actually says "harder is
		   brighter": VEL 0..1 through a REMAP into a filter. */
		const graph = g(
			[
				['e', 'in'],
				['r', 'remap'],
				['f', 'filter']
			],
			[wire('e', 'vel', 'r', 'a'), wire('r', 'out', 'f', 'cutoff')]
		);
		const r = createResolver(
			graph,
			{
				'r.inLo': 0,
				'r.inHi': 1,
				'r.outLo': 200,
				'r.outHi': 1200
			},
			note
		);
		// velocity 0.8 across 200..1200
		expect(r.input('f', 'cutoff', 0)).toBeCloseTo(1000, 6);
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
		const long = {
			nodes: [...Array(N)].map((_, i) => ({ id: `n${i}`, type: 'add' })),
			cables: [...Array(N - 1)].map((_, i) => wire(`n${i}`, 'out', `n${i + 1}`, 'a'))
		};
		const deepFirst = createResolver(long, { 'n0.addB': 7 }, note);
		expect(deepFirst.input(`n${N - 1}`, 'a', -1)).toBe(7);

		const shallowFirst = createResolver(long, { 'n0.addB': 7 }, note);
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
				['a', 'seq'],
				['b', 'seq']
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
		expect(tailKinds(true)).toEqual([]);
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
		type: 'tofreq' | 'topitch',
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

	it('reads a frequency back as the nearest pitch', () => {
		expect(conv('topitch', 440)).toBe(0);
		expect(conv('topitch', 880)).toBe(12);
		// 452 Hz is between two notes; quantised, it becomes the nearer one.
		expect(conv('topitch', 452)).toBe(0);
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

	it('transposes by whole semitones', () => {
		expect(conv('tofreq', 0, { shift: 12 })).toBeCloseTo(880, 6);
		expect(conv('tofreq', 0, { shift: -12 })).toBeCloseTo(220, 6);
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
				['s', 'seq'],
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
				['a', 'seq'],
				['b', 'seq'],
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
				['s', 'seq'],
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
				['a', 'seq'],
				['b', 'seq']
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
				['s', 'seq'],
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
				['s', 'seq'],
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
						{ id: 's', type: 'seq', x: 1, y: 0 },
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
