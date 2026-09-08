<script lang="ts">
	import { onMount } from 'svelte';
	import BoxHeader from './BoxHeader.svelte';
	import AsciiArt from './AsciiArt.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { t } from '$lib/i18n';
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

	let HOTKEY_TILES = $derived([
		{ id: 0, key: '0', title: 'MODULES', desc: $t('chrome.sidebar.tileProjects'), color: '#56b6c2', icon: '◈', tooltip: $t('chrome.sidebar.tooltip0') },
		{ id: 1, key: '1', title: 'GUESTBOOK', desc: $t('chrome.sidebar.tilePackets'), color: '#e06c75', icon: '✉', tooltip: $t('chrome.sidebar.tooltip1') },
		{ id: 2, key: '2', title: 'SYNTH', desc: $t('chrome.sidebar.tileWebAudio'), color: '#c678dd', icon: '♫', tooltip: $t('chrome.sidebar.tooltip2') },
		{ id: 3, key: '3', title: 'UTILITIES', desc: $t('chrome.sidebar.tileHwTest'), color: '#e5c07b', icon: '⌨', tooltip: $t('chrome.sidebar.tooltip3') },
		{ id: 4, key: '4', title: 'LM.SPACE', desc: $t('chrome.sidebar.tileModelVolume'), color: '#98c379', icon: '▤', tooltip: $t('chrome.sidebar.tooltip4') },
		{ id: 5, key: '5', title: 'KRSZ-VM', desc: $t('chrome.sidebar.tilePcEmu'), color: '#d19a66', icon: '⬢', tooltip: $t('chrome.sidebar.tooltip5') },
		{ id: 6, key: '6', title: 'WEB-LM', desc: $t('chrome.sidebar.tileOnGpu'), color: '#61afef', icon: '◑', tooltip: $t('chrome.sidebar.tooltip6') },
		{ id: 7, key: '7', title: 'LIFE.LAB', desc: $t('chrome.sidebar.tileConway'), color: '#98c379', icon: '⬗', tooltip: $t('chrome.sidebar.tooltip7') }
	]);

	function nav(id: number) {
		goto(TAB_ROUTES[id]);
		playSound('click');
	}
</script>

<aside
	aria-label={$t('a11y.landmark.sidebar')}
	class="order-2 lg:order-none col-span-12 lg:col-[span_5_/_span_5] border {themeStyles.border} p-2 sm:p-2.5 pr-0 sm:pr-0 flex flex-col gap-2 {themeStyles.cardBgVideo} rounded-sm min-h-0 max-w-full"
