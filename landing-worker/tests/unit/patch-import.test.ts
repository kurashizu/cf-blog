import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleLoadPatch } from '../../src/lib/stores/synth-patch';
import { modularSynth } from '../../src/lib/synth';
import {
	PATCH_VERSION,
	STEPS_PER_BEAT,
	trackResetDefaults
} from '../../src/lib/stores/patch-format';

/**
 * Loading a project that is not entirely made of numbers.
 *
 * `dropNonFiniteNumbers` has its own tests, but a sanitiser nobody calls is
 * worth nothing -- and that is exactly what a revert experiment found: taking
 * the call out of the import path left the whole suite green, because every
 * test exercised the function directly rather than the path that has to use
 * it. This one goes through `handleLoadPatch`, which is what the LOAD button
 * runs, and asks what reached the live track.
 *
 * The stakes: these fields are written into AudioParams, which throw a
 * RangeError on a NaN or an Infinity. That does not make a note quieter, it
 * kills it -- and the import still reports success, so the symptom is silence
 * with nothing logged.
 */

const STORAGE_KEY = 'krsz-synth-patch-v1';

function patchWith(track: Record<string, unknown>) {
	return JSON.stringify({
		version: PATCH_VERSION,
		bpm: 120,
		meter: '4/4',
		totalSteps: 96,
		stepsPerBeat: STEPS_PER_BEAT,
		tracks: [{ id: 0, grid: [[]], accents: [0], ...track }]
	});
}

describe('a loaded project cannot put a non-number on the track', () => {
	let store: Record<string, string>;

	beforeEach(() => {
		store = {};
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store[k] ?? null,
			setItem: (k: string, v: string) => (store[k] = v),
			removeItem: (k: string) => delete store[k]
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	it('drops a NaN that a hand-edited file carries', () => {
		/* JSON has no NaN literal, so a corrupted file spells it `null` and it
		   becomes NaN on the way through -- which is precisely the shape that
		   reaches an AudioParam and throws. */
		store[STORAGE_KEY] = patchWith({ cutoff: 8000 }).replace('"cutoff":8000', '"cutoff":null');
		handleLoadPatch();
		const cutoff = modularSynth.getTracks()[0].cutoff;
		expect(Number.isFinite(cutoff)).toBe(true);
	});

	it('keeps a value that is merely unusual', () => {
		// Sanitising is about numbers that are not numbers, not about taste.
		store[STORAGE_KEY] = patchWith({ cutoff: 12345 });
		handleLoadPatch();
		expect(modularSynth.getTracks()[0].cutoff).toBe(12345);
	});

	it('leaves every numeric field on the track finite', () => {
		store[STORAGE_KEY] = patchWith({ cutoff: 900, resonance: 3, volume: 0.8 });
		handleLoadPatch();
		const track = modularSynth.getTracks()[0] as unknown as Record<string, unknown>;
		const bad = Object.entries(track)
			.filter(([, v]) => typeof v === 'number' && !Number.isFinite(v))
			.map(([k]) => k);
		expect(bad).toEqual([]);
	});
});

describe('loading a project does not keep the last one’s patch bay', () => {
	it('clears the ADV half of a track the incoming patch does not describe', () => {
		/* `trackResetDefaults` is derived from `BLANK_TRACK_TIMBRE` precisely so
		   it cannot fall behind the field list by hand -- and the comment says it
		   covers "its whole ADV patch bay". It did not: every ADV field is
		   optional, so omitting it from the blank timbre is legal, spreads to
		   nothing, and leaves the live track's value standing.

		   The consequence is worse than a stale knob. `advanced` survived too, so
		   `advOwnsVoice` muted racks 1-7 and the sound the incoming patch
		   actually describes could not be heard at all. */
		const d = trackResetDefaults() as Record<string, unknown>;
		for (const k of [
			'advanced',
			'advancedView',
			'rackGraph',
			'graphParams',
			'rackChain',
			'rackParams'
		])
			expect(k in d, k).toBe(true);
		expect(d.advanced).toBe(false);
		expect(d.rackGraph).toBeUndefined();
		expect(d.graphParams).toBeUndefined();
	});
});
