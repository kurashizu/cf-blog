<script lang="ts">
	/**
	 * Every block-letter ASCII banner on the site (KRSZ, MODULES, GUESTBOOK,
	 * LEADERBOARD, UTILS, KRSZ-VM) renders through here instead of a bare
	 * `<pre>`, so hovering scatters the glyphs outward from the pointer and
	 * springs them back -- something closer to a poked-at physical object
	 * than static text. Modeled on the same idea as OpenCode's TUI logo: the
	 * mark is not just decoration, it visibly reacts to being touched.
	 *
	 * Built on plain positioned <span>s rather than canvas: monospace glyphs
	 * already sit on a uniform ch/line-height grid, so no text measurement is
	 * needed, and every existing ASCII block is small enough (a few hundred
	 * glyphs) that per-glyph DOM is cheap. A space is never wrapped in a span
	 * -- nothing to scatter, and it would only add inert nodes.
	 */
	import { onMount } from 'svelte';

	let {
		art,
		color,
		class: className = '',
		onclick,
		title
	}: {
		/** Raw multi-line block-letter text, exactly as it would sit inside a <pre>. */
		art: string;
		color: string;
		class?: string;
		/** Omit for a purely decorative banner -- the burst still plays on click, it just does nothing else. */
		onclick?: () => void;
		title?: string;
	} = $props();

	interface Glyph {
		ch: string;
		row: number;
		col: number;
		/** Current scatter offset, in ch/em units so it scales with the text size. */
		dx: number;
		dy: number;
		/** Per-glyph random seed for the burst, so a click doesn't move every glyph identically. */
		seed: number;
	}

	let rows = $derived(art.replace(/\n$/, '').split('\n'));
	let glyphs = $derived.by(() => {
		const out: Glyph[] = [];
		rows.forEach((line, row) => {
			[...line].forEach((ch, col) => {
				if (ch === ' ') return;
				out.push({ ch, row, col, dx: 0, dy: 0, seed: Math.random() });
			});
		});
		return out;
	});

	let containerEl: HTMLDivElement | undefined = $state();
	let preEl: HTMLPreElement | undefined = $state();
	let hovering = $state(false);
	let bursting = $state(false);
	/** Real glyph cell size in px, measured off the invisible <pre> rather than
	 *  assumed as 1ch/1em -- leading-tight (1.25) and leading-none (1) both
	 *  appear across the callers, and at the tiny mobile font sizes here even
	 *  a small mismatch between assumed and actual line-height compounds into
	 *  visible drift by the last row. Re-measured on resize so it tracks the
	 *  sm:/md: responsive text-size breakpoints too, not just the initial one. */
	let cellW = $state(8);
	let cellH = $state(14);

	function measure() {
		if (!preEl) return;
		const rect = preEl.getBoundingClientRect();
		if (rows.length === 0) return;
		const longest = Math.max(1, ...rows.map((r) => r.length));
		cellW = rect.width / longest || cellW;
		cellH = rect.height / rows.length || cellH;
	}

	onMount(() => {
		measure();
		const ro = new ResizeObserver(measure);
		if (preEl) ro.observe(preEl);
		return () => ro.disconnect();
	});

	/** Reach of the scatter, in glyph cells -- close glyphs move a lot, this far out nothing does. */
	const RADIUS = 3.2;
	const STRENGTH = 1.6;

	function onPointerMove(e: PointerEvent) {
		if (!containerEl || bursting) return;
		const rect = containerEl.getBoundingClientRect();
		const px = (e.clientX - rect.left) / cellW;
		const py = (e.clientY - rect.top) / cellH;

		for (const g of glyphs) {
			const ddx = g.col + 0.5 - px;
			const ddy = g.row + 0.5 - py;
			const dist = Math.sqrt(ddx * ddx + ddy * ddy);
			if (dist >= RADIUS || dist === 0) {
				g.dx = 0;
				g.dy = 0;
				continue;
			}
			const falloff = 1 - dist / RADIUS;
			const push = (falloff * falloff * STRENGTH) / Math.max(dist, 0.4);
			g.dx = ddx * push;
			g.dy = ddy * push;
		}
		glyphs = glyphs;
	}

	function onPointerLeave() {
		hovering = false;
		for (const g of glyphs) {
			g.dx = 0;
			g.dy = 0;
		}
		glyphs = glyphs;
	}

	/** A brief full-scatter burst on click, then everything springs home -- the
	 *  "poked" moment, distinct from the pointer-follow hover scatter. */
	function burst() {
		if (bursting) return;
		bursting = true;
		for (const g of glyphs) {
			const angle = g.seed * Math.PI * 2;
			const mag = 1.5 + g.seed * 2.5;
			g.dx = Math.cos(angle) * mag;
			g.dy = Math.sin(angle) * mag;
		}
		glyphs = glyphs;
		setTimeout(() => {
			for (const g of glyphs) {
				g.dx = 0;
				g.dy = 0;
			}
			glyphs = glyphs;
			bursting = false;
		}, 60);
	}

	function handleClick() {
		burst();
		onclick?.();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -- role/tabindex are only ever both set together, when onclick is provided; the linter can't see that from the dynamic role expression. -->
<div
	bind:this={containerEl}
	onpointermove={(e) => {
		hovering = true;
		onPointerMove(e);
	}}
	onpointerleave={onPointerLeave}
	onclick={handleClick}
	role={onclick ? 'button' : undefined}
	tabindex={onclick ? 0 : undefined}
	onkeydown={onclick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleClick()) : undefined}
	{title}
	class="relative select-none {onclick ? 'cursor-pointer' : 'cursor-default'} {className}"
	style="color: {color}"
>
	<!-- Sizes the box exactly like the <pre> it replaces: same text, same font,
	     invisible, so its rendered box gives the real glyph cell size in px
	     (measure() above) rather than assuming 1ch/1em -- leading-tight and
	     leading-none aren't the same, and callers pass either one. -->
	<pre bind:this={preEl} class="invisible pointer-events-none">{art}</pre>

	{#each glyphs as g (g.row + ':' + g.col)}
		<span
			class="absolute top-0 left-0 transition-transform will-change-transform"
			style="transform: translate({g.col * cellW}px, {g.row * cellH}px) translate({g.dx * cellW}px, {g.dy * cellH}px); transition-duration: {bursting
				? '60ms'
				: hovering
					? '90ms'
					: '260ms'}; transition-timing-function: {bursting ? 'linear' : hovering ? 'linear' : 'cubic-bezier(0.34, 1.56, 0.64, 1)'};"
		>{g.ch}</span>
	{/each}
</div>
