<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { playSound } from '../../sound';
	import { setMuted } from '../../stores/sound';
	import { isSeqPlaying, cursorStep, play, stop } from '../../stores/synth-transport';
	import { theme, cycleTheme, THEME_STYLES } from '../../stores/theme';
	import { tabIndexFromPath, TAB_ROUTES } from '../../routes-map';
	import { consoleOverlayOpen, guideOpen, toggleConsoleOverlay } from '../../stores/chrome';
	import KrszLogo from './KrszLogo.svelte';

	let activeTab = $derived(tabIndexFromPath(page.url.pathname));
	let themeStyles = $derived(THEME_STYLES[$theme]);

	const TABS = [
		{ id: 0, label: '0:modules', color: '#56b6c2', title: 'View 0: Modules — Live Project Portal & Technical Deep Dives [Hotkey: Ctrl+0]' },
		{ id: 1, label: '1:guestbook', color: '#e06c75', title: 'View 1: Guestbook — Distributed Edge Packet Messenger [Hotkey: Ctrl+1]' },
		{ id: 2, label: '2:synth', color: '#c678dd', title: 'View 2: Synth — 8-Track WebAudio Modular Synthesizer & Sequencer [Hotkey: Ctrl+2]' },
		{ id: 3, label: '3:utils', color: '#e5c07b', title: 'View 3: Utilities — Keyboard / Mouse / Display Hardware Testers [Hotkey: Ctrl+3]' },
		{ id: 4, label: '4:leaderboard', color: '#98c379', title: 'View 4: Leaderboard — Artificial Analysis LLM model table, cached through blog.krsz.in [Hotkey: Ctrl+4]' },
		{ id: 5, label: '5:krsz-vm', color: '#d19a66', title: 'View 5: krsz-vm — a real 32-bit x86 PC emulated in the browser, running Alpine Linux [Hotkey: Ctrl+5]' },
		{ id: 6, label: '6:chatbot', color: '#61afef', title: 'View 6: chatbot — a language model running entirely on your GPU via WebGPU, no server [Hotkey: Ctrl+6]' }
	];

	let tabStrip: HTMLDivElement | undefined = $state();

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

<header
	class="w-full max-w-full {themeStyles.headerBg} px-2 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between font-bold text-xs sm:text-sm tracking-wider border {themeStyles.border} rounded-t-sm mb-1.5 sm:mb-2 gap-1.5"
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={tabStrip}
		onwheel={onStripWheel}
		class="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1"
	>
		<a
			href="/"
			title="krsz.in — Kurashizu's Random-Stuff Zone"
			class="bg-black/40 px-1 rounded flex items-center shrink-0 hover:bg-black/60 transition-colors"
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
			class="px-2 py-0.5 sm:py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 text-xs sm:text-sm font-bold border {$consoleOverlayOpen
				? 'border-[#98c379] bg-[#98c379]/20 text-[#98c379]'
				: 'border-[#98c379]/50 text-[#98c379] hover:bg-[#98c379]/20'}"
		>
			<span class="hidden 2xl:inline">[~]&nbsp;CONSOLE</span><span class="2xl:hidden">[~]</span>
		</button>

		<div class="flex items-center gap-1 sm:gap-2" data-tour="tabs">
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
			onclick={() => {
				guideOpen.set(true);
				playSound('click');
			}}
			data-tour="guide-btn"
			title="Open the walkthrough — what each view does and every keyboard shortcut"
			class="px-2 py-0.5 sm:py-1 cursor-pointer rounded transition-colors whitespace-nowrap shrink-0 text-xs sm:text-sm font-bold border border-[#61afef]/50 text-[#61afef] hover:bg-[#61afef]/20"
		>
			<span class="hidden 2xl:inline">[?]&nbsp;GUIDE</span><span class="2xl:hidden">[?]</span>
		</button>
		<button
			onclick={cycleTheme}
			title="Color Theme Switcher — Cycle palette (Tokyo Matte, Gruvbox Dark, Nord Terminal, Cyber Amber) [Hotkey: T]"
			class="hover:underline cursor-pointer hidden 2xl:inline text-[#e5c07b]">[THEME: {$theme.toUpperCase()}]</button
		>
		<span
			title="Architecture Status — 100% Serverless Edge execution without dedicated backend origin servers"
			class="bg-black/40 px-2 py-0.5 text-[#56b6c2] hidden 2xl:inline">100%_SERVERLESS</span
		>
	</div>
</header>
