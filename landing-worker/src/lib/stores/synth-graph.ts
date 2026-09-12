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
import { MODULE_SPECS } from './synth-modules';
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
	isFixedNode,
	groupAround,
	nodesInGroup,
	ownedNodes,
	moveGroup,
	resizeGroup,
	refitGroup,
	ungroup,
	addGroup,
	renameGroup,
	type RackGraph,
	type GraphCable,
	type GraphNode,
	type PortKind
} from './graph-model';
import { findPrefab, savePrefab, type Prefab } from './synth-prefabs';

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
	groupAround,
	nodesInGroup,
	ungroup,
	GROUP_PAD,
	GROUP_HEADER,
	ENTRY_ID,
	OUTPUT_ID,
	EMPTY_GRAPH,
	roleOf,
	rolesCompatible
} from './graph-model';
import { roleOf, type PortRole as Role } from './graph-model';
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

/**
 * Forget every track's undo history.
 *
 * The stacks are module-global and keyed by track id, and nothing cleared them:
 * load song A, edit track 0's patch bay, load song B, press undo -- and song
 * A's graph was written straight onto song B's track 0, with the canvas showing
 * it as though it belonged there. A history is a history *of a project*, so it
 * ends when the project does.
 */
export function clearGraphHistory(): void {
	histories.clear();
	lastParamKey = '';
	historyVersion.update((v) => v + 1);
}

