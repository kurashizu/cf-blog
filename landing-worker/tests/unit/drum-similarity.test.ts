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
