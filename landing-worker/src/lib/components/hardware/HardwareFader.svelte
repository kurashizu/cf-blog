<script lang="ts">
	import { playSound } from '../../sound';
	import { draggable } from './draggable';
	import { PARAM_DESCRIPTIONS } from './param-descriptions';

	let {
		label,
		value,
		min,
		max,
		step = 0.01,
		unit = '',
		color = '#e5c07b',
		height = 44,
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
		height?: number;
		description?: string;
		onChange: (val: number) => void;
	} = $props();

	let isDragging = $state(false);
	let trackEl: HTMLDivElement | undefined = $state();

	let pct = $derived(Math.max(0, Math.min(1, (value - min) / (max - min))));

	function formatDisplay(v: number): string {
		if (unit === 'ms') return `${Math.round(v * 1000)}ms`;
		if (v <= 1 && max <= 1) return `${Math.round(v * 100)}%`;
		if (Number.isInteger(v)) return `${v}`;
		return v.toFixed(2);
	}

	let desc = $derived(description || PARAM_DESCRIPTIONS[label.toUpperCase()] || '');
	let tooltipText = $derived(
		`${label}${desc ? ` (${desc})` : ''}: ${formatDisplay(value)}${unit && unit !== 'ms' ? unit : ''} — Click, drag up/down, or scroll wheel`
	);

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const dir = e.deltaY < 0 ? 1 : -1;
		const delta = (max - min) * 0.05 * dir;
		const stepped = Math.round((value + delta) / step) * step;
		onChange(Math.max(min, Math.min(max, stepped)));
		playSound('click');
	}
</script>

<div
	onwheel={handleWheel}
	class="flex flex-col items-center select-none font-mono cursor-ns-resize group shrink-0 min-w-0 leading-none h-full justify-between py-0.5"
	title={tooltipText}
>
	<span class="text-xs opacity-85 uppercase font-black block group-hover:text-white transition-colors leading-none">{label}</span>

	<div
		bind:this={trackEl}
		use:draggable={{
			mode: 'absolute-y',
			min,
			max,
			step,
			getValue: () => value,
			onChange,
			onDragStart: () => {
				isDragging = true;
				playSound('click');
			},
			onDragEnd: () => (isDragging = false)
		}}
		style="height: {height}px"
		class="w-4 bg-black/80 border rounded-xs relative cursor-ns-resize flex items-center justify-center p-0.5 transition-colors {isDragging
			? 'border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'
			: 'border-white/30 hover:border-white/70'}"
	>
		<div class="w-0.5 h-full bg-white/20 rounded-full pointer-events-none"></div>
		<div class="absolute bottom-0 left-0.5 right-0.5 rounded-xs pointer-events-none opacity-30" style="height: {pct * 100}%; background-color: {color};"></div>
		<div
			class="absolute w-3 h-2 rounded-xs border border-white/80 shadow-sm flex items-center justify-center pointer-events-none {isDragging ? 'shadow-[0_0_8px_#fff] brightness-125' : ''}"
			style="bottom: calc({pct * 100}% - 4px); background-color: {color}; box-shadow: {isDragging ? `0 0 8px ${color}` : `0 0 4px ${color}88`};"
		>
			<div class="w-1.5 h-0.5 bg-black/90 rounded-full"></div>
		</div>
	</div>

	<span class="text-[10px] sm:text-xs font-black text-center truncate max-w-[42px] leading-none" style="color: {color}">{formatDisplay(value)}</span>
</div>