/** Record the state before an edit, so it can be returned to. */
function pushUndo(id: number): void {
	histories.set(id, pushHistory(histories.get(id) ?? emptyHistory(), snapshot(id)));
	/* Any edit closes the coalescing window.
	
	   The window was only ever written by `setGraphParam`, so turning a knob,
	   drawing a cable and turning the *same* knob again inside 600 ms recorded
	   nothing for the second move -- one undo jumped back past both. A window is
	   a continuous gesture on one control; anything else happening ends it. */
	lastParamKey = '';
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

/**
 * Is this cable carrying sound?
 *
 * Asked of the port it lands on, in the module it lands on -- the same question
 * the engine asks, and for the same reason: `b` is an audio inlet on RING and a
 * value inlet on ADD, so matching bare port ids across the catalogue gets it
 * wrong. A knob is an inlet too, and always a control one.
 */
function cableIsAudio(graph: RackGraph, cable: GraphCable): boolean {
	const type = graph.nodes.find((n) => n.id === cable.to)?.type;
	const spec = MODULE_SPECS.find((m) => m.id === type);
	if (!spec) return false;
	const port = spec.inputs.find((q) => q.id === cable.toPort);
	if (port) return port.kind === 'audio';
	return false;
}

/** Does this cable land on a port the module declares, rather than on a knob? */
function isDeclaredInlet(graph: RackGraph, cable: GraphCable): boolean {
	const type = graph.nodes.find((n) => n.id === cable.to)?.type;
	const spec = MODULE_SPECS.find((m) => m.id === type);
	return !!spec?.inputs.some((q) => q.id === cable.toPort);
}

/**
 * The range a role's values actually occupy.
 *
 * MAP's X bounds say what the incoming signal swings between, and getting them
 * wrong is silent: a -1..1 waveform read against the default 0..1 has its whole
 * negative half clamped to the low end, so half the cycle does nothing and the
 * card still looks right. Nobody types those numbers before hearing the
 * problem.
 *
 * The cable's role is what knows. A `cv` is bipolar, a `unit` is a proportion,
 * a `pitch` is semitones about the reference -- so the bounds can be filled in
 * when the cable is drawn, which is the moment the answer becomes knowable.
 *
 * Only a first guess. Both fields stay typed, and a patch that wants a window
 * onto part of the range says so by typing it.
 */
const ROLE_RANGE: Partial<Record<Role, [number, number]>> = {
	cv: [-1, 1],
	unit: [0, 1],
	bool: [0, 1],
	hz: [20, 20000],
	pitch: [-48, 48],
	time: [0, 4],
	index: [0, 127]
};

/**
 * Fill in MAP's input range from whatever was just plugged into it.
 *
 * Deliberately narrow: it fires on MAP's `a` inlet and nowhere else, and only
 * while both bounds are still untouched. A range the player has typed is an
 * answer, and an answer is not something to overwrite because a cable moved.
 */
function inferMapRange(graph: RackGraph, cable: GraphCable): void {
	const to = graph.nodes.find((n) => n.id === cable.to);
	if (to?.type !== 'map' || cable.toPort !== 'a') return;
	const params = get(activeTrackId) !== undefined ? currentGraphParams() : undefined;
	if (!params) return;
	// Untouched means absent: a knob that has never been set is not in the patch.
	if (params[`${to.id}.inLo`] !== undefined || params[`${to.id}.inHi`] !== undefined) return;
	const from = graph.nodes.find((n) => n.id === cable.from);
	const spec = MODULE_SPECS.find((m) => m.id === from?.type);
	const port = spec?.outputs.find((q) => q.id === cable.fromPort);
	const range = port && ROLE_RANGE[roleOf(port)];
	if (!range) return;
	/* Both bounds in one write. `setGraphParam` spreads from the map it is
	   handed, so calling it twice with the same stale object would have the
	   second write drop the first -- and the range would come out half set,
	   which is worse than not set. */
	setGraphParams(params, {
		[`${to.id}.inLo`]: range[0],
		[`${to.id}.inHi`]: range[1]
	});
}

/** The live track's graph params, or undefined when there is no track. */
function currentGraphParams(): Record<string, number> | undefined {
	const id = get(activeTrackId);
	return modularSynth.getTrack(id)?.graphParams as Record<string, number> | undefined;
}

export function addCable(
	graph: RackGraph,
	cable: GraphCable,
	kind: PortKind
): 'ok' | 'cycle' | 'duplicate' {
	if (hasCable(graph, cable)) return 'duplicate';
	/* Audio cannot loop -- a delay loop measured stable only to about g = 0.90
	   and screamed past it -- but modulation can, and often should.
	
	   Only audio cables are walked. Walking all of them refused the envelope
	   follower patch: BREAK's AMP already reaches the filter over a mod cable,
	   so feeding that filter looked like a loop and was reported as one. */
	if (kind === 'audio' && wouldCycle(graph, cable.from, cable.to, (c) => cableIsAudio(graph, c)))
		return 'cycle';
	/* A knob takes one cable, and the newest one wins.
	
	   A knob is not a summing inlet: a value *replaces* it, and the resolver
	   reads exactly one cable per socket -- the first it finds. The engine's mod
	   loop meanwhile connected every cable that landed there, so two cables into
	   one knob meant the base value came from whichever was drawn first while
	   both were wired. A CONST and an ENV into VCF's FREQ put the cutoff at 300
	   or 9000 Hz depending on draw order, and deleting and redrawing the ENV
	   retuned the patch. Replacing keeps one cable per knob, so there is nothing
	   for the two to disagree about. A declared inlet is untouched: those really
	   do sum, and several sources into a VCA's CV is a normal patch. */
	const ontoKnob = !isDeclaredInlet(graph, cable);
	const cables = ontoKnob
		? graph.cables.filter((c) => !(c.to === cable.to && c.toPort === cable.toPort))
		: graph.cables;
	commit({ ...graph, cables: [...cables, cable] });
	/* After the commit, so the param write lands on the graph that has the
	   cable -- and so an undo of the cable and an undo of the range are two
	   steps, which is what they are. */
	inferMapRange(graph, cable);
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
	/* A knob holds a number, and every one of them ends up on an AudioParam.
	   Web Audio throws on a non-finite assignment, which aborts the note
	   mid-build -- so refuse it here, where there is one door, rather than
	   guarding ninety-nine reads. */
	if (!Number.isFinite(value)) return;
	/* Keyed by track as well as by knob.
	
	   Two tracks seeded from the same builtin song share node ids, so turning
	   `osc-1.oscHz` on track 0 and then on track 1 inside the window left track
	   1 with no undo entry for its own first edit. A window is about one hand on
	   one knob, and that knob is on a track. */
	const key = `${get(activeTrackId)}:${nodeId}.${param}`;
	const now = Date.now();
	if (key !== lastParamKey || now - lastParamAt > PARAM_COALESCE_MS) pushUndo(get(activeTrackId));
	lastParamKey = key;
	lastParamAt = now;
	const next = { ...(params ?? {}), [`${nodeId}.${param}`]: value };
	modularSynth.updateTrack(get(activeTrackId), { graphParams: next } as Partial<TrackData>);
	refreshTracks();
	flushHistoryBump();
}

/**
 * Write several knobs at once.
 *
 * One undo step and one track update for a change that is one decision --
 * MAP's two input bounds arrive together or the range is half set. Calling
 * `setGraphParam` twice cannot do it: each spreads from the map it was handed,
 * so the second call, holding the object as it was before the first, drops it.
 */
export function setGraphParams(
	params: Record<string, number> | undefined,
	values: Record<string, number>
): void {
	const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => Number.isFinite(v)));
	if (!Object.keys(clean).length) return;
	pushUndo(get(activeTrackId));
	// Force the next single-knob write to open its own window: this was not a
	// hand resting on a knob, so nothing should coalesce with it.
	lastParamKey = '';
	modularSynth.updateTrack(get(activeTrackId), {
		graphParams: { ...(params ?? {}), ...clean }
	} as Partial<TrackData>);
	refreshTracks();
	flushHistoryBump();
}

