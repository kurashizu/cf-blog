import type { GraphGroup, GraphNode } from './graph-model';

/**
 * How a built-in patch reads on the canvas: its stages as boxes, in the order
 * the sound passes through them, wrapped into rows the way text wraps, with
 * each stage's NOTE cards across the top of its box.
 *
 * One layout for the three places that build patches (`patch()` for the AC
 * presets, the grand piano, the drum kits), because each had grown its own
 * copy. And wrapped, because laid in one row a five-stage patch was ten times
 * as wide as it was tall: FIT could not show it above the canvas's minimum
 * zoom, and at that zoom no card could be read anyway. The rows are cut
 * wherever FIT then shows the whole patch biggest.
 *
 * A node keeps its place *within* its stage from the positions it arrives
 * with: its column is its rank among the stage's x values (depth along the
 * signal) and within a column the nodes stack in y order. ENTRY goes first,
 * unboxed; nodes in no stage (the trim and OUT) form an unboxed block before
 * the first stage on the track -- a label ending "(TRACK)" -- or at the end.
 */
export function layoutStages(
	nodes: GraphNode[],
	stages: [label: string, members: string[], color?: string][],
	notes: [text: string, near: string][] = [],
	entryId = 'entry'
): { groups: GraphGroup[]; notes: GraphNode[]; labels: Record<string, string> } {
	const COL = 300;
	const ROW = 200;
	const GAP = 90;
	const HEAD = 110; // room for a stage's NOTE cards, above its first row
	const NOTE_STEP = 260; // NOTE cards are at most 240 wide
	const VIEW_W = 1120; // the canvas, less FIT's margin
	const VIEW_H = 540;
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const staged = new Set(stages.flatMap(([, m]) => m));
	const loose = nodes.filter((n) => n.id !== entryId && n.type !== 'note' && !staged.has(n.id));
	type Block = {
		ids: string[];
		stage?: number;
		w: number;
		h: number;
		x: number;
		y: number;
		local: Map<string, { x: number; y: number }>;
	};
	const block = (ids: string[], stage?: number): Block => {
		const own = ids.map((id) => byId.get(id)).filter((n): n is GraphNode => !!n);
		const cols = [...new Set(own.map((n) => n.x))].sort((p, q) => p - q);
		const perCol = new Map<number, number>();
		const local = new Map<string, { x: number; y: number }>();
		const head =
			stage !== undefined && notes.some(([, near]) => ids.includes(near))
				? HEAD
				: stage !== undefined
					? 40
					: 0;
		for (const n of [...own].sort((p, q) => p.y - q.y)) {
			const c = cols.indexOf(n.x);
			const k = perCol.get(c) ?? 0;
			perCol.set(c, k + 1);
			local.set(n.id, { x: c * COL, y: head + k * ROW });
		}
		const rows = Math.max(1, ...perCol.values());
		const noteCols = notes.filter(([, near]) => ids.includes(near)).length;
		const w = Math.max(cols.length * COL, noteCols * NOTE_STEP);
		return { ids: own.map((n) => n.id), stage, w, h: head + rows * ROW, x: 0, y: 0, local };
	};
	const blocks: Block[] = [];
	if (byId.has(entryId)) blocks.push(block([entryId]));
	const trackAt = stages.findIndex(([label]) => /\(TRACK\)\s*$/.test(label));
	stages.forEach(([, members], i) => {
		if (i === trackAt && loose.length) blocks.push(block(loose.map((n) => n.id)));
		blocks.push(block(members, i));
	});
	if ((trackAt < 0 || !stages.length) && loose.length) blocks.push(block(loose.map((n) => n.id)));

	/* Cut into rows at whatever width lets FIT show the patch biggest: every
	   width from the widest stage to one row is tried, and the one whose
	   extent fits the canvas (VIEW_W x VIEW_H) at the largest zoom wins. An
	   estimate from the area wrapped too early -- stages of unequal height
	   leave gaps, and the patches came out square. */
	const flow = (maxW: number) => {
		let x = 48;
		let y = 168;
		let rowH = 0;
		let right = 0;
		for (const b of blocks) {
			if (x > 48 && x + b.w > 48 + maxW) {
				x = 48;
				y += rowH + GAP;
				rowH = 0;
			}
			b.x = x;
			b.y = y;
			x += b.w + GAP;
			right = Math.max(right, x - GAP);
			rowH = Math.max(rowH, b.h);
		}
		return Math.min(VIEW_W / (right - 48), VIEW_H / (y + rowH - 168));
	};
	const widest = Math.max(...blocks.map((b) => b.w));
	const total = blocks.reduce((a, b) => a + b.w + GAP, 0);
	let best = widest;
	let bestZoom = 0;
	for (let w = widest; w <= total; w += COL / 2) {
		const z = flow(w);
		if (z > bestZoom + 1e-9) {
			bestZoom = z;
			best = w;
		}
	}
	flow(best);
	for (const b of blocks)
		for (const id of b.ids) {
			const n = byId.get(id)!;
			const at = b.local.get(id)!;
			n.x = b.x + at.x;
			n.y = b.y + at.y;
		}

	const groups: GraphGroup[] = [];
	const noteNodes: GraphNode[] = [];
	const labels: Record<string, string> = {};
	for (const b of blocks) {
		if (b.stage === undefined) continue;
		const [label, , color] = stages[b.stage];
		const id = `g${b.stage}`;
		const mine = notes.map((n, i) => [n, i] as const).filter(([[, near]]) => b.ids.includes(near));
		mine.forEach(([[text], i], j) => {
			const noteId = `note${i}`;
			noteNodes.push({ id: noteId, type: 'note', x: b.x + j * NOTE_STEP, y: b.y + 30 });
			labels[noteId] = text;
		});
		groups.push({
			id,
			label,
			x: b.x - 24,
			y: b.y,
			w: b.w + 24,
			h: b.h,
			color: color ?? STAGE_TINTS[b.stage % STAGE_TINTS.length],
			members: [...b.ids, ...mine.map(([, i]) => `note${i}`)]
		});
	}
	return { groups, notes: noteNodes, labels };
}

/** Box tints for a patch's stages, in order: source, shaping, body, space. */
export const STAGE_TINTS = ['#e06c75', '#e5c07b', '#61afef', '#98c379', '#c678dd', '#56b6c2'];
