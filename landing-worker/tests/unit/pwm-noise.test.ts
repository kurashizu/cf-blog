import { describe, it, expect } from 'vitest';
import { modularSynth } from '../../src/lib/synth';
import { FakeCtx, reaches, type FakeNode } from './stubs/audio-context';

/**
 * The two sources that are not OSC.
 *
 * NOISE is white and nothing else -- pink and brown were a filter and a gain
 * welded on. PWM is a pulse whose width is an inlet rather than a knob, so the
 * width is a patchable quantity: a CONST pins it, an envelope sweeps it.
 */

const node = (id: string, type: string) => ({ id, type, x: 0, y: 0 });
const wire = (from: string, fromPort: string, to: string, toPort: string) => ({
	from,
	fromPort,
	to,
	toPort
});
const EXEC = wire('entry', 'then', 'output', 'exec');

function play(graph: unknown, gp: Record<string, number> = {}) {
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
		track.rackGraph = graph;
		track.graphParams = gp;
		track.graphWaves = {};
		(S.triggerTrackVoice as (...a: unknown[]) => string | undefined)(0, 40, 0, 0, 0.4, 100, 100);
		return ctx;
	} finally {
		Object.assign(track, saved);
		S.renderCtx = null;
	}
}

const adv = (ctx: FakeCtx) => {
	const i = ctx.nodes.findIndex((n) => n.kind === 'panner');
	return ctx.nodes.slice(i + 1);
};

describe('NOISE', () => {
	it('is white: a source and a gain, with no filter welded on', () => {
		const ctx = play({
			nodes: [node('entry', 'in'), node('n', 'noise'), node('output', 'out')],
			cables: [EXEC, wire('n', 'out', 'output', 'in')]
		});
		const built = adv(ctx);
		expect(built.filter((x) => x.kind === 'bufsrc').length).toBe(1);
		/* The colour knob used to add a lowpass and a make-up gain here. Both
		   are modules you put after it now, so the module itself has neither. */
		expect(built.filter((x) => x.kind === 'biquad').length).toBe(0);
	});

	it('reaches the voice', () => {
		const ctx = play({
			nodes: [node('entry', 'in'), node('n', 'noise'), node('output', 'out')],
			cables: [EXEC, wire('n', 'out', 'output', 'in')]
		});
		const src = adv(ctx).find((x) => x.kind === 'bufsrc')!;
		const panner = ctx.nodes.find((x) => x.kind === 'panner')!;
		expect(reaches(src as FakeNode, panner)).toBe(true);
	});
});

describe('PWM', () => {
	const patch = (
		extra: ReturnType<typeof node>[] = [],
		cables: ReturnType<typeof wire>[] = []
	) => ({
		nodes: [node('entry', 'in'), node('p', 'pwm'), node('output', 'out'), ...extra],
		cables: [EXEC, wire('p', 'out', 'output', 'in'), ...cables]
	});

	it('builds two saws and a delay, and reaches the voice', () => {
		const ctx = play(patch());
		const built = adv(ctx);
		expect(built.filter((x) => x.kind === 'osc').length).toBe(2);
		expect(built.filter((x) => x.kind === 'delay').length).toBe(1);
		const panner = ctx.nodes.find((x) => x.kind === 'panner')!;
		expect(reaches(built.find((x) => x.kind === 'osc') as FakeNode, panner)).toBe(true);
	});

	it('takes its width from the PW inlet, as a fraction of the period', () => {
		/* A CONST of 0.25 is a quarter-open pulse: the delay is a quarter of one
		   cycle. Read off the socket, because PW has no knob -- a knob beside it
		   would be a second control for one thing, and a cable adds to a knob,
		   so 0.5 and 0.5 would have given a fully-open pulse. */
		const withConst = (v: number) =>
			play(patch([node('c', 'const')], [wire('c', 'out', 'p', 'pw')]), { 'c.value': v });
		const delayOf = (ctx: FakeCtx) =>
			(adv(ctx).find((x) => x.kind === 'delay') as unknown as { delayTime: { value: number } })
				.delayTime.value;
		const quarter = delayOf(withConst(0.25));
		const half = delayOf(withConst(0.5));
		expect(quarter).toBeGreaterThan(0);
		expect(half / quarter).toBeCloseTo(2, 5);
	});

	it('clamps a width that would make a constant instead of a wave', () => {
		const delayOf = (v: number) => {
			const ctx = play(patch([node('c', 'const')], [wire('c', 'out', 'p', 'pw')]), {
				'c.value': v
			});
			const dl = adv(ctx).find((x) => x.kind === 'delay') as unknown as {
				delayTime: { value: number };
			};
			return dl.delayTime.value;
		};
		// 0 and 1 are both silence with the oscillators running; neither is reached.
		expect(delayOf(0)).toBeGreaterThan(0);
		expect(delayOf(1)).toBeLessThan(delayOf(0.95) + 1e-9);
	});
});
