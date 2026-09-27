import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * What one note of each built-in sound costs, against the budget in
 * docs/node-graph.md ("The built-in patches"): about a racks 1-7 voice.
 *
 * Counted the way the audio thread pays for it -- the nodes a second,
 * overlapping note builds, so whatever the track shares (its chain, the
 * master FX) is left out. The first full set of AC presets built 34-137 nodes
 * and 2-10 worklets a note, eleven of thirteen with a reverb of their own, and
 * PIZZ and PIANO underran the audio thread until the page went silent.
 */

const BASE = process.env.AUDIT_URL ?? 'http://localhost:5182';

const BUDGET = { nodes: 32, worklets: 3, resonators: 2, ir: 1, space: 0 };
const KIT_BUDGET = { nodes: 24, worklets: 2, resonators: 2, ir: 1, space: 0 };
const RESONATORS = ['krsz-wire', 'krsz-modes', 'krsz-strings'];

let browser: Browser;
let page: Page;

beforeAll(async () => {
	browser = await chromium.launch({ channel: 'chrome' });
	page = await browser.newPage();
	await page.addInitScript(() => {
		const made: Record<string, number> = {};
		(window as never as { __made: Record<string, number> }).__made = made;
		const W = window.AudioWorkletNode;
		window.AudioWorkletNode = class extends W {
			constructor(c: BaseAudioContext, n: string, o?: AudioWorkletNodeOptions) {
				super(c, n, o);
				made['W:' + n] = (made['W:' + n] || 0) + 1;
			}
		};
		const proto = BaseAudioContext.prototype as unknown as Record<
			string,
			(...a: unknown[]) => unknown
		>;
		for (const m of Object.getOwnPropertyNames(BaseAudioContext.prototype)) {
			if (!m.startsWith('create') || m === 'createBuffer' || m === 'createPeriodicWave') continue;
			const orig = proto[m];
			proto[m] = function (this: unknown, ...a: unknown[]) {
				made[m] = (made[m] || 0) + 1;
				return orig.apply(this, a);
			};
		}
	});
	await page.goto(`${BASE}/synth/audit`, { waitUntil: 'networkidle' });
	await page.waitForFunction(() => !!(window as never as { __audit?: unknown }).__audit, {
		timeout: 15000
	});
}, 60000);

afterAll(async () => {
	await browser?.close();
});

interface Cost {
	name: string;
	kit: boolean;
	nodes: number;
	worklets: number;
	resonators: number;
	ir: number;
	space: number;
}

async function costs(): Promise<Cost[]> {
	return page.evaluate(async (RESONATORS) => {
		const w = window as never as {
			__made: Record<string, number>;
			__audit: {
				setTrack(t: unknown): unknown;
				renderPhrase(n: unknown[], s: number): Promise<unknown>;
				presets: {
					SOUND_PRESETS: { name: string; preset: { rackGraph?: { nodes?: unknown[] } } }[];
					BUILTIN_KITS: {
						name: string;
						keys: Record<string, { rackGraph?: { nodes?: unknown[] } }>;
					}[];
				};
			};
		};
		const a = w.__audit;
		const count = async (note: number, n: number) => {
			for (const k of Object.keys(w.__made)) delete w.__made[k];
			await a.renderPhrase(
				Array.from({ length: n }, (_, i) => ({ note, at: 0.05 + i * 0.01, dur: 0.3, vel: 90 })),
				0.5
			);
			return { ...w.__made };
		};
		const voice = async (t: unknown, note: number) => {
			a.setTrack(t);
			const one = await count(note, 1);
			const two = await count(note, 2);
			const d: Record<string, number> = {};
			for (const k of new Set([...Object.keys(one), ...Object.keys(two)]))
				d[k] = (two[k] || 0) - (one[k] || 0);
			const sum = (f: (k: string) => boolean) =>
				Object.entries(d)
					.filter(([k]) => f(k))
					.reduce((x, [, v]) => x + v, 0);
			return {
				nodes: sum(() => true),
				worklets: sum((k) => k.startsWith('W:')),
				resonators: sum((k) => RESONATORS.includes(k.slice(2))),
				ir: d.createConvolver || 0,
				space: (d['W:krsz-space'] || 0) + (d['W:krsz-loop'] || 0)
			};
		};
		const out = [];
		for (const p of a.presets.SOUND_PRESETS) {
			if (!p.preset.rackGraph?.nodes?.length) continue;
			out.push({ name: p.name, kit: false, ...(await voice({ ...p.preset, advanced: true }, 48)) });
		}
		for (const k of a.presets.BUILTIN_KITS)
			for (const [key, t] of Object.entries(k.keys)) {
				if (!t.rackGraph?.nodes?.length) continue;
				out.push({
					name: `${k.name} ${key}`,
					kit: true,
					...(await voice({ ...t, advanced: true }, +key))
				});
			}
		return out;
	}, RESONATORS);
}

describe('the built-in sounds keep to the voice budget', () => {
	it('cost about what a rack voice costs, note for note', async () => {
		const over: string[] = [];
		for (const c of await costs()) {
			const b = c.kit ? KIT_BUDGET : BUDGET;
			for (const k of ['nodes', 'worklets', 'resonators', 'ir', 'space'] as const)
				if (c[k] > b[k]) over.push(`${c.name}: ${k} ${c[k]} > ${b[k]}`);
		}
		expect(over).toEqual([]);
	}, 600000);
});
