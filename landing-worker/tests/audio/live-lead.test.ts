import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * Keys played live, on a real-time context -- the one path every other audio
 * test here skips, because they all render offline.
 *
 * A voice is built a node and a cable at a time on the main thread, and the
 * audio thread renders between those calls. A live key was scheduled at
 * `currentTime`, so a module could start before the cables carrying it
 * existed. An envelope that loses a few milliseconds sounds the same; a 3 ms
 * hammer pulse lost before its cable to the string existed strikes nothing,
 * and on a waveguide piano about one note in fifteen came out silent -- 4 of
 * 60 here, before the lead. Offline renders schedule ahead and never saw it.
 *
 * Needs a context that runs in real time, so Chrome is told it may start
 * audio without a gesture; the output is muted.
 */

const BASE = process.env.AUDIT_URL ?? 'http://localhost:5182';

let browser: Browser;
let page: Page;

beforeAll(async () => {
	browser = await chromium.launch({
		channel: 'chrome',
		args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio']
	});
	page = await browser.newPage();
	await page.goto(`${BASE}/synth/audit`, { waitUntil: 'networkidle' });
	await page.waitForFunction(
		() => !!(window as never as { __audit?: { engine?: unknown } }).__audit?.engine,
		{
			timeout: 15000
		}
	);
}, 60000);

afterAll(async () => {
	await browser?.close();
});

/** A felt: a constant through a gain a 1 ms / 2 ms ENV opens, striking a WIRE. */
const rig = {
	advanced: true,
	rackGraph: {
		nodes: [
			{ id: 'entry', type: 'in' },
			{ id: 'freq', type: 'tofreq' },
			{ id: 'dc', type: 'tosig' },
			{ id: 'env', type: 'env' },
			{ id: 'felt', type: 'gain' },
			{ id: 'w', type: 'wire' },
			{ id: 'output', type: 'out' }
		],
		cables: [
			{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' },
			{ from: 'entry', fromPort: 'pitch', to: 'freq', toPort: 'a' },
			{ from: 'freq', fromPort: 'out', to: 'w', toPort: 'pitch' },
			{ from: 'dc', fromPort: 'out', to: 'felt', toPort: 'in' },
			{ from: 'env', fromPort: 'out', to: 'felt', toPort: 'level' },
			{ from: 'felt', fromPort: 'out', to: 'w', toPort: 'in' },
			{ from: 'w', fromPort: 'out', to: 'output', toPort: 'in' }
		]
	},
	graphParams: {
		'dc.level': 1,
		'felt.level': 0,
		'env.envA': 0.001,
		'env.envD': 0.002,
		'env.envS': 0,
		'env.envR': 0.001,
		'env.envCurve': 0,
		'w.wireDecay': 1
	},
	graphWaves: {},
	presetGain: 1
};

/** Play `count` keys 130 ms apart and read each one's own output 100 ms in. */
async function playFast(timbre: unknown, count: number) {
	return page.evaluate(
		async ({ t, count }) => {
			type Voice = { advGraphOut?: GainNode };
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					sound: { init(resume: boolean): Promise<void> };
					engine: {
						audioCtx(): AudioContext;
						activeVoices: Map<string, Voice>;
						noteOn(track: number, note: number, vel: number): void;
						noteOff(track: number, note: number): void;
					};
				};
			};
			const { engine, sound } = w.__audit;
			w.__audit.setTrack(t);
			await sound.init(true);
			const ctx = engine.audioCtx();
			const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
			const peaks: number[] = [];
			let most = 0;
			for (let i = 0; i < count; i++) {
				const note = 30 + ((i * 7) % 24);
				const before = new Set(engine.activeVoices.keys());
				engine.noteOn(0, note, 100);
				most = Math.max(most, engine.activeVoices.size);
				const key = [...engine.activeVoices.keys()].find((k) => !before.has(k));
				const out = key ? engine.activeVoices.get(key)?.advGraphOut : undefined;
				const a = ctx.createAnalyser();
				a.fftSize = 2048;
				out?.connect(a);
				await wait(100);
				const f = new Float32Array(2048);
				a.getFloatTimeDomainData(f);
				let p = 0;
				for (const x of f) p = Math.max(p, Math.abs(x));
				peaks.push(p);
				engine.noteOff(0, note);
				await wait(30);
			}
			return { state: ctx.state, peaks, most };
		},
		{ t: timbre, count }
	);
}

describe('a key played live', () => {
	it('is struck every time, however fast the keys come', async () => {
		const r = await playFast(rig, 40);
		expect(r.state).toBe('running');
		const silent = r.peaks.filter((p) => p < 1e-3).length;
		expect(silent, `silent notes: ${JSON.stringify(r.peaks.map((p) => +p.toExponential(1)))}`).toBe(
			0
		);
	}, 60000);

	it('is struck when an older voice has to be stolen to make room for it', async () => {
		/* Stealing a voice fires its ON-CHOKE in the middle of the new key's
		   build. That build's queued gates were cleared by it, so the key that
		   caused the steal never sounded -- 3 of 60 on the piano. A 3 s DCAY
		   keeps every released voice alive long enough that the pool fills. */
		const r = await playFast({ ...rig, graphParams: { ...rig.graphParams, 'w.wireDecay': 3 } }, 40);
		expect(r.most, 'the pool never filled, so nothing was stolen').toBeGreaterThanOrEqual(6);
		const silent = r.peaks.filter((p) => p < 1e-3).length;
		expect(silent, `silent notes: ${JSON.stringify(r.peaks.map((p) => +p.toExponential(1)))}`).toBe(
			0
		);
	}, 60000);
});
