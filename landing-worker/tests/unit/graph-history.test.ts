import { describe, it, expect } from 'vitest';
import {
	emptyHistory,
	push,
	undo,
	redo,
	canUndo,
	canRedo,
	UNDO_DEPTH,
	type Snapshot,
	type History
} from '../../src/lib/stores/graph-history';

/**
 * Undo for the patch bay.
 *
 * Tested here rather than through the app because the browser could not answer
 * these honestly: the page serves the synth module under two specifiers, so a
 * console probe and the running UI can hold different copies of the engine, and
 * every "undo drained the wrong track" reading turned out to be that rather
 * than the code. With no engine in the picture the questions are plain.
 */

const snap = (n: number): Snapshot => ({
	graph: { nodes: [{ id: `n${n}`, type: 'osc', x: 0, y: 0 }], cables: [] },
	params: { [`n${n}.level`]: n }
});

const ids = (h: History) => ({
	undo: h.undo.map((s) => s.graph.nodes[0].id),
	redo: h.redo.map((s) => s.graph.nodes[0].id)
});

describe('recording edits', () => {
	it('starts with nothing to undo or redo', () => {
		const h = emptyHistory();
		expect(canUndo(h)).toBe(false);
		expect(canRedo(h)).toBe(false);
	});

	it('treats a track it has never seen as empty rather than throwing', () => {
		expect(canUndo(undefined)).toBe(false);
		expect(canRedo(undefined)).toBe(false);
	});

	it('keeps edits in the order they were made', () => {
		let h = push(emptyHistory(), snap(1));
		h = push(h, snap(2));
		expect(ids(h).undo).toEqual(['n1', 'n2']);
	});

	it('drops the oldest edit past the depth limit, not the newest', () => {
		// The most recent edits are the ones anyone wants back; an unbounded
		// stack of whole patches is a slow leak over a long session.
		let h = emptyHistory();
		for (let i = 0; i < UNDO_DEPTH + 5; i++) h = push(h, snap(i));
		expect(h.undo).toHaveLength(UNDO_DEPTH);
		expect(h.undo[0].graph.nodes[0].id).toBe(`n5`);
		expect(h.undo[UNDO_DEPTH - 1].graph.nodes[0].id).toBe(`n${UNDO_DEPTH + 4}`);
	});

	it('honours a smaller depth when one is given', () => {
		let h = emptyHistory();
		for (let i = 0; i < 10; i++) h = push(h, snap(i), 3);
		expect(h.undo).toHaveLength(3);
	});
});

describe('stepping back and forward', () => {
	it('returns the state recorded before the edit', () => {
		const h = push(emptyHistory(), snap(1));
		const step = undo(h, snap(2));
		expect(step?.restore.graph.nodes[0].id).toBe('n1');
	});

	it('puts what was current onto the redo stack', () => {
		const h = push(emptyHistory(), snap(1));
		const step = undo(h, snap(2))!;
		expect(ids(step.history)).toEqual({ undo: [], redo: ['n2'] });
	});

	it('walks back through several edits in order', () => {
		let h = push(emptyHistory(), snap(1));
		h = push(h, snap(2));
		const first = undo(h, snap(3))!;
		expect(first.restore.graph.nodes[0].id).toBe('n2');
		const second = undo(first.history, first.restore)!;
		expect(second.restore.graph.nodes[0].id).toBe('n1');
	});

	it('redoes what was just undone', () => {
		const h = push(emptyHistory(), snap(1));
		const back = undo(h, snap(2))!;
		const fwd = redo(back.history, back.restore)!;
		expect(fwd.restore.graph.nodes[0].id).toBe('n2');
	});

	it('refuses to undo with nothing recorded', () => {
		expect(undo(emptyHistory(), snap(1))).toBeNull();
	});

	it('refuses to redo with nothing undone', () => {
		expect(redo(push(emptyHistory(), snap(1)), snap(2))).toBeNull();
	});

	it('discards the redo stack once a new edit lands', () => {
		// You cannot redo into a future that no longer follows from the present.
		const h = push(emptyHistory(), snap(1));
		const back = undo(h, snap(2))!;
		expect(canRedo(back.history)).toBe(true);
		const after = push(back.history, snap(9));
		expect(canRedo(after)).toBe(false);
	});

	it('carries params with the graph, so an undone knob comes back too', () => {
		const h = push(emptyHistory(), snap(7));
		const step = undo(h, snap(8))!;
		expect(step.restore.params).toEqual({ 'n7.level': 7 });
	});

	it('never mutates the history it was given', () => {
		const h = push(emptyHistory(), snap(1));
		const before = ids(h);
		undo(h, snap(2));
		redo(h, snap(2));
		push(h, snap(3));
		expect(ids(h)).toEqual(before);
	});
});

describe('one history per track', () => {
	/* The reason histories are keyed by track: a patch belongs to its track, so
	   undoing on one must not reach into an edit made on another. A single
	   shared stack does exactly that the moment you switch between them. */
	it('leaves another track untouched when one is edited', () => {
		const byTrack = new Map<number, History>();
		byTrack.set(0, push(emptyHistory(), snap(1)));
		expect(canUndo(byTrack.get(0))).toBe(true);
		expect(canUndo(byTrack.get(4))).toBe(false);
	});

	it('cannot undo on a track that has no history of its own', () => {
		const byTrack = new Map<number, History>();
		byTrack.set(0, push(emptyHistory(), snap(1)));
		expect(undo(byTrack.get(4) ?? emptyHistory(), snap(2))).toBeNull();
		// ...and track 0 still has its edit.
		expect(canUndo(byTrack.get(0))).toBe(true);
	});
});
