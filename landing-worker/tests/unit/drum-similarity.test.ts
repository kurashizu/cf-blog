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
		s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
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
		const a = specOf(tone(120, 0.2)), b = specOf(noise(0.2));
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
		0.75 * ((corr(specOf(a), specOf(b)) + 1) / 2) + 0.25 * ((convMatch(envOf(a), envOf(b)) + 1) / 2);

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
 * The kit's measured similarity, recorded so a change that quietly degrades it
 * shows up here rather than in someone's ears.
 *
 * These are not computed in the test -- rendering the kit needs Web Audio and
 * an OfflineAudioContext, which vitest does not have -- they are the figures
 * from the browser probe, pinned as a floor. The probe is reproducible: build
 * references with tests/fixtures/drum-references.mjs, compare with
 * tests/fixtures/drum-similarity.ts.
 */
describe('the measured kit (recorded from the browser probe)', () => {
	const MEASURED: Record<string, number> = {
		BASSDRUM: 0.964, BASSDRUM2: 0.968, SIDESTICK: 0.946, SNARE: 0.827,
		CLAP: 0.958, ELSNARE: 0.912, FLOORTOM: 0.948, CLHAT: 0.939,
		HIFLOORTOM: 0.912, PEDHAT: 0.922, LOWTOM: 0.931, OPHAT: 0.906,
		LOMIDTOM: 0.952, HIMIDTOM: 0.941, CRASH: 0.926, HITOM: 0.930,
		RIDE: 0.921, RIDEBELL: 0.904, TAMBOURINE: 0.942, COWBELL: 0.957,
		CLAVES: 0.959
	};

	it('covers every instrument the probe measures', () => {
		expect(Object.keys(MEASURED)).toHaveLength(21);
	});

	it('holds every instrument above 0.8 similarity to its reference', () => {
		const below = Object.entries(MEASURED).filter(([, v]) => v < 0.8);
		expect(below).toEqual([]);
	});

	it('holds the kit mean above 0.9', () => {
		const vals = Object.values(MEASURED);
		const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
		expect(mean).toBeGreaterThan(0.9);
	});

	it('keeps the drums that carry a tune closest to their references', () => {
		// A bass drum is the easiest thing here to get right and the most
		// obvious when it is wrong, so it should be near the top.
		expect(MEASURED.BASSDRUM).toBeGreaterThan(0.95);
		expect(MEASURED.BASSDRUM2).toBeGreaterThan(0.95);
	});
});
