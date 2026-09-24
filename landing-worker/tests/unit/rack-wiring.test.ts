import { describe, it, expect } from 'vitest';
import { modularSynth } from '../../src/lib/synth';
import { FakeCtx, FakeParam, reaches, type FakeNode } from './stubs/audio-context';
import { MODULE_SPECS } from '../../src/lib/stores/synth-modules';

/**
 * What `buildRackGraph` actually wires.
 *
 * The suite could already answer "what value did this knob end up with" and
 * "are the two instruments isolated". It could not answer *which node connects
 * to which*, because nothing called `buildRackGraph` and looked at the result --
 * the tests that play a voice read `FakeParam.value`, and a connection does not
 * move a value.
 *
 * That gap was measured rather than guessed. Reversing the topological order,
 * deleting the entire mod-cable pass, collapsing every named inlet onto the
 * first one, and reading `rackGraph` raw instead of through `graphOf` each left
 * the whole suite green. Those are not exotic edits; three of them are the
 * bugs the engine's own comments say shipped once already.
 *
 * So these assert topology: `reaches()` follows edges, and `param.sources`
 * counts what is summing into an AudioParam. Both are questions the browser
 * answers the same way.
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
 * Only the nodes this patch built.
 *
 * A voice builds the rack scaffolding first and the graph last, so the ADV
 * nodes are the ones created after the voice's panner. Slicing there keeps
 * these assertions about the patch rather than about the 60-odd biquads the
 * track EQ makes either way.
 */
const advNodes = (ctx: FakeCtx): FakeNode[] => {
	const i = ctx.nodes.findIndex((n) => n.kind === 'panner');
	return ctx.nodes.slice(i + 1);
};

/**
 * Does the patch's own oscillator reach the voice's panner?
 *
 * The panner is where the graph hands over to the track's place in the mix, and
 * it is the last node the voice builds before the patch. `ctx.destination` is
 * not the sink to ask about here: this harness leaves `masterBusIn` null, so
 * nothing reaches it in any patch, working or broken.
 */
const sounds = (ctx: FakeCtx): boolean => {
	const panner = ctx.nodes.find((n) => n.kind === 'panner');
	if (!panner) return false;
	const oscs = advNodes(ctx).filter((n) => n.kind === 'osc');
	return oscs.length > 0 && oscs.some((o) => reaches(o, panner));
};

/** Every gain node whose `gain` param has something connected into it. */
const modulated = (ctx: FakeCtx) =>
	ctx.nodes.filter((n) => {
		const p = (n as unknown as { gain?: FakeParam }).gain;
		return p instanceof FakeParam && p.sources.length > 0;
	});

describe('a mod cable carries something', () => {
	/** How many things are summing into the patch's filter cutoff. */
	const cutoffSources = (graph: unknown, gp: Record<string, number> = {}) => {
		const { ctx } = play(graph, gp);
		const bq = advNodes(ctx).filter((n) => n.kind === 'biquad');
		expect(bq.length).toBe(1);
		return (bq[0] as unknown as { frequency: FakeParam }).frequency.sources.length;
	};

	const base = {
		nodes: [node('entry', 'in'), node('o', 'osc'), node('f', 'filter'), node('output', 'out')],
		cables: [EXEC, wire('o', 'out', 'f', 'in'), wire('f', 'out', 'output', 'in')]
	};

	/* Waiting on the catalogue. This asserts real behaviour of modules the
	   rebuild has not restored yet -- skipped rather than deleted or
	   weakened, because it is the test that has to pass before the
	   primitive it covers can be called done. */
	it('adds an envelope to the cutoff on top of what the knob holds', () => {
		/* The whole point of a mod cable, and deleting the pass that connects
		   them left 916 tests green: every ENV -> cutoff and LFO -> pitch in the
		   instrument stopped carrying anything and nothing noticed, because the
		   knob keeps its own value either way -- that is what "a signal adds"
		   means. The observable is the connection, so count connections, and
		   count them against the same patch without the cable so the filter's
		   own keytrack gain cannot be mistaken for the envelope. */
		const withEnv = {
			nodes: [...base.nodes, node('e', 'env')],
			cables: [...base.cables, wire('e', 'out', 'f', 'cutoff')]
		};
		expect(cutoffSources(withEnv)).toBe(cutoffSources(base) + 1);
	});
});

