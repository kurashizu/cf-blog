/**
 * Piano-roll editing: selection, undo/redo, clipboard, and the block
 * operations (move, copy, resize, delete) the roll's pointer and keyboard
 * handlers call. Everything works on the grid the engine already stores --
 * `grid[step] = note indices` -- so patches, songs and the ROM generators are
 * untouched. A "note" here is a run of consecutive steps holding the same
 * index; it is identified by `note:start`, which is recomputed from the grid
 * after every edit.
 */
import { writable, get } from 'svelte/store';
import { modularSynth, STEPS_PER_BEAT, PIANO_ROLL_NOTES, METER_SPECS } from '../synth';
import { activeTrackId, totalPatternSteps, cursorStep, timeMeter } from './synth-transport';
import { refreshTracks } from './synth-tracks';

export interface NoteRun {
	note: number;
	start: number;
	len: number;
}

export const runKey = (note: number, start: number): string => `${note}:${start}`;

/** Selected runs on the active track, as `note:start` keys. */
export const selection = writable<Set<string>>(new Set());
export const canUndo = writable(false);
export const canRedo = writable(false);
/** How many notes the in-page clip holds; the header shows it. */
export const clipSize = writable(0);

// The selection belongs to one track; switching tracks drops it.
activeTrackId.subscribe(() => selection.set(new Set()));

/* ---------------- runs ---------------- */

export function runAt(grid: number[][], note: number, step: number): NoteRun | null {
	if (!grid[step]?.includes(note)) return null;
	let start = step;
	while (start > 0 && grid[start - 1]?.includes(note)) start--;
	let end = step + 1;
	while (grid[end]?.includes(note)) end++;
	return { note, start, len: end - start };
}

/** Every run on the track, in step order. */
export function allRuns(grid: number[][], total: number): NoteRun[] {
	const out: NoteRun[] = [];
	for (let s = 0; s < total; s++) {
		const notes = grid[s];
		if (!notes?.length) continue;
		const prev = grid[s - 1] ?? [];
		for (const n of notes) {
			if (prev.includes(n)) continue;
			let end = s + 1;
			while (end < total && grid[end]?.includes(n)) end++;
			out.push({ note: n, start: s, len: end - s });
		}
	}
	return out;
}

/** Runs that overlap the box: notes noteLo..noteHi inclusive, steps [stepLo, stepHi). */
export function runsIn(grid: number[][], total: number, noteLo: number, noteHi: number, stepLo: number, stepHi: number): NoteRun[] {
	return allRuns(grid, total).filter((r) => r.note >= noteLo && r.note <= noteHi && r.start < stepHi && r.start + r.len > stepLo);
}

export function selectedRuns(grid: number[][], total: number, sel: Set<string>): NoteRun[] {
	if (!sel.size) return [];
	return allRuns(grid, total).filter((r) => sel.has(runKey(r.note, r.start)));
}

function activeGrid(): { trackId: number; grid: number[][]; accents: number[]; total: number } | null {
	const trackId = get(activeTrackId);
	const trk = modularSynth.getTrack(trackId);
	if (!trk) return null;
	return { trackId, grid: trk.grid, accents: trk.accents as number[], total: get(totalPatternSteps) };
}

/* ---------------- undo ---------------- */

interface EditRecord {
	trackId: number;
	steps: Map<number, { before: number[]; after: number[] }>;
	accents: Map<number, { before: number; after: number }>;
}

const UNDO_CAP = 60;
const undoStack: EditRecord[] = [];
const redoStack: EditRecord[] = [];
let batch: { trackId: number; grid: number[][]; accents: number[] } | null = null;

function syncFlags() {
	canUndo.set(undoStack.length > 0);
	canRedo.set(redoStack.length > 0);
}

function diffRecord(trackId: number, grid0: number[][], acc0: number[]): EditRecord | null {
	const trk = modularSynth.getTrack(trackId);
	if (!trk) return null;
	const rec: EditRecord = { trackId, steps: new Map(), accents: new Map() };
	const n = Math.max(grid0.length, trk.grid.length);
	for (let s = 0; s < n; s++) {
		const a = grid0[s] ?? [];
		const b = trk.grid[s] ?? [];
		if (a !== b && (a.length !== b.length || a.some((v, i) => v !== b[i]))) rec.steps.set(s, { before: a, after: b });
		const pa = Number(acc0[s] ?? 0);
		const pb = Number(trk.accents[s] ?? 0);
		if (pa !== pb) rec.accents.set(s, { before: pa, after: pb });
	}
	return rec.steps.size || rec.accents.size ? rec : null;
}

