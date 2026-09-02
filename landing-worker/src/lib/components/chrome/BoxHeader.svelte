<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A "┌─[ TITLE ]─┐" panel heading with an optional right-hand slot that
	 * never breaks mid-text.
	 *
	 * The title is given as its full reading plus shorter ones, and the one
	 * shown is the longest that fits beside the slot -- measured, not guessed:
	 * a hidden probe span in the same font is sized against the row, and a
	 * ResizeObserver re-picks whenever the row or the slot changes width. Pixel
	 * arithmetic on `ch` would drift with letter-spacing and with whichever
	 * fallback font draws the box-drawing glyphs; measuring does not.
	 *
	 * If even the shortest reading cannot share the line, the slot wraps whole
	 * onto a second line, right-aligned. Words never break.
	 */
	let {
		title,
		short = [],
		class: cls = '',
		style = '',
		titleClass = '',
		rightClass = '',
		children
	}: {
		title: string;
		/** Shorter readings, longest first. */
		short?: string | string[];
		class?: string;
		style?: string;
		titleClass?: string;
		rightClass?: string;
		children?: Snippet;
	} = $props();

	const frame = (t: string) => `┌─[ ${t} ]─┐`;
	let variants = $derived([title, ...(Array.isArray(short) ? short : [short])].filter(Boolean));

	let row = $state<HTMLDivElement>();
	let right = $state<HTMLSpanElement>();
	// Initial value only by design: the effect below re-fits whenever `title` changes.
	// svelte-ignore state_referenced_locally
	let label = $state(title);

	$effect(() => {
		const el = row;
		const vs = variants;
		if (!el) return;
		const probe = document.createElement('span');
		probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none;left:0;top:0';
		el.appendChild(probe);
		const fit = () => {
			// column-gap between title and slot is 0.5rem = 8px.
			const avail = el.clientWidth - (right?.offsetWidth ?? 0) - (right ? 8 : 0);
			let pick = vs[vs.length - 1];
			for (const v of vs) {
				probe.textContent = frame(v);
				if (probe.offsetWidth <= avail) {
					pick = v;
					break;
				}
			}
			label = pick;
		};
		fit();
		const ro = new ResizeObserver(fit);
		ro.observe(el);
		if (right) ro.observe(right);
		return () => {
			ro.disconnect();
			probe.remove();
		};
	});
</script>

<div bind:this={row} class="relative flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 whitespace-nowrap min-w-0 {cls}" {style}>
	<span class={titleClass}>{frame(label)}</span>
	{#if children}
		<span bind:this={right} class="ml-auto min-w-0 flex items-center {rightClass}">{@render children()}</span>
	{/if}
</div>
