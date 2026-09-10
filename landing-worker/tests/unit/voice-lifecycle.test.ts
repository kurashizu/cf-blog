import { describe, it, expect, beforeEach } from 'vitest';
import { modularSynth } from '../../src/lib/synth';
import { FakeCtx, FakeParam } from './stubs/audio-context';

/**
 * What happens to a voice between the key going down and its nodes going away.
 *
 * This was the largest hole in the suite. A revert experiment put nine recent
 * fixes back one at a time -- accent never reaching the amp, LEGATO being
 * byte-identical to MONO, a choked voice leaking its whole chain, the master
 * bus having no limiter -- and eight of the nine left all 852 tests green. The
 * bugs were all audible and none of them threw, which is exactly the shape the
 * suite could not see: it asserted on substrings of synth.ts, so renaming a
 * local failed a test and miswiring a node passed one.
 *
 * These drive the real engine against the recording context and ask what was
 * connected and what each AudioParam was actually told to do. `FakeParam.events`
 * holds the scheduled envelope in order, which is the measurement the fixes
 * were originally verified by hand with.
 */

const S = modularSynth as unknown as {
	renderCtx: unknown;
	masterFXCtx: unknown;
	delayNode: unknown;
	noiseBuffer: unknown;
	activeVoices: Map<string, Record<string, unknown>>;
	masterLimiter: { threshold: FakeParam; ratio: FakeParam } | null;
	tracks: Record<string, unknown>[];
	trackBuses: unknown;
	reverbConvolver: unknown;
	reverbMix: number;
	initMasterFX(ctx: unknown): void;
	triggerTrackVoice(
		trackId: number,
		noteIndex: number,
		accent?: number | boolean,
		startTime?: number,
		durationSec?: number,
		rawVelocity?: number,
		laneVelocity?: number
	): string | undefined;
	detachVoice(v: unknown): void;
	setMasterLimiterEnabled(on: boolean): void;
	getTracks(): Record<string, unknown>[];
	scheduleStepAudio(step: number, time: number): void;
};

/** Put the engine on a recording context, as a render does. */
function onFakeContext() {
	const ctx = new FakeCtx();
	S.renderCtx = ctx;
	S.masterFXCtx = null;
	S.delayNode = null;
	S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
	S.activeVoices.clear();
	return ctx;
}

/** Every param anywhere in the graph that something is connected to. */
function modulated(ctx: FakeCtx): FakeParam[] {
	const out: FakeParam[] = [];
	for (const n of ctx.nodes) {
		for (const e of n.outgoing) if (e.to instanceof FakeParam && !out.includes(e.to)) out.push(e.to);
	}
	return out;
}

/** How many nodes still hold a live edge into `target`. */
function liveEdgesInto(ctx: FakeCtx, target: unknown): number {
	let n = 0;
	for (const node of ctx.nodes) {
		if (node.outgoing.some((e) => e.to === target)) n++;
	}
	return n;
}

describe('an accented step is not just a louder one', () => {
	beforeEach(() => onFakeContext());

	it('opens the filter further than the same note unaccented', () => {
		/* The accent row set a level and nothing else: `triggerTrackVoice` takes
		   an accentLevel and every caller passed 0, so the whole `if (acc > 0)`
		   body -- the filter opening, the resonance lift, and every `velocity ->`
		   route in the mod matrix -- was dead on every note ever sequenced. */
		/* The voice's own filter, taken off the voice rather than by position in
		   the node list -- the first biquad a note makes is a track EQ band, and
		   reading that one showed 80 Hz for both and looked like proof. */
		const cutoffOf = (accent: number) => {
			onFakeContext();
			const key = S.triggerTrackVoice(0, 40, accent, 0, 0.5, 100, 100);
			const voice = S.activeVoices.get(key!) as { filter: { frequency: FakeParam; Q: FakeParam } };
			return {
				cutoff: voice.filter.frequency.events.find((e) => e[0] === 'set')![1],
				q: voice.filter.Q.scheduled
			};
		};
		const plain = cutoffOf(0);
		const accented = cutoffOf(4);
		expect(accented.cutoff).toBeGreaterThan(plain.cutoff);
		expect(accented.q).toBeGreaterThan(plain.q);
	});

	it('is passed the accent by the sequencer, not just able to use one', () => {
		/* The engine honouring an accent and the sequencer handing it one are two
		   different claims, and only the second was broken -- so a test calling
		   triggerTrackVoice directly passed against the bug. This goes through
		   `scheduleStepAudio`, which is the path every sequenced note takes. */
		const track = S.tracks[0] as Record<string, unknown>;
		const saved = {
			grid: track.grid,
			accents: track.accents,
			muted: track.muted,
			lanes: track.noteLanes
		};
		try {
			track.muted = false;
			track.noteLanes = undefined;
			track.grid = [[40], [], [40], []];
			track.accents = [0, 0, 4, 0];

			const cutoffAtStep = (step: number) => {
				onFakeContext();
				S.scheduleStepAudio(step, 0);
				const voice = [...S.activeVoices.values()][0] as
					| { filter: { frequency: FakeParam } }
					| undefined;
				return voice!.filter.frequency.events.find((e) => e[0] === 'set')![1];
			};
			expect(cutoffAtStep(2)).toBeGreaterThan(cutoffAtStep(0));
		} finally {
			track.grid = saved.grid;
			track.accents = saved.accents;
			track.muted = saved.muted;
			track.noteLanes = saved.lanes;
		}
	});
});

