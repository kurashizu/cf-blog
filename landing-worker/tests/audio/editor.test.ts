import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * The layer between the canvas and the sound.
 *
 * audio.test.ts asks what a patch sounds like, and every patch it renders is a
 * graph written out as a literal. That measures the engine, and it leaves
 * everything between the pointer and the patch unexecuted: which cables the
 * canvas will draw, what MAP's range fills in with, what a delete takes with
 * it, what an undo puts back, whether a patch survives being written to a file.
 * All of that is code with its own bugs, and a graph typed into a test never
 * runs a line of it.
 *
 * So these drive the editor's own functions -- `addNode`, `addCable`,
 * `removeNode`, `setGraphParams`, `undoGraph` -- against the live track through
 * `window.__audit.edit`, and then render what they built. The assertion at the
 * end of most of these is an envelope, which is what makes them end-to-end: an
 * edit is only correct if the sound it produces is.
 *
 * The role lattice is deliberately not re-tested here. `rolesCompatible` is a
 * pure function over two strings and tests/unit/adv-pipeline.test.ts already
 * pins the whole matrix -- audio never meets control, `pitch` and `bool` meet
 * only themselves, `index` meets only `cv` and `index`, the width rule for
 * mono/stereo/left/right. Driving a browser to re-ask a question a unit test
 * answers exactly is slower and no stronger.
 */

const BASE = process.env.AUDIT_URL ?? 'http://localhost:5182';

type Envelope = {
	ok: boolean;
	builtVoice?: boolean;
	envelope: number[];
	peak: number;
	error?: string;
};

type Cable = { from: string; fromPort: string; to: string; toPort: string };
type Graph = { nodes: { id: string; type: string }[]; cables: Cable[] };

/** The editing surface the audit page exposes, mirrored for the test's types. */
type Edit = {
	graph(): Graph;
	params(): Record<string, number>;
	addNode(type: string, x?: number, y?: number): string;
	addCable(cable: Cable, kind: string): 'ok' | 'cycle' | 'duplicate';
	removeCable(i: number): void;
	removeNode(id: string): void;
	deleteSelection(ids: string[]): void;
	setParam(nodeId: string, param: string, value: number): void;
	setParams(values: Record<string, number>): void;
	undo(): boolean;
	redo(): boolean;
	clearHistory(): void;
	isFixedNode(id: string): boolean;
};

type Audit = {
	setTrack(t: unknown): unknown;
	run(s: number, n: number, sl: number): Promise<Envelope>;
	edit: Edit;
	drivenBy(patch: unknown, nodeId: string, port: string): { signal: boolean; wired: boolean };
	exportTimbre(format?: string): { text: string; valid: boolean };
};

let browser: Browser;
let page: Page;

