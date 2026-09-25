import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * TSND, TRTN and CTRL: the parts of a patch that belong to the track and the
 * player rather than to one key.
 *
 * TRTN's chain is built once per track and every note's TSND lands in it, so
 * the claims worth measuring are that it is built once however many notes
 * play, that it rings on after the note that fed it, that a note's release
 * still fades what that note sends, and that an edit is picked up. CTRL is
 * live -- a controller moved under a held note reaches it -- and at rest in
 * an export, which has no hands on it.
 *
 * The live half needs a context that runs in real time, so Chrome is told it
 * may start audio without a gesture; the output is muted.
 */

const BASE = process.env.AUDIT_URL ?? 'http://localhost:5182';
const RATE = 48000;

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
		{ timeout: 15000 }
	);
}, 60000);

afterAll(async () => {
	await browser?.close();
});

type Cable = { from: string; fromPort: string; to: string; toPort: string };
const cable = (from: string, fromPort: string, to: string, toPort: string): Cable => ({
	from,
	fromPort,
	to,
	toPort
});

/** An oscillator at the key's pitch, `source` into TSND; TRTN through `chain` into its own OUT. */
function busRig(opts: {
	source?: 'osc' | 'excite';
	chain?: { nodes: { id: string; type: string }[]; cables: Cable[]; last: string };
	params?: Record<string, number>;
}) {
	const source = opts.source ?? 'osc';
	const chain = opts.chain ?? { nodes: [], cables: [], last: 'rtn' };
	return {
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'freq', type: 'tofreq' },
				{ id: 'src', type: source },
				{ id: 'snd', type: 'tsend' },
				{ id: 'rtn', type: 'trtn' },
				...chain.nodes,
				{ id: 'board', type: 'out' }
			],
			cables: [
				cable('entry', 'then', 'snd', 'exec'),
				cable('entry', 'then', 'board', 'exec'),
				...(source === 'osc'
					? [cable('entry', 'pitch', 'freq', 'a'), cable('freq', 'out', 'src', 'pitch')]
					: []),
				cable('src', 'out', 'snd', 'in'),
				...chain.cables,
				cable(chain.last, 'out', 'board', 'in')
			]
		},
		graphParams: { 'src.exLength': 3, 'src.hardness': 40, 'src.exTone': 3000, ...opts.params },
		graphWaves: {},
		presetGain: 1
	};
}

/** Render `notes` on track 0, counting how many times a track chain was built. */
async function render(
	timbre: unknown,
	notes: { note: number; at: number; dur: number; vel: number }[],
	seconds: number
): Promise<{ x: Float32Array; chainBuilds: number }> {
	const r = await page.evaluate(
		async (a) => {
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					renderPhrase(
						n: unknown[],
						s: number
					): Promise<{ ok: boolean; wav?: string; error?: string }>;
					engine: Record<string, (...args: unknown[]) => unknown>;
				};
			};
			const engine = w.__audit.engine;
			const own = engine.buildActivation;
			let chainBuilds = 0;
			engine.buildActivation = function (this: unknown, ...args: unknown[]) {
				if (args[13] === 'track') chainBuilds++;
				return own.apply(this, args);
			};
			try {
				w.__audit.setTrack(a.t);
				const out = await w.__audit.renderPhrase(a.notes, a.seconds);
				return { ...out, chainBuilds };
			} finally {
				engine.buildActivation = own;
			}
		},
		{ t: timbre, notes, seconds }
	);
	expect(r.ok, r.error).toBe(true);
	const bytes = Buffer.from(r.wav!, 'base64');
	const n = (bytes.length - 44) / 4;
	const x = new Float32Array(n);
	for (let i = 0; i < n; i++)
		x[i] = (bytes.readInt16LE(44 + i * 4) + bytes.readInt16LE(46 + i * 4)) / 2 / 32767;
	return { x, chainBuilds: r.chainBuilds };
}

function rms(x: Float32Array, a: number, b: number): number {
	let s = 0;
	const i0 = Math.floor(a * RATE);
	const i1 = Math.min(x.length, Math.floor(b * RATE));
	for (let i = i0; i < i1; i++) s += x[i] * x[i];
	return Math.sqrt(s / Math.max(1, i1 - i0));
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
	return Math.hypot(re, im) / n;
}

// The piano roll counts down from C8 (MIDI 108).
const key = (midi: number) => 108 - midi;
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

