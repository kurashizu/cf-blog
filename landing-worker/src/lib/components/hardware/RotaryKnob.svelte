<script lang="ts">
	import { playSound } from '../../sound';
	import { draggable } from './draggable';
	import { PARAM_DESCRIPTIONS } from './param-descriptions';

	let {
		label,
		value,
		min,
		max,
		step = 1,
		unit = '',
		color = '#56b6c2',
		size = 26,
		description,
		onChange
	}: {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		unit?: string;
		color?: string;
		size?: number;
		description?: string;
		onChange: (val: number) => void;
	} = $props();

	let isDragging = $state(false);

	let pct = $derived(Math.max(0, Math.min(1, (value - min) / (max - min))));
	let angle = $derived(-135 + pct * 270);

	function formatDisplay(v: number): string {
		if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
		if (Number.isInteger(v)) return `${v}`;
		return v.toFixed(1);
	}

	let desc = $derived(description || PARAM_DESCRIPTIONS[label.toUpperCase()] || '');
	let tooltipText = $derived(
		`${label}${desc ? ` (${desc})` : ''}: ${formatDisplay(value)}${unit} — Drag up/down or scroll wheel to adjust`
	);

	// SVG arc calculation
	const r = 40;
	const cx = 50;
	const cy = 50;
	const startRad = (-135 * Math.PI) / 180;
	let currentRad = $derived((angle * Math.PI) / 180);
	const x0 = cx + r * Math.sin(startRad);
	const y0 = cy - r * Math.cos(startRad);
	let x1 = $derived(cx + r * Math.sin(currentRad));
	let y1 = $derived(cy - r * Math.cos(currentRad));
	let largeArc = $derived(pct > 0.666 ? 1 : 0);
	let arcPath = $derived(
		pct > 0.005 ? `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}` : ''
	);

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const dir = e.deltaY < 0 ? 1 : -1;
		// At least one step, or the rounding below lands back on the current value
		// and the knob cannot be turned at all — which is what happened to RATIO,
		// whose 0.5 step is larger than 5% of its 0.5-4 range.
		const magnitude = Math.max(step, (max - min) * 0.05);
		const stepped = Math.round((value + magnitude * dir) / step) * step;
		// Re-round to the step's own precision so repeated turns cannot drift.
		const decimals = (String(step).split('.')[1] ?? '').length;
		const snapped = Number(stepped.toFixed(decimals));
		const next = Math.max(min, Math.min(max, snapped));
		if (next === value) return;
		onChange(next);
		playSound('click');
	}
</script>

<div
	onwheel={handleWheel}
	class="flex flex-col items-center select-none group cursor-ns-resize shrink-0 min-w-0 leading-none"
	title={tooltipText}
>
	<div
		use:draggable={{
			mode: 'relative',
			min,
			max,
			step,
			getValue: () => value,
			onChange,
			onDragStart: () => (isDragging = true),
			onDragEnd: () => (isDragging = false)
		}}
		style="width: {size}px; height: {size}px"
		class="relative rounded-full transition-transform active:scale-95 {isDragging ? 'shadow-[0_0_8px_rgba(255,255,255,0.4)]' : ''}"
	>
		<svg viewBox="0 0 100 100" class="w-full h-full overflow-visible select-none pointer-events-none">
			<circle cx="50" cy="50" r="46" fill="#12151a" stroke="rgba(255,255,255,0.25)" stroke-width="3" class="group-hover:stroke-white/60 transition-colors" />
			<path d="M 21.72 78.28 A 40 40 0 1 1 78.28 78.28" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="4" stroke-linecap="round" />
			{#if arcPath}
				<path d={arcPath} fill="none" stroke={color} stroke-width="4.5" stroke-linecap="round" style="filter: drop-shadow(0 0 3px {color}88)" />
			{/if}
			<g transform="rotate({angle} 50 50)">
				<line x1="50" y1="14" x2="50" y2="34" stroke={color} stroke-width="7" stroke-linecap="round" style="filter: drop-shadow(0 0 4px {color})" />
				<circle cx="50" cy="16" r="2" fill="#ffffff" />
			</g>
			<circle cx="50" cy="50" r="16" fill="#1a1e24" stroke="rgba(255,255,255,0.2)" stroke-width="2" />
			<circle cx="50" cy="50" r="5" fill="rgba(255,255,255,0.35)" />
		</svg>
	</div>

	<div class="text-center mt-1 leading-none w-full h-3 flex items-center justify-center">
		{#if isDragging}
			<span class="text-xs font-black font-mono truncate leading-none" style="color: {color}">{formatDisplay(value)}{unit}</span>
		{:else}
			<span class="text-xs opacity-85 uppercase font-mono font-bold group-hover:hidden truncate leading-none">{label}</span>
			<span class="hidden group-hover:block text-xs font-black font-mono truncate leading-none" style="color: {color}">{formatDisplay(value)}{unit}</span>
		{/if}
	</div>
</div>
