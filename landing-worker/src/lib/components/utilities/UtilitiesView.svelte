<script lang="ts">
	import { playSound } from '../../sound';
	import KeyboardTester from './KeyboardTester.svelte';
	import MouseTester from './MouseTester.svelte';
	import DisplayInfo from './DisplayInfo.svelte';

	type ToolId = 'keyboard' | 'mouse' | 'display';

	const TOOLS: { id: ToolId; label: string; color: string; desc: string }[] = [
		{ id: 'keyboard', label: 'KEYBOARD', color: '#56b6c2', desc: 'Key events, rollover, per-key coverage' },
		{ id: 'mouse', label: 'MOUSE', color: '#c678dd', desc: 'Buttons, wheel, double-click timing, move rate' },
		{ id: 'display', label: 'DISPLAY / SYS', color: '#98c379', desc: 'Resolution, refresh rate, browser environment' }
	];

	let activeTool = $state<ToolId>('keyboard');

	function select(id: ToolId) {
		activeTool = id;
		playSound('click');
	}

	let current = $derived(TOOLS.find((t) => t.id === activeTool) ?? TOOLS[0]);
</script>

<div class="space-y-3 sm:space-y-4 flex-1">
	<div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
		<pre class="text-[7px] sm:text-[10px] md:text-xs font-black tracking-tight text-[#e5c07b] leading-tight overflow-x-auto select-none">{`██╗   ██╗████████╗██╗██╗     ███████╗
██║   ██║╚══██╔══╝██║██║     ██╔════╝
██║   ██║   ██║   ██║██║     ███████╗
██║   ██║   ██║   ██║██║     ╚════██║
╚██████╔╝   ██║   ██║███████╗███████║
 ╚═════╝    ╚═╝   ╚═╝╚══════╝╚══════╝`}</pre>
		<div class="flex items-center gap-1.5 text-xs sm:text-sm overflow-x-auto no-scrollbar">
			{#each TOOLS as tool (tool.id)}
				<button
					onclick={() => select(tool.id)}
					title={`${tool.label} — ${tool.desc}`}
					class="px-2.5 py-1 border rounded-xs cursor-pointer transition-colors whitespace-nowrap {activeTool === tool.id
						? 'border-white bg-white/20 text-white font-bold'
						: 'border-white/20 hover:border-white/60 opacity-70'}"
					style={activeTool === tool.id ? `color: ${tool.color}` : undefined}
				>
					{tool.label}
				</button>
			{/each}
		</div>
	</div>

	<div style="border-color: {current.color}66;" class="border p-3 sm:p-4 rounded-sm space-y-2 bg-black/20">
		<div class="flex items-center justify-between border-b border-white/10 pb-1.5">
			<span class="font-black text-xs sm:text-sm" style="color: {current.color}">┌─[ {current.label} ]─┐</span>
			<span class="text-[10px] sm:text-xs text-white/40 font-mono">{current.desc}</span>
		</div>

		{#if activeTool === 'keyboard'}
			<KeyboardTester />
		{:else if activeTool === 'mouse'}
			<MouseTester />
		{:else}
			<DisplayInfo />
		{/if}
	</div>
</div>