>
	<!-- ASCII brand & acronym breakdown -- pinned, not part of the scroll
	     region below: the mark is the site's own identity, not a piece of
	     content that should disappear the moment someone scrolls the panel.

	     This panel is pinned in the column; the two below sit inside a scroller
	     whose scrollbar-gutter takes 10px out of their available width. The
	     margin gives back exactly that, so all three border boxes end on the
	     same line. It has to be a margin and not padding: padding would sit
	     inside this panel's own border, which is what is being aligned. -->
	<div class="border border-white/15 p-2 bg-black/40 rounded-xs shrink-0 space-y-1.5 max-w-full overflow-hidden mr-[10px]">
		<BoxHeader title="SYS_BANNER // KRSZ.IN" short={['SYS_BANNER', 'BANNER']} class="text-xs sm:text-sm font-bold text-[#56b6c2] border-b border-white/10 pb-0.5">
			<span class="text-[#98c379] font-mono text-xs">
				<span aria-hidden="true">{'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[($spinnerFrame + 3) % 10]}</span>
				{$t('chrome.sidebar.running')}
			</span>
		</BoxHeader>

		{#key krszMark.font}
			<div role="img" aria-label="KRSZ">
				<AsciiArt
					color="#e5c07b"
					colorRanges={krszColorRanges}
					class="krsz-logo leading-none font-black tracking-tight overflow-x-auto py-0.5"
					title="krsz.in — {krszMark.font}"
					art={krszMark.art}
				/>
			</div>
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
	<!-- No right padding: .custom-scrollbar sets scrollbar-gutter: stable, which
	     already reserves the bar's 10px out of this element's content box. Adding
	     padding on top reserved it twice, so the panels in here were drawn ~19px
	     narrower than the pinned banner above, which is the mismatch that kept
	     coming back. The gutter alone leaves both at the same width. -->
	<div class="flex flex-col gap-2 min-h-0 flex-1 overflow-y-auto custom-scrollbar">

	<!-- Operator profile -->
	<div class="border border-white/15 p-2.5 sm:p-3 bg-black/40 rounded-xs shrink-0 flex flex-col gap-1 text-xs sm:text-sm font-mono max-w-full overflow-hidden">
		<BoxHeader title="OPERATOR_PROFILE" short={['OPERATOR', 'OP']} class="text-xs sm:text-sm font-bold text-[#61afef] border-b border-white/10 pb-1 shrink-0">
			<span class="text-xs text-[#98c379] font-bold border border-[#98c379]/40 bg-[#98c379]/15 px-1.5 py-0.2 rounded-xs">{$t('chrome.sidebar.verified')}</span>
		</BoxHeader>
		<!-- Label over value, not beside it.
		     Side by side, the label ate a third of a sidebar this narrow and left
		     the value in a column too thin to hold its own line, so every entry
		     wrapped and hung under itself -- five ragged two-line blocks that read
		     as broken rather than as a record. Stacked, each value gets the full
		     width and most fit on one line. -->
		<dl class="space-y-2 py-1 text-xs sm:text-sm">
			<div><dt class="text-[#e5c07b] font-bold">{$t('chrome.sidebar.labelOperator')}</dt><dd class="text-[#eceff4] font-medium">{$t('chrome.sidebar.operatorValue')}</dd></div>
			<div><dt class="text-[#61afef] font-bold">{$t('chrome.sidebar.labelLocation')}</dt><dd class="text-[#eceff4]">{$t('chrome.sidebar.locationValue')}</dd></div>
			<div><dt class="text-[#e06c75] font-bold">{$t('chrome.sidebar.labelMotto')}</dt><dd class="text-[#eceff4] italic">"{$t('chrome.sidebar.mottoValue')}"</dd></div>
			<div><dt class="text-[#98c379] font-bold">{$t('chrome.sidebar.labelRuntime')}</dt><dd class="text-[#eceff4]">{$t('chrome.sidebar.runtimeValue')}</dd></div>
			<div><dt class="text-[#56b6c2] font-bold">{$t('chrome.sidebar.labelStack')}</dt><dd class="text-[#eceff4]">SvelteKit · uv · FFmpeg · D1 · Vectorize</dd></div>
		</dl>
		<div class="border-t border-white/10 pt-1 text-[11px] sm:text-xs text-[#98c379] shrink-0 font-bold flex flex-wrap items-center justify-between gap-1">
			<span>{$t('chrome.sidebar.statusOpen')}</span>
			<span class="inline-flex items-center gap-1">
				<span class="w-1.5 h-1.5 rounded-full bg-[#98c379] blink-live" aria-hidden="true"></span>
				{$t('chrome.sidebar.availableNow')}
			</span>
		</div>
	</div>

	<!-- Hotkey launchpad -->
	<div data-tour="launchpad" class="border border-white/15 p-2 bg-black/40 rounded-xs shrink-0 flex flex-col gap-1 text-xs font-mono">
		<BoxHeader title="QUICK_HOTKEYS // LAUNCHPAD" short={['HOTKEYS // LAUNCHPAD', 'LAUNCHPAD', 'PADS']} class="text-xs font-bold text-[#e5c07b] border-b border-white/10 pb-0.5 shrink-0">
			<span class="text-white/50 text-xs" title={$t('chrome.sidebar.launchpadHint')}>[CTRL+0-7 · T · ?]</span>
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
						<span class="text-base leading-none group-hover:scale-110 transition-transform" style="color: color-mix(in srgb, {tab.color} 85%, black)">{tab.icon}</span>
					</div>
					<div class="mt-1 w-full min-w-0">
						<div class="font-bold text-xs leading-tight tracking-tight truncate" style="color: {isActive ? '#fff' : tab.color}">{tab.title}</div>
						<div class="text-xs text-white/60 font-mono truncate">{tab.desc}</div>
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
					<div class="font-bold text-xs text-[#d8dee9] leading-tight truncate">{$t('chrome.sidebar.theme')}</div>
					<div class="text-xs text-white/60 font-mono uppercase truncate" title={themeLabel}>{themeLabel}</div>
				</div>
			</button>
		</div>

		<div class="border-t border-white/10 pt-1 text-xs text-white/50 flex flex-wrap justify-between gap-x-2 shrink-0 font-mono whitespace-nowrap">
			<span>{$t('chrome.sidebar.padsActive', { count: 7 })}</span>
			<span class="ml-auto">{$t('chrome.sidebar.hotkeyHint')}</span>
		</div>
	</div>
	</div>
</aside>

