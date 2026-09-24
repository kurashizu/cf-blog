import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * ENV's times follow a moving signal, not only a number.
 *
 * The envelope used to be a gain automated once, at the note, so a cable into
 * ATTACK could only be read as a value at note-on -- and a moving signal is
 * not a value, so it read as nothing and the attack was instant. ENV runs in
 * the live-DSP worklet now and reads every time per sample.
 *
 * The signal here is a second ENV, set to rise to 1 within a couple of
 * milliseconds and hold: a moving source (so the resolver cannot pull it as a
 * number) whose level settles at 1. Patched into the first ENV's ATTACK it
 * should give the same slow one-second rise as typing 1 into the field -- and
 * the old engine gave the instant one.
 */

const BASE = process.env.AUDIT_URL ?? 'http://localhost:5182';

type Envelope = { ok: boolean; envelope: number[]; peak: number; error?: string };

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

async function render(timbre: Record<string, unknown>): Promise<Envelope> {
	return page.evaluate(async (t) => {
		const w = window as never as {
			__audit: {
				setTrack(t: unknown): unknown;
				run(s: number, n: number, sl: number, hold?: number): Promise<Envelope>;
			};
		};
		w.__audit.setTrack(t);
		// 2 s, twenty 100 ms slices, the key held throughout.
		return await w.__audit.run(2, 40, 20, 2);
	}, timbre);
}

type Cable = { from: string; fromPort: string; to: string; toPort: string };
const wire = (from: string, fromPort: string, to: string, toPort: string): Cable => ({
	from,
	fromPort,
	to,
	toPort
});

/** OSC through a GAIN whose level is ENV `amp`; `extra` adds nodes and cables. */
function patch(
	params: Record<string, number>,
	extra: { nodes?: { id: string; type: string }[]; cables?: Cable[] } = {}
) {
	return {
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'output', type: 'out' },
				{ id: 'osc', type: 'osc' },
				{ id: 'vca', type: 'gain' },
				{ id: 'amp', type: 'env' },
				...(extra.nodes ?? [])
			],
			cables: [
				wire('entry', 'then', 'output', 'exec'),
				wire('osc', 'out', 'vca', 'in'),
				wire('vca', 'out', 'output', 'in'),
				wire('amp', 'out', 'vca', 'level'),
				...(extra.cables ?? [])
			]
		},
		graphParams: {
			'vca.level': 0,
			'amp.envD': 0.01,
			'amp.envS': 100,
			...params
		}
	};
}

/** Level of the first 100 ms against the loudest slice: near 1 for a snap, low for a swell. */
const onset = (e: Envelope) => e.envelope[0] / e.peak;

describe("ENV's attack follows a signal patched into it", () => {
	it('a typed 1 s attack swells, a typed 5 ms one snaps (the two ends of the scale)', async () => {
		const slow = await render(patch({ 'amp.envA': 1 }));
		const fast = await render(patch({ 'amp.envA': 0.005 }));
		expect(slow.ok && fast.ok).toBe(true);
		expect(onset(slow)).toBeLessThan(0.15);
		/* Not near 1: the first slice also holds the few milliseconds before the
		   note starts. Relative is what the test is about anyway. */
		expect(onset(fast)).toBeGreaterThan(3 * onset(slow));
	});

	it('a moving signal settling at 1 gives the 1 s swell, not an instant attack', async () => {
		const driven = await render(
			patch(
				{
					'amp.envA': 0,
					'lfo.envA': 0.001,
					'lfo.envD': 0.001,
					'lfo.envS': 100
				},
				{
					nodes: [{ id: 'lfo', type: 'env' }],
					cables: [wire('lfo', 'out', 'amp', 'envA')]
				}
			)
		);
		const typed = await render(patch({ 'amp.envA': 1 }));
		expect(driven.ok).toBe(true);
		expect(onset(driven)).toBeLessThan(0.15);
		// Same shape as typing the number, slice by slice, within a few percent.
		for (let i = 0; i < 12; i++)
			expect(Math.abs(driven.envelope[i] - typed.envelope[i])).toBeLessThan(0.05 * typed.peak);
	});
});

describe("MAP's ranges follow a signal patched into them", () => {
	it('Y.HI driven by a swelling envelope carries the swell through', async () => {
		/* CONST 1 into A with the EXP shape puts MAP's output exactly at Y.HI.
		   Y.HI is patched from an envelope that rises over a second, and the
		   result is the level of the VCA -- so the render swells if and only if
		   the range is read live. Read once, a moving Y.HI was 0 and the patch
		   was silent. The CONST also exercises A holding a value while only a
		   range moves, which a pure node building nothing used to drop. */
		const exp = 1; // MAP_SHAPES index of EXP
		const timbre = {
			advanced: true,
			rackGraph: {
				nodes: [
					{ id: 'entry', type: 'in' },
					{ id: 'output', type: 'out' },
					{ id: 'osc', type: 'osc' },
					{ id: 'vca', type: 'gain' },
					{ id: 'one', type: 'const' },
					{ id: 'map', type: 'map' },
					{ id: 'swell', type: 'env' }
				],
				cables: [
					wire('entry', 'then', 'output', 'exec'),
					wire('osc', 'out', 'vca', 'in'),
					wire('vca', 'out', 'output', 'in'),
					wire('one', 'out', 'map', 'a'),
					wire('swell', 'out', 'map', 'outHi'),
					wire('map', 'out', 'vca', 'level')
				]
			},
			graphParams: {
				'vca.level': 0,
				'one.kind': 0,
				'one.value': 1,
				'map.shape': exp,
				'map.inLo': 0,
				'map.inHi': 1,
				'map.outLo': 0,
				'swell.envA': 1,
				'swell.envD': 0.01,
				'swell.envS': 100
			}
		};
		const e = await render(timbre);
		expect(e.ok).toBe(true);
		expect(e.peak, 'silent: Y.HI read as 0').toBeGreaterThan(0.01);
		expect(onset(e), 'no swell: Y.HI read once').toBeLessThan(0.15);
		// Rising through the first second.
		expect(e.envelope[8]).toBeGreaterThan(e.envelope[2]);
	});
});
