import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * REL: the key coming up, as its own activation of the graph.
 *
 * Every other audio test in this suite renders one held note through one
 * pass of `buildRackGraph`. REL is the one thing that pass cannot produce --
 * a second, independent activation of the same graph, built and started at
 * the real moment `noteOff` happens rather than at note-on -- so it needs
 * its own bench rather than a variation on `render()`.
 *
 * `/synth/audit`'s `renderWithRelease` is what makes this reachable offline:
 * `OfflineAudioContext.suspend` pauses the render at a chosen instant,
 * `releaseTrackVoice` fires there against that exact `currentTime`, and the
 * render resumes. Nothing here is timed by the wall clock.
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

type Node = { id: string; type: string };
type Cable = { from: string; fromPort: string; to: string; toPort: string };

const patch = (nodes: Node[], cables: Cable[], graphParams: Record<string, number> = {}) => ({
	advanced: true,
	rackGraph: {
		nodes: [{ id: 'entry', type: 'in' }, { id: 'output', type: 'out' }, ...nodes],
		cables: [{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' } as Cable, ...cables]
	},
	graphParams
});

async function renderWithRelease(
	timbre: Record<string, unknown>,
	seconds: number,
	slices: number,
	releaseAtSec: number
): Promise<Envelope> {
	return page.evaluate(
		async (a) => {
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					renderWithRelease(s: number, n: number, sl: number, r: number): Promise<Envelope>;
				};
			};
			w.__audit.setTrack(a.t);
			return await w.__audit.renderWithRelease(a.seconds, 40, a.slices, a.releaseAtSec);
		},
		{ t: timbre, seconds, slices, releaseAtSec }
	);
}

/**
 * A timed note: no separate release event, the note's own `holdSec` is when
 * it ends. This is `triggerTrackVoice`'s other shape from `renderWithRelease`
 * -- a fixed-length note the way the piano roll and a K.MAP-triggered kit key
 * both play one, rather than a key held until let go.
 */
async function run(
	timbre: Record<string, unknown>,
	seconds: number,
	slices: number,
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
		{ t: timbre, seconds, slices, holdSec }
	);
}

async function playAndSample(timbre: Record<string, unknown>, waitMs: number): Promise<number> {
	return page.evaluate(
		async (a) => {
			const w = window as never as {
				__audit: { playAndSample(t: unknown, ms: number): Promise<number> };
			};
			return await w.__audit.playAndSample(a.t, a.waitMs);
		},
		{ t: timbre, waitMs }
	);
}

async function playTwoAndSample(
	timbre: Record<string, unknown>,
	gapMs: number,
	waitMs: number
): Promise<number> {
	return page.evaluate(
		async (a) => {
			const w = window as never as {
				__audit: { playTwoAndSample(t: unknown, g: number, ms: number): Promise<number> };
			};
			return await w.__audit.playTwoAndSample(a.t, a.gapMs, a.waitMs);
		},
		{ t: timbre, gapMs, waitMs }
	);
}

async function renderTwoKeysReleaseOne(
	timbre: Record<string, unknown>,
	seconds: number,
	noteA: number,
	noteB: number,
	slices: number,
	releaseAtSec: number
): Promise<Envelope> {
	return page.evaluate(
		async (a) => {
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					renderTwoKeysReleaseOne(
						s: number,
						a: number,
						b: number,
						sl: number,
						r: number
					): Promise<Envelope>;
				};
			};
			w.__audit.setTrack(a.t);
			return await w.__audit.renderTwoKeysReleaseOne(
				a.seconds,
				a.noteA,
				a.noteB,
				a.slices,
				a.releaseAtSec
			);
		},
		{ t: timbre, seconds, noteA, noteB, slices, releaseAtSec }
	);
}

