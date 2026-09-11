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


describe.each(['scope', 'loud'])('METER probes: %s reading a control value', (probeType) => {
	/* A probe that takes a CV as well as audio, which is the one place crossing
	   the family line costs nothing: a probe reads and hands back nothing, so
	   there is no signal to convert and no patch to change.

	   Driven through the live engine rather than an offline render, because
	   what is being checked is the analyser the card draws from -- the same
	   object, read the same way. */
	/* Parameterised over both probes that take a CV.
	
	   `scope`, `fft` and `loud` share one engine case body, and the `mod.set`
	   plus the pure-value bridge sit inside its `type !== 'fft'` arm. So LOUD's
	   control inlet is the same code as SCOPE's and had no coverage at all --
	   and splitting that body, which FFT's conditional already invites, is
	   exactly how LOUD's would get dropped while SCOPE's tests stayed green. */
	const scopePatch = (value: number, wireCv = true) => ({
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'c', type: 'const' },
				{ id: 'sc', type: probeType },
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

describe('knobs that existed in the sound and nowhere on the card', () => {
	/* RING's DPTH and SPACE's MIX were read by the engine and declared by no
	   catalogue entry. Two consequences, both real: the knob was unreachable
	   from the instrument, and a cable addressed to it was sorted as *audio* --
	   `portKind` finds neither an inlet nor a param, so `isMod` is false -- and
	   summed into the module's signal input instead of controlling it.

	   Declaring them is what makes the port real in both directions. These
	   assert the sound each one is supposed to make, so a future silent
	   undeclaring fails here rather than in a patch nobody can debug. */

	/* Driven by a cable, which is how anyone would actually set it.
	
	   What this asserts is the *sound*: that DPTH is wired to the ring's depth
	   and behaves linearly. It does not assert the declaration -- measured, and
	   worth writing down: with `ringDepth` undeclared the renders are identical,
	   because a CONST is a pure node whose cable is dropped for want of a source
	   either way, and `cvIn` reads the value by raw key regardless. The
	   declaration's effect is that the knob appears on the card at all, which is
	   a catalogue fact and is pinned in tests/unit/module-params. */
	const ringPatch = (depth: number, wired = true) => ({
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'f', type: 'tofreq' },
				{ id: 'car', type: 'osc' },
				{ id: 'c', type: 'const' },
				{ id: 'g2', type: 'tofreq' },
				{ id: 'm', type: 'osc' },
				{ id: 'd', type: 'const' },
				{ id: 'r', type: 'ring' },
				{ id: 'output', type: 'out' }
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'entry', fromPort: 'pitch', to: 'f', toPort: 'a' },
				{ from: 'f', fromPort: 'out', to: 'car', toPort: 'pitch' },
				{ from: 'c', fromPort: 'out', to: 'g2', toPort: 'a' },
				{ from: 'g2', fromPort: 'out', to: 'm', toPort: 'pitch' },
				{ from: 'car', fromPort: 'out', to: 'r', toPort: 'in' },
				{ from: 'm', fromPort: 'out', to: 'r', toPort: 'b' },
				...(wired ? [{ from: 'd', fromPort: 'out', to: 'r', toPort: 'ringDepth' }] : []),
				{ from: 'r', fromPort: 'out', to: 'output', toPort: 'in' }
			]
		},
		// kind 9 is PIT (a note name stored as MIDI); kind 6 is F32.
		graphParams: { 'c.kind': 9, 'c.value': 45, 'd.kind': 6, 'd.value': depth }
	});

	it('RING: a cable sets DPTH, and zero depth is silence', async () => {
		const open = await render(ringPatch(0, false), 4, 1);
		const half = await render(ringPatch(50), 4, 1);
		const none = await render(ringPatch(0), 4, 1);
		// Unwired the depth is its default of 100 -- the full ring.
		expect(open.envelope[2]).toBeGreaterThan(0.2);
		// Linear in the knob's units: half the depth is half the level.
		expect(half.envelope[2] / open.envelope[2]).toBeCloseTo(0.5, 2);
		/* Exactly zero, which is what says DPTH is a depth rather than a blend:
		   a ring modulator at no depth outputs nothing, it does not pass A. And
		   it is what fails if the cable is ever misrouted into the carrier input
		   -- summing there would make this louder, not silent. */
		expect(none.peak, `depth 0 must be silent, got ${none.peak}`).toBe(0);
	}, 45000);

	const spacePatch = (mix: number) => ({
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'e', type: 'excite' },
				{ id: 'sp', type: 'space' },
				{ id: 'output', type: 'out' }
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'e', fromPort: 'out', to: 'sp', toPort: 'in' },
				{ from: 'sp', fromPort: 'out', to: 'output', toPort: 'in' }
			]
		},
		graphParams: { 'e.exLength': 8, 'sp.spaceSize': 40, 'sp.spaceMix': mix }
	});

	it('SPACE: MIX is the difference between a burst and a tail', async () => {
		/* An 8 ms strike into a reverb. Dry, it is over inside the first slice;
		   wet, the convolver spreads it over the impulse's length. Measured as
		   where the sound *stops*, which is what a reverb is, rather than as a
		   level -- the wet leg is quieter than the dry one, so a level assertion
		   would read backwards. */
		const dry = await render(spacePatch(0), 8, 2);
		const wet = await render(spacePatch(100), 8, 2);
		const lastHeard = (e: number[]) => {
			let last = -1;
			for (let i = 0; i < e.length; i++) if (e[i] > 0) last = i;
			return last;
		};
		expect(lastHeard(dry.envelope)).toBe(0);
		expect(
			lastHeard(wet.envelope),
			`wet tail: ${JSON.stringify(wet.envelope)}`
		).toBeGreaterThan(lastHeard(dry.envelope));
	}, 45000);
});

describe('WHEN: the IF socket decides whether the note sounds', () => {
	/* A WHEN whose condition is false stops execution, and a patch downstream of
	   it is silent.

	   It did not. `buildRackGraph` called `whenHolds` with four arguments where
	   six were wanted, so `graph` and `note` arrived undefined and the function
	   returned true before ever reading the socket: a CONST of 1 and a CONST of
	   0 into IF both rendered peak 0.6807. The cable drew, the socket lit, and
	   the branch was never asked -- the same shape as the MAP bug and the
	   fourth of its kind.

	   Fixed by naming the note event once and handing it to both callers, rather
	   than by adding a second literal: two copies of "what this note is" are
	   what let `noteActions` drift to `velocity: 1` under a comment claiming it
	   matched the sound. */
	const N = [
		{ id: 'entry', type: 'in' },
		{ id: 'wh', type: 'when' },
		{ id: 'o', type: 'osc' },
		{ id: 'c', type: 'const' },
		{ id: 'k', type: 'cmp' },
		{ id: 'cb', type: 'const' },
		{ id: 'output', type: 'out' }
	];
	const CHAIN = [
		{ from: 'entry', fromPort: 'then', to: 'wh', toPort: 'exec' },
		{ from: 'wh', fromPort: 'then', to: 'output', toPort: 'exec' },
		{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
	];
	const mk = (cables: unknown[], graphParams: Record<string, number>) => ({
		advanced: true,
		rackGraph: { nodes: N, cables },
		graphParams
	});

	it('passes on a true condition and stops on a false one', async () => {
		const yes = await render(
			mk([...CHAIN, { from: 'c', fromPort: 'out', to: 'wh', toPort: 'cond' }], {
				'c.kind': 6,
				'c.value': 1
			}),
			4,
			1
		);
		const no = await render(
			mk([...CHAIN, { from: 'c', fromPort: 'out', to: 'wh', toPort: 'cond' }], {
				'c.kind': 6,
				'c.value': 0
			}),
			4,
			1
		);
		expect(yes.peak).toBeGreaterThan(0.1);
		expect(no.peak, 'a false IF must stop the branch').toBe(0);
	}, 45000);

	it('passes when nothing is asked of it', async () => {
		/* Unwired, the branch is open -- which is what makes it safe to drop a
		   WHEN on the canvas before deciding what it should test. Without this,
		   "false stops it" would also pass on a WHEN that stopped everything. */
		const open = await render(mk([...CHAIN], {}), 4, 1);
		expect(open.peak).toBeGreaterThan(0.1);
	}, 30000);

	it('reads the velocity the note was actually played at', async () => {
		/* CMP on ENTRY's VEL, which is the patch anyone would build: play harder
		   than this and the branch opens. The bench plays 110 of 127, so 0.5 is
		   under and 0.95 is over.

		   This is the assertion that pins *which* note event the condition is
		   resolved against. `noteActions` built its own with `velocity: 1`
		   hardcoded, so a CMP on VEL answered one way for the choke and another
		   for the sound; both now read the event the sound is built from, and a
		   threshold either side of the real velocity is what proves it. */
		const cmpChain = [
			...CHAIN,
			{ from: 'entry', fromPort: 'vel', to: 'k', toPort: 'a' },
			{ from: 'cb', fromPort: 'out', to: 'k', toPort: 'b' },
			{ from: 'k', fromPort: 'out', to: 'wh', toPort: 'cond' }
		];
		// test 0 is `>`.
		const louder = await render(mk(cmpChain, { 'cb.kind': 6, 'cb.value': 0.5, 'k.test': 0 }), 4, 1);
		const softer = await render(
			mk(cmpChain, { 'cb.kind': 6, 'cb.value': 0.95, 'k.test': 0 }),
			4,
			1
		);
		expect(louder.peak, 'vel 0.866 > 0.5 should sound').toBeGreaterThan(0.1);
		expect(softer.peak, 'vel 0.866 > 0.95 is false, should be silent').toBe(0);
	}, 45000);
});

/* ────────────────────────────────────────────────────────────────────────────
   MATH and LOGIC, measured as sound.

   Every node in this section is *pure*: it builds no audio node at all, and
   its whole output is a number pulled through the resolver. So the only way to
   hear one is to point it at a knob, and the rig below is that -- the node's
   value becomes a GAIN's level, and a 220 Hz sine is the meter.

   That makes the bench read a pure node's output to three decimal places, with
   zero reading *exactly* zero. Which is what makes truth tables testable: a
   comparison is loud or it is silence, with nothing in between to be tolerant
   about.

   Numbers below were measured, not derived. Where a prediction and a reading
   disagreed the reading won and the comment says so.
   ──────────────────────────────────────────────────────────────────────────── */

/** A pure node's value, wired to a gain, with a sine to hear it through. */
function valueRig(
	nodes: { id: string; type: string }[],
	cables: { from: string; fromPort: string; to: string; toPort: string }[],
	graphParams: Record<string, number>
) {
	return {
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'o', type: 'osc' },
				{ id: 'g', type: 'gain' },
				{ id: 'output', type: 'out' },
				...nodes
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' },
				...cables
			]
		},
		graphParams
	};
}

