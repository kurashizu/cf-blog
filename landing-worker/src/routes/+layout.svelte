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
	import TabBar from '$lib/components/chrome/TabBar.svelte';
	import Sidebar from '$lib/components/chrome/Sidebar.svelte';
	import TelemetryFooter from '$lib/components/chrome/TelemetryFooter.svelte';
	import CommandConsole from '$lib/components/chrome/CommandConsole.svelte';

	let { children } = $props();

	let activeTab = $derived(tabIndexFromPath(page.url.pathname));
	let themeStyles = $derived(THEME_STYLES[$theme]);

	function handleKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		const isInput = ['input', 'textarea'].includes(target?.tagName?.toLowerCase() ?? '');
		if (isInput) return;

		const key = e.key.toLowerCase();
		if (key >= '0' && key <= '2') {
			goto(TAB_ROUTES[Number(key)]);
			playSound('click');
			return;
		}
		if (key === 't') {
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

		<div
			class="col-span-12 lg:col-span-9 xl:col-span-9 border {themeStyles.border} {activeTab === 2
				? 'p-2 sm:p-3 space-y-1.5'
				: 'p-2.5 sm:p-3.5 space-y-2'} flex flex-col justify-between {themeStyles.cardBg} rounded-sm min-h-0 overflow-y-auto custom-scrollbar"
		>
			{@render children()}

			{#if activeTab !== 2}
				<CommandConsole />
			{/if}
		</div>
	</div>

	<TelemetryFooter />
</div>
