/**
 * Macros: a piece of a patch collapsed into one card, and used as many times
 * as it is placed.
 *
 * Blueprint's collapsed graph and macro, in one shape. A definition lives in
 * the patch (`RackGraph.macros`), so a preset carries the macros it uses; an
 * instance is a node of type `macro` naming its definition. Its sockets are
 * the definition's NODE terminals -- a terminal nothing inside feeds is an
 * inlet, one nothing inside reads is an outlet -- so what a macro takes and
 * gives is drawn on its own inside, where it can be seen and changed.
 *
 * The engine never sees one. `flattenMacros` replaces every instance with a
 * copy of its definition, ids prefixed with the instance's (`inst/inner`),
 * before a voice is built, so a macro sounds exactly like the nodes it holds.
 * Every instance of a definition is the same inside -- changing it changes
 * all of them -- and differs only by what is cabled into its inlets, which is
 * how a Blueprint macro is parameterised.
 *
 * Macros are for signal and value. A definition holds no ENTRY, OUT or other
 * node that takes part in execution: those are the patch's own ends and its
 * event logic, and a note's execution does not travel into a card.
 */
import type { GraphCable, GraphGroup, GraphNode, RackGraph } from './graph-model';

export const MACRO_TYPE = 'macro';

/** Deepest a macro may sit inside others; past it an instance builds nothing. */
export const MACRO_DEPTH = 8;

export interface MacroDef {
	/** Shown on its cards, four characters at most, like every module label. */
	name: string;
	nodes: GraphNode[];
	cables: GraphCable[];
	groups?: GraphGroup[];
	/** The inside's knobs, keyed `innerId.key` as a track's are. */
	params: Record<string, number>;
	waves?: Record<string, string>;
	/** Terminal names (its sockets) and note texts, keyed by inner id. */
	labels?: Record<string, string>;
}

/** The node types that are execution rather than signal, which a macro cannot hold. */
export const MACRO_EXCLUDED: ReadonlySet<string> = new Set([
	'in',
	'out',
	'onchoke',
	'when',
	'act',
	'wait',
	'tsend',
	'trtn'
]);

const TERMINAL_KIND: Record<string, 'audio' | 'mod'> = { nodept: 'audio', nodecv: 'mod' };
/** Where a cable lands on a terminal, and where it leaves one. */
const TERMINAL_IN: Record<string, string> = { nodept: 'in', nodecv: 'a' };

export interface MacroPort {
	id: string;
	label: string;
	kind: 'audio' | 'mod';
}

/**
 * A definition's sockets, from its terminals.
 *
 * Nothing inside feeds it: an inlet. Nothing inside reads it: an outlet. A
 * terminal with neither is an inlet not yet wired to anything, and one with
 * both is a named wire inside the macro and not a socket at all.
 */
export function macroPorts(def: MacroDef | undefined): {
	inputs: MacroPort[];
	outputs: MacroPort[];
} {
	const inputs: MacroPort[] = [];
	const outputs: MacroPort[] = [];
	if (!def) return { inputs, outputs };
	for (const n of def.nodes) {
		const kind = TERMINAL_KIND[n.type];
		if (!kind) continue;
		const fed = def.cables.some((c) => c.to === n.id);
		const read = def.cables.some((c) => c.from === n.id);
		const label = (def.labels?.[n.id] || n.id).slice(0, 4).toUpperCase();
		if (!fed) inputs.push({ id: n.id, label, kind });
		else if (!read) outputs.push({ id: n.id, label, kind });
	}
	const byPlace = (p: MacroPort) => def.nodes.find((n) => n.id === p.id)?.y ?? 0;
	inputs.sort((a, b) => byPlace(a) - byPlace(b));
	outputs.sort((a, b) => byPlace(a) - byPlace(b));
	return { inputs, outputs };
}

/**
 * A patch with every macro instance replaced by what it holds.
 *
 * Instance `m` of a definition becomes the definition's nodes as `m/inner`,
 * their knobs as `m/inner.key`, and a cable onto socket `t` of `m` lands on
 * terminal `m/t` -- which, being a NODE, passes it straight through. Nested
 * instances are flattened the same way, so `a/b/osc` is the oscillator inside
 * macro `b` inside macro `a`. An instance naming a definition the patch does
 * not have builds nothing, and so does one nested past `MACRO_DEPTH` (a
 * definition that contains itself would otherwise never finish).
 */