/** A CONST's two fields. `kind` indexes CONST_KINDS: 6 is F32, 9 is PIT. */
const constAt = (id: string, kind: number, value: number) => ({
	[`${id}.kind`]: kind,
	[`${id}.value`]: value
});

/** The level a pure node put out, read off the rendered sine. */
async function valueOf(
	nodes: { id: string; type: string }[],
	cables: { from: string; fromPort: string; to: string; toPort: string }[],
	graphParams: Record<string, number>
): Promise<{ rms: number; peak: number; loud: boolean }> {
	const r = await render(valueRig(nodes, cables, { ...graphParams, 'g.level': 1 }), 4, 1);
	return { rms: r.envelope[2], peak: r.peak, loud: r.peak > 0.1 };
}

describe('CONST: the kind is a socket type, not a scale', () => {
	it('passes its number through unchanged, whatever the kind says', async () => {
		/* F32, PCT, FRQ and I32 all resolve to the number in the field. The kind
		   decides what the outlet *means* -- which inlets will take it -- and
		   does not touch the value. Four kinds, one reading. */
		const at = async (kind: number) =>
			(
				await valueOf(
					[{ id: 'c', type: 'const' }],
					[{ from: 'c', fromPort: 'out', to: 'g', toPort: 'level' }],
					constAt('c', kind, 0.5)
				)
			).rms;
		const f32 = await at(6);
		for (const kind of [5, 7, 2]) expect(await at(kind)).toBeCloseTo(f32, 4);
		expect(f32).toBeCloseTo(0.2406, 3);
	}, 45000);

	it('PIT is the one kind that converts, and it converts by 69', async () => {
		/* A note name is stored as MIDI and published as semitones from the
		   tuning reference, so the outlet is `value - 69`. `CONST_PITCH_KIND`
		   lives in node-graph and is deliberately not imported from the
		   catalogue; if a kind were ever inserted before PIT the index would
		   shift and every patched pitch would land nearly six octaves out.
		
		   Pinned here from the sound rather than by comparing the two constants
		   to each other, which is a check someone fixes by updating both. */
		const pit = async (v: number) =>
			await valueOf(
				[{ id: 'c', type: 'const' }],
				[{ from: 'c', fromPort: 'out', to: 'g', toPort: 'level' }],
				constAt('c', 9, v)
			);
		// 69 - 69 = 0. Exact silence, and a dropped cable would read 1.0 instead.
		expect((await pit(69)).peak).toBe(0);
		// And it is a subtraction rather than a zeroing.
		expect((await pit(69.7071)).rms).toBeCloseTo(0.3403, 3);
	}, 45000);
});

describe('ADD and MUL: the identity of an unwired leg', () => {
	const twoLeg = async (
		type: string,
		a: number | null,
		b: number | null
	): Promise<{ rms: number; peak: number }> => {
		const cables = [{ from: 'n', fromPort: 'out', to: 'g', toPort: 'level' }];
		if (a !== null) cables.push({ from: 'ca', fromPort: 'out', to: 'n', toPort: 'a' });
		if (b !== null) cables.push({ from: 'cb', fromPort: 'out', to: 'n', toPort: 'b' });
		return await valueOf(
			[
				{ id: 'n', type },
				{ id: 'ca', type: 'const' },
				{ id: 'cb', type: 'const' }
			],
			cables,
			{ ...constAt('ca', 6, a ?? 0), ...constAt('cb', 6, b ?? 0) }
		);
	};

	it('ADD sums, and an unwired leg is zero', async () => {
		expect((await twoLeg('add', 0.3, 0.4)).rms).toBeCloseTo(0.3369, 3);
		expect((await twoLeg('add', 0.3, null)).rms).toBeCloseTo(0.1444, 3);
		expect((await twoLeg('add', null, 0.4)).rms).toBeCloseTo(0.1925, 3);
		/* The row no gutted module passes. Ignoring either leg gives 0.24;
		   multiplying gives 0.12; returning a constant gives that constant. Only
		   addition cancels to exactly nothing. */
		expect((await twoLeg('add', 0.5, -0.5)).peak).toBe(0);
		/* And with neither wired the sum is 0, not the knob's 1 -- which is what
		   a dropped `n -> g.level` cable would read instead. That is the control
		   making the other four trustworthy. */
		expect((await twoLeg('add', null, null)).peak).toBe(0);
	}, 60000);

	it('MUL multiplies, and an unwired leg is one', async () => {
		/* The fallbacks are 1, not 0 -- so unwired-both is *louder* than the bare
		   rig, a reading nothing else in the suite produces. If they were ever
		   copy-pasted from ADD, three of these rows flip to silence at once. */
		expect((await twoLeg('mul', null, null)).rms).toBeCloseTo(0.4813, 3);
		expect((await twoLeg('mul', 0.5, null)).rms).toBeCloseTo(0.2406, 3);
		expect((await twoLeg('mul', null, 0.8)).rms).toBeCloseTo(0.385, 3);
		expect((await twoLeg('mul', 0.5, 0.8)).rms).toBeCloseTo(0.1925, 3);
		expect((await twoLeg('mul', 0.5, 0)).peak).toBe(0);
	}, 60000);

	it('ADD and MUL are different operations on the same operands', async () => {
		/* One rig, one pair of numbers, one cable's difference. Without this both
		   suites above could pass on a module that "does something". */
		const sum = await twoLeg('add', 0.5, 0.8);
		const prod = await twoLeg('mul', 0.5, 0.8);
		expect(sum.rms).toBeGreaterThan(prod.rms * 2);
	}, 45000);
});

describe('CMP: six tests, as a truth table', () => {
	/* CMP_TESTS and the evaluator's switch are two hand-written copies of one
	   order. The catalogue says so and says it is pinned by a test -- this is
	   that test, asked of the sound rather than of the arrays, so it survives
	   someone updating both copies consistently and wrongly.
	
	   Two operand pairs, six tests each. No two tests share a column across both
	   rows, so any index shift or swapped pair changes at least one cell. */
	const cmp = async (a: number, b: number, test: number) =>
		(
			await valueOf(
				[
					{ id: 'k', type: 'cmp' },
					{ id: 'ca', type: 'const' },
					{ id: 'cb', type: 'const' }
				],
				[
					{ from: 'ca', fromPort: 'out', to: 'k', toPort: 'a' },
					{ from: 'cb', fromPort: 'out', to: 'k', toPort: 'b' },
					{ from: 'k', fromPort: 'out', to: 'g', toPort: 'level' }
				],
				{ ...constAt('ca', 6, a), ...constAt('cb', 6, b), 'k.test': test }
			)
		).loud;

	it('answers > >= < <= = != in that order', async () => {
		// a > b
		const greater: boolean[] = [];
		for (let t = 0; t < 6; t++) greater.push(await cmp(0.7, 0.3, t));
		expect(greater).toEqual([true, true, false, false, false, true]);
		// a === b
		const equal: boolean[] = [];
		for (let t = 0; t < 6; t++) equal.push(await cmp(0.3, 0.3, t));
		expect(equal).toEqual([false, true, false, true, true, false]);
	}, 120000);
});

describe('LOGIC: five ops, as a truth table', () => {
	/* The third hand-written order list. The table has no two equal columns, so
	   any permutation of the op indices changes at least two cells -- NAND and
	   NOR especially, which are adjacent, both negations, and differ only in the
	   two mixed rows. */
	const logic = async (a: number, b: number, op: number) =>
		(
			await valueOf(
				[
					{ id: 'l', type: 'logic' },
					{ id: 'ca', type: 'const' },
					{ id: 'cb', type: 'const' }
				],
				[
					{ from: 'ca', fromPort: 'out', to: 'l', toPort: 'a' },
					{ from: 'cb', fromPort: 'out', to: 'l', toPort: 'b' },
					{ from: 'l', fromPort: 'out', to: 'g', toPort: 'level' }
				],
				{ ...constAt('ca', 6, a), ...constAt('cb', 6, b), 'l.op': op }
			)
		).loud;

	it('answers AND OR XOR NAND NOR in that order', async () => {
		const row = async (a: number, b: number) => {
			const out: boolean[] = [];
			for (let op = 0; op < 5; op++) out.push(await logic(a, b, op));
			return out;
		};
		expect(await row(0, 0)).toEqual([false, false, false, true, true]);
		expect(await row(0, 1)).toEqual([false, true, true, true, false]);
		expect(await row(1, 0)).toEqual([false, true, true, true, false]);
		expect(await row(1, 1)).toEqual([true, true, false, false, false]);
	}, 180000);

	it('treats any non-zero as true', async () => {
		/* `!== 0`, not `=== 1`. A module comparing against 1 fails the second of
		   these while passing the whole table above, because the table only ever
		   feeds it exact 0s and 1s. */
		expect(await logic(0.5, 0.5, 0)).toBe(true);
		expect(await logic(0.5, 0, 0)).toBe(false);
	}, 45000);
});

