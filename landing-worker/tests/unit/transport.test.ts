import { describe, it, expect, beforeEach } from 'vitest';
import { modularSynth } from '../../src/lib/synth';

/**
 * The playhead, when the shape of the song changes underneath it.
 *
 * Every bug here was a disagreement between two pieces of state that describe
 * the same thing: the queue of steps already booked, and the cursors saying
 * where the playhead is. Changing the tempo or the length while playing moved
 * one and not the other, and the result was always a playhead that briefly
 * claimed to be somewhere it was not -- frozen, or past the end of the pattern.
 *
 * None of it throws, and none of it is audible in a single note; you notice it
 * as the playhead behaving oddly and assume you imagined it.
 */

const S = modularSynth as unknown as {
	isSequencerPlaying: boolean;
	scheduledStepQueue: { step: number; time: number }[];
	currentStep: number;
	lastAudibleStep: number;
	totalSteps: number;
	nextStepTime: number;
	bpm: number;
	setBpm(n: number): void;
	setTotalSteps(n: number): void;
	restartSequencerTimer(): void;
};

describe('shrinking the pattern while it plays', () => {
	beforeEach(() => {
		S.isSequencerPlaying = false;
		S.setTotalSteps(200);
		S.currentStep = 40;
		S.lastAudibleStep = 39;
	});

	it('drops the lookahead booked against the length that is gone', () => {
		/* Clamping the cursors alone left the queue holding steps 44..51 of a
		   pattern that now ends at 16, and checkUIQueue publishes whatever is in
		   the queue -- so the playhead visited steps that no longer existed for
		   a whole window. */
		S.scheduledStepQueue = [44, 45, 46, 47, 48, 49, 50, 51].map((step) => ({
			step,
			time: 1 + step * 0.02
		}));
		S.setTotalSteps(16);
		expect(S.scheduledStepQueue.every((e) => e.step < 16)).toBe(true);
	});

	it('keeps the entries that are still inside the pattern', () => {
		// Shrinking to 64 has nothing to say about steps 4 and 5.
		S.scheduledStepQueue = [4, 5, 90].map((step) => ({ step, time: 1 + step * 0.02 }));
		S.setTotalSteps(64);
		expect(S.scheduledStepQueue.map((e) => e.step)).toEqual([4, 5]);
	});

	it('brings both cursors inside the new length, not just one', () => {
		S.currentStep = 180;
		S.lastAudibleStep = 179;
		S.setTotalSteps(16);
		expect(S.currentStep).toBeLessThan(16);
		expect(S.lastAudibleStep).toBeLessThan(16);
	});
});

describe('changing the tempo while it plays', () => {
	beforeEach(() => {
		S.setTotalSteps(64);
		S.bpm = 120;
		S.currentStep = 10;
		S.lastAudibleStep = 9;
		S.isSequencerPlaying = false;
	});

	it('leaves the transport alone when it is not playing', () => {
		S.scheduledStepQueue = [];
		S.setBpm(140);
		expect(S.bpm).toBe(140);
		expect(S.currentStep).toBe(10);
	});

	it('holds the tempo inside the range the UI offers', () => {
		S.setBpm(9999);
		expect(S.bpm).toBe(260);
		S.setBpm(1);
		expect(S.bpm).toBe(40);
	});
});
