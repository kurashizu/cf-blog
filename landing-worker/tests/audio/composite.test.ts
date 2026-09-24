import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * What a *combination* of modules sounds like, measured.
 *
 * audio.test.ts renders each module on its own: one node, one knob, one
 * reading. That finds a module that does the wrong thing. It cannot find a
 * module that does the right thing in the wrong place, because every failure
 * in this file needs at least two modules to exist at all.
 *
 * Four kinds of claim live here, and none of them is expressible about a single
 * node:
 *
 *   - Two mechanisms at one destination. A value cable replaces a knob and a
 *     signal cable adds to it, and the invariant is that exactly one of them
 *     acts per cable. Point both at the same inlet and the reading has to be
 *     their sum, with the knob gone -- which is a three-body statement about
 *     the resolver, the mod loop and the param.
 *
 *   - A value carried through several converters. Each of TRSP, MAP and TO-FREQ
 *     is pinned alone in audio.test.ts; that four of them compose into the
 *     frequency arithmetic says is a different claim, and the one a patch
 *     actually makes.
 *
 *   - What the graph refuses. An audio cycle and a topological sort are one
 *     mechanism seen from either side, and the blast radius of a refusal -- the
 *     loop, or the whole patch -- is only visible with an unrelated voice in the
 *     same render to compare against.
 *
 *   - Ordering. WAIT delays execution, so two sources in one patch with a WAIT
 *     between them must start at different times. One render, two answers.
 *
 * The bench reads channel 0 and reports per-slice RMS, so "level" below always
 * means the RMS of a slice. A bare OSC into OUT reads 0.4813; that constant is
 * the unit every level in this file is quoted against.
 */

const BASE = process.env.AUDIT_URL ?? 'http://localhost:5182';

type Envelope = {
	ok: boolean;
	builtVoice?: boolean;
	envelope: number[];
	peak: number;
	error?: string;
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

/** Render one held note of a timbre and hand back its envelope. */
async function render(
	timbre: Record<string, unknown>,
	slices = 16,
	seconds = 2
): Promise<Envelope> {
	return page.evaluate(
		async (a) => {
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					run(s: number, n: number, sl: number): Promise<Envelope>;
				};
			};
			w.__audit.setTrack(a.t);
			return await w.__audit.run(a.seconds, 40, a.slices);
		},
		{ t: timbre, slices, seconds }
	);
}

type Node = { id: string; type: string };
type Cable = { from: string; fromPort: string; to: string; toPort: string };

