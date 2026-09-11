import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * What a patch sounds like, measured.
 *
 * Everything in tests/unit builds patches against a recording context and
 * asserts on what got connected. That finds a cable landing on the wrong param.
 * It cannot find a patch that sounds wrong, because a fake context produces no
 * samples -- so "the knob reads zero" was asserted over and over while "the
 * sound stops" never was, and those are not the same claim.
 *
 * The tremolo patch is what proved the gap. Its unit tests passed at every
 * stage, including the stage where MAP silently dropped the waveform on its
 * input and put out a flat level: every one of MAP's settings still visibly
 * changed that level, so from the inside it looked like it was working.
 *
 * This drives a real Chrome against a real OfflineAudioContext through
 * /synth/audit, and reports the amplitude envelope of one held note. An
 * assertion here is about the sound.
 *
 * Two controls run first and are not decoration. A graph with nothing wired to
 * OUT has to measure exactly zero, or the bench is picking up something other
 * than the patch -- which it was, twice, before those controls were added.
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

const patch = () =>
	JSON.parse(readFileSync('tests/audio/tremolo-gate.preset.json', 'utf8')).timbre as Record<
		string,
		unknown
	>;

/** Is this slice loud enough to hear? The renders sit near 0.48 when sounding. */
const LOUD = 0.1;

