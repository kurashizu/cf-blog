<script lang="ts">
	import { onMount } from 'svelte';
	import BoxHeader from './BoxHeader.svelte';
	import AsciiArt from './AsciiArt.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { playSound } from '../../sound';
	import { theme, cycleTheme, THEME_STYLES, resolvedTheme, KRSZ_LETTER_COLORS } from '../../stores/theme';
	import { spinnerFrame } from '../../stores/clock';
	import { tabIndexFromPath, TAB_ROUTES } from '../../routes-map';
	import { KRSZ_MARKS } from '../../krsz-marks';

	/* Picked once on mount, not at module/SSR time -- doing it during render
	   would either bake the same mark into every SSR'd page (a module-level
	   pick) or mismatch between server and client HTML (a random $state
	   initializer, which SSR and the client would each evaluate separately
	   and disagree on). Defaults to the original ANSI Shadow mark (index 0)
	   until mount runs, so there's no flash of a second mark replacing the
	   first on every load. */
	let krszMark = $state(KRSZ_MARKS[0]);
	onMount(() => {
		krszMark = KRSZ_MARKS[Math.floor(Math.random() * KRSZ_MARKS.length)];
	});
	/* The mark is stacked K R over S Z, so a column range alone is ambiguous --
	   the columns carrying K on the top half carry S on the bottom. Each range
	   is bounded to its own half by row as well. */
	let krszColorRanges = $derived(
		krszMark.colorRanges.map((r) => ({
			from: r.from,
			to: r.to,
			color: KRSZ_LETTER_COLORS[r.letter],
			...(r.letter === 'K' || r.letter === 'R'
				? { fromRow: 0, toRow: krszMark.rowsPerHalf - 1 }
				: { fromRow: krszMark.rowsPerHalf })
		}))
	);

	let activeTab = $derived(tabIndexFromPath(page.url.pathname));
	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);
	/* AUTO shows the hour-driven pick, not the literal word — the point of the
	   tile is to say what's on screen right now, and "auto" alone doesn't. */
	let themeLabel = $derived($theme === 'auto' ? `auto·${$resolvedTheme.split('-')[0]}` : $theme.split('-')[0]);

	const HOTKEY_TILES = [
		{ id: 0, key: '0', title: 'MODULES', desc: 'Projects', color: '#56b6c2', icon: '◈', tooltip: '0: Modules — Live Project Portal & Architecture Deep Dives [Hotkey: Ctrl+0]' },
		{ id: 1, key: '1', title: 'GUESTBOOK', desc: 'Packets', color: '#e06c75', icon: '✉', tooltip: '1: Guestbook — Send message packets across edge workers [Hotkey: Ctrl+1]' },
		{ id: 2, key: '2', title: 'SYNTH', desc: 'WebAudio', color: '#c678dd', icon: '♫', tooltip: '2: Synth — 8-Track Modular Synthesizer Workstation [Hotkey: Ctrl+2]' },
		{ id: 3, key: '3', title: 'UTILITIES', desc: 'HW Test', color: '#e5c07b', icon: '⌨', tooltip: '3: Utilities — Keyboard / Mouse / Display Hardware Testers [Hotkey: Ctrl+3]' },
		{ id: 4, key: '4', title: 'LM.SPACE', desc: 'Model volume', color: '#98c379', icon: '▤', tooltip: '4: LM.SPACE — the Artificial Analysis model table as a navigable volume [Hotkey: Ctrl+4]' },
		{ id: 5, key: '5', title: 'KRSZ-VM', desc: 'PC Emu', color: '#d19a66', icon: '⬢', tooltip: '5: krsz-vm — Alpine Linux on an emulated x86 PC, i686 or x86-64 [Hotkey: Ctrl+5]' },
		{ id: 6, key: '6', title: 'CHATBOT', desc: 'On-GPU', color: '#61afef', icon: '◑', tooltip: '6: chatbot — a language model running on your own GPU via WebGPU, no server [Hotkey: Ctrl+6]' },
		{ id: 7, key: '7', title: 'LIFE.LAB', desc: 'Conway', color: '#98c379', icon: '⬗', tooltip: "7: lifelab — Conway's Game of Life, as a campaign: the two rules, still lifes, gliders, collisions, and the glider gun [Hotkey: Ctrl+7]" }
	];

	function nav(id: number) {
		goto(TAB_ROUTES[id]);
		playSound('click');
	}
</script>

