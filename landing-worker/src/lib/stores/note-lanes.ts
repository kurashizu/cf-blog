/**
 * Automation lanes under the piano roll.
 *
 * A lane is a curve drawn across the sequence, and the same curve is a socket
 * on ENTRY in the patch bay: draw a shape here, patch it into any parameter
 * there. That is the whole point -- otherwise this is a nicer accent row, and
 * the accent row it replaces was a single value cycling 0..+4 dB by clicking,
 * which cannot express a crescendo, a filter sweep, or anything held.
 *
 * Values are stored per step and normalised 0..1, not in the units of whatever
 * they end up driving. A lane does not know it is velocity; ENTRY publishes it
 * and a cable decides what it means. Storing dB or Hz here would bake one
 * destination into the data and make the second cable to a different param a
 * lie.
 *
 * Two kinds, because they answer different questions:
 *
 *   sampled    read once, when a note starts. This is what velocity IS -- how
 *              hard this note was struck, fixed for its lifetime.
 *   continuous read as the sequencer runs, so it keeps moving under a held
 *              note. A filter sweep across four bars is this and cannot be
 *              the other.
 */
export type LaneMode = 'sampled' | 'continuous';

export interface NoteLane {
	/** Stable across renames; cables and graph params refer to it. */
	id: string;
	name: string;
	mode: LaneMode;
	/** Drawn colour, and the colour of the socket it publishes. */
	color: string;
	/** One value per step, 0..1. Sparse: a missing step reads as `def`. */
	points: (number | undefined)[];
	/** What an undrawn step is worth. */
	def: number;
}

/** The lane every track has: how hard each note is struck. */
export const VELOCITY_LANE_ID = 'vel';

export function velocityLane(): NoteLane {
	return {
		id: VELOCITY_LANE_ID,
		name: 'VEL',
		mode: 'sampled',
		color: '#e5c07b',
		points: [],
		/* 100/127, the value a note takes when nothing has been drawn -- loud
		   enough to be the normal case, with room above it to accent. */
		def: 0.787
	};
}

/** Read a lane at a step, falling back to its default. */
export function laneAt(lane: NoteLane | undefined, step: number): number {
	if (!lane) return 0;
	const v = lane.points[step];
	return v === undefined || Number.isNaN(v) ? lane.def : Math.max(0, Math.min(1, v));
}

/**
 * Write one step, snapped to the sequencer's grid.
 *
 * `snap` is how many steps one drawn point covers: drawing at 1/4 with a 1/16
 * grid sets four steps at once, so what you drew is what you hear rather than
 * one step in four. Follows the roll's own SNAP setting, so the lane and the
 * notes above it line up.
 */
export function drawLane(lane: NoteLane, step: number, value: number, snap = 1): NoteLane {
	const v = Math.max(0, Math.min(1, value));
	const start = Math.floor(step / snap) * snap;
	const points = [...lane.points];
	for (let i = start; i < start + snap; i++) points[i] = v;
	return { ...lane, points };
}

/**
 * Draw a straight run between two steps, for dragging across the lane.
 *
 * Without this a fast drag leaves gaps -- pointer events do not fire per pixel
 * -- so a swept line came out as a row of disconnected spikes.
 */
export function drawLaneRun(
	lane: NoteLane,
	fromStep: number,
	fromValue: number,
	toStep: number,
	toValue: number,
	snap = 1
): NoteLane {
	if (fromStep === toStep) return drawLane(lane, toStep, toValue, snap);
	const lo = Math.min(fromStep, toStep);
	const hi = Math.max(fromStep, toStep);
	const loV = fromStep < toStep ? fromValue : toValue;
	const hiV = fromStep < toStep ? toValue : fromValue;
	let out = lane;
	for (let s = lo; s <= hi; s++) {
		const t = (s - lo) / (hi - lo);
		out = drawLane(out, s, loV + (hiV - loV) * t, snap);
	}
	return out;
}