describe('a value and a signal are not both applied', () => {
	it('does not also connect a pure node it already read as a number', () => {
		/* "Exactly one mechanism per cable" is the rule the engine states most
		   often, and the test that claimed to cover it compared `gain.value` --
		   which double-application does not move, since the second application is
		   an added *connection*. Removing the guard survived the suite. A CONST
		   into a knob must replace the knob and connect nothing. */
		const { ctx } = play(
			{
				nodes: [
					node('entry', 'in'),
					node('o', 'osc'),
					node('f', 'filter'),
					node('c', 'const'),
					node('output', 'out')
				],
				cables: [
					EXEC,
					wire('o', 'out', 'f', 'in'),
					wire('f', 'out', 'output', 'in'),
					wire('c', 'out', 'f', 'cutoff')
				]
			},
			{ 'c.value': 800 }
		);
		const bq = advNodes(ctx).filter((n) => n.kind === 'biquad');
		expect(bq.length).toBe(1);
		const freq = (bq[0] as unknown as { frequency: FakeParam }).frequency;
		/* The knob is replaced -- the CONST's 800 is the cutoff -- and nothing is
		   summing in. It was one source rather than none while FILTER carried a
		   keytrack gain on its cutoff; that stage went when DEPTH did, because
		   scaling a control signal is what MUL and GAIN are for. Zero is the
		   stronger reading of the same rule: a pure node's value replaces the
		   knob and connects nothing at all. */
		expect(freq.value).toBe(800);
		expect(freq.sources.length).toBe(0);
	});

	/* Waiting on the catalogue. This asserts real behaviour of modules the
	   rebuild has not restored yet -- skipped rather than deleted or
	   weakened, because it is the test that has to pass before the
	   primitive it covers can be called done. */
	it('applies a cable onto MAKE’s WIDE once, not twice', () => {
		/* MAKE was the one module that both read a declared mod inlet as a value
		   and registered it, so a CONST of 2 gave 4. WIDE is declared, so the mod
		   loop does not skip it -- which means the value read had to go. */
		const { ctx } = play(
			{
				nodes: [
					node('entry', 'in'),
					node('o', 'osc'),
					node('m', 'make'),
					node('c', 'const'),
					node('output', 'out')
				],
				cables: [
					EXEC,
					wire('o', 'out', 'm', 'in'),
					wire('m', 'out', 'output', 'in'),
					wire('c', 'out', 'm', 'wide')
				]
			},
			{ 'c.value': 2 }
		);
		/* Once, and as a value: a CONST of 2 makes WIDE 2, not 4 and not 1.
		
		   This used to assert the other half of the same rule -- the gain holding
		   unity while the 2 arrived as a summed source -- because a CONST built a
		   ConstantSourceNode to connect. Pure nodes build nothing now, so the
		   resolver hands the number over and there is nothing to sum; applying it
		   twice would show up as 4 here rather than as a second connection. */
		const gains = ctx.nodes
			.map((n) => (n as unknown as { gain?: FakeParam }).gain)
			.filter((g): g is FakeParam => g instanceof FakeParam);
		expect(gains.some((g) => g.value === 2)).toBe(true);
		expect(gains.some((g) => g.value === 4)).toBe(false);
	});
});

describe('named ports go where they are named', () => {
	it('gives each leg of a two-input module its own path', () => {
		/* Collapsing every inlet onto the first survived the suite, and "the B
		   leg played at A's gain" is a bug this engine actually shipped -- it is
		   what the `in2` -> `b` rename was cleaning up after.

		   Asked of DIFF, which is the clearest case left now MIX is gone: its
		   whole function is that the two legs are *not* the same, since B
		   arrives inverted so the shared part cancels. If the inlets collapsed,
		   both oscillators would land on one leg and the -1 would be on both
		   paths or on neither. */
		const { ctx } = play(
			{
				nodes: [
					node('entry', 'in'),
					node('a', 'osc'),
					node('b', 'osc'),
					node('m', 'diff'),
					node('output', 'out')
				],
				cables: [
					EXEC,
					wire('a', 'out', 'm', 'in'),
					wire('b', 'out', 'm', 'b'),
					wire('m', 'out', 'output', 'in')
				]
			},
			{}
		);
		const oscs = advNodes(ctx).filter((n) => n.kind === 'osc');
		expect(oscs.length).toBe(2);
		/* The gain each leg passes through on its way to the join. */
		const legGains = (o: FakeNode): number[] => {
			const out: number[] = [];
			const seen = new Set<FakeNode>();
			const walk = (at: FakeNode, depth: number) => {
				if (depth === 0 || seen.has(at)) return;
				seen.add(at);
				for (const e of at.outgoing) {
					const d = e.to;
					if (!(d instanceof FakeParam)) {
						const g = (d as unknown as { gain?: FakeParam }).gain;
						if (g) out.push(g.value);
						walk(d as FakeNode, depth - 1);
					}
				}
			};
			walk(o, 3);
			return out;
		};
		const a = legGains(oscs[0]);
		const b = legGains(oscs[1]);
		// The inverting leg is reached by exactly one of them.
		const has = (xs: number[], v: number) => xs.some((x) => Math.abs(x - v) < 1e-6);
		expect(has(a, -1) !== has(b, -1)).toBe(true);
	});
});

