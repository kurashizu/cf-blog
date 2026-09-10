import { describe, it, expect } from 'vitest';
import { modularSynth } from '../../src/lib/synth';

/**
 * The DRIVE knob's transfer curve.
 *
 * The shape is a normal soft clip and it is not the problem. The problem was
 * that it was used raw: its own output at full scale is about 0.335 whatever
 * `k` is, so the *first click* of the knob dropped the whole master bus by
 * 9.4 dB and clamped every peak to a third of full scale, only reaching unity
 * again somewhere past 50%. Turning up drive made the mix quieter, which is
 * the opposite of the one thing the control promises.
 *
 * Measured off the curve rather than by rendering: it is a lookup table, so
 * the table is the behaviour.
 */

const S = modularSynth as unknown as { makeDistortionCurve(amount: number): Float32Array };

/** What the curve does to a sample of size `x`. */
const at = (curve: Float32Array, x: number) =>
	curve[Math.min(curve.length - 1, Math.round(((x + 1) / 2) * curve.length))];

const DRIVES = [0, 0.05, 0.25, 0.5, 1];

describe('the drive curve', () => {
	it.each(DRIVES)('reaches full scale at drive %s, rather than a third of it', (d) => {
		const curve = S.makeDistortionCurve(d);
		const peak = Math.max(...Array.from(curve, Math.abs));
		expect(peak).toBeCloseTo(1, 3);
	});

	it('does not drop the level on the first click of the knob', () => {
		// 5% is one step of the control. It used to cost 9.4 dB.
		const smallSignal = (d: number) => at(S.makeDistortionCurve(d), 0.01) / 0.01;
		const step = 20 * Math.log10(smallSignal(0.05) / smallSignal(0));
		expect(step).toBeGreaterThan(0);
	});

	it('gets louder as it is turned up, all the way', () => {
		const gains = DRIVES.map((d) => at(S.makeDistortionCurve(d), 0.01) / 0.01);
		for (let i = 1; i < gains.length; i++) {
			expect(gains[i], `drive ${DRIVES[i]} is not above ${DRIVES[i - 1]}`).toBeGreaterThan(
				gains[i - 1]
			);
		}
	});

	it('is a straight wire at zero', () => {
		const curve = S.makeDistortionCurve(0);
		for (const x of [-0.5, -0.1, 0.1, 0.5]) expect(at(curve, x)).toBeCloseTo(x, 3);
	});
});
