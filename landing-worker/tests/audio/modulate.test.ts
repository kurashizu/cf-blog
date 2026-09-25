import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * RAND, S&H and SLEW, measured.
 *
 * S&H and SLEW are processors whose whole claim is a curve in time, so they
 * are driven directly -- their inputs automated on an offline context -- and
 * read back sample by sample. RAND is a value drawn per note, so it is played:
 * two notes must differ, the same export must not.
 */

const BASE = process.env.AUDIT_URL ?? 'http://localhost:5182';
const RATE = 48000;

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

/** Run one processor for `seconds`, its params automated by `plan`, and read output 0. */
async function drive(
	name: string,
	seconds: number,
	plan: Record<string, [number, number, 'set' | 'ramp'][]>,
	values: Record<string, number> = {}
): Promise<number[]> {
	return page.evaluate(
		async ({ name, seconds, plan, values }) => {
			type Dsp = { node: AudioWorkletNode; param(n: string): AudioParam };
			const { ensureLiveDsp, createLiveDsp } = (
				window as never as {
					__audit: {
						liveDsp: {
							ensureLiveDsp(c: BaseAudioContext): Promise<void>;
							createLiveDsp(c: BaseAudioContext, n: string, o: AudioWorkletNodeOptions): Dsp;
						};
					};
				}
			).__audit.liveDsp;
			const ctx = new OfflineAudioContext(1, Math.ceil(seconds * 48000), 48000);
			await ensureLiveDsp(ctx);
			const dsp = createLiveDsp(ctx, name, {
				numberOfInputs: 0,
				numberOfOutputs: 1,
				outputChannelCount: [1]
			});
			for (const [k, v] of Object.entries(values)) dsp.param(k).value = v;
			for (const [k, steps] of Object.entries(plan))
				for (const [t, v, how] of steps) {
					const prm = dsp.param(k);
					if (how === 'set') prm.setValueAtTime(v, t);
					else prm.linearRampToValueAtTime(v, t);
				}
			dsp.node.connect(ctx.destination);
			const buf = await ctx.startRendering();
			return Array.from(buf.getChannelData(0));
		},
		{ name, seconds, plan, values }
	);
}

const at = (y: number[], t: number) => y[Math.round(t * RATE)];

describe('SLEW', () => {
	it('arrives within 1 % in RISE going up and FALL coming down', async () => {
		const y = await drive(
			'krsz-slew',
			1,
			{
				in: [
					[0, 0, 'set'],
					[0.1, 1, 'set'],
					[0.5, 0, 'set']
				]
			},
			{ rise: 0.2, fall: 0.05 }
		);
		expect(at(y, 0.09)).toBeCloseTo(0, 5);
		// An exponential to within 1 % in RISE: 90 % at half of it, 99 % at all of it.
		expect(at(y, 0.2)).toBeGreaterThan(0.88);
		expect(at(y, 0.2)).toBeLessThan(0.92);
		expect(at(y, 0.3)).toBeGreaterThan(0.985);
		expect(at(y, 0.3)).toBeLessThan(0.995);
		// And down in FALL, four times faster.
		expect(at(y, 0.55)).toBeLessThan(0.015);
		expect(at(y, 0.55)).toBeGreaterThan(0.005);
	}, 30000);

	it('starts where its input is, rather than rising into the first note', async () => {
		const y = await drive('krsz-slew', 0.2, {}, { in: 0.7, rise: 1, fall: 1 });
		expect(at(y, 0)).toBeCloseTo(0.7, 5);
		expect(at(y, 0.15)).toBeCloseTo(0.7, 5);
	}, 30000);
});

describe('S&H', () => {
	it('takes IN as TRIG rises, and holds it until the next rise', async () => {
		// IN ramps 0 -> 1 over a second; TRIG rises at 0.25 and 0.625.
		const y = await drive('krsz-sh', 1, {
			in: [
				[0, 0, 'set'],
				[1, 1, 'ramp']
			],
			trig: [
				[0, 0, 'set'],
				[0.25, 1, 'set'],
				[0.3, 0, 'set'],
				[0.625, 1, 'set'],
				[0.7, 0, 'set']
			]
		});
		// Before the first rise: the sample taken at the note, IN's 0.
		expect(at(y, 0.2)).toBeCloseTo(0, 3);
		expect(at(y, 0.3)).toBeCloseTo(0.25, 2);
		expect(at(y, 0.6)).toBeCloseTo(0.25, 2);
		// TRIG falling does not sample; rising again does.
		expect(at(y, 0.65)).toBeCloseTo(0.625, 2);
		expect(at(y, 0.95)).toBeCloseTo(0.625, 2);
	}, 30000);
});

describe('RAND', () => {
	/** An oscillator whose level is a RAND between 0.2 and 1, and nothing else. */
	const rig = {
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'freq', type: 'tofreq' },
				{ id: 'osc', type: 'osc' },
				{ id: 'dice', type: 'rand' },
				{ id: 'vca', type: 'gain' },
				{ id: 'output', type: 'out' }
			],
			cables: [
				{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
				{ from: 'entry', fromPort: 'pitch', to: 'freq', toPort: 'a' },
				{ from: 'freq', fromPort: 'out', to: 'osc', toPort: 'pitch' },
				{ from: 'osc', fromPort: 'out', to: 'vca', toPort: 'in' },
				{ from: 'dice', fromPort: 'out', to: 'vca', toPort: 'level' },
				{ from: 'vca', fromPort: 'out', to: 'output', toPort: 'in' }
			]
		},
		graphParams: { 'dice.lo': 0.2, 'dice.hi': 1 },
		graphWaves: {},
		presetGain: 1
	};

	async function levels(timbre: unknown): Promise<number[]> {
		const r = await page.evaluate(async (t) => {
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					renderPhrase(n: unknown[], s: number): Promise<{ ok: boolean; wav?: string }>;
				};
			};
			w.__audit.setTrack(t);
			const notes = [0, 1, 2, 3, 4, 5].map((k) => ({
				note: 48,
				at: 0.05 + k * 0.3,
				dur: 0.25,
				vel: 100
			}));
			return await w.__audit.renderPhrase(notes, 2);
		}, timbre);
		const bytes = Buffer.from(r.wav!, 'base64');
		const x = (i: number) => bytes.readInt16LE(44 + i * 4) / 32767;
		return [0, 1, 2, 3, 4, 5].map((k) => {
			let s = 0;
			const i0 = Math.round((0.1 + k * 0.3) * RATE);
			for (let i = i0; i < i0 + 0.1 * RATE; i++) s += x(i) * x(i);
			return Math.sqrt(s / (0.1 * RATE));
		});
	}

	it('draws a different level for every note, inside MIN..MAX', async () => {
		const l = await levels(rig);
		for (const v of l) expect(v).toBeGreaterThan(0.01);
		// Six notes, six draws: no two the same to three places.
		expect(new Set(l.map((v) => v.toFixed(3))).size).toBe(6);
		// And the spread is RAND's, 0.2..1 of the loudest possible, not a jitter.
		expect(Math.min(...l) / Math.max(...l)).toBeLessThan(0.85);
	}, 60000);

	it('renders the same export twice', async () => {
		const a = await levels(rig);
		const b = await levels(rig);
		expect(b).toEqual(a);
	}, 60000);

	it('gives two cards on one note two draws', async () => {
		// The same patch with the RAND renamed draws differently: the id is in the draw.
		const renamed = JSON.parse(JSON.stringify(rig).replaceAll('"dice', '"die2'));
		const a = await levels(rig);
		const b = await levels(renamed);
		expect(b).not.toEqual(a);
	}, 60000);
});
