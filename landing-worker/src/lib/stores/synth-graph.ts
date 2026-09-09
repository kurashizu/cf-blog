import { writable, get } from 'svelte/store';
import {
	emptyHistory,
	push as pushHistory,
	undo as undoHistory,
	redo as redoHistory,
	canUndo as historyCanUndo,
	canRedo as historyCanRedo,
	type History,
	type Snapshot
} from './graph-history';
import { modularSynth, type TrackData } from '../synth';
import { activeTrackId } from './synth-transport';
import { refreshTracks } from './synth-tracks';
import {
	graphOf,
	wouldCycle,
	hasCable,
	withoutNode,
	pruneGraphParams,
	moveNodes,
	withoutNodes,
	copyNodes,
	pasteNodes,
	type RackGraph,
	type GraphCable,
	type GraphNode,
	type PortKind
} from './graph-model';

/* The graph's own rules live in graph-model, which has no Web Audio in it and
   so can be unit tested; this module is the half that edits the active track. */
export {
	graphOf,
	wouldCycle,
	topoOrder,
	hasCable,
	withoutNode,
	graphParamKey,
	getGraphParam,
	pruneGraphParams,
	isFixedNode,
	startingGraph,
	moveNodes,
	withoutNodes,
	copyNodes,
	pasteNodes,
	nodesInRect,
	ENTRY_ID,
	OUTPUT_ID,
	EMPTY_GRAPH,
	roleOf,
	rolesCompatible
} from './graph-model';
export type { RackGraph, GraphCable, GraphNode, PortKind, PortRole, PortSpec } from './graph-model';

/**
 * The patch bay as a graph, not a chain.
 *
 * A chain says what order the stages run in, which is most of a synth but not
 * the interesting part: on a modular the same oscillator drives the filter and
 * the filter's own cutoff, and an envelope goes wherever a cable reaches. That
 * is what makes it an instrument you can explore rather than a fixed voice with
 * knobs. So modules sit on a canvas and cables run between named ports.
 *
 * Two kinds of cable, because they are two different things:
 *   AUDIO carries signal. Web Audio cannot take a feedback loop here -- a
 *     delay loop measured stable only to about g = 0.90 and screams past it --
 *     so audio cables are checked for cycles and refused.
 *   MOD carries control. A cycle is fine and often the point (an LFO whose
 *     rate is modulated by another LFO), because these land on AudioParams.
 */
/* Undo history, per track. The rules live in graph-history, which has no Web
   Audio in it and so can be tested; this half holds the stacks and knows how to
   read and write a track. */
const histories = new Map<number, History>();

/** Bumped on every history change, so the toolbar can grey its buttons out. */
export const historyVersion = writable(0);

function snapshot(id: number): Snapshot {
	const t = modularSynth.getTrack(id);
	return {
		graph: JSON.parse(JSON.stringify(graphOf(t))),
		params: JSON.parse(JSON.stringify(t?.graphParams ?? {}))
	};
}

/** Record the state before an edit, so it can be returned to. */
function pushUndo(id: number): void {
	histories.set(id, pushHistory(histories.get(id) ?? emptyHistory(), snapshot(id)));
	/* Announced after the edit lands, not here: historyVersion is a store, so
	   updating it runs subscribers synchronously, and this is called before the
	   write it is recording. A subscriber that re-read the graph would see it as
	   it was a moment ago. */
	pendingHistoryBump = true;
}

/* Set by pushUndo, flushed once the edit has been written. */
let pendingHistoryBump = false;

function flushHistoryBump(): void {
	if (!pendingHistoryBump) return;
	pendingHistoryBump = false;
	historyVersion.update((v) => v + 1);
}

function restore(id: number, snap: Snapshot): void {
	modularSynth.updateTrack(id, {
		rackGraph: snap.graph,
		graphParams: snap.params
	} as Partial<TrackData>);
	refreshTracks();
}

export function undoGraph(): boolean {
	const id = get(activeTrackId);
	const step = undoHistory(histories.get(id) ?? emptyHistory(), snapshot(id));
	if (!step) return false;
	histories.set(id, step.history);
	restore(id, step.restore);
	historyVersion.update((v) => v + 1);
	return true;
}

export function redoGraph(): boolean {
	const id = get(activeTrackId);
	const step = redoHistory(histories.get(id) ?? emptyHistory(), snapshot(id));
	if (!step) return false;
	histories.set(id, step.history);
	restore(id, step.restore);
	historyVersion.update((v) => v + 1);
	return true;
}

export function canUndo(trackId: number): boolean {
	return historyCanUndo(histories.get(trackId));
}

export function canRedo(trackId: number): boolean {
	return historyCanRedo(histories.get(trackId));
}

function commit(graph: RackGraph): void {
	pushUndo(get(activeTrackId));
	modularSynth.updateTrack(get(activeTrackId), { rackGraph: graph } as Partial<TrackData>);
	refreshTracks();
	flushHistoryBump();
}

/** The node the canvas is editing, or null. */
export const selectedNode = writable<string | null>(null);

/** A cable being dragged: where it started, until it lands or is dropped. */
export const draggingFrom = writable<{ node: string; port: string; kind: PortKind } | null>(null);

let seq = 0;

export function addNode(graph: RackGraph, type: string, x: number, y: number): string {
	const id = `${type}-${Date.now().toString(36)}-${seq++}`;
	commit({ ...graph, nodes: [...graph.nodes, { id, type, x, y }] });
	return id;
}

