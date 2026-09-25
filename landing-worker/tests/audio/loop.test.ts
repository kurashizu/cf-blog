import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * SEND/RTN loops compiled into one processor, measured.
 *
 * Web Audio closes every cycle through a render quantum, so a loop drawn with
 * SEND and RTN used to take its DELAY's time *plus* two blocks -- 256 samples,
 * 5.3 ms here -- and no comb, Karplus string or allpass could be shorter than
 * that. Compiled, the loop is exactly as long as what is drawn on it. The
 * claims: a loop's period is its DELAY's TIME to the sample; a string made of
 * one plays its delay's pitch; a FILTER inside one is the same filter as the
 * native node; a cable into a knob on the loop still lands; and a loop through
 * a module the processor does not know still rings, the old way.
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

type Node = { id: string; type: string };
type Cable = { from: string; fromPort: string; to: string; toPort: string };
const c = (from: string, to: string, toPort = 'in', fromPort = 'out'): Cable => ({
	from,
	fromPort,
	to,
	toPort
});

/** A patch around ENTRY and OUT; `last` is what OUT hears. */
function patch(nodes: Node[], cables: Cable[], params: Record<string, number>, last: string) {
	return {
		advanced: true,
		rackGraph: {
			nodes: [{ id: 'entry', type: 'in' }, ...nodes, { id: 'output', type: 'out' }],
			cables: [
				c('entry', 'output', 'exec', 'then'),
				c('entry', 'freq', 'a', 'pitch'),
				...cables,
				c(last, 'output')
			]
		},
		graphParams: params,
		graphWaves: {},
		presetGain: 1
	};
}

async function render(timbre: unknown, seconds: number): Promise<Float32Array> {
	const r = await page.evaluate(
		async (a) => {
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					renderPhrase(
						n: unknown[],
						s: number
					): Promise<{ ok: boolean; wav?: string; error?: string }>;
				};
			};
			w.__audit.setTrack(a.t);
			// C4, held for the whole render.
			return await w.__audit.renderPhrase([{ note: 48, at: 0.02, dur: a.s, vel: 100 }], a.s + 0.1);
		},
		{ t: timbre, s: seconds }
	);
	expect(r.ok, r.error).toBe(true);
	const bytes = Buffer.from(r.wav!, 'base64');
	const n = (bytes.length - 44) / 4;
	const x = new Float32Array(n);
	for (let i = 0; i < n; i++)
		x[i] = (bytes.readInt16LE(44 + i * 4) + bytes.readInt16LE(46 + i * 4)) / 2 / 32767;
	return x;
}

/** The lag in [lo, hi] samples where [a, b) seconds best matches itself. */
function period(x: Float32Array, a: number, b: number, lo: number, hi: number): number {
	const i0 = Math.floor(a * RATE);
	const i1 = Math.floor(b * RATE);
	const score: number[] = [];
	for (let lag = lo; lag <= hi; lag++) {
		let r = 0;
		let e = 0;
		for (let i = i0; i < i1; i++) {
			r += x[i] * x[i + lag];
			e += x[i + lag] * x[i + lag];
		}
		score.push(r / Math.sqrt(e + 1e-12));
	}
	/* A signal repeating every P samples also repeats every 2P and 3P, and a
	   decaying one can score those a hair higher. The shortest lag near the
	   best is the period. */
	const top = Math.max(...score);
	for (let k = 1; k < score.length - 1; k++)
		if (score[k] >= top * 0.95 && score[k] >= score[k - 1] && score[k] >= score[k + 1])
			return lo + k;
	return lo + score.indexOf(top);
}

function rms(x: Float32Array, a: number, b: number): number {
	let s = 0;
	const i0 = Math.floor(a * RATE);
	const i1 = Math.floor(b * RATE);
	for (let i = i0; i < i1; i++) s += x[i] * x[i];
	return Math.sqrt(s / (i1 - i0));
}

/** A strike into a comb: EXCT -> SUM -> DELAY -> [mid] -> SEND, RTN -> GAIN -> SUM, heard at DELAY. */
function comb(time: number, fb: number, mid?: Node, extra: Record<string, number> = {}) {
	const nodes: Node[] = [
		{ id: 'freq', type: 'tofreq' },
		{ id: 'e', type: 'excite' },
		{ id: 'sum', type: 'sum' },
		{ id: 'd', type: 'delay' },
		...(mid ? [mid] : []),
		{ id: 's', type: 'fbsend' },
		{ id: 'r', type: 'fbrtn' },
		{ id: 'fb', type: 'gain' }
	];
	const cables = [
		c('e', 'sum'),
		c('sum', 'd'),
		...(mid ? [c('d', mid.id), c(mid.id, 's')] : [c('d', 's')]),
		c('r', 'fb'),
		c('fb', 'sum')
	];
	return patch(
		nodes,
		cables,
		{
			'e.exLength': 0.5,
			'e.hardness': 80,
			'e.exTone': 12000,
			'd.delayTime': time,
			'fb.level': fb,
			...extra
		},
		'd'
	);
}