describe('ON-CHOKE: fires when a voice is cut off from outside itself', () => {
	/* Voice stealing and ACT's CUT/SOLO are both guarded by `!this.renderCtx`
	   in the engine -- they are a live-playing concern (a limited pool of
	   voices, a mute group), and an offline render triggers explicit voices
	   for explicit lengths rather than competing for a slot. So there is no
	   way to reach either mechanism through `renderNote`/`renderWithRelease`,
	   and these use `playAndSample`/`playTwoAndSample` -- real notes through a
	   real `AudioContext` -- instead.

	   A note cannot choke itself: `noteActions`' CUT/SOLO loop only reaches
	   voices already filed in `activeVoices`, and a note is filed there only
	   after its own CUT/SOLO decision has already been read and acted on.
	   Proving ON-CHOKE fires from an external cut therefore needs two notes --
	   A, then B, whose own ACT(CUT) reaches A once A already exists. Both
	   share one track's graph, so B carries the identical wiring too --
	   including a base tone that GAIN silences on both voices alike. That
	   silences the one thing that would otherwise make "is the tail playing"
	   hard to read off a peak sample: with the base tone gone on both A and
	   B, the only source either voice can put into OUT is a tail that
	   ON-CHOKE actually started. */
	/* THEN and ON-CHOKE each answer to exactly one OUT here, for the same
	   reason THEN and REL do below: `addCable` refuses a second event-source
	   outlet landing on an OUT another one already reaches, so the base tone
	   (THEN's) and the tail (ON-CHOKE's) sit on two separate OUT nodes and
	   sum on the track bus rather than sharing one. */
	const rig = (choked: boolean) => ({
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'onchoke', type: 'onchoke' },
				{ id: 'output', type: 'out' },
				{ id: 'outputChoke', type: 'out' },
				{ id: 'o', type: 'osc' },
				{ id: 'mute', type: 'gain' },
				{ id: 'act', type: 'act' },
				{ id: 'tail', type: 'osc' }
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
				...(choked ? [{ from: 'entry', fromPort: 'then', to: 'act', toPort: 'exec' }] : []),
				{ from: 'onchoke', fromPort: 'then', to: 'outputChoke', toPort: 'exec' },
				{ from: 'o', fromPort: 'out', to: 'mute', toPort: 'in' },
				{ from: 'mute', fromPort: 'out', to: 'output', toPort: 'in' },
				{ from: 'tail', fromPort: 'out', to: 'outputChoke', toPort: 'in' },
				{ from: 'onchoke', fromPort: 'then', to: 'tail', toPort: 'pitch' }
			]
		},
		graphParams: {
			'mute.level': 0,
			'act.action': 0,
			'act.actGroup': 0,
			'act.actMs': 6
		}
	});

	it('is the only source of sound once B\'s ACT actually cuts A', async () => {
		/* A first, then B a few milliseconds later -- long enough that A is
		   filed in `activeVoices` before B's own ACT runs. B's CUT(group 0)
		   reaches A immediately; both voices' own base tones are silent by
		   construction (`mute.level` 0), so anything audible at all has to be
		   ON-CHOKE's tail, started once A is cut. */
		const level = await playTwoAndSample(rig(true), 40, 300);
		expect(level, `expected ON-CHOKE's tail to be the only thing sounding: ${level}`).toBeGreaterThan(
			0.02
		);
	}, 30000);

	it('stays silent without the CUT chain that would trigger it', async () => {
		/* The identical rig with ACT's exec cable removed -- nothing ever
		   chokes A, and both base tones are already silent, so there is
		   nothing left to produce any sound at all. This is what rules out
		   the first test passing because ON-CHOKE fires unconditionally
		   rather than because the choke actually reached A. */
		const level = await playTwoAndSample(rig(false), 40, 300);
		expect(level, `expected silence with no choke to answer: ${level}`).toBeLessThan(0.02);
	}, 30000);
});

