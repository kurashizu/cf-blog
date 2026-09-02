<script lang="ts">
	import { onMount } from 'svelte';

	interface Pt {
		id: number;
		type: string;
		x: number;
		y: number;
		pressure: number;
		tangential: number;
		tiltX: number;
		tiltY: number;
		twist: number;
		width: number;
		height: number;
		isPrimary: boolean;
	}

	const COLORS = ['#56b6c2', '#e06c75', '#98c379', '#e5c07b', '#c678dd', '#61afef', '#d19a66', '#56b6c2', '#e06c75', '#98c379'];

	let pointers = $state<Pt[]>([]);
	let maxSeen = $state(0);
	let anyPressure = $state(false);
	let anyTilt = $state(false);
	let surface: HTMLDivElement | undefined = $state();

	const active = new Map<number, Pt>();

	function sync() {
		pointers = [...active.values()];
		if (pointers.length > maxSeen) maxSeen = pointers.length;
	}

	function toPt(e: PointerEvent): Pt {
		const rect = surface!.getBoundingClientRect();
		// Mouse events report a flat 0.5 while a button is down; only a real
		// pressure-sensitive device reports anything else.
		if (e.pressure !== 0 && e.pressure !== 0.5 && e.pressure !== 1) anyPressure = true;
		if (e.tiltX !== 0 || e.tiltY !== 0) anyTilt = true;
		return {
			id: e.pointerId,
			type: e.pointerType,
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
			pressure: e.pressure,
			tangential: e.tangentialPressure,
			tiltX: e.tiltX,
			tiltY: e.tiltY,
			twist: e.twist,
			width: e.width,
			height: e.height,
			isPrimary: e.isPrimary
		};
	}

	function onDown(e: PointerEvent) {
		e.preventDefault();
		surface?.setPointerCapture(e.pointerId);
		active.set(e.pointerId, toPt(e));
		sync();
	}

	function onMove(e: PointerEvent) {
		if (!active.has(e.pointerId)) {
			// Hovering pen/mouse still carries tilt and pressure worth showing.
			if (e.pointerType === 'mouse' && e.buttons === 0) return;
		}
		if (active.has(e.pointerId)) {
			active.set(e.pointerId, toPt(e));
			sync();
		}
	}

	function onUp(e: PointerEvent) {
		active.delete(e.pointerId);
		sync();
	}

	function reset() {
		active.clear();
		maxSeen = 0;
		anyPressure = false;
		anyTilt = false;
		sync();
	}

	onMount(() => () => active.clear());
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-mono">
		<span class="text-white/45">
			MAX TOUCH POINTS <span class="text-[#e5c07b]">{navigator.maxTouchPoints}</span>
			<span class="text-white/30">(reported)</span>
		</span>
		<span class="text-white/45">CONCURRENT SEEN <span class="text-[#98c379]">{maxSeen}</span></span>
		<span class="text-white/45">
			PRESSURE <span class="transition-colors {anyPressure ? 'text-[#98c379]' : 'text-white/35'}">{anyPressure ? 'variable — real sensor' : 'not observed'}</span>
		</span>
		<span class="text-white/45">
			TILT <span class="transition-colors {anyTilt ? 'text-[#98c379]' : 'text-white/35'}">{anyTilt ? 'reported' : 'not observed'}</span>
		</span>
		<button
			onclick={reset}
			class="press px-2 py-1 border border-white/25 text-white/70 rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10 transition-colors"
		>
			RESET
		</button>
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={surface}
		onpointerdown={onDown}
		onpointermove={onMove}
		onpointerup={onUp}
		onpointercancel={onUp}
		onpointerleave={onUp}
		class="relative w-full h-56 sm:h-72 border border-white/20 bg-black/50 rounded-xs overflow-hidden touch-none select-none cursor-crosshair"
	>
		{#if pointers.length === 0}
			<div class="absolute inset-0 flex items-center justify-center text-xs font-mono text-white/30 text-center px-4">
				Touch, click or draw here — every active pointer is drawn with its real
				pressure, contact size and tilt.
			</div>
		{/if}

		{#each pointers as p (p.id)}
			{@const color = COLORS[p.id % COLORS.length]}
			{@const r = Math.max(14, Math.max(p.width, p.height) / 2 || 14) * (0.6 + p.pressure)}
			<div
				class="absolute rounded-full border-2 pointer-events-none flex items-center justify-center"
				style="left: {p.x - r}px; top: {p.y - r}px; width: {r * 2}px; height: {r * 2}px; border-color: {color}; background: {color}22;"
			>
				<span class="text-[10px] font-mono font-bold" style="color: {color}">{p.id}</span>
			</div>
			<div
				class="absolute w-px pointer-events-none"
				style="left: {p.x}px; top: 0; height: 100%; background: {color}33;"
			></div>
			<div
				class="absolute h-px pointer-events-none"
				style="top: {p.y}px; left: 0; width: 100%; background: {color}33;"
			></div>
		{/each}
	</div>

	{#if pointers.length}
		<div class="border border-white/15 bg-black/40 rounded-xs overflow-x-auto">
			<table class="w-full text-xs font-mono">
				<thead>
					<tr class="text-white/40 text-[10px] uppercase border-b border-white/10">
						<th class="text-left px-2 py-1">id</th>
						<th class="text-left px-2 py-1">type</th>
						<th class="text-right px-2 py-1">pressure</th>
						<th class="text-right px-2 py-1">tangential</th>
						<th class="text-right px-2 py-1">tilt x/y</th>
						<th class="text-right px-2 py-1">twist</th>
						<th class="text-right px-2 py-1">contact</th>
						<th class="text-right px-2 py-1">primary</th>
					</tr>
				</thead>
				<tbody>
					{#each pointers as p (p.id)}
						<tr class="border-b border-white/5 last:border-0">
							<td class="px-2 py-1" style="color: {COLORS[p.id % COLORS.length]}">{p.id}</td>
							<td class="px-2 py-1 text-white/70">{p.type}</td>
							<td class="px-2 py-1 text-right text-[#98c379]">{p.pressure.toFixed(3)}</td>
							<td class="px-2 py-1 text-right text-white/60">{p.tangential.toFixed(3)}</td>
							<td class="px-2 py-1 text-right text-white/60">{p.tiltX}° / {p.tiltY}°</td>
							<td class="px-2 py-1 text-right text-white/60">{p.twist}°</td>
							<td class="px-2 py-1 text-right text-white/60">{p.width}×{p.height}</td>
							<td class="px-2 py-1 text-right text-white/60">{p.isPrimary ? 'yes' : 'no'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