describe('NOT: one operand, and true when unwired', () => {
	const not = async (a: number | null) => {
		const cables = [{ from: 'n', fromPort: 'out', to: 'g', toPort: 'level' }];
		if (a !== null) cables.push({ from: 'ca', fromPort: 'out', to: 'n', toPort: 'a' });
		return (
			await valueOf(
				[
					{ id: 'n', type: 'not' },
					{ id: 'ca', type: 'const' }
				],
				cables,
				constAt('ca', 6, a ?? 0)
			)
		).loud;
	};

	it('inverts a truth, and reads any non-zero as one', async () => {
		expect(await not(1)).toBe(false);
		expect(await not(0)).toBe(true);
		// Rules out `=== 1` and `> 0` respectively.
		expect(await not(0.5)).toBe(false);
		expect(await not(-1)).toBe(false);
	}, 60000);

	it('reads true when nothing is wired to it', async () => {
		/* NOT of the false an empty socket is. It is also the row that catches a
		   silently dropped cable: without it, `not(1) === false` would be
		   indistinguishable from the cable never arriving. */
		expect(await not(null)).toBe(true);
	}, 30000);
});

describe('CLAMP: bounds that are sorted before they are applied', () => {
	const clamp = async (a: number, lo: number, hi: number) =>
		(
			await valueOf(
				[
					{ id: 'cl', type: 'clamp' },
					{ id: 'ca', type: 'const' }
				],
				[
					{ from: 'ca', fromPort: 'out', to: 'cl', toPort: 'a' },
					{ from: 'cl', fromPort: 'out', to: 'g', toPort: 'level' }
				],
				{ ...constAt('ca', 6, a), 'cl.lo': lo, 'cl.hi': hi }
			)
		).rms;

	it('holds a value between its bounds', async () => {
		expect(await clamp(0.5, 0, 1)).toBeCloseTo(0.2406, 3);
		expect(await clamp(2, 0, 0.6)).toBeCloseTo(0.2888, 3);
		expect(await clamp(-2, 0.2, 1)).toBeCloseTo(0.0963, 3);
	}, 60000);

	it('works when the bounds are typed the wrong way round', async () => {
		/* `min(max(a, min(lo,hi)), max(lo,hi))`. Written the obvious way --
		   `min(max(a,lo),hi)` -- a LO of 1 above a HI of 0 gives
		   `min(max(0.5,1),0)` = 0 for every input: the module silently becomes a
		   constant and the card still looks like a working clamp.
		
		   These two rows are the ones that fail on that implementation while
		   every row above still passes. */
		expect(await clamp(0.5, 1, 0)).toBeCloseTo(0.2406, 3);
		expect(await clamp(0.9, 1, 0)).toBeCloseTo(0.4332, 3);
	}, 45000);

	it('collapses to a point when both bounds agree', async () => {
		expect(await clamp(0.5, 0.7, 0.7)).toBeCloseTo(0.3369, 3);
	}, 30000);
});

describe('CLAMP: a cable on a bound beats the field', () => {
	it('takes the patched bound over the typed one', async () => {
		/* The precedence `read()` gives every inlet: cable, then stored field,
		   then code default. CLAMP's bounds are declared inlets *and* fields, so
		   they are where that order is visible -- and it lives in the resolver
		   rather than in the clamp function, which only ever sees an
		   already-resolved number. No unit test of `PURE_NODES.clamp` can see it.
		
		   HI is typed at 0.9 in both renders; the second also patches 0.3 into
		   it. If the field won, both would read the same. */
		const withCable = async (wired: boolean) => {
			const cables = [
				{ from: 'ca', fromPort: 'out', to: 'cl', toPort: 'a' },
				{ from: 'cl', fromPort: 'out', to: 'g', toPort: 'level' }
			];
			if (wired) cables.push({ from: 'ch', fromPort: 'out', to: 'cl', toPort: 'hi' });
			return (
				await valueOf(
					[
						{ id: 'cl', type: 'clamp' },
						{ id: 'ca', type: 'const' },
						{ id: 'ch', type: 'const' }
					],
					cables,
					{ ...constAt('ca', 6, 0.5), ...constAt('ch', 6, 0.3), 'cl.lo': 0, 'cl.hi': 0.9 }
				)
			).rms;
		};
		// Field alone: 0.5 is under 0.9, so it passes.
		expect(await withCable(false)).toBeCloseTo(0.2406, 3);
		// Cable at 0.3 clamps it.
		expect(await withCable(true)).toBeCloseTo(0.1444, 3);
	}, 45000);
});

describe('SUM: fan-in is addition, exactly', () => {
	/* Every audio inlet takes any number of cables and Web Audio sums them, so
	   SUM is a named place for that rather than a mechanism of its own. What is
	   worth pinning is that it really is a *sum*.
	
	   Measured at 0.2 per leg, deliberately. At full level four sines hit the
	   master limiter and the readings compress to 0.48 / 0.58 / 0.60 -- which is
	   the limiter working, not SUM failing. Under the ceiling the ratios are
	   1.000 / 2.000 / 3.000 / 4.000 with no rounding at all. */
	const legs = (n: number) => {
		const nodes: { id: string; type: string }[] = [
			{ id: 'entry', type: 'in' },
			{ id: 'output', type: 'out' },
			{ id: 'f', type: 'tofreq' },
			{ id: 's', type: 'sum' }
		];
		const cables = [
			{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
			{ from: 'entry', fromPort: 'pitch', to: 'f', toPort: 'a' },
			{ from: 's', fromPort: 'out', to: 'output', toPort: 'in' }
		];
		const graphParams: Record<string, number> = {};
		for (let i = 0; i < n; i++) {
			nodes.push({ id: `o${i}`, type: 'osc' }, { id: `g${i}`, type: 'gain' });
			cables.push(
				{ from: 'f', fromPort: 'out', to: `o${i}`, toPort: 'pitch' },
				{ from: `o${i}`, fromPort: 'out', to: `g${i}`, toPort: 'in' },
				{ from: `g${i}`, fromPort: 'out', to: 's', toPort: 'in' }
			);
			graphParams[`g${i}.level`] = 0.2;
		}
		return { advanced: true, rackGraph: { nodes, cables }, graphParams };
	};

	it('scales exactly with the number of cables into one inlet', async () => {
		const one = (await render(legs(1), 4, 1)).envelope[2];
		for (const n of [2, 3, 4]) {
			const many = (await render(legs(n), 4, 1)).envelope[2];
			expect(many / one, `${n} legs`).toBeCloseTo(n, 2);
		}
	}, 60000);

	it('adds rather than mixing: an inverted leg cancels', async () => {
		/* Three readings fit a line, but so would an average scaled by three.
		   What separates addition from any kind of mix is that a leg at -1
		   removes another exactly. */
		const cancelling = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'f', type: 'tofreq' },
					{ id: 'a', type: 'osc' },
					{ id: 'b', type: 'osc' },
					{ id: 'inv', type: 'gain' },
					{ id: 's', type: 'sum' },
					{ id: 'output', type: 'out' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'entry', fromPort: 'pitch', to: 'f', toPort: 'a' },
					{ from: 'f', fromPort: 'out', to: 'a', toPort: 'pitch' },
					{ from: 'f', fromPort: 'out', to: 'b', toPort: 'pitch' },
					{ from: 'a', fromPort: 'out', to: 's', toPort: 'in' },
					{ from: 'b', fromPort: 'out', to: 'inv', toPort: 'in' },
					{ from: 'inv', fromPort: 'out', to: 's', toPort: 'in' },
					{ from: 's', fromPort: 'out', to: 'output', toPort: 'in' }
				]
			},
			graphParams: { 'inv.level': -1 }
		};
		expect((await render(cancelling, 4, 1)).peak).toBe(0);
	}, 30000);
});

describe('DIFF: the second inlet is the inverting one', () => {
	const diff = async (wireA: boolean, wireB: boolean) => {
		const cables = [
			{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
			{ from: 'entry', fromPort: 'pitch', to: 'f', toPort: 'a' },
			{ from: 'f', fromPort: 'out', to: 'a', toPort: 'pitch' },
			{ from: 'f', fromPort: 'out', to: 'b', toPort: 'pitch' },
			{ from: 'd', fromPort: 'out', to: 'output', toPort: 'in' }
		];
		if (wireA) cables.push({ from: 'a', fromPort: 'out', to: 'd', toPort: 'in' });
		if (wireB) cables.push({ from: 'b', fromPort: 'out', to: 'd', toPort: 'b' });
		return await render(
			{
				advanced: true,
				rackGraph: {
					nodes: [
						{ id: 'entry', type: 'in' },
						{ id: 'f', type: 'tofreq' },
						{ id: 'a', type: 'osc' },
						{ id: 'b', type: 'osc' },
						{ id: 'd', type: 'diff' },
						{ id: 'output', type: 'out' }
					],
					cables
				},
				graphParams: {}
			},
			4,
			1
		);
	};

	it('cancels two identical signals, and keeps either one alone', async () => {
		/* The `in2` routing, which is selected by the literal port name `b` in
		   the engine. If DIFF stopped returning `in2`, the B cable would fall
		   back to the summing leg and the module would silently become a SUM --
		   0.96 where this asserts exact zero. A unit test counting connections
		   sees two either way.
		
		   All three assertions are load-bearing: the cancellation pins the sign,
		   and each leg alone pins that the inversion changed sign and not level.
		   A B gain of -0.5 would still be quiet in the first, and only the third
		   catches it. */
		expect((await diff(true, true)).peak).toBe(0);
		expect((await diff(true, false)).envelope[2]).toBeCloseTo(0.4815, 3);
		expect((await diff(false, true)).envelope[2]).toBeCloseTo(0.4815, 3);
	}, 60000);
});

describe('NOISE: not a tone', () => {
	it('is broadband, which no oscillator setting reaches', async () => {
		/* Crest factor -- peak over RMS -- is the statistic that tells noise from
		   a tone, and it is level-independent, so it survives any change to the
		   master gain. A sine's is exactly sqrt(2); measured, the bare OSC reads
		   1.414 to three places. Noise reads higher.
		
		   NOISE has no inlets and no params, so this is the only claim about it
		   that a test can make at all -- and it is the one that fails if the
		   buffer ever became a constant, a DC offset or a single repeated
		   sample, all of which keep the RMS steady. */
		const bare = {
			advanced: true,
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
		};
		const noisy = {
			...bare,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'n', type: 'noise' },
					{ id: 'output', type: 'out' }
				],
				cables: [
					{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
					{ from: 'n', fromPort: 'out', to: 'output', toPort: 'in' }
				]
			}
		};
		const crest = (r: { peak: number; envelope: number[] }) =>
			r.peak / Math.max(...r.envelope.slice(1));
		const sine = crest(await render(bare, 8, 1));
		const noise = crest(await render(noisy, 8, 1));
		expect(sine).toBeCloseTo(Math.SQRT2, 2);
		expect(noise).toBeGreaterThan(sine + 0.15);
	}, 45000);
});

