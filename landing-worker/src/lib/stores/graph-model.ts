/**
 * The patch graph as data: types, and the questions you can ask of a graph
 * without an audio engine to hand.
 *
 * Split out of synth-graph so it can be tested. The rest of that module edits
 * the active track, which needs Web Audio and the SvelteKit runtime; none of
 * what is here does, and the two rules that matter most -- which cables are
 * legal, and what order nodes are built in -- are exactly the parts worth
 * pinning down with tests.
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

export const EMPTY_GRAPH: RackGraph = { nodes: [], cables: [] };

/** A patch file is user data: anything that is not a graph reads as an empty one. */
export function graphOf(track: { rackGraph?: RackGraph } | undefined): RackGraph {
	const g = track?.rackGraph;
	if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.cables)) return { nodes: [], cables: [] };
	return g;
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

/**
 * A node's parameters live on the track, not on the node, keyed
 * `<nodeId>.<param>` -- the same key the engine reads in buildGraphNode.
 */
export function graphParamKey(nodeId: string, param: string): string {
	return `${nodeId}.${param}`;
}

export function getGraphParam(
	params: Record<string, number> | undefined,
	nodeId: string,
	param: string,
	def: number
): number {
	return params?.[graphParamKey(nodeId, param)] ?? def;
}

/** Drop a removed node's parameters, so a patch does not accumulate dead keys. */
export function pruneGraphParams(
	params: Record<string, number> | undefined,
	nodeId: string
): Record<string, number> {
	const out: Record<string, number> = {};
	const prefix = `${nodeId}.`;
	for (const [k, v] of Object.entries(params ?? {})) if (!k.startsWith(prefix)) out[k] = v;
	return out;
}

/** Is this cable already in the graph? Two identical cables are one connection. */
export function hasCable(graph: RackGraph, cable: GraphCable): boolean {
	return graph.cables.some(
		(c) => c.from === cable.from && c.fromPort === cable.fromPort && c.to === cable.to && c.toPort === cable.toPort
	);
}

/** A node's cables go with it; a cable to nothing is not a patch. */
export function withoutNode(graph: RackGraph, id: string): RackGraph {
	return {
		nodes: graph.nodes.filter((n) => n.id !== id),
		cables: graph.cables.filter((c) => c.from !== id && c.to !== id)
	};
}