<div
	class="order-2 lg:order-none col-span-12 lg:col-[span_5_/_span_5] border {themeStyles.border} p-2 sm:p-2.5 flex flex-col gap-2 {themeStyles.cardBgVideo} rounded-sm min-h-0 max-w-full"
>
	<!-- ASCII brand & acronym breakdown -- pinned, not part of the scroll
	     region below: the mark is the site's own identity, not a piece of
	     content that should disappear the moment someone scrolls the panel. -->
	<div class="border border-white/15 p-2 bg-black/40 rounded-xs shrink-0 space-y-1.5 max-w-full overflow-hidden">
		<BoxHeader title="SYS_BANNER // KRSZ.IN" short={['SYS_BANNER', 'BANNER']} class="text-xs sm:text-sm font-bold text-[#56b6c2] border-b border-white/10 pb-0.5">
			<span class="text-[#98c379] font-mono text-xs">{'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[($spinnerFrame + 3) % 10]} RUNNING</span>
		</BoxHeader>

		{#key krszMark.font}
			<AsciiArt
				color="#e5c07b"
				colorRanges={krszColorRanges}
				class="text-[8px] sm:text-xs leading-none font-black tracking-tight overflow-x-auto py-0.5"
				title="krsz.in — {krszMark.font}"
				art={krszMark.art}
			/>
		{/key}

		<!-- Columns come and go with the width; a cell never splits its own two words. -->
		<div class="grid grid-cols-[repeat(auto-fit,minmax(105px,1fr))] gap-1 text-xs border-t border-white/10 pt-1.5 font-mono whitespace-nowrap">
			<div class="flex items-center gap-1.5"><span class="text-black px-1 py-0.2 rounded-xs font-bold text-xs" style="background: {KRSZ_LETTER_COLORS.K}">[K]</span><span class="font-bold" style="color: {KRSZ_LETTER_COLORS.K}">urashizu's</span></div>
			<div class="flex items-center gap-1.5"><span class="text-black px-1 py-0.2 rounded-xs font-bold text-xs" style="background: {KRSZ_LETTER_COLORS.R}">[R]</span><span class="font-bold" style="color: {KRSZ_LETTER_COLORS.R}">andom-</span></div>
			<div class="flex items-center gap-1.5"><span class="text-black px-1 py-0.2 rounded-xs font-bold text-xs" style="background: {KRSZ_LETTER_COLORS.S}">[S]</span><span class="font-bold" style="color: {KRSZ_LETTER_COLORS.S}">tuff</span></div>
			<div class="flex items-center gap-1.5"><span class="text-black px-1 py-0.2 rounded-xs font-bold text-xs" style="background: {KRSZ_LETTER_COLORS.Z}">[Z]</span><span class="font-bold" style="color: {KRSZ_LETTER_COLORS.Z}">one.</span></div>
		</div>
	</div>

	<!-- Everything below the mark scrolls in its own region now that the
	     mark itself is pinned above it. -->
	<div class="flex flex-col gap-2 min-h-0 flex-1 overflow-y-auto custom-scrollbar">

	<!-- Operator profile -->
	<div class="border border-white/15 p-2.5 sm:p-3 bg-black/40 rounded-xs shrink-0 flex flex-col gap-1 text-xs sm:text-sm font-mono max-w-full overflow-hidden">
		<BoxHeader title="OPERATOR_PROFILE" short={['OPERATOR', 'OP']} class="text-xs sm:text-sm font-bold text-[#61afef] border-b border-white/10 pb-1 shrink-0">
			<span class="text-xs text-[#98c379] font-bold border border-[#98c379]/40 bg-[#98c379]/15 px-1.5 py-0.2 rounded-xs">VERIFIED</span>
		</BoxHeader>
		<!-- Label over value, not beside it.
		     Side by side, the label ate a third of a sidebar this narrow and left
		     the value in a column too thin to hold its own line, so every entry
		     wrapped and hung under itself -- five ragged two-line blocks that read
		     as broken rather than as a record. Stacked, each value gets the full
		     width and most fit on one line. -->
		<div class="space-y-2 py-1 text-xs sm:text-sm">
			<div><div class="text-[#e5c07b] font-bold">[OPERATOR]</div><div class="text-[#eceff4] font-medium">kurashizu (IT Masters @ UNSW)</div></div>
			<div><div class="text-[#61afef] font-bold">[LOCATION]</div><div class="text-[#eceff4]">Sydney, Australia [UTC+10/11]</div></div>
			<div><div class="text-[#e06c75] font-bold">[MOTTO]</div><div class="text-[#eceff4] italic">"Follow best practices &amp; KISS"</div></div>
			<div><div class="text-[#98c379] font-bold">[RUNTIME]</div><div class="text-[#eceff4]">100% Serverless Edge Isolates</div></div>
			<div><div class="text-[#56b6c2] font-bold">[STACK]</div><div class="text-[#eceff4]">SvelteKit · uv · FFmpeg · D1 · Vectorize</div></div>
		</div>
		<div class="border-t border-white/10 pt-1 text-[11px] sm:text-xs text-[#98c379] shrink-0 font-bold flex flex-wrap items-center justify-between gap-1">
			<span>STATUS: OPEN FOR RESEARCH</span>
			<span class="inline-flex items-center gap-1">
				<span class="w-1.5 h-1.5 rounded-full bg-[#98c379] blink-live"></span>
				AVAILABLE NOW
			</span>
		</div>
	</div>

	<!-- Hotkey launchpad -->
	<div data-tour="launchpad" class="border border-white/15 p-2 bg-black/40 rounded-xs shrink-0 flex flex-col gap-1 text-xs font-mono">
		<BoxHeader title="QUICK_HOTKEYS // LAUNCHPAD" short={['HOTKEYS // LAUNCHPAD', 'LAUNCHPAD', 'PADS']} class="text-xs font-bold text-[#e5c07b] border-b border-white/10 pb-0.5 shrink-0">
			<span class="text-white/50 text-xs" title="CTRL+0-7 jumps to a tab · T cycles the theme · ? lists every hotkey">[CTRL+0-7 · T · ?]</span>
		</BoxHeader>

		<div class="grid grid-cols-3 gap-1.5 py-1">
			{#each HOTKEY_TILES as tab (tab.id)}
				{@const isActive = activeTab === tab.id}
				<button
					onclick={() => nav(tab.id)}
					title={tab.tooltip}
					class="lift press border rounded-xs p-1.5 flex flex-col justify-between items-start text-left cursor-pointer transition-all group relative overflow-hidden min-w-0 {isActive
						? 'border-white bg-white/20 text-white shadow-md'
						: 'border-white/15 bg-black/30 hover:border-white/40 hover:bg-white/5 hover:shadow-[0_2px_10px_-2px_rgba(0,0,0,0.6)]'}"
					style={isActive ? `border-color: ${tab.color}` : undefined}
				>
					<div class="w-full flex items-center justify-between">
						<span
							class="px-1 py-0.2 rounded-xs font-mono font-bold text-xs border transition-colors"
							style="background-color: {isActive ? tab.color : 'rgba(0,0,0,0.5)'}; color: {isActive ? '#000' : tab.color}; border-color: {tab.color};"
						>
							[{tab.key}]
						</span>
						<span class="text-base leading-none opacity-85 group-hover:opacity-100 group-hover:scale-110 transition-transform" style="color: {tab.color}">{tab.icon}</span>
					</div>
					<div class="mt-1 w-full min-w-0">
						<div class="font-bold text-xs leading-tight tracking-tight truncate" style="color: {isActive ? '#fff' : tab.color}">{tab.title}</div>
						<div class="text-xs opacity-60 font-mono truncate">{tab.desc}</div>
					</div>
				</button>
			{/each}

			<button
				onclick={cycleTheme}
				class="lift press border border-white/15 bg-black/30 hover:border-white/40 hover:bg-white/5 hover:shadow-[0_2px_10px_-2px_rgba(0,0,0,0.6)] rounded-xs p-1.5 flex flex-col justify-between items-start text-left cursor-pointer transition-all group overflow-hidden min-w-0"
			>
				<div class="w-full flex items-center justify-between">
					<span class="px-1 py-0.2 rounded-xs font-mono font-bold text-xs border border-[#d8dee9]/40 bg-black/50 text-[#d8dee9]">[T]</span>
					<span class="text-xs text-[#e5c07b] group-hover:rotate-45 transition-transform">◐</span>
				</div>
				<div class="mt-1 w-full min-w-0">
					<div class="font-bold text-xs text-[#d8dee9] leading-tight truncate">THEME</div>
					<div class="text-xs opacity-60 font-mono uppercase truncate" title={themeLabel}>{themeLabel}</div>
				</div>
			</button>
		</div>

		<div class="border-t border-white/10 pt-1 text-xs text-white/50 flex flex-wrap justify-between gap-x-2 shrink-0 font-mono whitespace-nowrap">
			<span>PADS: 7 ACTIVE NODES</span>
			<span class="ml-auto">HOTKEY [CTRL+0-7 · T · ?]</span>
		</div>
	</div>
	</div>
</div>

