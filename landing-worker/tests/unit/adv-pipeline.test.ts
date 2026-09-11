import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MODULE_SPECS, WAVE_SHAPES, WAVE_LABELS } from '../../src/lib/stores/synth-modules';
import { modularSynth } from '../../src/lib/synth';
import { FakeCtx, FakeParam } from './stubs/audio-context';
import {
	roleOf,
	rolesCompatible,
	topoOrder,
	wouldCycle,
	type PortRole
} from '../../src/lib/stores/graph-model';
import {
	createResolver,
	execReach,
	execDelays,
	runs,
	isPureNode,
	isValueNode,
	PURE_NODES
} from '../../src/lib/stores/node-graph';
import type { EvalGraph } from '../../src/lib/stores/node-graph';

/**
 * The ADV pipeline, exercised structurally rather than one module at a time.
 *
 * Rendering the shipped presets proves they still sound; it says nothing about
 * the twenty-one modules no preset happens to use, and nothing about the shapes
 * a patch takes once someone starts building -- diamonds, islands, a value
 * chain feeding three knobs, a cable drawn backwards.
 *
 * Every one of the bugs this file guards against was invisible: a cable that
 * drew and carried nothing, a socket that read the wrong end, a value that came
 * out different depending on which node was asked first. None of them threw.
 */

const AUDIO_ROLES: PortRole[] = ['signal', 'mono', 'stereo', 'left', 'right'];
const EXEC = new Set(['exec', 'then']);

const note = { pitch: 0, tuning: 440, velocity: 0.8, noteIndex: 48, gate: 0.5, lanes: {} };
const spec = (id: string) => MODULE_SPECS.find((m) => m.id === id)!;
const audioIn = (id: string) => spec(id).inputs.find((p) => AUDIO_ROLES.includes(roleOf(p)));
const audioOut = (id: string) => spec(id).outputs.find((p) => AUDIO_ROLES.includes(roleOf(p)));
const valueOut = (id: string) =>
	spec(id).outputs.find((p) => !AUDIO_ROLES.includes(roleOf(p)) && roleOf(p) !== 'exec');

const wire = (from: string, fromPort: string, to: string, toPort: string) => ({
	from,
	fromPort,
	to,
	toPort
});

/** Every module, so a new one is covered the day it is added. */
const ALL = MODULE_SPECS.map((m) => m.id);
const PLACEABLE = ALL.filter((id) => id !== 'in' && id !== 'out');

describe('every module is reachable in a patch', () => {
	it('can be wired from something and into something', () => {
		/* A module nothing can feed, or that can feed nothing, is a dead end on
		   the canvas however well it works internally. MONO was exactly this:
		   its output could not reach OUT, which is the one thing it exists for. */
		const stranded: string[] = [];
		for (const id of PLACEABLE) {
			const m = spec(id);
			const outs = m.outputs.filter((p) => roleOf(p) !== 'exec');
			// Can anything take what it produces?
			for (const o of outs) {
				const takers = MODULE_SPECS.filter(
					(other) =>
						other.inputs.some((i) => rolesCompatible(roleOf(o), roleOf(i))) ||
						(other.params.length > 0 && rolesCompatible(roleOf(o), 'cv'))
				);
				if (!takers.length) stranded.push(`${id}.${o.id} feeds nothing`);
			}
			// Can anything feed what it takes?
			for (const i of m.inputs) {
				if (roleOf(i) === 'exec') continue;
				const givers = MODULE_SPECS.filter((other) =>
					other.outputs.some((o) => rolesCompatible(roleOf(o), roleOf(i)))
				);
				if (!givers.length) stranded.push(`${id}.${i.id} is fed by nothing`);
			}
		}
		expect(stranded).toEqual([]);
	});

	it('can carry audio from a source to the output', () => {
		/* Walk the role lattice: from every module that produces audio, is there
		   a path to OUT? Not "is there a cable", but "is there any sequence of
		   modules at all" -- which is what makes a width mismatch a wall rather
		   than an inconvenience. */
		const outRole = roleOf(spec('out').inputs.find((p) => p.id === 'in')!);
		const unreachable: string[] = [];
		for (const id of PLACEABLE) {
			const o = audioOut(id);
			if (!o) continue;
			// direct, or through one converter
			const direct = rolesCompatible(roleOf(o), outRole);
			const viaOne = PLACEABLE.some((mid) => {
				const mi = audioIn(mid);
				const mo = audioOut(mid);
				return (
					mi && mo && rolesCompatible(roleOf(o), roleOf(mi)) && rolesCompatible(roleOf(mo), outRole)
				);
			});
			if (!direct && !viaOne) unreachable.push(id);
		}
		expect(unreachable).toEqual([]);
	});

	it('can drive a knob from a value node', () => {
		// Every module with a knob must be reachable by a CONST, or the value
		// half of the graph cannot touch it.
		const constOut = roleOf(spec('const').outputs[0]);
		const unreachable = PLACEABLE.filter(
			(id) => spec(id).params.some((q) => !q.choices) && !rolesCompatible(constOut, 'cv')
		);
		expect(unreachable).toEqual([]);
	});
});

