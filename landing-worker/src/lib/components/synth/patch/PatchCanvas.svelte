<script lang="ts">
	/**
	 * The patch bay: modules on a canvas, cables between ports.
	 *
	 * Laid out like LIFE.LAB because the problem is the same -- a palette of
	 * pieces on the right, a workspace in the middle you can pan and zoom, and
	 * the pieces keep the site's own panel styling rather than becoming generic
	 * boxes. The camera is {x, y, s} and the wheel zooms about the pointer, so
	 * the thing under the cursor stays under it.
	 *
	 * Cables are drawn as bezier curves in an SVG layer beneath the modules, so
	 * a cable never covers a knob and a module never hides a cable's endpoint.
	 */
	import { get } from 'svelte/store';
	import { playSound } from '../../../sound';
	import { t } from '../../../i18n';
	import { currentTrack } from '../../../stores/synth-tracks';
	import {
		graphOf,
		addNode,
		moveNode,
		removeNode,
		addCable,
		removeCable,
		setGraphParam,
		selectedNode,
		selectedNodes,
		graphClipboard,
		moveSelection,
		deleteSelection,
		copySelection,
		pasteClipboard,
		nodesInRect,
		isFixedNode,
		roleOf,
		rolesCompatible,
		type GraphNode,
		type PortKind,
		type PortRole
	} from '../../../stores/synth-graph';
	import { PALETTE_SPECS, MODULE_GROUPS, moduleSpec, type ModuleSpec } from '../../../stores/synth-modules';
	import { laneSocketId } from '../../../stores/note-lanes';
	import { trackLanes } from '../../../stores/lane-edit';
	import ModuleCard from './ModuleCard.svelte';
	import ModuleIcon from './ModuleIcon.svelte';

	let graph = $derived(graphOf($currentTrack));
	let graphParams = $derived($currentTrack?.graphParams);

	/** Camera: pan in px, scale about the pointer. Same shape LIFE.LAB uses. */
	let cam = $state({ x: 40, y: 40, s: 1 });
	let canvasEl = $state<HTMLDivElement | undefined>();

	const GRID = 16;
	/* Wide enough for the widest selector row. A four-way row of 8px labels
	   wants 118px of content; NTCH was being cut off at 124px total, which
	   leaves 112 inside the border and the padding. */
	const NODE_W = 136;
	/* Port geometry, in one place because two formulas have to agree exactly:
	   the dots are laid out by CSS inside the node, and the cables are drawn in
	   SVG from portPos(). When they disagreed, every cable ended in mid-air a
	   few pixels off its socket -- so both now come from portOffset(), and the
	   header is given a fixed height rather than being left to whatever its
	   text and padding happen to measure (it came out 29px, not the 18 the
	   cables assumed).

	   BORDER is counted because `left`/`top` place the node's border box while
	   the ports are positioned inside its content box, and PORT_R is half a
	   w-3 dot, which straddles the edge so a cable meets a socket, not a wall. */
	const BORDER = 2;
	const HEADER_H = 20;
	const PORT_R = 6;

	/* A card is as tall as its own controls, so the ports have to be spread over
	   a height that varies per module. Computing it rather than measuring the
	   DOM keeps the cables right on the first frame, before layout has happened
	   -- but it only works if the numbers match what the card actually renders,
	   so these were measured off the rendered cards rather than estimated:
	   a knob row is 42, a segmented selector 30, the LFO curve 26 and the
	   compact ADSR panel 58, with a 4px gap between parts and 4px of padding
	   either end. */
	const KNOB_ROW_H = 42;
	const SELECTOR_H = 30;
	const GAP = 4;
	const BODY_PAD = 4;
	const VIZ_H: Record<string, number> = { adsr: 58, wave: 26, curve: 26, scope: 26, fft: 26, meter: 26 };

	function bodyHeight(spec: ModuleSpec): number {
		const knobs = spec.params.filter((p) => !p.choices).length;
		const selectors = spec.params.filter((p) => p.choices).length;
		const rows = Math.ceil(knobs / 2);
		const parts: number[] = [];
		for (let i = 0; i < selectors; i++) parts.push(SELECTOR_H);
		if (spec.viz) parts.push(VIZ_H[spec.viz] ?? 26);
		if (rows) parts.push(rows * KNOB_ROW_H + (rows - 1) * 2);
		if (!parts.length) return BODY_PAD * 2;
		return BODY_PAD * 2 + parts.reduce((a, b) => a + b, 0) + (parts.length - 1) * GAP;
	}

	/* The computed height is only an estimate for the very first frame. Once a
	   card has laid out it reports its real height here, and the ports and
	   cables follow that instead -- so restyling a card can no longer silently
	   pull the cables off their sockets, which is exactly what the hand-counted
	   constants above did twice. */
	let measured = $state<Record<string, number>>({});

	function bodyOf(node: GraphNode, spec: ModuleSpec): number {
		return measured[node.id] ?? bodyHeight(spec);
	}

	function nodeHeight(node: GraphNode, spec: ModuleSpec): number {
		return 2 * BORDER + HEADER_H + bodySpaced(node, spec);
	}

	/* bodyOf() is what both the ports and the cables measure against, so a card
	   whose sockets need more room than its controls take grows here rather
	   than having the ports overflow it. */
	function bodySpaced(node: GraphNode, spec: ModuleSpec): number {
		return Math.max(bodyOf(node, spec), portsHeight(spec, node));
	}

	/** Watch a card's box, so the ports track whatever it actually renders as. */
	function measure(el: HTMLElement, id: string) {
		const ro = new ResizeObserver(() => {
			const h = el.getBoundingClientRect().height / cam.s;
			if (h > 0 && Math.abs((measured[id] ?? -1) - h) > 0.5) measured = { ...measured, [id]: h };
		});
		ro.observe(el);
		return {
			destroy() {
				ro.disconnect();
			}
		};
	}

	/* Sockets never sit closer than this. Spreading them evenly over the body
	   was fine for two, but ENTRY now publishes one per lane, and four over a
	   short card put them touching -- an unlabelled column of identical dots
	   nobody could aim at or tell apart. Below this spacing the card grows
	   instead. */
	const PORT_GAP = 22;

	/** The centre of port i, measured from the node's border-box top-left. */
	function portOffset(node: GraphNode, spec: ModuleSpec, count: number, i: number) {
		const body = bodySpaced(node, spec);
		const even = (body / (count + 1)) * (i + 1);
		if (count < 2 || body / (count + 1) >= PORT_GAP) return BORDER + HEADER_H + even;
		// Too tight to spread: stack from the top at a fixed pitch instead.
		return BORDER + HEADER_H + PORT_GAP * (i + 0.5);
	}

	/** How tall a card must be for its own sockets to fit at PORT_GAP apart. */
	function portsHeight(spec: ModuleSpec, n: GraphNode): number {
		const count = Math.max(spec.inputs.length, outletsOf(n, spec).length);
		return count < 2 ? 0 : PORT_GAP * count;
	}

	/** Drag state: a module being moved, or a cable being pulled. */
	let dragNode = $state<{ id: string; dx: number; dy: number } | null>(null);
	let pullFrom = $state<{ node: string; port: string; kind: PortKind; role: PortRole; x: number; y: number } | null>(null);
	let pointer = $state({ x: 0, y: 0 });
	let paletteOpen = $state(true);
	let message = $state('');
	/** The palette entry being dragged, for browsers that withhold dataTransfer. */
	let dragType = $state<string | null>(null);

	function toCanvas(clientX: number, clientY: number) {
		const r = canvasEl?.getBoundingClientRect();
		if (!r) return { x: 0, y: 0 };
		return { x: (clientX - r.left - cam.x) / cam.s, y: (clientY - r.top - cam.y) / cam.s };
	}

	/** Where a port sits in canvas space, so a cable can be drawn to it. */
	function portPos(nodeId: string, port: string, isOutput: boolean) {
		const n = graph.nodes.find((m) => m.id === nodeId);
		if (!n) return { x: 0, y: 0 };
		const spec = moduleSpec(n.type);
		if (!spec) return { x: 0, y: 0 };
		// The same list the sockets are drawn from, so a cable lands on its dot.
		const list = isOutput ? outletsOf(n, spec) : spec.inputs;
		const i = Math.max(0, list.findIndex((p) => p.id === port));
		return {
			// The dots straddle the border, so their centres land on the node's
			// two vertical edges -- a cable meets the socket, not the wall.
			x: n.x + (isOutput ? NODE_W : 0),
			y: n.y + portOffset(n, spec, list.length, i)
		};
	}

	/* The editing keys, LIFE.LAB's set: Delete removes, Ctrl+C/V copy and paste,
	   Ctrl+A takes everything, Escape clears. Only while the canvas has focus,
	   so they cannot fire while a name is being typed somewhere else. */
	function onKeyDown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		const tag = target?.tagName?.toLowerCase() ?? '';
		if (['input', 'textarea', 'select'].includes(tag) || target?.isContentEditable) return;
		if (!canvasEl?.contains(target) && target !== canvasEl) return;

		const sel = $selectedNodes;
		if (e.key === 'Escape') {
			selectedNodes.set(new Set());
			selectedNode.set(null);
			e.preventDefault();
			return;
		}
		if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) {
			deleteSelection(graph, sel, graphParams);
			playSound('click');
			e.preventDefault();
			return;
		}
		if (!(e.ctrlKey || e.metaKey)) return;
		const k = e.key.toLowerCase();
		if (k === 'a') {
			selectedNodes.set(new Set(graph.nodes.map((n) => n.id)));
			e.preventDefault();
		} else if (k === 'c' && sel.size) {
			const n = copySelection(graph, sel);
			message = n ? $t('synthPatch.copied', { count: n }) : '';
			playSound('click');
			e.preventDefault();
		} else if (k === 'v') {
			const n = pasteClipboard(graph, graphParams);
			if (n) {
				message = $t('synthPatch.pasted', { count: n });
				playSound('click');
			}
			e.preventDefault();
		} else if (k === 'd' && sel.size) {
			// Duplicate: copy and paste in one gesture, which is what it is.
			copySelection(graph, sel);
			const n = pasteClipboard(graph, graphParams);
			if (n) playSound('click');
			e.preventDefault();
		}
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const r = canvasEl?.getBoundingClientRect();
		if (!r) return;
		const mx = e.clientX - r.left;
		const my = e.clientY - r.top;
		// Zoom about the pointer: the thing under the cursor stays under it.
		const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
		const ns = Math.max(0.35, Math.min(3, cam.s * k));
		const kk = ns / cam.s;
		cam = { x: mx - (mx - cam.x) * kk, y: my - (my - cam.y) * kk, s: ns };
	}

	let panning = $state<{ x: number; y: number } | null>(null);
	/* A box being dragged on empty canvas, in canvas coordinates. */
	let marquee = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
	/* Where a multi-node drag started, so the whole selection moves together. */
	let groupDrag = $state<{ x: number; y: number } | null>(null);

	let marqueeRect = $derived(
		marquee
			? {
					x: Math.min(marquee.x0, marquee.x1),
					y: Math.min(marquee.y0, marquee.y1),
					w: Math.abs(marquee.x1 - marquee.x0),
					h: Math.abs(marquee.y1 - marquee.y0)
				}
			: null
	);

	function onPointerDown(e: PointerEvent) {
		/* Right button pans, anywhere -- including over a module, since wanting to
		   move the view should not depend on finding a gap between modules. Left
		   on empty canvas pans too, which is what a hand cursor promises. */
		if (e.button === 2) {
			e.preventDefault();
			panning = { x: e.clientX - cam.x, y: e.clientY - cam.y };
			return;
		}
		if (e.button !== 0) return;
		if (e.target === canvasEl || (e.target as HTMLElement)?.dataset?.canvas === 'bg') {
			/* Left-drag on empty canvas selects, the way LIFE.LAB's does. Panning
			   is the right button, which works over a module too, so nothing is
			   lost by giving the left one to the marquee. */
			const p = toCanvas(e.clientX, e.clientY);
			marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
			if (!e.shiftKey) {
				selectedNode.set(null);
				selectedNodes.set(new Set());
			}
		}
	}

	function onPointerMove(e: PointerEvent) {
		pointer = { x: e.clientX, y: e.clientY };
		if (marquee) {
			const p = toCanvas(e.clientX, e.clientY);
			marquee = { ...marquee, x1: p.x, y1: p.y };
			return;
		}
		if (groupDrag && dragNode) {
			const p = toCanvas(e.clientX, e.clientY);
			const nx = Math.round((p.x - dragNode.dx) / GRID) * GRID;
			const ny = Math.round((p.y - dragNode.dy) / GRID) * GRID;
			const anchor = graph.nodes.find((n) => n.id === dragNode!.id);
			if (anchor && (nx !== anchor.x || ny !== anchor.y)) {
				moveSelection(graph, $selectedNodes, nx - anchor.x, ny - anchor.y);
			}
			return;
		}
		if (panning) {
			cam = { ...cam, x: e.clientX - panning.x, y: e.clientY - panning.y };
			return;
		}
		if (dragNode) {
			const p = toCanvas(e.clientX, e.clientY);
			// Snap to the grid, so a patch stays legible without being fiddly.
			const nx = Math.round((p.x - dragNode.dx) / GRID) * GRID;
			const ny = Math.round((p.y - dragNode.dy) / GRID) * GRID;
			moveNode(graph, dragNode.id, nx, ny);
		}
	}

	function onPointerUp() {
		if (marqueeRect) {
			// A click rather than a drag leaves the selection alone.
			if (marqueeRect.w > 3 || marqueeRect.h > 3) {
				const hit = nodesInRect(graph, marqueeRect, (n) => {
					const spec = moduleSpec(n.type);
					return { w: NODE_W, h: spec ? nodeHeight(n, spec) : 74 };
				});
				selectedNodes.update((prev) => new Set([...prev, ...hit]));
				if (hit.length === 1) selectedNode.set(hit[0]);
			}
			marquee = null;
		}
		panning = null;
		groupDrag = null;
		dragNode = null;
		// A cable dropped on nothing is not a cable.
		pullFrom = null;
	}

	function startDrag(e: PointerEvent, n: GraphNode) {
		// Right button belongs to the canvas: panning must work wherever the
		// pointer happens to be, and a module under it is not a reason to refuse.
		if (e.button === 2) return;
		e.stopPropagation();
		const p = toCanvas(e.clientX, e.clientY);
		dragNode = { id: n.id, dx: p.x - n.x, dy: p.y - n.y };
		selectedNode.set(n.id);
		/* Shift adds to the selection; clicking a module already in one keeps it,
		   so a group can be dragged by any of its members. Clicking outside the
		   selection starts a new one. */
		selectedNodes.update((prev) => {
			if (e.shiftKey) {
				const next = new Set(prev);
				if (next.has(n.id)) next.delete(n.id);
				else next.add(n.id);
				return next;
			}
			return prev.has(n.id) ? prev : new Set([n.id]);
		});
		groupDrag = get(selectedNodes).size > 1 ? { x: p.x, y: p.y } : null;
	}

	function startCable(e: PointerEvent, nodeId: string, port: string, kind: PortKind) {
		if (e.button === 2) return;
		e.stopPropagation();
		const p = portPos(nodeId, port, true);
		const n = graph.nodes.find((m) => m.id === nodeId);
		const spec = n && moduleSpec(n.type);
		const socket = spec && outletsOf(n, spec).find((o) => o.id === port);
		pullFrom = { node: nodeId, port, kind, role: socket ? roleOf(socket) : 'signal', x: p.x, y: p.y };
	}

	function endCable(e: PointerEvent, nodeId: string, port: string, kind: PortKind) {
		e.stopPropagation();
		if (!pullFrom) return;
		if (pullFrom.kind !== kind) {
			// Audio into a mod inlet is not a patching mistake worth guessing at:
			// they are different signals with different ranges.
			message = $t('synthPatch.mismatch');
			pullFrom = null;
			return;
		}
		const res = addCable(graph, { from: pullFrom.node, fromPort: pullFrom.port, to: nodeId, toPort: port }, kind);
		message = res === 'cycle' ? $t('synthPatch.cycle') : res === 'duplicate' ? $t('synthPatch.duplicate') : '';
		if (res === 'ok') playSound('click');
		pullFrom = null;
	}

	function place(type: string) {
		/* Clicking the palette drops into the first free cell of a grid rather
		   than onto a fixed point: the old 12px stagger was smaller than a card
		   is wide, so clicking several entries buried them in a pile. Columns
		   run left to right, then wrap. */
		const r = canvasEl?.getBoundingClientRect();
		const origin = toCanvas((r?.left ?? 0) + 40, (r?.top ?? 0) + 40);
		const COL = NODE_W + 48;
		const ROW = 200;
		const perRow = Math.max(1, Math.floor(((r?.width ?? 800) / cam.s - 40) / COL));
		const taken = new Set(graph.nodes.map((n) => `${n.x},${n.y}`));
		for (let i = 0; i < 200; i++) {
			const x = Math.round((origin.x + (i % perRow) * COL) / GRID) * GRID;
			const y = Math.round((origin.y + Math.floor(i / perRow) * ROW) / GRID) * GRID;
			if (taken.has(`${x},${y}`)) continue;
			selectedNode.set(addNode(graph, type, x, y));
			playSound('click');
			return;
		}
	}

	/* How a socket of each role is drawn.
	
	   Shape and colour both, because either alone is ambiguous: a round amber
	   dot beside a round white one is two colours of the same thing, and shape
	   without colour asks you to compare outlines at 12px. Together they say
	   what a socket carries before you drag anything at it.
	
	     signal  round, white      ordinary sound
	     left    half-round, cyan  one side of a split pair
	     right   half-round, cyan
	     cv      diamond, amber    a control value
	     trigger square, green     a note happening
	     flow    square, purple    the logic chain's order */
	const PORT_STYLE: Record<PortRole, { cls: string; color: string }> = {
		signal: { cls: 'rounded-full', color: '#ffffff' },
		left: { cls: 'rounded-l-full', color: '#56b6c2' },
		right: { cls: 'rounded-r-full', color: '#56b6c2' },
		cv: { cls: 'rotate-45', color: '#e5c07b' },
		trigger: { cls: 'rounded-[1px]', color: '#98c379' },
		flow: { cls: 'rounded-[1px]', color: '#c678dd' }
	};

	function portStyle(p: { kind: PortKind; role?: PortRole }) {
		return PORT_STYLE[roleOf(p)];
	}

	/* Can the cable being dragged land here? Answered while dragging rather than
	   on release, so an inlet that cannot take what you are holding dims before
	   you try it instead of returning an error afterwards. */
	function canLand(p: { kind: PortKind; role?: PortRole }): boolean {
		if (!pullFrom) return false;
		return rolesCompatible(pullFrom.role, roleOf(p));
	}

	/* ENTRY's outlets are not fixed: it publishes one CV socket per lane the
	   track carries, so a curve drawn in the roll can be cabled to any knob.
	   Every other module's ports come straight from its spec. */
	function outletsOf(n: GraphNode, spec: ModuleSpec) {
		if (n.type !== 'in') return spec.outputs;
		return [
			...spec.outputs,
			...$trackLanes.map((l) => ({
				id: laneSocketId(l.id),
				label: l.name,
				kind: 'mod' as const,
				role: 'cv' as const
			}))
		];
	}

	/** A cable's path: horizontal-ish bezier, so it reads as a cable not a line. */
	function cablePath(a: { x: number; y: number }, b: { x: number; y: number }) {
		const dx = Math.max(30, Math.abs(b.x - a.x) * 0.5);
		return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
	}

	let liveEnd = $derived(pullFrom ? toCanvas(pointer.x, pointer.y) : null);
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<div class="flex-1 min-h-0 flex gap-1.5 overflow-hidden">
	<!-- The workspace. role="application" with a tabindex is what a canvas that
	     takes keys is: the rule is written for plain divs. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={canvasEl}
		data-canvas="bg"
		data-tour="synth-canvas"
		role="application"
		tabindex="-1"
		onwheel={onWheel}
		onkeydown={onKeyDown}
		onpointerdown={onPointerDown}
		oncontextmenu={(e) => e.preventDefault()}
		ondragover={(e) => {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
		}}
		ondrop={(e) => {
			e.preventDefault();
			const type = e.dataTransfer?.getData('text/plain') || dragType;
			if (!type) return;
			// Where it was dropped, snapped -- so a patch stays legible.
			const p = toCanvas(e.clientX, e.clientY);
			selectedNode.set(
				addNode(graph, type, Math.round((p.x - NODE_W / 2) / GRID) * GRID, Math.round((p.y - 40) / GRID) * GRID)
			);
			dragType = null;
			playSound('click');
		}}
		class="relative flex-1 min-w-0 overflow-hidden rounded-xs border border-white/10 bg-black/60 cursor-grab active:cursor-grabbing"
		style="background-image: radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px); background-size: {GRID *
			cam.s}px {GRID * cam.s}px; background-position: {cam.x}px {cam.y}px"
	>
		<!-- Cables sit under the modules: a cable must never cover a knob. -->
		<svg class="absolute inset-0 w-full h-full pointer-events-none" style="overflow: visible">
			<g transform="translate({cam.x} {cam.y}) scale({cam.s})">
				{#if marqueeRect}
					<rect
						x={marqueeRect.x}
						y={marqueeRect.y}
						width={marqueeRect.w}
						height={marqueeRect.h}
						fill="rgba(97,175,239,0.10)"
						stroke="#61afef"
						stroke-width="1"
						stroke-dasharray="4 3"
						vector-effect="non-scaling-stroke"
					/>
				{/if}
				{#each graph.cables as c, i (i)}
					{@const a = portPos(c.from, c.fromPort, true)}
					{@const b = portPos(c.to, c.toPort, false)}
					{@const spec = moduleSpec(graph.nodes.find((n) => n.id === c.from)?.type ?? '')}
					{@const isMod = spec?.outputs.find((p) => p.id === c.fromPort)?.kind === 'mod'}
					<path
						d={cablePath(a, b)}
						fill="none"
						stroke={isMod ? '#e5c07b' : (spec?.color ?? '#8a8a8a')}
						stroke-width={isMod ? 1.5 : 2.5}
						stroke-dasharray={isMod ? '4 3' : undefined}
						opacity="0.8"
						class="pointer-events-auto cursor-pointer"
						role="button"
						tabindex="-1"
						onclick={() => {
							removeCable(graph, i);
							playSound('click');
						}}
						onkeydown={() => {}}
					/>
				{/each}
				{#if pullFrom && liveEnd}
					<path
						d={cablePath({ x: pullFrom.x, y: pullFrom.y }, liveEnd)}
						fill="none"
						stroke="#61afef"
						stroke-width="2"
						stroke-dasharray="5 4"
						opacity="0.7"
					/>
				{/if}
			</g>
		</svg>

		<!-- Modules. -->
		<div
			class="absolute inset-0"
			style="transform: translate({cam.x}px, {cam.y}px) scale({cam.s}); transform-origin: 0 0"
		>
			{#each graph.nodes as n (n.id)}
				{@const spec = moduleSpec(n.type)}
				{#if spec}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="absolute border-2 bg-black/85 rounded-xs select-none {$selectedNodes.has(n.id)
							? 'shadow-[0_0_0_2px_#61afef,0_0_10px_rgba(97,175,239,0.5)]'
							: $selectedNode === n.id
								? 'shadow-[0_0_10px_rgba(97,175,239,0.5)]'
								: ''}"
						style="left: {n.x}px; top: {n.y}px; width: {NODE_W}px; height: {nodeHeight(n, spec)}px; border-color: {spec.color}{$selectedNode ===
						n.id
							? ''
							: '80'}"
						onpointerdown={(e) => startDrag(e, n)}
					>
						<div
							class="flex items-center justify-between px-1 border-b text-[10px] font-black cursor-grab overflow-hidden"
							style="height: {HEADER_H}px; color: {spec.color}; border-color: {spec.color}40"
						>
							<span>{spec.label}</span>
							<span class="flex items-center gap-1">
								<!-- The same glyph the palette shows, so a placed module is
								     recognisable at a glance on a crowded canvas. -->
								<ModuleIcon type={n.type} size={9} color={spec.color} />
							{#if !isFixedNode(n.id)}
							<button
								onpointerdown={(e) => {
									if (e.button !== 2) e.stopPropagation();
								}}
								onclick={() => {
									removeNode(graph, n.id, graphParams);
									playSound('click');
								}}
								class="text-[#e06c75] hover:text-white cursor-pointer leading-none"
								title={$t('synthPatch.removeHint')}>×</button
							>
							{/if}
							</span>
						</div>

						<!-- Ports: inputs down the left, outputs down the right. Positioned
						     from portOffset() against the node's own top, which is what
						     portPos() draws the cables to -- one formula, one place. -->
						<div class="absolute pointer-events-none" style="left: {-BORDER}px; top: {-BORDER}px; width: {NODE_W}px; height: {nodeHeight(n, spec)}px">
							<!-- Each socket carries its own name. Four identical dots in a
							     column cannot be told apart or aimed at, and the tooltip only
							     helped once you had already found the right one. Inlets label
							     to the right of the dot, outlets to the left, both inside the
							     card where there is room. Shape says the family: a round dot
							     is audio, a diamond is control. -->
							{#each spec.inputs as p, i (p.id)}
								{@const y = portOffset(n, spec, spec.inputs.length, i)}
								<button
									onpointerdown={(e) => {
										if (e.button !== 2) e.stopPropagation();
									}}
									onpointerup={(e) => endCable(e, n.id, p.id, p.kind)}
									title={p.label}
									class="absolute w-3 h-3 border cursor-crosshair pointer-events-auto transition-opacity {portStyle(p)
										.cls} {pullFrom && !canLand(p) ? 'opacity-25' : ''} {pullFrom && canLand(p)
										? 'scale-125 shadow-[0_0_6px_currentColor]'
										: ''}"
									style="left: {-PORT_R}px; top: {y - PORT_R}px; position: absolute; color: {portStyle(p)
										.color}; background: {roleOf(p) === 'signal' ? '#000' : portStyle(p).color}; border-color: {portStyle(p).color}"
								></button>
								<span
									class="absolute text-[7px] font-mono font-bold leading-none pointer-events-none whitespace-nowrap"
									style="left: {PORT_R + 2}px; top: {y - 3.5}px; color: {portStyle(p).color}99"
								>{p.label}</span>
							{/each}
							{#each outletsOf(n, spec) as p, i (p.id)}
								{@const y = portOffset(n, spec, outletsOf(n, spec).length, i)}
								<button
									onpointerdown={(e) => startCable(e, n.id, p.id, p.kind)}
									title={p.label}
									class="absolute w-3 h-3 border cursor-crosshair pointer-events-auto transition-opacity {portStyle(p).cls}"
									style="left: {NODE_W - PORT_R}px; top: {y - PORT_R}px; position: absolute; color: {portStyle(p)
										.color}; background: {portStyle(p).color}; border-color: {portStyle(p).color}"
								></button>
								<span
									class="absolute text-[7px] font-mono font-bold leading-none pointer-events-none whitespace-nowrap text-right"
									style="right: {PORT_R + 2}px; top: {y - 3.5}px; color: {portStyle(p).color}99"
								>{p.label}</span>
							{/each}
						</div>
						<div use:measure={n.id}>
						<ModuleCard
							{spec}
							nodeId={n.id}
							params={graphParams}
							onParam={(key, value) => setGraphParam(graphParams, n.id, key, value)}
							onReset={() => {}}
						/>
						</div>
					</div>
				{/if}
			{/each}
		</div>

		{#if message}
			<div class="absolute bottom-1 left-1 text-[10px] text-[#e06c75] bg-black/80 px-1.5 py-0.5 rounded-xs">
				{message}
			</div>
		{/if}
		{#if !graph.nodes.length}
			<div class="absolute inset-0 flex items-center justify-center text-[11px] text-white/30 pointer-events-none">
				{$t('synthPatch.emptyCanvas')}
			</div>
		{/if}
	</div>

	<!-- The palette, on the right like LIFE.LAB's library. -->
	<!-- Two columns: thirty modules in one column ran past the height of the
	     canvas beside it, so most of the palette was below the fold. -->
	<div data-tour="synth-palette" class="shrink-0 flex flex-col gap-1 {paletteOpen ? 'w-[168px]' : 'w-6'} transition-all">
		<button
			onclick={() => (paletteOpen = !paletteOpen)}
			class="press text-[9px] text-white/40 hover:text-white border border-white/15 rounded-xs py-0.5 cursor-pointer"
			>{paletteOpen ? '▶' : '◀'}</button
		>
		{#if paletteOpen}
			<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5 pr-0.5">
				{#each MODULE_GROUPS as g (g)}
					{@const mods = PALETTE_SPECS.filter((m) => m.group === g)}
					{#if mods.length}
						<div>
							<div class="text-[8px] uppercase tracking-wider text-white/30 border-b border-white/10 pb-0.5 mb-1">
								{g}
							</div>
							<div class="grid grid-cols-2 gap-0.5">
								{#each mods as m (m.id)}
									<!-- Draggable as well as clickable: dragging says where it goes,
									     clicking is the shortcut when you do not care yet. -->
									<button
										draggable="true"
										ondragstart={(e) => {
											e.dataTransfer?.setData('text/plain', m.id);
											dragType = m.id;
										}}
										ondragend={() => (dragType = null)}
										onclick={() => place(m.id)}
										title={$t(m.descKey)}
										class="press w-full px-1.5 py-0.5 border rounded-xs text-[10px] font-black cursor-grab active:cursor-grabbing bg-black/40 hover:bg-white/10 flex items-center justify-between gap-1"
										style="border-color: {m.color}55; color: {m.color}"
									>
										<!-- Name left, glyph right: the eye scans the column of names
										     and the icons line up as a second column of shapes. -->
										<span class="truncate">{m.label}</span>
										<ModuleIcon type={m.id} />
									</button>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
</div>
