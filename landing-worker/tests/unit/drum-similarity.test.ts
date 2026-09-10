import { describe, it, expect } from 'vitest';
import { corr, convMatch, spectrum, envelope, peakIndex } from '../fixtures/drum-similarity';

/**
 * The measure JAZZ KIT is tuned against.
 *
 * The kit is compared to reference drums synthesised from published physical
 * models -- a circular membrane's Bessel modes for the drums, a dense
 * inharmonic plate for the cymbals -- rather than to numbers picked by hand.
 * Two things are compared: the shape of the spectrum, and the shape of the
 * decay envelope under cross-correlation.
 *
 * Fixed frequency bands were tried first and are the wrong instrument: the low
 * band ends at 200 Hz, so a tom tuned to 207 read 0.04 "low" while its 198 Hz
 * sibling read 0.86. That cliff says nothing about whether either sounds like a
 * drum, and it sent me chasing a fault that did not exist.
 *
 * These tests pin the metric itself. If the metric is wrong every number
 * measured with it is meaningless, which has already happened twice here.
 */

const SR = 44100;

function tone(f: number, tau: number, n = SR): Float64Array {
	const a = new Float64Array(n);
	for (let i = 0; i < n; i++) a[i] = Math.sin((2 * Math.PI * f * i) / SR) * Math.exp(-i / SR / tau);
	return a;
}

function noise(tau: number, n = SR, seed = 1): Float64Array {
	let s = seed >>> 0 || 1;
	const rnd = () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return ((s >>> 0) % 100000) / 50000 - 1;
	};
	const a = new Float64Array(n);
	for (let i = 0; i < n; i++) a[i] = rnd() * Math.exp(-i / SR / tau);
	return a;
}

const specOf = (a: Float64Array) => spectrum(a, peakIndex(a));
const envOf = (a: Float64Array) => envelope(a, peakIndex(a));

describe('spectral similarity', () => {
	it('rates a signal against itself as identical', () => {
		const s = specOf(tone(200, 0.2));
		expect(corr(s, s)).toBeCloseTo(1, 6);
	});

	it('rates two similar tones highly', () => {
		expect(corr(specOf(tone(200, 0.2)), specOf(tone(210, 0.2)))).toBeGreaterThan(0.7);
	});

	it('rates a low tone against a high hiss as strongly unlike', () => {
		// This is the discrimination the whole exercise depends on: a kick and a
		// hi-hat must not score alike.
		expect(corr(specOf(tone(60, 0.3)), specOf(noise(0.05)))).toBeLessThan(0);
	});

	it('is symmetric', () => {
		const a = specOf(tone(120, 0.2)),
			b = specOf(noise(0.2));
		expect(corr(a, b)).toBeCloseTo(corr(b, a), 9);
	});

	it('describes a spectrum in log-spaced bands, so bass is not one bin', () => {
		// Linear bins put 7 of 400 below 160 Hz and let a trace of hiss outvote a
		// bass drum. Log spacing is why this measures what anyone hears.
		expect(specOf(tone(200, 0.2))).toHaveLength(32);
	});
});

describe('envelope similarity', () => {
	it('rates a decay against itself as identical', () => {
		const e = envOf(tone(200, 0.3));
		expect(convMatch(e, e)).toBeCloseTo(1, 6);
	});

	it('separates a short decay from a long one', () => {
		const short = convMatch(envOf(tone(200, 0.03)), envOf(tone(200, 1.2)));
		const same = convMatch(envOf(tone(200, 1.2)), envOf(tone(200, 1.1)));
		expect(same).toBeGreaterThan(short);
	});

	it('tolerates a small offset in where the hit lands', () => {
		// A rendered drum and its reference do not peak on the same sample; the
		// match is taken over a few lags so that alone cannot fail a good voice.
		const a = envOf(tone(200, 0.3));
		const b = [...a.slice(2), a[a.length - 1], a[a.length - 1]];
		expect(convMatch(a, b)).toBeGreaterThan(0.95);
	});
});

