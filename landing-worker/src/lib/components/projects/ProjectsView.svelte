<script lang="ts">
	import { playSound } from '../../sound';
	import { spinnerFrame } from '../../stores/clock';
	import { selectedModuleId } from '../../stores/selected-module';
	import { MODULES } from '../../data/modules';
	import PixelIcon from '../pixel/PixelIcon.svelte';
	import MermaidDiagram from './MermaidDiagram.svelte';

	let hoveredCard = $state<string | null>(null);
	let selectedModule = $derived(MODULES.find((m) => m.id === $selectedModuleId) ?? MODULES[0]);

	function inspect(id: string) {
		selectedModuleId.set(id);
		playSound('click');
	}
</script>

<div class="space-y-3 sm:space-y-4 flex-1">
	<div class="flex items-center justify-between border-b border-white/10 pb-2">
		<pre class="text-[7px] sm:text-[10px] md:text-xs font-black tracking-tight text-[#56b6c2] leading-tight overflow-x-auto select-none">{`███╗   ███╗ ██████╗ ██████╗ ██╗   ██╗██╗     ███████╗███████╗
████╗ ████║██╔═══██╗██╔══██╗██║   ██║██║     ██╔════╝██╔════╝
██╔████╔██║██║   ██║██║  ██║██║   ██║██║     █████╗  ███████╗
██║╚██╔╝██║██║   ██║██║  ██║██║   ██║██║     ██╔══╝  ╚════██║
██║ ╚═╝ ██║╚██████╔╝██████╔╝╚██████╔╝███████╗███████╗███████║
╚═╝     ╚═╝ ╚═════╝ ╚═════╝  ╚═════╝ ╚══════╝╚══════╝╚══════╝`}</pre>
		<span class="text-xs sm:text-sm text-[#98c379] flex items-center gap-1.5 shrink-0">
			<span>{$spinnerFrame}</span>
			<span>6 LIVE PROJECTS</span>
		</span>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
		{#each MODULES as m (m.id)}
			{@const isHovered = hoveredCard === m.id}
			{@const isSelected = selectedModule.id === m.id}
			<button
				onmouseenter={() => {
					hoveredCard = m.id;
					playSound('hover');
				}}
				onmouseleave={() => (hoveredCard = null)}
				onclick={() => inspect(m.id)}
				title={`Inspect ${m.name} (${m.tag})`}
				style="background-color: {m.bgTint}; border-color: {isSelected ? m.color : m.borderColor};"
				class="text-left border {isSelected ? 'border-2' : ''} p-3.5 rounded-xs cursor-pointer transition-all hover:scale-[1.015] hover:brightness-110 flex flex-col justify-between h-40 group relative overflow-hidden"
			>
				<div>
					<div class="flex items-center justify-between text-xs mb-1.5">
						<span class="font-bold text-xs sm:text-sm" style="color: {m.color}">[{m.badge}]</span>
						<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-black/40 text-[#eceff4] font-mono">{isHovered ? $spinnerFrame + ' ' + m.tag : m.tag}</span>
					</div>
					<div class="font-bold text-sm sm:text-base group-hover:underline flex items-center gap-2 text-[#eceff4]">
						<PixelIcon name={m.icon} size={18} />
						<span style="color: {m.color}">{m.name}</span>
					</div>
					<p class="text-xs opacity-80 line-clamp-2 mt-1.5 leading-snug">{m.desc}</p>
				</div>
				<div class="flex items-center justify-between border-t border-white/10 pt-2 text-xs">
					<span class="text-xs opacity-90">{isSelected ? 'VIEWING ▼' : 'INSPECT'}</span>
					<span class="font-bold text-xs flex items-center gap-1" style="color: {m.color}"><span>-&gt;</span></span>
				</div>
			</button>
		{/each}
	</div>

	<div style="background-color: {selectedModule.bgTint}; border-color: {selectedModule.borderColor};" class="border p-3.5 sm:p-5 rounded-sm space-y-3 sm:space-y-4">
		<div class="flex items-start justify-between">
			<div>
				<span class="text-xs opacity-70 font-bold" style="color: {selectedModule.color}">NODE_ID // {selectedModule.badge}</span>
				<h3 class="text-base sm:text-xl font-bold flex items-center gap-2 mt-0.5">
					<span style="color: {selectedModule.color}">{selectedModule.name}</span>
					<span class="text-xs font-normal border border-current px-2 py-0.5 rounded-xs">{selectedModule.tag}</span>
				</h3>
			</div>
			<a
				href={selectedModule.url}
				target="_blank"
				rel="noopener noreferrer"
				onclick={() => playSound('click')}
				title={`Launch ${selectedModule.url} in a new tab`}
				style="background-color: {selectedModule.color}"
				class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xs text-black font-bold text-xs sm:text-sm flex items-center gap-1.5 hover:opacity-90 transition-opacity shrink-0"
			>
				<span>LAUNCH</span>
				<PixelIcon name="arrowUpRight" size={16} />
			</a>
		</div>
		<p class="text-xs sm:text-base leading-relaxed text-[#eceff4]">{selectedModule.desc}</p>

		<div class="flex flex-wrap gap-1.5 text-xs">
			{#each selectedModule.tech as t (t)}
				<span class="px-2 py-0.5 border border-white/15 bg-black/30 rounded-xs text-white/70 font-mono">{t}</span>
			{/each}
		</div>

		<ul class="space-y-1.5 text-xs sm:text-sm">
			{#each selectedModule.facts as fact (fact)}
				<li class="flex items-start gap-2 border border-white/10 bg-black/30 rounded-xs px-2.5 py-2">
					<span class="shrink-0 font-bold" style="color: {selectedModule.color}">›</span>
					<span class="text-[#eceff4] leading-relaxed">{fact}</span>
				</li>
			{/each}
		</ul>

		<div class="border border-white/10 bg-black/40 rounded-xs p-2.5 sm:p-3">
			<div class="text-xs font-bold mb-1.5 border-b border-white/10 pb-1" style="color: {selectedModule.color}">┌─[ REQUEST FLOW ]─┐</div>
			{#key selectedModule.id}
				<MermaidDiagram chart={selectedModule.topology} accent={selectedModule.color} />
			{/key}
		</div>
	</div>
</div>