describe('the type lattice', () => {
	const ROLES: PortRole[] = [
		'exec',
		'signal',
		'mono',
		'stereo',
		'left',
		'right',
		'cv',
		'pitch',
		'hz',
		'unit',
		'index',
		'time'
	];

	it('keeps the three families apart', () => {
		for (const r of ROLES) {
			if (r === 'exec') continue;
			expect(rolesCompatible('exec', r)).toBe(false);
			expect(rolesCompatible(r, 'exec')).toBe(false);
		}
		expect(rolesCompatible('exec', 'exec')).toBe(true);
	});

	it('refuses sound into a value inlet and back', () => {
		for (const a of AUDIO_ROLES) {
			for (const v of ['cv', 'pitch', 'hz', 'unit', 'index', 'time'] as PortRole[]) {
				expect(rolesCompatible(a, v)).toBe(false);
				expect(rolesCompatible(v, a)).toBe(false);
			}
		}
	});

	it('treats one channel as one channel, however it was named', () => {
		/* `left`, `right` and `mono` are all a single channel -- grouping the
		   sides with `stereo` walled BREAK off from MERGE and SPLIT from MAKE. */
		for (const a of ['mono', 'left', 'right'] as PortRole[]) {
			for (const b of ['mono', 'left', 'right'] as PortRole[]) {
				expect(rolesCompatible(a, b)).toBe(true);
			}
			expect(rolesCompatible(a, 'stereo')).toBe(false);
			expect(rolesCompatible('stereo', a)).toBe(false);
		}
	});

	it('lets `signal` take whatever arrives', () => {
		// A filter does not care how many channels it is given.
		for (const a of AUDIO_ROLES) {
			expect(rolesCompatible(a, 'signal')).toBe(true);
			expect(rolesCompatible('signal', a)).toBe(true);
		}
	});

	it('keeps a pitch out of a frequency inlet', () => {
		for (const v of ['cv', 'hz', 'unit', 'index', 'time'] as PortRole[]) {
			expect(rolesCompatible('pitch', v)).toBe(false);
			expect(rolesCompatible(v, 'pitch')).toBe(false);
		}
		expect(rolesCompatible('pitch', 'pitch')).toBe(true);
	});

	it('is symmetric within the value family', () => {
		const values: PortRole[] = ['cv', 'hz', 'unit', 'time'];
		for (const a of values) for (const b of values) expect(rolesCompatible(a, b)).toBe(true);
	});

	it('keeps a count out of an inlet that wanted a proportion', () => {
		/* An I32 of 1 into OSC's PHS is one whole turn, which wraps to no
		   rotation: the cable drew, the inlet lit, and the sound was identical to
		   nothing patched. A count and a fraction of a turn are not the same
		   quantity and arithmetic does not convert them. */
		for (const v of ['hz', 'unit', 'time'] as PortRole[]) {
			expect(rolesCompatible('index', v)).toBe(false);
			expect(rolesCompatible(v, 'index')).toBe(false);
		}
	});

	it('still lets an index meet a plain number and its own kind', () => {
		/* Not walled off the way `pitch` is: an index is a quantity, so the
		   untyped real number arithmetic nodes hand out still reaches it, and MAP
		   is the visible conversion when a count has to become an amount. */
		expect(rolesCompatible('index', 'cv')).toBe(true);
		expect(rolesCompatible('cv', 'index')).toBe(true);
		expect(rolesCompatible('index', 'index')).toBe(true);
	});
});