function pushRecord(rec: EditRecord) {
	undoStack.push(rec);
	while (undoStack.length > UNDO_CAP) undoStack.shift();
	redoStack.length = 0;
	syncFlags();
}

/**
 * Run an edit on a track and remember what it changed. Steps are compared by
 * reference first, so the engine's replace-the-array setters make the diff
 * cheap; in-place mutation would be missed, which is why the ops below never
 * use toggleTrackCell.
 */
export function withUndo(trackId: number, fn: () => void): boolean {
	const trk = modularSynth.getTrack(trackId);
	if (!trk) return false;
	if (batch && batch.trackId === trackId) {
		fn();
		return true;
	}
	const grid0 = trk.grid.slice();
	const acc0 = (trk.accents as number[]).slice();
	fn();
	const rec = diffRecord(trackId, grid0, acc0);
	if (!rec) return false;
	pushRecord(rec);
	return true;
}

/** Group several edits (a right-drag erase, a paint) into one undo step. */
export function beginBatch(trackId: number) {
	const trk = modularSynth.getTrack(trackId);
	if (!trk || batch) return;
	batch = { trackId, grid: trk.grid.slice(), accents: (trk.accents as number[]).slice() };
}

export function endBatch() {
	if (!batch) return;
	const rec = diffRecord(batch.trackId, batch.grid, batch.accents);
	batch = null;
	if (rec) pushRecord(rec);
}

function applyRecord(rec: EditRecord, dir: 'before' | 'after') {
	for (const [s, v] of rec.steps) modularSynth.setTrackStepNotes(rec.trackId, s, v[dir]);
	for (const [s, v] of rec.accents) modularSynth.setTrackAccent(rec.trackId, s, v[dir]);
	// Whatever the undone edit selected no longer exists in that shape.
	selection.set(new Set());
	refreshTracks();
}

export function undo(): boolean {
	const rec = undoStack.pop();
	if (!rec) return false;
	applyRecord(rec, 'before');
	redoStack.push(rec);
	syncFlags();
	return true;
}

export function redo(): boolean {
	const rec = redoStack.pop();
	if (!rec) return false;
	applyRecord(rec, 'after');
	undoStack.push(rec);
	syncFlags();
	return true;
}

/* ---------------- pure grid transforms (used for the drag preview and the commit) ---------------- */

const NOTE_MAX = PIANO_ROLL_NOTES.length - 1;
const POLY = 8;

function removeRun(grid: number[][], r: NoteRun) {
	for (let s = r.start; s < r.start + r.len; s++) {
		const notes = grid[s];
		if (notes?.includes(r.note)) grid[s] = notes.filter((n) => n !== r.note);
	}
}

function addRun(grid: number[][], r: NoteRun, total: number): boolean {
	if (r.note < 0 || r.note > NOTE_MAX || r.start < 0 || r.start >= total) return false;
	let placed = false;
	for (let s = r.start; s < Math.min(total, r.start + r.len); s++) {
		const notes = grid[s] ?? [];
		if (notes.includes(r.note)) {
			placed = true;
			continue;
		}
		if (notes.length >= POLY) continue;
		grid[s] = [...notes, r.note].sort((a, b) => a - b);
		placed = true;
	}
	return placed;
}

export interface Transformed {
	grid: number[][];
	accents: number[];
	keys: Set<string>;
	dSteps: number;
	dNotes: number;
}

/** Clamp a move so every run stays on the roll, then apply it to copies. */
export function transformMove(
	grid: number[][],
	accents: number[],
	total: number,
	runs: NoteRun[],
	dSteps: number,
	dNotes: number,
	copy: boolean
): Transformed {
	if (runs.length) {
		const minNote = Math.min(...runs.map((r) => r.note));
		const maxNote = Math.max(...runs.map((r) => r.note));
		dNotes = Math.max(-minNote, Math.min(NOTE_MAX - maxNote, dNotes));
		const minStart = Math.min(...runs.map((r) => r.start));
		const maxEnd = Math.max(...runs.map((r) => r.start + r.len));
		dSteps = Math.max(-minStart, Math.min(total - maxEnd, dSteps));
	}
	const g = grid.slice();
	const a = accents.slice();
	const keys = new Set<string>();
	if (!copy) {
		for (const r of runs) removeRun(g, r);
		for (const r of runs) if (a[r.start]) a[r.start] = 0;
	}
	for (const r of runs) {
		const moved = { note: r.note + dNotes, start: r.start + dSteps, len: r.len };
		if (addRun(g, moved, total)) {
			keys.add(runKey(moved.note, moved.start));
			const acc = Number(accents[r.start] ?? 0);
			if (acc && !a[moved.start]) a[moved.start] = acc;
		}
	}
	return { grid: g, accents: a, keys, dSteps, dNotes };
}