beforeAll(async () => {
	browser = await chromium.launch({ channel: 'chrome' });
	page = await browser.newPage();
	await page.goto(`${BASE}/synth/audit`, { waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!(window as never as { __audit?: unknown }).__audit, {
		timeout: 15000
	});
}, 60000);

afterAll(async () => {
	await browser?.close();
});

/**
 * Run a function in the page with the editing surface to hand.
 *
 * The body is serialised and rebuilt in the browser, so it closes over nothing
 * -- everything it needs arrives in `arg`. A dynamic `import()` inside
 * `page.evaluate` is rewritten by Vitest's transform and arrives undefined, so
 * reaching the store this way, through a page that already holds it, is the
 * only route in.
 */
function inPage<A, R>(fn: (a: { audit: Audit; arg: A }) => R | Promise<R>, arg: A): Promise<R> {
	/* `arg` crosses as JSON and the body crosses as source text, so the pair is
	   typed loosely here and narrowed by the call's own return type. Playwright
	   unboxes whatever it is handed, which is why the result is asserted rather
	   than inferred. */
	return page.evaluate(
		async (p: { src: string; arg: unknown }) => {
			const audit = (window as never as { __audit: Audit }).__audit;
			const body = new Function('return (' + p.src + ')')() as (a: {
				audit: Audit;
				arg: unknown;
			}) => unknown;
			return await body({ audit, arg: p.arg });
		},
		{ src: fn.toString(), arg: arg as unknown }
	) as Promise<R>;
}

/** The bare OSC-into-OUT patch every case below starts from. Renders 0.4813. */
const BASE_PATCH = {
	advanced: true,
	rackGraph: {
		nodes: [
			{ id: 'entry', type: 'in', x: 0, y: 0 },
			{ id: 'o', type: 'osc', x: 100, y: 0 },
			{ id: 'output', type: 'out', x: 300, y: 0 }
		],
		cables: [
			{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
			{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
		]
	},
	graphParams: {}
};

/** Bare OSC, measured. Every reading below is against this. */
const BARE = 0.4813;

describe('MAP: the input range is filled in from what was plugged in', () => {
	/* `inferMapRange` is the answer to a bug that is silent by construction. MAP's
	   X bounds say what the incoming signal swings between, and left at the
	   default 0..1 a -1..1 waveform has its whole negative half clamped flat --
	   so half the cycle does nothing, the card looks correct, and nobody types
	   those numbers before hearing the problem.

	   The cable's *role* is what knows, so the bounds are filled when the cable is
	   drawn. Every row below was measured through `addCable` against the live
	   track rather than read off ROLE_RANGE, which is a table someone could edit
	   in step with a test that only compares it to itself. */
	const inferred = (
		build: string
	): Promise<{ result: string; inLo?: number; inHi?: number }> =>
		inPage(
			({ audit, arg }) => {
				audit.edit.clearHistory();
				audit.setTrack(JSON.parse(JSON.stringify(arg.patch)));
				const mid = audit.edit.addNode('map', 200, 100);
				/* The source, by name: each of these publishes an outlet with a
				   different role, which is the only thing that varies. */
				let cable: Cable;
				if (arg.build === 'vel') cable = { from: 'entry', fromPort: 'vel', to: mid, toPort: 'a' };
				else if (arg.build === 'pitch')
					cable = { from: 'entry', fromPort: 'pitch', to: mid, toPort: 'a' };
				else if (arg.build === 'note')
					cable = { from: 'entry', fromPort: 'note', to: mid, toPort: 'a' };
				else {
					const n = audit.edit.addNode(arg.build, 150, 100);
					cable = { from: n, fromPort: 'out', to: mid, toPort: 'a' };
				}
				const result = audit.edit.addCable(cable, 'mod');
				const ps = audit.edit.params();
				return { result, inLo: ps[mid + '.inLo'], inHi: ps[mid + '.inHi'] };
			},
			{ patch: BASE_PATCH, build }
		);

	it('fills the bounds with the range the source role occupies', async () => {
		/* Six roles, six ranges, each read back off the track after the cable was
		   drawn. The numbers are ROLE_RANGE's, and the point of asserting them
		   from here is that the whole path runs: the cable's `fromPort` is looked
		   up in the source module's outlets, its role resolved through `roleOf`,
		   and the pair written with `setGraphParams`. A lookup that found the
		   wrong port, or a role defaulting to `cv` for everything, gives one
		   answer for all six of these. */
		// ADD hands out a plain bipolar cv.
		expect(await inferred('add')).toEqual({ result: 'ok', inLo: -1, inHi: 1 });
		// ENTRY's VEL is a proportion.
		expect(await inferred('vel')).toEqual({ result: 'ok', inLo: 0, inHi: 1 });
		// ENTRY's PITCH is semitones about the reference, both ways.
		expect(await inferred('pitch')).toEqual({ result: 'ok', inLo: -48, inHi: 48 });
		// TO-FREQ hands out hertz, and the range is the audible band.
		expect(await inferred('tofreq')).toEqual({ result: 'ok', inLo: 20, inHi: 20000 });
		// ENTRY's NOTE is a count of keys.
		expect(await inferred('note')).toEqual({ result: 'ok', inLo: 0, inHi: 127 });
		// CMP hands out a truth, which is 0 or 1.
		expect(await inferred('cmp')).toEqual({ result: 'ok', inLo: 0, inHi: 1 });
	}, 90000);

	const withTyped = (
		which: string,
		value: number
	): Promise<{ inLo?: number; inHi?: number }> =>
		inPage(
			({ audit, arg }) => {
				audit.edit.clearHistory();
				audit.setTrack(JSON.parse(JSON.stringify(arg.patch)));
				const mid = audit.edit.addNode('map', 200, 100);
				audit.edit.setParam(mid, arg.which, arg.value);
				/* PITCH, whose range is -48..48 -- so if it overwrote, the typed
				   number would be gone and both bounds would read the inferred
				   pair. Nothing about the typed value resembles them. */
				audit.edit.addCable({ from: 'entry', fromPort: 'pitch', to: mid, toPort: 'a' }, 'mod');
				const ps = audit.edit.params();
				return { inLo: ps[mid + '.inLo'], inHi: ps[mid + '.inHi'] };
			},
			{ patch: BASE_PATCH, which, value }
		);

	it('never overwrites a bound that has been typed, and fills neither', async () => {
		/* "Only while both are untouched", and the half worth pinning is that one
		   typed bound protects *both*.

		   A range is a pair and a player who has typed one number is partway
		   through saying what they mean; filling the other in underneath them
		   produces a range they never asked for -- 0.25 against an inferred 48 --
		   which is worse than the default, because it looks deliberate. The guard
		   is a single `||` over both keys and it would read just as naturally as
		   `&&`, which is the mutation these two rows exist to catch. */
		expect(await withTyped('inLo', 0.25)).toEqual({ inLo: 0.25, inHi: undefined });
		expect(await withTyped('inHi', 0.25)).toEqual({ inLo: undefined, inHi: 0.25 });
	}, 45000);

	it('fires on MAP’s A inlet and on nothing else', async () => {
		/* Deliberately narrow. Every other socket on the card is an *output*
		   bound or a shape, and a cable arriving at one of those says nothing
		   about what the input swings between -- inferring from it would write a
		   range from the wrong end of the module. */
		const onOutLo = await inPage(
			({ audit, arg }) => {
				audit.edit.clearHistory();
				audit.setTrack(JSON.parse(JSON.stringify(arg.patch)));
				const mid = audit.edit.addNode('map', 200, 100);
				audit.edit.addCable({ from: 'entry', fromPort: 'pitch', to: mid, toPort: 'outLo' }, 'mod');
				const ps = audit.edit.params();
				return { inLo: ps[mid + '.inLo'], inHi: ps[mid + '.inHi'] };
			},
			{ patch: BASE_PATCH }
		);
		expect(onOutLo).toEqual({ inLo: undefined, inHi: undefined });
	}, 30000);

	it('writes both bounds in one go, so a range is never half set', async () => {
		/* `setGraphParams` exists for this. `setGraphParam` spreads from the map
		   it was handed, so two calls holding one stale object drop the first
		   write -- and a MAP with an inLo and no inHi is a shape running between
		   a typed number and a default, which is a worse answer than not filling
		   it at all.

		   Asserted as two keys landing from one call, plus the non-finite filter
		   on the same door: a NaN bound reaches an AudioParam, where Web Audio
		   throws and takes the note with it. */
		const got = await inPage(
			({ audit, arg }) => {
				audit.edit.clearHistory();
				audit.setTrack(JSON.parse(JSON.stringify(arg.patch)));
				const m = audit.edit.addNode('map', 200, 100);
				audit.edit.setParams({ [m + '.inLo']: -3, [m + '.inHi']: 7 });
				const both = { ...audit.edit.params() };
				audit.edit.setParams({ [m + '.outLo']: NaN, [m + '.outHi']: 2 });
				return {
					both: Object.keys(both).length,
					lo: both[m + '.inLo'],
					hi: both[m + '.inHi'],
					nan: audit.edit.params()[m + '.outLo'],
					kept: audit.edit.params()[m + '.outHi']
				};
			},
			{ patch: BASE_PATCH }
		);
		// Both arrived from the single call, not one of them.
		expect(got).toEqual({ both: 2, lo: -3, hi: 7, nan: undefined, kept: 2 });
	}, 30000);
});

describe('addCable: which cables the canvas will draw', () => {
	it('refuses an audio loop, allows a mod loop, and refuses a repeat', async () => {
		/* Three answers from one function, and the audio/mod split is the load
		   bearing one: Web Audio cannot take a feedback loop in the signal path
		   -- a delay loop measured stable only to about g = 0.90 and screamed
		   past it -- while a mod cycle is often the point, an LFO whose rate
		   another LFO is bending. Walking every cable rather than only the audio
		   ones refuses the envelope-follower patch, which is a real one.

		   `duplicate` is here because two identical cables are one connection,
		   and a graph that accumulated them would sum a source into an inlet
		   twice -- audibly, at double level. */
		const got = await inPage(
			({ audit, arg }) => {
				audit.edit.clearHistory();
				audit.setTrack(JSON.parse(JSON.stringify(arg.patch)));
				const g1 = audit.edit.addNode('gain', 100, 50);
				const g2 = audit.edit.addNode('gain', 200, 50);
				return {
					forward: audit.edit.addCable({ from: g1, fromPort: 'out', to: g2, toPort: 'in' }, 'audio'),
					back: audit.edit.addCable({ from: g2, fromPort: 'out', to: g1, toPort: 'in' }, 'audio'),
					again: audit.edit.addCable({ from: g1, fromPort: 'out', to: g2, toPort: 'in' }, 'audio'),
					modOut: audit.edit.addCable(
						{ from: g1, fromPort: 'out', to: g2, toPort: 'level' },
						'mod'
					),
					modBack: audit.edit.addCable(
						{ from: g2, fromPort: 'out', to: g1, toPort: 'level' },
						'mod'
					)
				};
			},
			{ patch: BASE_PATCH }
		);
		expect(got).toEqual({
			forward: 'ok',
			back: 'cycle',
			again: 'duplicate',
			modOut: 'ok',
			// The one that closes a control loop, which is allowed.
			modBack: 'ok'
		});
	}, 30000);

	it('replaces a cable on a knob and sums on a declared inlet', async () => {
		/* A knob is not a summing inlet: the resolver reads exactly one cable per
		   socket -- the first it finds -- while the engine's mod loop used to
		   connect every cable that landed there. Two cables into one knob meant
		   the value came from whichever was drawn first while both were wired, so
		   a CONST and an ENV into a cutoff put it at 300 or 9000 Hz depending on
		   draw order, and deleting and redrawing the ENV retuned the patch.

		   Measured across all three of FILTER's mod ports in one render, which is
		   what makes it a claim about the *rule* rather than about one port:
		   TYPE and RES are knobs with no declared inlet and keep the newer cable,
		   CUTOFF is declared as well as stored -- several envelopes into a cutoff
		   is a normal patch -- and keeps both. A fix that replaced everywhere
		   would break the third row while passing the first two. */
		const got = await inPage(
			({ audit, arg }) => {
				audit.edit.clearHistory();
				audit.setTrack(JSON.parse(JSON.stringify(arg.patch)));
				const f = audit.edit.addNode('filter', 150, 0);
				const c1 = audit.edit.addNode('const', 0, 60);
				const c2 = audit.edit.addNode('const', 0, 120);
				const out: Record<string, { n: number; from: string[] }> = {};
				for (const port of ['type', 'resonance', 'cutoff']) {
					audit.edit.addCable({ from: c1, fromPort: 'out', to: f, toPort: port }, 'mod');
					audit.edit.addCable({ from: c2, fromPort: 'out', to: f, toPort: port }, 'mod');
				}
				for (const port of ['type', 'resonance', 'cutoff']) {
					const on = audit.edit.graph().cables.filter((c) => c.to === f && c.toPort === port);
					out[port] = { n: on.length, from: on.map((c) => (c.from === c1 ? 'c1' : 'c2')) };
				}
				return out;
			},
			{ patch: BASE_PATCH }
		);
		// The newest wins, and it is the newest rather than merely one of them.
		expect(got.type).toEqual({ n: 1, from: ['c2'] });
		expect(got.resonance).toEqual({ n: 1, from: ['c2'] });
		expect(got.cutoff).toEqual({ n: 2, from: ['c1', 'c2'] });
	}, 30000);
});

describe('undo: the graph and the sound both go back', () => {
	it('puts the patch, the knobs and the level back where they were', async () => {
		/* An edit measured as sound on both sides of it, which is the claim a
		   snapshot comparison cannot make: a history that restored the nodes and
		   dropped `graphParams` would leave the canvas looking right and the
		   GAIN at its default, and only a render says so.

		   Five edits -- add a GAIN, turn it to half, cut the old cable, patch two
		   new ones -- take a bare oscillator from 0.4813 to 0.2406, which is
		   exactly half. Undo runs past the end deliberately: the extra calls have
		   to answer false rather than unwinding into whatever was on the stack
		   before this test. */
		const got = await inPage(
			async ({ audit, arg }) => {
				audit.edit.clearHistory();
				audit.setTrack(JSON.parse(JSON.stringify(arg.patch)));
				const before = await audit.run(1, 40, 4);
				const g = audit.edit.addNode('gain', 200, 0);
				audit.edit.setParam(g, 'level', 0.5);
				audit.edit.removeCable(
					audit.edit.graph().cables.findIndex((c) => c.from === 'o' && c.to === 'output')
				);
				audit.edit.addCable({ from: 'o', fromPort: 'out', to: g, toPort: 'in' }, 'audio');
				audit.edit.addCable({ from: g, fromPort: 'out', to: 'output', toPort: 'in' }, 'audio');
				const edited = await audit.run(1, 40, 4);
				const steps: boolean[] = [];
				for (let i = 0; i < 8; i++) steps.push(audit.edit.undo());
				const after = await audit.run(1, 40, 4);
				const afterState = {
					nodes: audit.edit.graph().nodes.length,
					cables: audit.edit.graph().cables.length,
					params: Object.keys(audit.edit.params()).length
				};
				const redos: boolean[] = [];
				for (let i = 0; i < 8; i++) redos.push(audit.edit.redo());
				const redone = await audit.run(1, 40, 4);
				return { before, edited, after, afterState, redone, steps, redos };
			},
			{ patch: BASE_PATCH }
		);
		expect(got.before.envelope[2]).toBeCloseTo(BARE, 4);
		// Half the level, so half the reading -- the edit is audible.
		expect(got.edited.envelope[2]).toBeCloseTo(BARE / 2, 4);
		// Exactly five edits were made, and exactly five undos have anything to do.
		expect(got.steps).toEqual([true, true, true, true, true, false, false, false]);
		// Back to the bare oscillator, in the graph and in the sound.
		expect(got.after.envelope[2]).toBeCloseTo(BARE, 4);
		expect(got.afterState).toEqual({ nodes: 3, cables: 2, params: 0 });
		// And forward again: redo is not a one-way door.
		expect(got.redos).toEqual([true, true, true, true, true, false, false, false]);
		expect(got.redone.envelope[2]).toBeCloseTo(BARE / 2, 4);
	}, 90000);
});

describe('deleting a module takes its cables and its knobs with it', () => {
	it('leaves no cable to nowhere and no orphaned param', async () => {
		/* A dead `<nodeId>.<param>` key is not inert. Ids are minted from a clock
		   and a counter, so a later node can be handed one that a deleted module
		   left settings under -- and it would come up with somebody else's knob
		   positions already applied, which is a bug nobody would think to look
		   for on a module they just dropped on the canvas.

		   The render is what makes it end to end: with the GAIN gone the audio
		   path is cut, and the patch has to be *exactly* silent. Filtering the
		   cables by `from` alone -- an easy half of `withoutNode` to write --
		   leaves the cable into the missing node behind, and the graph then names
		   a node it does not have. */
		const got = await inPage(
			async ({ audit, arg }) => {
				audit.edit.clearHistory();
				audit.setTrack(JSON.parse(JSON.stringify(arg.patch)));
				const g = audit.edit.addNode('gain', 200, 0);
				audit.edit.setParam(g, 'level', 0.5);
				audit.edit.removeCable(
					audit.edit.graph().cables.findIndex((c) => c.from === 'o' && c.to === 'output')
				);
				audit.edit.addCable({ from: 'o', fromPort: 'out', to: g, toPort: 'in' }, 'audio');
				audit.edit.addCable({ from: g, fromPort: 'out', to: 'output', toPort: 'in' }, 'audio');
				const wired = await audit.run(1, 40, 4);
				const paramsBefore = { ...audit.edit.params() };
				audit.edit.removeNode(g);
				const after = audit.edit.graph();
				const silent = await audit.run(1, 40, 4);
				return {
					wired,
					silent,
					before: paramsBefore[g + '.level'],
					paramsAfter: Object.keys(audit.edit.params()).length,
					nodes: after.nodes.map((n) => n.id),
					// Any cable still naming the node that is gone.
					dangling: after.cables.filter((c) => c.from === g || c.to === g).length,
					cables: after.cables.length
				};
			},
			{ patch: BASE_PATCH }
		);
		expect(got.wired.envelope[2]).toBeCloseTo(BARE / 2, 4);
		// The knob existed, so its absence afterwards is a removal.
		expect(got.before).toBe(0.5);
		expect(got.paramsAfter).toBe(0);
		expect(got.nodes).toEqual(['entry', 'o', 'output']);
		expect(got.dangling).toBe(0);
		// Only the exec cable is left; the audio path went with the module.
		expect(got.cables).toBe(1);
		expect(got.silent.peak, `expected silence, got ${JSON.stringify(got.silent.envelope)}`).toBe(0);
	}, 60000);

	it('keeps ENTRY and OUTPUT however hard they are deleted', async () => {
		/* A graph without them has nowhere for the note to arrive and nowhere for
		   the sound to leave, so they are not in the palette and a select-all
		   delete has to step over them. `withoutNodes` filters the fixed ids out
		   of the set it was given, and the assertion that matters is the last
		   one: the patch still *plays* at full level afterwards. A delete that
		   took OUTPUT and let `graphOf` restore it later would leave the exec
		   socket empty, and the canvas would look right and be silent. */
		const got = await inPage(
			async ({ audit, arg }) => {
				audit.edit.clearHistory();
				audit.setTrack(JSON.parse(JSON.stringify(arg.patch)));
				const fixed = {
					entry: audit.edit.isFixedNode('entry'),
					output: audit.edit.isFixedNode('output'),
					osc: audit.edit.isFixedNode('o')
				};
				const g = audit.edit.addNode('gain', 200, 0);
				// Everything on the canvas at once, ends included.
				audit.edit.deleteSelection(['entry', 'output', 'o', g]);
				const after = audit.edit.graph();
				return {
					fixed,
					nodes: after.nodes.map((n) => n.id),
					cables: after.cables.length,
					sound: await audit.run(1, 40, 4)
				};
			},
			{ patch: BASE_PATCH }
		);
		expect(got.fixed).toEqual({ entry: true, output: true, osc: false });
		/* The OSC and the GAIN went; both ends stayed. Asserted as the exact set,
		   so a guard that kept everything would fail here rather than pass for
		   the wrong reason. */
		expect(got.nodes).toEqual(['entry', 'output']);
		/* And the cable between them survived, because neither end was removed.
		   That is the one that makes OUT run. */
		expect(got.cables).toBe(1);
		/* Silent, because the oscillator really was deleted -- the ends are kept,
		   not the patch. Both halves matter: a graph with its ends and no source
		   is exactly what a cleared canvas should sound like. */
		expect(got.sound.ok).toBe(true);
		expect(got.sound.peak).toBe(0);
	}, 45000);
});

describe('a preset round trip has to survive as sound', () => {
	it('renders identically after being written to JSON and read back', async () => {
		/* The only honest test of a serialiser for an instrument. Comparing the
		   parsed object to the original passes on a format that drops something
		   the engine needs and keeps everything a diff looks at -- which is the
		   shape of the bug `pickTimbre` already had: objects were skipped, so
		   `rackGraph` and `graphParams` were silently absent and every saved
		   patch came back with an empty rack. The object still matched on every
		   key it had.

		   So: build a tremolo in the editor, render it, export through
		   `pickTimbre` and `JSON.stringify`, wipe the track to an empty canvas,
		   render *that* to prove the wipe took, then apply the parsed timbre and
		   render again. The two renders have to agree slice for slice.

		   The wipe is not decoration. Without it a re-import that applied nothing
		   at all would leave the original patch on the track and the two renders
		   would match perfectly, which is the one way this test could pass while
		   measuring nothing. */
		const got = await inPage(
			async ({ audit, arg }) => {
				audit.edit.clearHistory();
				audit.setTrack(JSON.parse(JSON.stringify(arg.patch)));
				// OSC -> GAIN -> OUT, with a 2 Hz LFO shaped through MAP on the level.
				const g = audit.edit.addNode('gain', 200, 0);
				const lfo = audit.edit.addNode('osc', 0, 200);
				const tocv = audit.edit.addNode('tocv', 100, 200);
				const map = audit.edit.addNode('map', 150, 200);
				audit.edit.removeCable(
					audit.edit.graph().cables.findIndex((c) => c.from === 'o' && c.to === 'output')
				);
				audit.edit.addCable({ from: 'o', fromPort: 'out', to: g, toPort: 'in' }, 'audio');
				audit.edit.addCable({ from: g, fromPort: 'out', to: 'output', toPort: 'in' }, 'audio');
				audit.edit.addCable({ from: lfo, fromPort: 'out', to: tocv, toPort: 'in' }, 'audio');
				audit.edit.addCable({ from: tocv, fromPort: 'out', to: map, toPort: 'a' }, 'mod');
				audit.edit.addCable({ from: map, fromPort: 'out', to: g, toPort: 'level' }, 'mod');
				audit.edit.setParams({
					[lfo + '.oscHz']: 2,
					[map + '.shape']: 1,
					[g + '.level']: 0
				});
				const built = await audit.run(2, 40, 16);
				const exported = audit.exportTimbre();
				const parsed = JSON.parse(exported.text);

				audit.setTrack({
					advanced: true,
					rackGraph: {
						nodes: [
							{ id: 'entry', type: 'in' },
							{ id: 'output', type: 'out' }
						],
						cables: []
					},
					graphParams: {}
				});
				const wiped = await audit.run(2, 40, 16);
				audit.setTrack(parsed.timbre);
				const reimported = await audit.run(2, 40, 16);
				return {
					built,
					wiped,
					reimported,
					valid: exported.valid,
					wrongFormat: audit.exportTimbre('krsz-preset').valid,
					nodes: parsed.timbre.rackGraph?.nodes?.length,
					params: Object.keys(parsed.timbre.graphParams ?? {}).length
				};
			},
			{ patch: BASE_PATCH }
		);

		/* The file says what it is. `isPresetFile` is the gate every import
		   passes, and the second row is what says the check is a check: the same
		   patch under a near-miss format string is refused rather than waved
		   through on the presence of a `timbre`. */
		expect(got.valid).toBe(true);
		expect(got.wrongFormat).toBe(false);
		// Seven modules and five knob settings actually reached the file.
		expect(got.nodes).toBe(7);
		expect(got.params).toBe(5);
		// The patch sounds, and it is tremolo rather than a flat level.
		expect(got.built.ok).toBe(true);
		expect(Math.min(...got.built.envelope.slice(1))).toBeGreaterThan(0.1);
		// The wipe took: an empty canvas is exactly silent.
		expect(got.wiped.peak).toBe(0);
		/* Slice for slice, and the peak too. Not `toBeCloseTo` on an average:
		   a serialiser that lost the MAP shape or the LFO rate would still
		   average about the same, and it is the per-slice shape that says the
		   modulation survived. */
		expect(got.reimported.envelope).toEqual(got.built.envelope);
		expect(got.reimported.peak).toBe(got.built.peak);
	}, 120000);
});

describe('knob takeover: a signal claims the knob, a value replaces it', () => {
	/* The distinction the whole modulation path turns on, and it is not visible
	   in the graph -- both are one cable onto one socket.

	   A *value* cable is already in the number by the time the module reads its
	   knob, because `read` returned it instead of the stored setting. A *signal*
	   cable is not: it is connected to the AudioParam afterwards and sums with
	   whatever the knob holds. So the engine hands back the operation's identity
	   for a knob a signal has claimed -- otherwise a VCA whose level knob sits at
	   1 with an envelope patched in would run at 1 plus the envelope and never
	   close.

	   `isDrivenBySignal` is what tells them apart, and it is recursive because
	   MAP made the question two-sided: MAP is a value node that also builds
	   audio, so what comes out of it is a signal exactly when what went in was
	   one. Asking about the node's type alone answers for the wrong half. */
	const driven = (patch: unknown, nodeId: string, port: string) =>
		inPage(
			({ audit, arg }) => audit.drivenBy(arg.patch, arg.nodeId, arg.port),
			{ patch, nodeId, port }
		);

	const mk = (nodes: { id: string; type: string }[], cables: Cable[], graphParams = {}) => ({
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in', x: 0, y: 0 },
				{ id: 'output', type: 'out', x: 400, y: 0 },
				...nodes
			],
			cables
		},
		graphParams
	});

	it('answers for each kind of source, and MAP answers for its own input', async () => {
		/* Seven combinations across four modules. The rows are chosen so that no
		   single wrong rule passes them all: answering by the *destination* port
		   fails the CONST/ENV pair on one socket, answering by the source node's
		   type alone fails both MAP rows, and answering "anything wired is a
		   signal" fails four of the seven. */

		// A CONST is a pure node: a number, however it is wired.
		expect(
			await driven(
				mk(
					[
						{ id: 'g', type: 'gain' },
						{ id: 'c', type: 'const' }
					],
					[{ from: 'c', fromPort: 'out', to: 'g', toPort: 'level' }],
					{ 'c.kind': 6, 'c.value': 0.5 }
				),
				'g',
				'level'
			)
		).toEqual({ signal: false, wired: true });

		// An ENV builds audio, so it is a signal onto the same socket.
		expect(
			await driven(
				mk(
					[
						{ id: 'g', type: 'gain' },
						{ id: 'e', type: 'env' }
					],
					[{ from: 'e', fromPort: 'out', to: 'g', toPort: 'level' }]
				),
				'g',
				'level'
			)
		).toEqual({ signal: true, wired: true });

		/* ENTRY publishes the note's data as values and never as signals, which
		   is its own branch in the walk -- ENTRY builds a node, so a check that
		   only asked "does the source build audio" would call this a signal and
		   the velocity would sum onto the knob instead of setting it. */
		expect(
			await driven(
				mk([{ id: 'g', type: 'gain' }], [
					{ from: 'entry', fromPort: 'vel', to: 'g', toPort: 'level' }
				]),
				'g',
				'level'
			)
		).toEqual({ signal: false, wired: true });

		// Nothing patched: not wired, and not claimed.
		expect(await driven(mk([{ id: 'g', type: 'gain' }], []), 'g', 'level')).toEqual({
			signal: false,
			wired: false
		});

		/* MAP carrying a waveform -- OSC through TO-CV -- is a signal out. This
		   is the row the recursion exists for. */
		expect(
			await driven(
				mk(
					[
						{ id: 'g', type: 'gain' },
						{ id: 'm', type: 'map' },
						{ id: 'o', type: 'osc' },
						{ id: 'tc', type: 'tocv' }
					],
					[
						{ from: 'o', fromPort: 'out', to: 'tc', toPort: 'in' },
						{ from: 'tc', fromPort: 'out', to: 'm', toPort: 'a' },
						{ from: 'm', fromPort: 'out', to: 'g', toPort: 'level' }
					]
				),
				'g',
				'level'
			)
		).toEqual({ signal: true, wired: true });

		// The same MAP fed a CONST is a number out. One module, two answers.
		expect(
			await driven(
				mk(
					[
						{ id: 'g', type: 'gain' },
						{ id: 'm', type: 'map' },
						{ id: 'c', type: 'const' }
					],
					[
						{ from: 'c', fromPort: 'out', to: 'm', toPort: 'a' },
						{ from: 'm', fromPort: 'out', to: 'g', toPort: 'level' }
					],
					{ 'c.kind': 6, 'c.value': 0.5 }
				),
				'g',
				'level'
			)
		).toEqual({ signal: false, wired: true });

		/* An ADD fed by an ENV is still a value: a pure node pulls a number from
		   whatever reaches it and cannot pass a waveform on. The row that
		   separates "is pure" from "is fed by something pure", which the walk has
		   to get right in that order. */
		expect(
			await driven(
				mk(
					[
						{ id: 'g', type: 'gain' },
						{ id: 'ad', type: 'add' },
						{ id: 'e', type: 'env' }
					],
					[
						{ from: 'e', fromPort: 'out', to: 'ad', toPort: 'a' },
						{ from: 'ad', fromPort: 'out', to: 'g', toPort: 'level' }
					]
				),
				'g',
				'level'
			)
		).toEqual({ signal: false, wired: true });

		// And on a different module's socket entirely, both ways round.
		expect(
			await driven(
				mk(
					[
						{ id: 'f', type: 'filter' },
						{ id: 'e', type: 'env' }
					],
					[{ from: 'e', fromPort: 'out', to: 'f', toPort: 'cutoff' }]
				),
				'f',
				'cutoff'
			)
		).toEqual({ signal: true, wired: true });
		expect(
			await driven(
				mk(
					[
						{ id: 'f', type: 'filter' },
						{ id: 'c', type: 'const' }
					],
					[{ from: 'c', fromPort: 'out', to: 'f', toPort: 'cutoff' }],
					{ 'c.kind': 7, 'c.value': 900 }
				),
				'f',
				'cutoff'
			)
		).toEqual({ signal: false, wired: true });
	}, 60000);

	it('and the value really does replace the knob rather than add to it', async () => {
		/* The sound the answer above decides. GAIN's LVL is a declared inlet
		   *and* a knob, so it is exactly where the two mechanisms could both
		   fire: the knob is turned to 1 and a CONST of 0.25 is patched in.

		   If the value replaced the knob the gain is 0.25; if it summed onto it
		   the gain is 1.25, which is louder than the bare oscillator rather than
		   a quarter of it. Measured against the same patch with the knob simply
		   turned to 0.25 and no cable at all -- the two have to be the same
		   sound, and that equality is the assertion. It is also what caught the
		   velocity applying twice: 0.5798 against 0.4163, a 1.39x error on the
		   first patch anyone builds. */
		const got = await inPage(
			async ({ audit }) => {
				const chain: Cable[] = [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
					{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
				];
				const mk2 = (
					nodes: { id: string; type: string }[],
					cables: Cable[],
					graphParams: Record<string, number>
				) => ({
					advanced: true,
					rackGraph: {
						nodes: [
							{ id: 'entry', type: 'in', x: 0, y: 0 },
							{ id: 'output', type: 'out', x: 400, y: 0 },
							...nodes
						],
						cables
					},
					graphParams
				});
				const osc = { id: 'o', type: 'osc' };
				const gain = { id: 'g', type: 'gain' };
				audit.setTrack(
					mk2([osc, gain, { id: 'c', type: 'const' }], [
						...chain,
						{ from: 'c', fromPort: 'out', to: 'g', toPort: 'level' }
					], { 'g.level': 1, 'c.kind': 6, 'c.value': 0.25 })
				);
				const patched = await audit.run(1, 40, 4);
				audit.setTrack(mk2([osc, gain], chain, { 'g.level': 0.25 }));
				const turned = await audit.run(1, 40, 4);
				audit.setTrack(mk2([osc, gain], chain, { 'g.level': 1 }));
				const full = await audit.run(1, 40, 4);
				return { patched, turned, full };
			},
			null
		);
		// The knob alone at 0.25 is a quarter of the bare oscillator.
		expect(got.full.envelope[2]).toBeCloseTo(BARE, 4);
		expect(got.turned.envelope[2]).toBeCloseTo(BARE / 4, 4);
		// And the patched value reads the same, rather than 1.25 of anything.
		expect(
			got.patched.envelope[2],
			`patched ${got.patched.envelope[2]} vs turned ${got.turned.envelope[2]}`
		).toBeCloseTo(got.turned.envelope[2], 4);
		expect(got.patched.peak).toBe(got.turned.peak);
	}, 60000);

	it('and a signal takes the knob over completely, whatever it was set to', async () => {
		/* The other half, and the one the table above cannot reach: what
		   `isDrivenBySignal` answering `true` is *for*.

		   An ENV into GAIN's LVL is a signal, so the engine hands the knob back
		   the operation's identity and connects the envelope to the AudioParam.
		   The knob's own setting stops mattering -- and that is the measurement:
		   the same patch at LVL 1 and at LVL 0 renders the *same envelope*,
		   0.2888 sustained in both.

		   Written as an equality between two renders rather than against a
		   constant, because the constant is not the claim. A knob that still
		   contributed would make these two differ by its whole range, which is
		   the loudest possible disagreement; a knob zeroed when it should not be
		   would make the first render quieter than the second. Only full takeover
		   makes them equal.

		   This is what a VCA is, and getting it wrong is the first patch anyone
		   builds: with the knob left summing, a level at 1 with an envelope
		   patched in never closes, and the note does not stop. */
		const got = await inPage(
			async ({ audit }) => {
				const withLevel = (level: number) => ({
					advanced: true,
					rackGraph: {
						nodes: [
							{ id: 'entry', type: 'in', x: 0, y: 0 },
							{ id: 'output', type: 'out', x: 400, y: 0 },
							{ id: 'o', type: 'osc' },
							{ id: 'g', type: 'gain' },
							{ id: 'e', type: 'env' }
						],
						cables: [
							{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
							{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
							{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' },
							{ from: 'e', fromPort: 'out', to: 'g', toPort: 'level' }
						]
					},
					graphParams: { 'g.level': level, 'e.atkMs': 5, 'e.relMs': 2000, 'e.susLevel': 100 }
				});
				audit.setTrack(withLevel(1));
				const open = await audit.run(1, 40, 8);
				audit.setTrack(withLevel(0));
				const shut = await audit.run(1, 40, 8);
				return { open, shut };
			},
			null
		);
		// The envelope sounds, so there is something for the knob to have changed.
		expect(got.open.envelope[4]).toBeGreaterThan(0.1);
		/* And it did not change it. Slice for slice and peak for peak: the knob
		   is not in this sound at all. */
		expect(
			got.shut.envelope,
			`LVL 1 ${JSON.stringify(got.open.envelope)} vs LVL 0 ${JSON.stringify(got.shut.envelope)}`
		).toEqual(got.open.envelope);
		expect(got.shut.peak).toBe(got.open.peak);
	}, 60000);
});
