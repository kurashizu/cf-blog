<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { playSound } from '../../sound';
	import { theme, cycleTheme, THEME_STYLES } from '../../stores/theme';
	import { spinnerFrame } from '../../stores/clock';
	import { tabIndexFromPath, TAB_ROUTES } from '../../routes-map';

	let activeTab = $derived(tabIndexFromPath(page.url.pathname));
	let themeStyles = $derived(THEME_STYLES[$theme]);

	const HOTKEY_TILES = [
		{ id: 0, key: '0', title: 'MODULES', desc: 'Projects', color: '#56b6c2', icon: '◈', tooltip: '0: Modules — Live Project Portal & Architecture Deep Dives [Hotkey: Ctrl+0]' },
		{ id: 1, key: '1', title: 'GUESTBOOK', desc: 'Packets', color: '#e06c75', icon: '✉', tooltip: '1: Guestbook — Send message packets across edge workers [Hotkey: Ctrl+1]' },
		{ id: 2, key: '2', title: 'SYNTH', desc: 'WebAudio', color: '#c678dd', icon: '♫', tooltip: '2: Synth — 8-Track Modular Synthesizer Workstation [Hotkey: Ctrl+2]' },
		{ id: 3, key: '3', title: 'UTILITIES', desc: 'HW Test', color: '#e5c07b', icon: '⌨', tooltip: '3: Utilities — Keyboard / Mouse / Display Hardware Testers [Hotkey: Ctrl+3]' },
		{ id: 4, key: '4', title: 'LLM TABLE', desc: 'Rankings', color: '#98c379', icon: '▤', tooltip: '4: Leaderboard — Artificial Analysis LLM model table [Hotkey: Ctrl+4]' },
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
	class="order-2 lg:order-none col-span-12 lg:col-span-3 xl:col-span-3 border {themeStyles.border} p-2 sm:p-2.5 flex flex-col gap-2 {themeStyles.cardBg} rounded-sm min-h-0 max-w-full overflow-y-auto custom-scrollbar"
>
	<!-- ASCII brand & acronym breakdown -->
	<div class="border border-white/15 p-2 bg-black/40 rounded-xs shrink-0 space-y-1.5 max-w-full overflow-hidden">
		<div class="text-xs sm:text-sm font-bold text-[#56b6c2] flex items-center justify-between border-b border-white/10 pb-0.5">
			<span>┌─[ SYS_BANNER // KRSZ.IN ]─┐</span>
			<span class="text-[#98c379] font-mono text-xs flex items-center gap-1">
				<span>{'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[($spinnerFrame + 3) % 10]} RUNNING</span>
			</span>
		</div>

		<pre class="text-[8px] sm:text-xs leading-none font-black tracking-tight text-[#e5c07b] overflow-x-auto select-none py-0.5">{` ██╗  ██╗██████╗ ███████╗███████╗
 ██║ ██╔╝██╔══██╗██╔════╝╚══███╔╝
 █████╔╝ ██████╔╝███████╗  ███╔╝
 ██╔═██╗ ██╔══██╗╚════██║ ███╔╝
 ██║  ██╗██║  ██║███████║███████╗
 ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝`}</pre>

		<div class="grid grid-cols-2 gap-1 text-xs border-t border-white/10 pt-1.5 font-mono">
			<div class="flex items-center gap-1.5"><span class="bg-[#e06c75] text-black px-1 py-0.2 rounded-xs font-bold text-xs">[K]</span><span class="text-[#e06c75] font-bold">urashizu's</span></div>
			<div class="flex items-center gap-1.5"><span class="bg-[#61afef] text-black px-1 py-0.2 rounded-xs font-bold text-xs">[R]</span><span class="text-[#61afef] font-bold">andom-</span></div>
			<div class="flex items-center gap-1.5"><span class="bg-[#e5c07b] text-black px-1 py-0.2 rounded-xs font-bold text-xs">[S]</span><span class="text-[#e5c07b] font-bold">tuff</span></div>
			<div class="flex items-center gap-1.5"><span class="bg-[#98c379] text-black px-1 py-0.2 rounded-xs font-bold text-xs">[Z]</span><span class="text-[#98c379] font-bold">one.</span></div>
		</div>
	</div>

	<!-- Operator profile -->
	<div class="border border-white/15 p-2.5 sm:p-3 bg-black/40 rounded-xs shrink-0 flex flex-col gap-1 text-xs sm:text-sm font-mono max-w-full overflow-hidden">
		<div class="text-xs sm:text-sm font-bold text-[#61afef] flex items-center justify-between border-b border-white/10 pb-1 shrink-0">
			<span>┌─[ OPERATOR_PROFILE ]─┐</span>
			<span class="text-xs text-[#98c379] font-bold border border-[#98c379]/40 bg-[#98c379]/15 px-1.5 py-0.2 rounded-xs">VERIFIED</span>
		</div>
		<div class="space-y-1.5 py-1 text-xs sm:text-sm leading-relaxed">
			<div class="flex items-baseline gap-2"><span class="text-[#e5c07b] font-bold shrink-0">[OPERATOR]</span><span class="text-[#eceff4] font-medium">kurashizu (IT Masters @ UNSW)</span></div>
			<div class="flex items-baseline gap-2"><span class="text-[#61afef] font-bold shrink-0">[LOCATION]</span><span class="text-[#eceff4]">Sydney, Australia [UTC+10/11]</span></div>
			<div class="flex items-baseline gap-2"><span class="text-[#e06c75] font-bold shrink-0">[MOTTO]</span><span class="text-[#eceff4] italic">"Follow best practices &amp; KISS"</span></div>
			<div class="flex items-baseline gap-2"><span class="text-[#98c379] font-bold shrink-0">[RUNTIME]</span><span class="text-[#eceff4]">100% Serverless Edge Isolates</span></div>
			<div class="flex items-baseline gap-2"><span class="text-[#56b6c2] font-bold shrink-0">[STACK]</span><span class="text-[#eceff4]">SvelteKit · uv · FFmpeg · D1 · Vectorize</span></div>
		</div>
		<div class="border-t border-white/10 pt-1 text-[11px] sm:text-xs text-[#98c379] shrink-0 font-bold flex flex-wrap items-center justify-between gap-1">
			<span>STATUS: OPEN FOR RESEARCH</span>
			<span>AVAILABLE NOW</span>
		</div>
	</div>

	<!-- Hotkey launchpad -->
	<div data-tour="launchpad" class="border border-white/15 p-2 bg-black/40 rounded-xs shrink-0 flex flex-col gap-1 text-xs font-mono">
		<div class="text-xs font-bold text-[#e5c07b] flex items-center justify-between border-b border-white/10 pb-0.5 shrink-0">
			<span>┌─[ QUICK_HOTKEYS // LAUNCHPAD ]─┐</span>
			<span class="text-white/50 text-xs">[CTRL+0-7 · T · ?]</span>
		</div>

		<div class="grid grid-cols-3 gap-1.5 py-1">
			{#each HOTKEY_TILES as tab (tab.id)}
				{@const isActive = activeTab === tab.id}
				<button
					onclick={() => nav(tab.id)}
					title={tab.tooltip}
					class="border rounded-xs p-1.5 flex flex-col justify-between items-start text-left cursor-pointer transition-all active:scale-95 group relative overflow-hidden {isActive
						? 'border-white bg-white/20 text-white shadow-md'
						: 'border-white/15 bg-black/30 hover:border-white/40 hover:bg-white/5'}"
					style={isActive ? `border-color: ${tab.color}` : undefined}
				>
					<div class="w-full flex items-center justify-between">
						<span
							class="px-1 py-0.2 rounded-xs font-mono font-bold text-xs border"
							style="background-color: {isActive ? tab.color : 'rgba(0,0,0,0.5)'}; color: {isActive ? '#000' : tab.color}; border-color: {tab.color};"
						>
							[{tab.key}]
						</span>
						<span class="text-base leading-none opacity-85 group-hover:opacity-100" style="color: {tab.color}">{tab.icon}</span>
					</div>
					<div class="mt-1">
						<div class="font-bold text-xs leading-tight tracking-tight" style="color: {isActive ? '#fff' : tab.color}">{tab.title}</div>
						<div class="text-xs opacity-60 font-mono">{tab.desc}</div>
					</div>
				</button>
			{/each}

			<button
				onclick={cycleTheme}
				class="border border-white/15 bg-black/30 hover:border-white/40 hover:bg-white/5 rounded-xs p-1.5 flex flex-col justify-between items-start text-left cursor-pointer transition-all active:scale-95 group"
			>
				<div class="w-full flex items-center justify-between">
					<span class="px-1 py-0.2 rounded-xs font-mono font-bold text-xs border border-[#d8dee9]/40 bg-black/50 text-[#d8dee9]">[T]</span>
					<span class="text-xs text-[#e5c07b] group-hover:rotate-45 transition-transform">◐</span>
				</div>
				<div class="mt-1">
					<div class="font-bold text-xs text-[#d8dee9] leading-tight">THEME</div>
					<div class="text-xs opacity-60 font-mono uppercase">{$theme.split('-')[0]}</div>
				</div>
			</button>
		</div>

		<div class="border-t border-white/10 pt-1 text-xs text-white/50 flex justify-between shrink-0 font-mono">
			<span>PADS: 7 ACTIVE NODES</span>
			<span>HOTKEY [CTRL+0-7 · T · ?]</span>
		</div>
	</div>
</div>