export function flattenMacros(
	graph: RackGraph,
	params: Record<string, number> = {},
	waves: Record<string, string> = {}
): { graph: RackGraph; params: Record<string, number>; waves: Record<string, string> } {
	const macros = graph.macros ?? {};
	if (!graph.nodes.some((n) => n.type === MACRO_TYPE)) {
		if (!graph.macros) return { graph, params, waves };
		const { macros: _drop, ...rest } = graph;
		void _drop;
		return { graph: rest, params, waves };
	}

	const nodes: GraphNode[] = [];
	const cables: GraphCable[] = [];
	const outParams: Record<string, number> = {};
	const outWaves: Record<string, string> = {};

	const place = (
		g: { nodes: GraphNode[]; cables: GraphCable[] },
		p: Record<string, number>,
		w: Record<string, string>,
		prefix: string,
		depth: number
	) => {
		const instances = new Map<string, MacroDef | null>();
		for (const n of g.nodes) {
			if (n.type !== MACRO_TYPE) {
				nodes.push({ ...n, id: prefix + n.id });
				continue;
			}
			const def = n.macro ? macros[n.macro] : undefined;
			if (!def || depth >= MACRO_DEPTH) {
				instances.set(n.id, null);
				continue;
			}
			instances.set(n.id, def);
			place(def, def.params ?? {}, def.waves ?? {}, `${prefix}${n.id}/`, depth + 1);
		}
		for (const [k, v] of Object.entries(p)) {
			const dot = k.indexOf('.');
			if (dot < 0 || instances.has(k.slice(0, dot))) continue;
			outParams[prefix + k] = v;
		}
		for (const [k, v] of Object.entries(w)) {
			const dot = k.indexOf('.');
			if (dot < 0 || instances.has(k.slice(0, dot))) continue;
			outWaves[prefix + k] = v;
		}
		const socket = (id: string, port: string, side: 'in' | 'out'): [string, string] | null => {
			if (!instances.has(id)) return [prefix + id, port];
			const def = instances.get(id);
			const term = def?.nodes.find((n) => n.id === port);
			if (!def || !term || !TERMINAL_KIND[term.type]) return null;
			return [`${prefix}${id}/${port}`, side === 'in' ? TERMINAL_IN[term.type] : 'out'];
		};
		for (const c of g.cables) {
			const from = socket(c.from, c.fromPort, 'out');
			const to = socket(c.to, c.toPort, 'in');
			if (!from || !to) continue;
			cables.push({ from: from[0], fromPort: from[1], to: to[0], toPort: to[1] });
		}
	};

	place(graph, params, waves, '', 0);
	const { macros: _drop, ...rest } = graph;
	void _drop;
	return { graph: { ...rest, nodes, cables }, params: outParams, waves: outWaves };
}

/**
 * The audio terminals flattening leaves behind, taken out of the path: every
 * cable into a macro's socket joined to every cable out of it. For the
 * engine, after `flattenMacros` -- which keeps them, since a flattened patch
 * is also what the canvas and its tests read.
 *
 * A NODE is a unity gain, so this changes nothing heard -- and a socket is
 * one per inlet per instance, per note: the piano's three strings and case
 * were eight gains a voice doing nothing, on a twelve-voice patch whose
 * audio thread was spent on how many nodes it walks rather than on what they
 * do. Only the terminals flattening made (their ids carry the instance's
 * `/`): a NODE placed on the canvas by hand stays, as a wire with a name.
 * An inlet nothing feeds feeds nothing.
 */
export function throughTerminals(
	nodes: GraphNode[],
	cables: GraphCable[]
): { nodes: GraphNode[]; cables: GraphCable[] } {
	const gone = new Set(nodes.filter((n) => n.type === 'nodept' && n.id.includes('/')).map((n) => n.id));
	if (!gone.size) return { nodes, cables };
	let out = cables;
	// One terminal at a time, so a terminal feeding another is joined through both.
	for (const id of gone) {
		const into = out.filter((c) => c.to === id);
		const from = out.filter((c) => c.from === id);
		out = out.filter((c) => c.to !== id && c.from !== id);
		for (const a of into)
			for (const b of from) out.push({ from: a.from, fromPort: a.fromPort, to: b.to, toPort: b.toPort });
	}
	return { nodes: nodes.filter((n) => !gone.has(n.id)), cables: out };
}

/** Every definition an instance in `graph` reaches, directly or through another definition. */
export function macrosInUse(graph: {
	nodes: GraphNode[];
	macros?: Record<string, MacroDef>;
}): Set<string> {
	const macros = graph.macros ?? {};
	const used = new Set<string>();
	const walk = (nodes: GraphNode[], depth: number) => {
		if (depth > MACRO_DEPTH) return;
		for (const n of nodes) {
			if (n.type !== MACRO_TYPE || !n.macro || used.has(n.macro)) continue;
			used.add(n.macro);
			const def = macros[n.macro];
			if (def) walk(def.nodes, depth + 1);
		}
	};
	walk(graph.nodes, 0);
	return used;
}

