import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * Every patch-bay preset plays the key it is given, and plays a note rather
 * than a hiss.
 *
 * Two ways the shipped set went wrong without any test noticing. The old
 * string section (BOWED STRINGS) bowed an OSC nothing told the pitch, so every key sounded 220 Hz
 * under a string sounding the key. FLUTE and CLARINET pushed their
 * breath through TUBE at the default MIX, and TUBE passes the part of its
 * input the MIX leaves dry -- a breath already amplified to drive the old
 * resonator, so the noise was louder than the note (FLUTE measured -0.8 dB
 * harmonic-to-noise).
 *
 * Pitch is read as the first autocorrelation peak within 5% of the best, and
 * harmonic-to-noise from that peak's height: r / (1 - r).
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

interface Read {
	name: string;
	note: number;
	hz: number;
	hnr: number;
}

async function readAll(): Promise<Read[]> {
	return page.evaluate(async () => {
		const w = window as never as {
			__audit: {
				setTrack(t: unknown): unknown;
				renderPhrase(n: unknown[], s: number): Promise<{ ok: boolean; wav?: string }>;
				presets: {
					SOUND_PRESETS: {
						name: string;
						preset: { rackGraph?: { nodes?: unknown[] } } & Record<string, unknown>;
					}[];
				};
			};
		};
		const out = [];
		for (const pr of w.__audit.presets.SOUND_PRESETS) {
			if (!pr.preset.rackGraph?.nodes?.length) continue;
			w.__audit.setTrack({ ...pr.preset, advanced: true });
			for (const note of [36, 48]) {
				const r = await w.__audit.renderPhrase([{ note, at: 0.02, dur: 1, vel: 100 }], 1.3);
				const b = Uint8Array.from(atob(r.wav!), (c) => c.charCodeAt(0));
				const dv = new DataView(b.buffer);
				const n = (b.length - 44) / 4;
				const x = new Float32Array(n);
				for (let i = 0; i < n; i++) x[i] = dv.getInt16(44 + i * 4, true) / 32767;
				// Half a second in: past every attack, still inside the note.
				const L = 8192;
				const seg = x.subarray(24000, 24000 + L);
				const rs = new Float32Array(2001);
				let best = 0;
				for (let k = 40; k <= 2000; k++) {
					let a = 0;
					let e1 = 0;
					let e2 = 0;
					for (let i = 0; i + k < L; i++) {
						a += seg[i] * seg[i + k];
						e1 += seg[i] ** 2;
						e2 += seg[i + k] ** 2;
					}
					rs[k] = a / Math.sqrt(e1 * e2 + 1e-12);
					best = Math.max(best, rs[k]);
				}
				let lag = 0;
				for (let k = 41; k < 2000; k++)
					if (rs[k] > best * 0.95 && rs[k] >= rs[k - 1] && rs[k] >= rs[k + 1]) {
						lag = k;
						break;
					}
				out.push({
					name: pr.name,
					note,
					hz: lag ? 48000 / lag : 0,
					hnr: 10 * Math.log10(best / (1 - best + 1e-9))
				});
			}
		}
		return out;
	});
}

describe('patch-bay presets', () => {
	let reads: Read[] = [];
	beforeAll(async () => {
		reads = await readAll();
	}, 240000);

	it('follow the key: an octave apart on the keyboard is an octave apart in pitch', () => {
		const names = [...new Set(reads.map((r) => r.name))];
		expect(names.length).toBeGreaterThan(10);
		for (const name of names) {
			const [lo, hi] = [36, 48].map((n) => reads.find((r) => r.name === name && r.note === n)!);
			// Note rows run top to bottom, so the higher row number is the lower pitch.
			const ratio = lo.hz / hi.hz;
			expect(ratio, `${name}: ${lo.hz.toFixed(1)} Hz vs ${hi.hz.toFixed(1)} Hz`).toBeGreaterThan(
				1.9
			);
			expect(ratio, `${name}: ${lo.hz.toFixed(1)} Hz vs ${hi.hz.toFixed(1)} Hz`).toBeLessThan(2.1);
		}
	});

	it('stop blowing when the key is up', async () => {
		/* The breath had no envelope, so it hissed on through a release as
		   long as TUBE's DCAY -- 0.9 s on FLUTE. A wind stops when the player
		   does: 0.2 s after the key, 30 dB down on the held note. Not 40: FLUTE
		   plays in a room now, and what is left at 0.2 s is the room, not the
		   breath (before the fix this read 2 dB). */
		const drops = await page.evaluate(async () => {
			const w = window as never as {
				__audit: {
					setTrack(t: unknown): unknown;
					renderPhrase(n: unknown[], s: number): Promise<{ ok: boolean; wav?: string }>;
					presets: { SOUND_PRESETS: { name: string; preset: Record<string, unknown> }[] };
				};
			};
			const out: Record<string, number> = {};
			for (const name of ['FLUTE', 'CLARINET']) {
				const pr = w.__audit.presets.SOUND_PRESETS.find((p) => p.name === name)!;
				w.__audit.setTrack({ ...pr.preset, advanced: true });
				const r = await w.__audit.renderPhrase([{ note: 48, at: 0.02, dur: 0.6, vel: 100 }], 1.2);
				const b = Uint8Array.from(atob(r.wav!), (c) => c.charCodeAt(0));
				const dv = new DataView(b.buffer);
				const rms = (from: number) => {
					let s = 0;
					for (let i = 0; i < 2400; i++) s += (dv.getInt16(44 + (from + i) * 4, true) / 32767) ** 2;
					return Math.sqrt(s / 2400) + 1e-9;
				};
				out[name] = 20 * Math.log10(rms(0.4 * 48000) / rms(0.82 * 48000));
			}
			return out;
		});
		for (const [name, db] of Object.entries(drops))
			expect(db, `${name}: ${db.toFixed(1)} dB down`).toBeGreaterThan(30);
	}, 60000);

	it('sound a note louder than their noise', () => {
		/* Not the mallets: a struck bar's overtones are not a harmonic series
		   (VIBRAPHONE's are 1 : 3.98 : 9.13) and its motor swings the level, and
		   autocorrelation reads both as noise. Nor the string section, which is
		   four players a few cents apart, each on a vibrato of their own -- the beating is the
		   point of it. None of these is a hiss. */
		/* Nor PIZZ, for a reason of time rather than tone: a pizzicato is gone by
		   the time this reads -- half a second in, C3 is 25 dB under its pluck,
		   and what is left is mostly the hall it was plucked in. */
		/* Nor DRAWBAR ORGAN, whose rotating speaker moves its pitch and level
		   several times a second on purpose -- the same reason VIBRAPHONE's
		   motor is excused. */
		/* Nor HARPSICHORD, whose two 8' choirs a cent apart and a 4' above them
		   beat against each other, as a harpsichord's do. */
		const inharmonic = new Set([
			'VIBRAPHONE',
			'MARIMBA',
			'FULL STRING',
			'PIZZ',
			'DRAWBAR ORGAN',
			'HARPSICHORD'
		]);
		for (const r of reads.filter((r) => !inharmonic.has(r.name)))
			/* 18: the defects this guards read -0.8 dB (FLUTE's hiss) and 1.7 dB, and
			   the Iowa flute recordings read 27 to 33 on this same bench. A flute
			   with its breath and its vibrato arriving reads in the low twenties:
			   autocorrelation over 170 ms marks a pitch that is starting to move. */
			expect(r.hnr, `${r.name} at row ${r.note}: ${r.hnr.toFixed(1)} dB`).toBeGreaterThan(18);
	});
});