/** A patch with ENTRY and OUT already present. */
function graphOf(
	nodes: { id: string; type: string }[],
	cables: { from: string; fromPort: string; to: string; toPort: string }[],
	graphParams: Record<string, number> = {}
) {
	return {
		advanced: true,
		rackGraph: {
			nodes: [{ id: 'entry', type: 'in' }, { id: 'output', type: 'out' }, ...nodes],
			cables
		},
		graphParams
	};
}
const EXEC_TO_OUT = { from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' };

describe('WAIT: the gap flows back along the audio cables', () => {
	/* WAIT delays *execution*, and what has to happen for that to be audible is
	   subtler than it looks: the gap is pushed backwards from the OUT it reaches
	   onto the sources feeding it, so an oscillator downstream of a WAIT starts
	   late. Without that walk every source starts at the note however the gap is
	   set, and WAIT -- whose whole purpose is the flam -- renders identically at
	   0 ms and at 200 ms.
	
	   Measured as *where the sound starts*, in slices of 125 ms. That is a
	   temporal assertion, which no unit test can make: the graph is built
	   correctly either way and only the `start()` times differ. */
	const waitPatch = (gapMs: number) =>
		graphOf(
			[
				{ id: 'w', type: 'wait' },
				{ id: 'o', type: 'osc' }
			],
			[
				{ from: 'entry', fromPort: 'then', to: 'w', toPort: 'exec' },
				{ from: 'w', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'w.gapMs': gapMs }
		);
	const firstHeard = (e: number[]) => e.findIndex((v) => v > 0.1);

	it('starts the sound late, by exactly the gap', async () => {
		// 2 s over 16 slices: one slice is 125 ms.
		expect(firstHeard((await render(waitPatch(0), 16, 2)).envelope)).toBe(0);
		expect(firstHeard((await render(waitPatch(500), 16, 2)).envelope)).toBe(4);
		expect(firstHeard((await render(waitPatch(1000), 16, 2)).envelope)).toBe(8);
	}, 60000);

	it('accumulates through a chain of them', async () => {
		/* 200 + 300 must land where a single 500 does. Pins the running total in
		   `execDelays` rather than a single hop being read. */
		const twoWaits = graphOf(
			[
				{ id: 'w1', type: 'wait' },
				{ id: 'w2', type: 'wait' },
				{ id: 'o', type: 'osc' }
			],
			[
				{ from: 'entry', fromPort: 'then', to: 'w1', toPort: 'exec' },
				{ from: 'w1', fromPort: 'then', to: 'w2', toPort: 'exec' },
				{ from: 'w2', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'w1.gapMs': 200, 'w2.gapMs': 300 }
		);
		expect(firstHeard((await render(twoWaits, 16, 2)).envelope)).toBe(4);
	}, 30000);

	it('takes the earliest arrival when two paths reach the same node', async () => {
		/* A node reached twice runs at the first of them, so a direct cable
		   alongside a delayed one means no delay at all. */
		const both = graphOf(
			[
				{ id: 'w', type: 'wait' },
				{ id: 'o', type: 'osc' }
			],
			[
				{ from: 'entry', fromPort: 'then', to: 'w', toPort: 'exec' },
				{ from: 'w', fromPort: 'then', to: 'output', toPort: 'exec' },
				EXEC_TO_OUT,
				{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'w.gapMs': 1000 }
		);
		expect(firstHeard((await render(both, 16, 2)).envelope)).toBe(0);
	}, 30000);
});

describe('DELAY: a burst arrives when TIME says', () => {
	/* The most precise measurement on this bench, and the only purely temporal
	   one besides WAIT's. An 8 ms strike through a delay lands in exactly one
	   125 ms slice, and which slice is `time / 0.125`.
	
	   It fails on TIME in the wrong units (ms read as s puts the burst in slice
	   0), on `knob()` registering without assigning, on the `createDelay(4)`
	   ceiling silently clamping, and on the delay being bypassed. A unit test
	   can only read back `delayTime.value` -- the number that was just written. */
	const delayPatch = (time: number) =>
		graphOf(
			[
				{ id: 'e', type: 'excite' },
				{ id: 'd', type: 'delay' }
			],
			[
				EXEC_TO_OUT,
				{ from: 'e', fromPort: 'out', to: 'd', toPort: 'in' },
				{ from: 'd', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'e.exLength': 8, 'd.delayTime': time }
		);

	it('lands in the slice the time points at', async () => {
		for (const [time, slice] of [
			[0.25, 2],
			[0.5, 4],
			[0.75, 6],
			[1.0, 8]
		] as const) {
			const r = await render(delayPatch(time), 16, 2);
			const heard = r.envelope.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
			expect(heard, `TIME ${time}s`).toEqual([slice]);
		}
	}, 90000);
});

describe('FILTER: the cutoff is a frequency, and a value can reach it', () => {
	const noiseThrough = (graphParams: Record<string, number>) =>
		graphOf(
			[
				{ id: 'n', type: 'noise' },
				{ id: 'fl', type: 'filter' }
			],
			[
				EXEC_TO_OUT,
				{ from: 'n', fromPort: 'out', to: 'fl', toPort: 'in' },
				{ from: 'fl', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'fl.type': 0, 'fl.q': 1, ...graphParams }
		);

	it('passes more of the noise the higher it is opened', async () => {
		/* Noise is the source because it has energy everywhere, which is the only
		   input a cutoff is legible from as a level. A cutoff that never reached
		   the node leaves all four readings at the code default of 4000 and they
		   collapse to one number. */
		const at = async (cutoff: number) => (await render(noiseThrough({ 'fl.cutoff': cutoff }), 4, 1)).envelope[2];
		const readings = [await at(100), await at(1000), await at(8000), await at(20000)];
		for (let i = 1; i < readings.length; i++) {
			expect(readings[i], `cutoff step ${i}`).toBeGreaterThan(readings[i - 1] * 1.1);
		}
		expect(readings[0]).toBeLessThan(0.05);
		expect(readings[3]).toBeGreaterThan(0.3);
	}, 60000);

	it('takes a computed value at a frequency destination', async () => {
		/* MUL into the cutoff: arithmetic reaching a *frequency* rather than a
		   level, which is a different code path -- `knob(f.frequency, …)` against
		   `knob(g.gain, …)` -- and one a level test cannot cover. If the cable
		   were dropped, the stored 4000 would apply to all three and the readings
		   would be identical. */
		const at = async (k: number) =>
			(
				await render(
					graphOf(
						[
							{ id: 'n', type: 'noise' },
							{ id: 'fl', type: 'filter' },
							{ id: 'm', type: 'mul' },
							{ id: 'c1', type: 'const' },
							{ id: 'c2', type: 'const' }
						],
						[
							EXEC_TO_OUT,
							{ from: 'c1', fromPort: 'out', to: 'm', toPort: 'a' },
							{ from: 'c2', fromPort: 'out', to: 'm', toPort: 'b' },
							{ from: 'm', fromPort: 'out', to: 'fl', toPort: 'cutoff' },
							{ from: 'n', fromPort: 'out', to: 'fl', toPort: 'in' },
							{ from: 'fl', fromPort: 'out', to: 'output', toPort: 'in' }
						],
						{ ...constAt('c1', 6, 100), ...constAt('c2', 6, k), 'fl.type': 0, 'fl.q': 1, 'fl.cutoff': 4000 }
					),
					4,
					1
				)
			).envelope[2];
		const low = await at(1);
		const mid = await at(40);
		const high = await at(150);
		expect(mid).toBeGreaterThan(low * 3);
		expect(high).toBeGreaterThan(mid);
	}, 60000);
});

describe('ENV: a signal takes the knob and the tail reaches silence', () => {
	const envPatch = (graphParams: Record<string, number>, wired = true) => {
		const cables = [
			EXEC_TO_OUT,
			{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
			{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
		];
		if (wired) cables.push({ from: 'e', fromPort: 'out', to: 'g', toPort: 'level' });
		return graphOf(
			[
				{ id: 'o', type: 'osc' },
				{ id: 'g', type: 'gain' },
				{ id: 'e', type: 'env' }
			],
			cables,
			{ 'g.level': 1, ...graphParams }
		);
	};

	it('rises over the attack and falls to exactly nothing at zero sustain', async () => {
		/* ENV builds real audio nodes, so a cable from it is a *signal* -- the
		   knob reads 0 and the envelope alone decides the level. If that rule
		   regressed, the knob's 1 would sit under the envelope and the tail would
		   read 0.48 instead of 0: the gate that never closes, which is the bug
		   this whole file was written for, at a different node. */
		const r = await render(
			envPatch({ 'e.envA': 0.5, 'e.envD': 0.001, 'e.envS': 0, 'e.envR': 0.001 }),
			16,
			2
		);
		// Rising through the half-second attack.
		expect(r.envelope[0]).toBeLessThan(0.1);
		expect(r.envelope[3]).toBeGreaterThan(0.3);
		/* And then the envelope's floor, held flat.
		
		   Not exactly zero, and the difference is the point:
		   `exponentialRampToValueAtTime` cannot reach zero, so the decay lands on
		   0.0001 -- about -80 dB, inaudible -- and stays there. Asserted as that
		   constant rather than as "small", because a floor that is *flat* is what
		   says the ramp completed. A decay still in progress, or a knob leaking
		   under the envelope, gives a changing number here. */
		for (let i = 6; i < 16; i++) expect(r.envelope[i], `slice ${i}`).toBeCloseTo(0.0001, 4);
	}, 30000);

	it('holds at full sustain, so the silence above is the envelope', async () => {
		/* The control. Same patch, one field: with sustain at full the tail is
		   loud, which proves the zeros come from ENV's shape rather than from a
		   broken oscillator or a dropped exec cable. */
		const r = await render(
			envPatch({ 'e.envA': 0.5, 'e.envD': 0.001, 'e.envS': 100, 'e.envR': 0.001 }),
			16,
			2
		);
		for (let i = 6; i < 16; i++) expect(r.envelope[i]).toBeGreaterThan(0.4);
	}, 30000);

	it('leaves the knob alone when nothing is patched', async () => {
		const r = await render(envPatch({}, false), 16, 2);
		expect(Math.min(...r.envelope.slice(1))).toBeGreaterThan(0.4);
	}, 30000);
});

describe('FOLLOW and TO-CV: two doors, and only one rectifies', () => {
	/* Both bring audio across to the control side and they are not the same
	   node. FOLLOW rectifies and smooths -- it answers "how loud is this" -- so a
	   sine arrives as a run of humps at twice the rate and never goes negative.
	   TO-CV passes the waveform through at unity, sign and all.
	
	   Run together and compared, because either alone would pass on a module
	   that merely "modulates something". */
	const bridge = (type: string) => {
		const graphParams: Record<string, number> = { 'lfo.pitch': 2, 'g.level': 1 };
		if (type === 'follow') {
			graphParams['br.resp'] = 8;
			graphParams['br.sens'] = 1.5708;
		}
		return graphOf(
			[
				{ id: 'lfo', type: 'osc' },
				{ id: 'br', type },
				{ id: 'o', type: 'osc' },
				{ id: 'g', type: 'gain' }
			],
			[
				EXEC_TO_OUT,
				{ from: 'lfo', fromPort: 'out', to: 'br', toPort: 'in' },
				{ from: 'br', fromPort: 'out', to: 'g', toPort: 'level' },
				{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			graphParams
		);
	};

	it('both carry the modulation across the family line', async () => {
		const tocv = await render(bridge('tocv'), 16, 2);
		const follow = await render(bridge('follow'), 16, 2);
		const spread = (e: number[]) => Math.max(...e) - Math.min(...e);
		expect(spread(tocv.envelope)).toBeGreaterThan(0.05);
		expect(spread(follow.envelope)).toBeGreaterThan(0.05);
	}, 45000);

	it('FOLLOW moves further, because a rectified sine is a bigger swing', async () => {
		/* The claim that makes them two modules rather than one. Measured:
		   FOLLOW spreads 0.215 against TO-CV's 0.102. If FOLLOW's rectifier curve
		   were lost -- an identity WaveShaper, say -- it would become TO-CV and
		   the two would converge. */
		const tocv = await render(bridge('tocv'), 16, 2);
		const follow = await render(bridge('follow'), 16, 2);
		const spread = (e: number[]) => Math.max(...e) - Math.min(...e);
		expect(spread(follow.envelope)).toBeGreaterThan(spread(tocv.envelope) * 1.5);
	}, 45000);
});

/* ────────────────────────────────────────────────────────────────────────────
   STEREO routing.

   The bench reads channel 0 -- the left. That is what makes this group
   testable at all: "it went left" is a level and "it went right" is silence.
   It is also the trap, so every test here carries a control proving the sound
   exists somewhere, or a right-panned render is indistinguishable from a
   broken patch.
   ──────────────────────────────────────────────────────────────────────────── */

describe('PAN: equal power, measured in the left channel', () => {
	const panned = (pos: number) =>
		graphOf(
			[
				{ id: 'o', type: 'osc' },
				{ id: 'pn', type: 'pan' }
			],
			[
				EXEC_TO_OUT,
				{ from: 'o', fromPort: 'out', to: 'pn', toPort: 'in' },
				{ from: 'pn', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'pn.panPos': pos }
		);

	it('moves the sound across, and hard right is silence on the left', async () => {
		const at = async (pos: number) => await render(panned(pos), 4, 1);
		const left = await at(-100);
		const centre = await at(0);
		const right = await at(100);
		// Monotone across the sweep.
		expect(left.envelope[2]).toBeGreaterThan(centre.envelope[2]);
		expect(centre.envelope[2]).toBeGreaterThan(0.1);
		/* Exactly nothing on the left when panned hard right. The control above
		   is what says this is a pan rather than a mute. */
		expect(right.peak).toBe(0);
	}, 60000);

	it('scales POS from the knob units, not the param units', async () => {
		/* The knob reads -100..100 and `StereoPannerNode.pan` wants -1..1, so
		   `knobAt` scales by 0.01 where the cable lands. Lose that and a POS of
		   50 clamps to hard right -- silence -- instead of landing partway.
		
		   50 is the load-bearing value: at the endpoints a lost scale is
		   indistinguishable from a working one, because both clamp to the same
		   place. Measured at 0.258 against 0.524 at centre. */
		const half = await render(panned(50), 4, 1);
		expect(half.envelope[2]).toBeGreaterThan(0.15);
		expect(half.envelope[2]).toBeLessThan(0.35);
	}, 30000);
});

describe('SPLIT: L and R come out of the ports they are named for', () => {
	/* A 2x2 table: two pan positions, two outlets. A SPLIT that swapped its
	   outlets fails two cells; one that sent both to the same channel fails two
	   different cells; one that passed its input through makes all four loud.
	
	   This is what enforces the coupling between the catalogue's port id `r` and
	   the engine's `outletOf`, which resolves it by literal string. BREAK had
	   exactly this bug -- the port named `side` resolved to the mid gain. */
	const splitAt = async (pos: number, outlet: string) =>
		await render(
			graphOf(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'pn', type: 'pan' },
					{ id: 'sp', type: 'split' }
				],
				[
					EXEC_TO_OUT,
					{ from: 'o', fromPort: 'out', to: 'pn', toPort: 'in' },
					{ from: 'pn', fromPort: 'out', to: 'sp', toPort: 'in' },
					{ from: 'sp', fromPort: outlet, to: 'output', toPort: 'in' }
				],
				{ 'pn.panPos': pos }
			),
			4,
			1
		);

	it('takes the side the source is actually on', async () => {
		// Hard left: the L outlet has it, the R outlet has nothing.
		expect((await splitAt(-100, 'out')).envelope[2]).toBeCloseTo(0.4813, 3);
		expect((await splitAt(-100, 'r')).peak).toBe(0);
		// Hard right: the mirror.
		expect((await splitAt(100, 'out')).peak).toBe(0);
		expect((await splitAt(100, 'r')).envelope[2]).toBeCloseTo(0.4813, 3);
	}, 90000);
});

describe('MERGE: a signal goes to the channel its inlet names', () => {
	const mergedTo = async (port: string) =>
		await render(
			graphOf(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'mg', type: 'merge' }
				],
				[
					EXEC_TO_OUT,
					{ from: 'o', fromPort: 'out', to: 'mg', toPort: port },
					{ from: 'mg', fromPort: 'out', to: 'output', toPort: 'in' }
				]
			),
			4,
			1
		);

	it('puts L on the left and R on the right', async () => {
		/* One graph, one port name changed, and the reading goes from full level
		   to exact silence. A MERGE that ignored its port assignment, or that
		   summed both inlets onto both channels, reads loud in both. */
		expect((await mergedTo('in')).envelope[2]).toBeGreaterThan(0.4);
		expect((await mergedTo('r')).peak).toBe(0);
	}, 45000);
});

describe('MONO: folding a pair down, at half each', () => {
	/* `0.5L + 0.5R`. Three readings pin both coefficients with no freedom: the
	   first fixes their sum, the third fixes one of them alone, and the exact
	   zero fixes their equality and rules out any rectification. */
	const folded = async (rightGain: number) =>
		await render(
			graphOf(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'gr', type: 'gain' },
					{ id: 'mg', type: 'merge' },
					{ id: 'mn', type: 'mono' }
				],
				[
					EXEC_TO_OUT,
					{ from: 'o', fromPort: 'out', to: 'mg', toPort: 'in' },
					{ from: 'o', fromPort: 'out', to: 'gr', toPort: 'in' },
					{ from: 'gr', fromPort: 'out', to: 'mg', toPort: 'r' },
					{ from: 'mg', fromPort: 'out', to: 'mn', toPort: 'in' },
					{ from: 'mn', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ 'gr.level': rightGain }
			),
			4,
			1
		);

	it('keeps a centred signal at its level rather than doubling it', async () => {
		expect((await folded(1)).envelope[2]).toBeCloseTo(0.4813, 3);
	}, 30000);

	it('cancels a pair that is out of phase, which is what says it folded', async () => {
		/* The assertion a passthrough cannot fake. The bench reads channel 0, so
		   a MONO that did nothing would leave +s there and read full level here.
		   Only an actual L+R sum cancels. */
		expect((await folded(-1)).peak).toBe(0);
	}, 30000);

	it('halves a signal present on one side only', async () => {
		expect((await folded(0)).envelope[2]).toBeCloseTo(0.2406, 3);
	}, 30000);
});

/* ────────────────────────────────────────────────────────────────────────────
   The converters, measured by beat frequency.

   RMS cannot read a frequency. But two sines at nearly the same frequency,
   multiplied together, give an envelope that rises and falls at their
   *difference* -- and per-slice RMS reads that directly. So a converter is
   tested by pointing an oscillator at it, ring-modulating against a reference
   pinned at the frequency the conversion should produce, and counting how many
   times the envelope crosses its own midpoint.

   Zero beats means the conversion landed exactly. Many beats means it did not.
   The reference is what carries the claim, so each test moves the reference or
   the conversion and never both.

   One limit, worth knowing: a beat much above ~5 Hz aliases at 32 slices over
   2 s and reads as few edges again. A tuning of 430 gives a 12 Hz beat and
   counts 1 edge, the same as a perfect match -- so the discriminating values
   below are chosen to beat slowly.
   ──────────────────────────────────────────────────────────────────────────── */

/** How many times the envelope crosses its own midpoint: the beat count. */
function beatEdges(envelope: number[]): number {
	const lo = Math.min(...envelope);
	const hi = Math.max(...envelope);
	const mid = (lo + hi) / 2;
	let edges = 0;
	for (let i = 1; i < envelope.length; i++) {
		if (envelope[i] > mid !== envelope[i - 1] > mid) edges++;
	}
	return edges;
}

/**
 * An oscillator driven through `chain`, beating against a reference.
 *
 * `chain` supplies the cables and nodes that end at `tf.out -> o.pitch`; the
 * reference oscillator is pinned by `refHz` and ring-modulates the result.
 */
function beatRig(
	nodes: { id: string; type: string }[],
	cables: { from: string; fromPort: string; to: string; toPort: string }[],
	refHz: number,
	graphParams: Record<string, number>
) {
	return graphOf(
		[
			...nodes,
			{ id: 'o', type: 'osc' },
			{ id: 'ref', type: 'osc' },
			{ id: 'tc', type: 'tocv' },
			{ id: 'g', type: 'gain' }
		],
		[
			EXEC_TO_OUT,
			...cables,
			{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
			{ from: 'ref', fromPort: 'out', to: 'tc', toPort: 'in' },
			{ from: 'tc', fromPort: 'out', to: 'g', toPort: 'level' },
			{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
		],
		{ 'ref.pitch': refHz, 'g.level': 1, ...graphParams }
	);
}

describe('TO-FREQ: a pitch becomes the frequency it names', () => {
	it('lands on the played frequency, and the tuning reference moves it', async () => {
		/* ENTRY publishes semitones from master tuning and TO-FREQ inverts that,
		   so at A4 = 440 the oscillator sits exactly on the note the key plays --
		   the reference is pinned there and there is no beat at all.
		
		   At A4 = 443 the conversion lands 3 Hz away and the envelope beats. That
		   pair is the whole assertion: the same graph, one field, zero beats
		   against many. */
		const atTuning = async (tuning: number) =>
			beatEdges(
				(
					await render(
						beatRig(
							[{ id: 'tf', type: 'tofreq' }],
							[
								{ from: 'entry', fromPort: 'pitch', to: 'tf', toPort: 'a' },
								{ from: 'tf', fromPort: 'out', to: 'o', toPort: 'pitch' }
							],
							415.3,
							{ 'tf.tuning': tuning }
						),
						32,
						2
					)
				).envelope
			);
		expect(await atTuning(440), 'A4=440 should land on the note exactly').toBeLessThanOrEqual(2);
		expect(await atTuning(443), 'A4=443 should beat against it').toBeGreaterThan(10);
	}, 60000);
});

describe('CONST PIT: a note name converts by exactly 69', () => {
	it('reaches the frequency the note names, at two different notes', async () => {
		/* MIDI 69 is A4 = 440 and MIDI 81 is A5 = 880. Both must land silently
		   against a reference pinned there.
		
		   Two notes rather than one, deliberately: if the -69 offset were dropped
		   the conversion would give the same wrong answer for every input, and a
		   single note could still be made to pass by choosing the reference. The
		   third case beats, so "no beat" is not simply what this rig always does. */
		const pit = async (midi: number, refHz: number) =>
			beatEdges(
				(
					await render(
						beatRig(
							[
								{ id: 'cp', type: 'const' },
								{ id: 'tf', type: 'tofreq' }
							],
							[
								{ from: 'cp', fromPort: 'out', to: 'tf', toPort: 'a' },
								{ from: 'tf', fromPort: 'out', to: 'o', toPort: 'pitch' }
							],
							refHz,
							{ ...constAt('cp', 9, midi), 'tf.tuning': 440 }
						),
						32,
						2
					)
				).envelope
			);
		expect(await pit(69, 440), 'MIDI 69 is 440 Hz').toBeLessThanOrEqual(2);
		expect(await pit(81, 880), 'MIDI 81 is 880 Hz').toBeLessThanOrEqual(2);
		// And the rig does detect a miss.
		expect(await pit(69, 443)).toBeGreaterThan(10);
	}, 90000);
});

describe('TRSP: semitones added to a pitch, still a pitch', () => {
	it('moves a note by an octave when given twelve', async () => {
		/* ENTRY's pitch plus 12, converted and beaten against a reference an
		   octave above the played note. Both legs of the addition matter: drop
		   `a` and the result is 12 semitones from A4; drop `b` and it is the
		   played note. Either lands somewhere the reference is not. */
		const trsp = async (semitones: number, refHz: number) =>
			beatEdges(
				(
					await render(
						beatRig(
							[
								{ id: 'ct', type: 'const' },
								{ id: 'tr', type: 'trsp' },
								{ id: 'tf', type: 'tofreq' }
							],
							[
								{ from: 'entry', fromPort: 'pitch', to: 'tr', toPort: 'a' },
								{ from: 'ct', fromPort: 'out', to: 'tr', toPort: 'b' },
								{ from: 'tr', fromPort: 'out', to: 'tf', toPort: 'a' },
								{ from: 'tf', fromPort: 'out', to: 'o', toPort: 'pitch' }
							],
							refHz,
							constAt('ct', 6, semitones)
						),
						32,
						2
					)
				).envelope
			);
		// The played note is 415.3 Hz; an octave up is 830.6.
		expect(await trsp(12, 830.6), '+12 should be an octave up').toBeLessThanOrEqual(2);
		expect(await trsp(0, 415.3), '+0 should be the note itself').toBeLessThanOrEqual(2);
		// Against a reference 3 Hz off the octave, it beats.
		expect(await trsp(12, 833.6)).toBeGreaterThan(8);
	}, 90000);
});

describe('TO-PITCH: the lossy direction, round-tripped', () => {
	it('returns the frequency it was given when both ends agree', async () => {
		/* 523.25 Hz to a pitch and back. With both converters on 440 the round
		   trip is exact and there is no beat; detune only the *first* one and the
		   pair no longer cancels.
		
		   This pins both converters against each other's inverse, which is the
		   only property of TO-PITCH the bench can reach numerically. */
		const roundTrip = async (toPitchTuning: number) =>
			beatEdges(
				(
					await render(
						beatRig(
							[
								{ id: 'cf', type: 'const' },
								{ id: 'tp', type: 'topitch' },
								{ id: 'tf', type: 'tofreq' }
							],
							[
								{ from: 'cf', fromPort: 'out', to: 'tp', toPort: 'a' },
								{ from: 'tp', fromPort: 'out', to: 'tf', toPort: 'a' },
								{ from: 'tf', fromPort: 'out', to: 'o', toPort: 'pitch' }
							],
							523.25,
							{ ...constAt('cf', 7, 523.25), 'tp.tuning': toPitchTuning, 'tf.tuning': 440 }
						),
						32,
						2
					)
				).envelope
			);
		expect(await roundTrip(440), 'the round trip should be exact').toBeLessThanOrEqual(2);
		expect(await roundTrip(438), 'a detuned first leg should not cancel').toBeGreaterThan(10);
	}, 60000);
});

describe('PWM: the duty cycle is a width, and it is symmetric', () => {
	const pwmAt = async (width: number) =>
		(
			await render(
				graphOf(
					[
						{ id: 'f', type: 'tofreq' },
						{ id: 'pm', type: 'pwm' },
						{ id: 'cw', type: 'const' },
						{ id: 'gg', type: 'gain' }
					],
					[
						EXEC_TO_OUT,
						{ from: 'entry', fromPort: 'pitch', to: 'f', toPort: 'a' },
						{ from: 'f', fromPort: 'out', to: 'pm', toPort: 'pitch' },
						{ from: 'cw', fromPort: 'out', to: 'pm', toPort: 'pw' },
						{ from: 'pm', fromPort: 'out', to: 'gg', toPort: 'in' },
						{ from: 'gg', fromPort: 'out', to: 'output', toPort: 'in' }
					],
					// Attenuated, so four renders stay clear of the master limiter.
					{ ...constAt('cw', 6, width), 'gg.level': 0.3 }
				),
				4,
				1
			)
		).envelope[2];

	it('is loudest at half and quieter towards either edge', async () => {
		/* A rectangle's RMS peaks at a 50% duty cycle and falls as it narrows --
		   the same amount whichever way, since a 5% pulse and a 95% one are each
		   other's inverse. If PW never arrived, all four readings collapse onto
		   one: the documented MAP failure shape at a different module. */
		const half = await pwmAt(0.5);
		const narrow = await pwmAt(0.05);
		const wide = await pwmAt(0.95);
		expect(half).toBeGreaterThan(narrow * 1.8);
		expect(half).toBeGreaterThan(wide * 1.8);
		/* The symmetry, which is what catches a clamp applied to one side only.
		   A unit test reading back `delayTime.value` sees a plausible number at
		   both ends. */
		expect(Math.abs(narrow - wide)).toBeLessThan(0.01);
	}, 60000);

	it('moves continuously rather than snapping', async () => {
		const mid = await pwmAt(0.15);
		expect(mid).toBeGreaterThan(await pwmAt(0.05));
		expect(mid).toBeLessThan(await pwmAt(0.5));
	}, 45000);
});

describe('EXCITE: a burst whose length is LEN', () => {
	const burst = async (lengthMs: number) =>
		(
			await render(
				graphOf(
					[{ id: 'e', type: 'excite' }],
					[EXEC_TO_OUT, { from: 'e', fromPort: 'out', to: 'output', toPort: 'in' }],
					{ 'e.exLength': lengthMs, 'e.exTone': 3000 }
				),
				16,
				2
			)
		).envelope;

	it('is over inside one slice when short, and spills into the next when long', async () => {
		/* 125 ms per slice. An 8 ms strike lives entirely in slice 0; a 200 ms one
		   reaches slice 1. Measured as *where the sound stops*, which is what LEN
		   is -- and which fails if LEN is read in seconds (every slice loud), if
		   the gain envelope is dropped (a noise source at a steady level), or if
		   the module is silent, which it once was. */
		const heard = (e: number[]) => e.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
		expect(heard(await burst(8))).toEqual([0]);
		expect(heard(await burst(200))).toEqual([0, 1]);
	}, 45000);
});

describe('MAP: nine shapes, nine different numbers', () => {
	/* MAP_SHAPES and the evaluator's switch are the fourth hand-written pair of
	   orders in this catalogue, and the one with the most entries to drift. Fed
	   one input, each shape puts out a different level -- so the sweep is a
	   fingerprint of the whole table, read off the sound.
	
	   Measured with a CONST at 0.75 into 0..1. An index off by one turns EXP
	   (0.562) into EXP2 (0.316): a 44% level error, far outside any tolerance. */
	const mapAt = async (shape: number) =>
		(
			await valueOf(
				[
					{ id: 'c', type: 'const' },
					{ id: 'm', type: 'map' }
				],
				[
					{ from: 'c', fromPort: 'out', to: 'm', toPort: 'a' },
					{ from: 'm', fromPort: 'out', to: 'g', toPort: 'level' }
				],
				{
					...constAt('c', 6, 0.75),
					'm.shape': shape,
					'm.inLo': 0,
					'm.inHi': 1,
					'm.outLo': 0,
					'm.outHi': 1
				}
			)
		).rms;

	it('gives each shape its own reading, in the catalogue order', async () => {
		/* GATE and ST4 both land on 1.0 at this input -- a threshold above the
		   middle, and a four-step quantiser whose top step is the top -- so they
		   are the one pair this input cannot separate. Everything else is
		   distinct, and the ordering below is what pins the index. */
		const readings: number[] = [];
		for (let shape = 0; shape < 9; shape++) readings.push(await mapAt(shape));
		const [gate, exp, exp2, log, log2, ease, st4, st8, inv] = readings;
		expect(gate).toBeCloseTo(0.4813, 3);
		expect(exp).toBeCloseTo(0.2707, 3);
		expect(exp2).toBeCloseTo(0.1523, 3);
		expect(log).toBeCloseTo(0.4168, 3);
		expect(log2).toBeCloseTo(0.4479, 3);
		expect(ease).toBeCloseTo(0.4061, 3);
		expect(st4).toBeCloseTo(0.4813, 3);
		expect(st8).toBeCloseTo(0.4125, 3);
		expect(inv).toBeCloseTo(0.5632, 3);
		/* The relations that survive a change of input, stated separately so a
		   failure says which property broke rather than only which number moved:
		   the exponentials bend down, the logarithms bend up, and the two
		   strengths of each are ordered. */
		expect(exp2).toBeLessThan(exp);
		expect(exp).toBeLessThan(log);
		expect(log).toBeLessThan(log2);
	}, 90000);
});

describe('GAIN: a level with a sign', () => {
	const at = async (level: number) =>
		await render(
			graphOf(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'g', type: 'gain' }
				],
				[
					EXEC_TO_OUT,
					{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
					{ from: 'g', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ 'g.level': level }
			),
			4,
			1
		);

	it('scales, and zero is silence', async () => {
		expect((await at(1)).envelope[2]).toBeCloseTo(0.4813, 3);
		expect((await at(0.5)).envelope[2]).toBeCloseTo(0.2406, 3);
		expect((await at(0)).peak).toBe(0);
	}, 45000);

	it('inverts at a negative level, which RMS alone cannot see', async () => {
		/* -1 and +1 read identically as a level, so the sign has to be measured
		   by cancellation: an inverted copy summed against the original is
		   silence. GAIN doubles as the only inverter in the catalogue, and a
		   range clamp added to `level` -- an easy "fix" for someone worried about
		   phase -- turns this from exact zero into double volume, a 100% error
		   the +1 reading still calls correct. */
		const cancelling = graphOf(
			[
				{ id: 'f', type: 'tofreq' },
				{ id: 'a', type: 'osc' },
				{ id: 'b', type: 'osc' },
				{ id: 'g', type: 'gain' },
				{ id: 's', type: 'sum' }
			],
			[
				EXEC_TO_OUT,
				{ from: 'entry', fromPort: 'pitch', to: 'f', toPort: 'a' },
				{ from: 'f', fromPort: 'out', to: 'a', toPort: 'pitch' },
				{ from: 'f', fromPort: 'out', to: 'b', toPort: 'pitch' },
				{ from: 'a', fromPort: 'out', to: 's', toPort: 'in' },
				{ from: 'b', fromPort: 'out', to: 'g', toPort: 'in' },
				{ from: 'g', fromPort: 'out', to: 's', toPort: 'in' },
				{ from: 's', fromPort: 'out', to: 'output', toPort: 'in' }
			],
			{ 'g.level': -1 }
		);
		expect((await render(cancelling, 4, 1)).peak).toBe(0);
		// And the magnitude is still 1: half the level is half the sound.
		expect((await at(-0.5)).envelope[2]).toBeCloseTo(0.2406, 3);
	}, 45000);
});

describe('the exec wire gates the sound', () => {
	it('is silent with no white cable reaching OUT', async () => {
		/* There is no "unless the patch draws no exec cable" exemption, and the
		   comment in `execReach` records that the exemption has been
		   reintroduced twice. The seed patch draws the cable instead, so the
		   simplest patch is still playable without building one.
		
		   Same graph, one cable: full level against exact silence. */
		const withExec = graphOf(
			[{ id: 'o', type: 'osc' }],
			[EXEC_TO_OUT, { from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }]
		);
		const withoutExec = graphOf(
			[{ id: 'o', type: 'osc' }],
			[{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }]
		);
		expect((await render(withExec, 4, 1)).peak).toBeGreaterThan(0.1);
		expect((await render(withoutExec, 4, 1)).peak).toBe(0);
	}, 45000);
});

describe('STRING and TUBE: one decays, the other sustains', () => {
	/* Two additive banks sharing one `case` body and differing by a flag. The
	   frequency loop is shared, so a unit test reading back oscillator
	   frequencies sees a plausible bank either way -- only the *envelope* tells
	   them apart, and only over a render long enough to hear it.
	
	   Measured over 4 s: a plucked string is gone by 2 s (exactly zero), while a
	   blown tube holds its level for the length of the note (ratio 1.000). */
	const resonator = async (type: string) => {
		const graphParams: Record<string, number> =
			type === 'string'
				? { 'e.exLength': 8, 's.decayTime': 2, 's.strBlend': 70 }
				: { 'e.exLength': 8, 's.tubeDecay': 1.5, 's.tubeMix': 70 };
		return (
			await render(
				graphOf(
					[
						{ id: 'f', type: 'tofreq' },
						{ id: 'e', type: 'excite' },
						{ id: 's', type }
					],
					[
						EXEC_TO_OUT,
						{ from: 'entry', fromPort: 'pitch', to: 'f', toPort: 'a' },
						{ from: 'f', fromPort: 'out', to: 's', toPort: 'pitch' },
						{ from: 'e', fromPort: 'out', to: 's', toPort: 'in' },
						{ from: 's', fromPort: 'out', to: 'output', toPort: 'in' }
					],
					graphParams
				),
				16,
				4
			)
		).envelope;
	};

	it('a struck string rings and then stops', async () => {
		const e = await resonator('string');
		expect(e[1], 'should ring after the strike').toBeGreaterThan(0.01);
		expect(e[8], 'and be gone by two seconds').toBe(0);
	}, 30000);

	it('a blown tube holds while the note is held', async () => {
		/* The assertion that makes TUBE a separate module rather than a preset of
		   STRING: its gain plateaus for the length of the note instead of
		   decaying. Run against the string's ratio, so this is a comparison
		   rather than a threshold. */
		const tube = await resonator('tube');
		const string = await resonator('string');
		expect(tube[8] / tube[1]).toBeGreaterThan(0.7);
		expect(string[8] / string[1]).toBeLessThan(0.3);
	}, 45000);
});

describe('SHAPE: three transfer curves, told apart by crest factor', () => {
	/* RMS says how much; crest factor -- peak over RMS -- says what *shape*. It
	   is level-independent, so it survives any change to the gain staging, and
	   it is the only statistic that separates three saturations driven to the
	   same loudness.
	
	   Measured at full drive: SOFT and HARD both approach a square (crest near
	   1.0), FOLD becomes a triangle (1.56). */
	const shaped = async (kind: number, drive: number) =>
		await render(
			graphOf(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'sh', type: 'shape' },
					{ id: 'go', type: 'gain' }
				],
				[
					EXEC_TO_OUT,
					{ from: 'o', fromPort: 'out', to: 'sh', toPort: 'in' },
					{ from: 'sh', fromPort: 'out', to: 'go', toPort: 'in' },
					{ from: 'go', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				// Attenuated after the shaper, to stay clear of the master limiter.
				{ 'go.level': 0.4, 'sh.shapeKind': kind, 'sh.shapeDrive': drive }
			),
			8,
			1
		);
	const crest = (r: { peak: number; envelope: number[] }) =>
		r.peak / Math.max(...r.envelope.slice(1));

	it('folds differently from how it saturates', async () => {
		/* FOLD is the one that is a different operation rather than a harder
		   version of the same one, and the crest factor is where that shows. A
		   picker that ignored its index -- the documented failure that put three
		   of four wave labels on the wrong shape -- collapses these onto one
		   number. */
		const soft = crest(await shaped(0, 100));
		const hard = crest(await shaped(1, 100));
		const fold = crest(await shaped(2, 100));
		expect(soft).toBeLessThan(1.1);
		expect(hard).toBeLessThan(1.1);
		expect(fold).toBeGreaterThan(1.4);
	}, 60000);

	it('is nearly transparent at the lowest drive and louder at the highest', async () => {
		/* The near-unity reading at minimum drive is what says the curve is
		   *normalised*. An unnormalised tanh drops the whole signal by several
		   dB the moment the module is placed -- a failure the master drive has
		   already had, and one only an absolute level catches. */
		const quiet = (await shaped(0, 0.1)).envelope[2];
		const loud = (await shaped(0, 100)).envelope[2];
		// The bare oscillator through the same 0.4 output gain is 0.1925.
		expect(quiet).toBeGreaterThan(0.17);
		expect(quiet).toBeLessThan(0.23);
		expect(loud).toBeGreaterThan(quiet * 1.2);
	}, 45000);
});

describe('COMP: the transfer curve flattens', () => {
	/* A compressor is a *curve*, so it is tested as one: the same patch at two
	   input levels, once compressing and once not. Bypassed, the output tracks
	   the input 8:1. At 20:1 above the threshold the same 8:1 input span comes
	   out as 1.17:1.
	
	   The `ratio: 1` control is the important half. Without it, "the span is
	   small" would also pass on a COMP that had become a gate or a dead gain;
	   requiring ratio 1 to restore the full 8:1 span proves it passes audio
	   faithfully when told not to compress. */
	const span = async (ratio: number) => {
		const at = async (level: number) =>
			(
				await render(
					graphOf(
						[
							{ id: 'o', type: 'osc' },
							{ id: 'g', type: 'gain' },
							{ id: 'c', type: 'comp' },
							{ id: 'go', type: 'gain' }
						],
						[
							EXEC_TO_OUT,
							{ from: 'o', fromPort: 'out', to: 'g', toPort: 'in' },
							{ from: 'g', fromPort: 'out', to: 'c', toPort: 'in' },
							{ from: 'c', fromPort: 'out', to: 'go', toPort: 'in' },
							{ from: 'go', fromPort: 'out', to: 'output', toPort: 'in' }
						],
						{
							'g.level': level,
							'go.level': 0.3,
							'c.compThresh': -30,
							'c.compRatio': ratio,
							'c.compAttack': 0,
							'c.compRelease': 10,
							'c.compGain': 0
						}
					),
					8,
					1
				)
			).envelope[4];
		return (await at(2)) / (await at(0.25));
	};

	it('squeezes a wide input range into a narrow output one', async () => {
		expect(await span(1), 'ratio 1 should pass the input through').toBeGreaterThan(7);
		expect(await span(20), 'ratio 20 should flatten it').toBeLessThan(2);
	}, 90000);
});

describe('MODES: struck bodies that ring', () => {
	const modes = async (q: number) =>
		(
			await render(
				graphOf(
					[
						{ id: 'e', type: 'excite' },
						{ id: 'md', type: 'modes' }
					],
					[
						EXEC_TO_OUT,
						{ from: 'e', fromPort: 'out', to: 'md', toPort: 'in' },
						{ from: 'md', fromPort: 'out', to: 'output', toPort: 'in' }
					],
					{
						'e.exLength': 8,
						'md.modeHz': 200,
						'md.mode1': 1,
						'md.mode2': 2.4,
						'md.mode3': 4.1,
						'md.modeQ': q,
						'md.modeMix': 70
					}
				),
				16,
				3
			)
		).envelope;

	it('rings long after the strike, and Q says how long', async () => {
		/* MODES is *struck*, not filtered, and the ring time is the only thing
		   that says so: three bandpasses fed an 8 ms burst pass the burst and
		   nothing more. At Q 1 the body is gone inside the first slice; at Q 60
		   it is still sounding at the end of a three-second render.
		
		   A filtered-only MODES passes every unit test about biquad frequencies
		   and fails this outright. */
		const lastHeard = (e: number[]) =>
			e.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
		const dull = await modes(1);
		const ringing = await modes(60);
		expect(lastHeard(dull)).toBeLessThan(3);
		expect(lastHeard(ringing)).toBeGreaterThan(10);
		const tail = (e: number[]) => e.slice(4).reduce((a, b) => a + b, 0);
		expect(tail(ringing)).toBeGreaterThan(tail(dull) + 0.05);
	}, 45000);
});

describe('SPACE: SIZE is how long the room rings', () => {
	const space = async (size: number) =>
		(
			await render(
				graphOf(
					[
						{ id: 'e', type: 'excite' },
						{ id: 'sp', type: 'space' }
					],
					[
						EXEC_TO_OUT,
						{ from: 'e', fromPort: 'out', to: 'sp', toPort: 'in' },
						{ from: 'sp', fromPort: 'out', to: 'output', toPort: 'in' }
					],
					{ 'e.exLength': 8, 'sp.spaceSize': size, 'sp.spaceDecay': 50, 'sp.spaceMix': 100 }
				),
				24,
				3
			)
		).envelope;

	it('spreads an 8 ms strike over a tail that grows with SIZE', async () => {
		/* A duration measurement, like DELAY's, and the only one that says a
		   convolver is present rather than a gain. A SPACE that became a
		   passthrough gives a burst in slice 0 and nothing after -- failing all
		   three. One whose buffer stopped tracking SIZE gives three identical
		   tails, failing the ordering. */
		const lastHeard = (e: number[]) =>
			e.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
		const small = lastHeard(await space(10));
		const medium = lastHeard(await space(40));
		const large = lastHeard(await space(100));
		expect(small).toBeLessThan(medium);
		expect(medium).toBeLessThan(large);
		// And the largest really is a long tail, not merely the longest of three short ones.
		expect(large).toBeGreaterThan(12);
	}, 60000);
});

describe('BREAK: mid and side, from the ports named for them', () => {
	/* `mid = 0.5L + 0.5R`, `side = 0.5L - 0.5R`. The outlets resolve through an
	   `outs` map rather than through `out2`, and the docstring records what
	   happened when they did not: the port literally named `side` returned the
	   mid gain.
	
	   The centred case is what catches that, and only that case: a centred
	   signal has no side content at all, so SID must read exactly zero while MID
	   reads full. Every other pan position gives both outlets something, and a
	   module returning mid twice would pass them all. */
	const breakAt = async (pos: number, outlet: string) =>
		await render(
			graphOf(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'pn', type: 'pan' },
					{ id: 'bk', type: 'break' }
				],
				[
					EXEC_TO_OUT,
					{ from: 'o', fromPort: 'out', to: 'pn', toPort: 'in' },
					{ from: 'pn', fromPort: 'out', to: 'bk', toPort: 'in' },
					{ from: 'bk', fromPort: outlet, to: 'output', toPort: 'in' }
				],
				{ 'pn.panPos': pos }
			),
			4,
			1
		);

	it('has no side content in a centred signal', async () => {
		expect((await breakAt(0, 'out')).envelope[2]).toBeGreaterThan(0.3);
		expect((await breakAt(0, 'side')).peak, 'a centred signal is all mid').toBe(0);
	}, 45000);

	it('splits a panned signal between the two, and they differ', async () => {
		/* Hard right puts equal energy in mid and side, so that position cannot
		   tell the coefficients apart. Half right can: mid 0.314 against side
		   0.130 pins both, not merely their difference. */
		const mid = (await breakAt(50, 'out')).envelope[2];
		const side = (await breakAt(50, 'side')).envelope[2];
		expect(mid).toBeGreaterThan(side * 2);
		expect(side).toBeGreaterThan(0.05);
	}, 45000);
});

describe('MAKE: WIDE scales the side leg, sign and all', () => {
	/* `L = mid + wide * side`. With mid and side fed from oscillators at one
	   frequency, the left channel -- which is what the bench reads -- is
	   `(1 + wide)` times one oscillator, so the readings fit a line with no free
	   parameter.
	
	   WIDE is the one inlet in this group with no param behind it, and its
	   docstring records both failures it has had. A dead WIDE pins the gain at
	   its fallback of 1 and every reading becomes the `wide = 1` one -- three of
	   the four assertions fail at once. */
	const made = async (wide: number) =>
		await render(
			graphOf(
				[
					{ id: 'f', type: 'tofreq' },
					{ id: 'm1', type: 'osc' },
					{ id: 's1', type: 'osc' },
					{ id: 'cw', type: 'const' },
					{ id: 'mk', type: 'make' },
					{ id: 'go', type: 'gain' }
				],
				[
					EXEC_TO_OUT,
					{ from: 'entry', fromPort: 'pitch', to: 'f', toPort: 'a' },
					{ from: 'f', fromPort: 'out', to: 'm1', toPort: 'pitch' },
					{ from: 'f', fromPort: 'out', to: 's1', toPort: 'pitch' },
					{ from: 'm1', fromPort: 'out', to: 'mk', toPort: 'in' },
					{ from: 's1', fromPort: 'out', to: 'mk', toPort: 'b' },
					{ from: 'cw', fromPort: 'out', to: 'mk', toPort: 'wide' },
					{ from: 'mk', fromPort: 'out', to: 'go', toPort: 'in' },
					{ from: 'go', fromPort: 'out', to: 'output', toPort: 'in' }
				],
				{ ...constAt('cw', 6, wide), 'go.level': 0.3 }
			),
			4,
			1
		);

	it('is linear in WIDE, and -1 cancels the mid exactly', async () => {
		const none = (await made(0)).envelope[2];
		const unit = (await made(1)).envelope[2];
		const double = (await made(2)).envelope[2];
		// (1 + wide) x one oscillator: 1, 2, 3.
		expect(unit / none).toBeCloseTo(2, 1);
		expect(double / none).toBeCloseTo(3, 1);
		/* The row that proves WIDE is a signed multiplier on the side leg rather
		   than a blend: at -1 the side cancels the mid and the left channel is
		   nothing at all. */
		expect((await made(-1)).peak).toBe(0);
	}, 60000);
});

describe('a probe changes nothing about the sound', () => {
	it('renders identically with SCOPE, LOUD or FFT tapped off the signal', async () => {
		/* The central claim about probes: "placing one cannot change the patch,
		   which is the only way a debugging tool is worth having." A probe does
		   have an `out`, and the no-OUT fallback branch connects anything nothing
		   listens to -- so if the sink logic ever became "everything terminal", a
		   tapped probe would double the signal. Asserted as byte-equality against
		   the untapped render. */
		const bare = graphOf(
			[{ id: 'o', type: 'osc' }],
			[EXEC_TO_OUT, { from: 'o', fromPort: 'out', to: 'output', toPort: 'in' }]
		);
		const reference = await render(bare, 4, 1);
		for (const type of ['scope', 'loud', 'fft']) {
			const tapped = graphOf(
				[
					{ id: 'o', type: 'osc' },
					{ id: 'pr', type }
				],
				[
					EXEC_TO_OUT,
					{ from: 'o', fromPort: 'out', to: 'output', toPort: 'in' },
					{ from: 'o', fromPort: 'out', to: 'pr', toPort: 'in' }
				]
			);
			const r = await render(tapped, 4, 1);
			expect(r.peak, `${type} changed the peak`).toBe(reference.peak);
			expect(r.envelope, `${type} changed the envelope`).toEqual(reference.envelope);
		}
	}, 60000);
});