describe('REL: fires once, at the real release rather than at the note', () => {
	it('stays silent through the held note when only REL feeds the sound', async () => {
		/* THEN has no exec cable to OUT at all -- only REL does -- and an
		   oscillator feeds OUT's audio inlet. Nothing should sound until the
		   key actually comes up, which is deliberately after most of the
		   render: if REL fired at note-on instead, this would be loud from
		   the first slice. */
		const rig = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'o', type: 'osc' }
				],
				cables: [
					{ from: 'entry', fromPort: 'rel', to: 'output', toPort: 'exec' },
					{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
				]
			},
			graphParams: {}
		};
		const r = await renderWithRelease(rig, 2, 16, 1.0);
		expect(r.ok).toBe(true);
		expect(r.builtVoice).toBe(true);
		// Silent for slices before the release (0..~7 of 16 over 2s => ~1.0s).
		const beforeRelease = r.envelope.slice(0, 7);
		expect(
			beforeRelease.every((v) => v === 0),
			`expected silence before release: ${JSON.stringify(r.envelope)}`
		).toBe(true);
		// Sound appears only after the release.
		const afterRelease = r.envelope.slice(9);
		expect(
			afterRelease.some((v) => v > 0.05),
			`expected sound after release: ${JSON.stringify(r.envelope)}`
		).toBe(true);
	}, 60000);

	it('never fires when nothing is wired to REL', async () => {
		/* The common case: a THEN-only patch, released the same as any other
		   note. `releaseVoice`'s own racks-1-7 ramp still stops the ADV
		   oscillator's source at release -- it is in `extras`, and that ramp
		   runs whether or not the graph uses REL at all, unchanged from before
		   this feature existed. What must NOT happen is a *second* voice or
		   an unexpected sound reappearing after that stop, which is what a
		   REL misfiring on a patch that never wired it would look like. */
		const rig = patch(
			[{ id: 'o', type: 'osc' }],
			[{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }]
		);
		const r = await renderWithRelease(rig, 2, 16, 1.0);
		expect(r.ok).toBe(true);
		expect(r.builtVoice).toBe(true);
		// Loud before the release, steady while held.
		const beforeRelease = r.envelope.slice(1, 7);
		expect(
			Math.min(...beforeRelease),
			`expected a steady tone before release: ${JSON.stringify(r.envelope)}`
		).toBeGreaterThan(0.1);
		// Silent well after the release -- the racks-1-7 stop applies, and
		// nothing wired to REL brings any sound back.
		const afterRelease = r.envelope.slice(11);
		expect(
			afterRelease.every((v) => v === 0),
			`expected silence after the ordinary release: ${JSON.stringify(r.envelope)}`
		).toBe(true);
	}, 60000);

	/* THEN and REL each answer to exactly one OUT -- `addCable` refuses a
	   second event-source outlet landing on an OUT another one already
	   reaches (see `execEntriesReaching` in synth-graph.ts), because an OUT
	   shared between two exec entries would have its whole audio ancestry
	   built by whichever activates first, including a branch meant to be the
	   other entry's alone. A patch that wants "THEN plays the voice, REL
	   layers a tail on top" therefore needs two OUT nodes -- one each -- and
	   the two activations' outputs sum on the track bus the same way any two
	   independent voices already do. This is the shape the three tests below
	   use; an earlier version of them shared one OUT between THEN and REL,
	   which is exactly the topology the editor now refuses, and which had
	   REL's own tail playing from note-on regardless of REL ever firing. */

	it('does not disturb the sound THEN already started', async () => {
		/* THEN's own voice keeps sounding across the release -- REL adding a
		   tail on its own OUT is additive, not a replacement of what was
		   already playing on THEN's. */
		const rig = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'outputRel', type: 'out' },
					{ id: 'o', type: 'osc' },
					{ id: 'tail', type: 'osc' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'entry', fromPort: 'rel', to: 'outputRel', toPort: 'exec' },
					{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' },
					{ from: 'tail', fromPort: 'out', to: 'outputRel', toPort: 'in' },
					{ from: 'entry', fromPort: 'rel', to: 'tail', toPort: 'pitch' }
				]
			},
			graphParams: {}
		};
		const r = await renderWithRelease(rig, 2, 16, 1.0);
		expect(r.ok).toBe(true);
		// Loud the whole way through: THEN's oscillator never stops sounding
		// just because REL's own activation also started on its own OUT.
		expect(
			r.envelope.every((v) => v > 0.1),
			`expected THEN's voice to keep sounding: ${JSON.stringify(r.envelope)}`
		).toBe(true);
		/* And genuinely louder once REL's own tail joins in on its own OUT --
		   two sources summing on the track bus read higher than one, which
		   is the difference between "REL added a voice" and "REL fired and
		   did nothing audible". Compared against the steady level while only
		   THEN's oscillator was sounding, well before the release. */
		const beforeRelease = r.envelope[2];
		const afterRelease = r.envelope[r.envelope.length - 1];
		expect(
			afterRelease,
			`expected REL's tail to add to THEN's own level: before=${beforeRelease} after=${afterRelease}`
		).toBeGreaterThan(beforeRelease * 1.1);
	}, 60000);

	it('fires only for the key that was actually released, not the one still held', async () => {
		/* Two notes in on the same track, each its own `ActiveVoice` and its
		   own `advRelContext`. Releasing one must not touch the other: B's
		   own oscillator keeps sounding at its own level the whole way
		   through, whether or not A's REL fires, because `releaseTrackVoice`
		   only ever looks up the one voice key it was given. */
		const rig = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'outputRel', type: 'out' },
					{ id: 'o', type: 'osc' },
					{ id: 'tail', type: 'osc' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'entry', fromPort: 'rel', to: 'outputRel', toPort: 'exec' },
					{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' },
					{ from: 'tail', fromPort: 'out', to: 'outputRel', toPort: 'in' },
					{ from: 'entry', fromPort: 'rel', to: 'tail', toPort: 'pitch' }
				]
			},
			graphParams: {}
		};
		const r = await renderTwoKeysReleaseOne(rig, 2, 48, 60, 16, 1.0);
		expect(r.ok).toBe(true);
		expect(r.builtVoice).toBe(true);
		// The level rises at the release point -- A's REL tail joining B's
		// own steady voice, which is the only way a jump could appear here
		// with just one `noteOff` having happened.
		const beforeRelease = r.envelope[2];
		const afterRelease = r.envelope[r.envelope.length - 1];
		expect(
			afterRelease,
			`expected a jump when A's REL adds its tail: before=${beforeRelease} after=${afterRelease}`
		).toBeGreaterThan(beforeRelease * 1.1);
	}, 60000);

	it('keeps ringing after the main voice has been fully reaped', async () => {
		/* REL's own sources are not in the voice's `extras` and are not
		   touched by `detachVoice`/`reapVoice` -- they are connected straight
		   to the track bus and cleaned up only when they end on their own.
		   `ampRel` defaults to 0.1 s, so THEN's own voice is gone well inside
		   half a second of the release; a tail still sounding a full second
		   after that is proof the two lifecycles are genuinely independent
		   rather than the tail happening to outlast a slow ramp. */
		const rig = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'outputRel', type: 'out' },
					{ id: 'o', type: 'osc' },
					{ id: 'tail', type: 'osc' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'entry', fromPort: 'rel', to: 'outputRel', toPort: 'exec' },
					{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' },
					{ from: 'tail', fromPort: 'out', to: 'outputRel', toPort: 'in' },
					{ from: 'entry', fromPort: 'rel', to: 'tail', toPort: 'pitch' }
				]
			},
			graphParams: {}
		};
		const r = await renderWithRelease(rig, 3, 24, 0.5);
		expect(r.ok).toBe(true);
		// A full second after the release -- long past THEN's own voice
		// having been reaped -- the tail is still sounding.
		const farAfterRelease = r.envelope.slice(20);
		expect(
			farAfterRelease.every((v) => v > 0.1),
			`expected the tail to still be ringing well after reap: ${JSON.stringify(r.envelope)}`
		).toBe(true);
	}, 60000);
});

