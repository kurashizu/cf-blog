import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * JAZZ KIT, played.
 *
 * Its graphs were built and then discarded while the catalogue was rebuilt,
 * so every key played the track's own oscillators under a drum envelope --
 * a kit of beeps. They are emitted again; this is what says each key is a
 * drum: it sounds, it stays bounded, it ends, and the families sit where a
 * kit's do -- a kick darker than a hi-hat, a cymbal ringing longer than a
 * stick.
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

interface Hit {
	key: number;
	peak: number;
	/** Seconds until the 10 ms RMS stays 40 dB under the peak. */
	ring: number;
	/** Zero crossings in the 100 ms after the peak: a rough brightness. */
	zc: number;
	graph: boolean;
}

async function playKit(name: string): Promise<Hit[]> {
	return page.evaluate(async (name) => {
		const w = window as never as {
			__audit: {
				setTrack(t: unknown): unknown;
				renderPhrase(n: unknown[], s: number): Promise<{ ok: boolean; wav?: string }>;
				presets: {
					BUILTIN_KITS: { name: string; keys: Record<string, Record<string, unknown>> }[];
				};
			};
		};
		const kit = w.__audit.presets.BUILTIN_KITS.find((k) => k.name === name)!;
		const out = [];
		for (const [key, t] of Object.entries(kit.keys)) {
			w.__audit.setTrack({ ...t, advanced: true });
			const r = await w.__audit.renderPhrase([{ note: +key, at: 0.02, dur: 0.3, vel: 100 }], 7);
			const b = Uint8Array.from(atob(r.wav!), (c) => c.charCodeAt(0));
			const dv = new DataView(b.buffer);
			const n = (b.length - 44) / 4;
			const x = new Float32Array(n);
			for (let i = 0; i < n; i++) x[i] = dv.getInt16(44 + i * 4, true) / 32767;
			let peak = 0;
			let at = 0;
			for (let i = 0; i < n; i++)
				if (Math.abs(x[i]) > peak) {
					peak = Math.abs(x[i]);
					at = i;
				}
			let ring = 0;
			for (let i = at; i + 480 < n; i += 480) {
				let s = 0;
				for (let k = 0; k < 480; k++) s += x[i + k] ** 2;
				if (Math.sqrt(s / 480) > peak * 0.01) ring = (i + 480) / 48000;
			}
			let zc = 0;
			for (let i = at + 1; i < Math.min(n, at + 4800); i++) if (x[i] > 0 !== x[i - 1] > 0) zc++;
			out.push({
				key: +key,
				peak,
				ring,
				zc,
				graph: !!(t.rackGraph as { nodes?: unknown[] })?.nodes?.length
			});
		}
		return out;
	}, name);
}

describe('JAZZ KIT', () => {
	let hits: Hit[] = [];
	beforeAll(async () => {
		hits = await playKit('JAZZ KIT');
	}, 180000);

	it('carries a graph on every key, and every key is a drum that sounds', () => {
		expect(hits.length).toBeGreaterThan(40);
		for (const h of hits) {
			expect(h.graph, `key ${h.key} has a patch`).toBe(true);
			expect(h.peak, `key ${h.key} sounds`).toBeGreaterThan(0.005);
			expect(h.peak, `key ${h.key} stays bounded`).toBeLessThan(0.9);
			// A ride or an open triangle rings for seconds; every voice ends by 6.8.
			expect(h.ring, `key ${h.key} ends`).toBeLessThan(6.8);
		}
	});

	it('sits the families where a kit has them', () => {
		const at = (k: number) => hits.find((h) => h.key === k)!;
		// GM: 36 bass drum (key 72), 42 closed hat (66), 49 crash (59), 37 side stick (71).
		expect(at(72).zc, 'a kick is darker than a closed hat').toBeLessThan(at(66).zc / 10);
		expect(at(59).ring, 'a crash rings longer than a side stick').toBeGreaterThan(at(71).ring * 4);
	});
});

describe('808 KIT', () => {
	/* The drum machine, rebuilt in the patch bay: it was racks 1-7 voices, a
	   different instrument from everything else in the kit menu. */
	let hits: Hit[] = [];
	beforeAll(async () => {
		hits = await playKit('808 KIT');
	}, 120000);

	it('carries a graph on every key, and every key is a drum that sounds', () => {
		expect(hits.length).toBe(10);
		for (const h of hits) {
			expect(h.graph, `key ${h.key} has a patch`).toBe(true);
			expect(h.peak, `key ${h.key} sounds`).toBeGreaterThan(0.005);
			expect(h.peak, `key ${h.key} stays bounded`).toBeLessThan(0.9);
			expect(h.ring, `key ${h.key} ends`).toBeLessThan(6.8);
		}
	});

	it('has a kick under a hat', () => {
		const at = (k: number) => hits.find((h) => h.key === k)!;
		// C2 kick, E4 closed hat.
		expect(at(72).zc, 'the kick is darker than the closed hat').toBeLessThan(at(44).zc / 10);
	});
});