/* ---------------------------------------------------------------------------
   Shapes.

   Painting a curve step by step is how the data is stored, not how anyone
   wants to work: a crescendo over four bars is 64 drag events and comes out
   lumpy. These are the gestures people actually reach for -- a ramp, a swell,
   a repeating pulse, every other note accented -- applied to a range and
   snapped to the grid, so a shape can be dropped in once and adjusted after.

   All of them take a range and leave everything outside it alone, so shapes
   compose: a ramp across the phrase, then accent the off-beats on top.
   --------------------------------------------------------------------------- */

export type LaneShape = 'flat' | 'ramp' | 'arch' | 'pulse' | 'random';

export interface ShapeOptions {
	/** Both ends of the value range the shape moves between, 0..1. */
	from: number;
	to: number;
	/** For `pulse`: how many steps between accents (2 = every other note). */
	every?: number;
	/** For `random`: how far from the midpoint it may stray. */
	spread?: number;
	/** Deterministic randomness, so redrawing the same shape is repeatable. */
	seed?: number;
}

/** A small deterministic PRNG, so `random` is reproducible per seed. */
function rng(seed: number): () => number {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return ((s >>> 0) % 10000) / 10000;
	};
}

/**
 * Lay a shape across a range of steps.
 *
 * Snapped like hand-drawing is, so a shape and the notes above it share a grid.
 */
export function applyShape(
	lane: NoteLane,
	shape: LaneShape,
	fromStep: number,
	toStep: number,
	opts: ShapeOptions,
	snap = 1
): NoteLane {
	const lo = Math.max(0, Math.min(fromStep, toStep));
	const hi = Math.max(fromStep, toStep);
	if (hi < lo) return lane;
	const { from, to } = opts;
	const rand = rng(opts.seed ?? 1);
	const span = hi - lo || 1;
	let out = lane;
	for (let s = lo; s <= hi; s += snap) {
		const t = (s - lo) / span;
		let v: number;
		switch (shape) {
			case 'flat':
				v = to;
				break;
			case 'ramp':
				v = from + (to - from) * t;
				break;
			// Up and back down: a phrase that swells and settles.
			case 'arch':
				v = from + (to - from) * Math.sin(Math.PI * t);
				break;
			// Every Nth step takes the high value, the rest the low one.
			case 'pulse':
				v = Math.round((s - lo) / snap) % Math.max(1, opts.every ?? 2) === 0 ? to : from;
				break;
			case 'random': {
				const mid = (from + to) / 2;
				const spread = opts.spread ?? Math.abs(to - from) / 2;
				v = mid + (rand() * 2 - 1) * spread;
				break;
			}
		}
		out = drawLane(out, s, v, snap);
	}
	return out;
}

/**
 * Copy a stretch of lane and stamp it elsewhere -- the reuse half.
 *
 * A groove is written once and repeated; without this, every bar of the same
 * feel is drawn again by hand and none of them quite match.
 */
export function copyLaneRange(lane: NoteLane, fromStep: number, toStep: number): (number | undefined)[] {
	return lane.points.slice(Math.min(fromStep, toStep), Math.max(fromStep, toStep) + 1);
}

/** Stamp a copied stretch at a step, optionally repeating it to fill a span. */
export function stampLane(
	lane: NoteLane,
	clip: (number | undefined)[],
	atStep: number,
	repeat = 1
): NoteLane {
	if (!clip.length) return lane;
	const points = [...lane.points];
	for (let r = 0; r < Math.max(1, repeat); r++) {
		for (let i = 0; i < clip.length; i++) {
			const at = atStep + r * clip.length + i;
			if (at < 0) continue;
			points[at] = clip[i];
		}
	}
	return { ...lane, points };
}

