<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { t } from '$lib/i18n';
	import { playSound } from '../../sound';
	import { setMuted } from '../../stores/sound';
	import { isSeqPlaying, cursorStep, play, stop } from '../../stores/synth-transport';
	import { THEME_STYLES, resolvedTheme } from '../../stores/theme';
	import { tabIndexFromPath, TAB_ROUTES } from '../../routes-map';
	import { consoleOverlayOpen, globalSettingsOpen, toggleConsoleOverlay, openOnboardingNow } from '../../stores/chrome';
	import KrszLogo from './KrszLogo.svelte';

	let activeTab = $derived(tabIndexFromPath(page.url.pathname));
	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	/** Tooltip resolves through $t() in this $derived, not a module-level
	 *  constant, since the locale isn't known at module load time. */
	let TABS = $derived([
		{ id: 0, label: $t('common.tabName.0'), color: '#56b6c2', title: $t('chrome.tabbar.tab0') },
		{ id: 1, label: $t('common.tabName.1'), color: '#e06c75', title: $t('chrome.tabbar.tab1') },
		{ id: 2, label: $t('common.tabName.2'), color: '#c678dd', title: $t('chrome.tabbar.tab2') },
		{ id: 3, label: $t('common.tabName.3'), color: '#e5c07b', title: $t('chrome.tabbar.tab3') },
		{ id: 4, label: $t('common.tabName.4'), color: '#98c379', title: $t('chrome.tabbar.tab4') },
		{ id: 5, label: $t('common.tabName.5'), color: '#d19a66', title: $t('chrome.tabbar.tab5') },
		{ id: 6, label: $t('common.tabName.6'), color: '#61afef', title: $t('chrome.tabbar.tab6') },
		{ id: 7, label: $t('common.tabName.7'), color: '#98c379', title: $t('chrome.tabbar.tab7') }
	]);

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

	/* Tab names collapse to bare numbers (the active one keeps its name) when
	   the row no longer fits the strip. Decided by measuring, not by a fixed
	   container-query width: the names are translated, and a Japanese
	   "1:ゲストブック" is twice as wide as "1:guestbook", so one threshold
	   measured for English put the strip into a sideways scroll in every other
	   language. Names are shown for the measurement and hidden again if the
	   full row is wider than the space, which is exactly the question. */
	let namesCollapsed = $state(false);
	function fitNames() {
		const row = tabsRow;
		const strip = tabStrip;
		if (!row || !strip) return;
		strip.classList.remove('names-off');
		const fits = row.scrollWidth <= strip.clientWidth + 1;
		strip.classList.toggle('names-off', !fits);
		namesCollapsed = !fits;
	}

	$effect(() => {
		const row = tabsRow;
		const strip = tabStrip;
		if (!row || !strip) return;
		// Watch both: the row's own box (a tab actually resized, or its label
		// changed language) and the strip (the available width changed) -- the
		// row alone can lag a frame behind the strip. Fit first, then place the
		// indicator on the post-collapse layout. Toggling the class changes the
		// row's size, which re-fires this once more; the second pass measures
		// the same answer and changes nothing, so it settles.
		const ro = new ResizeObserver(() => {
			fitNames();
			placeIndicator();
		});
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
     and the right-hand cluster (CONSOLE/GUIDE/CFG text, the serverless
     badge) used to shed on two unrelated systems: the tab labels reacted to the tabstrip's own container width, the right cluster
     reacted to the viewport's width via 2xl:. Those two didn't move
     together -- the sidebar alone can shrink the tabstrip's real width
     without the viewport changing at all, so at plenty of real widths the
     tabs had already collapsed to bare numbers while GUIDE/CFG/PLAY
     still carried full text, and the two sides fought over space that
     wasn't there, clipping the right cluster. One root, one ladder, sheds
     least-essential first: the serverless badge, then every button's text
     (icon/bracket only survives), then finally the tab names collapse to
     bare numbers -- by then there's real room again. -->
<header
	class="header-fit w-full max-w-full {themeStyles.headerBgVideo} px-2 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between font-bold text-xs sm:text-sm tracking-wider border {themeStyles.border} rounded-t-sm mb-1.5 sm:mb-2 gap-1.5"
>
	<!-- The mark sits outside the scrolling strip, as its own flex item: it is
	     the way back to the index, not one of the things being scrolled past,
	     and inside the strip it slid off the left edge the moment the tabs
	     overflowed -- exactly when a way home is most useful. -->
	<a
		href="/"
		title={$t('chrome.tabbar.logoTitle')}
		class="press bg-black/40 px-0.5 rounded flex items-center shrink-0 hover:bg-black/60 transition-colors"
	>
		<!-- Sized against the tab buttons' own line box (30px including their
		     padding, measured against the CONSOLE button) rather than guessed --
		     this is as large as the mark can go without growing the header. -->
		<KrszLogo size={30} />
	</a>

	<!-- Pinned beside the mark for the same reason: the console opens over any
	     view, so its handle belongs with the fixed chrome rather than among the
	     tabs it scrolls away with. -->
	<button
		onclick={() => {
			toggleConsoleOverlay();
			playSound('toggle');
		}}
		data-tour="console-btn"
		title={$t('chrome.tabbar.consoleTitle')}
		class="press px-2 py-0.5 sm:py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 text-xs sm:text-sm font-bold border {$consoleOverlayOpen
			? 'border-[#98c379] bg-[#98c379]/20 text-[#98c379]'
			: 'border-[#98c379]/50 text-[#98c379] hover:bg-[#98c379]/20'}"
	>
		<span class="btnlabel">[~]&nbsp;{$t('chrome.tabbar.console')}</span><span class="btnlabel-off">[~]</span>
	</button>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- The strip is a container query root: below the width where all eight
	     full labels fit, tabs collapse to their number and only the active one
	     keeps its name -- the row stays one line, no clipping, no hidden
	     sideways scroll to discover. -->
	<div
		bind:this={tabStrip}
		onwheel={onStripWheel}
		class="tabstrip flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1"
		class:names-off={namesCollapsed}
	>
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
					{tab.id}<span class="tabname" class:on={activeTab === tab.id}>:{tab.label}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="flex items-center gap-1.5 sm:gap-3 shrink-0 text-xs sm:text-sm pl-1">
		<button
			onclick={togglePlayback}
			title={$t('chrome.tabbar.playbackTitle')}
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
				<!-- The word sheds with every other button label; the bracket and the
				     glyph stay, so the control keeps its shape and its state. -->
				<span class="btnlabel">{$isSeqPlaying ? $t('chrome.tabbar.stop') : $t('chrome.tabbar.play')}</span><span>]</span>
			</span>
		</button>
		<button
			onclick={() => {
				openOnboardingNow('site-tour');
				playSound('click');
			}}
			data-tour="guide-btn"
			title={$t('chrome.tabbar.guideTitle')}
			class="press px-2 py-0.5 sm:py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 text-xs sm:text-sm font-bold border border-[#61afef]/50 text-[#61afef] hover:bg-[#61afef]/20"
		>
			<span class="btnlabel">[?]&nbsp;{$t('chrome.tabbar.guide')}</span><span class="btnlabel-off">[?]</span>
		</button>
		<button
			onclick={() => {
				globalSettingsOpen.set(true);
				playSound('click');
			}}
			title={$t('chrome.tabbar.settingsTitle')}
			class="press px-2 py-0.5 sm:py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 text-xs sm:text-sm font-bold border border-white/25 text-white/60 hover:border-[#56b6c2] hover:text-[#56b6c2] hover:bg-[#56b6c2]/20"
		>
			[{$t('chrome.tabbar.cfg')}]
		</button>
		<span
			title={$t('chrome.tabbar.serverlessTitle')}
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

	/* Sheds least-essential first. The serverless badge is pure status
	   trivia -- gone first. Then every button's text label, down to
	   icon/bracket-only (CONSOLE/GUIDE/CFG/PLAY all keep their
	   bracket so the row doesn't visually shrink to nothing, only the word
	   inside goes). Tab names are the last thing to collapse to bare numbers,
	   since which view is active matters more than any of the chrome around
	   it -- by the time it's this tight, the button labels are already gone
	   and there is real room again. */
	/* Each threshold sits just above the width at which the row it protects
	   would actually start scrolling, measured against the pixel face the site
	   is set in -- Jelly's cell is 6px where the old outline mono was 7.2px, so
	   everything fits roughly 300px narrower than it used to and the previous
	   values collapsed the bar while a third of the row was still empty.

	   Measured overflow points, with everything above each stage already
	   hidden: all visible 1600 · badge gone 1040 · button words gone 910. Each
	   rule fires a little before its own number so a stage never has to share a
	   pixel with the scroll it exists to prevent. (Tab names are the exception:
	   their width depends on the language, so they are measured, not
	   thresholded.) */
	.btnlabel-off { display: none; }
	@container header-fit (max-width: 1660px) {
		.servbadge { display: none; }
	}
	@container header-fit (max-width: 1050px) {
		.btnlabel { display: none; }
		.btnlabel-off { display: inline; }
	}
	/* The active tab keeps its name at every width -- which view you are on is
	   worth more than the four characters it costs. Set by fitNames() from a
	   measurement rather than a container width (see the script). */
	.tabstrip.names-off .tabname:not(.on) { display: none; }
</style>