/**
 * OUT's DUR, end to end: through the real voice lifecycle rather than a
 * private method called directly, because the actual bug this catches lived
 * in the interaction between the two -- `rackTailSeconds` measuring a rack
 * module against the wrong clock, `releaseVoice` never asking it at all, and
 * DUR's own -1-means-no-cap default reading as "hold two seconds longer"
 * once the two were fixed one after the other and re-tested only in
 * isolation. `advGraphDurCap`'s unit tests (out-duration.test.ts) pin the
 * function; these pin the sound.
 */
describe("OUT's DUR, exercised through the real note-on/release/choke paths", () => {
	it('DUR FOLLOW changes nothing about a plain graph released by a key coming up', async () => {
		/* The regression this guards: `rackTailSeconds` used to read a
		   track's `rackChain` even when an ADV graph -- not the chain -- was
		   what actually played, so a track carrying a stale `rackChain` (or
		   a preset saving one alongside its graph) had a phantom multi-second
		   tail on a patch with nothing resonant in it at all. DUR left at -1
		   is supposed to be a no-op; it read as "hold the voice open a
		   further two seconds" instead. */
		const rig = {
			advanced: true,
			rackChain: ['string'],
			rackParams: {},
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'o', type: 'osc' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
				]
			},
			graphParams: { 'output.dur': 0 } // FOLLOW
		};
		const r = await renderWithRelease(rig, 3, 300, 0.5);
		expect(r.ok).toBe(true);
		// Released at slice 50 (0.5s / (3s/300)); silent within a couple of
		// tenths of a second after, not still ringing a second-plus later.
		const wellAfterRelease = r.envelope.slice(120);
		expect(
			wellAfterRelease.every((v) => v <= 0.001),
			`expected silence well after release, found: ${JSON.stringify(r.envelope.slice(45, 140))}`
		).toBe(true);
	}, 60000);

	it('DUR FOLLOW still lets a genuinely resonant module ring out after release', async () => {
		// The other half of the same fix: silencing the phantom chain tail
		// must not also silence a real one actually on the graph.
		const rig = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'x', type: 'excite' },
					{ id: 's', type: 'string' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'x', fromPort: 'out', to: 's', toPort: 'in' },
					{ from: 's', fromPort: 'out', to: 'output', toPort: 'in' }
				]
			},
			graphParams: { 's.decayTime': 3 }
		};
		const r = await renderWithRelease(rig, 4, 400, 0.5);
		expect(r.ok).toBe(true);
		// The peak past wherever the release actually lands, so this does not
		// depend on guessing which slice index the release fell in -- only
		// that the loudest point in the whole render is well above the
		// silence floor, which a bare classic release (~0.1-0.15s) reaches
		// almost immediately after the key comes up.
		const peak = Math.max(...r.envelope);
		expect(peak, `expected STRING still ringing: ${JSON.stringify(r.envelope)}`).toBeGreaterThan(0.05);
		// And it decays rather than cutting off: the last quarter of the
		// render is not still at that peak.
		const tailQuarter = r.envelope.slice(Math.floor(r.envelope.length * 0.75));
		expect(
			Math.max(...tailQuarter),
			`expected the tail to have decayed by the end: ${JSON.stringify(r.envelope)}`
		).toBeLessThan(peak * 0.1);
	}, 60000);

	it('a plain FOLLOW OUT starts fading the instant the key comes up, in about as long as ampRelease says', async () => {
		/* Confirmed with the user directly: a FOLLOW OUT has to start
		   dropping at release itself, in a fade roughly the length of the
		   note's own release setting -- comparable to how short its own
		   attack was, not held open and then chopped. The bug this guards
		   against anchored a FOLLOW OUT's own per-OUT gain fade at
		   `uncappedStopTime`, a good 50ms past where `ampRelease` itself
		   finishes, rather than at release plus `ampRelease` -- an ADV
		   graph's own signal path never passes through `gainNode` at all
		   once a graph builds (`chainOut` is reassigned to the graph's own
		   sink), so `gainNode.gain`'s release ramp drives a node nobody is
		   listening to, and the per-OUT gain is the only thing that can
		   actually shape what is heard. Measured: released at 0.5s with
		   `ampRelease` 0.12s, the peak held completely flat until ~0.65s,
		   then cut to silence in under 15ms -- a hold-then-chop rather than
		   a release. */
		const rig = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'o', type: 'osc' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
				]
			},
			graphParams: {}
		};
		const releaseAtSec = 0.5;
		/* Slices wide enough to average over several periods of the note's
		   own waveform (a low A at this baseFreq cycles roughly every 4ms) --
		   anything finer reads the wave's own phase, not its amplitude
		   envelope, and a bug that actually held the level dead flat for
		   50ms and a healthy render that is merely mid-cycle both produce a
		   reading that swings between the same two numbers, indistinguishable
		   from each other at that resolution. */
		const r = await renderWithRelease(rig, 1.2, 120, releaseAtSec);
		expect(r.ok).toBe(true);
		const sliceSeconds = 1.2 / 120;
		const at = (sec: number) => r.envelope[Math.round(sec / sliceSeconds)];
		const peak = at(releaseAtSec - 0.01);
		// Well before a full ampRelease (default well under 0.2s) has
		// elapsed, the level has already started dropping -- not still
		// sitting at the pre-release peak.
		expect(
			at(releaseAtSec + 0.08),
			`expected the level already falling by 80ms past release, not still at the held peak: ${JSON.stringify(r.envelope.slice(Math.round(releaseAtSec / sliceSeconds), Math.round((releaseAtSec + 0.2) / sliceSeconds)))}`
		).toBeLessThan(peak * 0.85);
		// And it is quiet again shortly after -- this is a fade, not a
		// ring that never ends.
		expect(at(releaseAtSec + 0.3)).toBeLessThan(0.01);
	}, 60000);

	it('caps a note released by a key coming up, measured from the note\'s own start', async () => {
		const rig = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'x', type: 'excite' },
					{ id: 's', type: 'string' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'x', fromPort: 'out', to: 's', toPort: 'in' },
					{ from: 's', fromPort: 'out', to: 'output', toPort: 'in' }
				]
			},
			// Left to itself this would ring for seconds; DUR pins it to a
			// fixed 1s regardless of when (or whether) the key comes up.
			graphParams: { 's.decayTime': 8, 'output.dur': 1, 'output.durSec': 1 } // TIME 1s
		};
		const releaseAtSec = 0.5;
		const r = await renderWithRelease(rig, 4, 400, releaseAtSec);
		expect(r.ok).toBe(true);
		const sliceSeconds = 4 / 400;
		/* TIME names a fixed length from the note's own start, not from
		   release -- a level signal held for its own DUR seconds, exactly as
		   long whether the key lets go early, late, or not at all before that.
		   Confirmed directly: releasing early must not extend the cap by
		   however much release lagged the note, and releasing late (or never)
		   must not truncate it either. */
		const capSlice = Math.round(1 / sliceSeconds);
		// Silent from a little past the cap...
		expect(
			r.envelope.slice(capSlice + 3).every((v) => v <= 0.001),
			`expected silence past the DUR cap: ${JSON.stringify(r.envelope.slice(capSlice - 5))}`
		).toBe(true);
		// ...but not silenced early: DUR is the voice's exact lifetime, not
		// a floor either -- it does not cut the tail short of its own mark.
		expect(
			r.envelope[capSlice - 5],
			`expected sound shortly before the DUR cap: ${JSON.stringify(r.envelope.slice(capSlice - 10, capSlice + 5))}`
		).toBeGreaterThan(0.001);
	}, 60000);

	it('caps a timed note, measured from the note starting rather than a release', async () => {
		const rig = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'x', type: 'excite' },
					{ id: 's', type: 'string' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'x', fromPort: 'out', to: 's', toPort: 'in' },
					{ from: 's', fromPort: 'out', to: 'output', toPort: 'in' }
				]
			},
			graphParams: { 's.decayTime': 8, 'output.dur': 1, 'output.durSec': 1 } // TIME 1s
		};
		// A timed note has no separate release: `holdSec` both plays the key
		// and is when it comes back up, so DUR's clock -- the note's start --
		// and `holdSec`'s are the same moment here. 0.3s is short enough
		// that DUR (not the amp envelope's own quick release) is what ends it.
		const r = await run(rig, 2, 200, 0.3);
		expect(r.ok).toBe(true);
		const sliceSeconds = 2 / 200;
		const capSlice = Math.round(1 / sliceSeconds);
		expect(
			r.envelope.slice(capSlice + 3).every((v) => v <= 0.001),
			`expected silence past the 1s DUR cap: ${JSON.stringify(r.envelope.slice(capSlice - 5))}`
		).toBe(true);
	}, 60000);

	it('a positive DUR is the activation\'s whole lifetime, independent of the graph\'s own sound', async () => {
		/* Confirmed with the user directly: DUR > 0 is edge-triggered -- once
		   the activation fires (THEN or REL, whichever reaches this OUT), it
		   holds for exactly DUR seconds and no more or less, independent of
		   how long the graph's own sound would have taken on its own, *and*
		   independent of when (or whether) the key is released. FOLLOW is
		   level-triggered instead, following however long the note (or its
		   natural ring-out) actually lasts.

		   A bare OSC into OUT has no envelope of its own -- nothing in the ADV
		   path fades it at release, so left alone it plays at a constant level
		   forever. TIME 2s must still hold it sounding until exactly 2s past
		   the note's own start, then cut it there -- neither early nor late,
		   and not shifted by releasing at 0.5s rather than at 2s or never. */
		const rig = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'o', type: 'osc' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
				]
			},
			graphParams: { 'output.dur': 1, 'output.durSec': 2 } // TIME 2s
		};
		const releaseAtSec = 0.5;
		const r = await renderWithRelease(rig, 3, 300, releaseAtSec);
		expect(r.ok).toBe(true);
		const sliceSeconds = 3 / 300;
		const capSlice = Math.round(2 / sliceSeconds);
		// Still sounding well before the cap -- DUR did not shorten anything.
		expect(
			r.envelope[capSlice - 10],
			`expected sound still held open before the DUR mark: ${JSON.stringify(r.envelope.slice(capSlice - 15, capSlice + 5))}`
		).toBeGreaterThan(0.1);
		// Silent shortly after -- cut exactly at the mark, not left running.
		expect(
			r.envelope.slice(capSlice + 3).every((v) => v <= 0.001),
			`expected silence past the DUR mark: ${JSON.stringify(r.envelope.slice(capSlice - 5))}`
		).toBe(true);
	}, 60000);

	it("REL wired straight to an OUT with no envelope does not ring forever", async () => {
		/* The regression report this guards against directly: an OUT reached
		   only by REL (not THEN) had no DUR support at all -- its sources
		   were started and left running with nothing but their own `onended`
		   to stop them, which a plain oscillator never fires unless something
		   calls `.stop()` on it. FOLLOW and TIME 1s read identically: forever,
		   either way. */
		const rig = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'outputRel', type: 'out' },
					{ id: 'tail', type: 'osc' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'entry', fromPort: 'rel', to: 'outputRel', toPort: 'exec' },
					{ from: 'entry', fromPort: 'rel', to: 'tail', toPort: 'pitch' },
					{ from: 'tail', fromPort: 'out', to: 'outputRel', toPort: 'in' }
				]
			},
			graphParams: { 'outputRel.dur': 1, 'outputRel.durSec': 1 } // TIME 1s
		};
		const r = await renderWithRelease(rig, 4, 400, 0.5);
		expect(r.ok).toBe(true);
		// Released at 0.5s; DUR 1s on the REL-fed OUT means silent by 1.5s.
		const sliceSeconds = 4 / 400;
		const pastDur = Math.round(1.8 / sliceSeconds);
		expect(
			r.envelope.slice(pastDur).every((v) => v <= 0.001),
			`expected silence well past the REL OUT's DUR cap: ${JSON.stringify(r.envelope.slice(pastDur - 10))}`
		).toBe(true);
	}, 60000);

	it('TIME on an OUT behind a WAIT fed by REL starts and ends where the WAIT lets it out, not at REL itself', async () => {
		/* A third reported preset's own shape: WAIT sits between REL and the
		   OUT, rather than between THEN and the OUT the way the two-OUT suite
		   below covers. `fireVoiceInterrupt` -- the REL/ON-CHOKE second
		   activation this whole describe block exercises -- built this
		   correctly for *when the OUT starts* (`built.startAt`, already
		   `now + delay`) but computed its own DUR cap from `durCapOf`'s single
		   whole-graph number and applied it at a bare `now + durCap`, with no
		   `delay` folded in at all -- the identical bug the two-OUT suite
		   fixed for THEN, reappearing at this call site because it was never
		   updated to match. Released at 0.4s with a 500ms WAIT and a 1s TIME
		   OUT behind it, measured: silent at 1.4s (`now + durCap`) instead of
		   1.9s (`now + delay + durCap`) -- half a second short, exactly the
		   WAIT's own gap. */
		const rig = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'wait', type: 'wait' },
					{ id: 'outputRel', type: 'out' },
					{ id: 'tail', type: 'osc' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'entry', fromPort: 'rel', to: 'wait', toPort: 'exec' },
					{ from: 'wait', fromPort: 'then', to: 'outputRel', toPort: 'exec' },
					{ from: 'entry', fromPort: 'rel', to: 'tail', toPort: 'pitch' },
					{ from: 'tail', fromPort: 'out', to: 'outputRel', toPort: 'in' }
				]
			},
			graphParams: { 'wait.gapMs': 500, 'outputRel.dur': 1, 'outputRel.durSec': 1 } // TIME 1s
		};
		const releaseAtSec = 0.4;
		const r = await renderWithRelease(rig, 2.5, 500, releaseAtSec);
		expect(r.ok).toBe(true);
		const sliceSeconds = 2.5 / 500;
		const at = (sec: number) => r.envelope[Math.round(sec / sliceSeconds)];
		const start = releaseAtSec + 0.5;
		const end = start + 1;
		// Silent before the WAIT lets it out.
		expect(at(start - 0.1)).toBeLessThan(0.01);
		// Sounding partway through its own second.
		expect(at((start + end) / 2)).toBeGreaterThan(0.1);
		// Silent shortly after 1.9s -- not shifted half a second early to 1.4s.
		expect(
			r.envelope.slice(Math.round((end + 0.05) / sliceSeconds)).every((v) => v <= 0.01),
			`expected silence at ${end}s, not shifted early by the WAIT's own gap: ${JSON.stringify(r.envelope.slice(Math.round((start + 0.4) / sliceSeconds)))}`
		).toBe(true);
	}, 60000);
});

