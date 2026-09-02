<script lang="ts">
	/**
	 * The workbench's dropdown, shaped like the synth's LOAD menu.
	 *
	 * Native <select> popups are drawn by the OS, so they arrive with system
	 * fonts, system blue and rounded corners that belong to nothing else on the
	 * page. Everywhere a list needs picking from, this is used instead.
	 */
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	export interface Option {
		value: string;
		label: string;
		/** Right-aligned annotation, like the synth menu's bpm/meter column. */
		note?: string;
	}

	let {
		value = $bindable(),
		options,
		color = '#56b6c2',
		placeholder = 'select…',
		title,
		disabled = false,
		width = '260px',
		onchange
	}: {
		value: string;
		options: Option[];
		color?: string;
		placeholder?: string;
		title?: string;
		disabled?: boolean;
		width?: string;
		onchange?: (value: string) => void;
	} = $props();

	let open = $state(false);

	let selected = $derived(options.find((o) => o.value === value));

	function pick(option: Option) {
		open = false;
		if (option.value === value) return;
		value = option.value;
		onchange?.(option.value);
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.stopPropagation();
			open = false;
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="relative shrink-0" style="max-width: {width}">
	<button
		type="button"
		{title}
		{disabled}
		onclick={() => (open = !open)}
		class="press w-full px-2 py-1 border rounded-xs font-mono text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed {open
			? 'bg-white/10'
			: 'hover:bg-white/5'}"
		style="border-color: {open ? color : `${color}66`}; color: {color}; width: {width}"
	>
		<span class="truncate">{selected?.label ?? placeholder}</span>
		<span class="text-[9px] leading-none opacity-70 inline-block transition-transform duration-150" style={open ? 'transform: rotate(180deg)' : undefined}>▼</span>
	</button>

	{#if open && !disabled}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-40" onclick={() => (open = false)}></div>

		<div
			class="absolute left-0 top-full mt-1 z-50 max-h-[42vh] overflow-y-auto custom-scrollbar bg-[#121417] border rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] py-1 text-xs font-mono origin-top"
			style="border-color: {color}80; min-width: {width}"
			transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
		>
			<!-- Keyed by position: device lists hand back empty deviceIds before a
			     permission grant, so values are not unique until then. -->
			{#each options as option, i (i)}
				<button
					type="button"
					onclick={() => pick(option)}
					class="w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors {option.value ===
					value
						? 'text-white bg-white/10 font-bold'
						: 'text-white/80 hover:bg-white/10'}"
				>
					<span class="flex items-center gap-2 min-w-0">
						<span class="shrink-0" style="color: {option.value === value ? color : 'rgba(255,255,255,0.2)'}">
							{option.value === value ? '●' : '○'}
						</span>
						<span class="truncate">{option.label}</span>
					</span>
					{#if option.note}
						<span class="shrink-0 text-[10px] text-white/40">{option.note}</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
