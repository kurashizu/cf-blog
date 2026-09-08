<script lang="ts">
	/**
	 * The workbench's dropdown, shaped like the synth's LOAD menu.
	 *
	 * Native <select> popups are drawn by the OS, so they arrive with system
	 * fonts, system blue and rounded corners that belong to nothing else on the
	 * page. Everywhere a list needs picking from, this is used instead.
	 */
	import { Menu, MenuItem } from '$lib/components/ui';
	import { t } from '$lib/i18n';
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
		placeholder,
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
		close();
		if (option.value === value) return;
		value = option.value;
		onchange?.(option.value);
	}

	let trigger = $state<HTMLButtonElement | null>(null);
	/* The menu takes focus while open; give it back to the button on close so
	   a keyboard user is where they were, not at the top of the document. */
	function close() {
		open = false;
		trigger?.focus({ preventScroll: true });
	}
</script>

<div class="relative shrink-0" style="max-width: {width}">
	<button
		type="button"
		bind:this={trigger}
		{title}
		{disabled}
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={() => (open ? close() : (open = true))}
		class="press w-full px-2 py-1 border rounded-xs font-mono text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed {open
			? 'bg-white/10'
			: 'hover:bg-white/5'}"
		style="border-color: {open ? color : `${color}66`}; color: {color}; width: {width}"
	>
		<span class="truncate">{selected?.label ?? placeholder ?? $t('chrome.dropdown.placeholder')}</span>
		<span class="text-[9px] leading-none opacity-70 inline-block transition-transform duration-150" style={open ? 'transform: rotate(180deg)' : undefined}>▼</span>
	</button>

	{#if open && !disabled}
		<Menu
			onClose={close}
			{color}
			label={title}
			class="absolute left-0 top-full mt-1 z-50 max-h-[42vh] overflow-y-auto custom-scrollbar origin-top"
			style="min-width: {width}"
		>
			<!-- Keyed by position: device lists hand back empty deviceIds before a
			     permission grant, so values are not unique until then. -->
			{#each options as option, i (i)}
				<MenuItem checked={option.value === value} note={option.note} {color} onclick={() => pick(option)}>
					{option.label}
				</MenuItem>
			{/each}
		</Menu>
	{/if}
</div>
