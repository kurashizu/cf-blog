<script lang="ts">
	/**
	 * A card's heading: coloured, black-weight, hairline underneath. A real
	 * heading element (h2 by default) so screen-reader users can walk a view
	 * by its sections the way a sighted visitor scans the coloured labels.
	 */
	import type { Snippet } from 'svelte';

	let {
		color = '#56b6c2',
		level = 2,
		short,
		class: cls = '',
		children,
		right
	}: {
		color?: string;
		level?: 2 | 3 | 4;
		/** Ignored for now; reserved so callers can pass BoxHeader-style short readings. */
		short?: string;
		class?: string;
		children?: Snippet;
		right?: Snippet;
	} = $props();
</script>

<svelte:element this={`h${level}`} class="ui-title flex items-center justify-between gap-2 {cls}" style="--ui: {color}">
	<span class="min-w-0 truncate">{@render children?.()}</span>
	{#if right}
		<span class="ml-auto shrink-0 flex items-center gap-1.5 font-normal">{@render right()}</span>
	{/if}
</svelte:element>
