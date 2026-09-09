import { writable, get } from 'svelte/store';
import { modularSynth, type TrackData } from '../synth';
import { activeTrackId } from './synth-transport';
import { refreshTracks } from './synth-tracks';
import {
	graphOf,
	wouldCycle,
	hasCable,
	withoutNode,
	pruneGraphParams,
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
	EMPTY_GRAPH
} from './graph-model';
export type { RackGraph, GraphCable, GraphNode, PortKind, PortSpec } from './graph-model';

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
function commit(graph: RackGraph): void {
	modularSynth.updateTrack(get(activeTrackId), { rackGraph: graph } as Partial<TrackData>);
	refreshTracks();
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
	commit({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) });
}

export function removeNode(graph: RackGraph, id: string, params?: Record<string, number>): void {
	modularSynth.updateTrack(get(activeTrackId), {
		rackGraph: withoutNode(graph, id),
		// A node's knob settings go with it, or a patch accumulates dead keys
		// that would silently reattach to a later node reusing the id.
		graphParams: pruneGraphParams(params, id)
	} as Partial<TrackData>);
	refreshTracks();
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

export function setGraphParam(
	params: Record<string, number> | undefined,
	nodeId: string,
	param: string,
	value: number
): void {
	const next = { ...(params ?? {}), [`${nodeId}.${param}`]: value };
	modularSynth.updateTrack(get(activeTrackId), { graphParams: next } as Partial<TrackData>);
	refreshTracks();
}
