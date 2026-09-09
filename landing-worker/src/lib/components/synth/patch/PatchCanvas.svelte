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
		type GraphNode,
		type PortKind
	} from '../../../stores/synth-graph';
	import { MODULE_SPECS, MODULE_GROUPS, moduleSpec, type ModuleSpec } from '../../../stores/synth-modules';
	import ModuleCard from './ModuleCard.svelte';

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
	const VIZ_H: Record<string, number> = { adsr: 58, wave: 26, curve: 26 };

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
		return 2 * BORDER + HEADER_H + bodyOf(node, spec);
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

	/** The centre of port i, measured from the node's border-box top-left. */
	function portOffset(node: GraphNode, spec: ModuleSpec, count: number, i: number) {
		return BORDER + HEADER_H + (bodyOf(node, spec) / (count + 1)) * (i + 1);
	}

	/** Drag state: a module being moved, or a cable being pulled. */
	let dragNode = $state<{ id: string; dx: number; dy: number } | null>(null);
	let pullFrom = $state<{ node: string; port: string; kind: PortKind; x: number; y: number } | null>(null);
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
		const list = isOutput ? (spec?.outputs ?? []) : (spec?.inputs ?? []);
		const i = Math.max(0, list.findIndex((p) => p.id === port));
		if (!spec) return { x: 0, y: 0 };
		return {
			// The dots straddle the border, so their centres land on the node's
			// two vertical edges -- a cable meets the socket, not the wall.
			x: n.x + (isOutput ? NODE_W : 0),
			y: n.y + portOffset(n, spec, list.length, i)
		};
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
			panning = { x: e.clientX - cam.x, y: e.clientY - cam.y };
			selectedNode.set(null);
		}
	}

	function onPointerMove(e: PointerEvent) {
		pointer = { x: e.clientX, y: e.clientY };
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
		panning = null;
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
	}

	function startCable(e: PointerEvent, nodeId: string, port: string, kind: PortKind) {
		if (e.button === 2) return;
		e.stopPropagation();
		const p = portPos(nodeId, port, true);
		pullFrom = { node: nodeId, port, kind, x: p.x, y: p.y };
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

	/** A cable's path: horizontal-ish bezier, so it reads as a cable not a line. */
	function cablePath(a: { x: number; y: number }, b: { x: number; y: number }) {
		const dx = Math.max(30, Math.abs(b.x - a.x) * 0.5);
		return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
	}

	let liveEnd = $derived(pullFrom ? toCanvas(pointer.x, pointer.y) : null);
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<div class="flex-1 min-h-0 flex gap-1.5 overflow-hidden">
	<!-- The workspace. -->
	<div
		bind:this={canvasEl}
		data-canvas="bg"
		data-tour="synth-canvas"
		role="application"
		tabindex="-1"
		onwheel={onWheel}
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
						class="absolute border-2 bg-black/85 rounded-xs select-none {$selectedNode === n.id
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
						</div>

						<!-- Ports: inputs down the left, outputs down the right. Positioned
						     from portOffset() against the node's own top, which is what
						     portPos() draws the cables to -- one formula, one place. -->
						<div class="absolute pointer-events-none" style="left: {-BORDER}px; top: {-BORDER}px; width: {NODE_W}px; height: {nodeHeight(n, spec)}px">
							{#each spec.inputs as p, i (p.id)}
								<button
									onpointerdown={(e) => {
										if (e.button !== 2) e.stopPropagation();
									}}
									onpointerup={(e) => endCable(e, n.id, p.id, p.kind)}
									title={p.label}
									class="absolute w-3 h-3 rounded-full border cursor-crosshair pointer-events-auto {p.kind === 'mod'
										? 'bg-[#e5c07b] border-[#e5c07b]'
										: 'bg-black border-white/60'}"
									style="left: {-PORT_R}px; top: {portOffset(n, spec, spec.inputs.length, i) - PORT_R}px; position: absolute"
								></button>
							{/each}
							{#each spec.outputs as p, i (p.id)}
								<button
									onpointerdown={(e) => startCable(e, n.id, p.id, p.kind)}
									title={p.label}
									class="absolute w-3 h-3 rounded-full border cursor-crosshair pointer-events-auto {p.kind === 'mod'
										? 'bg-[#e5c07b] border-[#e5c07b]'
										: 'bg-white/80 border-white'}"
									style="left: {NODE_W - PORT_R}px; top: {portOffset(n, spec, spec.outputs.length, i) - PORT_R}px; position: absolute"
								></button>
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
	<div data-tour="synth-palette" class="shrink-0 flex flex-col gap-1 {paletteOpen ? 'w-[112px]' : 'w-6'} transition-all">
		<button
			onclick={() => (paletteOpen = !paletteOpen)}
			class="press text-[9px] text-white/40 hover:text-white border border-white/15 rounded-xs py-0.5 cursor-pointer"
			>{paletteOpen ? '▶' : '◀'}</button
		>
		{#if paletteOpen}
			<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5 pr-0.5">
				{#each MODULE_GROUPS as g (g)}
					{@const mods = MODULE_SPECS.filter((m) => m.group === g)}
					{#if mods.length}
						<div>
							<div class="text-[8px] uppercase tracking-wider text-white/30 border-b border-white/10 pb-0.5 mb-1">
								{g}
							</div>
							<div class="space-y-0.5">
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
										class="press w-full text-left px-1.5 py-0.5 border rounded-xs text-[10px] font-black cursor-grab active:cursor-grabbing bg-black/40 hover:bg-white/10"
										style="border-color: {m.color}55; color: {m.color}">{m.label}</button
									>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
</div>