describe('a voice takes all of itself away', () => {
	beforeEach(() => onFakeContext());

	it('leaves nothing connected to the reverb after the voice is detached', () => {
		/* The reverb send is taken from the air shelf or the last key-EQ band --
		   not the panner -- and detachVoice only cut gain, filter and panner. So
		   every note played with AIR up left its filter connected to the shared
		   convolver for the life of the page: unreachable from upstream, silent,
		   and still alive on the audio thread. */
		const ctx = onFakeContext();
		const track = S.tracks[0] as Record<string, unknown>;
		const savedAir = track.airGain;
		const savedMix = S.reverbMix;
		track.airGain = 0.5;
		// The send is only made when there is reverb to send to.
		S.reverbMix = 0.4;
		try {
			S.initMasterFX(ctx);
			const before = liveEdgesInto(ctx, S.reverbConvolver);
			const keys: string[] = [];
			for (let i = 0; i < 8; i++) {
				const k = S.triggerTrackVoice(0, 40 + i, 0, 0, 0.2, 100, 100);
				if (k) keys.push(k);
			}
			for (const k of keys) {
				const v = S.activeVoices.get(k);
				if (v) S.detachVoice(v);
			}
			expect(liveEdgesInto(ctx, S.reverbConvolver)).toBe(before);
		} finally {
			track.airGain = savedAir;
			S.reverbMix = savedMix;
		}
	});
});

describe('the master limiter answers its own switch', () => {
	it('stops reducing gain when it is turned off', () => {
		/* The flag had a getter and a setter and no reader: initMasterFX built
		   the compressor and wired it in unconditionally, so the settings tab
		   could read BYPASSED while it went on gain-reducing the master. */
		const ctx = onFakeContext();
		S.initMasterFX(ctx);
		S.setMasterLimiterEnabled(true);
		expect(S.masterLimiter!.ratio.scheduled).toBeGreaterThan(1);

		S.setMasterLimiterEnabled(false);
		expect(S.masterLimiter!.ratio.scheduled).toBe(1);
		expect(S.masterLimiter!.threshold.scheduled).toBe(0);

		S.setMasterLimiterEnabled(true);
		expect(S.masterLimiter!.ratio.scheduled).toBeGreaterThan(1);
	});
});

describe('every note the engine builds is safe to schedule', () => {
	beforeEach(() => onFakeContext());

	it('never passes a non-finite number to an AudioParam', () => {
		/* A NaN or an Infinity thrown at an AudioParam method is a RangeError,
		   which kills the note outright and produces silence with nothing shown.
		   Checked across the velocity range and both note kinds rather than at
		   one point, because the bad values came from arithmetic on fields that
		   are only sometimes present. */
		for (const vel of [0, 1, 64, 127]) {
			const ctx = onFakeContext();
			S.triggerTrackVoice(0, 40, 0, 0, 0.4, vel, vel);
			for (const p of modulated(ctx)) {
				expect(Number.isFinite(p.value), `param value ${p.name}`).toBe(true);
				for (const ev of p.events) {
					expect(Number.isFinite(ev[1]), `${p.name} ${ev[0]}`).toBe(true);
					expect(Number.isFinite(ev[2]), `${p.name} ${ev[0]} time`).toBe(true);
				}
			}
		}
	});

	it('never ramps exponentially to zero', () => {
		// exponentialRampToValueAtTime(0) throws; a floor is why it does not.
		const ctx = onFakeContext();
		S.triggerTrackVoice(0, 40, 0, 0, 0.4, 100, 100);
		for (const p of modulated(ctx)) {
			for (const ev of p.events) {
				if (ev[0] === 'exp') expect(Math.abs(ev[1]), `${p.name}`).toBeGreaterThan(0);
			}
		}
	});
});
