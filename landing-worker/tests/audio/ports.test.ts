import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * Every socket on every card, measured.
 *
 * `audio.test.ts` covers what patches sound like. This file covers the
 * catalogue: it walks `MODULE_SPECS` port by port and asks, of each one, the
 * question the module's card makes a promise about -- does sound arrive here,
 * does a cable into this knob land, does this second outlet carry what its
 * label says, does an untouched socket fall back to the number printed on it.
 *
 * The gap it fills is specific. The three existing audio files were written
 * around whole patches, so the ports they exercise are the ports those patches
 * happened to use. Diffing their cables against the catalogue left 28 ports and
 * params with no audio coverage at all -- including every port of FOLLOW, both
 * outlets of BREAK, SPLIT's R, and the `q`, `delayTime`, `panPos`, `ringDepth`
 * and `lo` inlets. A socket nothing renders through is a socket that can stop
 * working without anything noticing, which is the history this whole directory
 * exists because of.
 *
 * A `mod` inlet gets two tests rather than one, always. There are two ways a
 * value reaches a knob and they are different mechanisms: a *pure* node (CONST,
 * ADD, MAP) is pulled as a number and replaces the knob, while a *signal*
 * (TO-SIG, ENV, an oscillator) is connected to the AudioParam and sums with it.
 * An inlet missing from its module's `mod` map drops the second kind silently
 * -- the cable draws, the socket lights, nothing arrives -- and that exact
 * defect has shipped five separate times. One test per route or the coverage is
 * half of what it reads as.
 *
 * Every number below was measured against this bench before it was asserted.
 * Where a reading contradicted the prediction the reading won and the comment
 * says which.
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
	seconds = 2,
	/* How long the key is held, if that is not the whole render.
	
	   Defaulting to the render length is right for almost everything and hides
	   one whole class of behaviour: nothing that happens *after* the key lifts
	   can be measured on a note that is never released. TUBE's DCAY sets exactly
	   that, which is why it read as inert across its entire range until this
	   argument existed. */
	holdSec?: number
): Promise<Envelope> {
	return page.evaluate(
		async (a) => {
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					run(s: number, n: number, sl: number, h?: number): Promise<Envelope>;
				};
			};
			w.__audit.setTrack(a.t);
			return await w.__audit.run(a.seconds, 40, a.slices, a.holdSec);
		},
		{ t: timbre, slices, seconds, holdSec }
	);
}

type Node = { id: string; type: string };
type Cable = { from: string; fromPort: string; to: string; toPort: string };

/**
 * The four things every patch needs, plus whatever this test adds.
 *
 * ENTRY, OUT, and the exec cable between them. Without all three the graph
 * renders exact silence whatever else is wired, which reads in a failure as
 * "the module is broken" rather than as "the patch was never playing".
 */
