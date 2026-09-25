import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * A macro sounds exactly like the nodes it holds.
 *
 * The engine flattens every instance before it builds a voice, so the claim
 * is sample-for-sample identity with the same patch written out by hand --
 * for one instance, for two in series with different amounts on their
 * sockets, and for a macro inside a macro.
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

type Cable = { from: string; fromPort: string; to: string; toPort: string };
const c = (from: string, fromPort: string, to: string, toPort: string): Cable => ({
	from,
	fromPort,
	to,
	toPort
});

/** IN -> FILTER -> GAIN -> OUT, the gain's level on a CV socket. A tone-and-level stage. */
const stage = {
	name: 'STG',
	nodes: [
		{ id: 'in', type: 'nodept', x: 0, y: 0 },
		{ id: 'amt', type: 'nodecv', x: 0, y: 90 },
		{ id: 'f', type: 'filter', x: 200, y: 0 },
		{ id: 'g', type: 'gain', x: 400, y: 0 },
		{ id: 'out', type: 'nodept', x: 600, y: 0 }
	],
	cables: [
		c('in', 'out', 'f', 'in'),
		c('f', 'out', 'g', 'in'),
		c('amt', 'out', 'g', 'level'),
		c('g', 'out', 'out', 'in')
	],
	params: { 'f.cutoff': 1200, 'f.q': 4, 'g.level': 0 },
	labels: { in: 'IN', amt: 'AMT', out: 'OUT' }
};

function patch(
	nodes: { id: string; type: string; macro?: string }[],
	cables: Cable[],
	params: Record<string, number>,
	macros?: Record<string, unknown>
) {
	return {
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in', x: 0, y: 0 },
				{ id: 'freq', type: 'tofreq', x: 0, y: 0 },
				{ id: 'osc', type: 'osc', x: 0, y: 0 },
				...nodes.map((n) => ({ x: 0, y: 0, ...n })),
				{ id: 'output', type: 'out', x: 0, y: 0 }
			],
			cables: [
				c('entry', 'then', 'output', 'exec'),
				c('entry', 'pitch', 'freq', 'a'),
				c('freq', 'out', 'osc', 'pitch'),
				...cables
			],
			...(macros ? { macros } : {})
		},
		graphParams: params,
		graphWaves: { 'osc.wave': 'sawtooth' },
		presetGain: 1
	};
}

async function render(timbre: unknown): Promise<Float32Array> {
	const r = await page.evaluate(async (t) => {
		const w = window as never as {
			__audit: {
				setTrack(t: unknown): unknown;
				renderPhrase(
					n: unknown[],
					s: number
				): Promise<{ ok: boolean; wav?: string; error?: string }>;
			};
		};
		w.__audit.setTrack(t);
		return await w.__audit.renderPhrase([{ note: 48, at: 0.02, dur: 0.4, vel: 100 }], 0.5);
	}, timbre);
	expect(r.ok, r.error).toBe(true);
	const bytes = Buffer.from(r.wav!, 'base64');
	const n = (bytes.length - 44) / 4;
	const x = new Float32Array(n);
	for (let i = 0; i < n; i++) x[i] = bytes.readInt16LE(44 + i * 4) / 32767;
	return x;
}

function same(a: Float32Array, b: Float32Array) {
	let worst = 0;
	let energy = 0;
	for (let i = 0; i < a.length; i++) {
		worst = Math.max(worst, Math.abs(a[i] - b[i]));
		energy = Math.max(energy, Math.abs(b[i]));
	}
	expect(energy, 'the reference makes sound').toBeGreaterThan(0.01);
	// One 16-bit step: the WAV's own resolution.
	expect(worst).toBeLessThanOrEqual(1 / 32767 + 1e-9);
}