/**
 * Two OUTs sharing one THEN, one of them behind a WAIT: the exact shape a
 * reported preset put in front of this engine for the first time. THEN, WAIT
 * and REL all carry an execution *level* -- not a single trigger pulse -- and
 * WAIT is a delay line for that level, not a fixed-length rewrite of it: a
 * gate that stayed high for a second at the note stays high for a second
 * starting wherever WAIT lets it out, and a fixed lifetime measured from the
 * moment WAIT lets it out is exactly as long behind the WAIT as the gate's own
 * shape said, not shorter by the gap.
 *
 * Two bugs sat behind this before there was a second OUT to disagree with the
 * first about when it should stop. Both were invisible with one OUT, because
 * nothing then asked a second OUT's own DUR a question the first OUT's answer
 * could get wrong:
 *
 * - Every source across every OUT shared one voice-wide stop time, computed
 *   from whichever OUT's DUR was tightest -- so a TIME OUT behind a WAIT
 *   silenced a sibling OUT set to FOLLOW, and reached its own mark early by
 *   exactly the WAIT's gap, because the cap was measured from the note's
 *   start rather than from the delayed OUT's own start.
 * - A WAIT-delayed FOLLOW OUT's fade was scheduled correctly once the first
 *   bug was fixed, and still never got to run: the whole voice was reaped the
 *   moment the classic (silent, muted-by-ADV) voice's own un-extended stop
 *   time arrived, which came before the delayed OUT's own, correctly later,
 *   deadline.
 */