const patch = (nodes: Node[], cables: Cable[], graphParams: Record<string, number> = {}) => ({
	advanced: true,
	rackGraph: {
		nodes: [{ id: 'entry', type: 'in' }, { id: 'output', type: 'out' }, ...nodes],
		cables: [
			{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' } as Cable,
			...cables
		]
	},
	graphParams
});

/** A CONST's two fields. `kind` indexes CONST_KINDS: 6 is F32, 8 is SEC. */
const constAt = (id: string, kind: number, value: number) => ({
	[`${id}.kind`]: kind,
	[`${id}.value`]: value
});

/**
 * The steady level of a render, ignoring the first slice.
 *
 * Slice 0 always reads low because the note's attack is inside it -- a bare
 * oscillator measures 0.4298 there against 0.4813 everywhere after. Comparing
 * two renders on slice 0 therefore compares two attacks rather than two
 * settings, which is a difference that survives the setting being ignored.
 */
const steady = (r: Envelope) => r.envelope[2];

/**
 * A master limiter compresses above about 0.5 RMS, so anything asserting that
 * two levels stand in a ratio has to stay under it. A gain of 0.3 before OUT is
 * what keeps the readings linear; without it a patch twice as loud as another
 * measures a good deal less than twice.
 */
const LIM = 0.3;

/* ──────────────────────────────────────────────────────────────────────────
   FOLLOW -- every port of it, and the only module with no audio coverage at all

   Sound becoming a number: a rectifier into a lowpass into a make-up gain. It
   is the one crossing from the audio family into the control family, so an
   inlet that drops its signal here does not merely sound wrong -- it makes
   ducking, auto-wah and every level-following patch unsayable.
   ────────────────────────────────────────────────────────────────────────── */
describe('FOLLOW: the audio-to-control crossing', () => {
	/** OSC into FOLLOW, FOLLOW's value onto a second OSC's level. */
	const rig = (gp: Record<string, number> = {}, wireIn = true) =>
		patch(
			[
				{ id: 'src', type: 'osc' },
				{ id: 'f', type: 'follow' },
				{ id: 'car', type: 'osc' },
				{ id: 'g', type: 'gain' },
				{ id: 'lim', type: 'gain' }
			],
			[
				...(wireIn ? [{ from: 'src', fromPort: 'out', to: 'f', toPort: 'in' } as Cable] : []),
				{ from: 'f', fromPort: 'out', to: 'g', toPort: 'level' },
				{ from: 'car', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'g', fromPort: 'out', to: 'lim', toPort: 'in' },
				{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'g.level': 0, 'lim.level': LIM, ...gp }
		);

	it('IN takes sound and OUT hands back a level', async () => {
		/* The whole module in one reading. The carrier's own gain knob is 0, so
		   every bit of what comes out arrived through FOLLOW's OUT -- and OUT can
		   only be non-zero if IN received the oscillator. Measured 0.1443 steady
		   against a bare oscillator's 0.4813.

		   Both ports in one assertion on purpose: they are not separable. FOLLOW
		   has no other way of being heard, so a test of IN alone and a test of
		   OUT alone would be the same render written twice. */
		const r = await render(rig(), 8);
		expect(r.ok).toBe(true);
		expect(steady(r)).toBeCloseTo(0.1443, 3);
	}, 30000);

	it('puts out nothing when IN is unwired', async () => {
		/* The documented default: a follower with nothing to follow follows
		   nothing. Exactly zero rather than merely quiet -- the rectifier has no
		   DC offset of its own, so any reading at all here would be the module
		   inventing a level, which is precisely what makes a patch "work" while
		   its cable does nothing. */
		const r = await render(rig({}, false), 8);
		expect(r.ok).toBe(true);
		expect(r.peak, `expected silence, got ${JSON.stringify(r.envelope)}`).toBe(0);
	}, 30000);

	it('SENS scales the level it reports, both ends of the knob', async () => {
		/* The rectified average of a sine is 2/pi of its peak, so SENS exists to
		   put a signal reaching 1.0 back at 1.0. It is a plain gain on the output
		   leg, so the reading should scale with it -- and does, linearly:
		   measured 0.0092 at 0.1, 0.1443 at the default pi/2, 0.5854 at 10.

		   0.1 and 10 are the knob's own min and max. Asserted as a ratio as well
		   as as levels: 10/0.1 is a hundredfold and the readings are 63.6x, which
		   is the limiter eating the top end -- so the ordering is what is checked
		   strictly and the endpoint values are checked at the precision they
		   actually hold. */
		const lo = await render(rig({ 'f.sens': 0.1 }), 8);
		const mid = await render(rig(), 8);
		const hi = await render(rig({ 'f.sens': 10 }), 8);
		expect(steady(lo)).toBeCloseTo(0.0092, 3);
		expect(steady(mid)).toBeCloseTo(0.1443, 3);
		expect(steady(hi)).toBeCloseTo(0.5854, 3);
		expect(steady(lo)).toBeLessThan(steady(mid));
		expect(steady(mid)).toBeLessThan(steady(hi));
	}, 45000);

	it('RESP decides how fast it reacts, and a slow one has not settled', async () => {
		/* RESP is the lowpass corner. At 200 Hz it tracks the waveform closely
		   and sits flat from the first slice; at 1 Hz it is a slow average that is
		   still moving a quarter of a second in -- measured 0.0434 in slice 0
		   against 0.1710 in slice 2, where the fast one reads 0.1205 then 0.1350
		   and is done.

		   The settling is the assertion rather than the steady level, because the
		   steady levels are close (0.1451 slow, 0.1350 fast) and a test on those
		   would pass on a RESP that did nothing at all. What separates them is
		   only visible in time. */
		const slow = await render(rig({ 'f.resp': 1 }), 8);
		const fast = await render(rig({ 'f.resp': 200 }), 8);
		// The slow one climbs across the first three slices; the fast one does not.
		expect(slow.envelope[0]).toBeLessThan(slow.envelope[2] * 0.5);
		expect(fast.envelope[0]).toBeGreaterThan(fast.envelope[2] * 0.8);
		expect(steady(fast)).toBeCloseTo(0.135, 2);
	}, 45000);
});

/* ──────────────────────────────────────────────────────────────────────────
   The second outlets

   A module with two outputs resolves the second by its own name -- `outs` for
   the ones that publish a map, `out2` for the port literally called `r`.
   Everything else falls back to `out`, which is how BREAK's SIDE socket spent
   its life handing back MID. A test that only ever reads the first outlet
   cannot see that, because the first outlet is right either way.
   ────────────────────────────────────────────────────────────────────────── */
describe('SPLIT and BREAK: the second outlet is not the first', () => {
	/* The bench reads channel 0, so a hard-panned source is the cleanest probe:
	   one side carries everything and the other carries exact silence, and which
	   socket produced which is then unambiguous. */
	const split = (port: string, pos: number) =>
		patch(
			[
				{ id: 'o', type: 'osc' },
				{ id: 'p', type: 'pan' },
				{ id: 's', type: 'split' },
				{ id: 'm', type: 'mono' }
			],
			[
				{ from: 'o', fromPort: 'out', to: 'p', toPort: 'in' },
				{ from: 'p', fromPort: 'out', to: 's', toPort: 'in' },
				{ from: 's', fromPort: port, to: 'm', toPort: 'in' },
				{ from: 'm', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'p.panPos': pos }
		);

	it('SPLIT L carries the left channel and only the left', async () => {
		/* Panned hard left the L socket carries the tone at 0.2406 -- half of a
		   bare oscillator, which is MONO averaging one live channel against one
		   dead one. Panned hard right the same socket is exactly zero. */
		const left = await render(split('out', -100), 8);
		const right = await render(split('out', 100), 8);
		expect(steady(left)).toBeCloseTo(0.2406, 3);
		expect(right.peak, `L socket heard a hard-right source: ${right.peak}`).toBe(0);
	}, 45000);

	it('SPLIT R carries the right channel and only the right', async () => {
		/* The mirror, and the half that proves the port resolves by name: if `r`
		   fell back to `out` this would read identically to the test above and
		   both would still "pass" a check that only looked for sound. The two
		   together are what pin it -- each socket is loud exactly where the other
		   is silent, at the same 0.2406. */
		const right = await render(split('r', 100), 8);
		const left = await render(split('r', -100), 8);
		expect(steady(right)).toBeCloseTo(0.2406, 3);
		expect(left.peak, `R socket heard a hard-left source: ${left.peak}`).toBe(0);
	}, 45000);

	const brk = (port: string, pos: number) =>
		patch(
			[
				{ id: 'o', type: 'osc' },
				{ id: 'p', type: 'pan' },
				{ id: 'b', type: 'break' },
				{ id: 'lim', type: 'gain' }
			],
			[
				{ from: 'o', fromPort: 'out', to: 'p', toPort: 'in' },
				{ from: 'p', fromPort: 'out', to: 'b', toPort: 'in' },
				{ from: 'b', fromPort: port, to: 'lim', toPort: 'in' },
				{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'p.panPos': pos, 'lim.level': LIM }
		);

	it('BREAK MID is what both channels agree on', async () => {
		/* Centred, L and R are the same signal and MID is all of it: 0.1021.
		   Hard left, only one channel carries it, so the half-and-half sum is
		   0.0722 -- which is 0.1021 / sqrt(2), the reading for a signal present
		   in one of two summed legs. */
		const centred = await render(brk('out', 0), 8);
		const hardLeft = await render(brk('out', -100), 8);
		expect(steady(centred)).toBeCloseTo(0.1021, 3);
		expect(steady(hardLeft)).toBeCloseTo(0.0722, 3);
	}, 45000);

	it('BREAK SIDE is what only one channel has, and is silent on a centred source', async () => {
		/* The test BREAK's own comment says used to fail: the port named `side`
		   resolved to the mid gain, so SIDE handed back MID. A centred source has
		   no side content at all, so this socket must read exactly zero -- and
		   MID on the same source reads 0.1021. If `side` fell through to `out`
		   this would read 0.1021 too.

		   Then hard left and hard right, which both read 0.0722: SIDE is L-R, so
		   it is equally loud whichever side the signal is on, and it cannot tell
		   them apart. That is the property that distinguishes it from L and from
		   R as well as from MID. */
		const centred = await render(brk('side', 0), 8);
		expect(centred.peak, `SIDE of a centred source should be silent: ${centred.peak}`).toBe(0);

		const mid = await render(brk('out', 0), 8);
		expect(steady(mid)).toBeGreaterThan(0.09);

		const left = await render(brk('side', -100), 8);
		const right = await render(brk('side', 100), 8);
		expect(steady(left)).toBeCloseTo(0.0722, 3);
		expect(steady(right)).toBeCloseTo(0.0722, 3);
	}, 60000);
});

/* ──────────────────────────────────────────────────────────────────────────
   The mod inlets, both arrival routes

   Each of these has two tests because a knob has two doors. A pure node is
   resolved to a number before the graph is built and written onto the param's
   `.value`, replacing the knob. A signal is connected to the AudioParam and
   sums with whatever the knob left there. A module registering the inlet in its
   `mod` map gets both; one that forgets gets only the first, and the first is
   the one every hand-written test reaches for.
   ────────────────────────────────────────────────────────────────────────── */
describe('FILTER Q: the inlet nothing rendered through', () => {
	/* The note at 415.3 Hz with the cutoff sitting exactly on it, so Q is
	   resonance right at the fundamental and moves the level rather than the
	   timbre -- which is a thing this bench can read. A cutoff anywhere else
	   would make Q a shape change the envelope cannot see. */
	const rig = (gp: Record<string, number>, nodes: Node[] = [], cables: Cable[] = []) =>
		patch(
			[
				{ id: 'o', type: 'osc' },
				{ id: 'f', type: 'filter' },
				{ id: 'lim', type: 'gain' },
				...nodes
			],
			[
				{ from: 'o', fromPort: 'out', to: 'f', toPort: 'in' },
				{ from: 'f', fromPort: 'out', to: 'lim', toPort: 'in' },
				{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			],
			{ 'lim.level': LIM, 'f.type': 0, 'f.cutoff': 415.3, ...gp }
		);

	it('the knob moves the resonance in the documented direction, min to max', async () => {
		/* Up, monotonically: 0.1616 at the 0.0001 minimum, 0.1678 at the default
		   1, 0.2001 at 20, 0.2006 at the 30 maximum. Both endpoints of the knob's
		   range render rather than erroring, which is the other half of what a
		   min/max test is for -- a Q of 0.0001 is a legal biquad and a Q of 0 is
		   not, so the catalogue's floor is load-bearing.

		   The top two are a thousandth apart because a lowpass at Q 20 is already
		   as peaked as the fundamental can make it; the ordering is asserted
		   rather than a gap, which is what the readings support. */
		const min = await render(rig({ 'f.q': 0.0001 }), 8);
		const def = await render(rig({ 'f.q': 1 }), 8);
		const high = await render(rig({ 'f.q': 20 }), 8);
		const max = await render(rig({ 'f.q': 30 }), 8);
		expect(steady(min)).toBeCloseTo(0.1616, 3);
		expect(steady(def)).toBeCloseTo(0.1678, 3);
		expect(steady(high)).toBeCloseTo(0.2001, 3);
		expect(steady(max)).toBeCloseTo(0.2006, 3);
		expect(steady(min)).toBeLessThan(steady(def));
		expect(steady(def)).toBeLessThan(steady(high));
		expect(steady(high)).toBeLessThanOrEqual(steady(max));
	}, 60000);

	it('a CONST into Q replaces the knob', async () => {
		/* The value route. The knob is left at 1 and a CONST of 20 is patched in;
		   the reading is 0.2001, which is exactly what the knob alone reads at 20
		   -- so the cable replaced it rather than adding to it. A route that
		   summed instead would land at Q 21 and read differently. */
		const r = await render(
			rig({ 'f.q': 1, ...constAt('c', 6, 20) }, [{ id: 'c', type: 'const' }], [
				{ from: 'c', fromPort: 'out', to: 'f', toPort: 'q' }
			]),
			8
		);
		expect(steady(r)).toBeCloseTo(0.2001, 3);
	}, 30000);

	it('a signal into Q adds to the knob', async () => {
		/* The signal route, and the one the five shipped bugs all broke. TO-SIG
		   makes a DC of 19 and that is *connected* to the Q param rather than
		   resolved onto it, so with the knob at 1 the filter runs at 20 --
		   measured 0.2000, a thousandth off the 0.2001 the knob alone gives at
		   20, which is the summing working.

		   If `q` were missing from FILTER's `mod` map this would read 0.1678: the
		   knob's own value, untouched, with the cable drawn on the canvas. That
		   is a third of a difference and nothing else in the patch changed. */
		const r = await render(
			rig({ 'f.q': 1, 'ts.level': 19 }, [{ id: 'ts', type: 'tosig' }], [
				{ from: 'ts', fromPort: 'out', to: 'f', toPort: 'q' }
			]),
			8
		);
		expect(steady(r)).toBeCloseTo(0.2, 3);
		// And not the knob's own reading, which is what a dropped signal leaves.
		expect(Math.abs(steady(r) - 0.1678)).toBeGreaterThan(0.02);
	}, 30000);

	it('unwired, Q holds its default of 1', async () => {
		const r = await render(rig({}), 8);
		expect(steady(r)).toBeCloseTo(0.1678, 3);
	}, 30000);
});

describe('DELAY TIME: the inlet nothing rendered through', () => {
	/* A short envelope burst through the delay, read as *where in the render*
	   the burst lands. A level assertion could not see this at all: a delay does
	   not change how loud anything is, only when it arrives, so the only
	   measurement that tests it is a position in the envelope. */
	const rig = (gp: Record<string, number>, nodes: Node[] = [], cables: Cable[] = []) =>
		patch(
			[
				{ id: 'o', type: 'osc' },
				{ id: 'e', type: 'env' },
				{ id: 'g', type: 'gain' },
				{ id: 'd', type: 'delay' },
				{ id: 'lim', type: 'gain' },
				...nodes
			],
			[
				{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'e', fromPort: 'out', to: 'g', toPort: 'level' },
				{ from: 'g', fromPort: 'out', to: 'd', toPort: 'in' },
				{ from: 'd', fromPort: 'out', to: 'lim', toPort: 'in' },
				{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			],
			{
				'g.level': 0,
				'lim.level': LIM,
				'e.envA': 0.001,
				'e.envD': 0.05,
				'e.envS': 0,
				'e.envR': 0.05,
				...gp
			}
		);

	/** Which slice the burst is in. 16 slices over 2 seconds is 125 ms each. */
	const burstAt = (r: Envelope) => r.envelope.indexOf(Math.max(...r.envelope));

	it('the knob shifts when the sound arrives', async () => {
		/* At 0 the burst is in slice 0, where the note starts. At 1.0 s it is in
		   slice 8, which is 1.0 s in -- the delay, exactly. Measured 0.0259 in
		   slice 0 for the undelayed burst and 0.0537 in slice 8 for the delayed
		   one; they differ because the burst straddles the boundary differently,
		   which is why the assertion is on position and not on level. */
		const none = await render(rig({ 'd.delayTime': 0 }), 16);
		const full = await render(rig({ 'd.delayTime': 1.0 }), 16);
		expect(burstAt(none)).toBe(0);
		expect(burstAt(full)).toBe(8);
	}, 45000);

	it('a CONST into TIME replaces the knob', async () => {
		/* SEC is CONST kind 8, which is the kind an inlet declaring `role: time`
		   accepts. Knob at 0, cable at 1.0 -- the burst lands in slice 8, so the
		   cable decided and the knob did not. */
		const r = await render(
			rig({ 'd.delayTime': 0, ...constAt('c', 8, 1.0) }, [{ id: 'c', type: 'const' }], [
				{ from: 'c', fromPort: 'out', to: 'd', toPort: 'delayTime' }
			]),
			16
		);
		expect(burstAt(r)).toBe(8);
		expect(r.envelope[0], `undelayed burst leaked through: ${JSON.stringify(r.envelope)}`).toBe(0);
	}, 30000);

	it('a signal into TIME adds to the knob', async () => {
		/* The other route. TO-SIG's DC of 1.0 is connected to `delayTime`, and
		   with the knob at 0 the sum is 1.0 -- slice 8 again. A `delayTime`
		   missing from DELAY's `mod` map would leave the burst in slice 0 with
		   the cable drawn, which is the whole shape of the bug this file hunts. */
		const r = await render(
			rig({ 'd.delayTime': 0, 'ts.level': 1.0 }, [{ id: 'ts', type: 'tosig' }], [
				{ from: 'ts', fromPort: 'out', to: 'd', toPort: 'delayTime' }
			]),
			16
		);
		expect(burstAt(r)).toBe(8);
		expect(r.envelope[0], `signal into TIME was dropped: ${JSON.stringify(r.envelope)}`).toBe(0);
	}, 30000);

	it('unwired, TIME holds its default of 0.25 s', async () => {
		/* A quarter second is slice 2 of sixteen over two seconds. The default is
		   worth a test of its own because it is the one number a patch gets
		   without asking, and a fallback that drifted from the card would mean
		   typing the printed number changed the sound. */
		const r = await render(rig({}), 16);
		expect(burstAt(r)).toBe(2);
	}, 30000);
});

describe('PAN POS: the inlet nothing rendered through', () => {
	/* The bench reads channel 0, so the pan position is directly the level: hard
	   left is everything, hard right is exact silence, and centre is 3 dB down
	   from either. */
	const rig = (gp: Record<string, number>, nodes: Node[] = [], cables: Cable[] = []) =>
		patch(
			[{ id: 'o', type: 'osc' }, { id: 'p', type: 'pan' }, ...nodes],
			[
				{ from: 'o', fromPort: 'out', to: 'p', toPort: 'in' },
				{ from: 'p', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			],
			gp
		);

	it('the knob sweeps left to right across its whole range', async () => {
		/* Measured: 0.6824 at -100, 0.6753 at -50, 0.5244 at 0, 0.2580 at +50,
		   and exactly 0 at +100. Monotonic down, and both endpoints render.

		   The two extremes are asserted hard -- silence is exact, and hard left is
		   within a whisker of a bare oscillator's 0.4813 * sqrt(2) -- while the
		   middle is asserted as an ordering, because equal-power panning is a
		   cosine and the exact midpoints are the panner's business rather than
		   this module's. */
		const hardL = await render(rig({ 'p.panPos': -100 }), 8);
		const halfL = await render(rig({ 'p.panPos': -50 }), 8);
		const centre = await render(rig({ 'p.panPos': 0 }), 8);
		const halfR = await render(rig({ 'p.panPos': 50 }), 8);
		const hardR = await render(rig({ 'p.panPos': 100 }), 8);
		expect(steady(hardL)).toBeCloseTo(0.6824, 3);
		expect(steady(centre)).toBeCloseTo(0.5244, 3);
		expect(hardR.peak, `hard right should leave channel 0 silent: ${hardR.peak}`).toBe(0);
		expect(steady(hardL)).toBeGreaterThan(steady(halfL));
		expect(steady(halfL)).toBeGreaterThan(steady(centre));
		expect(steady(centre)).toBeGreaterThan(steady(halfR));
		expect(steady(halfR)).toBeGreaterThan(steady(hardR));
	}, 60000);

	it('a CONST into POS arrives in the knob units, not the param units', async () => {
		/* The units question PAN's own comment is about. The knob reads -100..100
		   and the param wants -1..1, so a cable has to be scaled where it lands --
		   and a CONST of 100 into POS must mean hard right, the same as typing 100
		   into the knob, rather than a hundred times hard over.

		   Measured: CONST -100 gives 0.6824 and CONST +100 gives exactly 0, which
		   are the knob's own two readings. Both ends, because a scaling bug that
		   only clipped would still pass a test of one. */
		const left = await render(
			rig({ 'p.panPos': 0, ...constAt('c', 6, -100) }, [{ id: 'c', type: 'const' }], [
				{ from: 'c', fromPort: 'out', to: 'p', toPort: 'panPos' }
			]),
			8
		);
		const right = await render(
			rig({ 'p.panPos': 0, ...constAt('c', 6, 100) }, [{ id: 'c', type: 'const' }], [
				{ from: 'c', fromPort: 'out', to: 'p', toPort: 'panPos' }
			]),
			8
		);
		expect(steady(left)).toBeCloseTo(0.6824, 3);
		expect(right.peak).toBe(0);
	}, 45000);

	it('a signal into POS is scaled the same way the knob is', async () => {
		/* The signal route through the same scaling node. TO-SIG at 10 reads
		   0.4817 and TO-SIG at -10 reads 0.5640, straddling the centre's 0.5244 --
		   which is where a knob at +10 and -10 put it. An unscaled signal would
		   slam the param to ±10 and both would saturate at the two extremes
		   instead, so the fact that these are *near* centre is the assertion. */
		const right = await render(
			rig({ 'p.panPos': 0, 'ts.level': 10 }, [{ id: 'ts', type: 'tosig' }], [
				{ from: 'ts', fromPort: 'out', to: 'p', toPort: 'panPos' }
			]),
			8
		);
		const left = await render(
			rig({ 'p.panPos': 0, 'ts.level': -10 }, [{ id: 'ts', type: 'tosig' }], [
				{ from: 'ts', fromPort: 'out', to: 'p', toPort: 'panPos' }
			]),
			8
		);
		expect(steady(right)).toBeCloseTo(0.4817, 3);
		expect(steady(left)).toBeCloseTo(0.564, 3);
		// Nudged either side of centre rather than slammed to an extreme.
		expect(steady(right)).toBeLessThan(0.5244);
		expect(steady(left)).toBeGreaterThan(0.5244);
		expect(right.peak).toBeGreaterThan(0.1);
	}, 45000);

	it('unwired, POS holds its default of 0 and stays centred', async () => {
		const r = await render(rig({}), 8);
		expect(steady(r)).toBeCloseTo(0.5244, 3);
	}, 30000);
});

describe('RING DEPTH: the knob nothing rendered through', () => {
	/* Two oscillators multiplied. DEPTH is the gain on the modulator leg, so at
	   0 the carrier is multiplied by nothing and the module is silent -- which
	   makes this the one mod inlet whose zero end is checkable exactly. */
	const rig = (gp: Record<string, number>, nodes: Node[] = [], cables: Cable[] = []) =>
		patch(
			[
				{ id: 'o', type: 'osc' },
				{ id: 'm', type: 'osc' },
				{ id: 'r', type: 'ring' },
				{ id: 'lim', type: 'gain' },
				...nodes
			],
			[
				{ from: 'o', fromPort: 'out', to: 'r', toPort: 'in' },
				{ from: 'm', fromPort: 'out', to: 'r', toPort: 'b' },
				{ from: 'r', fromPort: 'out', to: 'lim', toPort: 'in' },
				{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			],
			{ 'lim.level': LIM, ...gp }
		);

	it('the knob scales the modulation linearly, zero to full', async () => {
		/* Exactly proportional: 0.0312 at 25, 0.0625 at 50, 0.1250 at 100 -- each
		   twice the last, which is what a plain gain on the modulator leg has to
		   do. At 0 the output is exactly zero, because a gain of nothing times a
		   carrier is nothing.

		   The limiter is kept out of the way at 0.3 so these stay linear; without
		   it the doubling would flatten at the top and the ratio test would be
		   measuring the master bus rather than RING. */
		const off = await render(rig({ 'r.ringDepth': 0 }), 8);
		const q = await render(rig({ 'r.ringDepth': 25 }), 8);
		const half = await render(rig({ 'r.ringDepth': 50 }), 8);
		const full = await render(rig({ 'r.ringDepth': 100 }), 8);
		expect(off.peak, `depth 0 should be silent: ${off.peak}`).toBe(0);
		expect(steady(q)).toBeCloseTo(0.0312, 3);
		expect(steady(half)).toBeCloseTo(0.0625, 3);
		expect(steady(full)).toBeCloseTo(0.125, 3);
		expect(steady(half) / steady(q)).toBeCloseTo(2, 1);
		expect(steady(full) / steady(half)).toBeCloseTo(2, 1);
	}, 60000);

	it('a CONST into DEPTH replaces the knob, in percent', async () => {
		/* Knob at 100, CONST at 50: the reading is 0.0625, which is the knob's own
		   value at 50 rather than at 100. So the cable replaced it -- and arrived
		   as a percentage, which is what the knob reads. A cable landing on the
		   raw param would give a gain of 50 rather than 0.5. */
		const r = await render(
			rig({ 'r.ringDepth': 100, ...constAt('c', 6, 50) }, [{ id: 'c', type: 'const' }], [
				{ from: 'c', fromPort: 'out', to: 'r', toPort: 'ringDepth' }
			]),
			8
		);
		expect(steady(r)).toBeCloseTo(0.0625, 3);
	}, 30000);

	it('a signal into DEPTH adds to the knob, through the same scaling', async () => {
		/* Knob at 0, TO-SIG at 50: 0.0625 again -- the same reading the knob alone
		   gives at 50, so the signal went through the same hundredth-scaling node
		   the knob does. This is `knobPct`'s whole reason for existing, and the
		   route that a missing `mod` entry would silently drop. */
		const r = await render(
			rig({ 'r.ringDepth': 0, 'ts.level': 50 }, [{ id: 'ts', type: 'tosig' }], [
				{ from: 'ts', fromPort: 'out', to: 'r', toPort: 'ringDepth' }
			]),
			8
		);
		expect(steady(r)).toBeCloseTo(0.0625, 3);
		expect(r.peak, `signal into DEPTH was dropped: ${r.peak}`).toBeGreaterThan(0.01);
	}, 30000);

	it('unwired, DEPTH holds its default of 100', async () => {
		const r = await render(rig({}), 8);
		expect(steady(r)).toBeCloseTo(0.125, 3);
	}, 30000);
});

describe('MAKE WIDE: both routes into the stereo width', () => {
	/* MID and SIDE recombined. WIDE scales the side leg, so more of it means
	   more difference between the channels -- which the bench reads as the left
	   channel moving away from the mid. */
	const rig = (gp: Record<string, number>, nodes: Node[] = [], cables: Cable[] = []) =>
		patch(
			[
				{ id: 'o', type: 'osc' },
				{ id: 'n', type: 'noise' },
				{ id: 'mk', type: 'make' },
				{ id: 'lim', type: 'gain' },
				...nodes
			],
			[
				{ from: 'o', fromPort: 'out', to: 'mk', toPort: 'in' },
				{ from: 'n', fromPort: 'out', to: 'mk', toPort: 'b' },
				{ from: 'mk', fromPort: 'out', to: 'lim', toPort: 'in' },
				{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			],
			{ 'lim.level': LIM, ...gp }
		);

	it('a CONST into WIDE widens monotonically from nothing', async () => {
		/* At 0 the side leg is muted and the left channel is the mid alone:
		   0.2225. It climbs with the cable -- 0.2414 at 0.5, 0.2838 at 1, 0.4253
		   at 2 -- because the noise on the side leg adds power to both channels.

		   The source is noise, so the readings move a little run to run. The four
		   are asserted as an ordering and only the two ends as values, at the
		   precision a noise-driven reading actually holds. */
		const at = async (v: number) =>
			steady(
				await render(
					rig({ ...constAt('c', 6, v) }, [{ id: 'c', type: 'const' }], [
						{ from: 'c', fromPort: 'out', to: 'mk', toPort: 'wide' }
					]),
					8
				)
			);
		const [none, half, one, two] = [await at(0), await at(0.5), await at(1), await at(2)];
		/* At 0 the side leg is muted, so this one reading has no noise in it at
		   all and is exact to four places across runs. The rest carry noise and
		   move by about 0.005 run to run -- measured over four passes: 0.2859 to
		   0.2891 at WIDE 1, and 0.4216 to 0.4299 at WIDE 2. They are checked as an
		   ordering and against a band wide enough to hold that spread, which is
		   what the readings support. A tight constant here is exactly the mistake
		   that made an earlier noise test fail one run in three. */
		expect(none).toBeCloseTo(0.2225, 3);
		expect(two).toBeGreaterThan(0.41);
		expect(two).toBeLessThan(0.44);
		expect(none).toBeLessThan(half);
		expect(half).toBeLessThan(one);
		expect(one).toBeLessThan(two);
	}, 60000);

	it('a signal into WIDE adds to the unwired default of 1', async () => {
		/* The route that separates the two mechanisms. Unwired, WIDE is 1 and the
		   patch reads 0.2875. A *value* of 0.5 replaces that and reads 0.2414 --
		   narrower. A *signal* of 0.5 sums with it, giving 1.5, and reads 0.3493
		   -- wider than the unwired default, and on the other side of it from the
		   value.

		   Two cables carrying the same number, landing on opposite sides of where
		   the patch started. That is the whole distinction this file is about, and
		   it is the one assertion here that no single-route test could make. */
		const unwired = steady(await render(rig({}), 8));
		const value = steady(
			await render(
				rig({ ...constAt('c', 6, 0.5) }, [{ id: 'c', type: 'const' }], [
					{ from: 'c', fromPort: 'out', to: 'mk', toPort: 'wide' }
				]),
				8
			)
		);
		const signal = steady(
			await render(
				rig({ 'ts.level': 0.5 }, [{ id: 'ts', type: 'tosig' }], [
					{ from: 'ts', fromPort: 'out', to: 'mk', toPort: 'wide' }
				]),
				8
			)
		);
		/* Noise again, so the band rather than a constant: the unwired reading
		   measured 0.2862 to 0.2881 over four passes and the signal one 0.3489 to
		   0.3511. What is asserted tightly is the *relation*, which is noise-free
		   -- the three renders share a seed and the ordering held on every pass. */
		expect(unwired).toBeGreaterThan(0.28);
		expect(unwired).toBeLessThan(0.295);
		expect(value).toBeLessThan(unwired);
		expect(signal).toBeGreaterThan(unwired);
		expect(signal).toBeGreaterThan(0.34);
	}, 60000);
});

/* ──────────────────────────────────────────────────────────────────────────
   The pure-node inlets

   A pure node builds nothing at all: its whole result is a number the resolver
   pulls. So "does this inlet work" is answered by reading the number through a
   gain, and an inlet that is dropped reads as its fallback rather than as
   silence -- which is the failure mode that looks most like success.
   ────────────────────────────────────────────────────────────────────────── */
describe('the inlets of the arithmetic', () => {
	/** A pure node's value on a gain, with a sine to hear it through. */
	const valueRig = (nodes: Node[], cables: Cable[], gp: Record<string, number>) =>
		patch(
			[{ id: 'o', type: 'osc' }, { id: 'g', type: 'gain' }, ...nodes],
			[
				{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			],
			{ 'g.level': 1, ...gp }
		);
	const valueOf = async (nodes: Node[], cables: Cable[], gp: Record<string, number>) =>
		steady(await render(valueRig(nodes, cables, gp), 4, 1));

	it('ADD reads B as well as A, and each alone when the other is unwired', async () => {
		/* A on its own is 0.25 of the sine: 0.1203. B on its own is 0.5: 0.2406.
		   Both together are 0.75: 0.3610 -- the sum, and 0.1203 + 0.2406 = 0.3609.

		   B is the port with no audio coverage anywhere in the suite. The two
		   single-inlet readings are what make the pair test bite: an ADD that read
		   A twice would give 0.2406 for both-wired, and an ADD that ignored B
		   would give 0.1203. Neither is 0.3610. */
		const both = await valueOf(
			[
				{ id: 'a', type: 'const' },
				{ id: 'b', type: 'const' },
				{ id: 's', type: 'add' }
			],
			[
				{ from: 'a', fromPort: 'out', to: 's', toPort: 'a' },
				{ from: 'b', fromPort: 'out', to: 's', toPort: 'b' },
				{ from: 's', fromPort: 'out', to: 'g', toPort: 'level' }
			],
			{ ...constAt('a', 6, 0.25), ...constAt('b', 6, 0.5) }
		);
		const aOnly = await valueOf(
			[{ id: 'a', type: 'const' }, { id: 's', type: 'add' }],
			[
				{ from: 'a', fromPort: 'out', to: 's', toPort: 'a' },
				{ from: 's', fromPort: 'out', to: 'g', toPort: 'level' }
			],
			constAt('a', 6, 0.25)
		);
		const bOnly = await valueOf(
			[{ id: 'b', type: 'const' }, { id: 's', type: 'add' }],
			[
				{ from: 'b', fromPort: 'out', to: 's', toPort: 'b' },
				{ from: 's', fromPort: 'out', to: 'g', toPort: 'level' }
			],
			constAt('b', 6, 0.5)
		);
		expect(aOnly).toBeCloseTo(0.1203, 3);
		expect(bOnly).toBeCloseTo(0.2406, 3);
		expect(both).toBeCloseTo(0.361, 3);
		// The sum, rather than either operand read twice.
		expect(both).toBeCloseTo(aOnly + bOnly, 3);
	}, 60000);

	it('CLAMP takes MIN and MAX from their inlets as well as their knobs', async () => {
		/* MIN is the inlet with no coverage. A value of 0.1 with the floor knob at
		   0.6 comes out at 0.6, reading 0.2888 -- the floor held. A CONST of 0.2
		   into MIN overrides that knob and the same 0.1 comes out at 0.2, reading
		   0.0963, so the cable decided rather than the knob.

		   And the ceiling, which the knob half of already had coverage: 2.0
		   against a MAX cable of 0.4 reads 0.1925, which is 0.4 of the sine. Both
		   inlets in one test because each is only meaningful against the other --
		   a CLAMP that ignored MIN and a CLAMP that ignored MAX are different
		   bugs and this separates them. */
		const floorFromKnob = await valueOf(
			[{ id: 'a', type: 'const' }, { id: 'k', type: 'clamp' }],
			[
				{ from: 'a', fromPort: 'out', to: 'k', toPort: 'a' },
				{ from: 'k', fromPort: 'out', to: 'g', toPort: 'level' }
			],
			{ ...constAt('a', 6, 0.1), 'k.lo': 0.6, 'k.hi': 1 }
		);
		const floorFromCable = await valueOf(
			[
				{ id: 'a', type: 'const' },
				{ id: 'lo', type: 'const' },
				{ id: 'k', type: 'clamp' }
			],
			[
				{ from: 'a', fromPort: 'out', to: 'k', toPort: 'a' },
				{ from: 'lo', fromPort: 'out', to: 'k', toPort: 'lo' },
				{ from: 'k', fromPort: 'out', to: 'g', toPort: 'level' }
			],
			{ ...constAt('a', 6, 0.1), ...constAt('lo', 6, 0.2), 'k.lo': 0.6, 'k.hi': 1 }
		);
		const ceilFromCable = await valueOf(
			[
				{ id: 'a', type: 'const' },
				{ id: 'hi', type: 'const' },
				{ id: 'k', type: 'clamp' }
			],
			[
				{ from: 'a', fromPort: 'out', to: 'k', toPort: 'a' },
				{ from: 'hi', fromPort: 'out', to: 'k', toPort: 'hi' },
				{ from: 'k', fromPort: 'out', to: 'g', toPort: 'level' }
			],
			{ ...constAt('a', 6, 2), ...constAt('hi', 6, 0.4), 'k.lo': 0, 'k.hi': 1 }
		);
		expect(floorFromKnob).toBeCloseTo(0.2888, 3);
		expect(floorFromCable).toBeCloseTo(0.0963, 3);
		expect(ceilFromCable).toBeCloseTo(0.1925, 3);
		// The cable moved the floor; without it the knob's 0.6 would have held.
		expect(floorFromCable).toBeLessThan(floorFromKnob);
	}, 60000);

	it('CLAMP with a passing value leaves it alone', async () => {
		/* The control. 0.1 inside a 0..1 range comes out at 0.1 -- 0.0481, which
		   is a tenth of the sine. Without this a CLAMP that returned its floor
		   unconditionally would pass every test above. */
		const through = await valueOf(
			[{ id: 'a', type: 'const' }, { id: 'k', type: 'clamp' }],
			[
				{ from: 'a', fromPort: 'out', to: 'k', toPort: 'a' },
				{ from: 'k', fromPort: 'out', to: 'g', toPort: 'level' }
			],
			{ ...constAt('a', 6, 0.1), 'k.lo': 0, 'k.hi': 1 }
		);
		expect(through).toBeCloseTo(0.0481, 3);
	}, 30000);
});

/* ──────────────────────────────────────────────────────────────────────────
   ENTRY's fifth pin

   ENTRY publishes four outlets the suite already reads and a fifth, GATE, that
   nothing rendered through. It is how long the key is held, in seconds -- the
   one thing a patch can know about a note's *shape* rather than its pitch.
   ────────────────────────────────────────────────────────────────────────── */
describe('ENTRY GATE: the outlet nothing rendered through', () => {
	const valueRig = (nodes: Node[], cables: Cable[], gp: Record<string, number>) =>
		patch(
			[{ id: 'o', type: 'osc' }, { id: 'g', type: 'gain' }, ...nodes],
			[
				{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			],
			{ 'g.level': 1, ...gp }
		);

	it('publishes the held length in seconds, and scales with it', async () => {
		/* The bench holds the note for exactly as long as it renders, so GATE is
		   the render length -- which makes it the one outlet whose value this
		   bench can dial. Through a MUL by 0.2 it reads 0.0963 on a one-second
		   render, 0.1925 on two and 0.2888 on three: 0.4813 * 0.2 * {1, 2, 3},
		   linear in the hold.

		   Scaled down rather than read directly because GATE at 1.0 already
		   saturates a gain, so an unscaled reading would be the same 0.4813 at
		   every length and could not tell a working pin from one stuck at 1. */
		const at = async (seconds: number) =>
			steady(
				await render(
					valueRig(
						[{ id: 'c', type: 'const' }, { id: 'm', type: 'mul' }],
						[
							{ from: 'entry', fromPort: 'gate', to: 'm', toPort: 'a' },
							{ from: 'c', fromPort: 'out', to: 'm', toPort: 'b' },
							{ from: 'm', fromPort: 'out', to: 'g', toPort: 'level' }
						],
						constAt('c', 6, 0.2)
					),
					4,
					seconds
				)
			);
		expect(await at(1)).toBeCloseTo(0.0963, 3);
		expect(await at(2)).toBeCloseTo(0.1925, 3);
		expect(await at(3)).toBeCloseTo(0.2888, 3);
	}, 60000);

	it('is a number a CMP can test, and not a stuck constant', async () => {
		/* GATE through a comparator, which is what a patch would actually do with
		   it -- "if the key was held longer than this". On a one-second render the
		   test `gate > 0.99` holds and `gate > 1` does not, so the pin carries 1.0
		   exactly rather than an approximation or a flag.

		   The pair is the assertion. A GATE stuck at any single value would put
		   both comparisons on the same side of the boundary. */
		const cmpAt = async (threshold: number) =>
			steady(
				await render(
					valueRig(
						[{ id: 'c', type: 'const' }, { id: 'q', type: 'cmp' }],
						[
							{ from: 'entry', fromPort: 'gate', to: 'q', toPort: 'a' },
							{ from: 'c', fromPort: 'out', to: 'q', toPort: 'b' },
							{ from: 'q', fromPort: 'out', to: 'g', toPort: 'level' }
						],
						{ ...constAt('c', 6, threshold), 'q.test': 0 }
					),
					4,
					1
				)
			);
		expect(await cmpAt(0.99)).toBeCloseTo(0.4813, 3);
		expect(await cmpAt(1)).toBe(0);
	}, 45000);

	it('reaches a knob with no value path as a connected signal', async () => {
		/* The other half of GATE, and a genuinely separate mechanism.

		   Both tests above read GATE through pure nodes, so the *resolver*
		   answered and the engine's `outs` map was never consulted. ENTRY also
		   publishes GATE as an audio-rate pin, and that pin is what a cable onto
		   an inlet with no knob behind it gets -- PWM's PW is the one such inlet
		   in the catalogue, declared as modulatable with no param of its own, so
		   it has no value path and the signal route is the only one left.

		   Measured: unwired, PW rests at 0.5 and the square reads 0.1726. Driven
		   by GATE on a one-second render -- a pulse width of 1.0, which is as
		   narrow as the wave gets -- it reads 0.0742, the same 0.0744 a CONST of
		   0.05 gives. The pin carries a real number rather than the zero that
		   `silent` used to hand out.

		   The half-second render is what separates "carries gateSec" from
		   "carries any constant": at 0.5 it reads 0.0036, because the note is over
		   before the render is. */
		const pwm = (seconds: number, nodes: Node[] = [], cables: Cable[] = [], gp = {}) =>
			render(
				patch(
					[{ id: 'p', type: 'pwm' }, { id: 'lim', type: 'gain' }, ...nodes],
					[
						{ from: 'p', fromPort: 'out', to: 'lim', toPort: 'in' },
						{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' },
						...cables
					],
					{ 'lim.level': LIM, ...gp }
				),
				8,
				seconds
			);
		const unwired = await pwm(2);
		const gated = await pwm(1, [], [
			{ from: 'entry', fromPort: 'gate', to: 'p', toPort: 'pw' }
		]);
		const short = await pwm(0.5, [], [
			{ from: 'entry', fromPort: 'gate', to: 'p', toPort: 'pw' }
		]);
		expect(steady(unwired)).toBeCloseTo(0.1726, 3);
		expect(steady(gated)).toBeCloseTo(0.0742, 3);
		expect(steady(short)).toBeCloseTo(0.0036, 3);
		// The signal arrived: PW is nowhere near its unwired rest.
		expect(steady(gated)).toBeLessThan(steady(unwired) * 0.6);
	}, 45000);
});

/* ──────────────────────────────────────────────────────────────────────────
   OSC's phase inlet, as a cable

   PHS has audio coverage as a *field*, through the phase-cancel fixture. As an
   inlet it had none, and the two are different paths: the field is read
   straight off `graphParams` while the cable goes through the resolver.
   ────────────────────────────────────────────────────────────────────────── */
describe('OSC PHASE: driven by a cable rather than typed', () => {
	const twoOsc = (gp: Record<string, number>, nodes: Node[] = [], cables: Cable[] = []) =>
		patch(
			[
				{ id: 'o1', type: 'osc' },
				{ id: 'o2', type: 'osc' },
				{ id: 's', type: 'sum' },
				...nodes
			],
			[
				{ from: 'o1', fromPort: 'out', to: 's', toPort: 'in' },
				{ from: 'o2', fromPort: 'out', to: 's', toPort: 'in' },
				{ from: 's', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			],
			gp
		);

	it('a CONST of half a turn cancels the pair to exact silence', async () => {
		/* Two identical oscillators sum to 0.5870 -- louder than one, and the
		   limiter is why it is not twice 0.4813. A CONST of 0.5 into the second
		   one's PHS makes every sample the negative of the first and the sum is
		   exactly zero.

		   Exact silence is the assertion because it is the only reading a phase
		   that is close-but-wrong cannot produce: a residue of any size means the
		   rotation landed somewhere other than half a turn. */
		const together = await render(twoOsc({}), 8);
		const cancelled = await render(
			twoOsc({ ...constAt('c', 6, 0.5) }, [{ id: 'c', type: 'const' }], [
				{ from: 'c', fromPort: 'out', to: 'o2', toPort: 'phase' }
			]),
			8
		);
		expect(steady(together)).toBeCloseTo(0.587, 3);
		expect(cancelled.peak, `expected silence, got ${JSON.stringify(cancelled.envelope)}`).toBe(0);
	}, 45000);

	it('a whole turn is no rotation, and a quarter lands in between', async () => {
		/* The two controls that stop the test above passing on a broken PHS. A
		   CONST of 1.0 is a full turn, which wraps to nothing: 0.5870, identical
		   to no cable at all. A CONST of 0.25 neither adds nor cancels: 0.5706,
		   between the two -- which is what fails if PHS ever starts snapping to
		   the nearest half turn, since 0 and 0.5 are exactly the two cases a
		   snapping implementation gets right. */
		const whole = await render(
			twoOsc({ ...constAt('c', 6, 1) }, [{ id: 'c', type: 'const' }], [
				{ from: 'c', fromPort: 'out', to: 'o2', toPort: 'phase' }
			]),
			8
		);
		const quarter = await render(
			twoOsc({ ...constAt('c', 6, 0.25) }, [{ id: 'c', type: 'const' }], [
				{ from: 'c', fromPort: 'out', to: 'o2', toPort: 'phase' }
			]),
			8
		);
		expect(steady(whole)).toBeCloseTo(0.587, 3);
		expect(steady(quarter)).toBeCloseTo(0.5706, 3);
		expect(steady(quarter)).toBeLessThan(steady(whole));
		expect(quarter.peak).toBeGreaterThan(0.5);
	}, 45000);
});

/* ──────────────────────────────────────────────────────────────────────────
   The meters

   SCOPE, FFT and LOUD have one promise between them: placing one cannot change
   the patch. A debugging tool that alters what it is measuring is worse than no
   tool, so this is the only thing worth asserting about them here -- their
   readings are drawn on a canvas a render has none of.
   ────────────────────────────────────────────────────────────────────────── */
describe('SCOPE, FFT and LOUD: observing changes nothing', () => {
	const bare = patch([{ id: 'o', type: 'osc' }], [
		{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
	]);

	it.each(['scope', 'fft', 'loud'])(
		'%s tapped off a signal leaves it exactly as it was',
		async (meter) => {
			/* A second cable from the oscillator into the meter, alongside the one
			   into OUT. The reading has to be bit-for-bit the bare oscillator's
			   0.4813 steady and 0.6807 peak -- a meter that summed into the output,
			   or loaded the source, would move one or the other. */
			const withMeter = patch([{ id: 'o', type: 'osc' }, { id: 'p', type: meter }], [
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' },
				{ from: 'o', fromPort: 'out', to: 'p', toPort: 'in' }
			]);
			const before = await render(bare, 8);
			const after = await render(withMeter, 8);
			expect(steady(after)).toBeCloseTo(steady(before), 4);
			expect(after.peak).toBeCloseTo(before.peak, 4);
			expect(steady(after)).toBeCloseTo(0.4813, 3);

			/* And the branch is genuinely dead rather than merely quiet. The same
			   oscillator routed *only* into the meter, with nothing at all reaching
			   OUT, renders exact silence -- a meter is not an output, so nothing
			   that ends at one is heard.

			   This is the half that bites. "Placing one changes nothing" passes on
			   an engine where the meter has become an output too, because the extra
			   copy sums with the original and the limiter hides it; only asking
			   what the meter alone produces separates the two. */
			const meterOnly = patch([{ id: 'o', type: 'osc' }, { id: 'p', type: meter }], [
				{ from: 'o', fromPort: 'out', to: 'p', toPort: 'in' }
			]);
			const dead = await render(meterOnly, 8);
			expect(dead.peak, `a ${meter} is not an output: ${dead.peak}`).toBe(0);
		},
		45000
	);

	it.each(['scope', 'loud'])(
		'%s takes a pure value on CV without disturbing the sound',
		async (meter) => {
			/* CV is the inlet that needed a ConstantSource built for it: a pure
			   node makes no audio node at all, so a CONST into a probe had nothing
			   to connect and every probe read zero. The render cannot see what the
			   probe displays, so what is asserted is the half that is checkable --
			   that building that source does not leak into the output. Still
			   0.4813.

			   An honest half-test, and it is here rather than absent because the
			   ConstantSource is a real node in the graph: one connected to the
			   sink by mistake would be a DC offset on the patch, which is the
			   failure this catches. */
			const withCv = patch(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'p', type: meter },
					{ id: 'c', type: 'const' }
				],
				[
					{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' },
					{ from: 'c', fromPort: 'out', to: 'p', toPort: 'cv' }
				],
				constAt('c', 6, 0.5)
			);
			const r = await render(withCv, 8);
			expect(steady(r)).toBeCloseTo(0.4813, 3);
			expect(r.peak).toBeCloseTo(0.6807, 3);

			/* A CV of 50 rather than 0.5, and still exactly the same reading. A
			   ConstantSource that found its way to the sink would be a DC offset
			   fifty times the size of the note, which the peak could not miss. */
			const big = patch(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'p', type: meter },
					{ id: 'c', type: 'const' }
				],
				[
					{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' },
					{ from: 'c', fromPort: 'out', to: 'p', toPort: 'cv' }
				],
				constAt('c', 6, 50)
			);
			expect(steady(await render(big, 8))).toBeCloseTo(0.4813, 3);
		},
		45000
	);
});

/* ──────────────────────────────────────────────────────────────────────────
   ENV's curve, and WHEN's one knob that could not become a cable
   ────────────────────────────────────────────────────────────────────────── */
describe('ENV CURVE: linear and exponential are different shapes', () => {
	const rig = (gp: Record<string, number>) =>
		patch(
			[
				{ id: 'o', type: 'osc' },
				{ id: 'e', type: 'env' },
				{ id: 'g', type: 'gain' },
				{ id: 'lim', type: 'gain' }
			],
			[
				{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'e', fromPort: 'out', to: 'g', toPort: 'level' },
				{ from: 'g', fromPort: 'out', to: 'lim', toPort: 'in' },
				{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{
				'g.level': 0,
				'lim.level': LIM,
				'e.envA': 1.5,
				'e.envD': 0.01,
				'e.envS': 100,
				'e.envR': 0.1,
				...gp
			}
		);

	it('LIN climbs in a straight line and EXP climbs late', async () => {
		/* A 1.5 second attack read in 16 slices. LIN steps by an even 0.0120 every
		   slice -- 0.0169, 0.0288, 0.0407, 0.0527 -- and is a straight line by
		   construction. EXP is at 0.0001 where LIN is at 0.0288, and does not pass
		   a tenth of full until slice 11; it more than doubles every slice on the
		   way, which is what exponential means.

		   Both reach the same 0.1444 sustain, which is the other half: a curve
		   that changed where the envelope *ended* would be a different envelope
		   rather than a different shape.

		   The exponential floor is 0.0001 and not 0 -- `exponentialRampToValue`
		   cannot reach zero, so that is the documented resting value rather than a
		   rounding artefact. */
		const lin = await render(rig({ 'e.envCurve': 0 }), 16);
		const exp = await render(rig({ 'e.envCurve': 1 }), 16);
		expect(steady(lin)).toBeCloseTo(0.0288, 3);
		expect(steady(exp)).toBeCloseTo(0.0001, 4);
		// Both arrive at the same place.
		expect(lin.envelope[15]).toBeCloseTo(0.1444, 3);
		expect(exp.envelope[15]).toBeCloseTo(0.1444, 3);
		// LIN's steps are even; EXP's are not.
		const linSteps = [1, 2, 3, 4].map((i) => lin.envelope[i] - lin.envelope[i - 1]);
		expect(Math.max(...linSteps) - Math.min(...linSteps)).toBeLessThan(0.002);
		// EXP is still under a hundredth of full where LIN has passed a fifth.
		expect(exp.envelope[6]).toBeLessThan(0.01);
		expect(lin.envelope[6]).toBeGreaterThan(0.05);
	}, 45000);
});

describe('WHEN BUSY: the test that has no answer offline', () => {
	/* The WHEN has to be the *only* exec path to OUT.

	   Built through `patch()` it is not: that helper adds the direct
	   `entry -> output` exec cable every patch needs, and with that cable in
	   place OUT runs whatever the WHEN decides -- so a BUSY that blocked
	   everything would still render the full 0.4813 and the test would pass on
	   an engine that had stopped consulting the knob at all. Caught by mutating
	   the offline escape and watching nothing fail. The graph is written out by
	   hand here so the only way to OUT is through the WHEN. */
	const rig = (
		gp: Record<string, number>,
		nodes: Node[] = [],
		cables: Cable[] = []
	) => ({
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'output', type: 'out' },
				{ id: 'o', type: 'osc' },
				{ id: 'w', type: 'when' },
				...nodes
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'w', toPort: 'exec' },
				{ from: 'w', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			]
		},
		graphParams: gp
	});

	it('gates execution at all: a false IF stops the note', async () => {
		/* The control, and what makes the BUSY test below mean something. A CONST
		   of 1 into IF passes execution and the note sounds at 0.4813; a CONST of
		   0 blocks it and the render is exact silence. Without this pair, "BUSY ON
		   still sounds" would be indistinguishable from "this WHEN gates nothing
		   ever", which is precisely the state the first draft of this file was in. */
		const cond = (v: number) =>
			render(
				rig({ ...constAt('c', 6, v) }, [{ id: 'c', type: 'const' }], [
					{ from: 'c', fromPort: 'out', to: 'w', toPort: 'cond' }
				]),
				8
			);
		const open = await cond(1);
		const shut = await cond(0);
		expect(steady(open)).toBeCloseTo(0.4813, 3);
		expect(shut.peak, `a false IF should stop the note: ${shut.peak}`).toBe(0);
	}, 45000);

	it('passes execution in a render whether it is OFF or ON', async () => {
		/* BUSY asks about the engine's own live state -- which voices are
		   sounding right now -- and an offline render holds none, so the question
		   has no answer. The documented behaviour is that an unanswerable test
		   passes: a rendered patch keeps what you heard live, rather than dropping
		   every note behind a BUSY WHEN out of an export.

		   Both settings measure the bare oscillator's 0.4813. That is a weaker
		   claim than the other tests here make and it is the strongest one that is
		   true -- but it is not vacuous: it pins the `renderCtx` escape, and
		   without that escape the ON case renders exact silence. */
		const off = await render(rig({ 'w.busy': 0 }), 8);
		const on = await render(rig({ 'w.busy': 1 }), 8);
		expect(steady(off)).toBeCloseTo(0.4813, 3);
		expect(steady(on)).toBeCloseTo(0.4813, 3);
	}, 45000);
});

/* ──────────────────────────────────────────────────────────────────────────
   TUBE's four knobs, all of which now reach the sound

   Two of them did not. This file found it: DCAY and DAMP read 0.0867 steady
   across their entire ranges -- identical to four decimal places, not merely
   close -- because a tube holds every partial at full level until the key
   lifts, and both knobs fed only the length of the fall *after* that. On a note
   held as long as it sounds there was nowhere for either to act. DAMP was worse
   still: it divided by `n^(...)` and the fundamental has n = 1, so it cancelled
   out of the partial carrying most of the level however it was set.

   Fixed rather than documented, because a card offering a control that cannot
   change the sound is a lie about the instrument. DAMP is now a spectral tilt
   held for the whole note -- which is what a bore does -- and DCAY is the
   release, uncapped. STRING is untouched: it is struck, its partials decay from
   the attack, and its DAMP already worked.
   ────────────────────────────────────────────────────────────────────────── */
describe('TUBE: which of its knobs actually reach the sound', () => {
	const rig = (gp: Record<string, number>) =>
		patch(
			[
				{ id: 'x', type: 'excite' },
				{ id: 't', type: 'tube' },
				{ id: 'lim', type: 'gain' }
			],
			[
				{ from: 'x', fromPort: 'out', to: 't', toPort: 'in' },
				{ from: 't', fromPort: 'out', to: 'lim', toPort: 'in' },
				{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'lim.level': LIM, ...gp }
		);

	it('MIX and ODD are audible', async () => {
		/* The two that work, and the control for the test below. MIX crossfades
		   dry against the partials: 0 leaves 0.0000 steady -- the excitation is a
		   few milliseconds and gone -- 70 reads 0.0860 and 100 reads 0.1229. ODD
		   at 0 admits the even partials and reads 0.0870 against 0.0860.

		   Without this, the next test would be indistinguishable from a TUBE that
		   was not sounding at all. */
		const mix0 = await render(rig({ 'lim.level': LIM, 't.tubeMix': 0 }), 10);
		const mix70 = await render(rig({ 't.tubeMix': 70 }), 10);
		const mix100 = await render(rig({ 't.tubeMix': 100 }), 10);
		const odd = await render(rig({ 't.tubeOdd': 0 }), 10);
		expect(steady(mix0)).toBeLessThan(0.001);
		expect(steady(mix70)).toBeCloseTo(0.086, 3);
		expect(steady(mix100)).toBeCloseTo(0.1229, 3);
		expect(steady(odd)).toBeCloseTo(0.087, 3);
		expect(steady(odd)).toBeGreaterThan(steady(mix70));
	}, 60000);

	it('DAMP tilts the spectrum for as long as the note lasts', async () => {
		/* Measured through a highpass, because that is where DAMP acts: it leaves
		   the fundamental alone by design -- a bore damps its upper partials --
		   so the full-band reading barely moves while the partials above it fall
		   by nearly half.

		   0.0429 / 0.0266 / 0.0234 across the knob. Before the fix all three read
		   0.0867 to four decimals, and the full-band reading still moves only
		   from 0.2890 to 0.2864, which is why this is asserted through a filter
		   rather than on the raw output. */
		const upper = async (damp: number) =>
			steady(
				await render(
					patch(
						[
							{ id: 'x', type: 'excite' },
							{ id: 't', type: 'tube' },
							{ id: 'hp', type: 'filter' }
						],
						[
							{ from: 'x', fromPort: 'out', to: 't', toPort: 'in' },
							{ from: 't', fromPort: 'out', to: 'hp', toPort: 'in' },
							{ from: 'hp', fromPort: 'out', to: 'output', toPort: 'in' }
						],
						{ 't.tubeMix': 70, 't.tubeDamp': damp, 'hp.type': 1, 'hp.cutoff': 1500, 'hp.q': 1 }
					),
					10
				)
			);
		const open = await upper(0);
		const half = await upper(50);
		const shut = await upper(100);
		expect(open).toBeGreaterThan(half);
		expect(half).toBeGreaterThan(shut);
		expect(shut / open, 'the bore takes nearly half the upper spectrum').toBeLessThan(0.6);
	}, 60000);

	it('DCAY is the release, and the bench has to let go of the key to see it', async () => {
		/* The other half of the same defect, and the reason it hid for so long:
		   `run` held the key for the whole render, so no note ever reached its
		   release and a knob that sets the release length could not be measured
		   at all. The bench takes a hold time now.

		   Four seconds of render, one second of key. The tail then runs out at
		   slice 4, 5, 9 and 15 as DCAY goes 0.1, 1, 3, 12 -- eleven slices of
		   travel where before there were none, because the old `min(dn, 0.35)`
		   pinned every setting above a third of a second to one value. */
		const tail = async (dcay: number) => {
			const r = await render(
				patch(
					[
						{ id: 'x', type: 'excite' },
						{ id: 't', type: 'tube' },
						{ id: 'lim', type: 'gain' }
					],
					[
						{ from: 'x', fromPort: 'out', to: 't', toPort: 'in' },
						{ from: 't', fromPort: 'out', to: 'lim', toPort: 'in' },
						{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' }
					],
					{ 'lim.level': LIM, 't.tubeMix': 70, 't.tubeDecay': dcay }
				),
				16,
				4,
				1
			);
			return r.envelope.map((v, i) => (v > 0.001 ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
		};
		const readings = [await tail(0.1), await tail(1), await tail(3), await tail(12)];
		for (let i = 1; i < readings.length; i++) {
			expect(readings[i], `DCAY step ${i}: ${JSON.stringify(readings)}`).toBeGreaterThan(
				readings[i - 1]
			);
		}
		expect(readings[3] - readings[0], 'the range has real travel').toBeGreaterThan(6);
	}, 60000);
});
