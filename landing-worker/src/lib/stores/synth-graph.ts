import { writable, get } from 'svelte/store';
import { modularSynth, type TrackData } from '../synth';
import { activeTrackId } from './synth-transport';
import { refreshTracks } from './synth-tracks';

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
export type PortKind = 'audio' | 'mod';

export interface PortSpec {
	id: string;
	label: string;
	kind: PortKind;
}

export interface GraphNode {
	/** Unique within the patch; cables refer to it. */
	id: string;
	type: string;
	/** Canvas position, in grid units rather than pixels so a zoom cannot drift it. */
	x: number;
	y: number;
}

export interface GraphCable {
	from: string;
	fromPort: string;
	to: string;
	toPort: string;
}

export interface RackGraph {
	nodes: GraphNode[];
	cables: GraphCable[];
}

/** Where the voice's sources arrive and where it leaves; every patch has both. */
export const GRAPH_IN = 'in';
export const GRAPH_OUT = 'out';

export const EMPTY_GRAPH: RackGraph = { nodes: [], cables: [] };

export function graphOf(track: { rackGraph?: RackGraph } | undefined): RackGraph {
	const g = track?.rackGraph;
	if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.cables)) return { nodes: [], cables: [] };
	return g;
}

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

export function removeNode(graph: RackGraph, id: string): void {
	commit({
		nodes: graph.nodes.filter((n) => n.id !== id),
		// A node's cables go with it; a cable to nothing is not a patch.
		cables: graph.cables.filter((c) => c.from !== id && c.to !== id)
	});
}

/**
 * Would this cable close an audio loop? Depth-first from the destination: if it
 * can already reach the source, the new cable completes a cycle.
 */
export function wouldCycle(graph: RackGraph, from: string, to: string): boolean {
	const seen = new Set<string>();
	const stack = [to];
	while (stack.length) {
		const at = stack.pop()!;
		if (at === from) return true;
		if (seen.has(at)) continue;
		seen.add(at);
		for (const c of graph.cables) if (c.from === at) stack.push(c.to);
	}
	return false;
}

export function addCable(graph: RackGraph, cable: GraphCable, kind: PortKind): 'ok' | 'cycle' | 'duplicate' {
	const dup = graph.cables.some(
		(c) => c.from === cable.from && c.fromPort === cable.fromPort && c.to === cable.to && c.toPort === cable.toPort
	);
	if (dup) return 'duplicate';
	if (kind === 'audio' && wouldCycle(graph, cable.from, cable.to)) return 'cycle';
	commit({ ...graph, cables: [...graph.cables, cable] });
	return 'ok';
}

export function removeCable(graph: RackGraph, i: number): void {
	commit({ ...graph, cables: graph.cables.filter((_, n) => n !== i) });
}

/**
 * The order to build nodes in: a node's inputs must exist before it does.
 * Kahn's algorithm over the audio cables only, since mod cables may cycle.
 * Returns null when the audio graph has a cycle, which the editor prevents but
 * a hand-edited patch file could still contain.
 */
export function topoOrder(graph: RackGraph, audioCables: GraphCable[]): GraphNode[] | null {
	const indeg = new Map<string, number>();
	for (const n of graph.nodes) indeg.set(n.id, 0);
	for (const c of audioCables) if (indeg.has(c.to)) indeg.set(c.to, (indeg.get(c.to) ?? 0) + 1);

	const queue = graph.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0);
	const out: GraphNode[] = [];
	while (queue.length) {
		const n = queue.shift()!;
		out.push(n);
		for (const c of audioCables) {
			if (c.from !== n.id) continue;
			const left = (indeg.get(c.to) ?? 0) - 1;
			indeg.set(c.to, left);
			if (left === 0) {
				const next = graph.nodes.find((m) => m.id === c.to);
				if (next) queue.push(next);
			}
		}
	}
	return out.length === graph.nodes.length ? out : null;
}
