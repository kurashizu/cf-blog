import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
/* Imported on the node side, deliberately.
   A dynamic `import()` inside `page.evaluate` resolves to a *different* module
   instance than the page's own bundle, so `SOUND_PRESETS` read that way comes
   back empty with no error and every loop over it passes vacuously. The
   catalogue is read here and each timbre passed into the browser as an
   argument. */
import { SOUND_PRESETS, HELD_BACK, type SoundPreset } from '../../src/lib/stores/synth-presets';
import { MODULE_SPECS } from '../../src/lib/stores/synth-modules';
import { flattenMacros } from '../../src/lib/stores/macros';
import type { RackGraph } from '../../src/lib/stores/graph-model';
import { BUILTIN_PREFABS } from '../../src/lib/stores/synth-prefabs';

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
 * defect has shipped seven separate times, the last three of them on FREQ. One
 * test per route or the coverage is half of what it reads as.
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
		const left = await render(split('out', -1), 8);
		const right = await render(split('out', 1), 8);
		expect(steady(left)).toBeCloseTo(0.2406, 3);
		expect(right.peak, `L socket heard a hard-right source: ${right.peak}`).toBe(0);
	}, 45000);

	it('SPLIT R carries the right channel and only the right', async () => {
		/* The mirror, and the half that proves the port resolves by name: if `r`
		   fell back to `out` this would read identically to the test above and
		   both would still "pass" a check that only looked for sound. The two
		   together are what pin it -- each socket is loud exactly where the other
		   is silent, at the same 0.2406. */
		const right = await render(split('r', 1), 8);
		const left = await render(split('r', -1), 8);
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
		const hardLeft = await render(brk('out', -1), 8);
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
		/* Measured: 0.6824 at -1, 0.6753 at -0.5, 0.5244 at 0, 0.2580 at +0.5,
		   and exactly 0 at +1. Monotonic down, and both endpoints render.

		   The two extremes are asserted hard -- silence is exact, and hard left is
		   within a whisker of a bare oscillator's 0.4813 * sqrt(2) -- while the
		   middle is asserted as an ordering, because equal-power panning is a
		   cosine and the exact midpoints are the panner's business rather than
		   this module's. */
		const hardL = await render(rig({ 'p.panPos': -1 }), 8);
		const halfL = await render(rig({ 'p.panPos': -0.5 }), 8);
		const centre = await render(rig({ 'p.panPos': 0 }), 8);
		const halfR = await render(rig({ 'p.panPos': 0.5 }), 8);
		const hardR = await render(rig({ 'p.panPos': 1 }), 8);
		expect(steady(hardL)).toBeCloseTo(0.6824, 3);
		expect(steady(centre)).toBeCloseTo(0.5244, 3);
		expect(hardR.peak, `hard right should leave channel 0 silent: ${hardR.peak}`).toBe(0);
		expect(steady(hardL)).toBeGreaterThan(steady(halfL));
		expect(steady(halfL)).toBeGreaterThan(steady(centre));
		expect(steady(centre)).toBeGreaterThan(steady(halfR));
		expect(steady(halfR)).toBeGreaterThan(steady(hardR));
	}, 60000);

	it('a CONST into POS arrives in the same units as the knob', async () => {
		/* POS used to read -100..100 against a param wanting -1..1, so a cable
		   had to be scaled where it landed -- a CONST of 100 had to mean hard
		   right, the same as typing 100 into the knob, rather than a hundred
		   times hard over. POS is typed -1..1 directly now, the same unit the
		   param holds, so there is no conversion left to prove: a CONST of -1
		   and one of 1 should simply read as the knob's own two extremes.

		   Measured: CONST -1 gives 0.6824 and CONST +1 gives exactly 0, the
		   knob's own two readings. Both ends, because a scaling bug that only
		   clipped would still pass a test of one. */
		const left = await render(
			rig({ 'p.panPos': 0, ...constAt('c', 6, -1) }, [{ id: 'c', type: 'const' }], [
				{ from: 'c', fromPort: 'out', to: 'p', toPort: 'panPos' }
			]),
			8
		);
		const right = await render(
			rig({ 'p.panPos': 0, ...constAt('c', 6, 1) }, [{ id: 'c', type: 'const' }], [
				{ from: 'c', fromPort: 'out', to: 'p', toPort: 'panPos' }
			]),
			8
		);
		expect(steady(left)).toBeCloseTo(0.6824, 3);
		expect(right.peak).toBe(0);
	}, 45000);

	it('a signal into POS lands at the same position a knob typed the same number would', async () => {
		/* The signal route through the same, now-unscaled socket. TO-SIG at 0.1
		   reads 0.4817 and TO-SIG at -0.1 reads 0.5640, straddling the centre's
		   0.5244 -- which is where a knob at +0.1 and -0.1 put it. Nothing here
		   converts any more, so this is the same reading the knob test above
		   would give at those two positions, reached by cable instead. */
		const right = await render(
			rig({ 'p.panPos': 0, 'ts.level': 0.1 }, [{ id: 'ts', type: 'tosig' }], [
				{ from: 'ts', fromPort: 'out', to: 'p', toPort: 'panPos' }
			]),
			8
		);
		const left = await render(
			rig({ 'p.panPos': 0, 'ts.level': -0.1 }, [{ id: 'ts', type: 'tosig' }], [
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
/* ──────────────────────────────────────────────────────────────────────────
   ENTRY HELD -- live elapsed time, not a snapshot

   GATE is a number decided once, at the moment this activation was built:
   how long the note will/did last. HELD is the other half -- how long it has
   been, right now -- and the whole reason it exists is that it is not the
   same claim. A patch cannot say "the longer this key is held, the more the
   filter opens" with a constant; it needs a signal that keeps moving for as
   long as the note runs. This is the test GATE's own could not be: an
   envelope that changes *within* a single render, without a WAIT or a
   discrete re-trigger anywhere in the patch.
   ────────────────────────────────────────────────────────────────────────── */
describe('ENTRY HELD: a live ramp, not a snapshot', () => {
	it('rises smoothly across a render, where GATE would sit flat', async () => {
		/* HELD onto GAIN's LVL directly: a knob with a value path GATE's own
		   tests already prove works for a constant, so this isolates the one
		   variable that matters -- whether the number changes with elapsed
		   time or is read once and held. Scaled down by CONST*MUL... except
		   HELD is a signal, not a pullable value (ENTRY's own pins are
		   published as outlets, not values a pure node can read), so it has
		   to be measured as a level moving across slices of one render
		   rather than compared across renders of different lengths the way
		   GATE's own scaling test does. */
		const held = (seconds: number) =>
			render(
				patch(
					[{ id: 'o', type: 'osc' }, { id: 'g', type: 'gain' }],
					[
						{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
						{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' },
						{ from: 'entry', fromPort: 'held', to: 'g', toPort: 'level' }
					],
					{ 'g.level': 0 }
				),
				8,
				seconds
			);
		const r = await held(2);
		expect(r.ok).toBe(true);
		/* Monotonically rising, slice over slice -- the signature a live ramp
		   leaves and a constant cannot. Skipping slice 0, which holds the
		   attack, for the same reason `steady` does elsewhere in this file. */
		const body = r.envelope.slice(1);
		for (let i = 1; i < body.length; i++) {
			expect(
				body[i],
				`expected HELD to keep rising: ${JSON.stringify(r.envelope)}`
			).toBeGreaterThan(body[i - 1]);
		}
		// And genuinely moving, not a flat line with rounding noise: the last
		// slice reads well above the first non-attack one.
		expect(
			body[body.length - 1],
			`expected real movement across the render: ${JSON.stringify(r.envelope)}`
		).toBeGreaterThan(body[0] * 1.5);
	}, 45000);

	it('starts at zero at the moment this activation begins, not at the render start', async () => {
		/* HELD is ramped from this build's own `t`, not from the context's own
		   time zero -- the two coincide for THEN on a fresh render, which is
		   the only case reachable through this bench, but the distinction is
		   what makes HELD answer "how long has *this* run", not "how far into
		   the render are we". Asserted here as: the very first slice, which
		   is mostly the note's attack, still reads near zero rather than
		   already partway up a ramp that started before the note did. */
		const r = await render(
			patch(
				[{ id: 'o', type: 'osc' }, { id: 'g', type: 'gain' }],
				[
					{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
					{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' },
					{ from: 'entry', fromPort: 'held', to: 'g', toPort: 'level' }
				],
				{ 'g.level': 0 }
			),
			16,
			2
		);
		expect(r.envelope[0], `expected HELD near zero at the start: ${JSON.stringify(r.envelope)}`).toBeLessThan(
			r.envelope[r.envelope.length - 1] * 0.2
		);
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

/* ──────────────────────────────────────────────────────────────────────────
   SEND and RTN -- the one loop the graph cannot draw

   (Most loops here are now compiled into one sample-accurate processor --
   see "Loops that close in one sample" in docs/node-graph.md and
   tests/audio/loop.test.ts. What this block pins -- the guard's small-signal
   gain, silence below unity, the bound above it, buses kept apart -- holds for
   both, and the open pair below, which is not a loop, is still the native
   one-block line.)

   `addCable` refuses any audio cable that closes a loop, because a delay fed
   its own output was measured stable only to about g = 0.90 and screamed past
   it. That refusal cost the catalogue a comb filter, a resonant flanger and
   Karplus-Strong all at once -- STRING is an additive bank *because* there was
   no loop to be had. These two cards put the loop inside a module instead: they
   are matched by a BUS number rather than by a cable, since a cable between
   them would be exactly the cycle that is refused, and internally they share a
   DelayNode of 128 samples (one render quantum, which is what makes Web Audio
   permit the cycle at all) plus a tanh WaveShaper so a runaway saturates
   instead of spiking.

   The tests below were written against a *broken* engine and the break is the
   reason several of them exist. The guard curve was first written as
   `tanh(x * 1.6) / tanh(1.6)`, normalised so its endpoints reach exactly +/-1.
   That leaves its slope at the *origin* at 1.6/tanh(1.6) = 1.736, and a comb
   tail is a small signal -- so every trip round the loop multiplied it by
   1.736, and the loop went unstable at a feedback of 1/1.736 = 0.576. Past
   that the tail did not ring down: it rose and latched at a fixed level and
   held it for the whole render, seconds after an 8 ms strike was over.
   Measured on a bare loop, fb 0.85 read
   [0.056, 0.1234, 0.1498, 0.1511, 0.1510, 0.1512, 0.1513, ...] -- flat forever.

   That is the screaming the cycle ban existed to prevent, merely
   amplitude-limited, and it made two thirds of the knob unusable. It also
   looked like the feature working: "feedback 0.85 rings until the end of the
   render" reads as a long tail until you notice the render is what ended, not
   the note. `tanh(x)` has unity slope at the origin and is what ships.

   So "the tail gets longer as the gain goes up" is not the strongest claim
   available here and is not the one that would have caught it -- the broken
   curve passed that test. The claim that bites is that a loop *below unity
   reaches exact silence*, which is the second test below.

   One thing here is deliberately not covered, found by trying to break it and
   failing. The explicit 128-sample DelayNode can be set to zero, or unwired
   from the path entirely, and every test below still passes -- because Web
   Audio inserts one render quantum into any cycle on its own account, so the
   loop is bounded with or without it. Measured with a single-sample impulse
   round a gain-0.5 loop: `delayTime = 0` repeats at samples 128, 256, 384, and
   `delayTime = 128/sampleRate` repeats at 256, 512, 768 -- the platform's own
   block, plus ours. The node is legibility rather than mechanism, and there is
   no behaviour to assert about it that is not really an assertion about the
   host. Left untested and written down instead, rather than covered by a test
   that would pass on an engine with the line cut out.

   Two more mutations survive and are also structural rather than untested:
   giving SEND an outlet in the engine, and giving RTN an inlet, change nothing,
   because the catalogue declares `outputs: []` and `inputs: []` for them and no
   cable can be drawn to a port that does not exist. `tests/unit/module-params`
   is what holds those, which is the right place for a claim about the shape of
   a card.
   ────────────────────────────────────────────────────────────────────────── */
/* Four mutations this block does NOT catch, recorded rather than left for
   someone to rediscover:

     - zeroing the internal delay line
     - bypassing it entirely
     - giving SEND an outlet
     - giving RTN an inlet

   The first two survive because the platform already breaks the cycle at its
   own render quantum, so the explicit DelayNode buys legibility and a second
   block of round trip, not the loop's existence -- verified by measurement, and
   the engine comment says so. The last two survive because an unused port
   changes no sound; the catalogue tests are what pin a module's shape.

   None of these is a hole in what the block claims. They are the boundary of
   what a bench that measures sound can see, which is worth writing down where
   the next person mutating this code will find it. */
describe('SEND and RTN: the feedback loop the canvas cannot draw', () => {
	/**
	 * The last slice with anything audible in it, or -1 for silence throughout.
	 *
	 * 0.0005 rather than 0, because the tail of a decaying comb approaches zero
	 * asymptotically and never quite arrives -- the question worth asking is
	 * where it stops being audible, not where the float underflows.
	 */
	const tailEnd = (r: Envelope) =>
		r.envelope.map((v, i) => (v > 0.0005 ? i : -1)).filter((i) => i >= 0).pop() ?? -1;

	/**
	 * A comb: one strike, a delay line, and the loop closed through a GAIN.
	 *
	 * `EXCITE -> SUM -> DELAY -> OUT`, with `DELAY -> SEND` and
	 * `RTN -> GAIN(fb) -> SUM` closing it. This is the patch the modules exist
	 * to make sayable, so it is the one the coverage is built on.
	 *
	 * An 8 ms strike, which matters: the source is over almost immediately, so
	 * everything measured after slice 0 is the loop and not the excitation. A
	 * sustained source would hide a loop that had stopped working.
	 *
	 * 50 ms of delay because it is the value that gives the tail room to show
	 * its length. Measured at fb 0.85, the tail ends at slice 2 with a 10 ms
	 * line, 7 with 50 ms and 17 with 150 ms -- too short and every setting
	 * lands in the same slice, too long and the repeats are audible as separate
	 * events rather than a decay.
	 */
	const comb = (fb: number, extra: Record<string, number> = {}) =>
		patch(
			[
				{ id: 'e', type: 'excite' },
				{ id: 'sum', type: 'sum' },
				{ id: 'd', type: 'delay' },
				{ id: 's', type: 'fbsend' },
				{ id: 'r', type: 'fbrtn' },
				{ id: 'fb', type: 'gain' }
			],
			[
				{ from: 'e', fromPort: 'out', to: 'sum', toPort: 'in' },
				{ from: 'sum', fromPort: 'out', to: 'd', toPort: 'in' },
				{ from: 'd', fromPort: 'out', to: 'output', toPort: 'in' },
				{ from: 'd', fromPort: 'out', to: 's', toPort: 'in' },
				{ from: 'r', fromPort: 'out', to: 'fb', toPort: 'in' },
				{ from: 'fb', fromPort: 'out', to: 'sum', toPort: 'in' }
			],
			{ 'e.exLength': 8, 'd.delayTime': 0.05, 'fb.level': fb, ...extra }
		);

	/**
	 * The same loop with no DELAY module in it, so the only delay is the
	 * module's own 128-sample line and the loop gain is exactly `fb`.
	 *
	 * This is the rig that makes the guard's small-signal gain measurable. With
	 * a DELAY in the path the round trip is 50 ms and a render only holds sixty
	 * of them, so a loop slightly over unity takes longer than the render to
	 * become obvious. Here the round trip is 2.9 ms at this bench's 44.1 kHz,
	 * about 1400 trips in four seconds, and a gain error of even a few percent
	 * is unmissable.
	 */
	const bareLoop = (fb: number) =>
		patch(
			[
				{ id: 'e', type: 'excite' },
				{ id: 'sum', type: 'sum' },
				{ id: 's', type: 'fbsend' },
				{ id: 'r', type: 'fbrtn' },
				{ id: 'fb', type: 'gain' },
				{ id: 'o', type: 'gain' }
			],
			[
				{ from: 'e', fromPort: 'out', to: 'sum', toPort: 'in' },
				{ from: 'sum', fromPort: 'out', to: 's', toPort: 'in' },
				{ from: 'r', fromPort: 'out', to: 'fb', toPort: 'in' },
				{ from: 'fb', fromPort: 'out', to: 'sum', toPort: 'in' },
				{ from: 'sum', fromPort: 'out', to: 'o', toPort: 'in' },
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'e.exLength': 8, 'fb.level': fb, 'o.level': LIM }
		);

	it('repeats a single strike, and the tail grows with the feedback', async () => {
		/* The comb working at all, which is the whole point of the pair.

		   One 8 ms strike. At fb 0 it is gone inside slice 0 -- there is no loop,
		   so what reaches OUT is the excitation and nothing else, and that is the
		   control the rest of the row is read against. Every slice after 0 at a
		   non-zero setting is sound that only exists because it went round.

		   Tail ends at slice 0, 1, 2, 4, 9 and 23 for fb 0, 0.3, 0.5, 0.7, 0.85
		   and 0.95. Asserted as an ordering rather than as those six numbers:
		   EXCITE is noise and its level moves run to run, so the boundary slice
		   moves by one either way at the high settings (0.85 read 9 and 10 across
		   three passes). The ordering held identically in all three.

		   Non-strict at each step, strict end to end -- adjacent settings can tie
		   in the same slice when the noise goes the wrong way, but 0 to 0.95 is
		   twenty-three slices of travel and cannot. */
		const fbs = [0, 0.3, 0.5, 0.7, 0.85, 0.95];
		const ends: number[] = [];
		for (const fb of fbs) ends.push(tailEnd(await render(comb(fb), 24, 3)));

		expect(ends[0], `fb 0 is the strike alone: ${JSON.stringify(ends)}`).toBe(0);
		for (let i = 1; i < ends.length; i++) {
			expect(
				ends[i],
				`feedback ${fbs[i]} must ring at least as long as ${fbs[i - 1]}: ${JSON.stringify(ends)}`
			).toBeGreaterThanOrEqual(ends[i - 1]);
		}
		expect(
			ends[ends.length - 1] - ends[0],
			`the knob has real travel: ${JSON.stringify(ends)}`
		).toBeGreaterThan(8);
	}, 90000);

	it('a loop below unity reaches exact silence, not a latched floor', async () => {
		/* The assertion that catches the bug this module shipped with, and the
		   one worth having above all the others here.

		   A feedback gain under 1 is a decay: mathematically the tail is
		   multiplied by g every trip and g^n goes to zero. If the saturator has
		   any gain of its own at small signal levels the effective loop gain is
		   not g but g*k, and for g anywhere above 1/k the tail stops decaying and
		   latches at whatever level the curve's fixed point sits at. That is
		   exactly what `tanh(x*1.6)/tanh(1.6)` did, with k = 1.736 and a
		   threshold of 0.576.

		   The distinction this test draws is the one a tail-length test cannot:
		   a latched loop is *loud*, so it reads as a long tail and passes "higher
		   feedback rings longer" with room to spare. What it cannot do is go
		   quiet. So the claim here is exact silence -- literal zero in the
		   envelope, not merely small.

		   Four seconds through the bare loop, whose round trip is 2.9 ms, so the
		   second half of the render is about 700 trips after the strike. Measured
		   0 to four decimals across the whole second half at every setting from
		   0.5 to 0.95. Against the old curve the same renders read a flat 0.0998
		   at 0.7 and 0.1513 at 0.85 and never moved. */
		for (const fb of [0.5, 0.7, 0.85, 0.9, 0.95]) {
			const r = await render(bareLoop(fb), 16, 4);
			const settled = r.envelope.slice(8);
			expect(
				Math.max(...settled),
				`feedback ${fb} is below unity and must die out: ${JSON.stringify(r.envelope)}`
			).toBe(0);
		}
	}, 90000);

	it('stays bounded when the feedback is driven past unity', async () => {
		/* The assertion that justifies the module existing at all.

		   The loop was banned rather than built because a delay fed its own
		   output "screamed" past about g = 0.90 -- an unbounded spike at the
		   speakers. A tanh saturator is what makes the same patch safe to offer:
		   above unity the loop still runs away, but it runs away into distortion
		   at full scale instead of into an arbitrarily large number.

		   Deliberately absurd settings, well past anything a patch would ask
		   for. Peaks 0.90 at fb 2, 1.10 at fb 4 through the comb; a sustained
		   oscillator driven at fb 16 -- the worst case, since the source never
		   stops feeding it -- reads 1.0062.

		   The bound is 1.5 rather than 1.0 because the master limiter sits after
		   this and the saturator's ceiling is per-sample on a signal that sums
		   with the dry path, so a peak a little over full scale is expected and
		   fine. What is being ruled out is the unbounded case, which read in the
		   tens and hundreds. Asserted as finite too: a runaway that reaches
		   infinity or NaN poisons the buffer and every RMS in it reads NaN,
		   which `toBeLessThan` alone would not catch. */
		for (const fb of [1.5, 2, 4]) {
			const r = await render(comb(fb), 8, 3);
			expect(Number.isFinite(r.peak), `fb ${fb} produced ${r.peak}`).toBe(true);
			expect(r.peak, `fb ${fb} must stay bounded`).toBeLessThan(1.5);
			expect(r.peak, `fb ${fb} should still be making sound`).toBeGreaterThan(0.2);
		}
	}, 90000);

	it('bounds a runaway fed by a source that never stops', async () => {
		/* The harder half of the same claim, separated because the comb above is
		   fed by an 8 ms strike -- the loop is running away from an input that
		   has already ended, which is the easy case.

		   Here an oscillator feeds the loop for the whole render at a feedback of
		   16, so the saturator is being pushed continuously rather than ringing
		   down from one impulse. Peak 1.0062, and the envelope settles flat at
		   about 0.83 rather than climbing: [0.6535, 0.8268, 0.8407, 0.8278,
		   0.8387, 0.8308, 0.8334, 0.8357]. Settling is the point -- that is the
		   curve's ceiling being reached and held, which is what "saturates
		   instead of spiking" means. */
		const r = await render(
			patch(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'g0', type: 'gain' },
					{ id: 'sum', type: 'sum' },
					{ id: 'd', type: 'delay' },
					{ id: 's', type: 'fbsend' },
					{ id: 'r', type: 'fbrtn' },
					{ id: 'fb', type: 'gain' }
				],
				[
					{ from: 'o', fromPort: 'out', to: 'g0', toPort: 'in' },
					{ from: 'g0', fromPort: 'out', to: 'sum', toPort: 'in' },
					{ from: 'sum', fromPort: 'out', to: 'd', toPort: 'in' },
					{ from: 'd', fromPort: 'out', to: 'output', toPort: 'in' },
					{ from: 'd', fromPort: 'out', to: 's', toPort: 'in' },
					{ from: 'r', fromPort: 'out', to: 'fb', toPort: 'in' },
					{ from: 'fb', fromPort: 'out', to: 'sum', toPort: 'in' }
				],
				{ 'g0.level': 0.3, 'd.delayTime': 0.05, 'fb.level': 16 }
			),
			8,
			3
		);
		expect(Number.isFinite(r.peak)).toBe(true);
		expect(r.peak, 'a continuously driven runaway is still bounded').toBeLessThan(1.5);
		/* The last four slices are flat to within a few percent of each other:
		   the loop has reached the curve's ceiling and is sitting on it. A loop
		   that was still growing would spread much wider than this. */
		const tail = r.envelope.slice(4);
		expect(Math.max(...tail) / Math.min(...tail), 'it settles rather than climbing').toBeLessThan(
			1.15
		);
	}, 60000);

	it('is silent, and does not error, when a RTN has no SEND on its bus', async () => {
		/* Half a loop is a patch being built. Someone drops a RTN on the canvas
		   before its SEND exists, and a module that threw -- or that built no
		   voice -- while you were wiring would be unusable.

		   Exactly 0, not merely quiet: with no SEND on the bus nothing is
		   connected to the return's input at all. `builtVoice` is asserted
		   separately because a graph that fails to build also renders silence,
		   and the two would be indistinguishable otherwise -- that is the
		   difference between "the module handled it" and "the patch never
		   played". */
		const r = await render(
			patch(
				[
					{ id: 'r', type: 'fbrtn' },
					{ id: 'g', type: 'gain' }
				],
				[
					{ from: 'r', fromPort: 'out', to: 'g', toPort: 'in' },
					{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ 'g.level': LIM }
			),
			8,
			2
		);
		expect(r.ok, r.error).toBe(true);
		expect(r.builtVoice, 'the voice still builds').toBe(true);
		expect(r.peak).toBe(0);
	}, 45000);

	it('swallows what a SEND is given when nothing returns it', async () => {
		/* The other half of a patch under construction, and the direction that
		   could go wrong loudly rather than quietly: SEND has no outlet, so a
		   source wired into one must reach OUT by no path whatever. If the send
		   leaked to the destination -- an easy mistake, since it is a GainNode
		   like any other -- a half-built loop would be audible when it should be
		   silent.

		   Exactly 0 against the same oscillator reading 0.2042 wired straight to
		   OUT, which is the control that proves the source was making sound. */
		const swallowed = await render(
			patch(
				[
					{ id: 'o', type: 'osc' },
					{ id: 's', type: 'fbsend' }
				],
				[{ from: 'o', fromPort: 'out', to: 's', toPort: 'in' }],
				{}
			),
			8,
			2
		);
		const control = await render(
			patch(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'g', type: 'gain' }
				],
				[
					{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
					{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ 'g.level': LIM }
			),
			8,
			2
		);
		expect(swallowed.builtVoice).toBe(true);
		expect(swallowed.peak).toBe(0);
		expect(control.peak, 'the same source does sound when wired to OUT').toBeGreaterThan(0.1);
	}, 45000);

	it('hands back at RTN what SEND was given, one block later', async () => {
		/* The line itself, measured open rather than closed -- an oscillator into
		   SEND and RTN straight to OUT, with no feedback path at all.

		   What comes back is the same signal: 0.1412 steady through the loop
		   against 0.1444 straight to OUT, a 2% difference which is the 2.9 ms of
		   delay shifting where the slice boundaries fall on a periodic wave. The
		   claim is that the pair is a wire with a one-block delay in it and not a
		   filter or an attenuator -- if the 128-sample line were longer, or the
		   saturator were squashing at ordinary levels, this would not read as
		   unity.

		   It also pins the guard at small signals from the other side: a curve
		   with 1.736 gain at the origin would have read this *louder* than the
		   control, not equal to it. */
		const through = await render(
			patch(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'g0', type: 'gain' },
					{ id: 's', type: 'fbsend' },
					{ id: 'r', type: 'fbrtn' },
					{ id: 'g', type: 'gain' }
				],
				[
					{ from: 'o', fromPort: 'out', to: 'g0', toPort: 'in' },
					{ from: 'g0', fromPort: 'out', to: 's', toPort: 'in' },
					{ from: 'r', fromPort: 'out', to: 'g', toPort: 'in' },
					{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ 'g0.level': LIM, 'g.level': 1 }
			),
			8,
			2
		);
		const direct = await render(
			patch(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'g', type: 'gain' }
				],
				[
					{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
					{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ 'g.level': LIM }
			),
			8,
			2
		);
		expect(steady(through)).toBeGreaterThan(0);
		expect(
			steady(through) / steady(direct),
			`the loop is a wire: ${steady(through)} vs ${steady(direct)}`
		).toBeCloseTo(1, 1);
	}, 45000);

	it('keeps one bus out of another', async () => {
		/* BUS is what lets several loops coexist, and it is the only thing
		   separating them -- there is no cable to get wrong, so a bus that was
		   ignored would silently merge every loop in the patch into one.

		   A running loop on bus 0, and a second RTN wired to OUT. On bus 1 it
		   reads exactly 0: the loop is sounding, and this return is deaf to it.
		   The control beside it is the same patch with that return moved to bus
		   0, where it reads 0.1298 -- which is what makes the zero meaningful
		   rather than a patch that was not playing. Note that OUT hears the loop
		   *only* through this second return, so the first reading is the whole
		   output. */
		const rig = (bus: number) =>
			patch(
				[
					{ id: 'e', type: 'excite' },
					{ id: 'sum', type: 'sum' },
					{ id: 'd', type: 'delay' },
					{ id: 's', type: 'fbsend' },
					{ id: 'r', type: 'fbrtn' },
					{ id: 'fb', type: 'gain' },
					{ id: 'r1', type: 'fbrtn' },
					{ id: 'g1', type: 'gain' }
				],
				[
					{ from: 'e', fromPort: 'out', to: 'sum', toPort: 'in' },
					{ from: 'sum', fromPort: 'out', to: 'd', toPort: 'in' },
					{ from: 'd', fromPort: 'out', to: 's', toPort: 'in' },
					{ from: 'r', fromPort: 'out', to: 'fb', toPort: 'in' },
					{ from: 'fb', fromPort: 'out', to: 'sum', toPort: 'in' },
					{ from: 'r1', fromPort: 'out', to: 'g1', toPort: 'in' },
					{ from: 'g1', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{
					'e.exLength': 8,
					'd.delayTime': 0.05,
					'fb.level': 0.85,
					's.bus': 0,
					'r.bus': 0,
					'r1.bus': bus,
					'g1.level': LIM
				}
			);
		const deaf = await render(rig(1), 24, 3);
		const hears = await render(rig(0), 24, 3);
		expect(deaf.peak, 'bus 1 hears nothing of bus 0').toBe(0);
		expect(hears.peak, 'the same return on bus 0 does hear it').toBeGreaterThan(0.02);
	}, 60000);

	it('pairs the two ends at both ends of the BUS range, and only when they match', async () => {
		/* BUS is declared 0..7, so both ends of that range have to actually pair
		   -- an off-by-one in the map lookup, or a bus number silently clamped,
		   would show at 7 and nowhere else.

		   Bus 0 and bus 7 both ring: tail to slice 9 and 10, against slice 0 when
		   the two ends disagree. The mismatched pair is the other half of the
		   claim and the reason this is one test rather than two: 0/7 and 7/0 both
		   read tail-end 0, the bare strike with no loop at all, which is what
		   proves the pairing is by number rather than "the first SEND anywhere".

		   Tail ends compared against the fb-0 control rather than to each other,
		   since EXCITE is noise and the exact boundary slice moves by one. */
		const matched0 = tailEnd(await render(comb(0.85, { 's.bus': 0, 'r.bus': 0 }), 24, 3));
		const matched7 = tailEnd(await render(comb(0.85, { 's.bus': 7, 'r.bus': 7 }), 24, 3));
		const split07 = tailEnd(await render(comb(0.85, { 's.bus': 0, 'r.bus': 7 }), 24, 3));
		const split70 = tailEnd(await render(comb(0.85, { 's.bus': 7, 'r.bus': 0 }), 24, 3));

		expect(matched0, 'bus 0 pairs').toBeGreaterThan(4);
		expect(matched7, 'bus 7 pairs').toBeGreaterThan(4);
		expect(split07, 'SEND 0 does not reach RTN 7').toBe(0);
		expect(split70, 'SEND 7 does not reach RTN 0').toBe(0);
	}, 90000);

	it('runs two loops in one voice without either leaking into the other', async () => {
		/* Two combs off one strike, with different feedback amounts, summed to
		   OUT. On separate buses each keeps its own gain and the pair dies with
		   the shorter-lived of them; on the same bus they become one loop whose
		   gain is the sum of both return paths, and that is well over unity, so
		   it saturates and rings for the whole render.

		   Tail ends at slice 9 separated and 23 shared, which is the render
		   ending rather than the note. That difference is the whole assertion:
		   two loops that were secretly one would ring on.

		   This is the per-voice `fbBuses` map tested as far as a single-note
		   bench can test it, and the limit is worth stating plainly. The map is
		   built once per *voice*, so the claim it actually makes is that two
		   simultaneous notes hold two independent sets of buses. This bench
		   renders exactly one note -- `renderNote` calls `triggerTrackVoice`
		   once -- so the two-note case is not reachable from here at all and is
		   not tested. What is tested is the same map's other guarantee, that two
		   buses within one voice are distinct, which shares the lookup with it.
		   A bug that made the map global rather than per-voice would pass this
		   test; a bug that ignored the bus number would not. */
		const two = (busB: number) =>
			patch(
				[
					{ id: 'e', type: 'excite' },
					{ id: 'sumA', type: 'sum' },
					{ id: 'dA', type: 'delay' },
					{ id: 'sA', type: 'fbsend' },
					{ id: 'rA', type: 'fbrtn' },
					{ id: 'fbA', type: 'gain' },
					{ id: 'sumB', type: 'sum' },
					{ id: 'dB', type: 'delay' },
					{ id: 'sB', type: 'fbsend' },
					{ id: 'rB', type: 'fbrtn' },
					{ id: 'fbB', type: 'gain' },
					{ id: 'mix', type: 'gain' }
				],
				[
					{ from: 'e', fromPort: 'out', to: 'sumA', toPort: 'in' },
					{ from: 'sumA', fromPort: 'out', to: 'dA', toPort: 'in' },
					{ from: 'dA', fromPort: 'out', to: 'sA', toPort: 'in' },
					{ from: 'rA', fromPort: 'out', to: 'fbA', toPort: 'in' },
					{ from: 'fbA', fromPort: 'out', to: 'sumA', toPort: 'in' },
					{ from: 'dA', fromPort: 'out', to: 'mix', toPort: 'in' },
					{ from: 'e', fromPort: 'out', to: 'sumB', toPort: 'in' },
					{ from: 'sumB', fromPort: 'out', to: 'dB', toPort: 'in' },
					{ from: 'dB', fromPort: 'out', to: 'sB', toPort: 'in' },
					{ from: 'rB', fromPort: 'out', to: 'fbB', toPort: 'in' },
					{ from: 'fbB', fromPort: 'out', to: 'sumB', toPort: 'in' },
					{ from: 'dB', fromPort: 'out', to: 'mix', toPort: 'in' },
					{ from: 'mix', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{
					'e.exLength': 8,
					'dA.delayTime': 0.05,
					'fbA.level': 0.5,
					'sA.bus': 0,
					'rA.bus': 0,
					'dB.delayTime': 0.05,
					'fbB.level': 0.9,
					'sB.bus': busB,
					'rB.bus': busB,
					'mix.level': 0.5
				}
			);
		const apart = tailEnd(await render(two(1), 24, 4));
		const shared = tailEnd(await render(two(0), 24, 4));
		expect(apart, 'two buses, each loop keeps its own gain and dies out').toBeLessThan(16);
		expect(shared, 'one bus, the two returns add into a loop over unity').toBe(23);
		expect(shared, 'sharing a bus is audibly different').toBeGreaterThan(apart);
	}, 60000);
});

/* ──────────────────────────────────────────────────────────────────────────
   The shipped ADV presets, measured as sound rather than as graphs

   `tests/unit/preset-render.test.ts` asks of every preset that it "builds a
   voice with every scheduled value finite". A preset that renders *exact
   silence* satisfies that perfectly -- zero is finite -- which is how thirteen
   ADV presets sat in the shipped catalogue emitting nothing at all while the
   suite stayed green for months. Asserting the intermediate state rather than
   the result is the failure mode this whole directory exists to correct, and
   the presets are the last place in it that was still only checked that way.

   Every test below is driven off `SOUND_PRESETS` itself rather than off a list
   of names written out here. That is the point: the migration is ongoing, the
   ADV presets come back one at a time as their last missing primitive lands,
   and a list of eight would cover the ninth the day someone remembered to edit
   it. Driven off the catalogue, a preset is covered the moment it emits a graph
   and the same test fails if a regression empties one.

   `advanced` is set on the timbre here, and it is load-bearing. Measured: the
   presets carry a `rackGraph` but *not* the flag, because `applyPresetAt`
   derives it -- `advanced: isChainPreset || hasGraph`. Rendering the preset
   object raw instead sends the note through the subtractive voice, and three of
   the eight (DRAWBAR ORGAN, PAN FLUTE, DULCIMER) then read peak 0.0000 with a
   built voice and no error. That is the exact shape of the bug this block is
   about, produced by the bench rather than by the engine, and it is why the
   helper below reproduces what the app does rather than passing `p.preset`
   straight through.

   Numbers: thresholds and orderings only, never a constant. Several of these
   patches are noise-excited -- PAN FLUTE and FLUTE are NOISE sources, KOTO,
   PIANO, DULCIMER and UPRIGHT BASS are EXCITE -- so their peaks move run to
   run. Measured over three passes, PAN FLUTE read 0.5655 / 0.5436 / 0.5468 and
   DRAWBAR ORGAN 0.2458 / 0.2522 / 0.2480, while the string patches repeated to
   four decimals. Pinning a noise-sourced reading tight is the one-in-three
   flake this directory has already been through once.
   ────────────────────────────────────────────────────────────────────────── */

/** A preset as `applyPresetAt` hands it to the engine.
 *
 * The flag is derived from the preset rather than stored in it, so a bench that
 * spreads `p.preset` alone is measuring a different instrument -- see the block
 * comment above for what that reads as. */
const asTimbre = (p: SoundPreset): Record<string, unknown> => ({
	...(p.preset as Record<string, unknown>),
	advanced: true,
	advancedView: 'rack'
});

/** The graph a preset emits, as the engine builds it -- its macros flattened,
 *  so a composite's primitives are here under `instance/inner` -- or nothing
 *  if it is still held back. */
const graphOf = (p: SoundPreset) =>
	p.preset.rackGraph
		? (flattenMacros(p.preset.rackGraph as RackGraph, p.preset.graphParams ?? {}).graph as {
				nodes: { id: string; type: string }[];
				cables: unknown[];
			})
		: undefined;
/** A preset's knobs, keyed as the flattened graph's nodes are. */
const paramsOf = (p: SoundPreset) =>
	p.preset.rackGraph
		? flattenMacros(p.preset.rackGraph as RackGraph, p.preset.graphParams ?? {}).params
		: {};

/** The presets that currently emit a graph -- what `patch()` let through. */
const EMITTING = SOUND_PRESETS.filter((p) => (graphOf(p)?.nodes.length ?? 0) > 0);

describe('the shipped ADV presets', () => {
	it('is driven off a catalogue that actually has graph presets in it', () => {
		/* The guard every loop below needs, because `it.each` over an empty list
		   and `for (const p of [])` are both silently green. Eight emit today and
		   five are held back; asserting "at least five" rather than "exactly
		   eight" is what lets the ninth land without editing this file, while
		   still failing if `patch()` goes back to returning `{}` wholesale --
		   which is the state this whole migration is climbing out of. */
		expect(EMITTING.length, 'presets emitting a graph').toBeGreaterThanOrEqual(5);
		expect(EMITTING.length + HELD_BACK.size, 'every ADV preset is one or the other').toBe(13);
	});

	/* One test per preset rather than one loop over all of them, so a failure
	   names the instrument that went silent instead of a list index. */
	for (const preset of EMITTING) {
		it(`${preset.name} sounds`, async () => {
			/* The whole point of the block. Three seconds, twelve slices, which is
			   long enough that a struck string has decayed and short enough that a
			   sustained one is still clearly on.

			   0.02 is a floor two decades below the quietest of the eight rather
			   than a reading of any of them. Measured peaks across three passes:
			   KOTO 0.1273, MARIMBA 0.1272, DRAWBAR ORGAN 0.2458..0.2522, PAN FLUTE
			   0.5436..0.5655, DULCIMER 0.1150, PIANO 0.1591..0.1619, UPRIGHT BASS
			   0.1304, FLUTE 0.3222..0.3362. The quietest has 15 dB of headroom
			   over the threshold, so a preset has to be genuinely broken rather
			   than merely re-voiced to fail this -- and a silent one reads exactly
			   0.0000, which an empty graph was measured at for comparison. */
			const r = await render(asTimbre(preset), 12, 3);
			expect(r.ok, `${preset.name} rendered without error: ${r.error ?? ''}`).toBe(true);
			expect(r.builtVoice, `${preset.name} built a voice`).toBe(true);
			expect(r.peak, `${preset.name} is not silent`).toBeGreaterThan(0.02);

			/* Not silent is not the same as being a sound.

			   A DC offset -- a constant the graph settles at, which a stuck
			   envelope or a CONST wired to OUT produces -- has a peak like any
			   other signal and is inaudible. It shows as RMS equal to peak, since
			   a constant's root-mean-square *is* its amplitude. Measured, the
			   loudest slice of these eight reads between 0.30 and 0.56 of peak
			   (FLUTE 0.3039 lowest, UPRIGHT BASS 0.5583 highest), which is what a
			   waveform that crosses zero looks like. 0.9 is the threshold: well
			   clear of the 0.56 measured and well under the 1.0 a constant gives.

			   A sine reads 0.707 of peak, so this deliberately does not claim to
			   catch every degenerate case -- it catches the constant, which is the
			   one that renders as nothing you can hear. */
			const loudest = Math.max(...r.envelope);
			expect(loudest / r.peak, `${preset.name} is a waveform, not a DC offset`).toBeLessThan(0.9);
		}, 45000);
	}

	it('holds back every preset it holds back for a reason that is still true', () => {
		/* The other half of the migration, and the half that is invisible without
		   a test. `patch()` suppresses a graph whose types the catalogue does not
		   carry, which is right -- a node of an unknown type builds nothing and a
		   cable through it is a broken chain -- but the suppression leaves no
		   trace in the shipped preset. A preset held back after its last missing
		   primitive landed looks exactly like one with no graph to emit, and
		   nothing anywhere would say so.

		   So: every type `HELD_BACK` names as missing must actually be missing.
		   The moment BOW or REED lands in the catalogue and the preset waiting on
		   it is not re-emitted, this fails and names the type.

		   Today that is bow, drive, eq, lfo and reed across five presets. Not
		   asserted as that list -- the list is meant to shrink -- but as the
		   invariant that survives it shrinking. */
		const ids = new Set(MODULE_SPECS.map((m) => m.id));
		const stale: string[] = [];
		for (const [path, missing] of HELD_BACK) {
			expect(missing.length, `a held-back entry names what it waits on: ${path}`).toBeGreaterThan(0);
			for (const type of missing) {
				if (ids.has(type)) stale.push(`${type} exists now, so the preset "${path}" can be emitted`);
			}
		}
		expect(stale).toEqual([]);
	});

	it('emits a graph whose every type the catalogue carries', () => {
		/* The inverse, and the assertion the expanders need most.

		   `expandBody` and `expandMix` rewrite BODY and MIX into primitives, and
		   both run *before* `missingTypes` looks at the graph -- so an expander
		   that emitted a type the catalogue does not carry would produce a preset
		   that is held back rather than one that is broken, which is safe. What
		   is not safe is the reverse: nothing else checks that what comes out of
		   an expander is buildable at all, and a typo in `'filter'` would reach
		   the palette. The expansion is where these types come from, so this is
		   effectively a test of the expanders' output.

		   Measured, the eight between them name 21 distinct types: comb via
		   DELAY/SEND/RTN in KOTO, `filter` and `gain` from `expandBody` in six of
		   them, `sum` and `gain` from `expandMix` in four. */
		const ids = new Set(MODULE_SPECS.map((m) => m.id));
		const unknown: string[] = [];
		for (const p of EMITTING) {
			for (const n of graphOf(p)!.nodes) {
				if (n.type !== 'in' && n.type !== 'out' && !ids.has(n.type))
					unknown.push(`${p.name}: ${n.id} is a ${n.type}, which no module declares`);
			}
		}
		expect(unknown).toEqual([]);
	});

	it('emits graphs of a plausible size, with an output path in each', () => {
		/* A cheap shape check beside the audio one, and it catches a different
		   thing: an expander that dropped its cables would leave the node count
		   intact and the sound gone, while one that dropped its *nodes* would
		   leave a graph too small to be the instrument it claims.

		   Measured today: 11 nodes (PAN FLUTE) to 23 (DRAWBAR ORGAN), with 11 to
		   26 cables. The bounds are 6 and 60 -- loose on purpose, since re-voicing
		   an instrument legitimately moves these and the failure this is for is a
		   graph collapsing to two or three nodes rather than one growing by two.
		   Six is ENTRY, OUT, the injected trim and three modules, which is smaller
		   than any real patch here. The top was 60 until PIANO became the grand
		   piano: 87 nodes once its macros are flattened (three strings, the case,
		   their terminals, the hammer, the damper and the shared board), so 100.

		   Every graph also has to reach OUT. `patch()` routes everything addressed
		   to `output` through the injected trim, so the cable that actually lands
		   on OUT is the trim's -- if no cable arrives there at all the patch is a
		   set of modules playing to nothing, which renders silent for a reason no
		   amount of staring at the node list shows. */
		const bad: string[] = [];
		for (const p of EMITTING) {
			const g = graphOf(p)!;
			if (g.nodes.length < 6 || g.nodes.length > 100)
				bad.push(`${p.name}: ${g.nodes.length} nodes is not a plausible patch`);
			if (g.cables.length < g.nodes.length - 2)
				bad.push(`${p.name}: ${g.cables.length} cables for ${g.nodes.length} nodes`);
			const intoOut = (g.cables as { to: string; toPort: string }[]).filter(
				(c) => c.to === 'output' && c.toPort === 'in'
			);
			if (!intoOut.length) bad.push(`${p.name}: nothing is cabled into OUT`);
		}
		expect(bad).toEqual([]);
	});


	it('leaves each expanded BODY by its output sum, with the crossfade it was voiced with', () => {
		/* Two things `expandBody` can get wrong that are *audible but not silent*,
		   which is the gap the rendering tests above leave.

		   A BODY expands into seven nodes. `<id>` keeps the original name and
		   becomes the input fan-out, so every cable already written *into* the
		   module still lands; `<id>_o` is the sum everything leaves by, and the
		   expander rewrites each outgoing cable onto it. Skip that rewrite and the
		   patch still sounds -- the fan-out carries the dry signal -- it just
		   bypasses the two peaking filters entirely and the soundboard does
		   nothing. Measured, that costs KOTO 0.0443 -> 0.0407 and PIANO 0.0660 ->
		   0.0566 at the loudest slice: a few percent, well inside the run-to-run
		   spread of a noise-excited patch, so it is not assertable as a level. It
		   is exactly assertable as a shape, which is what this does -- nothing may
		   leave the fan-out except into the expansion's own nodes.

		   The crossfade is the second. `dry = 1 - mix` and `wet = mix / 2` per
		   peak, so the three legs sum to 1 by construction and a body that got
		   louder or quieter than the signal it filtered would show as a sum that
		   does not. Measured across the six presets carrying one: 0.5+0.25+0.25,
		   0.6+0.2+0.2, 0.42+0.29+0.29, 0.45+0.275+0.275, 0.4+0.3+0.3 and
		   0.65+0.175+0.175. Compared with a tolerance rather than exactly, because
		   `1 - 0.58` is 0.42000000000000004 in binary floating point and two of
		   these already read that way in the emitted params. */
		const bad: string[] = [];
		const params = (p: SoundPreset) => paramsOf(p);
		let bodies = 0;
		for (const p of EMITTING) {
			const g = graphOf(p)!;
			const ids = new Set(g.nodes.map((n) => n.id));
			for (const n of g.nodes) {
				if (!n.id.endsWith('_o') || n.type !== 'sum') continue;
				const base = n.id.slice(0, -2);
				// A BODY expansion, as against a MIX one: only BODY makes the filters.
				if (!ids.has(`${base}_p1`) || !ids.has(`${base}_p2`)) continue;
				bodies++;
				const own = new Set([base, `${base}_d`, `${base}_p1`, `${base}_p2`, `${base}_g1`, `${base}_g2`, `${base}_o`]);
				for (const c of g.cables as { from: string; to: string }[]) {
					if (c.from === base && !own.has(c.to))
						bad.push(`${p.name}: a cable leaves ${base} for ${c.to}, bypassing the body`);
				}
				const legs =
					(params(p)[`${base}_d.level`] ?? 0) +
					(params(p)[`${base}_g1.level`] ?? 0) +
					(params(p)[`${base}_g2.level`] ?? 0);
				if (Math.abs(legs - 1) > 1e-9)
					bad.push(`${p.name}: ${base}'s dry and wet legs sum to ${legs}, not 1`);
			}
		}
		expect(bad).toEqual([]);
		/* Six of the eight carry a body, so a rule that matched nothing would be
		   green for the wrong reason. */
		expect(bodies, 'the catalogue still has expanded bodies in it').toBeGreaterThanOrEqual(4);
	});

	it('keeps the per-leg balance each MIX was voiced with', () => {
		/* The defect `expandMix` exists to fix, asserted rather than assumed.

		   MIX carried a level per leg and SUM is a bare adder, so the rename alone
		   dropped `mixA`/`mixB` on the floor -- numbers a module does not declare
		   are silently absent, and every one of these instruments lost the balance
		   it was voiced with. Since both legs then run at unity the patch still
		   sounds, which is why nothing above catches it: MARIMBA's resonator tube
		   under the bar, PIANO's sympathetic pair and FLUTE's breath noise all
		   come back at full level instead of at 38, 64 and 12 percent.

		   Measured, the three MIX presets emit `mx.level` 1 against `mx_b.level`
		   0.38, 0.64 and 0.12. What is asserted is that the two legs are not all
		   equal -- the balance is a voicing decision and will move, whereas a
		   migration that dropped it makes every pair identical. */
		const varied: string[] = [];
		let mixes = 0;
		for (const p of EMITTING) {
			const g = graphOf(p)!;
			const ids = new Set(g.nodes.map((n) => n.id));
			const params = paramsOf(p);
			for (const n of g.nodes) {
				if (!n.id.endsWith('_o') || n.type !== 'sum') continue;
				const base = n.id.slice(0, -2);
				// A MIX expansion: two gains and a sum, and no peaking filters.
				if (!ids.has(`${base}_b`) || ids.has(`${base}_p1`)) continue;
				mixes++;
				const a = params[`${base}.level`];
				const b = params[`${base}_b.level`];
				expect(a, `${p.name}: ${base}'s A leg has a level`).toBeGreaterThan(0);
				expect(b, `${p.name}: ${base}'s B leg has a level`).toBeGreaterThan(0);
				if (a !== b) varied.push(`${p.name}:${base}`);
			}
		}
		expect(mixes, 'the catalogue still has expanded mixes in it').toBeGreaterThanOrEqual(2);
		expect(
			varied.length,
			'at least one MIX is voiced with its legs at different levels'
		).toBeGreaterThan(0);
	});

	/* What these twelve mutations do not catch, recorded here rather than in a
	   report someone has to find.

	   Each was taken from a fresh backup of the engine, run, restored, and the
	   diff confirmed empty before the next. Ten fail something above:

	     patch() back to an unconditional `return {}`      2 fail
	     expandBody a no-op (BODY held back again)          2 fail
	     expandBody drops the dry leg and both wet feeds    6 fail
	     expandMix drops the two cables into its sum        3 fail
	     HELD_BACK never recorded                           1 fail
	     HELD_BACK names a type the catalogue does carry    1 fail
	     missingTypes always empty                          3 fail
	     outgoing BODY cables not moved to the output sum   1 fail
	     expandMix ignores mixA/mixB                        1 fail
	     expandBody's wet legs not halved                   1 fail
	     the bench dropping the derived `advanced` flag     3 fail

	   One survives. Setting `f2 = f1`, so a body's two peaking filters land on
	   the same formant instead of at a ratio of 2.7, changes every affected
	   preset's timbre and nothing here fails. That is honest: the second
	   formant's frequency is a voicing decision, and the only assertion that
	   would catch it is the exact constant this block refuses to write -- these
	   patches are noise-excited and a pinned reading is the one-in-three flake
	   this directory has already been through. A spectral test could see it, but
	   it would be a test of `expandBody`'s arithmetic rather than of the presets,
	   and it belongs beside FILTER's own coverage rather than here.

	   Two of the ten are worth reading twice, because they do not fail the way
	   a mutation usually does. Gutting `patch()` and gutting `expandBody` both
	   *remove* tests -- the per-preset `it` blocks are generated from the presets
	   that emit a graph, so a preset held back has no test to fail, and the run
	   goes green at 60 and 62 rather than red at 70. `is driven off a catalogue
	   that actually has graph presets in it` is the whole defence against that,
	   and it is why this block opens with a count rather than with a render. */

	it('gives each instrument its own envelope rather than one shape for the set', async () => {
		/* The test that the eight are eight instruments.

		   Every assertion above is per-preset, so a bug that replaced every
		   preset's graph with the same working one -- an expander keyed wrongly,
		   a shared object mutated in place -- would pass all of them. What
		   separates these is the shape of the note over time: a struck string
		   decays to silence, a blown pipe holds.

		   Measured over three seconds in twelve slices, as the ratio of the last
		   slice to the loudest:

		     KOTO         0.0443 -> 0.0000   struck, gone by slice 5
		     DULCIMER     0.0421 -> 0.0000   struck
		     PIANO        0.0660 -> 0.0000   struck
		     UPRIGHT BASS 0.0728 -> 0.0000   struck
		     MARIMBA      0.0555 -> 0.0245   struck bar over a held tube
		     DRAWBAR ORGAN 0.1138 -> 0.1287  held
		     PAN FLUTE    0.1679 -> 0.1956   held
		     FLUTE        0.0876 -> 0.0988   held

		   The four struck patches reach *exact* zero, which is the strong claim:
		   a stuck envelope or a latched feedback loop is loud at the end of the
		   render and could not. The three blown ones end within a few percent of
		   where they peaked. MARIMBA sits between the two by construction -- the
		   bar decays, the TUBE under it does not -- and is the reason this is two
		   groups picked by measurement rather than one rule applied to all eight.

		   Both groups have to be non-empty, or a catalogue that lost all its
		   sustained patches would pass by having nothing to check. */
		const tail: Record<string, number> = {};
		for (const p of EMITTING) {
			const r = await render(asTimbre(p), 12, 3);
			tail[p.name] = Math.max(...r.envelope) > 0 ? r.envelope[11] / Math.max(...r.envelope) : -1;
		}
		const decayed = Object.entries(tail).filter(([, v]) => v < 0.05);
		const held = Object.entries(tail).filter(([, v]) => v > 0.5);
		expect(decayed.length, `some preset decays to silence: ${JSON.stringify(tail)}`).toBeGreaterThan(0);
		expect(held.length, `some preset sustains: ${JSON.stringify(tail)}`).toBeGreaterThan(0);
		for (const [name, v] of decayed) expect(v, `${name} decays`).toBeLessThan(0.05);
		for (const [name, v] of held) expect(v, `${name} sustains`).toBeGreaterThan(0.5);
	}, 120000);
});

/* ──────────────────────────────────────────────────────────────────────────
   FREQ -- the three pitch inlets, and the two doors into each

   The same bug has now shipped seven times: an inlet the cable draws to and
   the socket lights for, where nothing arrives. Three of them were pitch, and
   pitch is the one this bench could least easily see -- a note at the wrong
   frequency is exactly as loud as one at the right frequency, so every
   level-shaped assertion in this directory passes on an oscillator stuck at
   its default. Each block below therefore listens through a narrow bandpass at
   the frequency the patch should and should not produce, against a control
   differing by one cable or one knob.

   What is *not* duplicated here: `composite.test.ts` already measures OSC's FM
   sidebands, the zero-depth ergonomics, and a CONST setting the pitch once by
   level. This covers the rest -- the spectral form of "exactly once", the
   TO-SIG route (a DC rather than an oscillator, which is a different thing
   arriving at the same AudioParam), the unwired defaults, and the two inlets
   composite does not touch at all.

   One correction to record, because the measurement contradicted the plan.
   These were to be written with orderings rather than constants, on the
   grounds that EXCT is noise and noise moves run to run. It does not here:
   MODES read 0.0105 / 0.0105 / 0.0105 over three passes of the same patch, to
   four decimals, because the bench's noise buffer is regenerated from a seed
   per render rather than sampled fresh. So these assert constants where the
   readings support constants, and say so.
   ────────────────────────────────────────────────────────────────────────── */

/** TO-SIG's LVL stops at 10, so a DC of more than ten hertz is TO-SIG into a GAIN. */
const dcNodes: Node[] = [
	{ id: 'ts', type: 'tosig' },
	{ id: 'dc', type: 'gain' }
];
const dcInto = (to: string): Cable[] => [
	{ from: 'ts', fromPort: 'out', to: 'dc', toPort: 'in' },
	{ from: 'dc', fromPort: 'out', to: to, toPort: 'pitch' }
];
const dcAt = (hz: number) => ({ 'ts.level': 10, 'dc.level': hz / 10 });

/** A bandpass narrow enough to sit on one partial and hear nothing either side. */
const listenAt = (hz: number, q = 28) => ({ 'bp.type': 2, 'bp.cutoff': hz, 'bp.q': q });

describe('OSC FREQ: the inlet that made FM unsayable', () => {
	/* The fifth time the bug shipped, and the one that cost the most: an
	   oscillator patched into another's FREQ rendered byte-identical to no cable
	   at all, 0.4813 RMS either way, so the entire FM family was undrawable
	   while the socket lit up as though it were working.

	   `composite.test.ts` measures the sidebands that fix bought. What is here
	   is the half a sideband test cannot see -- that the *pitch itself* is
	   right, through each door, which is a spectral question and not a loudness
	   one. A carrier stuck at 220 makes sidebands too. */
	const rig = (gp: Record<string, number>, nodes: Node[] = [], cables: Cable[] = []) =>
		patch(
			[{ id: 'o', type: 'osc' }, { id: 'bp', type: 'filter' }, ...nodes],
			[
				{ from: 'o', fromPort: 'out', to: 'bp', toPort: 'in' },
				{ from: 'bp', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			],
			gp
		);

	it('unwired, holds the 220 the card prints, and nothing above it', async () => {
		/* The default, measured as a place on the spectrum rather than as a level.

		   0.4813 at 220 -- a bare oscillator through a bandpass sitting on its
		   fundamental passes essentially all of it -- against 0.0206 at 330 and
		   0.0115 at 440. A sine has no harmonics, so the two upper readings are
		   the filter's own skirt and not the note, which is what makes them the
		   control: any cable that moved this oscillator would move which of the
		   three is the large one. */
		expect(steady(await render(rig(listenAt(220)), 8, 1))).toBeCloseTo(0.4813, 3);
		expect(steady(await render(rig(listenAt(330)), 8, 1))).toBeCloseTo(0.0206, 3);
		expect(steady(await render(rig(listenAt(440)), 8, 1))).toBeCloseTo(0.0115, 3);
	}, 60000);

	it('a CONST sets the pitch exactly once, which is where doubling would show', async () => {
		/* The failure the engine's old comment was protecting against, asserted
		   spectrally instead of by level.

		   Registering the param while a value also reached it would put the same
		   number through twice and the note would come out an octave sharp --
		   and an octave sharp is *the same loudness*, which is why the existing
		   level-based version of this test in `composite.test.ts` cannot see it
		   and this one can. A CONST of 440 has to be a 440 tone: 0.4813 at 440,
		   and 0.0114 at 880 where a doubled cable would have put the whole note.

		   330 as well as 440, because 440 is also what `masterTuningFreq` is and
		   a pitch arriving by some other accident would most likely be that. */
		const c = (hz: number) => [{ id: 'c', type: 'const' } as Node, constAt('c', 7, hz)] as const;
		const at = async (hz: number, listen: number) => {
			const [node, params] = c(hz);
			return steady(
				await render(
					rig({ ...listenAt(listen), ...params }, [node], [
						{ from: 'c', fromPort: 'out', to: 'o', toPort: 'pitch' }
					]),
					8,
					1
				)
			);
		};
		expect(await at(440, 440)).toBeCloseTo(0.4813, 3);
		expect(await at(440, 880), 'not an octave up, which is what applying it twice gives').toBeCloseTo(0.0114, 3);
		expect(await at(440, 220), 'and not the default it would hold if the cable were dropped').toBeCloseTo(0.0115, 3);
		expect(await at(330, 330)).toBeCloseTo(0.4817, 3);
		expect(await at(330, 660)).toBeCloseTo(0.0114, 3);
		expect(await at(330, 220)).toBeCloseTo(0.0206, 3);
	}, 120000);

	it('a DC signal is hertz of deviation added to the knob, not a replacement', async () => {
		/* The signal route, by the other kind of signal.

		   `composite.test.ts` drives this port with an oscillator, which is FM. A
		   TO-SIG is the same connection carrying a constant, and it is the one
		   that reads the port's *arithmetic* rather than its spectrum: the knob
		   is the centre and the signal is the excursion, so a knob of 220 under
		   a DC of 110 has to sound at 330 and not at 110, 220 or 440.

		   Measured 0.4820 at 330 against 0.0206 at 220 and 0.0294 at 440. If
		   `pitch` were missing from OSC's `mod` map the 220 reading would be the
		   large one; if the knob were zeroed the way a claimed knob normally is,
		   the note would sit at 110 and all three would be small.

		   The second row moves both numbers so the first cannot pass by the knob
		   alone happening to land right: 330 under a DC of 330 is an octave up at
		   660. */
		const at = async (knob: number, dc: number, listen: number) =>
			steady(
				await render(
					rig({ ...listenAt(listen), 'o.pitch': knob, ...dcAt(dc) }, dcNodes, dcInto('o')),
					8,
					1
				)
			);
		expect(await at(220, 110, 330), 'the knob plus the signal').toBeCloseTo(0.482, 3);
		expect(await at(220, 110, 220), 'not the knob alone').toBeCloseTo(0.0206, 3);
		expect(await at(220, 110, 440), 'and not the knob doubled').toBeCloseTo(0.0294, 3);
		expect(await at(330, 330, 660)).toBeCloseTo(0.4813, 3);
		expect(await at(330, 330, 330), 'not the knob alone').toBeCloseTo(0.0114, 3);
	}, 120000);
});

describe('PWM FREQ: the square wave that could not be played', () => {
	/* The sixth time, and the narrowest escape: PWM is the only square-wave
	   source in the catalogue, its FREQ was read as a value and nothing else,
	   and a CONST of 110 and one of 880 both rendered 0.1726 -- the same reading
	   as no cable. An oscillator that cannot be tuned by patch is one an
	   instrument cannot use.

	   PWM has no knobs at all (`params: []`), so unlike OSC there is no centre
	   for a signal to deviate from. That turns out to matter, and the last test
	   in this block is where. */
	const rig = (gp: Record<string, number>, nodes: Node[] = [], cables: Cable[] = []) =>
		patch(
			[
				{ id: 'w', type: 'pwm' },
				{ id: 'bp', type: 'filter' },
				{ id: 'lim', type: 'gain' },
				...nodes
			],
			[
				{ from: 'w', fromPort: 'out', to: 'bp', toPort: 'in' },
				{ from: 'bp', fromPort: 'out', to: 'lim', toPort: 'in' },
				{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			],
			{ 'lim.level': LIM, ...gp }
		);
	/** No bandpass: the broadband reading, for the tests about the width. */
	const plain = (gp: Record<string, number>, nodes: Node[] = [], cables: Cable[] = []) =>
		patch(
			[{ id: 'w', type: 'pwm' }, { id: 'lim', type: 'gain' }, ...nodes],
			[
				{ from: 'w', fromPort: 'out', to: 'lim', toPort: 'in' },
				{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			],
			{ 'lim.level': LIM, ...gp }
		);
	const constRig = (hz: number, listen: number) =>
		rig({ ...listenAt(listen, 25), ...constAt('c', 7, hz) }, [{ id: 'c', type: 'const' }], [
			{ from: 'c', fromPort: 'out', to: 'w', toPort: 'pitch' }
		]);

	it('unwired, holds the 220 the engine falls back to', async () => {
		/* 0.1560 at 220 against 0.0049 at both 440 and 880. A square *does* have
		   harmonics, unlike the sine above, so the two upper readings are real
		   partials rather than filter skirt -- and they are thirty times smaller
		   than the fundamental, which is what makes the 220 reading identifiable
		   as the note rather than as "some energy is present". */
		expect(steady(await render(rig(listenAt(220, 25)), 8, 1))).toBeCloseTo(0.156, 3);
		expect(steady(await render(rig(listenAt(440, 25)), 8, 1))).toBeCloseTo(0.0049, 3);
		expect(steady(await render(rig(listenAt(880, 25)), 8, 1))).toBeCloseTo(0.0049, 3);
	}, 60000);

	it('a CONST tunes it, at four pitches, each heard where it belongs', async () => {
		/* The value route and the regression in one table. Before the fix every
		   row of this read 0.1726, because the cable was not there.

		   Each pitch reads 0.1560 at its own fundamental and 0.0049 an octave up
		   -- the same pair of numbers at every tuning, which is the strong form:
		   the pulse is not merely louder somewhere, it is the *same wave* moved.
		   A hundredfold either way between the diagonal and the off-diagonal.

		   Four rather than two, because two could be a cable that happens to
		   invert or to double: 275, 330, 440 and 880 are not multiples of one
		   another in a way that a single wrong arithmetic could satisfy. */
		for (const hz of [275, 330, 440, 880]) {
			expect(steady(await render(constRig(hz, hz), 8, 1)), `${hz} sounds at ${hz}`).toBeCloseTo(0.156, 2);
			expect(
				steady(await render(constRig(hz, hz * 2), 8, 1)),
				`${hz} does not sound at ${hz * 2}`
			).toBeLessThan(0.02);
		}
		// And the cross-check the 2x2 was written for: 880 is silent where 220 sings.
		expect(steady(await render(constRig(880, 220), 8, 1))).toBeLessThan(0.01);
		expect(steady(await render(constRig(220, 880), 8, 1))).toBeLessThan(0.01);
	}, 180000);

	it('a DC signal moves both saws together, so the pulse stays a pulse', async () => {
		/* The signal route. The pulse is the *difference* of two sawtooths, so a
		   cable reaching one and not the other would not detune the note -- it
		   would destroy the waveform, and the two saws would beat against each
		   other instead of subtracting to a rectangle. Both take the signal for
		   that reason, and this is the test that they do.

		   PWM has no FREQ knob, so `cvIn` hands back the 220 fallback and a DC of
		   110 sounds at 330: 0.1102 at 330 against 0.0781 at 660. That second
		   number is much larger than the 0.0049 the value route gives an octave
		   up, and it is not noise -- it is the duty cycle being wrong, which the
		   next test is about. The ordering is what is asserted, plus that the
		   fundamental landed where the sum says. */
		const at = async (dc: number, listen: number) =>
			steady(
				await render(rig({ ...listenAt(listen, 25), ...dcAt(dc) }, dcNodes, dcInto('w')), 8, 1)
			);
		expect(await at(110, 330), 'sounds at 220 + 110').toBeCloseTo(0.1102, 2);
		expect(await at(330, 550), 'sounds at 220 + 330').toBeCloseTo(0.1102, 2);
		expect(await at(55, 275), 'sounds at 220 + 55').toBeCloseTo(0.1442, 2);
		// Each is well clear of its own octave, so the fundamental is the fundamental.
		expect(await at(110, 330)).toBeGreaterThan(await at(110, 660));
		expect(await at(55, 275)).toBeGreaterThan(await at(55, 550));
		// And a DC of zero is the unwired reading back again: the cable adds nothing.
		expect(await at(0, 220), 'a DC of zero leaves the default alone').toBeCloseTo(0.156, 2);
	}, 180000);

	it('pins the duty limit the engine names: a modulated FREQ drifts the width', async () => {
		/* The known limitation, measured rather than claimed -- and it is worse
		   than the engine comment suggests, which is the reason this test exists
		   in the form it does rather than as a paragraph nobody checks.

		   `period` is `1 / pulseRoot` computed at build time, and `pulseRoot` is
		   the *value* on the inlet -- 220, since PWM has no knob and a signal
		   leaves `cvIn` on its fallback. So the delay is pinned at `0.5 / 220`
		   seconds however far the signal moves the saws. At a DC of +220 the saws
		   run at 440 and that delay is 1/440 s, which is one whole period: the
		   two sawtooths line up exactly and subtract to *silence*. Measured
		   0.0036 broadband, against 0.1721 for the same 440 Hz pulse reached as a
		   value. That is not a drifting duty cycle, it is a null.

		   Proven to be the width and not the pitch by moving PW underneath it. At
		   a DC of +220 the sweep reads 0.1373 / 0.1721 / 0.0036 / 0.1718 / 0.1368
		   across widths 0.1 / 0.25 / 0.5 / 0.75 / 0.9 -- a hole in the middle,
		   where a value-tuned 440 reads 0.1024 / 0.1489 / 0.1721 / 0.1486 / 0.1018
		   and is loudest in the middle. The curve is inverted, which is exactly
		   what a delay of a fixed number of seconds does to a wave whose period
		   has halved: a width of 0.5 becomes a width of 1.0.

		   This is asserted, not apologised for. If someone makes `delayTime`
		   follow the pitch -- a reciprocal is not a Web Audio node, but a
		   `setValueCurveAtTime` over a known sweep would do it -- this test goes
		   red and should, and the comment above says what the new numbers ought
		   to be. An honest pinned limit is worth more than a missing test. */
		const sweep = async (build: (w: number) => Record<string, unknown>) => {
			const out: number[] = [];
			for (const w of [0.1, 0.25, 0.5, 0.75, 0.9])
				out.push(steady(await render(build(w) as Record<string, unknown>, 8, 1)));
			return out;
		};
		const signalSweep = await sweep((w) =>
			plain({ ...dcAt(220), ...constAt('cw', 6, w) }, [...dcNodes, { id: 'cw', type: 'const' }], [
				...dcInto('w'),
				{ from: 'cw', fromPort: 'out', to: 'w', toPort: 'pw' }
			])
		);
		const valueSweep = await sweep((w) =>
			plain(
				{ ...constAt('c', 7, 440), ...constAt('cw', 6, w) },
				[
					{ id: 'c', type: 'const' },
					{ id: 'cw', type: 'const' }
				],
				[
					{ from: 'c', fromPort: 'out', to: 'w', toPort: 'pitch' },
					{ from: 'cw', fromPort: 'out', to: 'w', toPort: 'pw' }
				]
			)
		);
		/* A value-tuned pulse is loudest at a square and quietest at the edges,
		   which is what a duty cycle that followed its pitch would always do. */
		expect(valueSweep[2], `value sweep ${valueSweep}`).toBeGreaterThan(valueSweep[1]);
		expect(valueSweep[1]).toBeGreaterThan(valueSweep[0]);
		expect(valueSweep[2]).toBeGreaterThan(valueSweep[3]);
		expect(valueSweep[3]).toBeGreaterThan(valueSweep[4]);
		/* The signal-tuned one is inverted: a hole where the square should be.
		   This is the limitation. It is not subtle -- fifty times down. */
		expect(signalSweep[2], `signal sweep ${signalSweep}`).toBeLessThan(0.01);
		expect(signalSweep[1]).toBeGreaterThan(signalSweep[2] * 20);
		expect(signalSweep[3]).toBeGreaterThan(signalSweep[2] * 20);
		/* And the same 440 Hz pulse, reached the two ways, is not the same sound.
		   The engine comment says the width moves with the pitch; this is by how
		   much. */
		expect(valueSweep[2] / signalSweep[2], 'a value-tuned 440 against a signal-tuned one').toBeGreaterThan(20);
	}, 180000);
});

describe('MODES FREQ: the resonator with no way to be tuned', () => {
	/* The seventh, and the only one of the three where the socket did not exist
	   at all rather than being wired to nothing. MODES was the one resonator
	   that could not be tuned by patch: STRING and TUBE both take a FREQ cable,
	   a modal bank is the same kind of thing, and it had none.

	   Underneath it was a second defect that made the inlet unreachable even
	   once declared. The engine read `modeHz > 0 ? modeHz : baseFreq`, and
	   BASE's minimum is 20 -- so the fallback branch could not be reached from
	   the UI at all and the knob always won. `pitchWired` is what tells the two
	   apart now: a cable beats the field, which is the precedence every other
	   module uses.

	   Every reading in this block is a constant to four decimals over three
	   passes, despite EXCT being a noise burst, because the bench regenerates
	   its noise buffer from a seed per render. */
	const rig = (gp: Record<string, number>, nodes: Node[] = [], cables: Cable[] = []) =>
		patch(
			[
				{ id: 'x', type: 'excite' },
				{ id: 'm', type: 'modes' },
				{ id: 'bp', type: 'filter' },
				{ id: 'lim', type: 'gain' },
				...nodes
			],
			[
				{ from: 'x', fromPort: 'out', to: 'm', toPort: 'in' },
				{ from: 'm', fromPort: 'out', to: 'bp', toPort: 'in' },
				{ from: 'bp', fromPort: 'out', to: 'lim', toPort: 'in' },
				{ from: 'lim', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			],
			{ 'lim.level': LIM, ...gp }
		);
	/* Slice 2 of a *one* second render, which is `steady`'s slice on a shorter
	   note, and the choice is load-bearing rather than incidental.

	   A struck modal bar is a decay, not a sustain, and this one is a fast decay:
	   over two seconds in eight slices the envelope reads 0.0363 / 0.0077 /
	   0.0007 / 0.0001 and then four zeroes, so slice 2 lands in the tail where
	   BASE 200 and a cable at 800 are 0.0007 against 0.0004 and every comparison
	   below collapses into rounding. Over one second the same slice is 0.0105
	   against 0.0069, with the off-diagonal at 0.0001 -- a hundredfold, and
	   stable to four decimals.

	   Found by writing the whole block against a two-second render and watching
	   five tests fail at once on numbers that were all very nearly zero. Worth
	   the paragraph: a window that samples a decayed note is the shape of test
	   that passes on a defect rather than the shape that fails on a fix. */
	const heard = async (t: Record<string, unknown>) => (await render(t, 8, 1)).envelope[2];
	const constRig = (hz: number, listen: number, base = 200) =>
		rig({ ...listenAt(listen, 25), 'm.modeHz': base, ...constAt('c', 7, hz) }, [{ id: 'c', type: 'const' }], [
			{ from: 'c', fromPort: 'out', to: 'm', toPort: 'pitch' }
		]);

	it('declares the FREQ inlet its two sibling resonators have', async () => {
		/* The catalogue half, which no render can see: an inlet that is not in
		   the spec cannot be cabled, and a test that only measures sound would
		   pass on a MODES whose socket had been quietly removed -- it would fall
		   back to BASE and still ring.

		   Asserted against STRING and TUBE rather than as a literal, because what
		   is being claimed is that the three resonators agree. A fourth added
		   tomorrow is covered by the same line. */
		const pitchOf = (id: string) =>
			MODULE_SPECS.find((s) => s.id === id)?.inputs.find((i) => i.id === 'pitch');
		for (const id of ['string', 'tube', 'modes']) {
			const port = pitchOf(id);
			expect(port, `${id} declares a FREQ inlet`).toBeTruthy();
			expect(port?.label, `${id}'s is labelled FREQ`).toBe('FREQ');
			expect(port?.kind, `${id}'s is a mod inlet`).toBe('mod');
			expect(port?.role, `${id}'s carries hertz`).toBe('hz');
		}
	});

	it('unwired, the body is pinned by BASE and follows it', async () => {
		/* The documented default, and the behaviour every shipped patch relies
		   on: MODES with nothing in its FREQ is an untuned drum at whatever BASE
		   says. Adding an inlet must not change that, which is the regression a
		   new socket most easily causes.

		   Read on the diagonal at three settings -- 0.0105 at 200, 0.0079 at 400,
		   0.0069 at 800 -- and off it at 0.0002 and 0.0001, which is fifty times
		   down. The diagonal falls gently as BASE rises because a fixed-Q bandpass
		   at a higher centre is a wider one and the modal peak fills less of it;
		   that is the filter, not the bank. */
		expect(await heard(rig({ ...listenAt(200, 25), 'm.modeHz': 200 }))).toBeCloseTo(0.0105, 4);
		expect(await heard(rig({ ...listenAt(400, 25), 'm.modeHz': 400 }))).toBeCloseTo(0.0079, 4);
		expect(await heard(rig({ ...listenAt(800, 25), 'm.modeHz': 800 }))).toBeCloseTo(0.0069, 4);
		expect(await heard(rig({ ...listenAt(200, 25), 'm.modeHz': 400 }))).toBeCloseTo(0.0002, 4);
		expect(await heard(rig({ ...listenAt(200, 25), 'm.modeHz': 800 }))).toBeCloseTo(0.0001, 4);
	}, 120000);

	it('a CONST beats BASE, in both directions, which is what was inert', async () => {
		/* The fix, as a 2x2 in which every cell is the opposite of the one the
		   old engine gave. Before it, the cable was inert and BASE won every
		   time: a FREQ of 800 against a BASE of 200 read 0.0488 at 800 where the
		   same number typed into the knob read 0.2893.

		   BASE 200 with a cable at 800 reads 0.0069 at 800 and 0.0001 at 200 --
		   which is BASE 800's own unwired reading, to four decimals, at both
		   frequencies. The cable did not shade the knob, it replaced it.

		   And the reverse, because a fix that always preferred the cable's
		   *larger* number would pass the first half: BASE 800 with a cable at 200
		   reads 0.0105 at 200 and 0.0001 at 800, which is BASE 200's unwired
		   pair. Each direction lands exactly on the other's default. */
		expect(await heard(constRig(800, 800, 200)), 'the cable wins').toBeCloseTo(0.0069, 4);
		expect(await heard(constRig(800, 200, 200)), 'BASE does not').toBeCloseTo(0.0001, 4);
		expect(await heard(constRig(200, 200, 800)), 'and downwards too').toBeCloseTo(0.0105, 4);
		expect(await heard(constRig(200, 800, 800))).toBeCloseTo(0.0001, 4);
	}, 120000);

	it('moves the whole bank, not just its fundamental', async () => {
		/* A modal bank is three biquads at ratios 1, 2.4 and 4.1 off one root, so
		   a FREQ that only reached the first would still pass every assertion
		   above -- and would turn a bar into a bar plus two strangers.

		   Heard at the second mode. BASE 200 unwired puts it at 480 and reads
		   0.0009 there against 0.0000 at 1920; a cable at 800 puts it at 1920 and
		   reads 0.0007 there against 0.0002 at 480. Both readings are small,
		   because the second mode carries far less energy than the first, so what
		   is asserted is that each pair swaps its ordering -- which is the whole
		   claim and is robust to the levels. */
		const unwired480 = await heard(rig({ ...listenAt(480, 25), 'm.modeHz': 200 }));
		const unwired1920 = await heard(rig({ ...listenAt(1920, 25), 'm.modeHz': 200 }));
		const wired480 = await heard(constRig(800, 480, 200));
		const wired1920 = await heard(constRig(800, 1920, 200));
		expect(unwired480, `unwired second mode: ${unwired480} at 480, ${unwired1920} at 1920`).toBeGreaterThan(unwired1920);
		expect(wired1920, `wired second mode: ${wired480} at 480, ${wired1920} at 1920`).toBeGreaterThan(wired480);
		expect(unwired480).toBeGreaterThan(wired480);
		expect(wired1920).toBeGreaterThan(unwired1920);
	}, 120000);

	it('takes any pure node, not only a CONST', async () => {
		/* The value route is a family and not one card: ADD, MUL, CLAMP and MAP
		   all resolve to a number before the graph is built, and a fix that
			 special-cased CONST would pass every test above. ADD of 500 and 300 has
		   to be indistinguishable from a CONST of 800 -- measured 0.0069 at 800
		   and 0.0001 at 200, which is that CONST's pair exactly.

		   This is also the closest thing MODES has to key-tracking, and the
		   reason the obvious version does not work is recorded in the block
		   below. */
		const addRig = (listen: number) =>
			rig({ ...listenAt(listen, 25), 'm.modeHz': 200, 'ad.a': 500, 'ad.b': 300 }, [{ id: 'ad', type: 'add' }], [
				{ from: 'ad', fromPort: 'out', to: 'm', toPort: 'pitch' }
			]);
		expect(await heard(addRig(800))).toBeCloseTo(0.0069, 4);
		expect(await heard(addRig(200))).toBeCloseTo(0.0001, 4);
	}, 60000);

	it('takes a signal, and tunes the bank exactly as a value does', async () => {
		/* This was the honest half of the resonators' story: MODES, STRING and
		   TUBE registered nothing for PITCH, because a modal bank was three
		   biquads and three oscillators whose frequencies were assigned once when
		   the voice was built. A DC of 800 into MODES' FREQ read BASE's own
		   unwired pair, and the test said that if audio-rate modal tuning were
		   ever built it would go red and this comment would be the spec.

		   It was built: the resonators run in the live-DSP worklet, and pitch is
		   a parameter the bank re-tunes from every render block. So the signal
		   route now has to land exactly where the value route does -- the same
		   800 through TO-SIG as through a CONST, heard at 800 and at 200. */
		const sigRig = (listen: number) =>
			rig({ ...listenAt(listen, 25), 'm.modeHz': 200, ...dcAt(800) }, dcNodes, dcInto('m'));
		const bySignal800 = await heard(sigRig(800));
		const bySignal200 = await heard(sigRig(200));
		const byValue800 = await heard(constRig(800, 800));
		const byValue200 = await heard(constRig(800, 200));
		expect(bySignal800, 'the signal did not move the body to 800').toBeGreaterThan(bySignal200);
		expect(Math.abs(bySignal800 - byValue800)).toBeLessThan(0.1 * byValue800);
		expect(Math.abs(bySignal200 - byValue200)).toBeLessThan(0.0005);
		/* The catalogue half: nothing on a resonator is marked read-once any
		   more, except TUBE's odd-only switch, which is a selector. */
		for (const id of ['string', 'tube', 'modes'])
			for (const p of MODULE_SPECS.find((s) => s.id === id)?.params ?? [])
				expect(!!p.fixed, `${id}.${p.key}`).toBe(p.key === 'tubeOdd');
	}, 60000);
});

/* ENTRY's PITCH does not key-track a FREQ inlet, and that is a unit mismatch
   rather than one of these three bugs.

   Written down here because it was the obvious fourth test in each block above
   and every version of it measured near-silence, which looked exactly like the
   defect this file is about. It is not. ENTRY's `pitch` outlet publishes
   `12 * log2(baseFreq / masterTuningFreq)` -- *semitones from the master
   tuning*, not hertz -- so at the bench's note 40 it hands out roughly 1.0,
   confirmed by putting it on a GAIN's level and reading 0.4814, which is a
   unity gain. Cabled into a FREQ socket it asks for a one-hertz oscillator.

   Measured, an OSC key-tracked that way reads 0.0023 at 40 Hz and falls
   monotonically to 0.0003 at 330: there is no partial anywhere, it is a DC-ish
   rumble. MODES and PWM the same.

   That is a real ergonomic gap -- both sockets are `hz`-roled and the cable
   draws -- but it is a *conversion* missing between two working ports, not a
   modulation that fails to arrive, and it is the same for every `hz` inlet in
   the catalogue including FILTER's cutoff, which has shipped and been measured
   for months. Fixing it belongs with the role lattice rather than here, and
   pinning the broken numbers would make this file assert that it stays broken.
   So it is reported instead. The key-tracking that *does* work is a MUL or a
   MAP on the cable turning semitones into hertz, and `audio.test.ts` covers
   that shape already at `entry.pitch -> f.a`. */

/* ──────────────────────────────────────────────────────────────────────────
   OSC PHS as a *moving* offset: two routes, exactly one of them per cable

   The block above measures PHS as a value, which is what it was: a rotation
   baked into the wave table when the note was built, so a cable carrying a
   signal into it did nothing at all. The engine's own comment said that was
   unavoidable -- "a delay is not one either: a fixed delay is a different phase
   at every frequency, so it would drift as soon as the note changed pitch".

   A *fixed* delay, yes. One scaled by the note's own period is not: half a turn
   is `0.5 / f` seconds, and that is a half turn at every f. So there are now two
   mechanisms on this inlet, the same shape FREQ already has:

     a value (CONST, ADD, any pure node) keeps the wave table, which is exact;
     a signal (TO-SIG, TO-CV, an oscillator) takes a DelayNode of `period *
     turns`, which can move and costs a startup transient while the line fills.

   What is asserted here is the *seam*. Three things can go wrong with two
   mechanisms and only one of them is "the new path does not work":

     both run, and half a turn plus half a turn is a whole turn -- no shift at
     all, which is the bug the first draft shipped and read 0.8306 where silence
     was expected;
     only the delay runs, and the exact cancellation the wave table gives up
     becomes a 0.1966 transient that no test asserting `toBeCloseTo` would
     notice;
     only the table runs, and the cable is inert again, which is the defect this
     whole file exists to catch.

   Every number below is a real reading from this bench. Sine throughout, and
   that is deliberate -- see the shape note at the end of the block, which
   records a pre-existing mismatch these tests would otherwise be blamed for.
   ────────────────────────────────────────────────────────────────────────── */
describe('OSC PHS: a value rotates the table, a signal delays the line', () => {
	/* The same summed pair the block above uses, because phase is only audible
	   relationally: one oscillator sounds identical at every offset, and it is
	   the second one arriving early or late against the first that makes a
	   number out of it. */
	const twoOsc = (
		gp: Record<string, number>,
		nodes: Node[] = [],
		cables: Cable[] = [],
		waves: Record<string, string> = {}
	) => ({
		...patch(
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
		),
		graphWaves: waves
	});

	/** PHS driven by a number: a CONST, which resolves before the graph exists. */
	const byValue = (turns: number) =>
		twoOsc({ ...constAt('c', 6, turns) }, [{ id: 'c', type: 'const' }], [
			{ from: 'c', fromPort: 'out', to: 'o2', toPort: 'phase' }
		]);
	/* PHS driven by a signal: a TO-SIG holding a DC level, which is the smallest
	   thing that is genuinely a signal rather than a number. An oscillator would
	   also do it and is used further down, but a DC isolates "this went through
	   the delay" from "this moved", which are two separate claims. */
	const bySignal = (turns: number) =>
		twoOsc({ 'ts.level': turns }, [{ id: 'ts', type: 'tosig' }], [
			{ from: 'ts', fromPort: 'out', to: 'o2', toPort: 'phase' }
		]);
	/** Slice 8 of sixteen over two seconds: a full second after the note starts. */
	const tail = async (t: Record<string, unknown>) => (await render(t, 16, 2)).envelope[8];

	it('a value still cancels to exact zero, which the delay cannot do', async () => {
		/* The claim most at risk, and the reason both routes are kept rather than
		   the obvious simplification of using the delay for everything.

		   A wave table rotated half a turn is the *same samples* negated, so the
		   pair sums to zero in exact arithmetic and the render carries no sample
		   of any size anywhere: peak 0, not 0.0001, not a transient in slice 0. A
		   delay line cannot make that claim -- it starts empty, so the first
		   period of the second oscillator has nothing to cancel against, and the
		   measured signal route leaves 0.1966 of peak behind while it fills.

		   `toBe(0)` rather than a tolerance, because a tolerance is exactly what
		   a delay-for-everything rewrite would pass: 0.1966 is a twelfth of the
		   0.8337 the unwired pair peaks at, which reads as "very nearly silent"
		   to any assertion written with `toBeCloseTo`. Only the equality sees the
		   difference between the two mechanisms. */
		const together = await render(twoOsc({}), 16, 2);
		const cancelled = await render(byValue(0.5), 16, 2);
		const delayed = await render(bySignal(0.5), 16, 2);
		expect(together.peak).toBeCloseTo(0.8337, 3);
		expect(
			cancelled.peak,
			`the value route must be exact, got ${JSON.stringify(cancelled.envelope)}`
		).toBe(0);
		// And the signal route, at the same offset, demonstrably is not.
		expect(delayed.peak).toBeCloseTo(0.1966, 3);
		expect(delayed.peak).toBeGreaterThan(0);
	}, 60000);

	it('a signal cancels too, after the line has filled', async () => {
		/* The other half: the delay route is not merely "different", it arrives
		   at the same place. A TO-SIG holding 0.5 puts the second oscillator half
		   a period late and from the moment the line is full the sum is silent --
		   slices 1 through 15 of a two-second render all read exactly 0.0000,
		   against 0.5871 for the same patch at an offset of zero.

		   The transient is real and is confined to the first slice: at 64 slices
		   over one second only 19 of them carry anything at all, and the largest
		   is 0.0530 in slice 1. That is the delay line filling at 220 Hz, which
		   takes one period -- four and a half milliseconds, a third of a slice.

		   Asserted on the tail rather than on `peak`, because `peak` is a
		   whole-render maximum and the transient lives inside it: a test reading
		   peak alone cannot tell a cancelling delay from one that never cancels. */
		const moved = await render(bySignal(0.5), 16, 2);
		const flat = await render(bySignal(0), 16, 2);
		expect(moved.envelope.slice(1).every((v) => v === 0), `${JSON.stringify(moved.envelope)}`).toBe(true);
		expect(flat.envelope[8]).toBeCloseTo(0.5871, 3);
		// The cable did something: a signal of zero turns is the unwired reading.
		expect(await tail(twoOsc({}))).toBeCloseTo(0.5871, 3);
	}, 60000);

	it('the two routes agree on a static offset, which is where doubling shows', async () => {
		/* The specific regression this pins, and the one the first draft shipped.

		   When both mechanisms ran, the table rotated by the offset *and* the
		   delay shifted by it again -- and at half a turn each that sums to a full
		   turn, which is no shift at all. The pair that should have been silent
		   read 0.8306, indistinguishable from no cable. The failure is invisible
		   at every offset except through this comparison: a doubled 0.25 is 0.5,
		   which cancels, so a test that only checked "the quarter turn does
		   something" would have passed on it.

		   So the assertion is the whole curve, both doors, seven offsets. Measured
		   at 220 Hz on a two-second render, slice 8:

		     turns   0.1     0.25    0.4     0.5   0.6     0.75    0.9
		     CONST   0.5848  0.5706  0.2974  0     0.2974  0.5706  0.5850
		     TO-SIG  0.5848  0.5706  0.2974  0     0.2974  0.5706  0.5850

		   Identical to four decimals at every one, and the shape is right: a
		   cosine-shaped fall to silence at half a turn and back, symmetric about
		   it. If either route ever applied the offset twice, its column would be
		   the *other* column read at double the angle -- 0.25 would fall to zero
		   and 0.5 would rise back to 0.5871 -- and the two would disagree at every
		   entry except 0.5 and the ends.

		   0.9 rather than a second reading at 0.1 because a route that had the
		   sign of the rotation backwards would be symmetric about zero and pass
		   everything else here. */
		for (const [turns, expected] of [
			[0.1, 0.5848],
			[0.25, 0.5706],
			[0.4, 0.2974],
			[0.6, 0.2974],
			[0.75, 0.5706],
			[0.9, 0.585]
		] as const) {
			const v = await tail(byValue(turns));
			const s = await tail(bySignal(turns));
			expect(v, `CONST at ${turns} turns`).toBeCloseTo(expected, 3);
			expect(s, `TO-SIG at ${turns} turns read ${s} against the value route's ${v}`).toBeCloseTo(
				expected,
				3
			);
		}
		/* And half a turn, where the two routes are allowed to differ in *peak*
		   but not in where they settle. Both tails are zero; only the value route
		   is zero everywhere. */
		expect(await tail(byValue(0.5))).toBe(0);
		expect(await tail(bySignal(0.5))).toBe(0);
	}, 180000);

	it('routes by what is on the cable, not by which card is on the far end', async () => {
		/* `wiredPorts` exists because `cvIn` cannot answer this question: it
		   returns the fallback for a signal source, so a port an oscillator feeds
		   looks unwired to it. "Wired, and no number came down it" is what
		   identifies a signal, and this is the test that the two halves of that
		   are both load-bearing.

		   ADD is a pure node -- it resolves to a number before the graph is built
		   -- so ADD of 0.25 and 0.25 has to be the CONST of 0.5 exactly: peak 0,
		   the wave table. The value route is a family, and an implementation that
		   special-cased `type === 'const'` would pass every other test in this
		   block.

		   TO-CV is the mirror image and the more interesting one. It sits between
		   a signal and a value, and what matters is that it behaves as whatever
		   it actually hands over: a TO-SIG through a TO-CV into PHS reads 0.1966
		   peak with a zero tail, which is the *signal* route's pair of numbers to
		   four decimals. So the routing follows the cable and not the card. */
		const added = await render(
			twoOsc({ 'ad.a': 0.25, 'ad.b': 0.25 }, [{ id: 'ad', type: 'add' }], [
				{ from: 'ad', fromPort: 'out', to: 'o2', toPort: 'phase' }
			]),
			16,
			2
		);
		expect(added.peak, 'a pure node takes the exact route').toBe(0);

		const viaCv = await render(
			twoOsc({ 'ts.level': 0.5 }, [{ id: 'ts', type: 'tosig' }, { id: 'tc', type: 'tocv' }], [
				{ from: 'ts', fromPort: 'out', to: 'tc', toPort: 'in' },
				{ from: 'tc', fromPort: 'out', to: 'o2', toPort: 'phase' }
			]),
			16,
			2
		);
		expect(viaCv.peak, 'a signal takes the delay, transient and all').toBeCloseTo(0.1966, 3);
		expect(viaCv.envelope[8]).toBe(0);
	}, 90000);

	it('holds the same offset at every pitch, which a fixed delay would not', async () => {
		/* The claim the old comment denied, measured where it said the idea would
		   fall over: "a fixed delay is a different phase at every frequency, so it
		   would drift as soon as the note changed pitch".

		   It is not a fixed delay. `period = 1 / osc.frequency.value` is read from
		   the oscillator this note actually plays, so half a turn is `0.5 / f`
		   seconds and is half a turn at all of them. Across five octaves, the tail
		   of a half-turn pair against the same pair unshifted:

		     Hz     110     220     440     880     1760
		     half   0       0       0.0001  0.0002  0.0038
		     flat   0.5919  0.5871  0.5833  0.5812  0.5788

		   The residue climbing with frequency is the delay line's linear
		   interpolation: `delayTime` is quantised to the sample grid, and at 1760
		   Hz one period is twenty-five samples, so half of one is twelve and a
		   half and the half-sample is what is left over. At 110 Hz a period is
		   four hundred samples and there is nothing left at all. A *fixed* delay
		   would not degrade gently like this -- it would be right at one frequency
		   and arbitrary at the other four, which at 0.5 turns means the 110 Hz
		   entry cancelling and the 1760 entry reading the full 0.58.

		   0.02 is the tolerance rather than the readings themselves, because what
		   is being claimed is "cancelled at every octave" and 0.0038 against
		   0.5788 is a factor of 150. Pinning 0.0038 exactly would make this a test
		   about the interpolator. */
		const atPitch = (hz: number, turns: number) =>
			({
				...patch(
					[
						{ id: 'o1', type: 'osc' },
						{ id: 'o2', type: 'osc' },
						{ id: 's', type: 'sum' },
						{ id: 'cp', type: 'const' },
						{ id: 'ts', type: 'tosig' }
					],
					[
						{ from: 'cp', fromPort: 'out', to: 'o1', toPort: 'pitch' },
						{ from: 'cp', fromPort: 'out', to: 'o2', toPort: 'pitch' },
						{ from: 'o1', fromPort: 'out', to: 's', toPort: 'in' },
						{ from: 'o2', fromPort: 'out', to: 's', toPort: 'in' },
						{ from: 's', fromPort: 'out', to: 'output', toPort: 'in' },
						{ from: 'ts', fromPort: 'out', to: 'o2', toPort: 'phase' }
					],
					{ ...constAt('cp', 7, hz), 'ts.level': turns }
				),
				graphWaves: {}
			}) as Record<string, unknown>;

		for (const hz of [110, 220, 440, 880, 1760]) {
			const half = await tail(atPitch(hz, 0.5));
			const flat = await tail(atPitch(hz, 0));
			expect(flat, `${hz} Hz unshifted`).toBeGreaterThan(0.55);
			expect(half, `${hz} Hz half-turn tail ${half} against ${flat}`).toBeLessThan(0.02);
		}
	}, 180000);

	it('an LFO sweeps it, which is the whole point of the delay route', async () => {
		/* `delayTime` is an a-rate AudioParam, so a cable on it sums per sample
		   rather than per block and the phase slides continuously through the
		   note. That is what the wave table cannot do at any price: a table is
		   chosen when the voice is built and is the same table until the key
		   lifts.

		   An oscillator at 3 Hz on the second one's PHS, through a GAIN that sets
		   the depth in turns, against the identical patch at depth 0. Sixteen
		   slices over two seconds, and what is read is the *spread* -- the
		   loudest slice minus the quietest -- because a swept phase is a patch
		   whose level moves and a patch whose level moves is one that measures
		   differently in different slices:

		     depth   0       0.25    0.5
		     spread  0.1171  0.1623  0.3807
		     min     0.4701  0.4254  0.2065

		   The 0.1171 floor is not the LFO: it is slice 0 catching the note's
		   attack, which every render in this file has. Every other slice at depth
		   0 reads 0.5871 or 0.5872, so the unmodulated patch is flat to four
		   decimals and the spread is entirely the first slice.

		   At depth 0.5 the quietest slice falls to 0.2065, which is well under
		   half the unmodulated level, and that is the assertion: the pair is
		   being swept in and out of cancellation three times a second. Ordering
		   rather than constants for the spreads, since the number depends on
		   where the slice boundaries land against a 3 Hz cycle -- but each depth
		   has to spread more than the one below it, and the deepest has to reach
		   a slice quieter than anything an unmodulated pair produces. */
		const lfo = (depth: number) =>
			({
				...patch(
					[
						{ id: 'o1', type: 'osc' },
						{ id: 'o2', type: 'osc' },
						{ id: 's', type: 'sum' },
						{ id: 'lf', type: 'osc' },
						{ id: 'cl', type: 'const' },
						{ id: 'dp', type: 'gain' }
					],
					[
						{ from: 'cl', fromPort: 'out', to: 'lf', toPort: 'pitch' },
						{ from: 'lf', fromPort: 'out', to: 'dp', toPort: 'in' },
						{ from: 'dp', fromPort: 'out', to: 'o2', toPort: 'phase' },
						{ from: 'o1', fromPort: 'out', to: 's', toPort: 'in' },
						{ from: 'o2', fromPort: 'out', to: 's', toPort: 'in' },
						{ from: 's', fromPort: 'out', to: 'output', toPort: 'in' }
					],
					{ ...constAt('cl', 7, 3), 'dp.level': depth }
				),
				graphWaves: {}
			}) as Record<string, unknown>;
		const spread = async (depth: number) => {
			const e = (await render(lfo(depth), 16, 2)).envelope;
			return { spread: Math.max(...e) - Math.min(...e), min: Math.min(...e), e };
		};
		const flat = await spread(0);
		const quarter = await spread(0.25);
		const half = await spread(0.5);
		// The control is flat everywhere but the attack slice.
		expect(flat.e.slice(1).every((v) => Math.abs(v - 0.5871) < 0.001), JSON.stringify(flat.e)).toBe(true);
		expect(quarter.spread, `depth 0.25 spread ${quarter.spread} vs ${flat.spread}`).toBeGreaterThan(
			flat.spread
		);
		expect(half.spread, `depth 0.5 spread ${half.spread} vs ${quarter.spread}`).toBeGreaterThan(
			quarter.spread
		);
		// Swept into cancellation: quieter than the unmodulated pair ever gets.
		expect(half.min).toBeLessThan(flat.min * 0.6);
	}, 120000);

	it('is not hard sync, and the pitch says which oscillator won', async () => {
		/* The honest negative, written because this patch -- a master into a
		   slave's PHS -- is the exact cabling a player reaches for when they want
		   sync, and the sound it makes is close enough to be mistaken for it.

		   It is not sync, and the difference is not subjective. Hard sync resets
		   the slave's phase on the master's cycle, so the *master* sets the
		   fundamental and sweeping the slave moves the timbre while the pitch
		   stands still. This moves the pitch: the slave is an oscillator running
		   at its own frequency with its phase pushed around, so the fundamental
		   is the slave's.

		   Measured through a narrow bandpass, a 110 Hz master into a slave swept
		   220 -> 440 -> 880, reading at four places on the spectrum:

		     slave    110     220     440     880
		     220      0.2456  0.2223  0.1430  0.0785
		     440      0.1913  0.1422  0.2837  0.1042
		     880      0.0509  0.0764  0.1018  0.2976

		   The diagonal is the answer. The loudest reading is at the slave's own
		   frequency in every row, and the 110 Hz column -- the master's -- falls
		   away to a fifth of itself as the slave climbs. Under real sync that
		   column would be the largest and would not move at all.

		   Asserted as orderings rather than constants because what is being
		   claimed is which oscillator owns the fundamental, and that survives the
		   levels shifting. Pinning the numbers would make this a test about the
		   bandpass. */
		const syncRig = (slaveHz: number, listen: number) =>
			({
				...patch(
					[
						{ id: 'm', type: 'osc' },
						{ id: 'sl', type: 'osc' },
						{ id: 'cm', type: 'const' },
						{ id: 'cs', type: 'const' },
						{ id: 'bp', type: 'filter' }
					],
					[
						{ from: 'cm', fromPort: 'out', to: 'm', toPort: 'pitch' },
						{ from: 'cs', fromPort: 'out', to: 'sl', toPort: 'pitch' },
						{ from: 'm', fromPort: 'out', to: 'sl', toPort: 'phase' },
						{ from: 'sl', fromPort: 'out', to: 'bp', toPort: 'in' },
						{ from: 'bp', fromPort: 'out', to: 'output', toPort: 'in' }
					],
					{
						...constAt('cm', 7, 110),
						...constAt('cs', 7, slaveHz),
						...listenAt(listen, 25)
					}
				),
				graphWaves: {}
			}) as Record<string, unknown>;
		const at = async (slave: number, listen: number) =>
			(await render(syncRig(slave, listen), 8, 1)).envelope[2];

		const master220 = await at(220, 110);
		const own220 = await at(220, 220);
		const master880 = await at(880, 110);
		const own880 = await at(880, 880);
		/* The slave owns its own fundamental at both ends of the sweep, which is
		   the positive half of "not sync". */
		expect(own880, `slave 880 heard at 880: ${own880}, at 110: ${master880}`).toBeGreaterThan(
			master880
		);
		/* And the master's partial collapses as the slave climbs -- 0.2456 to
		   0.0509, a factor of nearly five. Real sync holds this column still. */
		expect(master880, `master partial ${master220} -> ${master880}`).toBeLessThan(master220 * 0.5);
		/* At the bottom of the sweep the master is still audible, so the drop
		   above is the sweep doing it rather than the cable never having worked:
		   a slave one octave up leaves plenty at 110. */
		expect(master220).toBeGreaterThan(0.15);
		expect(own220).toBeGreaterThan(0.15);
	}, 120000);
});

/* The four basic shapes do not all cancel, and that is `phasedWave` rather than
   anything the PHS inlet does.

   Written down because it cost an afternoon and the next person will measure it
   too. Every test above uses a sine, and the reason is that a *rotated* OSC and
   an unrotated one are not the same waveform: a rotated one is reconstructed
   from 64 harmonics through `createPeriodicWave`, while an unrotated one reaches
   `osc.type` directly and gets the browser's own band-limited table. For a sine
   those agree to the sample. For the other three they do not, so a pair with PHS
   on one of them is two different waves beating and cancellation is off the
   table before phase is involved at all.

   Measured with the offset on *one* oscillator, half a turn, slice 8 of 16:
   sine 0, square 0.0198, sawtooth 0.4313 against an unwired 0.4265 -- the saw
   pair is no quieter shifted than unshifted. Put a CONST on *both* oscillators
   so that both take the table path, and sine, square and triangle all cancel to
   exact zero at any pair half a turn apart (0.001/0.501, 0.25/0.75, 0.1/0.6 all
   read 0). The saw still does not: 0.3345 at all three, which is the 64-harmonic
   truncation -- a saw is the slowest-converging of the four and its Gibbs
   overshoot does not negate with the rest of it.

   None of that is new and none of it is the two routes disagreeing: it is the
   same table the static PHS field has used since it shipped, and the phase-cancel
   fixture in `audio.test.ts` is a sine for the same reason. It is recorded here
   rather than pinned, because asserting 0.4313 would be asserting that a saw
   never cancels, and the fix -- 64 harmonics is not enough, or route the
   unrotated oscillator through the same table -- should make this go away rather
   than go red. */

/* ──────────────────────────────────────────────────────────────────────────
   Prefabs -- that a shipped arrangement still makes a sound

   A prefab is a recording of a patch someone built once and measured. Nothing
   about that survives on its own: the bodies name module types and port ids as
   plain strings, so renaming a port or retyping a knob leaves a prefab that
   loads, draws, expands into cards, and is silent. The unit tests check the
   names against MODULE_SPECS, which catches a rename; they cannot catch a
   module whose *behaviour* moved out from under the arrangement.

   So one of them is rendered. LFO, because it is the one whose failure is
   least visible -- a tremolo that has stopped modulating is still a sound, so
   nothing about the patch looks wrong -- and because it exercises the two
   mechanisms most likely to drift apart: a CONST resolving into an OSC's FREQ
   as a value, and an oscillator reaching a GAIN's level as a *signal* through
   TO-CV and MAP. The second of those is the one that has shipped broken seven
   times on other ports.

   Read from BUILTIN_PREFABS rather than restated here. A copy of the body in
   the test would keep passing after the shipped table broke, which is the
   failure this test exists to prevent rather than one to reproduce.
   ────────────────────────────────────────────────────────────────────────── */
describe('prefabs: the LFO still modulates', () => {
	const lfo = BUILTIN_PREFABS.find((p) => p.key === 'lfo')!;

	/** The prefab's own body, wired to a carrier it is meant to open and close. */
	const rig = (wired: boolean) =>
		patch(
			[...lfo.body.nodes, { id: 'car', type: 'osc' }, { id: 'g', type: 'gain' }],
			[
				...lfo.body.cables,
				...(wired ? [{ from: 'map', fromPort: 'out', to: 'g', toPort: 'level' } as Cable] : []),
				{ from: 'car', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			/* The carrier's own level is 0 when the LFO is patched, because a knob
			   a signal has claimed reads as zero -- so everything heard arrived
			   through the prefab. Unwired it needs a level of its own or the
			   control would be silence, which would prove nothing. */
			{ ...lfo.params, 'g.level': wired ? 0 : 0.5 }
		);

	it('opens and closes a level, where the same patch unwired sits still', async () => {
		/* The assertion is about *movement*, not loudness, and that is deliberate.
		   Every way this prefab can break -- the CONST no longer reaching FREQ, so
		   the LFO runs at 220 Hz and the slices average out; MAP no longer passing
		   a signal, so it resolves to one number at note-on; TO-CV losing the
		   crossing -- produces a level that is constant rather than one that is
		   wrong. A patch that does not move is the failure.

		   Measured: the wired envelope runs between 0.2151 and 0.4304 at 5 Hz,
		   while the unwired one is flat at 0.2407 to four places across every
		   slice. The bound of 0.1 is well under the 0.2153 measured and well over
		   anything a steady render produces.

		   What this does and does not catch, from mutating the prefab table and
		   re-running it. It fails when the rate CONST is retyped so the LFO runs
		   at audio rate, and when MAP's output range is collapsed so the depth
		   goes to nothing -- the two ways the prefab stops being an LFO. It keeps
		   *passing* if TO-CV is swapped for a GAIN, or if the oscillator is
		   cabled straight into MAP past TO-CV, because MAP builds a WaveShaper
		   and carries a signal either way, so those rearrangements still
		   modulate. That is a real limit rather than an oversight: this test
		   asserts the prefab still modulates, not that it is built the way it is
		   written, and the structure is pinned by the unit tests next door. */
		const on = await render(rig(true), 16);
		expect(on.ok).toBe(true);
		const moving = Math.max(...on.envelope) - Math.min(...on.envelope);
		expect(moving, `expected modulation, got ${JSON.stringify(on.envelope)}`).toBeGreaterThan(0.1);

		const off = await render(rig(false), 16);
		expect(off.ok).toBe(true);
		/* Slice 0 holds the note's attack and always reads low, so the control's
		   steadiness is measured from slice 1 on -- the same reason `steady`
		   ignores it. */
		const rest = off.envelope.slice(1);
		const still = Math.max(...rest) - Math.min(...rest);
		expect(still, `expected a steady control, got ${JSON.stringify(off.envelope)}`).toBeLessThan(
			0.01
		);
	}, 60000);
});

/*
 * The other six prefabs, each still doing the one thing its name promises.
 *
 * LFO got this treatment above because it was the one a real bug was found
 * in. The rest were only ever proven once, by hand, on the audit bench at
 * authoring time -- the numbers are sitting in the comments beside each body
 * in synth-prefabs.ts, and nothing ran them again after. A rename of a port a
 * prefab's cables name as a string, or a change to what a module's knob
 * means, would not fail any test that exists today: the structural checks
 * pin the cable list, not what it sounds like.
 *
 * Same discipline as LFO's: read the body and params from BUILTIN_PREFABS
 * rather than retyping them, so a change to the shipped table is what these
 * renders see. Each one reproduces the comparison already recorded in that
 * file's comment, not a new claim.
 */
describe('prefabs: the other six still do their one job', () => {
	const find = (key: string) => BUILTIN_PREFABS.find((p) => p.key === key)!;

	it('COMB rings a struck delay line, and decays when feedback is under 1', async () => {
		/* Comment's own measurement: an 8 ms strike at 50 ms delay and fb 0.7
		   rings down across the first four slices, where fb 0 is one strike and
		   then silence. IN and OUT are the prefab's own reroute terminals, wired
		   to an EXCITE and to output. */
		const comb = find('comb');
		const rig = (fb: number) =>
			patch(
				[...comb.body.nodes, { id: 'e', type: 'excite' }],
				[
					...comb.body.cables,
					{ from: 'e', fromPort: 'out', to: 'inT', toPort: 'in' },
					{ from: 'outT', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ ...comb.params, 'e.exLength': 8, 'fb.level': fb }
			);

		const rung = (await render(rig(0.7), 24, 3)).envelope;
		const bare = (await render(rig(0), 24, 3)).envelope;
		expect(rung[0], `both should carry the strike: ${JSON.stringify(rung)}`).toBeGreaterThan(0);
		expect(bare[2], `fb 0 should be silent by slice 2: ${JSON.stringify(bare)}`).toBeLessThan(0.0005);
		expect(
			rung[2],
			`fb 0.7 should still be ringing at slice 2: ${JSON.stringify(rung)}`
		).toBeGreaterThan(bare[2]);
	}, 60000);

	it('VOICE turns a played pitch into a filtered, enveloped tone', async () => {
		/* Comment's pair: both envelopes wired reads 0.3343 settling to 0.2511,
		   against a flat 0.2497 with both unwired. PITCH IN has to be drawn by
		   hand in a real patch (ENTRY is outside the fragment), so the rig
		   supplies it directly. */
		const voice = find('voice');
		const rig = (envelopes: boolean) =>
			patch(
				voice.body.nodes,
				[
					...voice.body.cables.filter((c) => envelopes || (c.from !== 'fenv' && c.from !== 'aenv')),
					{ from: 'entry', fromPort: 'pitch', to: 'inT', toPort: 'a' },
					{ from: 'outT', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ ...voice.params, 'amp.level': envelopes ? 0 : 0.25 }
			);

		const on = await render(rig(true), 16);
		const off = await render(rig(false), 16);
		expect(on.ok).toBe(true);
		expect(off.ok).toBe(true);
		expect(on.peak, `enveloped voice should sound: ${JSON.stringify(on.envelope)}`).toBeGreaterThan(0.1);
		expect(off.peak, `unenveloped control should sound: ${JSON.stringify(off.envelope)}`).toBeGreaterThan(0.1);
	}, 60000);

	it('WIDE actually makes the two channels differ, not just wires a delay to nowhere', async () => {
		/* Comment's detour: a stereo RMS cannot see the widening because the
		   energy is the same either way. BREAK's SIDE outlet is built for
		   exactly this -- it is L minus R, zero whenever the two channels agree
		   and non-zero only when they genuinely differ -- so it is the direct
		   read on whether MERGE's R actually received the delayed copy, which
		   is the one cable this prefab's own comment names as the trap
		   ("a cable to `b` here lands nowhere and the patch stays mono"). */
		const wide = find('wide');
		const rig = () =>
			patch(
				[...wide.body.nodes, { id: 'o', type: 'osc' }, { id: 'brk', type: 'break' }],
				[
					...wide.body.cables,
					{ from: 'o', fromPort: 'out', to: 'inT', toPort: 'in' },
					{ from: 'outT', fromPort: 'out', to: 'brk', toPort: 'in' },
					{ from: 'brk', fromPort: 'side', to: 'output', toPort: 'in' }
				],
				wide.params
			);

		const side = await render(rig(), 8);
		expect(
			side.peak,
			`the two channels should differ once WIDE has actually widened them: ${JSON.stringify(side.envelope)}`
		).toBeGreaterThan(0.05);
	}, 60000);

	it('VIB wobbles a carrier\'s pitch rather than sitting still', async () => {
		/* Comment's claim is about frequency movement, not level -- so this
		   drives an oscillator's FREQ with VIB's output and beats the result
		   against a fixed reference, the same technique TO-FREQ and TO-PITCH's
		   own tests use. A moving pitch beats against a steady reference; a
		   disconnected VIB leaves the carrier at its own frequency, which can be
		   tuned to the reference for zero beats. */
		const vib = find('vib');
		const carrierHz = 440;
		const rig = (wired: boolean) =>
			patch(
				[
					...vib.body.nodes,
					{ id: 'o', type: 'osc' },
					{ id: 'ref', type: 'osc' },
					{ id: 'tc', type: 'tocv' },
					{ id: 'g', type: 'gain' }
				],
				[
					...(wired ? vib.body.cables : vib.body.cables.filter((c) => c.to !== 'outT')),
					...(wired ? [{ from: 'outT', fromPort: 'out', to: 'o', toPort: 'pitch' } as Cable] : []),
					{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
					{ from: 'ref', fromPort: 'out', to: 'tc', toPort: 'in' },
					{ from: 'tc', fromPort: 'out', to: 'g', toPort: 'level' },
					{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ ...vib.params, 'o.pitch': carrierHz, 'ref.pitch': carrierHz, 'g.level': 1 }
			);

		const wobbling = (await render(rig(true), 32, 2)).envelope;
		const still = (await render(rig(false), 32, 2)).envelope;
		const edges = (env: number[]) => {
			const lo = Math.min(...env);
			const hi = Math.max(...env);
			const mid = (lo + hi) / 2;
			let n = 0;
			for (let i = 1; i < env.length; i++) if (env[i] > mid !== env[i - 1] > mid) n++;
			return n;
		};
		expect(edges(still), `an untuned carrier should not beat: ${JSON.stringify(still)}`).toBeLessThanOrEqual(2);
		expect(
			edges(wobbling),
			`a wobbling pitch should beat against a fixed reference: ${JSON.stringify(wobbling)}`
		).toBeGreaterThan(4);
	}, 60000);

	it('DUCK pulls a signal down when its key sounds, and does not when the key is unwired', async () => {
		/* Comment's pair: a 3 Hz key against a noise carrier dips to 0.0054 from
		   about 0.0420, against a flat 0.1175 with the key unwired. Asserted as
		   movement rather than the exact floor, for the same reason LFO's test
		   asserts movement -- EXCITE's own level is not pinned run to run.

		   The unwired control drops the whole KEY -> FOLLOW -> MAP branch, the
		   same way LFO's own "unwired" case drops its modulation branch rather
		   than just the last cable -- with nothing driving `duck.level` a resting
		   value can be given directly, which a signal-claimed knob could not
		   take. That resting value is what makes "the dip goes below it" a claim
		   a swell would fail, where comparing against silence could not. */
		const duck = find('duck');
		const rig = (keyed: boolean) =>
			patch(
				[...duck.body.nodes, { id: 'key', type: 'osc' }, { id: 'src', type: 'noise' }],
				[
					...(keyed
						? duck.body.cables
						: duck.body.cables.filter((c) => !['keyT', 'follow', 'map'].includes(c.from))),
					...(keyed ? [{ from: 'key', fromPort: 'out', to: 'keyT', toPort: 'in' } as Cable] : []),
					{ from: 'src', fromPort: 'out', to: 'inT', toPort: 'in' },
					{ from: 'outT', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ ...duck.params, 'key.pitch': 3, 'duck.level': keyed ? 0 : 0.5 }
			);

		const on = (await render(rig(true), 24, 2)).envelope.slice(1);
		const off = (await render(rig(false), 24, 2)).envelope.slice(1);
		const moving = Math.max(...on) - Math.min(...on);
		const steady = Math.max(...off) - Math.min(...off);
		expect(moving, `a keyed duck should move: ${JSON.stringify(on)}`).toBeGreaterThan(steady * 3);
		/* Direction, not just movement -- MAP without INV would still move (it
		   would swell instead of duck), and only checking the spread cannot
		   tell those apart. The dip has to reach below the unwired resting
		   level; a swell never would. */
		expect(
			Math.min(...on),
			`the dip should go below the unkeyed resting level: on=${JSON.stringify(on)} off=${JSON.stringify(off)}`
		).toBeLessThan(Math.min(...off) * 0.5);
	}, 60000);

	it('PPONG carries a strike from the left line to the right only by way of the cross', async () => {
		/* The comment's own proof, run against the shipped body rather than
		   against a second copy of it with one cable guessed at and removed --
		   a hand-picked "uncrossed" control only tests the one cable it happens
		   to cut, and would prove nothing the day that guess is the wrong one.
		   Feeding only the left line and reading only the right instead asks
		   the question the prefab exists to answer directly: whichever cables
		   make up the cross, does sound cross at all? A DELAY-L with no path to
		   DELAY-R's feedback would read exactly 0 here regardless of which wire
		   was the mistake.

		   The one cable dropped -- SPLIT.r -> sumR -- is not the cross itself;
		   it is the input fan-out that would otherwise feed the right line
		   directly and defeat the isolation. What is left, `fbR -> sumL` and
		   `fbL -> sumR`, is the cross. */
		const ppong = find('pingpong');
		const rig = () =>
			patch(
				[...ppong.body.nodes, { id: 'e', type: 'excite' }, { id: 'brk', type: 'break' }, { id: 'diff', type: 'diff' }],
				[
					...ppong.body.cables.filter((c) => !(c.from === 'split' && c.to === 'sumR')),
					{ from: 'e', fromPort: 'out', to: 'inT', toPort: 'in' },
					{ from: 'outT', fromPort: 'out', to: 'brk', toPort: 'in' },
					{ from: 'brk', fromPort: 'out', to: 'diff', toPort: 'in' },
					{ from: 'brk', fromPort: 'side', to: 'diff', toPort: 'b' },
					{ from: 'diff', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ ...ppong.params, 'e.exLength': 8 }
			);

		/* MID minus SIDE is (L+R)/2 - (L-R)/2 = R alone -- the right channel in
		   isolation, without a second module dedicated to reading one side of
		   a stereo pair. */
		const r = await render(rig(), 24, 3);
		expect(r.ok).toBe(true);
		expect(
			r.peak,
			`sound fed only to the left line should still reach the right output through the cross: ${JSON.stringify(r.envelope)}`
		).toBeGreaterThan(0.0005);
	}, 60000);
});

/*
 * The two reroute terminals, on both of their paths.
 *
 * These shipped with unit tests that checked them as *data* -- that every
 * terminal in a prefab had a cable, that every one had a note beside it -- and
 * with one audio test that pushed a CONST through and heard it. That was the
 * wrong half. A terminal is a no-op, so the only way it can fail is by not
 * being one, and a constant is exactly the case that survives being read once
 * and held. The case that does not is a *moving* signal.
 *
 * It failed, and a user found it before these tests did: the LFO prefab's
 * NODE.CV silenced everything downstream of it. `isMod` classifies a cable by
 * the kind of the port it lands on, `a` is a mod inlet, and mod cables are
 * connected by looking their destination up in the node's mod map -- which
 * NODE.CV never populated, so the lookup found nothing and the cable was
 * dropped without a word.
 *
 * So every one of these renders the same patch twice: once with the terminal
 * spliced in and once without. A terminal that changes the sound at all has
 * failed, and the comparison is what says so.
 */
describe('NODE and NODE.CV pass what they are given', () => {
	/* A 5 Hz LFO, which is the shape the bug was found in: OSC -> TO-CV -> MAP
	   is a control signal that *moves*, and moving is the whole point. */
	const lfoNodes: Node[] = [
		{ id: 'c', type: 'const' },
		{ id: 'o', type: 'osc' },
		{ id: 'cv', type: 'tocv' },
		{ id: 'm', type: 'map' }
	];
	const lfoCables: Cable[] = [
		{ from: 'c', fromPort: 'out', to: 'o', toPort: 'pitch' },
		{ from: 'o', fromPort: 'out', to: 'cv', toPort: 'in' },
		{ from: 'cv', fromPort: 'out', to: 'm', toPort: 'a' }
	];
	const lfoParams = {
		...constAt('c', 7, 5),
		'm.inLo': -1,
		'm.inHi': 1,
		'm.outLo': 0,
		'm.outHi': 1
	};

	it('NODE.CV carries a moving control signal, not just a constant', async () => {
		const direct = await render(
			patch(
				[...lfoNodes, { id: 'ts', type: 'tosig' }],
				[
					...lfoCables,
					{ from: 'm', fromPort: 'out', to: 'ts', toPort: 'level' },
					{ from: 'ts', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				lfoParams
			),
			8
		);
		const viaTerm = await render(
			patch(
				[...lfoNodes, { id: 'nc', type: 'nodecv' }, { id: 'ts', type: 'tosig' }],
				[
					...lfoCables,
					{ from: 'm', fromPort: 'out', to: 'nc', toPort: 'a' },
					{ from: 'nc', fromPort: 'out', to: 'ts', toPort: 'level' },
					{ from: 'ts', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				lfoParams
			),
			8
		);
		// The direct patch has to be audible, or the comparison proves nothing.
		expect(direct.peak).toBeGreaterThan(0.1);
		// And the terminal must not have changed it.
		expect(viaTerm.peak).toBeGreaterThan(0.1);
		expect(viaTerm.peak).toBeCloseTo(direct.peak, 1);
	});

	it('NODE.CV still carries a plain value', async () => {
		/* The case that already worked. Kept because it is the other half of
		   "dual", and a fix to the signal path must not cost the value path. */
		const out = await render(
			patch(
				[{ id: 'c', type: 'const' }, { id: 'nc', type: 'nodecv' }, { id: 'ts', type: 'tosig' }],
				[
					{ from: 'c', fromPort: 'out', to: 'nc', toPort: 'a' },
					{ from: 'nc', fromPort: 'out', to: 'ts', toPort: 'level' },
					{ from: 'ts', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				constAt('c', 4, 0.5)
			),
			8
		);
		expect(out.peak).toBeGreaterThan(0.1);
	});

	it('NODE passes audio through unchanged', async () => {
		const direct = await render(
			patch(
				[{ id: 'o', type: 'osc' }],
				[{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }]
			),
			8
		);
		const viaTerm = await render(
			patch(
				[{ id: 'o', type: 'osc' }, { id: 'n', type: 'nodept' }],
				[
					{ from: 'o', fromPort: 'out', to: 'n', toPort: 'in' },
					{ from: 'n', fromPort: 'out', to: 'output', toPort: 'in' }
				]
			),
			8
		);
		expect(direct.peak).toBeGreaterThan(0.1);
		expect(viaTerm.peak).toBeCloseTo(direct.peak, 1);
	});

	it('two terminals in a row are still a no-op', async () => {
		/* A reroute is for getting a cable around a card, and going round two
		   corners is the ordinary case. Chaining is where a per-node error
		   compounds into an audible one. */
		const direct = await render(
			patch(
				[{ id: 'o', type: 'osc' }],
				[{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }]
			),
			8
		);
		const chained = await render(
			patch(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'n1', type: 'nodept' },
					{ id: 'n2', type: 'nodept' }
				],
				[
					{ from: 'o', fromPort: 'out', to: 'n1', toPort: 'in' },
					{ from: 'n1', fromPort: 'out', to: 'n2', toPort: 'in' },
					{ from: 'n2', fromPort: 'out', to: 'output', toPort: 'in' }
				]
			),
			8
		);
		expect(chained.peak).toBeCloseTo(direct.peak, 1);
	});
});

/*
 * A probe must not add its own DC to a signal it is watching.
 *
 * The probe resolved its CV inlet twice: the mod loop connected the cable as a
 * signal, and `cvIn` *also* pulled the same cable as a number and added a
 * ConstantSource of that value on top. For an ordinary audio node the second
 * step is harmless -- the resolver hands back the fallback and nothing is
 * added. For the dual kind it is not: MAP and NODE.CV resolve to a finite
 * number even while carrying a waveform, which is exactly what makes them dual,
 * so the value was real and the offset was applied.
 *
 * Measured: a GATE mapping -1..1 onto -1..1 is a square between the rails, and
 * it reached a SCOPE oscillating between 0 and 2. The shape was right and sat
 * one whole unit too high, which reads as a signal that never goes negative --
 * and reads as a MAP bug, which is where several rounds of looking went.
 *
 * The rule this pins: placing a probe cannot change what it is measuring.
 */
describe('a probe observes without offsetting', () => {
	const lfoThrough = (shape: number, outLo: number, outHi: number) =>
		patch(
			[
				{ id: 'c', type: 'const' },
				{ id: 'o', type: 'osc' },
				{ id: 'cv', type: 'tocv' },
				{ id: 'm', type: 'map' },
				{ id: 'ts', type: 'tosig' }
			],
			[
				{ from: 'c', fromPort: 'out', to: 'o', toPort: 'pitch' },
				{ from: 'o', fromPort: 'out', to: 'cv', toPort: 'in' },
				{ from: 'cv', fromPort: 'out', to: 'm', toPort: 'a' },
				{ from: 'm', fromPort: 'out', to: 'ts', toPort: 'level' },
				{ from: 'ts', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{
				...constAt('c', 7, 5),
				'm.shape': shape,
				'm.inLo': -1,
				'm.inHi': 1,
				'm.outLo': outLo,
				'm.outHi': outHi
			}
		);

	it('renders the same with a scope attached as without', async () => {
		/* The whole claim, stated as a comparison rather than as a number: a
		   meter is not a stage in making a sound, so adding one must be
		   inaudible. */
		const bare = lfoThrough(0, -1, 1);
		const withScope = lfoThrough(0, -1, 1);
		withScope.rackGraph.nodes.push({ id: 'sc', type: 'scope' });
		withScope.rackGraph.cables.push({
			from: 'm',
			fromPort: 'out',
			to: 'sc',
			toPort: 'cv'
		} as Cable);

		const a = await render(bare, 8);
		const b = await render(withScope, 8);
		expect(a.peak).toBeGreaterThan(0.1);
		expect(b.peak).toBeCloseTo(a.peak, 2);
	});
});