/** The patch without definitions nothing places any more. */
export function pruneMacros(graph: RackGraph): RackGraph {
	if (!graph.macros) return graph;
	const used = macrosInUse(graph);
	const kept = Object.fromEntries(Object.entries(graph.macros).filter(([id]) => used.has(id)));
	if (Object.keys(kept).length === Object.keys(graph.macros).length) return graph;
	if (!Object.keys(kept).length) {
		const { macros: _drop, ...rest } = graph;
		void _drop;
		return rest;
	}
	return { ...graph, macros: kept };
}

type Kind = 'audio' | 'mod' | 'exec' | undefined;

/**
 * Collapse `ids` into one instance of a new definition.
 *
 * Every cable crossing the selection's edge becomes a terminal: one inlet per
 * source outside feeding in (however many nodes inside it reaches), one
 * outlet per source inside read from outside. The selection keeps its layout
 * inside the definition, terminals to its left and right, and the instance
 * takes its place on the canvas. Knobs, waves and labels move in with their
 * nodes. Refused, with a reason, when the selection holds a node that is
 * execution or an exec cable crosses its edge.
 */
export function collapseToMacro(
	graph: RackGraph,
	params: Record<string, number>,
	waves: Record<string, string>,
	labels: Record<string, string>,
	ids: Set<string>,
	kindOf: (c: GraphCable) => Kind,
	names: { def: string; instance: string; name: string }
):
	| {
			graph: RackGraph;
			params: Record<string, number>;
			waves: Record<string, string>;
			labels: Record<string, string>;
	  }
	| { error: 'empty' | 'exec' } {
	const inside = graph.nodes.filter((n) => ids.has(n.id));
	if (!inside.length) return { error: 'empty' };
	if (inside.some((n) => MACRO_EXCLUDED.has(n.type))) return { error: 'exec' };
	const crossing = graph.cables.filter((c) => ids.has(c.from) !== ids.has(c.to));
	if (crossing.some((c) => kindOf(c) === 'exec' || kindOf(c) === undefined))
		return { error: 'exec' };

	const minX = Math.min(...inside.map((n) => n.x));
	const maxX = Math.max(...inside.map((n) => n.x));
	const minY = Math.min(...inside.map((n) => n.y));
	const defNodes: GraphNode[] = inside.map((n) => ({ ...n, x: n.x - minX + 240, y: n.y - minY }));
	const defCables: GraphCable[] = graph.cables.filter((c) => ids.has(c.from) && ids.has(c.to));
	const defLabels: Record<string, string> = {};
	const outerCables: GraphCable[] = graph.cables.filter((c) => !ids.has(c.from) && !ids.has(c.to));

	const count = { audioIn: 0, modIn: 0, audioOut: 0, modOut: 0 };
	const name = (k: keyof typeof count, base: string) => {
		count[k]++;
		return count[k] === 1 ? base : `${base}${count[k]}`;
	};

	// Inlets: one per outside source.
	const inSources = new Map<string, string>();
	for (const c of crossing.filter((c) => !ids.has(c.from))) {
		const key = `${c.from}\u0000${c.fromPort}`;
		let term = inSources.get(key);
		if (!term) {
			const audio = kindOf(c) === 'audio';
			term = `in${inSources.size + 1}`;
			inSources.set(key, term);
			defNodes.push({
				id: term,
				type: audio ? 'nodept' : 'nodecv',
				x: 0,
				y: (inSources.size - 1) * 90
			});
			defLabels[term] = audio ? name('audioIn', 'IN') : name('modIn', 'CV');
			outerCables.push({ from: c.from, fromPort: c.fromPort, to: names.instance, toPort: term });
		}
		defCables.push({ from: term, fromPort: 'out', to: c.to, toPort: c.toPort });
	}
	// Outlets: one per inside source.
	const outSources = new Map<string, string>();
	for (const c of crossing.filter((c) => ids.has(c.from))) {
		const key = `${c.from}\u0000${c.fromPort}`;
		let term = outSources.get(key);
		if (!term) {
			const audio = kindOf(c) === 'audio';
			term = `out${outSources.size + 1}`;
			outSources.set(key, term);
			defNodes.push({
				id: term,
				type: audio ? 'nodept' : 'nodecv',
				x: maxX - minX + 480,
				y: (outSources.size - 1) * 90
			});
			defLabels[term] = audio ? name('audioOut', 'OUT') : name('modOut', 'VAL');
			defCables.push({ from: c.from, fromPort: c.fromPort, to: term, toPort: audio ? 'in' : 'a' });
		}
		outerCables.push({ from: names.instance, fromPort: term, to: c.to, toPort: c.toPort });
	}

	const mine = (k: string) => ids.has(k.slice(0, k.indexOf('.') < 0 ? k.length : k.indexOf('.')));
	const split = <T>(m: Record<string, T>) => {
		const inner: Record<string, T> = {};
		const outer: Record<string, T> = {};
		for (const [k, v] of Object.entries(m)) (mine(k) ? inner : outer)[k] = v;
		return { inner, outer };
	};
	const p = split(params);
	const w = split(waves);
	const l = split(labels);
	// A label is keyed by bare node id, not `id.key`.
	for (const [k, v] of Object.entries(l.inner)) defLabels[k] = v;

	const def: MacroDef = {
		name: names.name.slice(0, 4).toUpperCase(),
		nodes: defNodes,
		cables: defCables,
		params: p.inner,
		...(Object.keys(w.inner).length ? { waves: w.inner } : {}),
		labels: defLabels
	};
	const cx = inside.reduce((s, n) => s + n.x, 0) / inside.length;
	const cy = inside.reduce((s, n) => s + n.y, 0) / inside.length;
	const groups = graph.groups?.map((g) =>
		g.members ? { ...g, members: g.members.filter((m) => !ids.has(m)) } : g
	);
	return {
		graph: {
			...graph,
			nodes: [
				...graph.nodes.filter((n) => !ids.has(n.id)),
				{
					id: names.instance,
					type: MACRO_TYPE,
					macro: names.def,
					x: Math.round(cx),
					y: Math.round(cy)
				}
			],
			cables: outerCables,
			...(groups ? { groups } : {}),
			macros: { ...(graph.macros ?? {}), [names.def]: def }
		},
		params: p.outer,
		waves: w.outer,
		labels: l.outer
	};
}