describe('TSND into TRTN: one chain for the track', () => {
	it('builds the chain once however many notes play into it', async () => {
		const { x, chainBuilds } = await render(
			busRig({}),
			[
				{ note: key(57), at: 0.05, dur: 0.8, vel: 100 },
				{ note: key(64), at: 0.1, dur: 0.8, vel: 100 },
				{ note: key(69), at: 0.15, dur: 0.8, vel: 100 }
			],
			1.2
		);
		expect(chainBuilds).toBe(1);
		// Every note arrives through it: all three pitches are in the one output.
		const noise = level(x, hz(60.5), 0.3, 0.7);
		for (const m of [57, 64, 69]) expect(level(x, hz(m), 0.3, 0.7)).toBeGreaterThan(noise * 20);
	}, 60000);

	it("rings on after the note that fed it, for the chain's own tail", async () => {
		const space = {
			nodes: [{ id: 'room', type: 'space' }],
			cables: [cable('rtn', 'out', 'room', 'in')],
			last: 'room'
		};
		const strike = [{ note: key(60), at: 0.05, dur: 0.1, vel: 100 }];
		const shared = await render(
			busRig({
				source: 'excite',
				chain: space,
				params: { 'room.spaceSize': 80, 'room.spaceDecay': 90, 'room.spaceMix': 100 }
			}),
			strike,
			2
		);
		const dry = await render(busRig({ source: 'excite' }), strike, 2);
		/* A 3 ms strike into a bare TRTN is over at once -- what is left is the
		   16-bit WAV's own floor, one step is 3e-5 -- and into a room it is not. */
		expect(rms(dry.x, 0.8, 1.2)).toBeLessThan(1e-4);
		expect(rms(shared.x, 0.8, 1.2)).toBeGreaterThan(3e-4);
	}, 60000);

	it('fades what a note sends when the note is released', async () => {
		const { x } = await render(busRig({}), [{ note: key(60), at: 0.05, dur: 0.5, vel: 100 }], 1.6);
		const held = rms(x, 0.2, 0.5);
		expect(held).toBeGreaterThan(0.01);
		// The oscillator itself never stops on its own; the send's fade is what ends it.
		expect(rms(x, 1.2, 1.5)).toBeLessThan(held * 0.01);
	}, 60000);

	it('ignores a note-only signal cabled into the chain', async () => {
		// ENTRY's VEL has no one value on a track many notes share. A cable
		// from a note's own oscillator into the chain is dropped, not built.
		const t = busRig({
			chain: {
				nodes: [{ id: 'mix', type: 'sum' }],
				cables: [cable('rtn', 'out', 'mix', 'in'), cable('src', 'out', 'mix', 'in')],
				last: 'mix'
			}
		});
		const { x } = await render(t, [{ note: key(60), at: 0.05, dur: 0.5, vel: 100 }], 0.8);
		const alone = await render(busRig({}), [{ note: key(60), at: 0.05, dur: 0.5, vel: 100 }], 0.8);
		expect(rms(x, 0.2, 0.5)).toBeCloseTo(rms(alone.x, 0.2, 0.5), 3);
	}, 60000);
});

/** An oscillator whose level is CTRL's `port`, and nothing else. */
function ctrlRig(port: string) {
	return {
		advanced: true,
		rackGraph: {
			nodes: [
				{ id: 'entry', type: 'in' },
				{ id: 'freq', type: 'tofreq' },
				{ id: 'osc', type: 'osc' },
				{ id: 'hands', type: 'ctrl' },
				{ id: 'vca', type: 'gain' },
				{ id: 'output', type: 'out' }
			],
			cables: [
				cable('entry', 'then', 'output', 'exec'),
				cable('entry', 'pitch', 'freq', 'a'),
				cable('freq', 'out', 'osc', 'pitch'),
				cable('osc', 'out', 'vca', 'in'),
				cable('hands', port, 'vca', 'level'),
				cable('vca', 'out', 'output', 'in')
			]
		},
		graphParams: { 'vca.level': 1, 'hands.cc': 74 },
		graphWaves: {},
		presetGain: 1
	};
}