describe('two OUTs behind one THEN, one of them behind a WAIT', () => {
	const twoOutPatch = (dur: number, gapMs: number) => ({
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'freq', type: 'tofreq' },
				{ id: 'main', type: 'osc' },
				{ id: 'output', type: 'out' },
				{ id: 'wait', type: 'wait' },
				{ id: 'delayed', type: 'out' },
				{ id: 'square', type: 'osc' }
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'entry', fromPort: 'pitch', to: 'freq', toPort: 'a' },
				{ from: 'freq', fromPort: 'out', to: 'main', toPort: 'pitch' },
				{ from: 'main', fromPort: 'out', to: 'output', toPort: 'in' },
				{ from: 'entry', fromPort: 'then', to: 'wait', toPort: 'exec' },
				{ from: 'wait', fromPort: 'then', to: 'delayed', toPort: 'exec' },
				{ from: 'square', fromPort: 'out', to: 'delayed', toPort: 'in' },
				{ from: 'freq', fromPort: 'out', to: 'square', toPort: 'pitch' }
			]
		},
		graphParams: { 'wait.gapMs': gapMs, 'delayed.dur': dur, 'delayed.durSec': 1 }
	});

	it('TIME on the delayed OUT does not touch the FOLLOW main OUT, and starts its second where WAIT lets it out', async () => {
		/* The first reported preset's own shape: `delayed.dur` is TIME (1),
		   1 second, behind a 200ms WAIT. Held the whole render, so `main` --
		   plain FOLLOW, no WAIT ahead of it -- has nothing in this graph that
		   should ever silence it early. */
		const r = await run(twoOutPatch(1, 200), 2, 40, 2);
		expect(r.ok).toBe(true);
		const sliceSeconds = 2 / 40;
		const at = (sec: number) => r.envelope[Math.round(sec / sliceSeconds)];
		// Main alone before WAIT lets `delayed` out.
		expect(at(0.1)).toBeGreaterThan(0.35);
		// Both sounding together, mid-way through the delayed OUT's own second.
		expect(at(0.7)).toBeGreaterThan(at(0.1));
		// Past 200ms + 1s = 1.2s, the delayed OUT's TIME has run out -- back to
		// roughly the solo level `main` alone reads, not to silence: `main` is
		// FOLLOW and this graph gives it no reason to have stopped.
		expect(at(1.35)).toBeGreaterThan(0.35);
		expect(at(1.35)).toBeLessThan(at(0.7));
		// And `main` is still there right at the render's own end, held the
		// whole time: nothing in this graph should ever have silenced it.
		expect(r.envelope[r.envelope.length - 1]).toBeGreaterThan(0.3);
	}, 60000);

	it('FOLLOW on the delayed OUT plays exactly as long as the key was held, shifted by WAIT\'s own gap', async () => {
		/* The second reported preset: `delayed.dur` is FOLLOW (0), behind an
		   800ms WAIT, key held 1.2s. `main` (no WAIT ahead of it) fades on its
		   own release-based schedule, unshifted; `delayed` should still be
		   sounding *after* `main` has gone quiet -- alone -- until its own
		   shifted release, 800ms later than `main`'s. A version of this that
		   ignores the WAIT reaps the whole voice the moment `main`'s own
		   stale, un-shifted stop time arrives, which is well before this. */
		const r = await run(twoOutPatch(0, 800), 3, 60, 1.2);
		expect(r.ok).toBe(true);
		const sliceSeconds = 3 / 60;
		const at = (sec: number) => r.envelope[Math.round(sec / sliceSeconds)];
		// Both sounding together, key still held, WAIT has let `delayed` out.
		expect(at(1.0)).toBeGreaterThan(0.35);
		// Past `main`'s own release (key let go at 1.2s) but still within
		// `delayed`'s shifted one -- `main` has gone quiet and `delayed` is
		// sounding alone, not silence.
		expect(at(1.5)).toBeGreaterThan(0.3);
		// Past even `delayed`'s own shifted release (~1.2 + 0.8 + release):
		// silent, because this OUT does eventually let go, on its own schedule.
		expect(
			r.envelope.slice(Math.round(2.4 / sliceSeconds)).every((v) => v <= 0.01),
			`expected silence well past the delayed OUT's own shifted release: ${JSON.stringify(r.envelope.slice(-10))}`
		).toBe(true);
	}, 60000);

	it('TIME on a WAIT-delayed OUT ignores an early real release entirely', async () => {
		/* `run`'s two tests above both play a *timed* note, where the note's
		   start and its release are the same fixed moment -- they could not
		   have caught a bug that only shows up once those two clocks disagree.
		   A real key, released well before the delayed OUT's own second is
		   up, is what actually exercises `releaseVoice`'s own copy of this
		   math.

		   Confirmed with the user directly: WAIT is a delay line for the exec
		   *level*, and TIME/STEP behind one name a fixed length starting the
		   moment that level actually reaches the OUT -- `t + delay`, never
		   `now`. Releasing early must not truncate it, the same as releasing
		   late or never must not extend it. The bug this guards against
		   measured release time leaking in regardless: released at 0.1s, a 1s
		   TIME OUT behind a 200ms WAIT went silent at 1.3s (`now + durCap +
		   delay`) instead of 1.2s (`t + delay + durCap`). */
		const r = await renderWithRelease(twoOutPatch(1, 200), 2, 400, 0.1);
		expect(r.ok).toBe(true);
		const sliceSeconds = 2 / 400;
		const at = (sec: number) => r.envelope[Math.round(sec / sliceSeconds)];
		// `delayed` has joined by the time its own second is under way,
		// despite the key having already come up at 0.1s.
		expect(at(0.9)).toBeGreaterThan(0.35);
		// Silent shortly after 200ms + 1s = 1.2s -- not shifted out to 1.3s by
		// the early release.
		expect(
			r.envelope.slice(Math.round(1.28 / sliceSeconds)).every((v) => v <= 0.01),
			`expected silence at 200ms + 1s, not shifted by the early release: ${JSON.stringify(r.envelope.slice(Math.round(1.1 / sliceSeconds)))}`
		).toBe(true);
	}, 60000);

	it('FOLLOW on a WAIT-delayed OUT replicates the real held duration, shifted by the gap', async () => {
		/* The same real-release gap as above, this time for FOLLOW: releasing
		   at 0.5s (not a timed note's own fixed hold) must still produce a
		   `delayed` OUT that plays for the *actual* 0.5s the key was down,
		   starting 200ms late -- silent shortly after 0.5s + 0.2s, not
		   before, and not shifted by any other clock. */
		const r = await renderWithRelease(twoOutPatch(0, 200), 1.5, 300, 0.5);
		expect(r.ok).toBe(true);
		const sliceSeconds = 1.5 / 300;
		const at = (sec: number) => r.envelope[Math.round(sec / sliceSeconds)];
		// `delayed` still sounding shortly after `main`'s own release, inside
		// its own 200ms-shifted window.
		expect(at(0.6)).toBeGreaterThan(0.3);
		// Silent well past 0.5s + 0.2s + release, not held open indefinitely.
		expect(
			r.envelope.slice(Math.round(1.0 / sliceSeconds)).every((v) => v <= 0.01),
			`expected silence well past the delayed OUT's own shifted release: ${JSON.stringify(r.envelope.slice(-10))}`
		).toBe(true);
	}, 60000);
});