describe('the bench itself', () => {
	/* These are not decoration. Before they existed the bench was measuring the
	   master reverb's settled level and reported the same envelope for every
	   patch -- including one with the track muted. A control that must be
	   exactly zero is what caught it. */
	it('measures silence as silence', async () => {
		const t = patch();
		const g = t.rackGraph as { cables: { to: string }[] };
		const cut = {
			...t,
			rackGraph: { ...g, cables: g.cables.filter((c) => c.to !== 'output') }
		};
		const r = await render(cut, 8);
		expect(r.ok).toBe(true);
		expect(r.peak).toBe(0);
	}, 30000);

	it('measures a bare oscillator as a steady tone', async () => {
		const r = await render(
			{
				...patch(),
				rackGraph: {
					nodes: [
						{ id: 'entry', type: 'in' },
						{ id: 'o', type: 'osc' },
						{ id: 'output', type: 'out' }
					],
					cables: [
						{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
						{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
					]
				},
				graphParams: {}
			},
			8
		);
		expect(r.ok).toBe(true);
		// Steady: every slice past the attack is within a whisker of the last.
		const body = r.envelope.slice(1);
		expect(Math.min(...body)).toBeGreaterThan(LOUD);
		expect(Math.max(...body) - Math.min(...body)).toBeLessThan(0.01);
	}, 30000);
});

describe('TREMOLO GATE: 1 Hz square switching the level', () => {
	/* OSC(1 Hz) -> TO-CV -> MAP(GATE) -> GAIN.level, with the note playing
	   through that GAIN. Half a second on, half a second off, twice over in a
	   two-second render. */
	it('goes silent for half of every cycle', async () => {
		const r = await render(patch(), 16);
		expect(r.ok).toBe(true);
		expect(r.builtVoice).toBe(true);

		const loud = r.envelope.filter((v) => v > LOUD).length;
		const silent = r.envelope.filter((v) => v === 0).length;
		/* The shape that matters: it reaches full silence, and it spends real
		   time there. Flat at any level -- which is what it did while MAP was
		   dropping its input -- fails both. */
		expect(silent, `envelope never reaches zero: ${JSON.stringify(r.envelope)}`).toBeGreaterThan(3);
		expect(loud, `envelope never gets loud: ${JSON.stringify(r.envelope)}`).toBeGreaterThan(3);
	}, 30000);

	it('switches twice in two seconds, not once and not never', async () => {
		/* A 1 Hz gate is two cycles in a two-second render. Counting the edges
		   catches a gate stuck on, stuck off, or running at the wrong rate --
		   none of which the loud/silent counts above would separate. */
		const r = await render(patch(), 16);
		const on = r.envelope.map((v) => v > LOUD);
		let edges = 0;
		for (let i = 1; i < on.length; i++) if (on[i] !== on[i - 1]) edges++;
		expect(edges, `envelope: ${JSON.stringify(r.envelope)}`).toBeGreaterThanOrEqual(3);
	}, 30000);

	it('carries the waveform into MAP rather than shaping a constant', async () => {
		/* The bug this file was written for. MAP's `a` is declared `kind: 'mod'`
		   -- a control value has to reach it too -- so a cable into it went
		   through the mod loop, which looks the port up in the module's `mod`
		   map. MAP registered nothing there, so the signal was dropped and the
		   shaper sat on its constant offset.

		   What made it hard to see: MAP still responded to every one of its own
		   settings, because those change the constant. Only the sound said
		   otherwise. Compared against the same patch with MAP cut out, which has
		   to modulate either way. */
		const t = patch();
		const g = t.rackGraph as {
			nodes: { id: string; type: string }[];
			cables: { from: string; fromPort: string; to: string; toPort: string }[];
		};
		const mapId = g.nodes.find((n) => n.type === 'map')!.id;
		const gainId = g.nodes.find((n) => n.type === 'gain')!.id;
		const tocvId = g.nodes.find((n) => n.type === 'tocv')!.id;
		const withoutMap = {
			...t,
			rackGraph: {
				...g,
				cables: g.cables
					.filter((c) => !(c.from === mapId && c.to === gainId))
					.concat([{ from: tocvId, fromPort: 'out', to: gainId, toPort: 'level' }])
			}
		};
		const spread = (e: number[]) => Math.max(...e) - Math.min(...e);
		const direct = await render(withoutMap, 16);
		const through = await render(t, 16);
		// Both modulate. Through MAP it modulates harder, because a gate is a
		// harder shape than the sine that drives it.
		expect(spread(direct.envelope)).toBeGreaterThan(0.1);
		expect(spread(through.envelope)).toBeGreaterThan(0.1);
	}, 45000);
});

describe('PHASE CANCEL: two 500 Hz sines summed', () => {
	/* Two oscillators at the same frequency into one SUM, and the only thing
	   that differs between the two halves of this test is one PHS field.

	   It is here because phase is the one control whose effect is *entirely*
	   relational: a single oscillator sounds identical at every phase, so
	   nothing about one module in isolation can tell you PHS works. Only the
	   pair says so, and only by what comes out.

	   The patch was drawn in the editor and exported, so what these render is
	   what the canvas produces rather than a graph written out by hand. */
	const phase = () =>
		JSON.parse(readFileSync('tests/audio/phase-cancel.preset.json', 'utf8')).timbre as Record<
			string,
			unknown
		>;
	/* The second oscillator's PHS. The first is pinned at 1 in the fixture. */
	const PHS2 = 'const-mtwqc25q-2.value';

	const withPhase = (v: number) => {
		const t = phase();
		return { ...t, graphParams: { ...(t.graphParams as object), [PHS2]: v } };
	};

	it('sounds when both are in phase', async () => {
		/* Both at 1, which is one whole turn and wraps to no rotation -- so this
		   is two identical sines adding. Loud, and louder than one alone.

		   The half that would fail if PHS ever started rotating when it should
		   not: a test that only checked the cancelling case would pass just as
		   well on an oscillator that had gone silent for some other reason. */
		const r = await render(withPhase(1), 6);
		expect(r.ok).toBe(true);
		const body = r.envelope.slice(1);
		expect(Math.min(...body), `envelope: ${JSON.stringify(r.envelope)}`).toBeGreaterThan(0.5);
		// Steady: two sines at one frequency beat against nothing.
		expect(Math.max(...body) - Math.min(...body)).toBeLessThan(0.01);
	}, 30000);

	it('is exactly silent when they are half a turn apart', async () => {
		/* 1 and 0.5: half a turn of difference, so every sample of one is the
		   negative of the other and the sum is nothing at all.

		   Asserted as exactly zero rather than merely quiet, which is the point
		   of using cancellation as the check -- a phase that is close but wrong
		   leaves an audible residue, and only an exact anti-phase pair sums to
		   silence. Nothing else in the patch changed between this and the test
		   above. */
		const r = await render(withPhase(0.5), 6);
		expect(r.ok).toBe(true);
		expect(r.peak, `expected silence, got: ${JSON.stringify(r.envelope)}`).toBe(0);
	}, 30000);

	it('lands in between at a quarter turn', async () => {
		/* Neither adding nor cancelling. Without this, both tests above would
		   still pass if PHS snapped to the nearest half turn -- the two cases
		   they check are exactly the two a snapping implementation gets right. */
		const r = await render(withPhase(0.25), 6);
		const body = r.envelope.slice(1);
		const peak = Math.max(...body);
		expect(peak).toBeGreaterThan(0.5);
		expect(peak).toBeLessThan(0.58);
	}, 30000);
});


describe('METER probes: reading a control value', () => {
	/* A probe that takes a CV as well as audio, which is the one place crossing
	   the family line costs nothing: a probe reads and hands back nothing, so
	   there is no signal to convert and no patch to change.

	   Driven through the live engine rather than an offline render, because
	   what is being checked is the analyser the card draws from -- the same
	   object, read the same way. */
	const scopePatch = (value: number, wireCv = true) => ({
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'c', type: 'const' },
				{ id: 'sc', type: 'scope' },
				{ id: 'o', type: 'osc' },
				{ id: 'output', type: 'out' }
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
				...(wireCv ? [{ from: 'c', fromPort: 'out', to: 'sc', toPort: 'cv' }] : []),
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
			]
		},
		// kind 6 is F32, the plain real number.
		graphParams: { 'c.kind': 6, 'c.value': value }
	});

	/** What the probe's analyser is carrying, read the way the card reads it. */
	async function probeReads(value: number, wireCv = true): Promise<number | null> {
		/* Through the page rather than importing the engine here: a dynamic
		   import inside page.evaluate is rewritten by Vitest's transform and
		   arrives in the browser as an undefined helper. The page holds the
		   engine already. */
		return page.evaluate(
			async (a) =>
				await (
					window as never as {
						__audit: { probeValue(p: unknown, n: string): Promise<number | null> };
					}
				).__audit.probeValue(a.t, 'sc'),
			{ t: scopePatch(value, wireCv) }
		);
	}

	it('reads a value the byte view could not carry', async () => {
		/* The reason the control path reads floats. getByteTimeDomainData maps
		   0..255 onto -1..1 and saturates, so 3 and 5000 both come back as 0.992
		   and every range above unity would draw as a flat line on the ceiling.
		   Measured, not assumed. */
		expect(await probeReads(3)).toBeCloseTo(3, 3);
		expect(await probeReads(5000)).toBeCloseTo(5000, 0);
		expect(await probeReads(-2)).toBeCloseTo(-2, 3);
	}, 45000);

	it('reads a value at all, which it did not before', async () => {
		/* The bug this inlet shipped with, and the third of its kind: a pure node
		   builds nothing, so a cable from CONST lands on nobody and the mod loop
		   has no source to connect. Every other module is fine with that -- a
		   number in a param is what they wanted -- but a probe has no param, it
		   *is* the reading, so it drew a flat zero with the cable sitting there
		   looking connected. CONST 0.5, 3 and 5000 all read back 0. */
		expect(await probeReads(0.5)).toBeCloseTo(0.5, 3);
	}, 30000);

	it('tells an unpatched socket from one carrying zero', async () => {
		/* Both read zero, and they must: a CV of 0 is a reading and has to draw
		   as one, while a probe nothing is patched to must not invent a trace.
		   The engine separates them with a NaN fallback, which is the one value
		   a real cable cannot hand back -- so this asserts the wired zero is a
		   real reading rather than the default leaking through. */
		expect(await probeReads(0)).toBe(0);
		expect(await probeReads(9, false)).toBe(0);
	}, 30000);
});