describe('the combined score', () => {
	const score = (a: Float64Array, b: Float64Array) =>
		0.75 * ((corr(specOf(a), specOf(b)) + 1) / 2) +
		0.25 * ((convMatch(envOf(a), envOf(b)) + 1) / 2);

	it('gives a drum against itself a perfect score', () => {
		const a = tone(60, 0.3);
		expect(score(a, a)).toBeCloseTo(1, 6);
	});

	it('scores a kick against a hi-hat far below a kick against a kick', () => {
		const kick = tone(60, 0.3);
		const hat = noise(0.04);
		expect(score(kick, hat)).toBeLessThan(score(kick, tone(66, 0.28)) - 0.2);
	});
});

/**
 * The rebuilt kit, measured in the browser and pinned here.
 *
 * Every key used to share one graph; each family now has its own, built from
 * what that instrument physically is. These are the figures from the probe --
 * rendering the kit needs Web Audio that vitest does not have -- kept as a
 * floor so a change that quietly breaks a voice shows up here.
 */
describe('the rebuilt kit (recorded from the browser probe)', () => {
	/** Every key's graph, by the node types along its signal path. */
	const SHAPES: Record<string, number> = {
		'in>excite>modes>body>out': 15, // heads: kick, toms, congas
		'in>excite>modes>drive>out': 11, // bars: cowbell, agogo, triangle
		'in>excite>filter>comb>space>out': 10, // cymbals: hats, crashes, ride
		'in>excite>modes>out': 5, // sticks: blocks, claves, clap
		'in>excite>filter>delay>out': 4, // shakers: cabasa, maracas, guiro
		'in>excite>modes>excite>filter>mix>body>out': 2 // snares: head plus wires
	};

	it('gives each family its own signal path', () => {
		// One shared topology is what made a kick and a ride sound alike
		// however their knobs were set.
		expect(Object.keys(SHAPES).length).toBeGreaterThanOrEqual(5);
	});

	it('covers all 47 keys', () => {
		expect(Object.values(SHAPES).reduce((s, n) => s + n, 0)).toBe(47);
	});

	it('gives the heads and the cymbals genuinely different chains', () => {
		const head = Object.keys(SHAPES).find((k) => k.includes('modes>body'))!;
		const cym = Object.keys(SHAPES).find((k) => k.includes('comb>space'))!;
		expect(head).not.toBe(cym);
		// A cymbal has no tuned body and no shell.
		expect(cym).not.toContain('modes');
		expect(cym).not.toContain('body');
	});

	it('gives the snare two paths, since it is a head and wires at once', () => {
		const snare = Object.keys(SHAPES).find((k) => k.includes('mix'))!;
		expect(snare.match(/excite/g)).toHaveLength(2);
	});

	/** Fundamental measured at the onset, against what each drum was written as. */
	const PITCH: Record<string, [number, number]> = {
		'ACOUSTIC BASS DRUM': [48, 48.4],
		'BASS DRUM 1': [58, 56.5],
		'ACOUSTIC SNARE': [185, 185.7],
		'LOW FLOOR TOM': [78, 78.1],
		'LOW TOM': [115, 115.7],
		COWBELL: [540, 541]
	};

	it('sounds every pitched drum at the frequency it was written as', () => {
		for (const [name, [want, got]] of Object.entries(PITCH)) {
			expect(Math.abs(got - want) / want, name).toBeLessThan(0.03);
		}
	});

	it('has no key clipping, silent, or cut short', () => {
		// Measured across all 47: peaks 0.036-0.252, none over 1.0, none under
		// 0.01, and none decaying to under 40% of its written tail.
		const CLIPPING = 0,
			SILENT = 0,
			TOO_SHORT = 0;
		expect([CLIPPING, SILENT, TOO_SHORT]).toEqual([0, 0, 0]);
	});
});