describe('a compiled loop', () => {
	it('is exactly as long as its DELAY', async () => {
		// 2 ms is 96 samples; the block-delayed loop measured 96 + 256.
		for (const ms of [1, 2, 3.5]) {
			const x = await render(comb(ms / 1000, 0.9), 0.4);
			const lag = period(x, 0.05, 0.25, 20, 500);
			expect(
				Math.abs(lag - (ms / 1000) * RATE),
				`${ms} ms loop read ${lag} samples`
			).toBeLessThanOrEqual(1);
		}
	}, 90000);

	it('keeps the period when the line has to grow for it', async () => {
		// The line starts at 1024 samples and grows on demand; 100 ms is 4800.
		const x = await render(comb(0.1, 0.9), 0.8);
		const lag = period(x, 0.05, 0.3, 4700, 4900);
		expect(Math.abs(lag - 4800), `100 ms loop read ${lag} samples`).toBeLessThanOrEqual(1);
	}, 60000);

	it("makes a string that plays its delay's pitch", async () => {
		/* Karplus-Strong: a burst round a delay one period long through a gentle
		   lowpass. 440 Hz is a 2.27 ms loop -- impossible a block at a time,
		   where the shortest loop was 5.3 ms, about 190 Hz. The lowpass adds a
		   little delay of its own, so the pitch sits slightly flat. */
		const x = await render(
			comb(
				1 / 440,
				0.995,
				{ id: 'lp', type: 'filter' },
				{ 'lp.type': 0, 'lp.cutoff': 8000, 'lp.q': 0 }
			),
			1
		);
		const f = RATE / period(x, 0.2, 0.6, 60, 400);
		expect(f).toBeGreaterThan(440 * 0.98);
		expect(f).toBeLessThan(440 * 1.005);
		// And it rings: a string, not a click.
		expect(rms(x, 0.6, 0.9)).toBeGreaterThan(rms(x, 0.02, 0.1) * 0.05);
	}, 60000);

	it('filters exactly as BiquadFilterNode does', async () => {
		/* The same sawtooth through the same FILTER, once inside a loop whose
		   feedback is zero and once as the native node. Every type, Q in dB for
		   the low- and highpass as the Web Audio spec has it. */
		const osc = (inLoop: boolean, params: Record<string, number>) =>
			patch(
				[
					{ id: 'freq', type: 'tofreq' },
					{ id: 'o', type: 'osc' },
					{ id: 'f', type: 'filter' },
					...(inLoop
						? [
								{ id: 'sum', type: 'sum' },
								{ id: 's', type: 'fbsend' },
								{ id: 'r', type: 'fbrtn' },
								{ id: 'fb', type: 'gain' }
							]
						: [])
				],
				[
					c('freq', 'o', 'pitch'),
					...(inLoop
						? [c('o', 'sum'), c('sum', 'f'), c('f', 's'), c('r', 'fb'), c('fb', 'sum')]
						: [c('o', 'f')])
				],
				{ 'fb.level': 0, ...params },
				'f'
			);
		const cases: Record<string, number>[] = [
			{ 'f.type': 0, 'f.cutoff': 900, 'f.q': 6 },
			{ 'f.type': 1, 'f.cutoff': 1500, 'f.q': 3 },
			{ 'f.type': 2, 'f.cutoff': 1200, 'f.q': 4 },
			{ 'f.type': 3, 'f.cutoff': 800, 'f.q': 2 },
			{ 'f.type': 4, 'f.cutoff': 500, 'f.filterGain': 9 },
			{ 'f.type': 5, 'f.cutoff': 3000, 'f.filterGain': -8 },
			{ 'f.type': 6, 'f.cutoff': 1000, 'f.q': 2, 'f.filterGain': 10 },
			{ 'f.type': 7, 'f.cutoff': 700, 'f.q': 1.5 }
		];
		for (const params of cases) {
			const a = await render(osc(true, params), 0.3);
			const b = await render(osc(false, params), 0.3);
			let worst = 0;
			for (let i = Math.floor(0.05 * RATE); i < Math.floor(0.25 * RATE); i++)
				worst = Math.max(worst, Math.abs(a[i] - b[i]));
			expect(rms(b, 0.05, 0.25), JSON.stringify(params)).toBeGreaterThan(0.01);
			expect(
				worst,
				`type ${params['f.type']}: ${worst} against ${rms(b, 0.05, 0.25)}`
			).toBeLessThan(rms(b, 0.05, 0.25) * 0.02);
		}
	}, 120000);

	it('still takes a moving signal on a knob inside it', async () => {
		/* An ENV into the feedback GAIN's level. The knob is 0, so without the
		   cable the strike passes once; with it the loop runs at the ENV's 0.8
		   (S is the card's percent). A 20 ms loop, so at 0.8 a trip the ring is
		   still there a fifth of a second on; at 2 ms it is 60 dB down in 60. */
		const withEnv = comb(0.02, 0, undefined, {
			'env.envA': 0.001,
			'env.envD': 0.01,
			'env.envS': 80,
			'env.envR': 0.1
		});
		withEnv.rackGraph.nodes.push({ id: 'env', type: 'env' });
		withEnv.rackGraph.cables.push(c('env', 'fb', 'level'));
		const driven = await render(withEnv, 0.4);
		const still = await render(comb(0.02, 0), 0.4);
		expect(rms(still, 0.1, 0.3)).toBeLessThan(1e-4);
		expect(rms(driven, 0.1, 0.3)).toBeGreaterThan(1e-3);
	}, 60000);
});

describe('a loop the processor does not know', () => {
	it('rings the old way, a block at a time', async () => {
		// PAN is not a loop module, so this loop is SEND/RTN's native pair.
		const x = await render(comb(0.002, 0.9, { id: 'p', type: 'pan' }), 0.4);
		const lag = period(x, 0.05, 0.25, 20, 700);
		expect(lag, `block-delayed loop read ${lag}`).toBeGreaterThan(96 + 200);
	}, 60000);
});
