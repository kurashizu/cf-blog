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
		selectedNode,
		GRAPH_IN,
		GRAPH_OUT,
		type GraphNode,
		type PortKind
	} from '../../../stores/synth-graph';
	import { MODULE_SPECS, MODULE_GROUPS, moduleSpec } from '../../../stores/synth-modules';

	let graph = $derived(graphOf($currentTrack));

	/** Camera: pan in px, scale about the pointer. Same shape LIFE.LAB uses. */
	let cam = $state({ x: 40, y: 40, s: 1 });
	let canvasEl = $state<HTMLDivElement | undefined>();

	const GRID = 16;
	const NODE_W = 118;
	const NODE_H = 74;

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
		if (nodeId === GRAPH_IN) return { x: 0, y: 120 };
		if (nodeId === GRAPH_OUT) return { x: 520, y: 120 };
		const n = graph.nodes.find((m) => m.id === nodeId);
		if (!n) return { x: 0, y: 0 };
		const spec = moduleSpec(n.type);
		const list = isOutput ? (spec?.outputs ?? []) : (spec?.inputs ?? []);
		const i = Math.max(0, list.findIndex((p) => p.id === port));
		const step = NODE_H / (list.length + 1);
		return { x: n.x + (isOutput ? NODE_W : 0), y: n.y + step * (i + 1) };
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
		e.stopPropagation();
		const p = toCanvas(e.clientX, e.clientY);
		dragNode = { id: n.id, dx: p.x - n.x, dy: p.y - n.y };
		selectedNode.set(n.id);
	}

	function startCable(e: PointerEvent, nodeId: string, port: string, kind: PortKind) {
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
		// Drop new modules into open space near the middle of the view.
		const p = toCanvas(
			(canvasEl?.getBoundingClientRect().left ?? 0) + 220,
			(canvasEl?.getBoundingClientRect().top ?? 0) + 120
		);
		const x = Math.round((p.x + graph.nodes.length * 12) / GRID) * GRID;
		const y = Math.round((p.y + (graph.nodes.length % 3) * 90) / GRID) * GRID;
		selectedNode.set(addNode(graph, type, x, y));
		playSound('click');
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
				addNode(graph, type, Math.round((p.x - NODE_W / 2) / GRID) * GRID, Math.round((p.y - NODE_H / 2) / GRID) * GRID)
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
						style="left: {n.x}px; top: {n.y}px; width: {NODE_W}px; min-height: {NODE_H}px; border-color: {spec.color}{$selectedNode ===
						n.id
							? ''
							: '80'}"
						onpointerdown={(e) => startDrag(e, n)}
					>
						<div
							class="flex items-center justify-between px-1 py-0.5 border-b text-[10px] font-black cursor-grab"
							style="color: {spec.color}; border-color: {spec.color}40"
						>
							<span>{spec.label}</span>
							<button
								onpointerdown={(e) => e.stopPropagation()}
								onclick={() => {
									removeNode(graph, n.id);
									playSound('click');
								}}
								class="text-[#e06c75] hover:text-white cursor-pointer leading-none"
								title={$t('synthPatch.removeHint')}>×</button
							>
						</div>

						<!-- Ports: inputs down the left, outputs down the right. -->
						<div class="relative" style="height: {NODE_H - 18}px">
							{#each spec.inputs as p, i (p.id)}
								<button
									onpointerdown={(e) => e.stopPropagation()}
									onpointerup={(e) => endCable(e, n.id, p.id, p.kind)}
									title={p.label}
									class="absolute -left-1.5 w-3 h-3 rounded-full border cursor-crosshair {p.kind === 'mod'
										? 'bg-[#e5c07b] border-[#e5c07b]'
										: 'bg-black border-white/60'}"
									style="top: {((NODE_H - 18) / (spec.inputs.length + 1)) * (i + 1) - 6}px"
								></button>
							{/each}
							{#each spec.outputs as p, i (p.id)}
								<button
									onpointerdown={(e) => startCable(e, n.id, p.id, p.kind)}
									title={p.label}
									class="absolute -right-1.5 w-3 h-3 rounded-full border cursor-crosshair {p.kind === 'mod'
										? 'bg-[#e5c07b] border-[#e5c07b]'
										: 'bg-white/80 border-white'}"
									style="top: {((NODE_H - 18) / (spec.outputs.length + 1)) * (i + 1) - 6}px"
								></button>
							{/each}
							<div class="absolute inset-0 flex items-center justify-center text-[8px] text-white/25 pointer-events-none">
								{spec.params.length}
								{$t('synthPatch.paramCount')}
							</div>
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
