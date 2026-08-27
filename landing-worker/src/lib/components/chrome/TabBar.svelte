<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { playSound } from '../../sound';
	import { setMuted } from '../../stores/sound';
	import { isSeqPlaying, cursorStep, play, stop } from '../../stores/synth-transport';
	import { theme, cycleTheme, THEME_STYLES } from '../../stores/theme';
	import { spinnerFrame } from '../../stores/clock';
	import { tabIndexFromPath, TAB_ROUTES } from '../../routes-map';

	let activeTab = $derived(tabIndexFromPath(page.url.pathname));
	let themeStyles = $derived(THEME_STYLES[$theme]);

	const TABS = [
		{ id: 0, label: '0:modules', color: '#56b6c2', title: 'View 0: Modules — Live Project Portal & Technical Deep Dives [Hotkey: 0]' },
		{ id: 1, label: '1:guestbook', color: '#e06c75', title: 'View 1: Guestbook — Distributed Edge Packet Messenger [Hotkey: 1]' },
		{ id: 2, label: '2:synth', color: '#c678dd', title: 'View 2: Synth — 8-Track WebAudio Modular Synthesizer & Sequencer [Hotkey: 2]' },
		{ id: 3, label: '3:utilities', color: '#e5c07b', title: 'View 3: Utilities — Keyboard / Mouse / Display Hardware Testers [Hotkey: 3]' }
	];

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

<header
	class="w-full max-w-full {themeStyles.headerBg} px-2 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between font-bold text-xs sm:text-sm tracking-wider border {themeStyles.border} rounded-t-sm mb-1.5 sm:mb-2 gap-1.5"
>
	<div class="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1">
		<span class="bg-black/40 px-2 sm:px-2.5 py-1 rounded text-xs sm:text-sm text-[#56b6c2] flex items-center gap-1.5 shrink-0">
			<span class="text-[#e5c07b] font-mono">{$spinnerFrame}</span>
			<span>[tmux:edge]</span>
		</span>

		{#each TABS as tab (tab.id)}
			<button
				onclick={() => nav(tab.id)}
				title={tab.title}
				class="px-2 sm:px-3 py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 {activeTab === tab.id
					? 'text-black font-black'
					: 'hover:bg-white/10 text-[#d8dee9]'}"
				style={activeTab === tab.id ? `background-color: ${tab.color}` : undefined}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<div class="flex items-center gap-1.5 sm:gap-3 shrink-0 text-xs sm:text-sm pl-1">
		<button
			onclick={togglePlayback}
			title="Master Audio & Sequencer Playback Toggle — Start / Stop Music & Sound Engine"
			class="px-2 py-0.5 sm:py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 text-xs sm:text-sm font-black border {$isSeqPlaying
				? 'border-[#e06c75] bg-[#e06c75]/10 text-[#e06c75] hover:bg-[#e06c75] hover:text-black shadow-[0_0_8px_#e06c75]'
				: 'border-[#98c379] bg-[#98c379]/10 text-[#98c379] hover:bg-[#98c379] hover:text-black'}"
		>
			<!-- SVG glyph instead of ►/■ text — the font glyphs sit off the text baseline -->
			<span class="inline-flex items-center gap-1">
				<span>[</span>
				{#if $isSeqPlaying}
					<svg width="8" height="8" viewBox="0 0 8 8" class="shrink-0"><rect x="1" y="1" width="6" height="6" fill="currentColor" /></svg>
				{:else}
					<svg width="8" height="8" viewBox="0 0 8 8" class="shrink-0"><path d="M1.5 0.6 L7.2 4 L1.5 7.4 Z" fill="currentColor" /></svg>
				{/if}
				<span>{$isSeqPlaying ? 'STOP]' : 'PLAY]'}</span>
			</span>
		</button>
		<button
			onclick={cycleTheme}
			title="Color Theme Switcher — Cycle palette (Tokyo Matte, Gruvbox Dark, Nord Terminal, Cyber Amber) [Hotkey: T]"
			class="hover:underline cursor-pointer hidden sm:inline text-[#e5c07b]">[THEME: {$theme.toUpperCase()}]</button
		>
		<span
			title="Architecture Status — 100% Serverless Edge execution without dedicated backend origin servers"
			class="bg-black/40 px-2 py-0.5 text-[#56b6c2] hidden lg:inline">100%_SERVERLESS</span
		>
	</div>
</header>
