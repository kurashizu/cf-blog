import { get, writable, derived } from 'svelte/store';
import { modularSynth, type TrackData } from '../synth';
import { activeTrackId } from './synth-transport';
import { activeTrackRow, refreshTracks, notifyTrackEdited } from './synth-tracks';
import { advancedMode } from './synth-view';
import {
	lanesOf,
	addLane,
	removeLane,
	drawLane,
	drawLaneRun,
	applyShape,
	copyLaneRange,
	stampLane,
	scaleLaneRange,
	clearLane,
	laneLimit,
	VELOCITY_LANE_ID,
	type NoteLane,
	type LaneShape,
	type ShapeOptions
} from './note-lanes';

/**
 * Editing state for the automation lanes under the roll.
 *
 * The lanes themselves live on the track, because they are part of the part --
 * they travel with a saved project the way the notes do. What lives here is the
 * state of *editing* them: which one is being drawn, whether the editor is
 * open, what was copied. None of that belongs in a project file.
 */

/* Folded, the strip shows every lane's curve at a glance, a few pixels tall --
 * enough to see the shape of the dynamics without giving up roll height.
 * Expanded, one lane is drawn large over the roll, with the notes showing
 * through behind it so a curve can be aimed at the bar it belongs to. That is
 * the whole reason it overlays rather than sits below: shaping a crescendo
 * means seeing which notes it lands on. */
export const laneEditorOpen = writable<boolean>(false);

/** Which lane the expanded editor is drawing. */
export const activeLaneId = writable<string>(VELOCITY_LANE_ID);

/** What a copy put aside, so a bar of groove can be stamped elsewhere. */
export const laneClipboard = writable<(number | undefined)[] | null>(null);

/** The shape the next drag lays down; `free` means follow the pointer. */
export const laneTool = writable<'free' | LaneShape>('free');

/** The lanes the active track carries, velocity always present. */
export const trackLanes = derived(activeTrackRow, ($row) => lanesOf($row as { noteLanes?: NoteLane[] } | undefined));

/** The lane being drawn, falling back to velocity if the chosen one is gone. */
export const activeLane = derived([trackLanes, activeLaneId], ([$lanes, $id]) =>
	$lanes.find((l) => l.id === $id) ?? $lanes[0]
);

/** How many more lanes this track may take, given the mode. */
export const lanesRemaining = derived([trackLanes, advancedMode], ([$lanes, $adv]) =>
	Math.max(0, laneLimit($adv) - $lanes.length)
);

function commit(lanes: NoteLane[]): void {
	notifyTrackEdited();
	modularSynth.updateTrack(get(activeTrackId), { noteLanes: lanes } as Partial<TrackData>);
	refreshTracks();
}

/** Replace one lane, leaving the others untouched. */
function replace(id: string, fn: (l: NoteLane) => NoteLane): void {
	const lanes = get(trackLanes);
	commit(lanes.map((l) => (l.id === id ? fn(l) : l)));
}

export function toggleLaneEditor(): void {
	laneEditorOpen.update((v) => !v);
}

export function selectLane(id: string): void {
	activeLaneId.set(id);
	laneEditorOpen.set(true);
}

export function addTrackLane(): void {
	const lanes = get(trackLanes);
	const next = addLane(lanes, get(advancedMode));
	if (next === lanes) return;
	commit(next);
	activeLaneId.set(next[next.length - 1].id);
}

export function removeTrackLane(id: string): void {
	const next = removeLane(get(trackLanes), id);
	commit(next);
	if (get(activeLaneId) === id) activeLaneId.set(VELOCITY_LANE_ID);
}

export function paintLane(step: number, value: number, snap: number): void {
	const l = get(activeLane);
	if (l) replace(l.id, (x) => drawLane(x, step, value, snap));
}

export function paintLaneRun(
	fromStep: number,
	fromValue: number,
	toStep: number,
	toValue: number,
	snap: number
): void {
	const l = get(activeLane);
	if (l) replace(l.id, (x) => drawLaneRun(x, fromStep, fromValue, toStep, toValue, snap));
}

export function shapeLane(
	shape: LaneShape,
	fromStep: number,
	toStep: number,
	opts: ShapeOptions,
	snap: number
): void {
	const l = get(activeLane);
	if (l) replace(l.id, (x) => applyShape(x, shape, fromStep, toStep, opts, snap));
}

export function copyLane(fromStep: number, toStep: number): void {
	const l = get(activeLane);
	if (l) laneClipboard.set(copyLaneRange(l, fromStep, toStep));
}

export function pasteLane(atStep: number, repeat = 1): void {
	const clip = get(laneClipboard);
	const l = get(activeLane);
	if (clip && l) replace(l.id, (x) => stampLane(x, clip, atStep, repeat));
}

export function nudgeLane(fromStep: number, toStep: number, delta: number): void {
	const l = get(activeLane);
	if (l) replace(l.id, (x) => scaleLaneRange(x, fromStep, toStep, delta));
}

export function resetLane(fromStep = 0, toStep = Infinity): void {
	const l = get(activeLane);
	if (l) replace(l.id, (x) => clearLane(x, fromStep, toStep));
}