/**
 * Set a per-node setting that is a name rather than a number.
 *
 * The same door as `setGraphParam`, and deliberately a separate one: a waveform
 * is `sine` or `custom:<id>`, while everything reading the numeric map
 * interpolates, clamps and NaN-checks what it finds there. Undo is not
 * coalesced either -- picking a wave is one discrete choice, not a hand resting
 * on a knob, so each pick is its own step.
 */
export function setGraphWave(
	waves: Record<string, string> | undefined,
	nodeId: string,
	param: string,
	value: string
): void {
	if (!value) return;
	pushUndo(get(activeTrackId));
	const next = { ...(waves ?? {}), [`${nodeId}.${param}`]: value };
	modularSynth.updateTrack(get(activeTrackId), { graphWaves: next } as Partial<TrackData>);
	refreshTracks();
	flushHistoryBump();
}

/**
 * Set the text a node carries: a TERM's socket name, a NOTE's comment.
 *
 * Keyed by node id alone rather than `node.param`, because these cards have one
 * piece of text and no parameters -- there is nothing to disambiguate.
 *
 * Coalesced like a knob rather than discrete like a wave pick: typing a name is
 * a continuous gesture, and one undo per keystroke is not an undo anyone wants.
 * An empty string deletes the key instead of storing it, so a label cleared out
 * leaves a patch byte-identical to one that never had it.
 */
