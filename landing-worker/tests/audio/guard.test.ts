import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * GUARD: a note that goes wrong silences itself, not the mix.
 *
 * One non-finite sample from one patch made the master sum NaN and sat in the
 * master reverb for its whole tail -- every track silent for seconds, then
 * back. Here a patch that overflows on purpose (a constant near float32's
 * limit, doubled twice, is Infinity) is played through the master FX: nothing
 * non-finite may reach the output, and what does is held within +-8.
 */

const BASE = process.env.AUDIT_URL ?? 'http://localhost:5182';

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

const cable = (from: string, fromPort: string, to: string, toPort: string) => ({
	from,
	fromPort,
	to,
	toPort
});

describe('GUARD', () => {
	it('keeps an overflowing note out of the master bus and its reverb', async () => {
		const r = await page.evaluate(
			async (patch) => {
				const w = window as never as {
					__audit: {
						setTrack(t: unknown): unknown;
						renderLive(
							e: { note: number; on: number; off: number; vel: number }[],
							s: number,
							slices?: number
						): Promise<{
							ok: boolean;
							firstNonFinite?: number;
							envelope?: number[];
							error?: string;
						}>;
					};
				};
				w.__audit.setTrack(patch);
				return w.__audit.renderLive([{ note: 48, on: 0.1, off: 0.6, vel: 100 }], 2, 8);
			},
			{
				advanced: true,
				reverbMix: 0.5,
				rackGraph: {
					nodes: [
						{ id: 'entry', type: 'in' },
						{ id: 'big', type: 'const' },
						{ id: 'sig', type: 'tosig' },
						{ id: 'g1', type: 'gain' },
						{ id: 'g2', type: 'gain' },
						{ id: 'out', type: 'out' }
					],
					cables: [
						cable('entry', 'then', 'out', 'exec'),
						cable('big', 'out', 'sig', 'level'),
						cable('sig', 'out', 'g1', 'in'),
						cable('g1', 'out', 'g2', 'in'),
						cable('g2', 'out', 'out', 'in')
					]
				},
				graphParams: { 'big.kind': 6, 'big.value': 3e38, 'g1.level': 2, 'g2.level': 2 },
				graphWaves: {}
			}
		);
		expect(r.ok, r.error).toBe(true);
		expect(r.firstNonFinite, 'first non-finite sample, s').toBe(-1);
		// Held at +-8 through the master chain, not passed through as a fault.
		for (const e of r.envelope ?? []) expect(e).toBeLessThanOrEqual(8);
	}, 60000);
});