describe('graph shapes a patch actually takes', () => {
	const g = (nodes: [string, string][], cables: EvalGraph['cables'] = []): EvalGraph => ({
		nodes: nodes.map(([id, type]) => ({ id, type })),
		cables
	});
	/* topoOrder sorts on the audio cables alone: mod cables are connected after
	   everything is built and may legitimately form a cycle.
	
	   This used to hand it `graph.cables` for both arguments, under this same
	   comment -- so the one thing the comment describes was never exercised.
	   Split them for real. */
	const isModCable = (c: EvalGraph['cables'][number]) => {
		const dst = graph_specOf(c.to);
		if (!dst) return false;
		const port = dst.inputs.find((q) => q.id === c.toPort);
		if (port) return port.kind === 'mod';
		return dst.params.some((q) => q.key === c.toPort);
	};
	let typeById = new Map<string, string>();
	const graph_specOf = (nodeId: string) => MODULE_SPECS.find((m) => m.id === typeById.get(nodeId));
	const topo = (graph: EvalGraph) => {
		typeById = new Map(graph.nodes.map((n) => [n.id, n.type]));
		return topoOrder(
			{ nodes: graph.nodes.map((n) => ({ ...n, x: 0, y: 0 })), cables: graph.cables },
			graph.cables.filter((c) => !isModCable(c))
		);
	};

	it('builds a diamond with both sides before the join', () => {
		/* One source into two paths that rejoin -- the commonest shape after a
		   straight chain, and the one a topological sort exists for. */
		const graph = g(
			[
				['s', 'osc'],
				['a', 'filter'],
				['b', 'drive'],
				['m', 'mix'],
				['o', 'out']
			],
			[
				wire('s', 'out', 'a', 'in'),
				wire('s', 'out', 'b', 'in'),
				wire('a', 'out', 'm', 'in'),
				wire('b', 'out', 'm', 'b'),
				wire('m', 'out', 'o', 'in')
			]
		);
		const order = topo(graph)!.map((n) => n.id);
		expect(order).not.toBeNull();
		expect(order.indexOf('a')).toBeLessThan(order.indexOf('m'));
		expect(order.indexOf('b')).toBeLessThan(order.indexOf('m'));
		expect(order.indexOf('s')).toBeLessThan(order.indexOf('a'));
	});

	it('builds one source feeding both inlets of a module', () => {
		// Two cables from the same node into the same node: the indegree must be
		// decremented once per cable, not once per source.
		const graph = g(
			[
				['s', 'osc'],
				['m', 'ring'],
				['o', 'out']
			],
			[wire('s', 'out', 'm', 'in'), wire('s', 'out', 'm', 'b'), wire('m', 'out', 'o', 'in')]
		);
		expect(topo(graph)).not.toBeNull();
	});

	it('builds a long chain in order', () => {
		const N = 24;
		const nodes: [string, string][] = [['s', 'osc']];
		const cables: EvalGraph['cables'] = [];
		for (let i = 0; i < N; i++) {
			nodes.push([`f${i}`, 'filter']);
			cables.push(wire(i === 0 ? 's' : `f${i - 1}`, 'out', `f${i}`, 'in'));
		}
		const order = topo(g(nodes, cables))!.map((n) => n.id);
		for (let i = 1; i < N; i++) {
			expect(order.indexOf(`f${i - 1}`)).toBeLessThan(order.indexOf(`f${i}`));
		}
	});

	it('refuses an audio cycle', () => {
		// Web Audio measured stable only to about g = 0.90 in a delay loop and
		// screamed past it, so a cycle is refused rather than clamped.
		const graph = {
			nodes: [
				{ id: 'a', type: 'filter', x: 0, y: 0 },
				{ id: 'b', type: 'drive', x: 0, y: 0 }
			],
			cables: [wire('a', 'out', 'b', 'in')]
		};
		expect(wouldCycle(graph, 'b', 'a')).toBe(true);
		expect(wouldCycle(graph, 'a', 'b')).toBe(false);
	});

	it('allows a value cycle to be resolved without hanging', () => {
		/* The editor will not draw one, but a patch file is user data. A pull
		   evaluator must terminate rather than recurse to the stack limit. */
		const graph = g(
			[
				['a', 'add'],
				['b', 'mul'],
				['c', 'clamp']
			],
			[wire('a', 'out', 'b', 'a'), wire('b', 'out', 'c', 'a'), wire('c', 'out', 'a', 'a')]
		);
		const r = createResolver(graph, {}, note);
		expect(Number.isFinite(r.input('a', 'a', -1))).toBe(true);
	});

	it('resolves a value feeding several knobs to one answer', () => {
		const graph = g(
			[
				['c', 'const'],
				['x', 'filter'],
				['y', 'filter'],
				['z', 'drive']
			],
			[
				wire('c', 'out', 'x', 'cutoff'),
				wire('c', 'out', 'y', 'cutoff'),
				wire('c', 'out', 'z', 'driveTone')
			]
		);
		const r = createResolver(graph, { 'c.value': 3210 }, note);
		expect(r.input('x', 'cutoff', 0)).toBe(3210);
		expect(r.input('y', 'cutoff', 0)).toBe(3210);
		expect(r.input('z', 'driveTone', 0)).toBe(3210);
	});

	it('keeps two modules of one type independent', () => {
		/* Everything is keyed by node id, but that is exactly the kind of thing
		   a refactor breaks silently -- and two oscillators at one pitch is not
		   a patch anyone would notice was wrong. */
		const graph = g(
			[
				['a', 'filter'],
				['b', 'filter']
			],
			[]
		);
		const r = createResolver(graph, { 'a.cutoff': 200, 'b.cutoff': 9000 }, note);
		expect(r.input('a', 'cutoff', 0)).toBe(200);
		expect(r.input('b', 'cutoff', 0)).toBe(9000);
	});

	it('leaves an unrelated island alone', () => {
		// A patch with a stray disconnected module still builds.
		const graph = g(
			[
				['s', 'osc'],
				['o', 'out'],
				['stray', 'filter']
			],
			[wire('s', 'out', 'o', 'in')]
		);
		expect(topo(graph)).not.toBeNull();
	});
});

