<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { playSound } from '../../sound';
	import { setMuted } from '../../stores/sound';
	import { isSeqPlaying, cursorStep, play, stop } from '../../stores/synth-transport';
	import { theme, cycleTheme, THEME_STYLES, resolvedTheme } from '../../stores/theme';
	import { tabIndexFromPath, TAB_ROUTES } from '../../routes-map';
	import { consoleOverlayOpen, guideOpen, globalSettingsOpen, toggleConsoleOverlay } from '../../stores/chrome';
	import KrszLogo from './KrszLogo.svelte';

	let activeTab = $derived(tabIndexFromPath(page.url.pathname));
	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);
	/* AUTO alone doesn't say what's actually on screen — pair it with the hour's pick. */
	let themeLabel = $derived($theme === 'auto' ? `AUTO·${$resolvedTheme.toUpperCase()}` : $theme.toUpperCase());
	/* The button reserves the width of the longest label it can ever show, so
	   cycling themes never shoves GUIDE and the rest sideways. Found, not
	   hardcoded, so a renamed theme cannot quietly make it wrong. */
	const THEME_LABEL_WIDEST = (() => {
		const names = Object.keys(THEME_STYLES).map((t) => t.toUpperCase());
		return [...names, ...names.map((n) => `AUTO·${n}`)].reduce((a, b) => (b.length > a.length ? b : a));
	})();

	const TABS = [
		{ id: 0, label: '0:modules', color: '#56b6c2', title: 'View 0: Modules — Live Project Portal & Technical Deep Dives [Hotkey: Ctrl+0]' },
		{ id: 1, label: '1:guestbook', color: '#e06c75', title: 'View 1: Guestbook — Distributed Edge Packet Messenger [Hotkey: Ctrl+1]' },
		{ id: 2, label: '2:synth', color: '#c678dd', title: 'View 2: Synth — 8-Track WebAudio Modular Synthesizer & Sequencer [Hotkey: Ctrl+2]' },
		{ id: 3, label: '3:utils', color: '#e5c07b', title: 'View 3: Utilities — Keyboard / Mouse / Display Hardware Testers [Hotkey: Ctrl+3]' },
		{ id: 4, label: '4:lm-space', color: '#98c379', title: 'View 4: LM.SPACE — the Artificial Analysis model table as a navigable volume, cached through blog.krsz.in [Hotkey: Ctrl+4]' },
		{ id: 5, label: '5:krsz-vm', color: '#d19a66', title: 'View 5: krsz-vm — a real x86 PC emulated in the browser, running Alpine Linux [Hotkey: Ctrl+5]' },
		{ id: 6, label: '6:chatbot', color: '#61afef', title: 'View 6: chatbot — a language model running entirely on your GPU via WebGPU, no server [Hotkey: Ctrl+6]' },
		{ id: 7, label: '7:lifelab', color: '#98c379', title: "View 7: lifelab — Conway's Game of Life as a 25-level campaign, ending at the glider gun [Hotkey: Ctrl+7]" }
	];

	let tabStrip: HTMLDivElement | undefined = $state();
	let tabsRow: HTMLDivElement | undefined = $state();
	let tabBtns: (HTMLButtonElement | undefined)[] = [];

	/**
	 * A single pill that slides between tabs, instead of each button silently
	 * swapping its own background the instant activeTab changes -- with eight
	 * sibling buttons there is no element in that scheme that actually moves,
	 * so the highlight just teleports. Measured against tabsRow rather than the
	 * viewport so it tracks correctly regardless of the strip's own scroll
	 * position or the sidebar's width changing the row's offset.
	 */
	let indicator = $state<{ left: number; width: number; color: string } | null>(null);

	function placeIndicator() {
		const row = tabsRow;
		const btn = tabBtns[activeTab];
		if (!row || !btn) {
			indicator = null;
			return;
		}
		const rowRect = row.getBoundingClientRect();
		const btnRect = btn.getBoundingClientRect();
		indicator = { left: btnRect.left - rowRect.left, width: btnRect.width, color: TABS[activeTab].color };
	}

	$effect(() => {
		activeTab;
		// Layout (container-query label collapse, window resize) can move a tab
		// without changing which one is active, so re-measure on both triggers
		// rather than only when the index itself changes.
		placeIndicator();
	});

	$effect(() => {
		const row = tabsRow;
		const strip = tabStrip;
		if (!row || !strip) return;
		// Watch both: the row's own box (a tab actually resized) and the strip
		// (the container-query root whose width crossing the label-collapse
		// breakpoint is what caused it) -- the row alone can lag a frame behind
		// the strip crossing the breakpoint.
		const ro = new ResizeObserver(placeIndicator);
		ro.observe(row);
		ro.observe(strip);
		return () => ro.disconnect();
	});

	/**
	 * The strip scrolls sideways when the tabs outgrow it, but a mouse wheel only
	 * produces vertical deltas — so nothing moved. Translate the larger of the two
	 * axes into horizontal scroll, and only swallow the event when there is
	 * actually somewhere to go, so the page still scrolls otherwise.
	 */
	function onStripWheel(e: WheelEvent) {
		const el = tabStrip;
		if (!el) return;
		const overflow = el.scrollWidth - el.clientWidth;
		if (overflow <= 1) return;
		const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
		if (!delta) return;
		const next = Math.max(0, Math.min(overflow, el.scrollLeft + delta));
		if (next === el.scrollLeft) return;
		e.preventDefault();
		el.scrollLeft = next;
	}

	function nav(id: number) {
		goto(TAB_ROUTES[id]);
		playSound('click');
	}

	function togglePlayback() {
		if ($isSeqPlaying) {
			stop();
		} else {
			setMuted(false);
			play($cursorStep);
		}
		playSound('click');
	}
