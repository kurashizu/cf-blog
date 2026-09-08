<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { fade, fly } from '$lib/perf-transitions';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { goto, afterNavigate } from '$app/navigation';
	import { playSound } from '$lib/sound';
	import '../app.css';
	import { cycleTheme, THEME_STYLES, THEME_CSS_VARS, resolvedTheme, refreshAutoTheme } from '$lib/stores/theme';
	import { initClock } from '$lib/stores/clock';
	import { initTransport } from '$lib/stores/synth-transport';
	import { tabIndexFromPath, TAB_ROUTES, navigateTo } from '$lib/routes-map';
	import { suspendNavHotkeys, consoleHotkeyWhileSuspended } from '$lib/stores/hotkeys';
	import { initConsoleState } from '$lib/stores/console';
	import { loadEdgeTrace } from '$lib/stores/edge';
	import {
		consoleOverlayOpen,
		hotkeyOverlayOpen,
		globalSettingsOpen,
		privacyOpen,
		creditsOpen,
		enqueueOnboarding,
		dequeueOnboarding,
		openOnboardingNow,
		isOnboardingActive
	} from '$lib/stores/chrome';
	import { performanceMode, initPerformanceMode } from '$lib/stores/performance';
	import { textSize, initTextSize } from '$lib/stores/text-scale';
	import { initA11y, singleKeyHotkeys, motionReduced, announce } from '$lib/stores/a11y';
	import { modal } from '$lib/actions/modal';
	import { initLocale, t } from '$lib/i18n';
	import TabBar from '$lib/components/chrome/TabBar.svelte';
	import ThemeBackgroundVideo from '$lib/components/chrome/ThemeBackgroundVideo.svelte';
	import Sidebar from '$lib/components/chrome/Sidebar.svelte';
	import TelemetryFooter from '$lib/components/chrome/TelemetryFooter.svelte';
	import CommandConsole from '$lib/components/chrome/CommandConsole.svelte';
	import HotkeyOverlay from '$lib/components/chrome/HotkeyOverlay.svelte';
	import BootSequence from '$lib/components/chrome/BootSequence.svelte';
	import Onboarding from '$lib/components/chrome/Onboarding.svelte';
	import Welcome from '$lib/components/chrome/Welcome.svelte';
	import PrivacyNotice from '$lib/components/chrome/PrivacyNotice.svelte';
	import GlobalSettings from '$lib/components/chrome/GlobalSettings.svelte';
	import CreditsDialog from '$lib/components/chrome/CreditsDialog.svelte';
	import LiveRegion from '$lib/components/chrome/LiveRegion.svelte';

	/* Read at init rather than in an effect: bootVisible's own initialiser
	   consults it, and an effect would run after the first paint -- which is
	   the flicker this is here to prevent. */
	const PREFERS_REDUCED_MOTION =
		(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
		/* The site's own switch (stores/a11y.ts) -- read raw here for the same
		   before-first-paint reason; initA11y() loads it properly in onMount. */
		(() => {
			try {
				return localStorage.getItem('krsz.a11y.reduceMotion') === '1';
			} catch {
				return false;
			}
		})();

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
	/* Same again for reduced motion: app.css keys its manual-switch twin of
	   the prefers-reduced-motion block on this attribute. */
	$effect(() => {
		document.documentElement.dataset.motion = $motionReduced ? 'reduce' : 'full';
	});
	/* One root font-size drives the whole type scale, which is written in rem
	   (tailwind.config.js) -- so the CFG text-size setting moves the site
	   proportionally without any view knowing the setting exists. */
	$effect(() => {
		document.documentElement.style.fontSize = `${$textSize}px`;
	});
	/* Starts true, not false.
	   The POST screen used to be switched on in onMount, which is after
	   hydration -- so every load painted the full page for a frame and then
	   dropped the boot screen over it, which read as the site flickering rather
	   than starting up. It covers the page from the first paint now, and the
	   two cases that should not see it (reduced motion, and SSR where there is
	   no client to dismiss it) turn it off instead.
	   `browser` guards SSR: rendered on the server this would ship a boot
	   screen into the prerendered HTML that nothing would ever take down for a
	   visitor with JS disabled. */
	let bootVisible = $state(browser && !PREFERS_REDUCED_MOTION);
	/* A first visit stacks boot -> welcome -> site tour -> (if landing on a
	   view with its own tour) that view's tour, and only one may ever be on
	   screen. These used to be independent booleans, each handoff closing one
	   and opening the next by hand, and every handoff was a place the outgoing
	   flag could clear before the incoming one was set -- a window, however
	   brief, where nothing (or momentarily the wrong two things) read as
	   showing. A view's own tour gates on "is nothing else showing", so it
	   could slip through exactly in that window and open under, or alongside,
	   whatever opened a tick later. See onboardingQueue in stores/chrome.ts.
	   Boot is enqueued here, synchronously, at this component's own init --
	   before any child mounts -- rather than in an $effect (which runs after
	   the mount pass): a child view's onMount enqueues its own tour immediately,
	   and it needs boot already in the queue ahead of it or it would front-run. */
	if (browser && !PREFERS_REDUCED_MOTION) enqueueOnboarding('boot');
	/* Language resolves here, synchronously, for the same reason: the boot
	   screen and every child view read it at their own init. SSR stays English
	   (prerendered, no Accept-Language to read); hydration patches the text. */
	if (browser) initLocale();

	const GUIDE_KEY = 'krsz.guide.seen';
	const WELCOME_KEY = 'krsz.welcome.seen';
	let guideActive = isOnboardingActive('site-tour');
	let welcomeActive = isOnboardingActive('welcome');

	/** The walkthrough is offered once, then only on request. */
	function showGuideIfNew() {
		try {
			if (localStorage.getItem(GUIDE_KEY) !== '1') enqueueOnboarding('site-tour');
		} catch {
			/* private mode — skip the guide rather than block the page */
		}
	}

	/* Onboarding.svelte's closing step (SITE_STEPS' closeAndRun) opens the
	   keymap as its finale, and runs that action before calling this -- so if
	   the keymap is open right now, this close is that finale, and the tour
	   is not really "over" until the keymap closes too: dequeuing 'site-tour'
	   here would let the next queued stage (a view's own tour) become active
	   while the keymap is still what is actually covering the screen. Wait
	   for hotkeyOverlayOpen to drop before dequeuing in that case; any other
	   close (Esc, the [x], a non-final step) dequeues immediately. */
	function closeGuide() {
		try {
			localStorage.setItem(GUIDE_KEY, '1');
		} catch {
			/* nothing to remember it with; it will offer again next visit */
		}
		if (!get(hotkeyOverlayOpen)) {
			dequeueOnboarding('site-tour');
			return;
		}
		const stop = hotkeyOverlayOpen.subscribe((open) => {
			if (open) return;
			dequeueOnboarding('site-tour');
			queueMicrotask(() => stop());
		});
	}

	/** A full-screen "let's get started" ahead of the anchored tour, shown once
	 *  on a first visit -- the tour alone points at chrome that means nothing
	 *  until you know what the site even is. Its own CTA doubles as agreeing
	 *  to the privacy notice linked beside it -- there's no separate consent
	 *  gate, clicking "let's get started" is the one action that means both.
	 *  Returning visitors (or anyone who already saw it) skip straight to the
	 *  existing guide gate below. */
	function closeWelcome() {
		try {
			localStorage.setItem(WELCOME_KEY, '1');
		} catch {
			/* nothing to remember it with; it will offer again next visit */
		}
		showGuideIfNew();
		dequeueOnboarding('welcome');
	}

	function dismissBoot() {
		bootVisible = false;
		dequeueOnboarding('boot');
		let seenWelcome = true;
		try {
			seenWelcome = localStorage.getItem(WELCOME_KEY) === '1';
		} catch {
			/* private mode — treat as seen so at least the tour still offers itself */
		}
		if (seenWelcome) showGuideIfNew();
		else enqueueOnboarding('welcome');
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

		// Quake-style console: backquote toggles from anywhere, Esc closes —
		// both work even while the console's own input has focus. A view that
		// owns the keyboard blocks it unless it says the key is free (LIFE.LAB).
		if (
			e.code === 'Backquote' &&
			!e.metaKey &&
			!e.ctrlKey &&
			!e.altKey &&
			$singleKeyHotkeys &&
			(!$suspendNavHotkeys || $consoleHotkeyWhileSuspended)
		) {
			e.preventDefault();
			consoleOverlayOpen.update((v) => !v);
			playSound('toggle');
			return;
		}

		if ($suspendNavHotkeys) return;
		if (e.key === 'Escape') {
			// Checked first: the tour's finale opens this overlay and is still
			// "active" (queue-wise) until it closes, so if the tour branch ran
			// first here, Esc on the finale would re-enter closeGuide() instead
			// of ever reaching this and closing the overlay it is waiting on.
			if ($hotkeyOverlayOpen) {
				hotkeyOverlayOpen.set(false);
				return;
			}
			if ($guideActive) {
				closeGuide();
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
		// The bare printable shortcuts can be switched off (WCAG 2.1.4); F1 and
		// Ctrl+digit above are the paths that stay.
		if (!$singleKeyHotkeys) return;

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

	/* A client-side navigation changes what fills the panel but moves focus
	   nowhere, so a screen reader hears nothing and the keyboard is left on a
	   tab button that now belongs to a different view. Standard SPA remedy:
	   put focus on the <main> (tabindex=-1, no ring) and say which view this
	   is. Skipped on the initial load, where the document itself is announced. */
	let mainEl: HTMLElement | undefined = $state();
	afterNavigate((nav) => {
		if (nav.type === 'enter') return;
		const idx = tabIndexFromPath(nav.to?.url.pathname ?? '');
		if (idx >= 0) announce($t('a11y.announce.view', { name: $t(`common.tabName.${idx}`) }));
		mainEl?.focus({ preventScroll: true });
	});

	onMount(() => {
		const stopClock = initClock();
		const stopTransport = initTransport();
		initConsoleState();
		initPerformanceMode();
		initTextSize();
		initA11y();
		window.addEventListener('keydown', handleKeydown);

		// The auto theme only ever changes on the hour, but a minute-granularity
		// poll is cheap and means it never waits for a re-render triggered by
		// something else to notice the hour turned over.
		refreshAutoTheme();
		const themeInterval = setInterval(refreshAutoTheme, 60_000);

		// POST runs on every page load — it is short, skippable with any key, and
		// never shown to reduced-motion users. Tab switches are client-side
		// navigation, so it does not reappear when moving between views.
		// bootVisible is already true by now (see its declaration) unless reduced
		// motion turned it off; that case still needs the guide offered.
		if (!bootVisible) showGuideIfNew();

		// Idempotent and shared with the POST screen's own call — the footer must
		// still fill in when the boot screen is skipped or dismissed early.
		loadEdgeTrace();

		/* A deploy's new service worker installs and activates in the background,
		   but it does not control the page that is already open -- only the next
		   navigation gets a client claimed by it. Without this, the fix in
		   service-worker.ts (network-first HTML) still needed two manual reloads:
		   the first triggers the update and is served by the outgoing worker, the
		   second is finally controlled by the new one and shows the new commit.
		   `controller` is null on a first visit (nothing to update from) and a
		   fresh reload is a bad first impression, so this only fires when there
		   was already an active worker -- i.e. an update, not an install. */
		if (browser && navigator.serviceWorker && navigator.serviceWorker.controller) {
			let reloaded = false;
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				if (reloaded) return;
				reloaded = true;
				location.reload();
			});
		}

		return () => {
			stopClock();
			stopTransport();
			clearInterval(themeInterval);
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<svelte:head>
	<title>{$t('chrome.layout.pageTitle')}</title>
</svelte:head>

<ThemeBackgroundVideo />

<a href="#main" class="skip-link font-mono text-xs font-bold">{$t('a11y.skipToContent')}</a>
<LiveRegion />

<div data-app-root class="relative z-10 w-full min-h-screen lg:h-screen lg:max-h-screen overflow-x-hidden lg:overflow-hidden font-mono text-sm sm:text-base {themeStyles.text} flex flex-col justify-between select-none p-1.5 sm:p-3 md:p-4 transition-colors duration-200">
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
		<main
			id="main"
			tabindex="-1"
			bind:this={mainEl}
			aria-label={$t('a11y.landmark.main')}
			data-tour="panel"
			class="order-1 lg:order-none col-span-12 lg:col-[span_19_/_span_19] border {themeStyles.border} flex flex-col {themeStyles.cardBgVideo} rounded-sm min-h-[70svh] lg:min-h-0 lg:overflow-hidden transform-gpu"
		>
			<!-- The page's one h1: every view fills this panel, so the heading is
			     the view's own title, read by assistive tech and nothing else --
			     the visual heading is the tab bar. -->
			<h1 class="sr-only">{$t(`common.tabTitle.${activeTab}`)}</h1>
			<!-- The console lives only in the drop-down overlay now, so every view
			     gets the full panel and no view has an autofocused input competing
			     with the keyboard testers or the QWERTY piano. -->
			<!-- no-gutter: this pane reserved 10px for its scrollbar on every view,
			     whether or not one was there, so every view's right edge stopped 10px
			     inside the header's -- the panel's box and the header's both end on
			     the same line, and this was the whole difference. The bar now takes
			     its space only when it is actually drawn. The trade is that content
			     shifts by 10px on the views that do scroll, at the moment the bar
			     appears; the alignment is worth more than that, and most views either
			     always scroll or never do. -->
			<div
				class="flex-1 min-h-0 lg:overflow-y-auto custom-scrollbar no-gutter {activeTab === 2
					? 'p-2 sm:p-3 space-y-1.5'
					: 'p-2.5 sm:p-3.5 space-y-2'} flex flex-col"
			>
				<!-- Keying on the pathname fades the incoming view in over the swap.
				     There is deliberately no out: transition. An outgoing one keeps the
				     view it is fading in the DOM until it finishes, and if it never
				     finishes -- a background tab throttles the frames that drive it, and
				     a fast second navigation orphans it outright -- the node is never
				     removed. That left the synth, the heaviest view on the site, mounted
				     and laid out on every route visited after it: 576 grid cells still
				     in the layout while lifelab was on screen, permanently. Style recalc
				     is charged on the whole document, so every one of those strays was
				     billed to every click anywhere, which is what made the site feel
				     worse the longer it was used. Dropping out: makes the unmount
				     immediate and unconditional. -->
				{#key page.url.pathname}
					<div class="flex-1 min-h-0 flex flex-col" in:fade={{ duration: 160, delay: 60 }}>
						{@render children()}
					</div>
				{/key}
			</div>
		</main>
	</div>

	<TelemetryFooter />
</div>

{#if $consoleOverlayOpen}
	<!-- The scrim holds the sheet so use:modal (focus, Esc, backdrop click,
	     inert page) can treat the pair as one dialog. -->
	<div
		class="fixed inset-0 z-[140] bg-black/50"
		use:modal={{ onClose: () => consoleOverlayOpen.set(false), label: $t('a11y.dialog.console') }}
		transition:fade={{ duration: 150 }}
	>
		<div
			class="fixed inset-x-0 top-0 z-[150] {themeStyles.headerBgVideo} border-b-2 {themeStyles.border} shadow-[0_12px_32px_rgba(0,0,0,0.8)] px-3 sm:px-4 pt-2 pb-3"
			transition:fly={{ y: -16, duration: 180, opacity: 0 }}
		>
			<div class="flex items-center justify-between text-xs font-mono font-bold pb-1">
				<span style="color: {themeStyles.cursorColor}">~ KRSZ CONSOLE // DROP-DOWN</span>
				<span class="text-white/60">{$t('chrome.layout.consoleCloseHint')}</span>
			</div>
			<CommandConsole />
		</div>
	</div>
{/if}

{#if $hotkeyOverlayOpen}
	<HotkeyOverlay onClose={() => hotkeyOverlayOpen.set(false)} />
{/if}

{#if $globalSettingsOpen}
	<GlobalSettings onClose={() => globalSettingsOpen.set(false)} />
{/if}

{#if $creditsOpen}
	<CreditsDialog onClose={() => creditsOpen.set(false)} />
{/if}

{#if $guideActive}
	<Onboarding onClose={closeGuide} />
{/if}

{#if $welcomeActive}
	<Welcome onDone={closeWelcome} />
{/if}

{#if $privacyOpen}
	<PrivacyNotice onClose={() => privacyOpen.set(false)} />
{/if}

{#if bootVisible}
	<BootSequence onDone={dismissBoot} />
{/if}
