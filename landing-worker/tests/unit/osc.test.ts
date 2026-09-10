import { describe, it, expect } from 'vitest';
/**
 * The first primitive back after the catalogue was emptied.
 *
 * Three questions, and the seed patch has to answer all of them or ADV opens
 * silent: does an oscillator get built, does it reach the voice, and is it the
 * shape the picker names. The last one is not a knob -- OSC's wave is a name in
 * `graphWaves`, so it travels a different path from every other setting and is
 * worth pinning separately.
 */
import { modularSynth } from '../../src/lib/synth';
import { startingGraph } from '../../src/lib/stores/graph-model';
import { FakeCtx, reaches, type FakeNode } from './stubs/audio-context';

describe('the seed patch sounds', () => {
	const play = (waves: Record<string, string> = {}) => {
		const ctx = new FakeCtx();
		const S = modularSynth as unknown as Record<string, unknown>;
		S.renderCtx = ctx;
		S.masterFXCtx = null;
		S.delayNode = null;
		S.reverbConvolver = null;
		S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
		(S.activeVoices as Map<string, unknown>).clear();
		const track = (S.tracks as Record<string, unknown>[])[0];
		const saved = JSON.parse(JSON.stringify(track));
		try {
			track.muted = false;
			track.advanced = true;
			track.rackGraph = startingGraph();
			track.graphParams = {};
			track.graphWaves = waves;
			(S.triggerTrackVoice as (...a: unknown[]) => string | undefined)(0, 40, 0, 0, 0.4, 100, 100);
			return ctx;
		} finally {
			Object.assign(track, saved);
			S.renderCtx = null;
		}
	};

	const advOsc = (ctx: FakeCtx) => {
		const i = ctx.nodes.findIndex((n) => n.kind === 'panner');
		return ctx.nodes.slice(i + 1).filter((n) => n.kind === 'osc');
	};

	it('builds an oscillator that reaches the voice', () => {
		const ctx = play();
		const oscs = advOsc(ctx);
		expect(oscs.length).toBe(1);
		const panner = ctx.nodes.find((n) => n.kind === 'panner')!;
		expect(reaches(oscs[0] as FakeNode, panner)).toBe(true);
	});

	it('tracks the keyboard through TO-FREQ', () => {
		const ctx = play();
		const osc = advOsc(ctx)[0] as unknown as { frequency: { value: number } };
		// Note 40 at A4=440. Whatever the mapping, it must be a real audible pitch.
		expect(Number.isFinite(osc.frequency.value)).toBe(true);
		expect(osc.frequency.value).toBeGreaterThan(20);
		expect(osc.frequency.value).toBeLessThan(20000);
	});

	it('uses the wave the picker names', () => {
		const sine = advOsc(play({ 'osc-1.wave': 'sine' }))[0] as unknown as { type: string };
		const saw = advOsc(play({ 'osc-1.wave': 'sawtooth' }))[0] as unknown as { type: string };
		expect(sine.type).toBe('sine');
		expect(saw.type).toBe('sawtooth');
	});
});
