import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * WIRE, the struck string, measured.
 *
 * A delay-line loop is the one module here that can run away: its loop gain
 * is set per block from four knobs and the pitch, and a combination that
 * lets it pass 1 at any mode grows until it is NaN -- which, reaching the
 * master chain, silences every track until the page is reloaded. An earlier
 * version did exactly that at C8 with DAMP and STIF full up, in 3 s. So the
 * extremes are rendered, not reasoned about.
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

const RATE = 48000;

/** EXCT -> WIRE -> OUT, the note's pitch on WIRE's FREQ; or no strike at all. */
function rig(params: Record<string, number> = {}, struck = true) {
	return {
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'ham', type: 'excite' },
				{ id: 'freq', type: 'tofreq' },
				{ id: 'w', type: 'wire' },
				{ id: 'output', type: 'out' }
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'entry', fromPort: 'pitch', to: 'freq', toPort: 'a' },
				{ from: 'freq', fromPort: 'out', to: 'w', toPort: 'pitch' },
				...(struck ? [{ from: 'ham', fromPort: 'out', to: 'w', toPort: 'in' }] : []),
				{ from: 'w', fromPort: 'out', to: 'output', toPort: 'in' }
			]
		},
		graphParams: {
			'ham.exLength': 2,
			'ham.hardness': 60,
			'ham.exTone': 6000,
			...Object.fromEntries(Object.entries(params).map(([k, v]) => [`w.${k}`, v]))
		},
		graphWaves: {},
		presetGain: 1
	};
}

/** One key, as mono samples. `midi` is the note; the piano roll counts down from C8. */
async function strike(
	timbre: Record<string, unknown>,
	midi: number,
	seconds: number
): Promise<{ x: Float32Array; peak: number; firstNonFinite: number }> {
	const r = await page.evaluate(
		async (a) => {
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					renderPhrase(
						n: unknown[],
						s: number
					): Promise<{
						ok: boolean;
						wav?: string;
						peak?: number;
						firstNonFinite?: number;
						error?: string;
					}>;
				};
			};
			w.__audit.setTrack(a.t);
			return await w.__audit.renderPhrase(
				[{ note: 108 - a.midi, at: 0.05, dur: a.seconds, vel: 100 }],
				a.seconds + 0.2
			);
		},
		{ t: timbre, midi, seconds }
	);
	expect(r.ok, r.error).toBe(true);
	const bytes = Buffer.from(r.wav!, 'base64');
	const n = (bytes.length - 44) / 4;
	const x = new Float32Array(n);
	for (let i = 0; i < n; i++)
		x[i] = (bytes.readInt16LE(44 + i * 4) + bytes.readInt16LE(46 + i * 4)) / 2 / 32767;
	return { x, peak: r.peak!, firstNonFinite: r.firstNonFinite! };
}

/** Energy at exactly `f` over [a, b) seconds, Hann-windowed. */
function level(x: Float32Array, f: number, a: number, b: number): number {
	const i0 = Math.floor(a * RATE);
	const n = Math.floor((b - a) * RATE);
	let re = 0;
	let im = 0;
	const w = (2 * Math.PI * f) / RATE;
	for (let i = 0; i < n; i++) {
		const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
		re += x[i0 + i] * h * Math.cos(w * i);
		im += x[i0 + i] * h * Math.sin(w * i);
	}
	return Math.hypot(re, im);
}

/** The strongest frequency within +-40 cents of `f`, in 0.1-cent steps. */
function peakNear(x: Float32Array, f: number, a: number, b: number): number {
	let best = f;
	let bestLevel = -1;
	for (let c = -40; c <= 40; c += 0.1) {
		const g = f * Math.pow(2, c / 1200);
		const l = level(x, g, a, b);
		if (l > bestLevel) {
			bestLevel = l;
			best = g;
		}
	}
	return best;
}

const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);
const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-12));

describe('WIRE, the struck string', () => {
	it('rings only when something strikes it', async () => {
		/* STRING sounds on its own gate; WIRE is silent until IN carries a
		   strike -- which is the point of it. */
		const silent = await strike(rig({}, false), 60, 1);
		const struck = await strike(rig(), 60, 1);
		// Under -60 dB: an unwired strike leaves no more than rounding behind.
		expect(silent.peak).toBeLessThan(0.001);
		expect(struck.peak).toBeGreaterThan(0.05);
	}, 60000);

	it('is in tune from A0 to C8, whatever DAMP and STIF are', async () => {
		/* The delay is shortened by the filters' phase delay at the
		   fundamental, per block -- without it DAMP and STIF would each pull
		   the pitch flat by a different amount on every key. */
		/* A0 is read on its 8th partial with STIF at 0, where the partials are
		   exactly harmonic: a window a few seconds long cannot place a 27.5 Hz
		   peak to a cent, and the strike is noise, so it wandered by 1.6. */
		const cases: [number, number, number, Record<string, number>][] = [
			[21, 27.5, 8, { wireStiff: 0 }],
			[60, 261.626, 1, {}],
			[60, 261.626, 1, { wireDamp: 80, wireStiff: 60 }],
			[108, 4186.01, 1, {}]
		];
		for (const [midi, f0, k, params] of cases) {
			const { x } = await strike(rig(params), midi, f0 < 100 ? 2 : 1.2);
			const span: [number, number] = f0 < 100 ? [0.2, 1.8] : [0.06, 0.26];
			const off = cents(peakNear(x, f0 * k, ...span) / k, f0);
			expect(
				Math.abs(off),
				`midi ${midi} ${JSON.stringify(params)}: ${off.toFixed(2)} cents`
			).toBeLessThan(1);
		}
	}, 120000);

	it('stays finite at every extreme of its knobs', async () => {
		for (const midi of [21, 108])
			for (const wireDamp of [0, 100])
				for (const wireStiff of [0, 100])
					for (const [wireDecay, wirePos] of [
						[30, 0],
						[0.05, 50]
					]) {
						const p = { wireDamp, wireStiff, wireDecay, wirePos };
						const r = await strike(rig(p), midi, 2);
						expect(r.firstNonFinite, `midi ${midi} ${JSON.stringify(p)}`).toBe(-1);
						expect(r.peak, `midi ${midi} ${JSON.stringify(p)}`).toBeLessThan(2);
					}
	}, 240000);

	it('struck a quarter of the way along, has no 4th or 8th partial', async () => {
		/* A hammer at 1/4 sits on a node of every 4th mode, so it cannot
		   excite them -- a comb on the way in. */
		const f0 = 261.626;
		const { x } = await strike(rig({ wirePos: 25, wireStiff: 0 }), 60, 1);
		const h = (k: number) => db(level(x, f0 * k, 0.1, 0.5));
		// 20 dB clear of both neighbours; measured 42-48 on one strike.
		expect(h(4)).toBeLessThan(Math.min(h(3), h(5)) - 20);
		expect(h(8)).toBeLessThan(Math.min(h(7), h(9)) - 20);
	}, 60000);
});
