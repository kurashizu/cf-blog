<script lang="ts">
	/**
	 * One row of a Menu. Pass `checked` (true/false) for a pick-one list and
	 * the row becomes a menuitemradio with the ● / ○ dot; leave it undefined
	 * for a plain action row. `note` is the right-aligned annotation column.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let {
		checked,
		note,
		color = '#98c379',
		class: cls = '',
		children,
		...rest
	}: {
		checked?: boolean;
		note?: string;
		color?: string;
		class?: string;
		children?: Snippet;
	} & HTMLButtonAttributes = $props();
</script>

<button
	type="button"
	role={checked === undefined ? 'menuitem' : 'menuitemradio'}
	aria-checked={checked}
	tabindex="-1"
	class="ui-menu-item press {cls}"
	{...rest}
>
	<span class="flex items-center gap-2 min-w-0">
		{#if checked !== undefined}
			<span class="shrink-0" style="color: {checked ? color : 'rgba(255,255,255,0.25)'}" aria-hidden="true">{checked ? '●' : '○'}</span>
		{/if}
		<span class="truncate">{@render children?.()}</span>
	</span>
	{#if note}
		<span class="shrink-0 text-xs text-white/60">{note}</span>
	{/if}
</button>