describe('execution across a whole patch', () => {
	const g = (nodes: [string, string][], cables: EvalGraph['cables'] = []): EvalGraph => ({
		nodes: nodes.map(([id, type]) => ({ id, type })),
		cables
	});

	it('reaches an output through a chain of logic', () => {
		const graph = g(
			[
				['e', 'in'],
				['s', 'wait'],
				['w', 'when'],
				['a', 'act'],
				['o', 'out']
			],
			[
				wire('e', 'then', 's', 'exec'),
				wire('s', 'then', 'w', 'exec'),
				wire('w', 'then', 'a', 'exec'),
				wire('e', 'then', 'o', 'exec')
			]
		);
		const reach = execReach(graph, EXEC);
		for (const id of ['s', 'w', 'a', 'o']) expect(runs(reach, id)).toBe(true);
	});

	it('does not reach a second output left unwired', () => {
		/* Two OUTs is a legitimate patch -- two voices in parallel -- and one of
		   them being silent has to be a decision the canvas shows. */
		const graph = g(
			[
				['e', 'in'],
				['o1', 'out'],
				['o2', 'out']
			],
			[wire('e', 'then', 'o1', 'exec')]
		);
		const reach = execReach(graph, EXEC);
		expect(runs(reach, 'o1')).toBe(true);
		expect(runs(reach, 'o2')).toBe(false);
	});

	it('ignores an exec cable drawn backwards', () => {
		const graph = g(
			[
				['e', 'in'],
				['o', 'out']
			],
			[wire('o', 'then', 'e', 'exec')]
		);
		expect(runs(execReach(graph, EXEC), 'o')).toBe(false);
	});

	it('delays a whole branch behind one gap', () => {
		const graph = g(
			[
				['e', 'in'],
				['s', 'wait'],
				['w', 'when'],
				['a', 'act']
			],
			[
				wire('e', 'then', 's', 'exec'),
				wire('s', 'then', 'w', 'exec'),
				wire('w', 'then', 'a', 'exec')
			]
		);
		const at = execDelays(graph, { 's.gapMs': 40 }, EXEC);
		expect(at.get('w')).toBeCloseTo(0.04, 6);
		expect(at.get('a')).toBeCloseTo(0.04, 6);
	});
});

/**
 * What the offline renders established, recorded.
 *
 * The audio itself needs a real context, so these pin the facts those renders
 * proved rather than re-deriving them: every module was built into a full patch
 * (ENTRY through a FREQ converter into a source, through the module, into OUT
 * with the exec cable wired) at the minimum, default and maximum of every knob
 * it declares, and rendered offline at 48 kHz.
 *
 *   34 audio modules × 3 settings   no NaN, no build failure, no silence
 *    9 value modules × 3 settings   each one moved a filter cutoff it drove
 *    6 realistic patches            struck resonator with velocity into
 *                                   brightness, stereo widener, FM pair, drum
 *                                   with a noise transient and a tuned body,
 *                                   split/process/merge, six shapers in series
 *   13 graph presets, 47 kit keys   all sound, none NaN
 *
 * Three identities came out exact, which is what makes the second-outlet
 * routing trustworthy: a meter in the chain is bit-transparent, SPLIT into
 * MERGE round-trips, and BREAK into MAKE round-trips at unity width.
 */
describe('what the renders proved', () => {
	it('covers every module the catalogue declares', () => {
		/* The render sweep walks MODULE_SPECS, so a module added tomorrow is
		   covered the day it appears -- which matters because twenty-one modules
		   appear in no shipped preset at all and would otherwise go untested. */
		/* Every module produces something the sweep can measure: sound, or a
		   value that moves a knob. The exceptions are the logic chain and OUT,
		   which carry execution and are covered by the exec tests instead. */
		const measured = ALL.filter((id) => audioOut(id) || valueOut(id));
		const neither = ALL.filter((id) => !audioOut(id) && !valueOut(id));
		/* ENTRY is not among them: it publishes the note as values, which is
		   exactly what the sweep drives knobs with. The meters are: they observe
		   a signal and hand nothing back, so they sit at the end of a branch. */
		expect(neither.sort()).toEqual(['act', 'fft', 'loud', 'out', 'scope', 'wait', 'when']);
		expect(measured.length).toBe(ALL.length - neither.length);
	});

	it('declares a usable range on every knob it renders', () => {
		/* The sweep sets each knob to its min and its max, so a range that would
		   produce NaN or an unbuildable node shows up there. That only works if
		   the declared bounds are the real ones. */
		const bad: string[] = [];
		for (const m of MODULE_SPECS) {
			for (const q of m.params) {
				if (!(q.min < q.max)) bad.push(`${m.id}.${q.key} min >= max`);
				if (q.def < q.min || q.def > q.max) bad.push(`${m.id}.${q.key} def outside range`);
				if (!(q.step > 0)) bad.push(`${m.id}.${q.key} step`);
				if (!Number.isFinite(q.min) || !Number.isFinite(q.max))
					bad.push(`${m.id}.${q.key} not finite`);
			}
		}
		expect(bad).toEqual([]);
	});

	it('gives every value module an outlet something can take', () => {
		/* A value node whose output nothing accepts cannot be used at all. Most
		   drive a knob directly; TOPITCH hands back a pitch, which by design only
		   a pitch inlet takes -- that is the type split working, not a gap. */
		for (const id of ALL.filter((x) => isPureNode(x))) {
			const out = valueOut(id);
			expect(out, `${id} has no value outlet`).toBeTruthy();
			const role = roleOf(out!);
			const takers = MODULE_SPECS.some((m) =>
				m.inputs.some((i) => rolesCompatible(role, roleOf(i)))
			);
			expect(takers, `${id} feeds no inlet`).toBe(true);
		}
	});
});

/**
 * The four defects a review found after 825 tests were green.
 *
 * Every one of them was reachable from the palette, drawn correctly on the
 * canvas, and silent or wrong in the audio. They survived a full suite because
 * that suite asked whether certain *strings* were present in synth.ts, and the
 * strings were: the port ids were spelled right, the wiring was not. These ask
 * the code what it computes.
 */
