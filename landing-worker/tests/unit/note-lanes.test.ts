import { describe, it, expect } from 'vitest';
import {
	velocityLane,
	laneAt,
	drawLane,
	drawLaneRun,
	applyShape,
	copyLaneRange,
	stampLane,
	scaleLaneRange,
	clearLane,
	resizeLane,
	lanesOf,
	laneToVelocity,
	VELOCITY_LANE_ID,
	type NoteLane
} from '../../src/lib/stores/note-lanes';

/**
 * The automation lanes under the roll.
 *
 * Worth pinning down because the storage and the editing model deliberately
 * disagree: values live per step, which is what playback needs, while every
 * edit is expressed as a gesture over a range at the sequencer's grid. The
 * translation between the two is where a lane silently loses what was drawn --
 * a snapped write that covers the wrong span, or a shape that stops one step
 * short of the range it was given.
 */

const lane = (over: Partial<NoteLane> = {}): NoteLane => ({ ...velocityLane(), ...over });

describe('reading a lane', () => {
	it('falls back to the default where nothing was drawn', () => {
		const l = lane({ def: 0.5 });
		expect(laneAt(l, 0)).toBe(0.5);
		expect(laneAt(l, 999)).toBe(0.5);
	});

	it('reads a drawn value, including zero', () => {
		const l = drawLane(lane(), 3, 0);
		expect(laneAt(l, 3)).toBe(0);
	});

	it('clamps a value written out of range', () => {
		expect(laneAt(drawLane(lane(), 0, 4), 0)).toBe(1);
		expect(laneAt(drawLane(lane(), 0, -2), 0)).toBe(0);
	});

	it('treats a missing lane as silent rather than throwing', () => {
		expect(laneAt(undefined, 0)).toBe(0);
	});
});

describe('drawing', () => {
	it('covers the whole snap span, so what was drawn is what plays', () => {
		// At 1/4 against a 1/16 grid one drawn point owns four steps; writing
		// only the step under the pointer left three of every four untouched.
		const l = drawLane(lane(), 5, 0.25, 4);
		expect([4, 5, 6, 7].map((s) => laneAt(l, s))).toEqual([0.25, 0.25, 0.25, 0.25]);
		expect(laneAt(l, 8)).toBe(l.def);
	});

	it('snaps to the start of the span, not the step pressed', () => {
		expect(laneAt(drawLane(lane(), 7, 0.3, 4), 4)).toBe(0.3);
	});

	it('interpolates a dragged run, so a sweep has no gaps', () => {
		// Pointer events do not fire per pixel; without the run, a fast drag
		// came out as disconnected spikes.
		const l = drawLaneRun(lane(), 0, 0, 4, 1);
		expect([0, 1, 2, 3, 4].map((s) => laneAt(l, s))).toEqual([0, 0.25, 0.5, 0.75, 1]);
	});

	it('runs backwards as readily as forwards', () => {
		const l = drawLaneRun(lane(), 4, 1, 0, 0);
		expect(laneAt(l, 0)).toBe(0);
		expect(laneAt(l, 4)).toBe(1);
	});

	it('a run of one step is just a write', () => {
		expect(laneAt(drawLaneRun(lane(), 2, 0.4, 2, 0.4), 2)).toBe(0.4);
	});
});