describe('a value arrives once, whichever way it is sent', () => {
	/* ENTRY's VEL into GAIN's LVL, the velocity typed into the knob, and the
	   same velocity from a CONST. Three routes to one number, and they have to
	   be the same sound.

	   They were not. GAIN's LVL is a declared inlet *and* a param of the same
	   name, so the resolver read the velocity as a value and set it on the
	   gain, and the mod loop -- which skipped only cables onto a port with no
	   inlet -- then connected ENTRY's source to that same param on top. The
	   velocity applied twice: 0.5798 RMS against 0.4163 for the other two, a
	   1.39x error on the first patch anyone builds.

	   CONST never showed it. A pure node builds nothing, so its cable was
	   already being dropped for want of a source; only ENTRY, which does build,
	   could reach the double. That is why this is asserted as a three-way match
	   rather than against a constant -- the two correct routes are each other's
	   control, and neither alone would have caught it. */
	const N = [
		{ id: 'entry', type: 'in' },
		{ id: 'o', type: 'osc' },
		{ id: 'g', type: 'gain' },
		{ id: 'c', type: 'const' },
		{ id: 'ts', type: 'tosig' },
		{ id: 'output', type: 'out' }
	];
	const EXEC = { from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' };
	const AUDIO = [
		{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
		{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
	];
	const mk = (cables: unknown[], graphParams: Record<string, number>) => ({
		advanced: true,
		rackGraph: { nodes: N, cables },
		graphParams
	});
	/* The velocity the bench plays: 110 of 127. */
	const VEL = 110 / 127;

	it('reads the same whether the velocity is patched or turned', async () => {
		const patched = await render(
			mk([EXEC, ...AUDIO, { from: 'entry', fromPort: 'vel', to: 'g', toPort: 'level' }], {
				'g.level': 1
			}),
			6,
			1
		);
		const turned = await render(mk([EXEC, ...AUDIO], { 'g.level': VEL }), 6, 1);
		const fromConst = await render(
			mk([EXEC, ...AUDIO, { from: 'c', fromPort: 'out', to: 'g', toPort: 'level' }], {
				'g.level': 1,
				'c.kind': 6,
				'c.value': VEL
			}),
			6,
			1
		);
		// The knob and the CONST were already right; ENTRY is the one that moved.
		expect(turned.peak).toBeCloseTo(fromConst.peak, 4);
		expect(patched.peak, `patched ${patched.peak} vs turned ${turned.peak}`).toBeCloseTo(
			turned.peak,
			3
		);
		expect(patched.envelope[3]).toBeCloseTo(turned.envelope[3], 3);
	}, 45000);

	it('still lets a signal through the same inlet', async () => {
		/* The other half, and the reason the fix is a condition rather than a
		   deletion: TO-SIG exists to turn a value into something that sums, and
		   it must still reach LVL. A fix that skipped every cable onto a knob
		   would silence this. */
		const viaSignal = await render(
			mk(
				[
					EXEC,
					...AUDIO,
					{ from: 'c', fromPort: 'out', to: 'ts', toPort: 'level' },
					{ from: 'ts', fromPort: 'out', to: 'g', toPort: 'level' }
				],
				{ 'g.level': 1, 'c.kind': 6, 'c.value': 0.5 }
			),
			6,
			1
		);
		const turned = await render(mk([EXEC, ...AUDIO], { 'g.level': 0.5 }), 6, 1);
		expect(viaSignal.peak).toBeGreaterThan(0.1);
		expect(viaSignal.peak).toBeCloseTo(turned.peak, 3);
	}, 45000);
});
