<script lang="ts">
	/**
	 * A choice, picked from a list rather than from a row of buttons.
	 *
	 * The same trigger and flyout the wave menu uses, for the selectors that are
	 * not waves. A segmented row sets the card's width from the number of
	 * options -- CONST's five made the widest card in the catalogue, and PITCH
	 * still lost its last two letters to the cell it was given. One button is
	 * one width whatever the list holds, and the name has room to be read.
	 */
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { playSound } from '../../../sound';

	let {
		label,
		value,
		choices,
		color,
		onPick
	}: {
		label: string;
		/** Index into `choices`. */
		value: number;
		choices: string[];
		color: string;
		onPick: (index: number) => void;
	} = $props();

	let open = $state(false);
	let trigger = $state<HTMLButtonElement | null>(null);
	let anchor = $state({ left: 0, top: 0 });

	/* Moved to <body> and placed with fixed coordinates, so the menu is not
	   clipped by the card's overflow and does not inherit the canvas transform:
	   a zoomed patch would otherwise draw the list at the zoom, off its own
	   trigger. */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	let shown = $derived(choices[value] ?? choices[0] ?? '');

	function toggle() {
		open = !open;
		if (open && trigger) {
			const r = trigger.getBoundingClientRect();
			anchor = { left: r.left, top: r.bottom + 4 };
		}
		playSound('click');
	}

	function pick(i: number) {
		onPick(i);
		open = false;
		playSound('click');
	}
</script>

<div class="relative">
	<button
		bind:this={trigger}
		onpointerdown={(e) => {
			if (e.button !== 2) e.stopPropagation();
		}}
		onclick={toggle}
		title={label}
		class="press w-full px-1.5 py-0.5 border rounded-xs font-black transition-colors cursor-pointer text-[10px] flex items-center justify-between gap-1 {open
			? 'text-black'
			: 'bg-white/5 hover:bg-white/15 text-white'}"
		style={open
			? `background: ${color}; border-color: ${color}`
			: `border-color: color-mix(in srgb, ${color} 55%, transparent)`}
	>
		<span class="truncate" style={open ? '' : `color: ${color}`}>{shown}</span>
		<span
			class="text-[8px] leading-none inline-block transition-transform duration-150"
			style={open ? 'transform: rotate(180deg)' : undefined}>▼</span
		>
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div use:portal class="fixed inset-0 z-[120]" onclick={() => (open = false)}></div>

		<div
			use:portal
			style="left: {anchor.left}px; top: {anchor.top}px"
			class="origin-top fixed z-[130] min-w-[110px] bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_8px_24px_rgba(0,0,0,0.7)] py-1 text-xs font-mono"
			transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
		>
			<div
				class="px-2.5 pt-0.5 pb-1 text-[10px] font-bold text-white/40 select-none border-b border-white/10 mb-1"
			>
				{label}
			</div>
			<!-- Two columns once the list is long enough to need scrolling to read.
			     Ten types in one column is a menu taller than the card it belongs
			     to; in two it is one glance. Short lists stay single, where a
			     second column would only make the menu wider than its names. -->
			<div class="grid" class:grid-cols-2={choices.length > 6}>
				{#each choices as choice, i (choice)}
					{@const on = i === value}
					<button
						onclick={() => pick(i)}
						class="w-full text-left px-2.5 py-1 flex items-center gap-2 cursor-pointer transition-colors {on
							? 'bg-white/10'
							: 'hover:bg-white/10'}"
					>
						<span class="text-[8px] w-2 shrink-0" style="color: {color}">{on ? '●' : '○'}</span>
						<span class="truncate" style={on ? `color: ${color}` : ''}>{choice}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