</script>

<!-- header-fit is the one container-query root for the whole bar -- tab labels
     and the right-hand cluster (CONSOLE/GUIDE/SETTINGS text, the theme badge,
     the serverless badge) used to shed on two unrelated systems: the tab
     labels reacted to the tabstrip's own container width, the right cluster
     reacted to the viewport's width via 2xl:. Those two didn't move
     together -- the sidebar alone can shrink the tabstrip's real width
     without the viewport changing at all, so at plenty of real widths the
     tabs had already collapsed to bare numbers while GUIDE/SETTINGS/PLAY
     still carried full text, and the two sides fought over space that
     wasn't there, clipping the right cluster. One root, one ladder, sheds
     least-essential first: the serverless badge, then the theme label, then
     every button's text (icon/bracket only survives), then finally the tab
     names collapse to bare numbers -- by then there's real room again. -->
<header
	class="header-fit w-full max-w-full {themeStyles.headerBgVideo} px-2 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between font-bold text-xs sm:text-sm tracking-wider border {themeStyles.border} rounded-t-sm mb-1.5 sm:mb-2 gap-1.5"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- The strip is a container query root: below the width where all eight
	     full labels fit, tabs collapse to their number and only the active one
	     keeps its name -- the row stays one line, no clipping, no hidden
	     sideways scroll to discover. -->
	<div
		bind:this={tabStrip}
		onwheel={onStripWheel}
		class="tabstrip flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1"
	>
		<a
			href="/"
			title="krsz.in — Kurashizu's Random-Stuff Zone"
			class="press bg-black/40 px-1 rounded flex items-center shrink-0 hover:bg-black/60 transition-colors"
		>
			<!-- Sized against the tab buttons' own line box, so a bigger mark does not
			     make the header taller. -->
			<KrszLogo size={24} />
		</a>

		<!-- The console is drop-down only, so it needs a visible handle as well as its key -->
		<button
			onclick={() => {
				toggleConsoleOverlay();
				playSound('toggle');
			}}
			data-tour="console-btn"
			title="Command console — a small shell with a virtual filesystem, pipes and an edge trace. Opens as a drop-down over any view. [Hotkey: ` backquote]"
			class="press px-2 py-0.5 sm:py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 text-xs sm:text-sm font-bold border {$consoleOverlayOpen
				? 'border-[#98c379] bg-[#98c379]/20 text-[#98c379]'
				: 'border-[#98c379]/50 text-[#98c379] hover:bg-[#98c379]/20'}"
		>
			<span class="btnlabel">[~]&nbsp;CONSOLE</span><span class="btnlabel-off">[~]</span>
		</button>

		<div bind:this={tabsRow} class="relative flex items-center gap-0.5 sm:gap-2" data-tour="tabs">
			<!-- The one element that actually moves -- everything else here is a
			     colour transition on a fixed element, this is the only spot on the
			     page where a highlight has to travel between siblings. Absolutely
			     positioned against tabsRow (not the strip, which scrolls) so its
			     left/width are plain pixel offsets, eased with the same curve as
			     .press elsewhere rather than a spring. Hidden until the first
			     measurement lands so it never flashes at (0,0) before layout. -->
			{#if indicator}
				<div
					class="absolute inset-y-0 rounded pointer-events-none transition-[transform,width,background-color] duration-200 z-0"
					style="transform: translateX({indicator.left}px); width: {indicator.width}px; background-color: {indicator.color}; transition-timing-function: cubic-bezier(0.2, 0, 0, 1);"
				></div>
			{/if}
			{#each TABS as tab (tab.id)}
				<button
					bind:this={tabBtns[tab.id]}
					onclick={() => nav(tab.id)}
					title={tab.title}
					class="press relative z-10 px-1.5 sm:px-3 py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 {activeTab === tab.id
						? 'text-black font-black'
						: 'hover:bg-white/10 text-[#d8dee9]'}"
				>
					{tab.id}<span class="tabname" class:on={activeTab === tab.id}>:{tab.label.slice(2)}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="flex items-center gap-1.5 sm:gap-3 shrink-0 text-xs sm:text-sm pl-1">
		<button
			onclick={togglePlayback}
			title="Master Audio & Sequencer Playback Toggle — Start / Stop Music & Sound Engine"
			class="press px-2 py-0.5 sm:py-1 cursor-pointer rounded transition-all whitespace-nowrap shrink-0 text-xs sm:text-sm font-black border {$isSeqPlaying
				? 'border-[#e06c75] bg-[#e06c75]/10 text-[#e06c75] hover:bg-[#e06c75] hover:text-black shadow-[0_0_8px_#e06c75]'
				: 'border-[#98c379] bg-[#98c379]/10 text-[#98c379] hover:bg-[#98c379] hover:text-black'}"
		>
			<!-- SVG glyph instead of ►/■ text — the font glyphs sit off the text baseline -->
			<span class="inline-flex items-center gap-1">
				<span>[</span>
				{#if $isSeqPlaying}
					<svg width="8" height="8" viewBox="0 0 8 8" class="shrink-0 blink-live"><rect x="1" y="1" width="6" height="6" fill="currentColor" /></svg>
				{:else}
					<svg width="8" height="8" viewBox="0 0 8 8" class="shrink-0"><path d="M1.5 0.6 L7.2 4 L1.5 7.4 Z" fill="currentColor" /></svg>
				{/if}
				<span>{$isSeqPlaying ? 'STOP]' : 'PLAY]'}</span>
			</span>
		</button>
		<button
			onclick={() => {
				guideOpen.set(true);
				playSound('click');
			}}
			data-tour="guide-btn"
			title="Open the walkthrough — what each view does and every keyboard shortcut"
			class="press px-2 py-0.5 sm:py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 text-xs sm:text-sm font-bold border border-[#61afef]/50 text-[#61afef] hover:bg-[#61afef]/20"
		>
			<span class="btnlabel">[?]&nbsp;GUIDE</span><span class="btnlabel-off">[?]</span>
		</button>
		<button
			onclick={() => {
				globalSettingsOpen.set(true);
				playSound('click');
			}}
			title="Global settings — sound, and clearing anything the site has stored in this browser"
			class="press px-2 py-0.5 sm:py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 text-xs sm:text-sm font-bold border border-white/25 text-white/60 hover:border-[#56b6c2] hover:text-[#56b6c2] hover:bg-[#56b6c2]/20"
		>
			<span class="btnlabel">[CFG]&nbsp;SETTINGS</span><span class="btnlabel-off">[CFG]</span>
		</button>
		<button
			onclick={cycleTheme}
			title="Color Theme Switcher — Cycle palette (Auto by time of day, Tokyo Matte, Gruvbox Dark, Nord Terminal, Cyber Amber) [Hotkey: T]"
			class="themebadge press hover:underline cursor-pointer grid text-[#e5c07b] text-center"
		>
			<span class="col-start-1 row-start-1 invisible" aria-hidden="true">[THEME: {THEME_LABEL_WIDEST}]</span>
			<span class="col-start-1 row-start-1">[THEME: {themeLabel}]</span>
		</button>
		<span
			title="Architecture Status — 100% Serverless Edge execution without dedicated backend origin servers"
			class="servbadge bg-black/40 px-2 py-0.5 text-[#56b6c2]">100%_SERVERLESS</span
		>
	</div>
</header>

<style>
	/* One container-query root for the whole bar (see the comment on <header>
	   above for why) -- named so both the tab-strip's own rule and the right
	   cluster's rules resolve against the same real available width instead
	   of two different reference frames that don't move together. Thresholds
	   below are measured against the bar's actual content, not guessed: at
	   each stage, everything still visible needs that much room, checked
	   with every optional item above it already hidden. */
	.header-fit {
		container-type: inline-size;
		container-name: header-fit;
	}

	/* Sheds least-essential first. The serverless badge and the theme label
	   are pure status/trivia -- gone first. Then every button's text label,
	   down to icon/bracket-only (CONSOLE/GUIDE/SETTINGS/PLAY all keep their
	   bracket so the row doesn't visually shrink to nothing, only the word
	   inside goes). Tab names are the last thing to collapse to bare numbers,
	   since which view is active matters more than any of the chrome around
	   it -- by the time it's this tight, the button labels are already gone
	   and there is real room again. */
	.btnlabel-off { display: none; }
	@container header-fit (max-width: 1780px) {
		.servbadge { display: none; }
	}
	@container header-fit (max-width: 1620px) {
		.themebadge { display: none; }
	}
	@container header-fit (max-width: 1180px) {
		.btnlabel { display: none; }
		.btnlabel-off { display: inline; }
	}
	@container header-fit (max-width: 940px) {
		.tabname:not(.on) { display: none; }
	}
</style>
