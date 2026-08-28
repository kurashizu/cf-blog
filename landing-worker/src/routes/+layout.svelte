<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { playSound } from '$lib/sound';
	import '../app.css';
	import { theme, cycleTheme, THEME_STYLES } from '$lib/stores/theme';
	import { initClock } from '$lib/stores/clock';
	import { initTransport } from '$lib/stores/synth-transport';
	import { tabIndexFromPath, TAB_ROUTES } from '$lib/routes-map';
	import { suspendNavHotkeys } from '$lib/stores/hotkeys';
	import { initConsoleState } from '$lib/stores/console';
	import { loadEdgeTrace } from '$lib/stores/edge';
	import { consoleOverlayOpen, hotkeyOverlayOpen, guideOpen } from '$lib/stores/chrome';
	import TabBar from '$lib/components/chrome/TabBar.svelte';
	import Sidebar from '$lib/components/chrome/Sidebar.svelte';
	import TelemetryFooter from '$lib/components/chrome/TelemetryFooter.svelte';
	import CommandConsole from '$lib/components/chrome/CommandConsole.svelte';
	import HotkeyOverlay from '$lib/components/chrome/HotkeyOverlay.svelte';
	import BootSequence from '$lib/components/chrome/BootSequence.svelte';
	import Onboarding from '$lib/components/chrome/Onboarding.svelte';

	let { children } = $props();

	let activeTab = $derived(tabIndexFromPath(page.url.pathname));
	let themeStyles = $derived(THEME_STYLES[$theme]);
	let bootVisible = $state(false);

	const GUIDE_KEY = 'krsz.guide.seen';

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

	function dismissBoot() {
		bootVisible = false;
		showGuideIfNew();
	}

	function handleKeydown(e: KeyboardEvent) {
		// Tab navigation on Ctrl+0..4 — the universal escape hatch. It types
		// nothing, so it works with the console input focused, and it ignores
		// suspendNavHotkeys so the keyboard tester / QWERTY piano / screen test
		// can never trap you on their tab.
		if (e.ctrlKey && !e.metaKey && !e.altKey && e.code >= 'Digit0' && e.code <= 'Digit4') {
			e.preventDefault();
			goto(TAB_ROUTES[Number(e.code.slice(-1))]);
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
		window.addEventListener('keydown', handleKeydown);

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
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<svelte:head>
	<title>KRSZ™ — Kurashizu's Random-Stuff Zone | Serverless Edge Portal</title>
</svelte:head>

<div class="w-full min-h-screen lg:h-screen lg:max-h-screen overflow-x-hidden lg:overflow-hidden font-mono text-sm sm:text-base {themeStyles.bg} {themeStyles.text} flex flex-col justify-between select-none p-1.5 sm:p-3 md:p-4 transition-colors duration-200">
	<TabBar />

	<div class="grid grid-cols-12 gap-1.5 sm:gap-2 flex-1 min-h-0 w-full max-w-full">
		<Sidebar />

		<div data-tour="panel" class="col-span-12 lg:col-span-9 xl:col-span-9 border {themeStyles.border} flex flex-col {themeStyles.cardBg} rounded-sm min-h-0 lg:overflow-hidden">
			<!-- The console lives only in the drop-down overlay now, so every view
			     gets the full panel and no view has an autofocused input competing
			     with the keyboard testers or the QWERTY piano. -->
			<div
				class="flex-1 min-h-0 lg:overflow-y-auto custom-scrollbar {activeTab === 2
					? 'p-2 sm:p-3 space-y-1.5'
					: 'p-2.5 sm:p-3.5 space-y-2'} flex flex-col"
			>
				{@render children()}
			</div>
		</div>
	</div>

	<TelemetryFooter />
</div>

{#if $consoleOverlayOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[140] bg-black/50" onclick={() => consoleOverlayOpen.set(false)}></div>
	<div class="fixed inset-x-0 top-0 z-[150] {themeStyles.headerBg} border-b-2 {themeStyles.border} shadow-[0_12px_32px_rgba(0,0,0,0.8)] px-3 sm:px-4 pt-2 pb-3">
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

{#if $guideOpen}
	<Onboarding onClose={closeGuide} />
{/if}

{#if bootVisible}
	<BootSequence onDone={dismissBoot} />
{/if}
