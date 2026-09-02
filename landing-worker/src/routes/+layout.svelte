<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { playSound } from '$lib/sound';
	import '../app.css';
	import { cycleTheme, THEME_STYLES, THEME_CSS_VARS, resolvedTheme, refreshAutoTheme } from '$lib/stores/theme';
	import { initClock } from '$lib/stores/clock';
	import { initTransport } from '$lib/stores/synth-transport';
	import { tabIndexFromPath, TAB_ROUTES, navigateTo } from '$lib/routes-map';
	import { suspendNavHotkeys } from '$lib/stores/hotkeys';
	import { initConsoleState } from '$lib/stores/console';
	import { loadEdgeTrace } from '$lib/stores/edge';
	import { consoleOverlayOpen, hotkeyOverlayOpen, guideOpen, bootOpen, globalSettingsOpen, welcomeOpen } from '$lib/stores/chrome';
	import { performanceMode, initPerformanceMode } from '$lib/stores/performance';
	import TabBar from '$lib/components/chrome/TabBar.svelte';
	import ThemeBackgroundVideo from '$lib/components/chrome/ThemeBackgroundVideo.svelte';
	import Sidebar from '$lib/components/chrome/Sidebar.svelte';
	import TelemetryFooter from '$lib/components/chrome/TelemetryFooter.svelte';
	import CommandConsole from '$lib/components/chrome/CommandConsole.svelte';
	import HotkeyOverlay from '$lib/components/chrome/HotkeyOverlay.svelte';
	import BootSequence from '$lib/components/chrome/BootSequence.svelte';
	import Onboarding from '$lib/components/chrome/Onboarding.svelte';
	import Welcome from '$lib/components/chrome/Welcome.svelte';
	import GlobalSettings from '$lib/components/chrome/GlobalSettings.svelte';

	let { children } = $props();

	let activeTab = $derived(tabIndexFromPath(page.url.pathname));
	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);
	/* app.css declares these on :root as the tokyo-matte values (the default),
	   for styling that reads the CSS variables directly rather than through
	   THEME_STYLES' Tailwind classes -- lifelab's own stylesheet, chiefly.
	   Pushed onto the real :root (not a wrapper div) so html/body's own
	   background-color: var(--bg) picks it up too, not just content inside
	   this component. */
	$effect(() => {
		const vars = THEME_CSS_VARS[$resolvedTheme];
		for (const [k, v] of Object.entries(vars)) {
			document.documentElement.style.setProperty(k, v);
		}
	});
	/* Same :root[data-perf] pattern as the theme -- app.css's performance-mode
	   block reads this attribute, not the store directly, so no component
	   outside this layout needs to know performance mode exists. */
	$effect(() => {
		document.documentElement.dataset.perf = $performanceMode ? 'on' : 'off';
	});
	let bootVisible = $state(false);
	/* Mirrored into a store so a view's own walkthrough can wait for the screen
	   to be clear -- the POST screen is shown before the site tour is offered,
	   so a view tour that only checked the tour would open behind it. */
	$effect(() => bootOpen.set(bootVisible));

	const GUIDE_KEY = 'krsz.guide.seen';
	const WELCOME_KEY = 'krsz.welcome.seen';

	/** The walkthrough is offered once, then only on request. */
	function showGuideIfNew() {
		try {
			if (localStorage.getItem(GUIDE_KEY) !== '1') guideOpen.set(true);
		} catch {
			/* private mode — skip the guide rather than block the page */
		}
	}

	function closeGuide() {
		guideOpen.set(false);
		try {
			localStorage.setItem(GUIDE_KEY, '1');
		} catch {
			/* nothing to remember it with; it will offer again next visit */
		}
	}

	/** A full-screen "let's get started" ahead of the anchored tour, shown once
	 *  on a first visit -- the tour alone points at chrome that means nothing
	 *  until you know what the site even is. Returning visitors (or anyone who
	 *  already saw it) skip straight to the existing guide gate below. */
	function closeWelcome() {
		welcomeOpen.set(false);
		try {
			localStorage.setItem(WELCOME_KEY, '1');
		} catch {
			/* nothing to remember it with; it will offer again next visit */
		}
		showGuideIfNew();
	}

	function dismissBoot() {
		bootVisible = false;
		let seenWelcome = true;
		try {
			seenWelcome = localStorage.getItem(WELCOME_KEY) === '1';
		} catch {
			/* private mode — treat as seen so at least the tour still offers itself */
		}
		if (seenWelcome) showGuideIfNew();
		else welcomeOpen.set(true);
	}

	function handleKeydown(e: KeyboardEvent) {
		// Tab navigation on Ctrl+0..7 — the universal escape hatch. It types
		// nothing, so it works with the console input focused, and it ignores
		// suspendNavHotkeys so the keyboard tester / QWERTY piano / screen test
		// can never trap you on their tab.
		if (e.ctrlKey && !e.metaKey && !e.altKey && e.code >= 'Digit0' && e.code <= 'Digit7') {
			e.preventDefault();
			navigateTo(TAB_ROUTES[Number(e.code.slice(-1))], goto);
			playSound('click');
			return;
		}

		// F1 reaches the keymap even from a focused console input, where "?" types.
		if (e.key === 'F1') {
			e.preventDefault();
			hotkeyOverlayOpen.update((v) => !v);
			playSound('toggle');
			return;
		}

		if ($suspendNavHotkeys) return;

		// Quake-style console: backquote toggles from anywhere, Esc closes —
		// both work even while the console's own input has focus.
		if (e.code === 'Backquote' && !e.metaKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			consoleOverlayOpen.update((v) => !v);
			playSound('toggle');
			return;
		}
		if (e.key === 'Escape') {
			if ($guideOpen) {
				closeGuide();
				return;
			}
			if ($hotkeyOverlayOpen) {
				hotkeyOverlayOpen.set(false);
				return;
			}
			if ($consoleOverlayOpen) {
				consoleOverlayOpen.set(false);
				return;
			}
		}

		const target = e.target as HTMLElement | null;
		const isInput = ['input', 'textarea'].includes(target?.tagName?.toLowerCase() ?? '');
		if (isInput) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;

		if (e.key === '?') {
			e.preventDefault();
			hotkeyOverlayOpen.update((v) => !v);
			playSound('toggle');
			return;
		}

		if (e.key.toLowerCase() === 't') {
			cycleTheme();
		}
	}

	onMount(() => {
		const stopClock = initClock();
		const stopTransport = initTransport();
		initConsoleState();
		initPerformanceMode();
		window.addEventListener('keydown', handleKeydown);

		// The auto theme only ever changes on the hour, but a minute-granularity
		// poll is cheap and means it never waits for a re-render triggered by
		// something else to notice the hour turned over.
		refreshAutoTheme();
		const themeInterval = setInterval(refreshAutoTheme, 60_000);

		// POST runs on every page load — it is short, skippable with any key, and
		// never shown to reduced-motion users. Tab switches are client-side
		// navigation, so it does not reappear when moving between views.
		const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!reducedMotion) bootVisible = true;
		else showGuideIfNew();

		// Idempotent and shared with the POST screen's own call — the footer must
		// still fill in when the boot screen is skipped or dismissed early.
		loadEdgeTrace();

		return () => {
			stopClock();
			stopTransport();
			clearInterval(themeInterval);
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<svelte:head>
	<title>KRSZ™ — Kurashizu's Random-Stuff Zone | Serverless Edge Portal</title>
</svelte:head>

<ThemeBackgroundVideo />

<div class="relative z-10 w-full min-h-screen lg:h-screen lg:max-h-screen overflow-x-hidden lg:overflow-hidden font-mono text-sm sm:text-base {themeStyles.text} flex flex-col justify-between select-none p-1.5 sm:p-3 md:p-4 transition-colors duration-200">
	<TabBar />

	<div class="grid grid-cols-12 lg:grid-cols-[repeat(24,minmax(0,1fr))] gap-1.5 sm:gap-2 flex-1 min-h-0 w-full max-w-full">
		<!-- Sidebar renders first for the desktop grid, but on a phone it would push
		     the actual view a whole screen down, so order puts content first there. -->
		<Sidebar />

		<!-- Below lg the grid gives each item its own auto-sized row rather than a
		     shared height, so a canvas view with no text content to size against
		     collapsed to a sliver a few pixels tall. min-h-[70svh] gives the panel
		     a floor on a phone; lg:min-h-0 leaves the desktop flex layout alone.
		     transform-gpu forces its own compositing layer -- Safari has a long-
		     standing bug where content near a backdrop-filter (cardBgVideo's blur)
		     stops repainting after certain layout changes, leaving stale/blank
		     pixels until something forces a repaint. Promoting the layer sidesteps
		     it; without it, resizing the window enough times left whole synth rack
		     modules rendering empty in Safari despite their content being intact
		     in the DOM. -->
		<div data-tour="panel" class="order-1 lg:order-none col-span-12 lg:col-[span_19_/_span_19] border {themeStyles.border} flex flex-col {themeStyles.cardBgVideo} rounded-sm min-h-[70svh] lg:min-h-0 lg:overflow-hidden transform-gpu">
			<!-- The console lives only in the drop-down overlay now, so every view
			     gets the full panel and no view has an autofocused input competing
			     with the keyboard testers or the QWERTY piano. -->
			<div
				class="flex-1 min-h-0 lg:overflow-y-auto custom-scrollbar {activeTab === 2
					? 'p-2 sm:p-3 space-y-1.5'
					: 'p-2.5 sm:p-3.5 space-y-2'} flex flex-col"
			>
				<!-- Switching tabs already unmounts the old view and mounts the new one
				     (they are different route components, not one kept alive) -- the
				     only thing missing was any transition on top of that swap, which
				     made it a hard cut. Keying on the pathname plays a short cross-fade
				     across it without changing what was already happening underneath;
				     nothing here keeps a stateful view (synth's audio graph, the VM,
				     chatbot's model) alive any differently than before. -->
				{#key page.url.pathname}
					<div class="flex-1 min-h-0 flex flex-col" in:fade={{ duration: 160, delay: 60 }} out:fade={{ duration: 90 }}>
						{@render children()}
					</div>
				{/key}
			</div>
		</div>
	</div>

	<TelemetryFooter />
</div>

{#if $consoleOverlayOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[140] bg-black/50" onclick={() => consoleOverlayOpen.set(false)} transition:fade={{ duration: 150 }}></div>
	<div
		class="fixed inset-x-0 top-0 z-[150] {themeStyles.headerBg} border-b-2 {themeStyles.border} shadow-[0_12px_32px_rgba(0,0,0,0.8)] px-3 sm:px-4 pt-2 pb-3"
		transition:fly={{ y: -16, duration: 180, opacity: 0 }}
	>
		<div class="flex items-center justify-between text-xs font-mono font-bold pb-1">
			<span style="color: {themeStyles.cursorColor}">~ KRSZ CONSOLE // DROP-DOWN</span>
			<span class="text-white/40">` or Esc to close</span>
		</div>
		<CommandConsole />
	</div>
{/if}

{#if $hotkeyOverlayOpen}
	<HotkeyOverlay onClose={() => hotkeyOverlayOpen.set(false)} />
{/if}

{#if $globalSettingsOpen}
	<GlobalSettings onClose={() => globalSettingsOpen.set(false)} />
{/if}

{#if $guideOpen}
	<Onboarding onClose={closeGuide} />
{/if}

{#if $welcomeOpen}
	<Welcome onDone={closeWelcome} />
{/if}

{#if bootVisible}
	<BootSequence onDone={dismissBoot} />
{/if}
