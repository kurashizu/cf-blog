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
	import TabBar from '$lib/components/chrome/TabBar.svelte';
	import Sidebar from '$lib/components/chrome/Sidebar.svelte';
	import TelemetryFooter from '$lib/components/chrome/TelemetryFooter.svelte';
	import CommandConsole from '$lib/components/chrome/CommandConsole.svelte';

	let { children } = $props();

	let activeTab = $derived(tabIndexFromPath(page.url.pathname));
	let themeStyles = $derived(THEME_STYLES[$theme]);
	let consoleOverlayOpen = $state(false);

	function handleKeydown(e: KeyboardEvent) {
		if ($suspendNavHotkeys) return;

		// Quake-style console: backquote toggles from anywhere, Esc closes —
		// both work even while the console's own input has focus.
		if (e.code === 'Backquote' && !e.metaKey && !e.ctrlKey && !e.altKey) {
			e.preventDefault();
			consoleOverlayOpen = !consoleOverlayOpen;
			playSound('toggle');
			return;
		}
		if (e.key === 'Escape' && consoleOverlayOpen) {
			consoleOverlayOpen = false;
			return;
		}

		// Tab navigation on Ctrl+0..3 — bare digits collided with the QWERTY piano,
		// typing test and console input. Ctrl+digit types nothing, so it works even
		// while the console input has focus.
		if (e.ctrlKey && !e.metaKey && !e.altKey && e.code >= 'Digit0' && e.code <= 'Digit3') {
			e.preventDefault();
			goto(TAB_ROUTES[Number(e.code.slice(-1))]);
			playSound('click');
			return;
		}

		const target = e.target as HTMLElement | null;
		const isInput = ['input', 'textarea'].includes(target?.tagName?.toLowerCase() ?? '');
		if (isInput) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;

		if (e.key.toLowerCase() === 't') {
			cycleTheme();
		}
	}

	onMount(() => {
		const stopClock = initClock();
		const stopTransport = initTransport();
		window.addEventListener('keydown', handleKeydown);

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

		<div class="col-span-12 lg:col-span-9 xl:col-span-9 border {themeStyles.border} flex flex-col {themeStyles.cardBg} rounded-sm min-h-0 lg:overflow-hidden">
			<!-- Only the page content scrolls — the console stays pinned below it -->
			<div
				class="flex-1 min-h-0 lg:overflow-y-auto custom-scrollbar {activeTab === 2
					? 'p-2 sm:p-3 space-y-1.5'
					: 'p-2.5 sm:p-3.5 space-y-2'} flex flex-col"
			>
				{@render children()}
			</div>

			<!-- Console only on modules/guestbook — synth needs the space, and the
			     utilities testers need raw keyboard/mouse input without an autofocused field -->
			{#if activeTab <= 1}
				<div class="shrink-0 px-2.5 sm:px-3.5 pb-2.5 sm:pb-3.5">
					<CommandConsole />
				</div>
			{/if}
		</div>
	</div>

	<TelemetryFooter />
</div>

{#if consoleOverlayOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-[140] bg-black/50" onclick={() => (consoleOverlayOpen = false)}></div>
	<div class="fixed inset-x-0 top-0 z-[150] {themeStyles.headerBg} border-b-2 {themeStyles.border} shadow-[0_12px_32px_rgba(0,0,0,0.8)] px-3 sm:px-4 pt-2 pb-3">
		<div class="flex items-center justify-between text-xs font-mono font-bold pb-1">
			<span style="color: {themeStyles.cursorColor}">~ KRSZ CONSOLE // DROP-DOWN</span>
			<span class="text-white/40">` or Esc to close</span>
		</div>
		<CommandConsole variant="overlay" />
	</div>
{/if}