describe('the graph the engine plays is the migrated one', () => {
	it('sounds a patch saved before ENTRY existed', () => {
		/* `graphOf` restores the fixed nodes and renames the ports the editor
		   renamed. Reading `rackGraph` raw instead survived the suite, and that
		   is precisely the bug the engine's comment says shipped: the editor
		   showed one graph and the engine played another. A patch with no ENTRY
		   and no exec cable still has to make a sound. */
		const { ctx } = play({
			nodes: [node('o', 'osc'), node('output', 'out')],
			cables: [wire('o', 'out', 'output', 'in')]
		});
		expect(sounds(ctx)).toBe(true);
	});

	it('honours the port name the editor renamed away from', () => {
		/* `in2` became `b`. A patch saved before the rename must still play its
		   second leg into the second inlet. Asked of DIFF, since MIX -- the
		   module this was written against -- is gone: a mixer is GAINs into a
		   SUM, and the rule is about the port name rather than the module. */
		const { ctx } = play({
			nodes: [node('entry', 'in'), node('a', 'osc'), node('m', 'diff'), node('output', 'out')],
			cables: [EXEC, wire('a', 'out', 'm', 'in2'), wire('m', 'out', 'output', 'in')]
		});
		expect(sounds(ctx)).toBe(true);
	});
});

describe('a patch reaches the destination at all', () => {
	it('carries the source through a chain to the sink', () => {
		/* Reversing the topological order disconnects every audio cable -- every
		   `built.get(c.from)` comes back undefined and the loop quietly skips it
		   -- and the suite stayed green, which means no test asserted that any
		   multi-node patch was connected end to end. This is that test. */
		const { ctx } = play({
			nodes: [
				node('entry', 'in'),
				node('o', 'osc'),
				node('f', 'filter'),
				node('v', 'gain'),
				node('output', 'out')
			],
			cables: [
				EXEC,
				wire('o', 'out', 'f', 'in'),
				wire('f', 'out', 'v', 'in'),
				wire('v', 'out', 'output', 'in')
			]
		});
		expect(sounds(ctx)).toBe(true);
	});
});

describe('a broken number in a saved patch is not a number', () => {
	it('does not hand a NaN knob to an AudioParam', () => {
		/* `cvIn` guards what it reads out of `graphParams`: a stored value that is
		   not finite means the knob is broken, and a broken knob means the same as
		   an absent one. The engine defeated that guard by passing the same raw
		   param back in as the fallback, so `NaN` resolved to `NaN` and reached
		   `frequency.value` -- where a real browser throws, taking the note and
		   the rest of the scheduler tick with it.

		   The suite could not see it: every test called the resolver directly with
		   a code default, which is the one shape the engine never uses. */
		const { ctx } = play(
			{
				nodes: [node('entry', 'in'), node('o', 'osc'), node('f', 'filter'), node('output', 'out')],
				cables: [EXEC, wire('o', 'out', 'f', 'in'), wire('f', 'out', 'output', 'in')]
			},
			{ 'f.cutoff': Number.NaN }
		);
		for (const n of advNodes(ctx)) {
			for (const key of ['frequency', 'gain', 'Q', 'detune', 'offset', 'pan'] as const) {
				const p = (n as unknown as Record<string, unknown>)[key];
				if (p instanceof FakeParam) expect(Number.isFinite(p.value)).toBe(true);
			}
		}
	});
});

describe('a knob boots at the number printed on the card', () => {
	/* Waiting on the catalogue. This asserts real behaviour of modules the
	   rebuild has not restored yet -- skipped rather than deleted or
	   weakened, because it is the test that has to pass before the
	   primitive it covers can be called done. */
	it('uses the spec default when the engine falls back', () => {
		/* The card and the engine each carry their own idea of an untouched
		   knob's value, and for STRING/TUBE/MODES they disagreed: the spec says
		   MIX 70, the engine fell back to 100. An untouched knob is *absent* from
		   `graphParams` -- the forwarding pass writes NaN and then deletes it --
		   so the engine's number is the one that plays. At 100 the dry leg is
		   `(1 - mix)` (squared, for MODES), which is zero: the strike transient
		   is discarded and turning MIX to its own printed default changes the
		   sound. */
		/* Asked of the engine itself rather than scraped from its source: each
		   module is built with the knob untouched -- absent, as the forwarding
		   pass leaves it -- and the parameter the knob is bound to is read. */
		const cases: [module: string, key: string, want: number][] = [
			['string', 'strBlend', 70],
			['tube', 'tubeMix', 70],
			['modes', 'modeMix', 70]
		];
		const S = modularSynth as unknown as {
			noiseBuffer: unknown;
			buildGraphNode(...a: unknown[]): { mod: Map<string, unknown> } | null;
		};
		for (const [module, key, want] of cases) {
			const spec = MODULE_SPECS.flatMap((m) => m.params ?? []).find((p) => p.key === key);
			expect(spec, key).toBeDefined();
			expect(spec!.def, key).toBe(want);
			const ctx = new FakeCtx();
			S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
			const made = S.buildGraphNode(
				ctx,
				module,
				(_k: string, d: number) => d,
				220,
				0,
				0.5,
				[],
				'n1',
				{},
				(_n: string, _p: string, f: number) => f,
				{ velocity: 0.8, noteIndex: 48, tuning: 440 }
			);
			const param = made?.mod.get(key);
			expect(param, `${key} is not bound to a parameter`).toBeInstanceOf(FakeParam);
			/* And the engine agrees with the card. */
			expect((param as FakeParam).value, `${key} engine fallback`).toBe(want);
		}
	});
});
