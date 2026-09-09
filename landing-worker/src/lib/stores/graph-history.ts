import type { RackGraph } from './graph-model';

/**
 * Undo history for the patch bay, as pure data.
 *
 * Split from synth-graph for the same reason graph-model was: that module
 * reaches the Web Audio engine and the SvelteKit runtime, and neither is
 * needed to answer the questions that actually go wrong here -- whether a
 * stack is bounded, whether redo is discarded when a new edit lands, and
 * whether one track's history can reach into another's.
 *
 * That last one is the reason this is per track rather than global. A patch
 * belongs to its track, so undoing on track 3 must not reach back into an edit
 * made on track 1 -- which is exactly what a single shared stack does the
 * moment you switch between them.
 *
 * Snapshots rather than an operation log. A graph is a few dozen nodes and
 * cables, small enough that copying it is free, and an operation log has to get
 * every inverse right including the ones that touch graphParams -- which is
 * where this kind of thing usually goes subtly wrong.
 */
export interface Snapshot {
	graph: RackGraph;
	params: Record<string, number>;
}

/** Bounded: an editing session runs for hours, and an unbounded stack of
 *  patches is a slow leak nobody notices until the tab is sluggish. */
export const UNDO_DEPTH = 60;

export interface History {
	undo: Snapshot[];
	redo: Snapshot[];
}

export function emptyHistory(): History {
	return { undo: [], redo: [] };
}

/** Record the state before an edit. */
export function push(h: History, before: Snapshot, depth = UNDO_DEPTH): History {
	const undo = [...h.undo, before];
	// Oldest first out, so the most recent `depth` edits are the ones kept.
	while (undo.length > depth) undo.shift();
	/* A new edit invalidates anything that was undone: you cannot redo into a
	   future that no longer follows from the present. */
	return { undo, redo: [] };
}

/** Step back one edit. Returns null when there is nothing to undo. */
export function undo(h: History, current: Snapshot): { history: History; restore: Snapshot } | null {
	if (!h.undo.length) return null;
	const undoStack = [...h.undo];
	const restore = undoStack.pop()!;
	return { history: { undo: undoStack, redo: [...h.redo, current] }, restore };
}

/** Step forward one edit. Returns null when there is nothing to redo. */
export function redo(h: History, current: Snapshot): { history: History; restore: Snapshot } | null {
	if (!h.redo.length) return null;
	const redoStack = [...h.redo];
	const restore = redoStack.pop()!;
	return { history: { undo: [...h.undo, current], redo: redoStack }, restore };
}

export function canUndo(h: History | undefined): boolean {
	return (h?.undo.length ?? 0) > 0;
}

export function canRedo(h: History | undefined): boolean {
	return (h?.redo.length ?? 0) > 0;
}
