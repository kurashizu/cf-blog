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
	import { performanceMode } from '../../stores/performance';

	let {
		art,
		color,
		colorRanges,
		class: className = '',
		onclick,
		title,
		fit,
		maxFontSize = 22
	}: {
		/** Raw multi-line block-letter text, exactly as it would sit inside a <pre>. */
		art: string;
		/** Fallback for any column not covered by colorRanges, and the only color used when colorRanges is omitted. */
		color: string;
		/** Per-letter coloring (the KRSZ brand mark): column ranges, inclusive, checked in order -- first match wins. Columns outside every range fall back to `color`. `fromRow`/`toRow` bound a range vertically as well, which the two-by-two mark needs: there the same columns carry K on the top half and S on the bottom. */
		colorRanges?: { from: number; to: number; color: string; fromRow?: number; toRow?: number }[];
		class?: string;
		/** Omit for a purely decorative banner -- the burst still plays on click, it just does nothing else. */
		onclick?: () => void;
		title?: string;
		/**
		 * Size the art to fill its container's width instead of taking a font
		 * size from the caller's classes.
		 *
		 * The banners are between 37 and 89 columns wide depending on how long
		 * the word is, and every caller passed the same fixed text-[4px]/[6px]/
		 * [8px] ladder -- so UTILS (37 cols) drew at a third the width of
		 * LEADERBOARD (89) in the same slot, and none of them related to the
		 * panel they sat in. Fitting makes the *banner* the constant instead of
		 * the glyph, which is what makes the set look like one family.
		 */
		fit?: boolean;
		/**
		 * Ceiling for `fit`, so a short word does not balloon on a wide screen.
		 * 22 rather than 13: at 13 the short banners (UTILS, 37 cols) hit the cap
		 * and stopped growing while the long ones (LEADERBOARD, 89) were still
		 * width-bound, which is the size mismatch this is meant to remove.
		 */
		maxFontSize?: number;
	} = $props();

	function colorForCell(col: number, row: number): string {
		if (!colorRanges) return color;
		for (const r of colorRanges) {
			if (col < r.from || col > r.to) continue;
			if (r.fromRow !== undefined && row < r.fromRow) continue;
			if (r.toRow !== undefined && row > r.toRow) continue;
			return r.color;
		}
		return color;
	}

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
	/** $state, not $derived -- applyPointer()/burst() mutate dx/dy on these
	 *  objects in place every frame, and a $derived value can't be assigned
	 *  to (the `glyphs = glyphs` re-trigger silently did nothing once this
	 *  was flipped to $derived.by, which is what actually killed the hover
	 *  effect: the physics ran, but nothing ever told Svelte to re-render). */
	let glyphs = $state<Glyph[]>([]);
	$effect(() => {
		const out: Glyph[] = [];
		rows.forEach((line, row) => {
			[...line].forEach((ch, col) => {
				if (ch === ' ') return;
				out.push({ ch, row, col, dx: 0, dy: 0, seed: Math.random() });
			});
		});
		glyphs = out;
	});

	let containerEl: HTMLDivElement | undefined = $state();
	let preEl: HTMLPreElement | undefined = $state();
	/** The outer box, so fitToWidth can read the width its parent offers. */
	let boxEl: HTMLDivElement | undefined = $state();
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

	/** Set by fitToWidth; applied to the box so the <pre> measures at this size. */
	let fittedSize = $state<number | null>(null);

	/**
	 * Choose the font size that makes the art exactly fill the available width.
	 *
	 * The glyph cell is a fixed fraction of the font size in a monospace face,
	 * so one measurement at a known size gives the ratio and the rest is
	 * arithmetic -- no binary search, and no second layout pass.
	 */
	function fitToWidth() {
		if (!fit || !boxEl || !preEl || rows.length === 0) return;
		/* A share of the row, not all of it: every banner sits in a flex row
		   beside something else (the contact buttons, a tool count, a refresh
		   control), so spending the parent's full width would push those out.
		   Half leaves the banner clearly the largest thing in the row while
		   still bounded by it. */
		/* What the row has left once its other items are placed.
		   The box's own width cannot be used -- it grows to whatever the art
		   needs, so measuring it and then sizing the art to it is circular and
		   simply keeps whatever size it already had. The parent's width minus
		   the siblings is the real budget, and it tracks the layout as the
		   window narrows.
		   `gap` is subtracted once per sibling, plus a small margin so a
		   rounding error cannot tip the row into wrapping. */
		const parent = boxEl.parentElement;
		if (!parent) return;
		const parentW = parent.getBoundingClientRect().width;
		const gap = parseFloat(getComputedStyle(parent).columnGap) || 0;
		let taken = 0;
		for (const sib of parent.children) {
			if (sib === boxEl) continue;
			taken += sib.getBoundingClientRect().width + gap;
		}
		const avail = parentW - taken - 4;
		if (avail <= 0) return;
		const longest = Math.max(1, ...rows.map((r) => r.length));
		/* Derive the cell-per-font-size ratio, not the current width.
		   Reading the <pre>'s own width would be circular once a fitted size is
		   applied -- it reports what the last fit produced, the arithmetic
		   cancels out, and the size then never changes again however narrow the
		   container gets. This measures the ratio at a known size instead, so
		   every call is independent of the last one. */
		const current = parseFloat(getComputedStyle(preEl).fontSize) || 10;
		const perColPerPx = preEl.getBoundingClientRect().width / longest / current;
		if (!perColPerPx) return;
		const next = Math.min(maxFontSize, avail / longest / perColPerPx);
		// Whole pixels: a fractional size lands glyph cells on half pixels, and
		// the block characters stop meeting.
		/* Floor of 8: below that the block characters stop reading as letters at
		   all, and it is better for the row to wrap (it is flex-wrap) than for
		   the banner to shrink into an unreadable smudge. The measurement can
		   under-report the space available -- siblings that have themselves
		   wrapped are measured at their widest -- so this is the guard against
		   one bad reading collapsing the mark. */
		const rounded = Math.max(8, Math.min(maxFontSize, Math.floor(next)));
		if (rounded !== fittedSize) fittedSize = rounded;
	}

	function measure() {
		if (!preEl) return;
		const rect = preEl.getBoundingClientRect();
		if (rows.length === 0) return;
		const longest = Math.max(1, ...rows.map((r) => r.length));
		cellW = rect.width / longest || cellW;
		cellH = rect.height / rows.length || cellH;
	}

	function remeasure() {
		fitToWidth();
		measure();
	}

	onMount(() => {
		remeasure();
		// A second pass once fittedSize has been applied: the first run measured
		// at the caller's size to derive the ratio, so the cell it recorded is
		// the pre-fit one.
		requestAnimationFrame(remeasure);
		const ro = new ResizeObserver(remeasure);
		if (preEl) ro.observe(preEl);
		// The width the art fits into is the parent's, which can change without
		// the <pre> changing until after this runs.
		if (boxEl?.parentElement) ro.observe(boxEl.parentElement);
		return () => {
			ro.disconnect();
			if (rafHandle) cancelAnimationFrame(rafHandle);
		};
	});

	/** Reach of the scatter, in glyph cells -- close glyphs move a lot, this far out nothing does. */
	const RADIUS = 3.2;
	const STRENGTH = 1.6;

	/** Latest raw pointer position, applied at most once per animation frame --
	 *  pointermove can fire far faster than the display refreshes (trackpads
	 *  routinely hit 120-1000Hz), and without this the O(glyphs) distance pass
	 *  plus a full Svelte re-render of every span ran on every single event,
	 *  which is what actually froze the page on the wider banners (LEADERBOARD
	 *  is 500+ glyphs) rather than the effect itself being wrong. */
	let pendingX = 0;
	let pendingY = 0;
	let rafHandle = 0;

	function applyPointer() {
		rafHandle = 0;
		if (!containerEl || bursting) return;
		const rect = containerEl.getBoundingClientRect();
		const px = (pendingX - rect.left) / cellW;
		const py = (pendingY - rect.top) / cellH;

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

	function onPointerMove(e: PointerEvent) {
		if ($performanceMode) return;
		pendingX = e.clientX;
		pendingY = e.clientY;
		if (rafHandle) return;
		rafHandle = requestAnimationFrame(applyPointer);
	}

	function onPointerLeave() {
		hovering = false;
		if (rafHandle) {
			cancelAnimationFrame(rafHandle);
			rafHandle = 0;
		}
		for (const g of glyphs) {
			g.dx = 0;
			g.dy = 0;
		}
		glyphs = glyphs;
	}

	/** A brief full-scatter burst on click, then everything springs home -- the
	 *  "poked" moment, distinct from the pointer-follow hover scatter. */
	function burst() {
		if (bursting || $performanceMode) return;
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

<!-- Two layers, not one: className (every caller passes overflow-x-auto, for
     the rare viewport too narrow for even the smallest responsive text size)
     has to sit on an ancestor that never itself gets clipped, while the
     glyph-positioning div needs overflow-hidden so a scattered or bursting
     glyph -- deliberately pushed past its own cell, that's the whole effect --
     can never register as scrollable content and silently grow a scrollbar
     that was never supposed to exist. Putting both roles on one element (the
     original shape of this component) meant every hover/click added a few
     px of real overflow on whichever ancestor happened to be overflow-auto,
     which is exactly the bug: a scrollbar appearing under a banner that
     never scrolled before, on every page that uses this component. -->
<!-- ascii-art opts these banners out of the site's pixel face -- see app.css.
     They are drawn by tiling █ ═ ║ ╗ into solid letterforms, which needs every
     glyph to be one cell wide with ink running edge to edge; Jelly's block is
     two cells against its own six-pixel letter, so the shapes came apart. -->
<div
	bind:this={boxEl}
	class="ascii-art overflow-x-auto {className}"
	style={fittedSize === null ? undefined : `font-size: ${fittedSize}px`}
>
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
		class="relative select-none overflow-hidden w-fit {onclick ? 'cursor-pointer' : 'cursor-default'}"
		style={colorRanges ? undefined : `color: ${color}`}
	>
		<!-- Sizes the box exactly like the <pre> it replaces: same text, same font,
		     invisible, so its rendered box gives the real glyph cell size in px
		     (measure() above) rather than assuming 1ch/1em -- leading-tight and
		     leading-none aren't the same, and callers pass either one. -->
		<pre bind:this={preEl} class="invisible pointer-events-none">{art}</pre>

		{#each glyphs as g (g.row + ':' + g.col)}
			<span
				class="absolute top-0 left-0 transition-transform {hovering || bursting ? 'will-change-transform' : ''}"
				style="{colorRanges ? `color: ${colorForCell(g.col, g.row)};` : ''} transform: translate({g.col * cellW}px, {g.row * cellH}px) translate({g.dx * cellW}px, {g.dy * cellH}px); transition-duration: {bursting
					? '60ms'
					: hovering
						? '90ms'
						: '260ms'}; transition-timing-function: {bursting ? 'linear' : hovering ? 'linear' : 'cubic-bezier(0.34, 1.56, 0.64, 1)'};"
			>{g.ch}</span>
		{/each}
	</div>
</div>
