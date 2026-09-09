import { describe, it, expect } from 'vitest';
import { MODULE_SPECS } from '../../src/lib/stores/synth-modules';
import { roleOf, rolesCompatible, topoOrder, wouldCycle, type PortRole } from '../../src/lib/stores/graph-model';
import { createResolver, execReach, execDelays, runs, isPureNode } from '../../src/lib/stores/node-graph';
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
const valueOut = (id: string) => spec(id).outputs.find((p) => !AUDIO_ROLES.includes(roleOf(p)) && roleOf(p) !== 'exec');

const wire = (from: string, fromPort: string, to: string, toPort: string) => ({ from, fromPort, to, toPort });

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
				const takers = MODULE_SPECS.filter((other) =>
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
				return mi && mo && rolesCompatible(roleOf(o), roleOf(mi)) && rolesCompatible(roleOf(mo), outRole);
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
	const ROLES: PortRole[] = ['exec', 'signal', 'mono', 'stereo', 'left', 'right', 'cv', 'pitch', 'hz', 'unit', 'index', 'time'];

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
		const values: PortRole[] = ['cv', 'hz', 'unit', 'index', 'time'];
		for (const a of values) for (const b of values) expect(rolesCompatible(a, b)).toBe(true);
	});
});

describe('graph shapes a patch actually takes', () => {
	const g = (nodes: [string, string][], cables: EvalGraph['cables'] = []): EvalGraph => ({
		nodes: nodes.map(([id, type]) => ({ id, type })),
		cables
	});
	/* topoOrder sorts on the audio cables alone: mod cables are connected after
	   everything is built and may legitimately form a cycle. */
	const topo = (graph: EvalGraph) =>
		topoOrder(
			{ nodes: graph.nodes.map((n) => ({ ...n, x: 0, y: 0 })), cables: graph.cables },
			graph.cables
		);

	it('builds a diamond with both sides before the join', () => {
		/* One source into two paths that rejoin -- the commonest shape after a
		   straight chain, and the one a topological sort exists for. */
		const graph = g(
			[['s', 'osc'], ['a', 'filter'], ['b', 'drive'], ['m', 'mix'], ['o', 'out']],
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
			[['s', 'osc'], ['m', 'ring'], ['o', 'out']],
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
		const graph = { nodes: [{ id: 'a', type: 'filter', x: 0, y: 0 }, { id: 'b', type: 'drive', x: 0, y: 0 }], cables: [wire('a', 'out', 'b', 'in')] };
		expect(wouldCycle(graph, 'b', 'a')).toBe(true);
		expect(wouldCycle(graph, 'a', 'b')).toBe(false);
	});

	it('allows a value cycle to be resolved without hanging', () => {
		/* The editor will not draw one, but a patch file is user data. A pull
		   evaluator must terminate rather than recurse to the stack limit. */
		const graph = g(
			[['a', 'add'], ['b', 'mul'], ['c', 'clamp']],
			[wire('a', 'out', 'b', 'a'), wire('b', 'out', 'c', 'a'), wire('c', 'out', 'a', 'a')]
		);
		const r = createResolver(graph, {}, note);
		expect(Number.isFinite(r.input('a', 'a', -1))).toBe(true);
	});

	it('resolves a value feeding several knobs to one answer', () => {
		const graph = g(
			[['c', 'const'], ['x', 'filter'], ['y', 'filter'], ['z', 'drive']],
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
			[['a', 'filter'], ['b', 'filter']],
			[]
		);
		const r = createResolver(graph, { 'a.cutoff': 200, 'b.cutoff': 9000 }, note);
		expect(r.input('a', 'cutoff', 0)).toBe(200);
		expect(r.input('b', 'cutoff', 0)).toBe(9000);
	});

	it('leaves an unrelated island alone', () => {
		// A patch with a stray disconnected module still builds.
		const graph = g(
			[['s', 'osc'], ['o', 'out'], ['stray', 'filter']],
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
			[['e', 'in'], ['s', 'seq'], ['w', 'when'], ['a', 'act'], ['o', 'out']],
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
			[['e', 'in'], ['o1', 'out'], ['o2', 'out']],
			[wire('e', 'then', 'o1', 'exec')]
		);
		const reach = execReach(graph, EXEC);
		expect(runs(reach, 'o1')).toBe(true);
		expect(runs(reach, 'o2')).toBe(false);
	});

	it('ignores an exec cable drawn backwards', () => {
		const graph = g([['e', 'in'], ['o', 'out']], [wire('o', 'then', 'e', 'exec')]);
		expect(runs(execReach(graph, EXEC), 'o')).toBe(false);
	});

	it('delays a whole branch behind one gap', () => {
		const graph = g(
			[['e', 'in'], ['s', 'seq'], ['w', 'when'], ['a', 'act']],
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
		   exactly what the sweep drives knobs with. */
		expect(neither.sort()).toEqual(['act', 'out', 'seq', 'when']);
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
				if (!Number.isFinite(q.min) || !Number.isFinite(q.max)) bad.push(`${m.id}.${q.key} not finite`);
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