export function transformResize(grid: number[][], total: number, runs: NoteRun[], dLen: number): Transformed {
	const g = grid.slice();
	const keys = new Set<string>();
	for (const r of runs) {
		const len = Math.max(1, Math.min(total - r.start, r.len + dLen));
		if (len < r.len) {
			for (let s = r.start + len; s < r.start + r.len; s++) g[s] = (g[s] ?? []).filter((n) => n !== r.note);
		} else if (len > r.len) {
			addRun(g, { note: r.note, start: r.start + r.len, len: len - r.len }, total);
		}
		keys.add(runKey(r.note, r.start));
	}
	return { grid: g, accents: [], keys, dSteps: dLen, dNotes: 0 };
}

/** Write a transformed grid back through the engine, only where it differs. */
function commitGrid(trackId: number, from: number[][], fromAcc: number[], to: number[][], toAcc: number[] | null) {
	const n = Math.max(from.length, to.length);
	for (let s = 0; s < n; s++) {
		if (from[s] !== to[s]) modularSynth.setTrackStepNotes(trackId, s, to[s] ?? []);
		if (toAcc && Number(fromAcc[s] ?? 0) !== Number(toAcc[s] ?? 0)) modularSynth.setTrackAccent(trackId, s, toAcc[s] ?? 0);
	}
}

/* ---------------- operations on the active track ---------------- */

export function selectRuns(runs: NoteRun[], add = false) {
	selection.update((prev) => {
		const next = add ? new Set(prev) : new Set<string>();
		for (const r of runs) next.add(runKey(r.note, r.start));
		return next;
	});
}

export function toggleRun(r: NoteRun) {
	selection.update((prev) => {
		const next = new Set(prev);
		const k = runKey(r.note, r.start);
		if (next.has(k)) next.delete(k);
		else next.add(k);
		return next;
	});
}

export function clearSelection() {
	if (get(selection).size) selection.set(new Set());
}

/** Ctrl+A: the page first, the whole track when the page is already selected. */
export function selectAll(pageStart: number, pageSteps: number) {
	const t = activeGrid();
	if (!t) return;
	const page = runsIn(t.grid, t.total, 0, NOTE_MAX, pageStart, pageStart + pageSteps);
	const cur = get(selection);
	const pageDone = page.length > 0 && page.every((r) => cur.has(runKey(r.note, r.start)));
	selectRuns(pageDone || page.length === 0 ? allRuns(t.grid, t.total) : page);
}

export function deleteRuns(runs: NoteRun[]): boolean {
	const t = activeGrid();
	if (!t || !runs.length) return false;
	const done = withUndo(t.trackId, () => {
		const g = t.grid.slice();
		for (const r of runs) removeRun(g, r);
		commitGrid(t.trackId, t.grid, t.accents, g, null);
	});
	selection.update((prev) => {
		const next = new Set(prev);
		for (const r of runs) next.delete(runKey(r.note, r.start));
		return next;
	});
	refreshTracks();
	return done;
}

export function deleteSelection(): boolean {
	const t = activeGrid();
	if (!t) return false;
	return deleteRuns(selectedRuns(t.grid, t.total, get(selection)));
}

export function moveSelection(dSteps: number, dNotes: number, copy = false): boolean {
	const t = activeGrid();
	if (!t) return false;
	const runs = selectedRuns(t.grid, t.total, get(selection));
	if (!runs.length) return false;
	const out = transformMove(t.grid, t.accents, t.total, runs, dSteps, dNotes, copy);
	if (out.dSteps === 0 && out.dNotes === 0 && !copy) return false;
	const done = withUndo(t.trackId, () => commitGrid(t.trackId, t.grid, t.accents, out.grid, out.accents));
	selection.set(out.keys);
	refreshTracks();
	return done;
}

