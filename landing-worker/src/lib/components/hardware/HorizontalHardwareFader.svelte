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
		color = '#98c379',
		width = 60,
		showValue = false,
		bipolar = false,
		description,
		onChange
	}: {
		label?: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		unit?: string;
		color?: string;
		width?: number | string;
		showValue?: boolean;
		bipolar?: boolean;
		description?: string;
		onChange: (val: number) => void;
	} = $props();

	let isDragging = $state(false);
	let trackEl: HTMLDivElement | undefined = $state();

	let pct = $derived(Math.max(0, Math.min(1, (value - min) / (max - min))));

	function formatDisplay(v: number): string {
		if (bipolar && v > 0) return `+${v}${unit}`;
		return `${v}${unit}`;
	}

	let desc = $derived(description || (label ? PARAM_DESCRIPTIONS[label.toUpperCase()] : '') || '');
	let tooltipText = $derived(
		`${label ? `${label}${desc ? ` (${desc})` : ''}: ` : ''}${formatDisplay(value)}${unit} — Click, drag left/right, or scroll wheel`
	);

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const dir = e.deltaY < 0 ? 1 : -1;
		const delta = (max - min) * 0.05 * dir;
		const stepped = Math.round((value + delta) / step) * step;
		onChange(Math.max(min, Math.min(max, stepped)));
		playSound('click');
	}

	let widthStyle = $derived(typeof width === 'number' ? `${width}px` : width);
</script>

<div
	onwheel={handleWheel}
	class="flex items-center gap-1.5 select-none font-mono cursor-ew-resize group shrink-0 min-w-0 leading-none"
	title={tooltipText}
>
	{#if label}
		<span class="text-xs opacity-85 uppercase font-bold group-hover:text-white transition-colors">{label}</span>
	{/if}

	<div
		bind:this={trackEl}
		use:draggable={{
			mode: 'absolute-x',
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
		style="width: {widthStyle}"
		class="h-3.5 bg-black/80 border rounded-xs relative cursor-ew-resize flex items-center justify-center p-0.5 transition-colors {isDragging
			? 'border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'
			: 'border-white/30 hover:border-white/70'}"
	>
		<div class="h-0.5 w-full bg-white/20 rounded-full pointer-events-none"></div>

		{#if bipolar}
			<div
				class="absolute top-0.5 bottom-0.5 rounded-xs pointer-events-none opacity-30"
				style="left: {value >= 0 ? '50%' : `${pct * 100}%`}; width: {Math.abs(pct - 0.5) * 100}%; background-color: {color};"
			></div>
		{:else}
			<div class="absolute top-0.5 bottom-0.5 left-0.5 rounded-xs pointer-events-none opacity-30" style="width: {pct * 100}%; background-color: {color};"></div>
		{/if}

		{#if bipolar}
			<div class="absolute top-0.5 bottom-0.5 left-1/2 w-0.5 bg-white/30 pointer-events-none"></div>
		{/if}

		<div
			class="absolute h-2.5 w-2 rounded-xs border border-white/80 shadow-sm flex items-center justify-center pointer-events-none {isDragging ? 'shadow-[0_0_8px_#fff] brightness-125' : ''}"
			style="left: calc({pct * 100}% - 4px); background-color: {color}; box-shadow: {isDragging ? `0 0 8px ${color}` : `0 0 4px ${color}88`};"
		>
			<div class="h-1.5 w-0.5 bg-black/90 rounded-full"></div>
		</div>
	</div>

	{#if showValue}
		<span class="text-xs font-black text-right min-w-[28px]" style="color: {color}">{formatDisplay(value)}</span>
	{/if}
</div>