/**
 * Put an instance's insides back on the canvas in its place.
 *
 * The inverse of collapsing: the definition's nodes arrive under fresh ids
 * around where the instance stood, terminals included (they pass signal
 * through unchanged), and the cables on the instance's sockets reconnect to
 * them. Its knobs come with it. The definition stays for any other instance
 * and is dropped once none is left.
 */
export function expandMacro(
	graph: RackGraph,
	params: Record<string, number>,
	waves: Record<string, string>,
	labels: Record<string, string>,
	instanceId: string,
	newId: (type: string) => string
): {
	graph: RackGraph;
	params: Record<string, number>;
	waves: Record<string, string>;
	labels: Record<string, string>;
	ids: Set<string>;
} | null {
	const inst = graph.nodes.find((n) => n.id === instanceId && n.type === MACRO_TYPE);
	const def = inst?.macro ? graph.macros?.[inst.macro] : undefined;
	if (!inst || !def) return null;
	const remap = new Map(def.nodes.map((n) => [n.id, newId(n.type)]));
	const minX = Math.min(...def.nodes.map((n) => n.x));
	const minY = Math.min(...def.nodes.map((n) => n.y));
	const placed = def.nodes.map((n) => ({
		...n,
		id: remap.get(n.id)!,
		x: inst.x + n.x - minX,
		y: inst.y + n.y - minY
	}));
	const inner = def.cables.map((c) => ({ ...c, from: remap.get(c.from)!, to: remap.get(c.to)! }));
	const ports = macroPorts(def);
	const termIn = (port: string) =>
		def.nodes.find((n) => n.id === port)?.type === 'nodecv' ? 'a' : 'in';
	const outer = graph.cables.flatMap((c) => {
		if (c.to === instanceId) {
			if (!ports.inputs.some((p) => p.id === c.toPort)) return [];
			return [{ ...c, to: remap.get(c.toPort)!, toPort: termIn(c.toPort) }];
		}
		if (c.from === instanceId) {
			if (!ports.outputs.some((p) => p.id === c.fromPort)) return [];
			return [{ ...c, from: remap.get(c.fromPort)!, fromPort: 'out' }];
		}
		return [c];
	});
	const rekey = <T>(m: Record<string, T> | undefined, bare = false) => {
		const out: Record<string, T> = {};
		for (const [k, v] of Object.entries(m ?? {})) {
			const dot = bare ? -1 : k.indexOf('.');
			const id = dot < 0 ? k : k.slice(0, dot);
			const to = remap.get(id);
			if (to) out[to + (dot < 0 ? '' : k.slice(dot))] = v;
		}
		return out;
	};
	const dropInst = <T>(m: Record<string, T>) =>
		Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${instanceId}.`)));
	const next = pruneMacros({
		...graph,
		nodes: [...graph.nodes.filter((n) => n.id !== instanceId), ...placed],
		cables: [...outer, ...inner]
	});
	return {
		graph: next,
		params: { ...dropInst(params), ...rekey(def.params) },
		waves: { ...dropInst(waves), ...rekey(def.waves) },
		labels: { ...labels, ...rekey(def.labels, true) },
		ids: new Set(placed.map((n) => n.id))
	};
}