export function resizeSelection(dLen: number): boolean {
	const t = activeGrid();
	if (!t || !dLen) return false;
	const runs = selectedRuns(t.grid, t.total, get(selection));
	if (!runs.length) return false;
	const out = transformResize(t.grid, t.total, runs, dLen);
	const done = withUndo(t.trackId, () => commitGrid(t.trackId, t.grid, t.accents, out.grid, null));
	selection.set(out.keys);
	refreshTracks();
	return done;
}

/** Ctrl+D: the selection again, right after itself; the span rounds up to a beat so a bar's worth lands on the next bar. */
export function duplicateSelection(): boolean {
	const t = activeGrid();
	if (!t) return false;
	const runs = selectedRuns(t.grid, t.total, get(selection));
	if (!runs.length) return false;
	const minStart = Math.min(...runs.map((r) => r.start));
	const maxEnd = Math.max(...runs.map((r) => r.start + r.len));
	const span = Math.ceil((maxEnd - minStart) / STEPS_PER_BEAT) * STEPS_PER_BEAT;
	if (minStart + span >= t.total) return false;
	return moveSelection(span, 0, true);
}

/* ---------------- clipboard ---------------- */

const CLIP_FORMAT = 'krsz-synth-clip';

interface Clip {
	format: typeof CLIP_FORMAT;
	v: 1;
	/** [note, start relative to the first note, len] */
	notes: [number, number, number][];
	/** [relative start, accent level] */
	accents: [number, number][];
}

let clip: Clip | null = null;

function parseClip(text: string): Clip | null {
	try {
		const c = JSON.parse(text);
		if (c?.format !== CLIP_FORMAT || !Array.isArray(c.notes)) return null;
		return {
			format: CLIP_FORMAT,
			v: 1,
			notes: c.notes.filter((n: unknown) => Array.isArray(n) && n.length === 3).map((n: number[]) => [n[0] | 0, n[1] | 0, Math.max(1, n[2] | 0)]),
			accents: Array.isArray(c.accents) ? c.accents.map((a: number[]) => [a[0] | 0, a[1] | 0]) : []
		};
	} catch {
		return null;
	}
}

export function copySelection(): number {
	const t = activeGrid();
	if (!t) return 0;
	const runs = selectedRuns(t.grid, t.total, get(selection));
	if (!runs.length) return 0;
	const minStart = Math.min(...runs.map((r) => r.start));
	clip = {
		format: CLIP_FORMAT,
		v: 1,
		notes: runs.map((r) => [r.note, r.start - minStart, r.len]),
		accents: runs.filter((r) => Number(t.accents[r.start] ?? 0) > 0).map((r) => [r.start - minStart, Number(t.accents[r.start])])
	};
	clipSize.set(runs.length);
	// The system clipboard too, so a phrase can cross tracks, patches and tabs.
	navigator.clipboard?.writeText?.(JSON.stringify(clip)).catch(() => {});
	return runs.length;
}

export function cutSelection(): number {
	const n = copySelection();
	if (n) deleteSelection();
	return n;
}

/**
 * Paste at the cursor step (the ruler's cyan cell). `text` is what the
 * browser's paste event carried -- that is how a phrase copied in another tab
 * arrives, and it needs no clipboard permission; when it is not one of our
 * clips (or there was no event) the in-page clip is used instead.
 */
export function pasteClip(text?: string | null, atStep = get(cursorStep)): number {
	const c = (text ? parseClip(text) : null) ?? clip;
	if (!c || !c.notes.length) return 0;
	const t = activeGrid();
	if (!t) return 0;
	const runs: NoteRun[] = c.notes
		.map(([note, rel, len]) => ({ note, start: atStep + rel, len }))
		.filter((r) => r.note >= 0 && r.note <= NOTE_MAX && r.start < t.total);
	if (!runs.length) return 0;
	const g = t.grid.slice();
	const a = t.accents.slice();
	const keys = new Set<string>();
	for (const r of runs) if (addRun(g, r, t.total)) keys.add(runKey(r.note, r.start));
	for (const [rel, lvl] of c.accents) {
		const s = atStep + rel;
		if (s < t.total && !a[s]) a[s] = lvl;
	}
	withUndo(t.trackId, () => commitGrid(t.trackId, t.grid, t.accents, g, a));
	selection.set(keys);
	refreshTracks();
	return keys.size;
}

/** Steps in one bar of the current meter, for Shift+arrow nudges. */
export function barSteps(): number {
	return (METER_SPECS[get(timeMeter)] || METER_SPECS['4/4']).stepsPerBar;
}
