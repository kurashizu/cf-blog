<script lang="ts">
	/**
	 * The bordered translucent panel every view is built from. Three tones
	 * (default white/15 on black/40; sunken white/10 on black/30 for rows
	 * inside a card; flat white/15 on black/25 for settings groups), three
	 * paddings. Give it a `title` and it renders a SectionTitle as its first
	 * child and becomes a <section> the reader can jump to.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import SectionTitle from './SectionTitle.svelte';

	let {
		tone = 'default',
		pad = 'md',
		title,
		titleShort,
		color = '#56b6c2',
		level = 2,
		as,
		class: cls = '',
		children,
		titleRight,
		...rest
	}: {
		tone?: 'default' | 'sunken' | 'flat';
		pad?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
		title?: string;
		/** Shorter reading of the title for narrow panels; see BoxHeader. */
		titleShort?: string;
		color?: string;
		level?: 2 | 3 | 4;
		as?: 'div' | 'section' | 'article' | 'aside' | 'nav' | 'li';
		class?: string;
		children?: Snippet;
		titleRight?: Snippet;
	} & HTMLAttributes<HTMLElement> = $props();

	const PAD = { none: '', xs: 'p-1.5', sm: 'p-2', md: 'p-2.5', lg: 'p-3' } as const;
	let tag = $derived(as ?? (title ? 'section' : 'div'));
</script>

<svelte:element this={tag} class="ui-card ui-card-{tone} {PAD[pad]} {cls}" {...rest}>
	{#if title}
		<SectionTitle {level} {color} short={titleShort}>
			{title}
			{#snippet right()}{@render titleRight?.()}{/snippet}
		</SectionTitle>
	{/if}
	{@render children?.()}
</svelte:element>