export function setGraphLabel(
	labels: Record<string, string> | undefined,
	nodeId: string,
	value: string
): void {
	const key = `label:${nodeId}`;
	if (lastParamKey !== key) {
		pushUndo(get(activeTrackId));
		lastParamKey = key;
	}
	const next = { ...(labels ?? {}) };
	if (value) next[nodeId] = value;
	else delete next[nodeId];
	modularSynth.updateTrack(get(activeTrackId), { graphLabels: next } as Partial<TrackData>);
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
/* Has this drag recorded its starting state yet? */
let dragRecorded = false;

/**
 * Open a drag, without recording anything yet.
 *
 * This used to push an undo entry on pointer*down*, before it could know whether
 * the pointer would move -- so selecting a module, or clicking one to reach its
 * knobs, recorded a snapshot identical to the current state. The stack is sixty
 * deep, so sixty clicks pushed every real edit out of it; and since a push
 * clears the redo stack, a single click on a module threw away everything that
 * had been undone.
 *
 * The snapshot is taken on the first movement instead, which is the moment
 * something is actually about to change.
 */
export function beginGraphDrag(): void {
	if (dragOpen) return;
	dragOpen = true;
	dragRecorded = false;
}

/** Called on the first movement of a drag: record the state it started from. */
function markGraphDragMoved(): void {
	if (!dragOpen || dragRecorded) return;
	dragRecorded = true;
	pushUndo(get(activeTrackId));
}

export function endGraphDrag(): void {
	dragOpen = false;
	dragRecorded = false;
}

/** Write without recording: the gesture already pushed its own entry. */
function commitDuringDrag(graph: RackGraph): void {
	/* The first write of a drag is the moment something changes, so that is
	   when the state it started from is recorded. Recording on pointer-down
	   instead meant a click that moved nothing still pushed a snapshot. */
	markGraphDragMoved();
	modularSynth.updateTrack(get(activeTrackId), { rackGraph: graph } as Partial<TrackData>);
	refreshTracks();
}

export function moveSelection(graph: RackGraph, ids: Set<string>, dx: number, dy: number): void {
	commitDuringDrag(moveNodes(graph, ids, dx, dy));
}

export function deleteSelection(
	graph: RackGraph,
	ids: Set<string>,
	params?: Record<string, number>
): void {
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
/* How many times the clipboard's current contents have been pasted, so each
   copy lands clear of the last. Reset when the clipboard changes. */
let pasteRun = 0;
let lastPastedClip: unknown = null;

/**
 * Rewrite a fragment's knob values onto the ids its copy was given.
 *
 * `pasteNodes` mints a fresh id per node in the order the fragment lists them
 * and hands the new ids back in that same order, which is what makes the
 * positional pairing here sound. Every key of the form `<oldId>.<knob>` is
 * re-emitted as `<newId>.<knob>`, so a pasted module arrives with its settings
 * -- one that lost them is not a copy of anything.
 *
 * Shared by paste and by prefab expansion rather than written twice. They are
 * the same operation: a prefab *is* a clipboard fragment that was saved to a
 * shelf instead of held in memory, and the second copy of this loop would be
 * the one that fell behind when the key format changed.
 */
function remapParams(
	into: Record<string, number> | undefined,
	from: Record<string, number> | undefined,
	oldIds: string[],
	newIds: string[]
): Record<string, number> {
	const out: Record<string, number> = { ...(into ?? {}) };
	oldIds.forEach((oldId, i) => {
		const fresh = newIds[i];
		if (!fresh) return;
		for (const [k, v] of Object.entries(from ?? {})) {
			if (k.startsWith(`${oldId}.`)) out[`${fresh}.${k.slice(oldId.length + 1)}`] = v;
		}
	});
	return out;
}

export function pasteClipboard(graph: RackGraph, params?: Record<string, number>): number {
	const clip = get(graphClipboard);
	if (!clip || !clip.nodes.length) return 0;
	pushUndo(get(activeTrackId));
	const idFor = (type: string) => `${type}-${Date.now().toString(36)}-${seq++}`;
	const oldIds = clip.nodes.map((n) => n.id);
	/* Each paste of the same clip steps further away.

	   A fixed offset put the second copy exactly underneath the first, so
	   pasting twice looked like pasting once -- which the docstring's "offset so
	   it does not land exactly on the original" is only true of the first. */
	pasteRun = get(graphClipboard) === lastPastedClip ? pasteRun + 1 : 1;
	lastPastedClip = clip;
	const { graph: next, ids } = pasteNodes(graph, clip, 32 * pasteRun, idFor);
	// The knobs come too: a pasted module that lost its settings is not a copy.
	const gp = remapParams(params, params, oldIds, [...ids]);
	modularSynth.updateTrack(get(activeTrackId), {
		rackGraph: next,
		graphParams: gp
	} as Partial<TrackData>);
	selectedNodes.set(ids);
	refreshTracks();
	flushHistoryBump();
	return ids.size;
}

/* ──────────────────────────────────────────────────────────────────────────
   Groups: Blueprint's comment box, over this graph
   ────────────────────────────────────────────────────────────────────────── */

/** How a node's box is measured. The canvas knows; the store is handed the answer. */
export type NodeSize = (node: GraphNode) => { w: number; h: number };

let groupSeq = 0;

function newGroupId(): string {
	return `grp-${Date.now().toString(36)}-${groupSeq++}`;
}

/**
 * Draw a box around the current selection. Ctrl+G.
 *
 * The nodes are not moved, not reparented and not altered in any way -- the
 * only thing that changes is that a rectangle now exists behind them. That is
 * the whole of what grouping is here, and keeping it to that is what lets the
 * engine stay ignorant of the feature.
 */
export function groupSelection(
	graph: RackGraph,
	ids: Set<string>,
	label: string,
	size: NodeSize
): string | null {
	/* Nodes already owned by another box are not up for grabs. Selecting across
	   an existing group and pressing Ctrl+G builds a box around whatever is free
	   and leaves that group's members with it -- to move them, ungroup the box
	   that holds them first, which releases them, then group again. */
	const owned = ownedNodes(graph);
	const members = graph.nodes.filter(
		(n) => ids.has(n.id) && !isFixedNode(n.id) && !owned.has(n.id)
	);
	/* Two is the floor, not one. A box around a single node says nothing the
	   node does not already say, and a box around nothing is a rectangle in
	   space that owns whatever is later dragged into it -- which is a surprise
	   rather than a feature. */
	if (members.length < 2) return null;
	const group = groupAround(
		newGroupId(),
		label.trim().slice(0, 24).toUpperCase() || 'GROUP',
		members,
		size
	);
	commit(addGroup(graph, { ...group, members: members.map((n) => n.id) }));
	return group.id;
}

/** Which nodes a box is currently carrying. Read on pointer-down and held. */
export function groupMembers(graph: RackGraph, groupId: string, size: NodeSize): Set<string> {
	const group = graph.groups?.find((g) => g.id === groupId);
	return new Set(group ? nodesInGroup(graph, group, size) : []);
}

/**
 * Drag a box and what it is carrying.
 *
 * `members` is the set captured when the drag began, not one recomputed here --
 * see `moveGroup`. Committed through the drag path, so the whole gesture is one
 * undo step rather than one per frame.
 */
export function moveGroupBy(
	graph: RackGraph,
	groupId: string,
	members: Set<string>,
	dx: number,
	dy: number
): void {
	commitDuringDrag(moveGroup(graph, groupId, members, dx, dy));
}

/** Resize a box. The nodes stay put; what the box *owns* is recomputed from the new rect. */
export function resizeGroupTo(
	graph: RackGraph,
	groupId: string,
	box: { x: number; y: number; w: number; h: number }
): void {
	commitDuringDrag(resizeGroup(graph, groupId, box));
}

/**
 * Grow a box to cover members that turned out taller than they measured.
 *
 * Called once, a frame after a prefab lands, when the cards have reported their
 * real heights. Silent when nothing changed, so it does not push an undo entry
 * for the common case where the estimate was right.
 */
export function refitGroupTo(
	_graph: RackGraph,
	groupId: string,
	ids: Set<string>,
	size: NodeSize
): void {
	/* Read fresh rather than using the caller's handle. This runs from a
	   requestAnimationFrame set up before the drop was committed, so the graph
	   captured in that closure is the one from *before* the prefab landed -- it
	   has no such group in it, `find` returns undefined, and the refit silently
	   did nothing. That is why the LFO box still cut MAP off after the fix that
	   was supposed to stop it. */
	const graph = graphOf(modularSynth.getTrack(get(activeTrackId)));
	const next = refitGroup(graph, groupId, ids, size);
	if (next === graph) return;
	modularSynth.updateTrack(get(activeTrackId), { rackGraph: next } as Partial<TrackData>);
	refreshTracks();
}

/**
 * Remove a box, leaving its members. Ctrl+Shift+G.
 *
 * Deliberately not a delete. The nodes were never inside the box in any sense
 * the graph knows about, so there is nothing to take out of it.
 */
export function ungroupById(graph: RackGraph, groupId: string): void {
	commit(ungroup(graph, groupId));
}

/**
 * Ungroup every box the selection touches. Ctrl+Shift+G, and the toolbar.
 *
 * Selecting a member and pressing ungroup is the gesture people reach for --
 * they are looking at the node they want to free, not at the box's title bar.
 * Returns how many boxes were removed, so the caller can say when there were
 * none rather than appearing to do nothing.
 */
export function ungroupSelection(graph: RackGraph, ids: Set<string>): number {
	const hit = (graph.groups ?? []).filter(
		(g) => ids.has(g.id) || (g.members ?? []).some((m) => ids.has(m))
	);
	if (!hit.length) return 0;
	let next = graph;
	for (const g of hit) next = ungroup(next, g.id);
	commit(next);
	return hit.length;
}

/** Delete a box *and* everything it is carrying -- the destructive one, asked for explicitly. */
export function deleteGroupAndMembers(
	graph: RackGraph,
	groupId: string,
	size: NodeSize,
	params?: Record<string, number>
): void {
	const members = groupMembers(graph, groupId, size);
	pushUndo(get(activeTrackId));
	let next = params ?? {};
	for (const id of members) next = pruneGraphParams(next, id);
	modularSynth.updateTrack(get(activeTrackId), {
		rackGraph: ungroup(withoutNodes(graph, members), groupId),
		graphParams: next
	} as Partial<TrackData>);
	selectedNodes.set(new Set());
	refreshTracks();
	flushHistoryBump();
}

export function setGroupLabel(graph: RackGraph, groupId: string, label: string): void {
	const clean = label.trim().slice(0, 24).toUpperCase();
	if (!clean) return;
	commit(renameGroup(graph, groupId, clean));
}

/* ──────────────────────────────────────────────────────────────────────────
   Prefabs: a saved arrangement, expanded into loose primitives
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Drop a prefab onto the canvas at a point.
 *
 * Expansion, not instantiation: what lands is the prefab's primitives with
 * fresh ids, its internal cables, and its knob values -- and then nothing. No
 * node in the resulting patch records where it came from, because there is no
 * such node; a prefab is not a type. Everything that arrives is immediately as
 * editable as anything placed by hand, which is the property the whole feature
 * is arranged around.
 *
 * It goes through `pasteNodes`, the same path Ctrl+V takes, for the same reason
 * `remapParams` is shared: a second expander would be a second place for the id
 * rewriting to be got wrong, and this one is already proven by every paste.
 *
 * The box comes with it. Five loose cards that happen to be a comb filter read
 * as five loose cards; the same five inside a rectangle labelled COMB read as
 * what they are. The box is scenery over them either way -- deleting it leaves
 * a working comb filter behind.
 */
export function dropPrefab(
	graph: RackGraph,
	key: string,
	at: { x: number; y: number },
	params: Record<string, number> | undefined,
	size: NodeSize
): { ids: Set<string>; groupId: string | null } | null {
	const prefab = findPrefab(key);
	if (!prefab?.body?.nodes?.length) return null;
	pushUndo(get(activeTrackId));

	/* Placed where it was dropped rather than at the body's own coordinates.
	   A prefab's nodes are authored around the origin, so pasting them raw would
	   pile every drop in the top-left corner whatever the pointer said. */
	let x0 = Infinity;
	let y0 = Infinity;
	for (const n of prefab.body.nodes) {
		x0 = Math.min(x0, n.x);
		y0 = Math.min(y0, n.y);
	}
	const body: RackGraph = {
		nodes: prefab.body.nodes.map((n) => ({ ...n, x: n.x - x0 + at.x, y: n.y - y0 + at.y })),
		cables: prefab.body.cables.map((c) => ({ ...c }))
	};

	const idFor = (type: string) => `${type}-${Date.now().toString(36)}-${seq++}`;
	const oldIds = body.nodes.map((n) => n.id);
	/* Offset 0: the drop point is already the position asked for, and a paste
	   offset on top of it would put the prefab somewhere other than where the
	   pointer was released. */
	const { graph: pasted, ids } = pasteNodes(graph, body, 0, idFor);

	/* The box is drawn around the nodes *after* they land, from their real sizes
	   -- not carried in the prefab as a rectangle. A stored box would be authored
	   against whatever the cards measured on the day it was saved, and a card
	   that later grows a knob would burst out of its own group. */
	const placed = pasted.nodes.filter((n) => ids.has(n.id));
	const group = {
		...groupAround(newGroupId(), prefab.label, placed, size, prefab.color),
		/* A prefab's box owns exactly what it expanded into, recorded rather than
		   measured. This is also what makes the box immune to the card-height
		   problem: MAP renders taller than the spec estimates the box from, so a
		   geometric box would disown it the moment it laid out. */
		members: placed.map((n) => n.id)
	};
	const next = addGroup(pasted, group);

	/* The terminals' names come across with the nodes. Keyed by node id alone
	   rather than `id.param`, so the shared remapper does not fit -- but the
	   mapping is the same one, read off the two id lists in the same order. */
	const newIds = [...ids];
	const labels = {
		...((modularSynth.getTrack(get(activeTrackId))?.graphLabels as Record<string, string>) ?? {})
	};
	for (const [i, oldId] of oldIds.entries()) {
		const text = prefab.labels?.[oldId];
		const fresh = newIds[i];
		if (text && fresh) labels[fresh] = text;
	}
	modularSynth.updateTrack(get(activeTrackId), {
		rackGraph: next,
		graphParams: remapParams(params, prefab.params, oldIds, [...ids]),
		...(Object.keys(labels).length ? { graphLabels: labels } : {})
	} as Partial<TrackData>);
	selectedNodes.set(ids);
	refreshTracks();
	flushHistoryBump();
	return { ids: ids, groupId: group.id };
}

/**
 * Save the current selection to the prefab shelf.
 *
 * Extracted with `copyNodes`, so what is saved is exactly what Ctrl+C would
 * have copied: cables leaving the selection are dropped rather than saved
 * dangling, and ENTRY and OUTPUT are never included -- a prefab that carried
 * the ends of a patch would bring a second pair to whatever it was dropped
 * into.
 */
export function saveSelectionAsPrefab(
	graph: RackGraph,
	ids: Set<string>,
	label: string,
	params?: Record<string, number>,
	note = ''
): Prefab | null {
	const body = copyNodes(graph, ids);
	if (body.nodes.length < 2) return null;
	return savePrefab(label, body, params, note);
}