/** A patch with ENTRY and OUT already present. */
function graphOf(nodes: Node[], cables: Cable[], graphParams: Record<string, number> = {}) {
	return {
		advanced: true,
		rackGraph: {
			nodes: [{ id: 'entry', type: 'in' }, { id: 'output', type: 'out' }, ...nodes],
			cables
		},
		graphParams
	};
}
const EXEC_TO_OUT: Cable = { from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' };

/** A CONST's two fields. `kind` indexes CONST_KINDS: 6 is F32, 7 is FRQ. */
const constAt = (id: string, kind: number, value: number) => ({
	[`${id}.kind`]: kind,
	[`${id}.value`]: value
});

/** A bare OSC's slice RMS. Every level in this file is quoted against it. */
const BARE = 0.4813;

describe('two mechanisms at one inlet, and both have to land', () => {
	/* The invariant the engine states three times and has broken four: "a value
	   replaces a knob; a signal adds to it, so exactly one of them may act on
	   any given cable". Every previous test of it drives *one* cable and checks
	   the other route agrees. This drives both at once, at the same inlet, in
	   one render -- which is the only arrangement where the two can be seen not
	   to interfere.

	   GAIN's LVL is the destination because it is the port that has already been
	   wrong: it is a declared inlet *and* a param of the same name, so the
	   resolver reads it as a value and the mod loop's inlet test alone said
	   "signal, connect it", and ENTRY's VEL applied twice. The fix is a
	   condition, and a condition has two sides -- so a test that only checks the
	   value route would pass on an engine that had stopped connecting signals
	   entirely, and vice versa.

	   A post gain of 0.3 sits after the modulated one, so a level above 1 is
	   readable rather than being squashed by the master limiter. One unit of
	   level is 0.4813 * 0.3 = 0.14439. */
	const NODES: Node[] = [
		{ id: 'o', type: 'osc' },
		{ id: 'g', type: 'gain' },
		{ id: 'po', type: 'gain' },
		{ id: 'cv', type: 'const' },
		{ id: 'cs', type: 'const' },
		{ id: 'ts', type: 'tosig' }
	];
	const CHAIN: Cable[] = [
		EXEC_TO_OUT,
		{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
		{ from: 'g', fromPort: 'out', to: 'po', toPort: 'in' },
		{ from: 'po', fromPort: 'out', to: 'output', toPort: 'in' }
	];
	/* A pure CONST straight onto the knob: the value route. */
	const VALUE: Cable = { from: 'cv', fromPort: 'out', to: 'g', toPort: 'level' };
	/* The same number through TO-SIG, which exists to turn a value into
	   something that sums: the signal route. */
	const SIGNAL: Cable[] = [
		{ from: 'cs', fromPort: 'out', to: 'ts', toPort: 'level' },
		{ from: 'ts', fromPort: 'out', to: 'g', toPort: 'level' }
	];
	/** One unit of GAIN level, read through the 0.3 post gain. */
	const UNIT = BARE * 0.3;

	const levelOf = async (cables: Cable[], value: number, signal: number) => {
		const r = await render(
			graphOf(NODES, [...CHAIN, ...cables], {
				'g.level': 1,
				'po.level': 0.3,
				...constAt('cv', 6, value),
				...constAt('cs', 6, signal)
			}),
			4,
			1
		);
		return r.envelope[2] / UNIT;
	};

	it('sums the value and the signal, and the knob is gone from both', async () => {
		/* Five pairs, and the reading is the sum every time. What each row rules
		   out is different:

		   - 0.3 + 0.5 reads 0.8, not 1.8. If the knob's 1 survived under the value
		     cable this would be 1.8, which is exactly the shape of the bug this
		     rig was built to catch.
		   - 0.2 + 0.2 and 0.6 + -0.2 land on the same 0.4 from either side, so the
		     signal leg is a signed addition rather than a magnitude or a max.
		   - 0.5 + 0.5 reads 1.0: a sum that reaches unity, so nothing is being
		     scaled by a half somewhere to make the first rows fit.
		   - 0 + 0.4 reads 0.4, which pins that a value of *zero* is a value. A
		     resolver treating 0 as "nothing wired" would fall back to the knob's 1
		     and read 1.4.

		   Measured to four decimals; the readings are 0.7999, 0.4003, 0.4003,
		   1.0001, 0.4003. */
		expect(await levelOf([VALUE, ...SIGNAL], 0.3, 0.5)).toBeCloseTo(0.8, 2);
		expect(await levelOf([VALUE, ...SIGNAL], 0.2, 0.2)).toBeCloseTo(0.4, 2);
		expect(await levelOf([VALUE, ...SIGNAL], 0.6, -0.2)).toBeCloseTo(0.4, 2);
		expect(await levelOf([VALUE, ...SIGNAL], 0.5, 0.5)).toBeCloseTo(1.0, 2);
		expect(await levelOf([VALUE, ...SIGNAL], 0, 0.4)).toBeCloseTo(0.4, 2);
	}, 90000);

	it('reads each route alone at the number it carries, and the knob when neither is drawn', async () => {
		/* The three controls that make the sums above mean something. Without
		   them "the reading is v + s" would also be satisfied by an engine that
		   ignored one leg and doubled the other, for the pairs where v = s.

		   The last row is the one that says the knob is still a knob: with no
		   cable at all the level is the stored 1, so the zeros above are the
		   cables taking over rather than the knob having been broken. */
		expect(await levelOf([VALUE], 0.3, 0.5)).toBeCloseTo(0.3, 2);
		expect(await levelOf(SIGNAL, 0.3, 0.5)).toBeCloseTo(0.5, 2);
		expect(await levelOf([], 0.3, 0.5)).toBeCloseTo(1.0, 2);
	}, 60000);
});

describe('every mod inlet, driven as a value and as a signal', () => {
	/* The bug class that has shipped four times: a port declared `kind: 'mod'`
	   on the card, whose module registers nothing for it in its `mod` map. The
	   cable draws, the socket lights, and the signal is dropped -- MAP did it,
	   WHEN did it, MAKE's WIDE did it twice.

	   A cable onto such a port can arrive two ways and they are different code:
	   a pure CONST is *read* through the resolver and never connected, while a
	   signal is connected by the mod loop and never read. So a module can have
	   one working and the other silently dead, which is precisely how each of
	   the four survived its own tests.

	   Table-driven over every inlet in the catalogue that can take both. Each
	   row is a rig whose reading moves when the inlet is driven, plus the number
	   to drive it with, plus what that number should do to the sound. Three
	   renders per row: unwired, value, signal. The assertion is that value and
	   signal each move the reading away from unwired -- not that they agree,
	   because for several inlets they correctly do not.

	   Which inlets take a signal at all was measured, not assumed, and the
	   answer is not "all of them". A few mod inlets are value-only by construction
	   and are listed in the group below with the reason each one is. */

	/** The shared value source and its signal-making twin. */
	const SRC: Node[] = [
		{ id: 'cv', type: 'const' },
		{ id: 'ts', type: 'tosig' }
	];
	/** The pure route: CONST straight onto the inlet, read by the resolver. */
	const asValue = (to: string, port: string): Cable[] => [
		{ from: 'cv', fromPort: 'out', to, toPort: port }
	];
	/** The signal route: the same number through TO-SIG, connected by the mod loop. */
	const asSignal = (to: string, port: string): Cable[] => [
		{ from: 'cv', fromPort: 'out', to: 'ts', toPort: 'level' },
		{ from: 'ts', fromPort: 'out', to, toPort: port }
	];

	type Row = {
		/** `<module>.<port>`, which is what a failure names. */
		name: string;
		/** How the reading is read off the render. */
		read: (r: Envelope) => number;
		/**
		 * The same inlet set by hand instead of by cable.
		 *
		 * This is what turns the table from "the cable changed something" into
		 * "the cable landed on the number it carries". An earlier draft asserted
		 * only the former, and a mutation that unregistered FILTER's FREQ and Q
		 * passed it: the signal route broke to *zero* rather than to the knob's
		 * value, which is still a change. Comparing against the turned knob is
		 * what catches that, because zero is not 300 Hz either.
		 *
		 * Absent for the two inlets that have no param behind them -- MAKE's WIDE
		 * and MAP's A -- which are handled by `expected` instead.
		 */
		knob?: Record<string, number>;
		/**
		 * What the reading should be, for the rows with no knob to compare to.
		 *
		 * `[value, signal]`, because those two rows are the ones where the routes
		 * legitimately differ and the difference is the whole point.
		 */
		expected?: [number, number];
		/** Builds the patch, given a function that wires the inlet. */
		build: (
			into: (to: string, port: string) => Cable[],
			graphParams?: Record<string, number>
		) => Record<string, unknown>;
	};
	const slice2 = (r: Envelope) => r.envelope[2];

	const rows: Row[] = [
		/* `osc.phase` was a row here and is not any more.
		
		   PHS rotates the wave table, which cannot move once the note is built --
		   so a signal into it did nothing, and the engine comment said a delay
		   could not substitute because "a fixed delay is a different phase at
		   every frequency". A *fixed* delay, yes. One scaled by the note's own
		   period is not: half a turn is `0.5 / f` seconds, and measured across
		   five octaves it cancels against an unshifted copy at every one of them.
		
		   So a moving PHS is a delay of one period times the offset, built only
		   when a signal drives the port. A CONST keeps the wave table, which is
		   exact where the delay line is not -- the pair still cancels to peak 0
		   rather than to the 0.1911 startup transient a delay leaves. */
		/* `pwm.pitch` was a row here and is not any more.
		
		   It took a value and ignored a signal -- measured, a CONST of 110 and one
		   of 880 both rendered 0.1726, the same as no cable -- so the only
		   square-wave source in the catalogue could not be tuned by patch. FREQ
		   is registered onto both saws now. What still does not follow is the
		   duty delay, which is computed at build time; see the engine comment. */
		{
			/* A false condition stops the branch, so the driven reading is exact
			   silence and the undriven one is full level. */
			name: 'when.cond',
			read: (r) => r.peak,
			build: (into) =>
				graphOf(
					[...SRC, { id: 'wh', type: 'when' }, { id: 'o', type: 'osc' }],
					[
						{ from: 'entry', fromPort: 'then', to: 'wh', toPort: 'exec' },
						{ from: 'wh', fromPort: 'then', to: 'output', toPort: 'exec' },
						...into('wh', 'cond'),
						{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
					],
					{ ...constAt('cv', 6, 0) }
				)
		}
	];

	/* STRING's and TUBE's PITCH were rows of the group below until the
	   resonators moved into the live-DSP worklet: their partials were sixteen
	   oscillators tuned once at the note, so a signal had nowhere to land.
	   Pitch is a worklet parameter now, and a signal carrying a number tunes
	   the bank exactly as a CONST carrying it does. */
	const liveRows: Row[] = [
		{
			name: 'string.pitch',
			read: slice2,
			build: (into) =>
				graphOf(
					[
						...SRC,
						{ id: 'e', type: 'excite' },
						{ id: 's', type: 'string' },
						{ id: 'fl', type: 'filter' }
					],
					[
						EXEC_TO_OUT,
						{ from: 'e', fromPort: 'out', to: 's', toPort: 'in' },
						...into('s', 'pitch'),
						{ from: 's', fromPort: 'out', to: 'fl', toPort: 'in' },
						{ from: 'fl', fromPort: 'out', to: 'output', toPort: 'in' }
					],
					{
						...constAt('cv', 7, 2000),
						'e.exLength': 8,
						's.decayTime': 2,
						's.strBlend': 100,
						'fl.type': 0,
						'fl.cutoff': 600,
						'fl.q': 0.7
					}
				)
		},
		{
			name: 'tube.pitch',
			read: slice2,
			build: (into) =>
				graphOf(
					[
						...SRC,
						{ id: 'e', type: 'excite' },
						{ id: 's', type: 'tube' },
						{ id: 'fl', type: 'filter' }
					],
					[
						EXEC_TO_OUT,
						{ from: 'e', fromPort: 'out', to: 's', toPort: 'in' },
						...into('s', 'pitch'),
						{ from: 's', fromPort: 'out', to: 'fl', toPort: 'in' },
						{ from: 'fl', fromPort: 'out', to: 'output', toPort: 'in' }
					],
					{
						...constAt('cv', 7, 2000),
						'e.exLength': 8,
						's.tubeDecay': 1.5,
						's.tubeMix': 100,
						'fl.type': 0,
						'fl.cutoff': 600,
						'fl.q': 0.7
					}
				)
		},
	];

	it.each(liveRows.map((r) => [r.name, r] as const))(
		'%s takes a value and a signal alike',
		async (_name, row) => {
			const unwired = row.read(await render(row.build(() => []), 8, 1));
			const byValue = row.read(await render(row.build(asValue), 8, 1));
			const bySignal = row.read(await render(row.build(asSignal), 8, 1));
			expect(byValue, `${_name}: the value route is dead`).not.toBeCloseTo(unwired, 3);
			expect(bySignal, `${_name}: the signal route is dead`).not.toBeCloseTo(unwired, 3);
			expect(Math.abs(bySignal - byValue), `${_name}: value and signal disagree`).toBeLessThan(
				0.05 * Math.max(byValue, 1e-6)
			);
		},
		60000
	);

	it.each(rows.map((r) => [r.name, r] as const))(
		'%s takes a value and ignores a signal',
		async (_name, row) => {
			const unwired = row.read(await render(row.build(() => []), 8, 1));
			const byValue = row.read(await render(row.build(asValue), 8, 1));
			const bySignal = row.read(await render(row.build(asSignal), 8, 1));
			/* The value route works -- without this the row would pass on a port
			   that was simply dead, which is the bug rather than the design. */
			expect(byValue, `${_name}: the value route is dead`).not.toBeCloseTo(unwired, 3);
			/* And the signal route is a no-op, exactly. Not "close to" unwired:
			   identical, because nothing was connected at all. */
			expect(bySignal, `${_name}: a signal reached an inlet that has no path for one`).toBeCloseTo(
				unwired,
				5
			);
		},
		60000
	);

	it('PWM PW is the exception: a signal reaches it, and adds to the width', async () => {
		/* The counter-example that stops the group above from being read as "a
		   pitch-ish inlet never takes a signal". PW is registered on the delay
		   that makes the duty cycle, so a signal sums onto the width in the
		   width's own units -- one unit of CV is one whole period.

		   Which is why this is asserted as the width running *past* its useful
		   range rather than as a level going up: the knob sits at 0.5 and the
		   signal adds 0.5, giving 1.0 -- a rectangle with no width at all, which
		   is silence with two oscillators still running. Measured: 0.1722 at the
		   knob alone against 0.0029 with the signal added, a 59x drop.

		   A value at the same port replaces the knob instead, so a CONST of 0.5
		   reads the same as the knob at 0.5. The two routes disagreeing is the
		   point: they are different mechanisms and this is the port where the
		   difference is loudest. */
		const rig = (mode: 'knob' | 'value' | 'signal') => {
			const nodes: Node[] = [
				{ id: 'cv', type: 'const' },
				{ id: 'ts', type: 'tosig' },
				{ id: 'f', type: 'tofreq' },
				{ id: 'pm', type: 'pwm' },
				{ id: 'gg', type: 'gain' }
			];
			const base: Cable[] = [
				EXEC_TO_OUT,
				{ from: 'entry', fromPort: 'pitch', to: 'f', toPort: 'a' },
				{ from: 'f', fromPort: 'out', to: 'pm', toPort: 'pitch' },
				{ from: 'pm', fromPort: 'out', to: 'gg', toPort: 'in' },
				{ from: 'gg', fromPort: 'out', to: 'output', toPort: 'in' }
			];
			const gp = { 'gg.level': 0.3, ...constAt('cv', 6, 0.5) };
			if (mode === 'knob') return graphOf(nodes, base, { ...gp, 'pm.pw': 0.5 });
			if (mode === 'value')
				return graphOf(
					nodes,
					[...base, { from: 'cv', fromPort: 'out', to: 'pm', toPort: 'pw' }],
					gp
				);
			return graphOf(
				nodes,
				[
					...base,
					{ from: 'cv', fromPort: 'out', to: 'ts', toPort: 'level' },
					{ from: 'ts', fromPort: 'out', to: 'pm', toPort: 'pw' }
				],
				gp
			);
		};
		const at = async (m: 'knob' | 'value' | 'signal') =>
			(await render(rig(m), 4, 1)).envelope[2];
		const knob = await at('knob');
		// A value replaces the knob, so 0.5 patched is 0.5 turned.
		expect(await at('value')).toBeCloseTo(knob, 3);
		// A signal adds to it, driving the width to its degenerate end.
		expect(await at('signal')).toBeLessThan(knob / 10);
	}, 60000);
});

describe('MAP: a value through it applies once, which it did not', () => {
	/* The fifth bug of its shape, found by this file and fixed in the same
	   change that added it.

	   The patch: CONST -> MAP.a -> GAIN.level, with a 0.3 gain after so a level
	   above 1 is readable past the master limiter. MAP is set to INV over 0..1,
	   whose whole job is `y = 1 - x`. Measured before the fix:

	     x = 0     level 2.0001      MAP says 1.0
	     x = 0.25  level 1.7501      MAP says 0.75
	     x = 0.5   level 1.5001      MAP says 0.5
	     x = 0.75  level 1.2501      MAP says 0.25
	     x = 1     level 1.0001      MAP says 0.0

	   Every reading exactly 1.0 too high, and the same numbers through TO-SIG --
	   the signal route -- correct at all five. So the offset was never in the
	   curve. It was the value being applied twice.

	   Why, mechanically. MAP is the one node that is both pullable and
	   buildable, and the two classifications disagree about it: `isValueNode`
	   is true, so the resolver returns its number, and `isPureNode` is false, so
	   the engine builds a WaveShaper. The mod loop's skip asked the wrong one:

	       if (hasValuePath && (isPureNode(fromType) || fromType === 'in')) continue;

	   `isPureNode('map')` being false meant the skip did not fire, so MAP's audio
	   output was connected to GAIN's level param -- while `cvIn` had already read
	   MAP's value onto that same param. A value replaces the knob and a signal
	   adds to it, and here both happened for one cable. The extra 1.0 was the
	   WaveShaper's resting output: its only input is `inOffset`, the constant
	   that maps the input range's midpoint, so it sits at `map(midpoint)`
	   forever.

	   It is precisely the failure the mod loop's own docstring describes and
	   claims to have fixed -- "CONST 50 into MIX's A gave a gain of 1.0 rather
	   than 0.5" -- reappearing at the one node whose classification that fix's
	   predicate got wrong. Four of this shape had already shipped: MAP's own
	   dropped signal, WHEN's unasked IF, MAKE's dead WIDE, ENTRY's doubled VEL.

	   The fix asks the question that was meant, and keeps the other half:

	       const carriesSignal = isValueNode(fromType) && resolver.isDrivenBySignal(c.from, 'a');
	       if (hasValuePath && !carriesSignal && (isValueNode(fromType) || fromType === 'in'))
	         continue;

	   `isValueNode` rather than `isPureNode`, because those two differ for
	   exactly one node and that difference was the bug. `carriesSignal` is what
	   keeps a MAP that is genuinely shaping a waveform connected -- otherwise the
	   fix would trade this bug for the original one, a MAP that cannot shape.

	   The three tests below are the two halves and the invariant between them.
	   Together they pin the fix from both sides: one fails if the double comes
	   back, one fails if the cure is "stop connecting MAP at all", and the third
	   fails if the two routes ever diverge again by any amount. */
	const NODES: Node[] = [
		{ id: 'cv', type: 'const' },
		{ id: 'ts', type: 'tosig' },
		{ id: 'm', type: 'map' },
		{ id: 'o', type: 'osc' },
		{ id: 'g', type: 'gain' },
		{ id: 'po', type: 'gain' }
	];
	const CHAIN: Cable[] = [
		EXEC_TO_OUT,
		{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
		{ from: 'm', fromPort: 'out', to: 'g', toPort: 'level' },
		{ from: 'g', fromPort: 'out', to: 'po', toPort: 'in' },
		{ from: 'po', fromPort: 'out', to: 'output', toPort: 'in' }
	];
	/** One unit of GAIN level, read through the 0.3 post gain. */
	const UNIT = BARE * 0.3;
	/* INV over 0..1 into 0..1: the simplest curve with a non-zero value at the
	   bottom of its input range, which is what made the double visible at all. A
	   GATE hides it, because `map(0)` is 0 and adding zero changes nothing --
	   which is why the bug survived the existing MAP tests, every one of which
	   drives a GATE. */
	const INV = { 'm.shape': 8, 'm.inLo': 0, 'm.inHi': 1, 'm.outLo': 0, 'm.outHi': 1 };

	const levelOf = async (route: 'value' | 'signal', x: number) => {
		const cables =
			route === 'value'
				? [{ from: 'cv', fromPort: 'out', to: 'm', toPort: 'a' }]
				: [
						{ from: 'cv', fromPort: 'out', to: 'ts', toPort: 'level' },
						{ from: 'ts', fromPort: 'out', to: 'm', toPort: 'a' }
					];
		const r = await render(
			graphOf(NODES, [...CHAIN, ...cables], {
				'g.level': 1,
				'po.level': 0.3,
				...constAt('cv', 6, x),
				...INV
			}),
			4,
			1
		);
		return r.envelope[2] / UNIT;
	};

	it('a CONST through MAP reads the curve, not the curve plus one', async () => {
		/* The regression itself. Before the fix these read 1.75, 1.5 and 1.25 --
		   each exactly 1.0 over, the WaveShaper's resting output arriving on top
		   of the value that had already been read.

		   Five inputs rather than the three that would show the offset, because
		   the endpoints are where a *different* wrong fix shows up: a MAP whose
		   cable were skipped unconditionally would read the knob's 1 at every
		   input, which matches the correct answer at x = 0 and nowhere else. */
		expect(await levelOf('value', 0)).toBeCloseTo(1.0, 2);
		expect(await levelOf('value', 0.25)).toBeCloseTo(0.75, 2);
		expect(await levelOf('value', 0.5)).toBeCloseTo(0.5, 2);
		expect(await levelOf('value', 0.75)).toBeCloseTo(0.25, 2);
		expect(await levelOf('value', 1)).toBeCloseTo(0, 2);
	}, 90000);

	it('and a signal through the same MAP still reads it too', async () => {
		/* The half that stops the cure being worse than the disease. MAP exists
		   to bend a waveform sample by sample, and the obvious way to kill the
		   double -- skip every cable leaving a MAP -- silences that entirely.

		   This was already correct before the fix and has to stay correct after
		   it, which is the only reason `carriesSignal` is in the condition at all.
		   The same five inputs, the same five answers. */
		expect(await levelOf('signal', 0)).toBeCloseTo(1.0, 2);
		expect(await levelOf('signal', 0.25)).toBeCloseTo(0.75, 2);
		expect(await levelOf('signal', 0.5)).toBeCloseTo(0.5, 2);
		expect(await levelOf('signal', 0.75)).toBeCloseTo(0.25, 2);
		expect(await levelOf('signal', 1)).toBeCloseTo(0, 2);
	}, 90000);

	it('the two routes agree exactly, at every input', async () => {
		/* The invariant the bug violated, stated as one number so that any future
		   divergence is caught whatever its size or shape. The gap was a constant
		   1.0 at all four inputs -- a DC offset, which is what identified it as a
		   second application rather than a mis-evaluated curve. It is now 0.

		   Asserted separately from the two tests above because those pin the
		   routes to a *predicted* curve, and this pins them to each other. A
		   change that broke both routes identically would pass this and fail
		   those; a change that broke one would fail this first and say which. */
		for (const x of [0, 0.25, 0.5, 0.75, 1]) {
			const gap = (await levelOf('value', x)) - (await levelOf('signal', x));
			expect(gap, `at x=${x}`).toBeCloseTo(0, 2);
		}
	}, 120000);
});

describe('a value carried through four converters', () => {
	/* ENTRY.pitch -> TRSP -> MAP -> TO-FREQ -> OSC. Each of those is pinned
	   alone in audio.test.ts; that they *compose* is a separate claim, and the
	   one every patch actually makes -- nobody wires a TRSP to nothing.

	   Measured by beat frequency, the technique the converter group already
	   uses: the chain's oscillator is ring-modulated against a reference, and
	   the envelope rises and falls at their difference. Zero beats means the
	   chain landed exactly where it was predicted to.

	   The prediction, computed from the note the bench plays rather than
	   assumed anywhere:

	     ENTRY.pitch  = 12 * log2(415.3 / 440)  = -1.0002 semitones
	     TRSP  +12    = 10.9998
	     MAP   LOG over 0..16 -> 0..16          = sqrt(10.9998/16) * 16 = 13.2664
	     TO-FREQ @440 = 440 * 2^(13.2664/12)    = 946.784 Hz

	   Every stage is load-bearing in that number. Drop TRSP and it is 401 Hz;
	   drop MAP and it is 830.6; a MAP whose ranges were ignored gives 830.6 too.
	   None of them is within beating distance of 946.784.

	   The assertion is the *sharpness* of the null rather than a single reading,
	   and that is deliberate: the bench's beat count aliases above about 5 Hz, so
	   a reference an octave away reads the same "1 edge" that a perfect match
	   does. A null at 946.784 flanked by 15 edges at 943.784 and 949.784 cannot
	   be produced by any chain that landed somewhere else -- only by one sitting
	   on that frequency to within a hertz. */
	const beatEdges = (envelope: number[]): number => {
		const lo = Math.min(...envelope);
		const hi = Math.max(...envelope);
		const mid = (lo + hi) / 2;
		let edges = 0;
		for (let i = 1; i < envelope.length; i++) {
			if (envelope[i] > mid !== envelope[i - 1] > mid) edges++;
		}
		return edges;
	};

	/* The frequency the four stages compute, written as the arithmetic rather
	   than as a literal, so a failure says which stage moved. */
	const ENTRY_PITCH = 12 * Math.log2(415.3 / 440);
	const AFTER_TRSP = ENTRY_PITCH + 12;
	const AFTER_MAP = Math.sqrt(AFTER_TRSP / 16) * 16;
	const CHAIN_HZ = 440 * Math.pow(2, AFTER_MAP / 12);

	const chain = (refHz: number) =>
		graphOf(
			[
				{ id: 'ct', type: 'const' },
				{ id: 'tr', type: 'trsp' },
				{ id: 'm', type: 'map' },
				{ id: 'tf', type: 'tofreq' },
				{ id: 'o', type: 'osc' },
				{ id: 'ref', type: 'osc' },
				{ id: 'tc', type: 'tocv' },
				{ id: 'g', type: 'gain' }
			],
			[
				EXEC_TO_OUT,
				{ from: 'entry', fromPort: 'pitch', to: 'tr', toPort: 'a' },
				{ from: 'ct', fromPort: 'out', to: 'tr', toPort: 'b' },
				{ from: 'tr', fromPort: 'out', to: 'm', toPort: 'a' },
				{ from: 'm', fromPort: 'out', to: 'tf', toPort: 'a' },
				{ from: 'tf', fromPort: 'out', to: 'o', toPort: 'pitch' },
				{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'ref', fromPort: 'out', to: 'tc', toPort: 'in' },
				{ from: 'tc', fromPort: 'out', to: 'g', toPort: 'level' },
				{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{
				...constAt('ct', 6, 12),
				'ref.pitch': refHz,
				'g.level': 1,
				'tf.tuning': 440,
				// LOG (shape 3) over 0..16 semitones, out over the same range.
				'm.shape': 3,
				'm.inLo': 0,
				'm.inHi': 16,
				'm.outLo': 0,
				'm.outHi': 16
			}
		);

	it('lands on the frequency the four stages compute, to within a hertz', async () => {
		const at = async (hz: number) => beatEdges((await render(chain(hz), 32, 2)).envelope);
		/* 946.784 is where all four stages agree. The flanks 3 Hz either side are
		   what make it a measurement rather than a coincidence: a 3 Hz beat over
		   a 2 s render is six crossings of the midpoint per second, and the rig
		   counts fifteen. */
		expect(await at(CHAIN_HZ), `the chain should null at ${CHAIN_HZ.toFixed(3)} Hz`).toBeLessThanOrEqual(2);
		expect(await at(CHAIN_HZ - 3), '3 Hz below should beat').toBeGreaterThan(10);
		expect(await at(CHAIN_HZ + 3), '3 Hz above should beat').toBeGreaterThan(10);
	}, 90000);

	it('nulls somewhere else entirely when MAP is taken out of the middle', async () => {
		/* The same chain with MAP's two cables replaced by one straight from TRSP
		   to TO-FREQ. Without the curve the arithmetic is just the octave, so the
		   oscillator sits at 830.6 Hz -- 116 Hz below where the four-stage chain
		   puts it.

		   Asserted by finding the *other* null rather than by checking the first
		   one is gone, and the difference matters. A draft of this test asserted
		   only "few beats at 946.784 - 3 Hz", which reads few beats for a chain
		   sitting anywhere far away: 116 Hz of detuning beats far too fast for 32
		   slices over 2 s to count, and aliases back to one edge. That assertion
		   was satisfied by every mutation in the table and by the correct engine
		   alike -- it could not fail. Measured and replaced.

		   What cannot alias is a *sharp* null: 1 edge at 830.6 with 15 edges 3 Hz
		   either side. That signature says the oscillator is on 830.6 to within a
		   hertz, and it appears at exactly one frequency. The control below asks
		   for the same signature from the chain that still has MAP in it, at the
		   same three references, and it is absent -- 1 edge at all three, the
		   aliased reading of something far away. */
		const chainOf = (withMap: boolean, refHz: number) => {
			const nodes: Node[] = [
				{ id: 'ct', type: 'const' },
				{ id: 'tr', type: 'trsp' },
				{ id: 'tf', type: 'tofreq' },
				{ id: 'o', type: 'osc' },
				{ id: 'ref', type: 'osc' },
				{ id: 'tc', type: 'tocv' },
				{ id: 'g', type: 'gain' }
			];
			// With MAP the pitch goes through it; without, straight to TO-FREQ.
			const middle = withMap ? 'm' : 'tf';
			const cables: Cable[] = [
				EXEC_TO_OUT,
				{ from: 'entry', fromPort: 'pitch', to: 'tr', toPort: 'a' },
				{ from: 'ct', fromPort: 'out', to: 'tr', toPort: 'b' },
				{ from: 'tr', fromPort: 'out', to: middle, toPort: 'a' },
				{ from: 'tf', fromPort: 'out', to: 'o', toPort: 'pitch' },
				{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'ref', fromPort: 'out', to: 'tc', toPort: 'in' },
				{ from: 'tc', fromPort: 'out', to: 'g', toPort: 'level' },
				{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
			];
			if (withMap) {
				nodes.push({ id: 'm', type: 'map' });
				cables.push({ from: 'm', fromPort: 'out', to: 'tf', toPort: 'a' });
			}
			return graphOf(nodes, cables, {
				...constAt('ct', 6, 12),
				'ref.pitch': refHz,
				'g.level': 1,
				'tf.tuning': 440,
				'm.shape': 3,
				'm.inLo': 0,
				'm.inHi': 16,
				'm.outLo': 0,
				'm.outHi': 16
			});
		};
		/* TRSP alone: the played note plus twelve semitones, which is 830.6 Hz.
		   Written as the arithmetic for the same reason CHAIN_HZ is. */
		const OCTAVE_HZ = 440 * Math.pow(2, AFTER_TRSP / 12);
		const at = async (withMap: boolean, hz: number) =>
			beatEdges((await render(chainOf(withMap, hz), 32, 2)).envelope);

		// Without MAP: a sharp null at the plain octave.
		expect(await at(false, OCTAVE_HZ), 'the octave is where TRSP alone lands').toBeLessThanOrEqual(2);
		expect(await at(false, OCTAVE_HZ - 3), '3 Hz below should beat').toBeGreaterThan(10);
		expect(await at(false, OCTAVE_HZ + 3), '3 Hz above should beat').toBeGreaterThan(10);
		/* And with MAP back in, that null is not there: the flanks stop beating,
		   because the oscillator has moved 116 Hz away and nothing near 830.6 is
		   sounding. This is the assertion that says MAP was doing something --
		   without it the test would pass on an engine that ignored MAP entirely. */
		expect(await at(true, OCTAVE_HZ - 3), 'with MAP there is no null here').toBeLessThanOrEqual(2);
		expect(await at(true, OCTAVE_HZ + 3), 'with MAP there is no null here').toBeLessThanOrEqual(2);
	}, 90000);
});

describe('a cycle in the audio cables silences only its own branch', () => {
	/* A DELAY fed back through a GAIN into its own input is the first thing
	   anyone tries to build a comb filter or a resonator with, and Web Audio
	   supports it -- a DelayNode is exactly the node that makes a cycle legal,
	   because it guarantees a block of latency.

	   This engine refuses it anyway. Before the activation rewrite the refusal
	   was total: `buildRackGraph` sorted every node in the patch with Kahn's
	   algorithm in one pass and bailed on `order.length !== graph.nodes.length`,
	   so a cycle anywhere returned null for the whole voice -- an OSC wired
	   straight to OUT, with an entirely separate DELAY/GAIN loop elsewhere in
	   the same patch, went from 0.4813 to exact silence the moment the loop's
	   last cable was drawn, though the oscillator shared no node with it.

	   `buildActivation` no longer sorts the whole graph for one activation: it
	   builds only what is in the activated OUT's own ancestry (`audioAncestors`),
	   so a cycle the OUT never depends on is not in the set being sorted at all
	   and cannot fail that sort. The refusal is now scoped the way the blast
	   radius always should have read as being -- a loop off to one side is a
	   broken branch, not a broken patch. */
	const withLoop = (wired: boolean) =>
		graphOf(
			[
				{ id: 'o', type: 'osc' },
				{ id: 'e', type: 'excite' },
				{ id: 'd', type: 'delay' },
				{ id: 'fbg', type: 'gain' }
			],
			[
				EXEC_TO_OUT,
				// The voice, which reaches OUT and shares nothing with the loop.
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' },
				// The loop, off to one side.
				{ from: 'e', fromPort: 'out', to: 'd', toPort: 'in' },
				{ from: 'd', fromPort: 'out', to: 'fbg', toPort: 'in' },
				...(wired ? [{ from: 'fbg', fromPort: 'out', to: 'd', toPort: 'in' }] : [])
			],
			{ 'e.exLength': 8, 'fbg.level': 0.5 }
		);

	it('leaves an unrelated voice sounding', async () => {
		const open = await render(withLoop(false), 8, 1);
		const looped = await render(withLoop(true), 8, 1);
		// The same oscillator, at full level, whether the unrelated loop is
		// open or closed -- it was never in OUT's ancestry either way.
		expect(open.envelope[2]).toBeCloseTo(BARE, 3);
		expect(looped.envelope[2]).toBeCloseTo(BARE, 3);
	}, 45000);

	it('renders as a normal voice rather than as an error', async () => {
		/* What the caller sees. A cycle off to one side is not reported as a
		   failure -- `ok` stays true and `builtVoice` stays true -- and now
		   neither is the sound: the loop simply is not part of what plays. */
		const looped = await render(withLoop(true), 8, 1);
		expect(looped.ok).toBe(true);
		expect(looped.builtVoice).toBe(true);
		expect(looped.peak).toBeGreaterThan(0.1);
	}, 30000);

	it('a loop through a mod cable is silent too, by a different mechanism', async () => {
		/* GAIN -> TO-CV -> back onto that GAIN's own LVL. Mod cables are excluded
		   from the topological sort entirely -- only `audioCables` contribute to
		   the in-degree -- so this graph sorts fine and every node is built. It is
		   silent anyway, because the resolver's own cycle guard hands back zero
		   for a value that depends on itself, and zero on a VCA is silence.

		   Two different refusals reaching the same outcome, which is why both are
		   here: a change to either one alone would leave one of these passing and
		   the other failing, and the pair says which. */
		const modLoop = graphOf(
			[
				{ id: 'o', type: 'osc' },
				{ id: 'g', type: 'gain' },
				{ id: 'tc', type: 'tocv' }
			],
			[
				EXEC_TO_OUT,
				{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'g', fromPort: 'out', to: 'tc', toPort: 'in' },
				{ from: 'tc', fromPort: 'out', to: 'g', toPort: 'level' },
				{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'g.level': 0.5 }
		);
		const r = await render(modLoop, 8, 1);
		expect(r.ok).toBe(true);
		expect(r.peak).toBe(0);
	}, 30000);
});

describe('a whole instrument, and what each stage is worth', () => {
	/* EXCITE -> STRING -> FILTER -> SPACE -> PAN -> OUT: a struck string, tamed,
	   put in a room and placed off centre. Five modules from four different
	   shelves, which is the shape of every patch anyone actually builds and the
	   shape nothing else in either suite renders.

	   The test is not "it sounds" -- a single loud reading would pass on a patch
	   where four of the five stages were inert, which is exactly the failure
	   worth catching here.

	   How much of it can be asserted is limited by something worth writing down,
	   because it is not true anywhere else in either suite: **this patch does not
	   render deterministically.** EXCITE is a noise burst and the noise buffer is
	   not re-seeded per render, so the strike slice moves. Measured over five
	   renders of each unchanged graph, at 24 slices over 4 s:

	     full     strike 0.0368 .. 0.0782   peak 0.1999 .. 0.2756   last 14 .. 15
	     -excite  strike 0.0482 .. 0.0723   peak 0.1613 .. 0.2424   last 14 .. 15
	     -string  strike 0.0020 .. 0.0036   peak 0.0073 .. 0.0157   last 12
	     -filter  strike 0.0394 .. 0.0554   peak 0.1625 .. 0.2593   last 14 .. 15
	     -space   strike 0.1528            peak 0.3884            last 2
	     -pan     strike 0.0432 .. 0.0619   peak 0.1562 .. 0.2662   last 14 .. 15

	   Two things follow, and both shape what is asserted below.

	   First, the spread swallows three of the five removals: -excite, -filter and
	   -pan all overlap the full patch's own range on every statistic, so
	   "removing this stage changed the reading" is not a claim this rig can make
	   about them. An earlier draft asserted exactly that with an 8% threshold and
	   failed on -excite at 5.8%. The measurement won and the assertion went;
	   what is left for those three is that the patch still builds and sounds,
	   which is weaker but true.

	   Second, the two that *are* separable are separable by an enormous margin
	   and in opposite directions, which is the more interesting fact anyway:

	     -string  peak collapses 20x, from ~0.24 to ~0.01, with no overlap at all.
	              The resonator is the voice; everything else is treatment.
	     -space   the strike gets *louder* -- 0.1528, twice the full patch's best
	              reading -- and the tail goes from 14 slices to 2. A reverb trades
	              peak for duration, so a test expecting it to add level would have
	              this backwards.

	   -space is also the only row with no spread at all, five identical readings,
	   which locates the nondeterminism: with the convolver gone the sound is over
	   in two slices and the noise burst is the same block every time. */
	const STAGES = ['excite', 'string', 'filter', 'space', 'pan'] as const;
	const ID: Record<string, string> = {
		excite: 'e',
		string: 's',
		filter: 'fl',
		space: 'sp',
		pan: 'pn'
	};

	const instrument = (drop: string | null) => {
		const chain = STAGES.filter((s) => s !== drop);
		const nodes: Node[] = [{ id: 'f', type: 'tofreq' }];
		const cables: Cable[] = [
			EXEC_TO_OUT,
			{ from: 'entry', fromPort: 'pitch', to: 'f', toPort: 'a' }
		];
		for (const s of chain) nodes.push({ id: ID[s], type: s });
		// The string tracks the key, which is the cable that makes it an instrument.
		if (chain.includes('string'))
			cables.push({ from: 'f', fromPort: 'out', to: 's', toPort: 'pitch' });
		let prev: string | null = null;
		for (const s of chain) {
			if (prev) cables.push({ from: ID[prev], fromPort: 'out', to: ID[s], toPort: 'in' });
			prev = s;
		}
		if (prev) cables.push({ from: ID[prev], fromPort: 'out', to: 'output', toPort: 'in' });
		return graphOf(nodes, cables, {
			'e.exLength': 8,
			/* A short string in a big wet room, deliberately: the two stages whose
			   removal this can actually assert are STRING and SPACE, and separating
			   them needs the room to outlast the note. At the string's default 2 s
			   decay the tail is the string either way and taking the room out
			   changes the last-heard slice by one, which the noise spread below
			   swallows. At 0.6 s the tail is unambiguously the room. */
			's.decayTime': 0.6,
			's.strBlend': 100,
			'fl.type': 0,
			'fl.cutoff': 1200,
			'fl.q': 2,
			'sp.spaceSize': 90,
			'sp.spaceDecay': 70,
			'sp.spaceMix': 100,
			'pn.panPos': -30
		});
	};
	const lastHeard = (e: number[]) => {
		let last = -1;
		for (let i = 0; i < e.length; i++) if (e[i] > 0) last = i;
		return last;
	};

	it('sounds, rings and then stops', async () => {
		/* The shape of a struck string heard in a big room: audible at the strike,
		   still sounding two thirds of the way through a four-second render, and
		   over before the end of it. All three matter -- a patch stuck at a level
		   never stops, and a patch that never sounded fails the first. */
		const r = await render(instrument(null), 24, 4);
		expect(r.ok).toBe(true);
		expect(r.envelope[0], 'the strike').toBeGreaterThan(0.02);
		expect(lastHeard(r.envelope), 'the room should still be ringing late').toBeGreaterThan(10);
		expect(lastHeard(r.envelope), 'and should stop before the render does').toBeLessThan(23);
	}, 30000);

	it('the resonator is the voice: without STRING there is no instrument', async () => {
		/* A 20x collapse in peak, asserted with a 5x margin so it clears the noise
		   spread on both sides -- the two ranges (0.1999..0.2756 and
		   0.0073..0.0157) do not come close to touching.

		   The duration half is the one a gain-staging change cannot fake: a merely
		   quieter patch still rings for the room's length, and this stops two
		   slices early because there is nothing left to excite the room with after
		   the 8 ms strike. */
		const full = await render(instrument(null), 24, 4);
		const noString = await render(instrument('string'), 24, 4);
		expect(noString.peak).toBeLessThan(full.peak / 5);
		expect(lastHeard(noString.envelope), 'a click in a room, not a note').toBeLessThan(
			lastHeard(full.envelope)
		);
	}, 45000);

	it('the room trades peak for duration: without SPACE it is louder and far shorter', async () => {
		/* The removal whose direction is counterintuitive, and the reason the
		   existing SPACE tests measure duration rather than level. Taking the
		   convolver out concentrates the same energy into the strike -- 0.1528,
		   about twice the full patch's best reading -- and the tail goes from 14
		   slices to 2.

		   Both halves are asserted because either alone is weak. "Louder" would
		   pass on a SPACE that had become a plain attenuator; "shorter" would pass
		   on one that had gone silent. Together they are the signature of a
		   convolution having been removed, and nothing else produces it. */
		const full = await render(instrument(null), 24, 4);
		const noSpace = await render(instrument('space'), 24, 4);
		expect(noSpace.envelope[0], 'a dry strike is louder').toBeGreaterThan(full.envelope[0]);
		expect(lastHeard(noSpace.envelope), 'and far shorter').toBeLessThan(5);
		expect(lastHeard(full.envelope)).toBeGreaterThan(10);
	}, 45000);

	it('every stage is reachable: all five removals still render and sound', async () => {
		/* The weaker claim that *can* be made about all five, and it is not
		   nothing: each of the five variants builds and reaches OUT. A stage wired
		   into the chain wrongly -- a port name that resolves to no inlet, an
		   outlet that is not connected -- breaks the chain at that point and
		   silences everything downstream of it, which this catches for every stage
		   regardless of how much the noise burst moves.

		   -string is held to a lower floor for the reason above: it is supposed to
		   collapse, and asserting it is merely non-silent is still a real claim --
		   the strike does reach OUT through the remaining stages. */
		for (const stage of STAGES) {
			const r = await render(instrument(stage), 24, 4);
			expect(r.ok, `removing ${stage} failed to render`).toBe(true);
			expect(r.peak, `removing ${stage} silenced the patch`).toBeGreaterThan(
				stage === 'string' ? 0.004 : 0.1
			);
		}
	}, 90000);
});

describe('modulation depth: what MAP adds to a bare TO-CV', () => {
	/* OSC(2 Hz) -> TO-CV -> GAIN.level, with and without a MAP in the middle.
	   The two-module version is what anyone builds first and it is *shallow*:
	   TO-CV passes the sine at unity, so the level swings between 0.2785 and
	   0.3802 -- a spread of 0.1017, which is a gentle tremolo and nothing like
	   the gate the patch was drawn to be.

	   With MAP between them, set to GATE over -1..1 into 0..1, the same LFO
	   drives the level from exact silence to full: a spread of 0.4813, 4.7x
	   deeper. That ratio is the whole claim -- MAP is not a level control, it is
	   what turns the depth a modulator happens to have into the depth the patch
	   wants.

	   And the depth is settable: MAP's Y.HI at 0.5 halves the spread to 0.2407
	   exactly, which says the output range is a scale on the modulation rather
	   than an offset. */
	const rig = (withMap: boolean, mapCfg: Record<string, number> = {}) => {
		const nodes: Node[] = [
			{ id: 'lfo', type: 'osc' },
			{ id: 'tc', type: 'tocv' },
			{ id: 'o', type: 'osc' },
			{ id: 'g', type: 'gain' }
		];
		const cables: Cable[] = [
			EXEC_TO_OUT,
			{ from: 'lfo', fromPort: 'out', to: 'tc', toPort: 'in' },
			{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
			{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
		];
		if (withMap) {
			nodes.push({ id: 'm', type: 'map' });
			cables.push(
				{ from: 'tc', fromPort: 'out', to: 'm', toPort: 'a' },
				{ from: 'm', fromPort: 'out', to: 'g', toPort: 'level' }
			);
		} else {
			cables.push({ from: 'tc', fromPort: 'out', to: 'g', toPort: 'level' });
		}
		return graphOf(nodes, cables, {
			'lfo.pitch': 2,
			'g.level': 1,
			'm.shape': 0,
			'm.inLo': -1,
			'm.inHi': 1,
			'm.outLo': 0,
			'm.outHi': 1,
			...mapCfg
		});
	};
	const spread = (e: number[]) => Math.max(...e) - Math.min(...e);

	it('MAP deepens the modulation to full depth, which TO-CV alone never reaches', async () => {
		const direct = await render(rig(false), 16, 2);
		const gated = await render(rig(true), 16, 2);
		/* Both modulate -- the direct one has to, or the comparison is between a
		   working patch and a broken one rather than between two depths. */
		expect(spread(direct.envelope), 'TO-CV alone should still modulate').toBeGreaterThan(0.05);
		expect(spread(direct.envelope), 'and only shallowly').toBeLessThan(0.2);
		/* And the gated one reaches both ends: exact silence at the bottom and
		   the full 0.4813 at the top. Silence is the assertion a shallower
		   modulation cannot fake at any depth. */
		expect(Math.min(...gated.envelope), 'a gate should reach silence').toBe(0);
		expect(Math.max(...gated.envelope)).toBeCloseTo(BARE, 3);
		expect(spread(gated.envelope)).toBeGreaterThan(spread(direct.envelope) * 3);
	}, 45000);

	it('and the depth is MAP Y.HI, scaling the swing rather than offsetting it', async () => {
		/* Half the output range is half the spread, and the bottom stays at
		   silence. If Y.HI were an offset instead of a scale the floor would lift
		   and the spread would not move -- which is the same confusion between a
		   depth and a blend that RING's DPTH is pinned against. */
		const full = await render(rig(true), 16, 2);
		const half = await render(rig(true, { 'm.outHi': 0.5 }), 16, 2);
		expect(Math.min(...half.envelope)).toBe(0);
		expect(spread(half.envelope) / spread(full.envelope)).toBeCloseTo(0.5, 2);
	}, 45000);
});

describe('two voices in one patch, one gated and one not', () => {
	/* Two independent OSC -> GAIN chains summed into one OUT. The first is under
	   an ENV that decays to nothing; the second is open at a fixed 0.25.

	   What only a two-voice render can say: an envelope on one voice does not
	   touch the other. The knob-zeroing rule -- a signal claims a knob, so the
	   knob reads zero and the cable alone decides -- is applied per node, and a
	   rule applied per node is exactly the kind that gets hoisted into something
	   shared and starts zeroing knobs that no envelope ever reached.

	   Measured: the pair settles at 0.1203, which is the open voice alone to
	   four decimals. The gated voice, rendered by itself, settles at 0.0001 --
	   ENV's floor, because an exponential ramp cannot reach zero. So the sum
	   arriving at the open voice's level is the gated one having gone. */
	const rig = (which: 'both' | 'gatedOnly' | 'openOnly') => {
		const nodes: Node[] = [
			{ id: 'f', type: 'tofreq' },
			{ id: 'oa', type: 'osc' },
			{ id: 'ga', type: 'gain' },
			{ id: 'ob', type: 'osc' },
			{ id: 'gb', type: 'gain' },
			{ id: 'e', type: 'env' },
			{ id: 's', type: 'sum' }
		];
		const cables: Cable[] = [
			EXEC_TO_OUT,
			{ from: 'entry', fromPort: 'pitch', to: 'f', toPort: 'a' },
			{ from: 'f', fromPort: 'out', to: 'oa', toPort: 'pitch' },
			{ from: 'oa', fromPort: 'out', to: 'ga', toPort: 'in' },
			{ from: 'ob', fromPort: 'out', to: 'gb', toPort: 'in' },
			// The envelope claims the gated voice's knob, and only that one.
			{ from: 'e', fromPort: 'out', to: 'ga', toPort: 'level' },
			{ from: 's', fromPort: 'out', to: 'output', toPort: 'in' }
		];
		if (which !== 'openOnly')
			cables.push({ from: 'ga', fromPort: 'out', to: 's', toPort: 'in' });
		if (which !== 'gatedOnly')
			cables.push({ from: 'gb', fromPort: 'out', to: 's', toPort: 'in' });
		return graphOf(nodes, cables, {
			'ga.level': 1,
			// Two different frequencies, so the pair cannot cancel or reinforce.
			'gb.level': 0.25,
			'ob.pitch': 220,
			'e.envA': 0.01,
			'e.envD': 0.4,
			'e.envS': 0,
			'e.envR': 0.001
		});
	};

	it('the envelope takes its own voice down and leaves the other alone', async () => {
		const both = await render(rig('both'), 16, 2);
		const gated = await render(rig('gatedOnly'), 16, 2);
		const open = await render(rig('openOnly'), 16, 2);
		/* Early on, the pair is louder than either alone: both are sounding. */
		expect(both.envelope[0]).toBeGreaterThan(open.envelope[0]);
		expect(both.envelope[0]).toBeGreaterThan(gated.envelope[0]);
		/* Late, the gated voice has decayed to ENV's floor and the pair reads the
		   open voice exactly -- which is the assertion that the open voice's knob
		   was never zeroed. If the rule had been applied patch-wide, the open
		   voice would be silent here and the pair would read 0.0001. */
		expect(gated.envelope[12], "the envelope should reach its floor").toBeCloseTo(0.0001, 4);
		expect(open.envelope[12], 'the open voice holds').toBeCloseTo(0.1203, 3);
		expect(both.envelope[12], 'and the pair is the open voice alone').toBeCloseTo(
			open.envelope[12],
			3
		);
	}, 60000);

	it('the open voice is untouched by the envelope existing at all', async () => {
		/* The stricter half. Above, the late slices agree because one voice went
		   away; here the open voice is rendered with and without the gated one
		   present, and every slice has to match -- so an ENV cannot be shaving
		   anything off the other voice at any point in the render, including the
		   attack where both are loud.

		   Measured by subtracting the gated voice's own render from the pair. */
		const both = await render(rig('both'), 16, 2);
		const gated = await render(rig('gatedOnly'), 16, 2);
		const open = await render(rig('openOnly'), 16, 2);
		/* Two sines at different frequencies do not sum in RMS, so this is not an
		   exact arithmetic identity -- but the pair must sit between the louder
		   leg and the sum of the two, at every slice. A voice being attenuated by
		   the other's envelope falls below that band. */
		for (let i = 0; i < 16; i++) {
			const lo = Math.max(open.envelope[i], gated.envelope[i]);
			const hi = open.envelope[i] + gated.envelope[i];
			expect(both.envelope[i], `slice ${i}`).toBeGreaterThanOrEqual(lo - 0.002);
			expect(both.envelope[i], `slice ${i}`).toBeLessThanOrEqual(hi + 0.002);
		}
	}, 60000);
});

describe('WAIT on one branch and not the other, in one render', () => {
	/* Two OUT modules. One is reached through a WAIT; the other is reached
	   directly. Each carries its own oscillator at level 0.25, and the bench
	   sums them.

	   So the envelope is a staircase: one voice from the start, both after the
	   gap. Measured, the level goes from 0.1203 to 0.2407 -- exactly double,
	   because the two oscillators are at the same frequency and level and this
	   is a sum.

	   This is the assertion the existing WAIT tests cannot make. They measure
	   where a single sound *starts*, which a WAIT applied to everything would
	   satisfy just as well -- and "applied to everything" is precisely what the
	   engine did before the gap was pushed back along the audio cables. Two
	   branches in one render is what separates "the gap reached this source"
	   from "the gap reached the note". */
	const twoBranches = (gapMs: number) =>
		graphOf(
			[
				{ id: 'w', type: 'wait' },
				{ id: 'o1', type: 'osc' },
				{ id: 'o2', type: 'osc' },
				{ id: 'g1', type: 'gain' },
				{ id: 'g2', type: 'gain' },
				{ id: 'out2', type: 'out' }
			],
			[
				// The prompt branch: ENTRY straight to the first OUT.
				EXEC_TO_OUT,
				// The late branch: ENTRY through the WAIT to the second OUT.
				{ from: 'entry', fromPort: 'then', to: 'w', toPort: 'exec' },
				{ from: 'w', fromPort: 'then', to: 'out2', toPort: 'exec' },
				{ from: 'o1', fromPort: 'out', to: 'g1', toPort: 'in' },
				{ from: 'g1', fromPort: 'out', to: 'output', toPort: 'in' },
				{ from: 'o2', fromPort: 'out', to: 'g2', toPort: 'in' },
				{ from: 'g2', fromPort: 'out', to: 'out2', toPort: 'in' }
			],
			{ 'w.gapMs': gapMs, 'o1.pitch': 220, 'o2.pitch': 220, 'g1.level': 0.25, 'g2.level': 0.25 }
		);

	it('one voice starts at the note and the other starts at the gap', async () => {
		/* 2 s over 16 slices, so one slice is 125 ms. A 500 ms gap is four
		   slices; a 1000 ms gap is eight. Both readings are asserted in the same
		   test because a WAIT that delayed nothing and a WAIT that delayed
		   everything each get one of them right.

		   0.1203 is one oscillator at 0.25 (0.4813 * 0.25); 0.2407 is two. */
		const ONE = BARE * 0.25;
		const at = async (gap: number) => (await render(twoBranches(gap), 16, 2)).envelope;

		const late500 = await at(500);
		// Before the gap: the prompt voice alone.
		expect(late500[1], 'before the gap, one voice').toBeCloseTo(ONE, 3);
		expect(late500[2]).toBeCloseTo(ONE, 3);
		// After it: both, at exactly twice the level.
		expect(late500[6], 'after the gap, two voices').toBeCloseTo(ONE * 2, 3);

		const late1000 = await at(1000);
		expect(late1000[5], 'a longer gap holds the second voice back longer').toBeCloseTo(ONE, 3);
		expect(late1000[10]).toBeCloseTo(ONE * 2, 3);
	}, 60000);

	it('with no gap the two voices start together', async () => {
		/* The control, and the one that says the doubling above is the second
		   voice arriving rather than some artefact of having two OUTs. At a gap
		   of zero the level is 0.2407 from the first slice the note is fully on.

		   It is also what fails if WAIT's gap were ever applied to the wrong
		   branch: the reading would be halved at the start instead of doubled. */
		const none = (await render(twoBranches(0), 16, 2)).envelope;
		expect(none[1]).toBeCloseTo(BARE * 0.5, 3);
		expect(none[8]).toBeCloseTo(BARE * 0.5, 3);
	}, 30000);
});

describe('FM: an oscillator modulating another one at audio rate', () => {
	/* The synthesis family the catalogue could not reach, and the reason it
	   could not is worth stating: OSC's FREQ was read as a value and never
	   registered as a modulation destination, under a comment arguing that a
	   resolved constant and a connected signal "cannot be told apart at this
	   point". They can. `p` asks `resolver.isDrivenBySignal` -- the same
	   question that stops a claimed knob fighting the cable that claimed it --
	   so the base frequency is 0 exactly when a signal drives the port, and the
	   two mechanisms never both act.

	   Measured before the fix: a modulator patched into FREQ rendered
	   byte-identical to no cable at all, 0.4813 RMS either way. The cable drew
	   and the socket lit, which is the fifth time that shape of bug has
	   shipped. */
	const fmRig = (depthHz: number, listenHz: number) =>
		graphOf(
			[
				{ id: 'cm', type: 'const' },
				{ id: 'm', type: 'osc' },
				{ id: 'g', type: 'gain' },
				{ id: 'cc', type: 'const' },
				{ id: 'car', type: 'osc' },
				{ id: 'bp', type: 'filter' }
			],
			[
				EXEC_TO_OUT,
				{ from: 'cc', fromPort: 'out', to: 'car', toPort: 'pitch' },
				{ from: 'cm', fromPort: 'out', to: 'm', toPort: 'pitch' },
				{ from: 'm', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'g', fromPort: 'out', to: 'car', toPort: 'pitch' },
				{ from: 'car', fromPort: 'out', to: 'bp', toPort: 'in' },
				{ from: 'bp', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{
				// kind 7 is FRQ. Carrier 440, modulator 220: sidebands at 220 and 660.
				...constAt('cm', 7, 220),
				...constAt('cc', 7, 440),
				'g.level': depthHz,
				// type 2 is BP, narrow enough to sit on one partial.
				'bp.type': 2,
				'bp.cutoff': listenHz,
				'bp.q': 28
			}
		);

	it('creates sidebands, which is what makes it FM and not tremolo', async () => {
		/* Heard at 880 Hz, where a plain 440 carrier has almost nothing. The
		   modulator's depth is a GAIN on the way in because an AudioParam on
		   `frequency` takes hertz of deviation -- the amount is a cable you can
		   see, which is the argument the rest of this catalogue makes.

		   Measured 0.0114 / 0.0176 / 0.1507 / 0.1814 at 0, 100, 400 and 900 Hz of
		   deviation: sixteen times the energy at full depth. A level assertion
		   would not do here -- FM changes the spectrum, not the loudness, and the
		   broadband reading barely moves. */
		const at = async (depth: number) => (await render(fmRig(depth, 880), 8, 1)).envelope[4];
		const none = await at(0);
		const some = await at(400);
		const lots = await at(900);
		expect(some).toBeGreaterThan(none * 4);
		expect(lots).toBeGreaterThan(some);
		expect(lots / none, `sideband growth: ${none} -> ${lots}`).toBeGreaterThan(8);
	}, 60000);

	it('keeps the carrier audible at zero depth, which is what a base is for', async () => {
		/* The ergonomics, and the regression the first version of this fix had.
		
		   `p` zeroes a knob a signal has claimed, which is right where the cable
		   is the whole quantity -- a GAIN's level under an envelope, where a
		   resting level underneath would be a second opinion. It is wrong on a
		   frequency: modulation is a *deviation*, and a deviation needs something
		   to deviate from.
		
		   So the most obvious FM patch -- set the carrier's FREQ to 440, cable a
		   modulator in -- rendered exact silence at depth 0, because the carrier
		   had no pitch left to modulate. The knob is the centre and the signal is
		   the excursion, and both act on this port for that reason.
		
		   Measured: 0.4813 at depth 0, which is a bare oscillator, rising to
		   0.4992 at 800 Hz of deviation. */
		const carrierWithKnob = (depth: number) =>
			graphOf(
				[
					{ id: 'cm', type: 'const' },
					{ id: 'm', type: 'osc' },
					{ id: 'g', type: 'gain' },
					{ id: 'car', type: 'osc' }
				],
				[
					EXEC_TO_OUT,
					{ from: 'cm', fromPort: 'out', to: 'm', toPort: 'pitch' },
					{ from: 'm', fromPort: 'out', to: 'g', toPort: 'in' },
					{ from: 'g', fromPort: 'out', to: 'car', toPort: 'pitch' },
					{ from: 'car', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ ...constAt('cm', 7, 220), 'car.pitch': 440, 'g.level': depth }
			);
		const silentDepth = (await render(carrierWithKnob(0), 8, 1)).envelope[4];
		expect(silentDepth, 'the carrier must sound with no modulation').toBeCloseTo(BARE, 3);
		expect((await render(carrierWithKnob(800), 8, 1)).envelope[4]).toBeGreaterThan(0.4);
	}, 45000);

	it('still lets a constant set the pitch, without applying it twice', async () => {
		/* The other half, and the failure the old comment was protecting against:
		   registering the param while a value also reached it put the same cable
		   through twice and the note came out an octave sharp.

		   A CONST of 440 into FREQ must be a plain 440 tone -- full level, and
		   the same reading as an oscillator with nothing patched at all. */
		const plain = graphOf(
			[
				{ id: 'cc', type: 'const' },
				{ id: 'o', type: 'osc' }
			],
			[
				EXEC_TO_OUT,
				{ from: 'cc', fromPort: 'out', to: 'o', toPort: 'pitch' },
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			constAt('cc', 7, 440)
		);
		expect((await render(plain, 8, 1)).envelope[4]).toBeCloseTo(BARE, 3);
	}, 30000);
});