describe('shapes', () => {
	it('ramps from one end of the range to the other', () => {
		const l = applyShape(lane(), 'ramp', 0, 4, { from: 0, to: 1 });
		expect(laneAt(l, 0)).toBe(0);
		expect(laneAt(l, 4)).toBe(1);
		expect(laneAt(l, 2)).toBeCloseTo(0.5, 5);
	});

	it('arches up and back down, peaking in the middle', () => {
		const l = applyShape(lane(), 'arch', 0, 8, { from: 0, to: 1 });
		expect(laneAt(l, 4)).toBeCloseTo(1, 2);
		expect(laneAt(l, 0)).toBeCloseTo(0, 5);
		expect(laneAt(l, 8)).toBeCloseTo(0, 5);
	});

	it('pulses every Nth step and leaves the rest low', () => {
		const l = applyShape(lane(), 'pulse', 0, 7, { from: 0.2, to: 1, every: 2 });
		expect([0, 1, 2, 3].map((s) => laneAt(l, s))).toEqual([1, 0.2, 1, 0.2]);
	});

	it('is deterministic for a given seed, so a shape can be redrawn', () => {
		const a = applyShape(lane(), 'random', 0, 16, { from: 0, to: 1, seed: 7 });
		const b = applyShape(lane(), 'random', 0, 16, { from: 0, to: 1, seed: 7 });
		expect(a.points).toEqual(b.points);
	});

	it('leaves everything outside the range alone, so shapes compose', () => {
		const base = drawLane(lane(), 20, 0.1);
		const l = applyShape(base, 'flat', 0, 8, { from: 1, to: 1 });
		expect(laneAt(l, 20)).toBe(0.1);
	});

	it('accepts a reversed range', () => {
		const l = applyShape(lane(), 'flat', 6, 2, { from: 0, to: 0.9 });
		expect(laneAt(l, 2)).toBe(0.9);
		expect(laneAt(l, 6)).toBe(0.9);
	});
});

describe('reuse', () => {
	it('stamps a copied groove without redrawing it', () => {
		const src = applyShape(lane(), 'pulse', 0, 3, { from: 0.2, to: 1, every: 2 });
		const clip = copyLaneRange(src, 0, 3);
		const out = stampLane(lane(), clip, 8);
		expect([8, 9, 10, 11].map((s) => laneAt(out, s))).toEqual([1, 0.2, 1, 0.2]);
	});

	it('repeats a clip to fill a longer span', () => {
		const clip = [1, 0.2];
		const out = stampLane(lane(), clip, 0, 3);
		expect([0, 1, 2, 3, 4, 5].map((s) => laneAt(out, s))).toEqual([1, 0.2, 1, 0.2, 1, 0.2]);
	});

	it('stamping nothing changes nothing', () => {
		const l = drawLane(lane(), 1, 0.5);
		expect(stampLane(l, [], 0).points).toEqual(l.points);
	});

	it('nudges a range without redrawing it, and clamps at the ceiling', () => {
		const l = scaleLaneRange(drawLane(lane(), 2, 0.9), 0, 4, 0.4);
		expect(laneAt(l, 2)).toBe(1);
	});

	it('nudging lifts undrawn steps off their default too', () => {
		const l = scaleLaneRange(lane({ def: 0.5 }), 0, 2, 0.25);
		expect(laneAt(l, 1)).toBe(0.75);
	});
});

describe('housekeeping', () => {
	it('clearing returns steps to the default', () => {
		const l = clearLane(drawLane(lane(), 3, 0.1), 0, 8);
		expect(laneAt(l, 3)).toBe(l.def);
	});

	it('clearing a range leaves the rest', () => {
		let l = drawLane(lane(), 2, 0.1);
		l = drawLane(l, 20, 0.9);
		expect(laneAt(clearLane(l, 0, 8), 20)).toBe(0.9);
	});

	it('resizing truncates rather than resampling, so steps keep their meaning', () => {
		const l = resizeLane(drawLane(lane(), 40, 0.3), 16);
		expect(l.points.length).toBeLessThanOrEqual(16);
	});

	it('materialises a velocity lane for a track that has none', () => {
		expect(lanesOf(undefined).map((l) => l.id)).toEqual([VELOCITY_LANE_ID]);
		expect(lanesOf({ noteLanes: [] }).map((l) => l.id)).toEqual([VELOCITY_LANE_ID]);
	});

	it('keeps velocity first when a track carries other lanes', () => {
		const extra: NoteLane = { ...velocityLane(), id: 'cut', name: 'CUT' };
		expect(lanesOf({ noteLanes: [extra] }).map((l) => l.id)).toEqual([VELOCITY_LANE_ID, 'cut']);
	});

	it('does not duplicate a velocity lane the track already has', () => {
		const ls = lanesOf({ noteLanes: [velocityLane()] });
		expect(ls.filter((l) => l.id === VELOCITY_LANE_ID)).toHaveLength(1);
	});

	it('never sends a silent note: velocity floors at 1, not 0', () => {
		expect(laneToVelocity(0)).toBe(1);
		expect(laneToVelocity(1)).toBe(127);
	});
});