export function moveNode(graph: RackGraph, id: string, x: number, y: number): void {
	commitDuringDrag({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) });
}

export function removeNode(graph: RackGraph, id: string, params?: Record<string, number>): void {
	pushUndo(get(activeTrackId));
	modularSynth.updateTrack(get(activeTrackId), {
		rackGraph: withoutNode(graph, id),
		// A node's knob settings go with it, or a patch accumulates dead keys
		// that would silently reattach to a later node reusing the id.
		graphParams: pruneGraphParams(params, id)
	} as Partial<TrackData>);
	refreshTracks();
	flushHistoryBump();
}

export function addCable(graph: RackGraph, cable: GraphCable, kind: PortKind): 'ok' | 'cycle' | 'duplicate' {
	if (hasCable(graph, cable)) return 'duplicate';
	// Audio cannot loop -- a delay loop measured stable only to about g = 0.90
	// and screamed past it -- but modulation can, and often should.
	if (kind === 'audio' && wouldCycle(graph, cable.from, cable.to)) return 'cycle';
	commit({ ...graph, cables: [...graph.cables, cable] });
	return 'ok';
}

export function removeCable(graph: RackGraph, i: number): void {
	commit({ ...graph, cables: graph.cables.filter((_, n) => n !== i) });
}

/* The last param touched, and when. A knob drag fires setGraphParam on every
   pointermove; recording each one would make undo step back a pixel at a time
   and fill the stack in a second. Consecutive changes to the same knob within
   this window count as one edit. */
let lastParamKey = '';
let lastParamAt = 0;
const PARAM_COALESCE_MS = 600;

export function setGraphParam(
	params: Record<string, number> | undefined,
	nodeId: string,
	param: string,
	value: number
): void {
	const key = `${nodeId}.${param}`;
	const now = Date.now();
	if (key !== lastParamKey || now - lastParamAt > PARAM_COALESCE_MS) pushUndo(get(activeTrackId));
	lastParamKey = key;
	lastParamAt = now;
	const next = { ...(params ?? {}), [`${nodeId}.${param}`]: value };
	modularSynth.updateTrack(get(activeTrackId), { graphParams: next } as Partial<TrackData>);
	refreshTracks();
	flushHistoryBump();
}

/* The nodes a box-select or a shift-click has gathered. Separate from
   selectedNode, which is the one whose knobs the canvas is showing: a selection
   of six modules has no single one to edit. */
export const selectedNodes = writable<Set<string>>(new Set());

/** What Ctrl+C put aside, in memory rather than the system clipboard. */
export const graphClipboard = writable<RackGraph | null>(null);

/* A drag is one edit, not one per frame.
 *
 * moveNode and moveSelection fire on every pointermove, so recording each would
 * bury the stack under a hundred one-pixel steps and make undo useless for the
 * thing people most want to undo. beginDrag() marks the start of a gesture;
 * everything until it ends folds into that single entry. */
let dragOpen = false;

export function beginGraphDrag(): void {
	if (dragOpen) return;
	pushUndo(get(activeTrackId));
	dragOpen = true;
}

export function endGraphDrag(): void {
	dragOpen = false;
}

/** Write without recording: the gesture already pushed its own entry. */
function commitDuringDrag(graph: RackGraph): void {
	modularSynth.updateTrack(get(activeTrackId), { rackGraph: graph } as Partial<TrackData>);
	refreshTracks();
}

export function moveSelection(graph: RackGraph, ids: Set<string>, dx: number, dy: number): void {
	commitDuringDrag(moveNodes(graph, ids, dx, dy));
}

export function deleteSelection(graph: RackGraph, ids: Set<string>, params?: Record<string, number>): void {
	pushUndo(get(activeTrackId));
	let next = params ?? {};
	for (const id of ids) next = pruneGraphParams(next, id);
	modularSynth.updateTrack(get(activeTrackId), {
		rackGraph: withoutNodes(graph, ids),
		graphParams: next
	} as Partial<TrackData>);
	selectedNodes.set(new Set());
	refreshTracks();
	flushHistoryBump();
}

export function copySelection(graph: RackGraph, ids: Set<string>): number {
	const clip = copyNodes(graph, ids);
	graphClipboard.set(clip.nodes.length ? clip : null);
	return clip.nodes.length;
}

/** Paste the clipboard, carrying each node's knob settings across with it. */
export function pasteClipboard(graph: RackGraph, params?: Record<string, number>): number {
	const clip = get(graphClipboard);
	if (!clip || !clip.nodes.length) return 0;
	pushUndo(get(activeTrackId));
	const idFor = (type: string) => `${type}-${Date.now().toString(36)}-${seq++}`;
	const oldIds = clip.nodes.map((n) => n.id);
	const { graph: next, ids } = pasteNodes(graph, clip, 32, idFor);
	// The knobs come too: a pasted module that lost its settings is not a copy.
	const newIds = [...ids];
	const gp: Record<string, number> = { ...(params ?? {}) };
	oldIds.forEach((oldId, i) => {
		const newIdStr = newIds[i];
		if (!newIdStr) return;
		for (const [k, v] of Object.entries(params ?? {})) {
			if (k.startsWith(`${oldId}.`)) gp[`${newIdStr}.${k.slice(oldId.length + 1)}`] = v;
		}
	});
	modularSynth.updateTrack(get(activeTrackId), { rackGraph: next, graphParams: gp } as Partial<TrackData>);
	selectedNodes.set(ids);
	refreshTracks();
	flushHistoryBump();
	return ids.size;
}
