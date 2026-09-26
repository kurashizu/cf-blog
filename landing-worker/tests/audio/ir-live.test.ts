import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * IR, the measured bodies, on a live context.
 *
 * The impulses are stored at 48 kHz and every offline render here runs at
 * 48 kHz, so nothing noticed that a ConvolverNode refuses a buffer at any
 * rate but its context's: on a live context at the device's 44.1 kHz the
 * buffer threw, the voice was never built, and every patch with an IR in it
 * -- PIANO, the strings, CLARINET -- was silent to anyone actually playing.
 * Played here the way a key plays them, on the real-time context.
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
		{ timeout: 15000 }
	);
}, 60000);

afterAll(async () => {
	await browser?.close();
});

describe('IR on a live context', () => {
	it('sounds in every preset that uses it, at whatever rate the device runs', async () => {
		const r = await page.evaluate(async () => {
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					sound: { init(resume: boolean): Promise<void>; getAnalyser(): AnalyserNode };
					engine: {
						audioCtx(): AudioContext;
						noteOn(t: number, n: number, v: number): void;
						stopAll(): void;
					};
					presets: {
						SOUND_PRESETS: {
							name: string;
							preset: { rackGraph?: { nodes: { type: string }[] } } & Record<string, unknown>;
						}[];
					};
				};
			};
			const { engine, sound, presets, setTrack } = w.__audit;
			await sound.init(true);
			const an = sound.getAnalyser();
			const buf = new Float32Array(an.fftSize);
			const out: { name: string; peak: number; error?: string }[] = [];
			const withIr = presets.SOUND_PRESETS.filter((p) =>
				p.preset.rackGraph?.nodes.some((n) => n.type === 'ir')
			);
			for (const p of withIr) {
				setTrack({ ...p.preset, advanced: true });
				try {
					engine.noteOn(0, 48, 100);
					await new Promise((res) => setTimeout(res, 250));
					an.getFloatTimeDomainData(buf);
					let peak = 0;
					for (const x of buf) peak = Math.max(peak, Math.abs(x));
					out.push({ name: p.name, peak });
				} catch (e) {
					out.push({ name: p.name, peak: 0, error: String(e) });
				}
				engine.stopAll();
				await new Promise((res) => setTimeout(res, 100));
			}
			return { rate: engine.audioCtx().sampleRate, out };
		});
		expect(r.out.length, 'presets using IR').toBeGreaterThanOrEqual(4);
		for (const p of r.out) {
			expect(p.error, `${p.name} at ${r.rate} Hz`).toBeUndefined();
			expect(p.peak, `${p.name} at ${r.rate} Hz`).toBeGreaterThan(1e-3);
		}
	}, 120000);
});
