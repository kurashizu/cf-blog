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