describe('CTRL', () => {
	it('is at rest in an export, wherever the controller was left', async () => {
		await page.evaluate(() => {
			const w = window as never as {
				__audit: { engine: { setController(k: string, v: number, cc?: number): void } };
			};
			w.__audit.engine.setController('ped', 1);
			w.__audit.engine.setController('cc', 1, 74);
		});
		for (const port of ['ped', 'cc']) {
			const { x } = await render(
				ctrlRig(port),
				[{ note: key(60), at: 0.05, dur: 0.4, vel: 100 }],
				0.6
			);
			// The knob a signal claims reads zero, so a resting controller is silence.
			expect(rms(x, 0.1, 0.4), port).toBeLessThan(1e-4);
		}
		await page.evaluate(() => {
			const w = window as never as {
				__audit: { engine: { setController(k: string, v: number, cc?: number): void } };
			};
			w.__audit.engine.setController('ped', 0);
			w.__audit.engine.setController('cc', 0, 74);
		});
	}, 60000);

	it('reaches a note already sounding when the controller moves', async () => {
		const r = await page.evaluate(async (t) => {
			type Voice = { advGraphOut?: GainNode };
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					sound: { init(resume: boolean): Promise<void> };
					engine: {
						audioCtx(): AudioContext;
						noteOn(track: number, note: number, vel: number): void;
						noteOff(track: number, note: number): void;
						setController(k: string, v: number, cc?: number): void;
						activeVoices: Map<string, Voice>;
					};
				};
			};
			const { engine, sound } = w.__audit;
			w.__audit.setTrack(t);
			await sound.init(true);
			const ctx = engine.audioCtx();
			const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const peakOf = async (a: AnalyserNode) => {
				const f = new Float32Array(2048);
				a.getFloatTimeDomainData(f);
				let p = 0;
				for (const v of f) p = Math.max(p, Math.abs(v));
				return p;
			};
			engine.setController('ped', 0);
			const before = new Set(engine.activeVoices.keys());
			engine.noteOn(0, 48, 100);
			const k = [...engine.activeVoices.keys()].find((k) => !before.has(k))!;
			const a = ctx.createAnalyser();
			a.fftSize = 2048;
			engine.activeVoices.get(k)?.advGraphOut?.connect(a);
			await wait(150);
			const up = await peakOf(a);
			engine.setController('ped', 1);
			await wait(150);
			const down = await peakOf(a);
			engine.setController('ped', 0);
			await wait(150);
			const off = await peakOf(a);
			engine.noteOff(0, 48);
			return { up, down, off };
		}, ctrlRig('ped'));
		expect(r.up).toBeLessThan(1e-3);
		expect(r.down).toBeGreaterThan(0.1);
		expect(r.off).toBeLessThan(1e-3);
	}, 60000);
});

describe('a live chain', () => {
	it('is kept while it matches the patch, rebuilt after an edit, and gone on STOP', async () => {
		const r = await page.evaluate(
			async (t) => {
				const w = window as never as {
					__audit: {
						setTrack(t: unknown): unknown;
						sound: { init(resume: boolean): Promise<void> };
						engine: Record<string, unknown> & {
							audioCtx(): AudioContext;
							noteOn(track: number, note: number, vel: number): void;
							noteOff(track: number, note: number): void;
							stopAll(): void;
							updateTrack(i: number, p: unknown): void;
							getTracks(): { graphParams?: Record<string, number> }[];
							trackChains: WeakMap<BaseAudioContext, Map<number, unknown>>;
							buildActivation: (...a: unknown[]) => unknown;
						};
					};
				};
				const { engine, sound } = w.__audit;
				w.__audit.setTrack(t);
				await sound.init(true);
				const ctx = engine.audioCtx();
				const own = engine.buildActivation;
				let builds = 0;
				engine.buildActivation = function (this: unknown, ...args: unknown[]) {
					if (args[13] === 'track') builds++;
					return own.apply(this, args);
				};
				const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
				try {
					engine.noteOn(0, 48, 100);
					await wait(50);
					engine.noteOn(0, 52, 100);
					await wait(50);
					const same = builds;
					const params = { ...(engine.getTracks()[0].graphParams ?? {}), 'room.spaceSize': 20 };
					engine.updateTrack(0, { graphParams: params });
					engine.noteOn(0, 55, 100);
					await wait(50);
					const edited = builds;
					engine.stopAll();
					const left = engine.trackChains.get(ctx)?.size ?? 0;
					return { same, edited, left };
				} finally {
					engine.buildActivation = own;
				}
			},
			busRig({
				chain: {
					nodes: [{ id: 'room', type: 'space' }],
					cables: [cable('rtn', 'out', 'room', 'in')],
					last: 'room'
				}
			})
		);
		expect(r.same).toBe(1);
		expect(r.edited).toBe(2);
		expect(r.left).toBe(0);
	}, 60000);
});