/** Nudge a range up or down, for "a bit louder here" without redrawing it. */
export function scaleLaneRange(
	lane: NoteLane,
	fromStep: number,
	toStep: number,
	delta: number
): NoteLane {
	const lo = Math.max(0, Math.min(fromStep, toStep));
	const hi = Math.max(fromStep, toStep);
	/* Walk the range rather than the stored points: a lane nobody has drawn on
	   yet has an empty array, so mapping over it nudged nothing at all and
	   "make this section louder" did nothing until you had drawn it first. */
	const points = [...lane.points];
	for (let i = lo; i <= hi; i++) {
		points[i] = Math.max(0, Math.min(1, (points[i] ?? lane.def) + delta));
	}
	return { ...lane, points };
}

/** Clear a range back to the default, so an undrawn lane reads as untouched. */
export function clearLane(lane: NoteLane, fromStep = 0, toStep = Infinity): NoteLane {
	const points = lane.points.map((v, i) => (i >= fromStep && i <= toStep ? undefined : v));
	return { ...lane, points };
}

/** A lane whose points survive a length change: kept per step, so truncation is a slice. */
export function resizeLane(lane: NoteLane, steps: number): NoteLane {
	return { ...lane, points: lane.points.slice(0, steps) };
}

/**
 * The lanes a track carries, with the velocity lane guaranteed first.
 *
 * A track with no lanes at all is the common case -- nothing has been drawn --
 * and it still has to answer "how hard is this note", so the default is
 * materialised rather than stored.
 */
export function lanesOf(track: { noteLanes?: NoteLane[] } | undefined): NoteLane[] {
	const ls = track?.noteLanes;
	if (!Array.isArray(ls) || !ls.length) return [velocityLane()];
	return ls.some((l) => l.id === VELOCITY_LANE_ID) ? ls : [velocityLane(), ...ls];
}

/** 0..1 to the 0..127 the voice speaks. */
export function laneToVelocity(v: number): number {
	return Math.max(1, Math.min(127, Math.round(v * 127)));
}

/* How many lanes a track may carry.
 *
 * The plain view gets the velocity lane and nothing else: it is the one every
 * part needs, and a second lane there would have nowhere to go -- racks 1-7
 * have no sockets to patch it into, so it would draw a curve that did nothing.
 *
 * ADV lifts that, because there the lane IS a socket on ENTRY: a curve you draw
 * can be cabled to any knob in the patch. Four is the ceiling either way --
 * enough for a part's dynamics plus a few shaped parameters, and few enough
 * that the folded strip stays readable. */
export const MAX_LANES_PLAIN = 1;
export const MAX_LANES_ADV = 4;

export function laneLimit(advanced: boolean): number {
	return advanced ? MAX_LANES_ADV : MAX_LANES_PLAIN;
}

/** The colours new lanes take, in order, after velocity's amber. */
const LANE_COLORS = ['#56b6c2', '#c678dd', '#98c379'];

/** A new lane, named and coloured so it is distinguishable at a glance. */
export function newLane(existing: NoteLane[]): NoteLane {
	const used = new Set(existing.map((l) => l.id));
	let n = 1;
	while (used.has(`lane${n}`)) n++;
	return {
		id: `lane${n}`,
		name: `L${n}`,
		/* Continuous by default: a second lane exists to shape something over
		   time, which is the half velocity cannot do. */
		mode: 'continuous',
		color: LANE_COLORS[(n - 1) % LANE_COLORS.length],
		points: [],
		def: 0.5
	};
}

/** Add a lane if there is room, otherwise leave the set alone. */
export function addLane(lanes: NoteLane[], advanced: boolean): NoteLane[] {
	if (lanes.length >= laneLimit(advanced)) return lanes;
	return [...lanes, newLane(lanes)];
}

/** Remove a lane. Velocity cannot go: every note needs one. */
export function removeLane(lanes: NoteLane[], id: string): NoteLane[] {
	if (id === VELOCITY_LANE_ID) return lanes;
	return lanes.filter((l) => l.id !== id);
}

/** The graph param a lane's socket drives, so cables can name it. */
export function laneSocketId(laneId: string): string {
	return `lane:${laneId}`;
}