describe('regressions the string tests could not see', () => {
	const g = (nodes: [string, string][], cables: EvalGraph['cables'] = []): EvalGraph => ({
		nodes: nodes.map(([id, type]) => ({ id, type })),
		cables
	});

	it('gives the same answer whichever end of a cycle is asked first', () => {
		/* A hand-edited patch can hold a loop. Not memoising the node that closes
		   it was not enough: its ancestors cached numbers computed from the
		   placeholder zero, so whichever end was pulled first got one answer and
		   the other end got another. Two patch files identical but for node order
		   played differently. */
		const graph = g(
			[
				['a', 'add'],
				['b', 'add'],
				['s1', 'mul'],
				['s2', 'mul']
			],
			[
				wire('b', 'out', 'a', 'a'),
				wire('a', 'out', 'b', 'a'),
				wire('a', 'out', 's1', 'a'),
				wire('b', 'out', 's2', 'a')
			]
		);
		const params = { 'a.addB': 10, 'b.addB': 100, 's1.mulB': 1, 's2.mulB': 1 };

		const first = createResolver(graph, params, note);
		const s1Then = [first.input('s1', 'a', 0), first.input('s2', 'a', 0)];
		const second = createResolver(graph, params, note);
		const s2First = second.input('s2', 'a', 0);
		const s1After = second.input('s1', 'a', 0);

		expect(s1Then[0]).toBe(s1After);
		expect(s1Then[1]).toBe(s2First);
	});

	it("converts pitch to frequency against the instrument's tuning, not 440", () => {
		/* TO-FREQ reads the master tuning off the note. The engine built the same
		   converter as a ConstantSource without passing the note, so one patch
		   held both answers: 432 where a knob read it, 440 where an audio param
		   did, and a filter tracking the note sat a third of a semitone sharp of
		   the oscillator it was tracking. */
		const at432 = { ...note, tuning: 432 };
		const graph = g([['f', 'tofreq']], []);
		const r = createResolver(graph, { 'f.a': 0 }, at432);
		expect(r.input('f', 'a', 0)).toBe(0);
		expect(PURE_NODES.tofreq({ get: (_p, f) => f }, (_k, d) => d, at432)).toBeCloseTo(432, 6);
		expect(PURE_NODES.tofreq({ get: (_p, f) => f }, (_k, d) => d, note)).toBeCloseTo(440, 6);
	});

	it('keeps the pure-node list and the "not a voice" list in step', () => {
		/* An unwired CONST must not be summed into the mix -- it is DC, a click
		   and then a silent offset eating headroom. The engine decided that from
		   a list typed out beside the pure-node table rather than derived from
		   it, so adding a pure node without remembering this list put DC in the
		   mix.
		
		   Every entry in the table is a value node; all but MAP are also pure.
		   MAP has a curve in the table *and* builds a WaveShaperNode, because a
		   transfer function fed a waveform has to bend every sample -- so the
		   engine names it in `isModOnly` alongside ENV and TO-CV, the others that
		   emit control through real audio nodes. */
		for (const type of Object.keys(PURE_NODES)) {
			expect(isValueNode(type), type).toBe(true);
			if (type !== 'map') expect(isPureNode(type), type).toBe(true);
		}
		/* And the engine's own list agrees that MAP is not summed into the mix.
		   Read from the source, because the alternative is asserting a duplicate
		   of it here. */
		const src = readFileSync('src/lib/synth.ts', 'utf8');
		const modOnly = /const isModOnly = [^;]+;/.exec(src)?.[0] ?? '';
		expect(modOnly, 'isModOnly not found').not.toBe('');
		for (const type of ['map', 'tocv', 'env']) expect(modOnly).toContain(`'${type}'`);
	});

	it('resolves both ends of a cable by port name', () => {
		/* The destination end was always looked up by name, in `mod`. The source
		   end took `out`, or `out2` for the single port literally called `r`, and
		   everything else silently fell back to `out`. ENTRY files its four event
		   pins under their own names, so every cable from VEL, GATE, NOTE or
		   PITCH connected ENTRY's *silent* gain instead: a hard hit and a soft
		   one came out at the same level with the cable drawn on the canvas.
		
		   Asked of the graph the engine builds: a cable from ENTRY's VEL into a
		   GAIN's LVL has to put a *signal* on that gain's param, and a hard hit
		   has to differ from a soft one. Reading the source for `outs.set('vel'`
		   proved only that the string was present.
		
		   Written against VCA, which is gone -- GAIN absorbed it, since an
		   amplifier with a negative range is a VCA and an inverter at once. The
		   rule is about ENTRY's named outlets rather than about either module. */
		const cvSources = (velocity: number) => {
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
						{ id: 'o', type: 'osc', x: 1, y: 0 },
						{ id: 'v', type: 'gain', x: 2, y: 0 },
						{ id: 'out', type: 'out', x: 3, y: 0 }
					],
					cables: [
						{ from: 'e', fromPort: 'then', to: 'out', toPort: 'exec' },
						{ from: 'o', fromPort: 'out', to: 'v', toPort: 'in' },
						{ from: 'e', fromPort: 'vel', to: 'v', toPort: 'level' },
						{ from: 'v', fromPort: 'out', to: 'out', toPort: 'in' }
					]
				};
				track.graphParams = {};
				(S.triggerTrackVoice as (...a: unknown[]) => unknown)(0, 40, 0, 0, 0.4, velocity, velocity);
				/* ENTRY publishes a scalar pin as a ConstantSource, and the cable
				   connects that source to the destination param. So the question
				   is twofold: does anything actually reach a param, and does the
				   value carried change with the strike. */
				const driven = ctx.nodes.flatMap((n) =>
					n.outgoing.filter((e) => e.to instanceof FakeParam).map((e) => e.to as FakeParam)
				);
				const offsets = ctx.nodes
					.filter((n) => n.kind === 'const')
					.map((n) => (n as unknown as { offset: FakeParam }).offset.value);
				/* What the gain ended up at, which is the thing the patch is about.
				   Asked of the built node rather than of the cable, because LVL is
				   a knob *and* an inlet and the velocity arrives as a value: the
				   number is on the node, not on a connection. */
				const gains = ctx.nodes
					.filter((n) => n.kind === 'gain')
					.map((n) => (n as unknown as { gain: FakeParam }).gain.value);
				return { driven, offsets, gains };
			} finally {
				Object.assign(track, saved);
				S.renderCtx = null;
			}
		};
		/* The VEL cable reaches the level, and a hard hit is not a soft one.
		
		   Asserted on the resulting gains rather than on the connection. GAIN's
		   LVL is a declared inlet *and* a param of the same name, so ENTRY's VEL
		   resolves as a value and replaces the knob -- it is not connected as a
		   signal, because connecting it as well applied it twice and made this
		   patch 1.39x too loud. The claim worth pinning is that the velocity
		   arrives and that it varies, not which of the two mechanisms carries
		   it. */
		expect(cvSources(100).gains.some((g) => g > 0)).toBe(true);
		expect(cvSources(10).gains.join(',')).not.toBe(cvSources(127).gains.join(','));
		// ENTRY still publishes its pins as sources, whoever reads them.
		expect(cvSources(10).offsets.join(',')).not.toBe(cvSources(127).offsets.join(','));
	});

	it('does not call a mod cable a cycle', () => {
		/* The envelope-follower patch: BREAK taps a signal, its AMP outlet drives
		   a filter's cutoff, and the filter feeds back into the BREAK. The mod
		   cable already runs follower -> filter, so walking every cable made the
		   audio cable filter -> break look like a loop, and the editor refused a
		   patch the engine builds without complaint. Only audio cables loop. */
		const graph = {
			nodes: [
				{ id: 'b', type: 'break', x: 0, y: 0 },
				{ id: 'f', type: 'filter', x: 0, y: 0 }
			],
			cables: [wire('b', 'out', 'f', 'cutoff')]
		};
		const audioOnly = (c: { to: string; toPort: string }) => {
			const type = graph.nodes.find((n) => n.id === c.to)?.type;
			const sp = MODULE_SPECS.find((m) => m.id === type);
			return sp?.inputs.find((q) => q.id === c.toPort)?.kind === 'audio';
		};
		expect(wouldCycle(graph, 'f', 'b')).toBe(true);
		expect(wouldCycle(graph, 'f', 'b', audioOnly)).toBe(false);
	});

	it('clamps to a range whichever way round the bounds are set', () => {
		/* MIN 100 with MAX 0 used to return 100 for every input, including 9999:
		   the node became a constant and the card still looked like a clamp.
		
		   The bounds are sockets rather than knobs now -- a clamp takes whatever
		   kind of number it is given, so a knob would have had to pick the range
		   being clamped -- but the ordering rule is the same either way. */
		const at = (lo: number, hi: number) =>
			PURE_NODES.clamp(
				{ get: (port, f) => (port === 'a' ? 9999 : port === 'lo' ? lo : port === 'hi' ? hi : f) },
				(_k, d) => d,
				note
			);
		expect(at(100, 0)).toBe(100);
		expect(at(0, 100)).toBe(100);
	});

	it('leaves a knob at its setting when a signal is patched into it', () => {
		/* The bug that made "ENV into a filter cutoff" -- the first patch anyone
		   tries -- play silence. A cable from a node with no value to pull was
		   resolved as 0, so the filter opened at 0 Hz and the envelope added its
		   0..1 on top of nothing. A signal into a knob is connected to that
		   knob's AudioParam, where it *adds*, so the knob is the base.
		
		   Verified by rendering: 320 Hz spectral centroid unmodulated, 2068 Hz at
		   the envelope's attack, decaying to 660 Hz. */
		const graph = {
			nodes: [
				{ id: 'e', type: 'env' },
				{ id: 'f', type: 'filter' }
			],
			cables: [wire('e', 'out', 'f', 'cutoff')]
		};
		expect(createResolver(graph, { 'f.cutoff': 4000 }, note).input('f', 'cutoff', 99)).toBe(4000);
		// A pure node still replaces it: that is a value, not a signal.
		const withConst = {
			nodes: [
				{ id: 'k', type: 'const' },
				{ id: 'f', type: 'filter' }
			],
			cables: [wire('k', 'out', 'f', 'cutoff')]
		};
		expect(
			createResolver(withConst, { 'f.cutoff': 300, 'k.value': 8000 }, note).input('f', 'cutoff', 99)
		).toBe(8000);
	});

	it('binds a knob to its AudioParam where the knob is read', () => {
		/* Six of ninety-nine params were registered as modulation targets by
		   hand; the rest were unreachable by cable however the card drew them.
		   `knob()` reads the value and registers the target in one line, so the
		   two cannot drift. This fails if someone assigns an AudioParam from a
		   knob directly again.
		
		   Deliberately a source scan rather than a behavioural check, and the
		   only kind left in this file: it is a lint -- "no second way of doing
		   this may appear" -- and the thing being forbidden is a *shape*, which
		   has no runtime signature to observe. knob-binding.test.ts covers the
		   behaviour, by building every module and following what each knob
		   actually drives. */
		const SYNTH = readFileSync('src/lib/synth.ts', 'utf8');
		// The scan has to be looking at something, or it passes on a rename.
		expect(SYNTH).toContain('const knob = (');
		expect(SYNTH.length).toBeGreaterThan(10000);
		const raw = [...SYNTH.matchAll(/(\w+)\.(?:gain|frequency|Q|pan)\.value = p\('(\w+)'/g)];
		/* One exception, and it is not a knob: LFO's FM inlet takes its depth
		   from the rate, so binding it would register `lfoRate` twice and
		   overwrite the oscillator's own frequency as that knob's target. */
		const unbound = raw.filter((m) => !(m[1] === 'fm' && m[2] === 'lfoRate'));
		expect(unbound.map((m) => m[0])).toEqual([]);
	});

	it('applies a value once, not once per mechanism', () => {
		/* A knob has two ways to be driven and exactly one may act on any cable:
		   a pure node's value is pulled by the resolver and set as the param's
		   `.value`, and a signal is connected to that param, where Web Audio
		   sums it. Doing both applied it twice -- CONST 50 into MIX's A gave a
		   gain of 1.0 rather than 0.5, and CONST 100 gave 2.0.
		
		   ENTRY resolves by pin name the same way, so its VEL onto a knob
		   doubled identically. Both are skipped in the mod-cable loop, and only
		   when the destination is a knob: a declared mod inlet (a VCA's CV) has
		   no value path at all and must still be connected. */
		/* Built, not read. A CONST of 100 into MIX's A knob has to leave that leg
		   at a gain of 1 -- the same as turning the knob to 100 -- rather than
		   at 2, which is what applying both mechanisms gave. */
		const legGain = (cabled: boolean) => {
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
						{ id: 'o', type: 'osc', x: 1, y: 0 },
						{ id: 'mx', type: 'mix', x: 2, y: 0 },
						{ id: 'out', type: 'out', x: 3, y: 0 },
						...(cabled ? [{ id: 'k', type: 'const', x: 1, y: 1 }] : [])
					],
					cables: [
						{ from: 'e', fromPort: 'then', to: 'out', toPort: 'exec' },
						{ from: 'o', fromPort: 'out', to: 'mx', toPort: 'in' },
						{ from: 'mx', fromPort: 'out', to: 'out', toPort: 'in' },
						...(cabled ? [{ from: 'k', fromPort: 'out', to: 'mx', toPort: 'mixA' }] : [])
					]
				};
				track.graphParams = cabled ? { 'k.constVal': 100 } : { 'mx.mixA': 100 };
				(S.triggerTrackVoice as (...a: unknown[]) => unknown)(0, 40, 0, 0, 0.4, 100, 100);
				// The A leg is the gain the oscillator feeds inside MIX.
				const osc = ctx.nodes.find((n) => n.kind === 'osc');
				const legs = ctx.nodes.filter(
					(n) => n.kind === 'gain' && n.incoming.some((i) => i === osc || i.kind === 'gain')
				);
				return Math.max(...legs.map((g) => (g as unknown as { gain: FakeParam }).gain.value));
			} finally {
				Object.assign(track, saved);
				S.renderCtx = null;
			}
		};
		// Turned to 100 and patched with a CONST of 100 must agree, and both are 1.
		expect(legGain(true)).toBeCloseTo(legGain(false), 6);
		expect(legGain(true)).toBeLessThanOrEqual(1.0001);

		const graph = {
			nodes: [
				{ id: 'k', type: 'const' },
				{ id: 'mx', type: 'mix' }
			],
			cables: [wire('k', 'out', 'mx', 'mixA')]
		};
		expect(
			createResolver(graph, { 'mx.mixA': 0, 'k.value': 50 }, note).input('mx', 'mixA', 100)
		).toBe(50);
	});

	it("hands a knob its cable in the knob's own units", () => {
		/* `knobAt` reads a knob in the card's units and converts, so PAN's POS of
		   100 is a param of 1 -- hard right. Registering the AudioParam directly
		   made a cable bypass that conversion: a CONST of 100 landed whole and
		   meant a hundred times hard right. The scaling node in front is what
		   makes "100" mean the same thing turned or patched.
		
		   Asked of the built node rather than of MIX, which is gone: a mixer is
		   GAINs into a SUM, and the rule here is about units rather than about
		   mixing. */
		const ctx = new FakeCtx();
		const S = modularSynth as unknown as {
			noiseBuffer: unknown;
			buildGraphNode(...a: unknown[]): { mod: Map<string, unknown> } | null;
		};
		S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
		const made = S.buildGraphNode(
			ctx,
			'pan',
			(k: string, d: number) => ({ panPos: 100 })[k as 'panPos'] ?? d,
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
		/* The registered target is a scaling node, not the param itself, and its
		   gain carries the same conversion the knob goes through -- so a CONST of
		   100 arriving on it means 1, exactly as the knob at 100 does. */
		const target = made!.mod.get('panPos') as {
			gain: FakeParam;
			outgoing: { to: unknown }[];
		};
		expect(target.gain.value).toBeCloseTo(0.01, 6);
		expect(target.outgoing.some((e) => e.to instanceof FakeParam)).toBe(true);
	});

	it('delays a source behind a SEQ, and says what it cannot do', () => {
		/* The gap reaches sound by flowing backwards from the OUT that execution
		   reached late -- exec inlets exist only on SEQ/WHEN/ACT/OUT, so the
		   forward walk alone assigned delays to nothing that makes a sound. */
		const g = (nodes: [string, string][], cables: EvalGraph['cables']): EvalGraph => ({
			nodes: nodes.map(([id, type]) => ({ id, type })),
			cables
		});
		const two = g(
			[
				['e', 'in'],
				['s', 'wait'],
				['x1', 'excite'],
				['x2', 'excite'],
				['o1', 'out'],
				['o2', 'out']
			],
			[
				wire('e', 'then', 'o1', 'exec'),
				wire('e', 'then', 's', 'exec'),
				wire('s', 'then', 'o2', 'exec'),
				wire('x1', 'out', 'o1', 'in'),
				wire('x2', 'out', 'o2', 'in')
			]
		);
		const d = execDelays(two, { 's.gapMs': 200 }, EXEC);
		expect(d.get('x1')).toBe(0);
		expect(d.get('x2')).toBeCloseTo(0.2, 6);

		/* One source into both OUTs takes the earlier, because a node is built
		   once and starts once. That is a limit of the shape, not a bug: a flam
		   is two strikes, so it takes two EXCTs. */
		const one = g(
			[
				['e', 'in'],
				['s', 'wait'],
				['x', 'excite'],
				['o1', 'out'],
				['o2', 'out']
			],
			[
				wire('e', 'then', 'o1', 'exec'),
				wire('e', 'then', 's', 'exec'),
				wire('s', 'then', 'o2', 'exec'),
				wire('x', 'out', 'o1', 'in'),
				wire('x', 'out', 'o2', 'in')
			]
		);
		expect(execDelays(one, { 's.gapMs': 200 }, EXEC).get('x')).toBe(0);
	});

	it('never hands a knob a value that is not a number', () => {
		/* Every knob ends on an AudioParam, and Web Audio throws on a non-finite
		   assignment -- which aborts the note mid-build rather than playing it
		   wrong. `valueOf` guarded what it computed; a value read straight off
		   the patch went through untouched. A patch file is user data. */
		const graph = { nodes: [{ id: 'f', type: 'filter' }], cables: [] };
		const r = createResolver(graph, { 'f.cutoff': NaN, 'f.q': Infinity }, note);
		expect(r.input('f', 'cutoff', 4000)).toBe(4000);
		expect(r.input('f', 'q', 1)).toBe(1);
	});

	it('does not turn a broken SEQ gap into a start time', () => {
		// Math.max(0, NaN) is NaN, and start(NaN) throws.
		const graph = {
			nodes: [
				{ id: 'e', type: 'in' },
				{ id: 's', type: 'wait' },
				{ id: 'o', type: 'out' }
			],
			cables: [wire('e', 'then', 's', 'exec'), wire('s', 'then', 'o', 'exec')]
		};
		expect(execDelays(graph, { 's.gapMs': NaN }, EXEC).get('o')).toBe(0);
		expect(execDelays(graph, { 's.gapMs': Infinity }, EXEC).get('o')).toBe(0);
	});

	it('names every wave the same way in the catalogue and the engine', () => {
		/* The button labels, the engine's oscillator table and the card's preview
		   drawing were three copies of one list and disagreed: three of four
		   labels named the wrong shape. Now there is one list; this fails if a
		   fourth copy appears. */
		expect(WAVE_SHAPES.map((w) => w.label)).toEqual(WAVE_LABELS);
		expect(WAVE_SHAPES.map((w) => w.type)).toEqual(['sine', 'triangle', 'sawtooth', 'square']);
		/* The rest is a lint against a fourth copy appearing, which is a shape
		   and not a behaviour -- there is nothing to observe at runtime about a
		   list that does *not* exist. Both negative assertions are paired with a
		   positive one so a moved or renamed file cannot make them vacuous. */
		const SYNTH = readFileSync('src/lib/synth.ts', 'utf8');
		const CARD = readFileSync('src/lib/components/synth/patch/ModuleCard.svelte', 'utf8');
		expect(SYNTH).toContain('WAVE_SHAPES');
		expect(CARD).toContain('WAVE_SHAPES');
		// Neither may hold its own copy of the order.
		expect(SYNTH).not.toContain("['sine', 'triangle', 'sawtooth', 'square']");
		expect(CARD).not.toContain("'SIN'");
	});
});