describe('a macro', () => {
	it('sounds exactly like its insides written out', async () => {
		const macro = await render(
			patch(
				[
					{ id: 'k', type: 'const' },
					{ id: 'm', type: 'macro', macro: 'stage' }
				],
				[c('osc', 'out', 'm', 'in'), c('k', 'out', 'm', 'amt'), c('m', 'out', 'output', 'in')],
				{ 'k.kind': 6, 'k.value': 0.6 },
				{ stage }
			)
		);
		const byHand = await render(
			patch(
				[
					{ id: 'f', type: 'filter' },
					{ id: 'g', type: 'gain' }
				],
				[c('osc', 'out', 'f', 'in'), c('f', 'out', 'g', 'in'), c('g', 'out', 'output', 'in')],
				{ 'f.cutoff': 1200, 'f.q': 4, 'g.level': 0.6 }
			)
		);
		same(macro, byHand);
	}, 60000);

	it('runs two instances as two, each on its own socket', async () => {
		const macro = await render(
			patch(
				[
					{ id: 'k1', type: 'const' },
					{ id: 'k2', type: 'const' },
					{ id: 'a', type: 'macro', macro: 'stage' },
					{ id: 'b', type: 'macro', macro: 'stage' }
				],
				[
					c('osc', 'out', 'a', 'in'),
					c('k1', 'out', 'a', 'amt'),
					c('a', 'out', 'b', 'in'),
					c('k2', 'out', 'b', 'amt'),
					c('b', 'out', 'output', 'in')
				],
				{ 'k1.kind': 6, 'k1.value': 0.9, 'k2.kind': 6, 'k2.value': 0.4 },
				{ stage }
			)
		);
		const byHand = await render(
			patch(
				[
					{ id: 'f1', type: 'filter' },
					{ id: 'g1', type: 'gain' },
					{ id: 'f2', type: 'filter' },
					{ id: 'g2', type: 'gain' }
				],
				[
					c('osc', 'out', 'f1', 'in'),
					c('f1', 'out', 'g1', 'in'),
					c('g1', 'out', 'f2', 'in'),
					c('f2', 'out', 'g2', 'in'),
					c('g2', 'out', 'output', 'in')
				],
				{
					'f1.cutoff': 1200,
					'f1.q': 4,
					'g1.level': 0.9,
					'f2.cutoff': 1200,
					'f2.q': 4,
					'g2.level': 0.4
				}
			)
		);
		same(macro, byHand);
	}, 60000);

	it('plays a macro inside a macro', async () => {
		const twice = {
			name: 'TWO',
			nodes: [
				{ id: 'in', type: 'nodept', x: 0, y: 0 },
				{ id: 'k', type: 'const', x: 0, y: 90 },
				{ id: 'x', type: 'macro', macro: 'stage', x: 200, y: 0 },
				{ id: 'y', type: 'macro', macro: 'stage', x: 400, y: 0 },
				{ id: 'out', type: 'nodept', x: 600, y: 0 }
			],
			cables: [
				c('in', 'out', 'x', 'in'),
				c('k', 'out', 'x', 'amt'),
				c('k', 'out', 'y', 'amt'),
				c('x', 'out', 'y', 'in'),
				c('y', 'out', 'out', 'in')
			],
			params: { 'k.kind': 6, 'k.value': 0.7 }
		};
		const macro = await render(
			patch(
				[{ id: 'm', type: 'macro', macro: 'twice' }],
				[c('osc', 'out', 'm', 'in'), c('m', 'out', 'output', 'in')],
				{},
				{ stage, twice }
			)
		);
		const byHand = await render(
			patch(
				[
					{ id: 'f1', type: 'filter' },
					{ id: 'g1', type: 'gain' },
					{ id: 'f2', type: 'filter' },
					{ id: 'g2', type: 'gain' }
				],
				[
					c('osc', 'out', 'f1', 'in'),
					c('f1', 'out', 'g1', 'in'),
					c('g1', 'out', 'f2', 'in'),
					c('f2', 'out', 'g2', 'in'),
					c('g2', 'out', 'output', 'in')
				],
				{
					'f1.cutoff': 1200,
					'f1.q': 4,
					'g1.level': 0.7,
					'f2.cutoff': 1200,
					'f2.q': 4,
					'g2.level': 0.7
				}
			)
		);
		same(macro, byHand);
	}, 60000);
});
