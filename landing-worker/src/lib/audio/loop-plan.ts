/**
 * Which SEND/RTN loops a voice can run sample by sample.
 *
 * A loop drawn with SEND and RTN closes through Web Audio's own render
 * quantum: 128 samples, 2.9 ms at 44.1 kHz, under every comb, every
 * Karplus string and every allpass a patch could draw. A loop whose every
 * module the loop processor knows can instead be handed to it whole
 * (`LOOP_PROCESSOR`) and close in one sample.
 *
 * The loop on a bus is every node on a path from one of its RTNs to one of
 * its SENDs, over audio cables -- forward from the returns, meeting backward
 * from the sends -- plus every SEND and RTN on that bus, so a SEND on no
 * path still reaches the RTNs it feeds. Two buses whose loops share a node
 * are one island. A bus with a node the processor does not know, or with no
 * path at all (an open SEND to RTN is a delay line, not a loop), keeps the
 * block-delayed pair, which sounds as it always has.
 *
 * Pure, and kept apart from the engine, so the rule can be tested on graphs.
 */

export const LOOP_TYPES: ReadonlySet<string> = new Set([
	'fbsend',
	'fbrtn',
	'gain',
	'sum',
	'diff',
	'ring',
	'shape',
	'filter',
	'delay'
]);

/** The knobs each loop module reads, with the defaults its card prints. */
export const LOOP_KNOBS: Readonly<Record<string, readonly [string, number][]>> = {
	gain: [['level', 1]],
	ring: [['ringDepth', 100]],
	shape: [['shapeDrive', 25]],
	filter: [
		['cutoff', 4000],
		['q', 1],
		['filterGain', 0]
	],
	delay: [['delayTime', 0.25]]
};

/** The most modules one island takes; past it the loop stays block-delayed. */
export const LOOP_MAX_MEMBERS = 24;

interface Cable {
	from: string;
	fromPort: string;
	to: string;
	toPort: string;
}

export interface LoopIsland {
	/** Members in an order where each comes after what feeds it inside the island. */
	members: string[];
	/** The first DELAY on each bus's loop, which gives back the sample RTN adds. */
	lenders: Set<string>;
}

export function planLoops(
	nodes: readonly { id: string; type: string }[],
	audioCables: readonly Cable[],
	busOf: (id: string) => number,
	inScope: (id: string) => boolean = () => true
): LoopIsland[] {
	const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
	const buses = new Set(nodes.filter((n) => n.type === 'fbrtn').map((n) => busOf(n.id)));
	const reach = (seeds: string[], forward: boolean): Set<string> => {
		const seen = new Set(seeds);
		const queue = [...seeds];
		while (queue.length) {
			const id = queue.shift()!;
			for (const c of audioCables) {
				const [here, there] = forward ? [c.from, c.to] : [c.to, c.from];
				if (here !== id || seen.has(there)) continue;
				seen.add(there);
				queue.push(there);
			}
		}
		return seen;
	};

	const loops: { bus: number; members: Set<string>; path: Set<string> }[] = [];
	for (const bus of buses) {
		const ends = nodes.filter(
			(n) => (n.type === 'fbrtn' || n.type === 'fbsend') && busOf(n.id) === bus
		);
		const rtns = ends.filter((n) => n.type === 'fbrtn').map((n) => n.id);
		const sends = ends.filter((n) => n.type === 'fbsend').map((n) => n.id);
		if (!sends.length) continue;
		const fwd = reach(rtns, true);
		const back = reach(sends, false);
		const path = new Set([...fwd].filter((id) => back.has(id)));
		// No path from a return to a send: a delay line, not a loop.
		if (!path.size) continue;
		const members = new Set([...path, ...ends.map((n) => n.id)]);
		loops.push({ bus, members, path });
	}

	// Loops sharing a node run in one processor.
	const islands: { members: Set<string>; loops: typeof loops }[] = [];
	for (const loop of loops) {
		const joined = islands.filter((isl) => [...loop.members].some((id) => isl.members.has(id)));
		const merged = { members: new Set(loop.members), loops: [loop] };
		for (const isl of joined) {
			for (const id of isl.members) merged.members.add(id);
			merged.loops.push(...isl.loops);
			islands.splice(islands.indexOf(isl), 1);
		}
		islands.push(merged);
	}

	const out: LoopIsland[] = [];
	for (const isl of islands) {
		const ids = [...isl.members];
		if (ids.length > LOOP_MAX_MEMBERS) continue;
		if (!ids.every((id) => LOOP_TYPES.has(typeOf.get(id) ?? '') && inScope(id))) continue;
		/* A SEND's bus has to be one the island closes: a SEND on a bus whose
		   RTN is elsewhere would be heard by nobody inside it. */
		const closed = new Set(isl.loops.map((l) => l.bus));
		if (ids.some((id) => typeOf.get(id) === 'fbrtn' && !closed.has(busOf(id)))) continue;

		// Order: Kahn's over the audio cables inside the island. SEND to RTN is
		// not a cable, so this is acyclic unless a patch file was hand-edited.
		const inner = audioCables.filter((c) => isl.members.has(c.from) && isl.members.has(c.to));
		const indeg = new Map(ids.map((id) => [id, 0]));
		for (const c of inner) indeg.set(c.to, (indeg.get(c.to) ?? 0) + 1);
		const queue = ids.filter((id) => indeg.get(id) === 0);
		const order: string[] = [];
		while (queue.length) {
			const id = queue.shift()!;
			order.push(id);
			for (const c of inner) {
				if (c.from !== id) continue;
				const left = (indeg.get(c.to) ?? 0) - 1;
				indeg.set(c.to, left);
				if (left === 0) queue.push(c.to);
			}
		}
		if (order.length !== ids.length) continue;

		const lenders = new Set<string>();
		for (const loop of isl.loops) {
			const first = order.find((id) => loop.path.has(id) && typeOf.get(id) === 'delay');
			if (first) lenders.add(first);
		}
		out.push({ members: order, lenders });
	}
	return out;
}
