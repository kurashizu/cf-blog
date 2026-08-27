<script lang="ts">
	import { playSound } from '../../../sound';
	import type { BlendMode } from '../../../synth';
	import { currentTrack, updateActiveTrack } from '../../../stores/synth-tracks';
	import { BLEND_TOOLTIPS } from '../tooltips';
	import RotaryKnob from '../../hardware/RotaryKnob.svelte';

	const BLEND_MODES: BlendMode[] = ['layer', 'fm', 'ring', 'sync'];
</script>

<div class="border border-[#c678dd]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[115px] shrink-0 xl:grow-[3]">
	<div class="flex justify-between items-center font-black text-[#c678dd] text-xs border-b border-white/10 pb-0.5 shrink-0">
		<span>2. FUSION</span>
		<span class="text-white/40 flex items-center" title="Signal Flow: To VCF Filter">
			<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
		</span>
	</div>

	<div class="grid grid-cols-12 gap-2 items-center flex-1 min-h-0 my-auto py-0.5">
		<div class="col-span-5 grid grid-cols-2 grid-rows-2 gap-1 h-full py-0.5">
			{#each BLEND_MODES as mode (mode)}
				<button
					onclick={() => {
						updateActiveTrack({ blendMode: mode });
						playSound('click');
					}}
					title={BLEND_TOOLTIPS[mode] || mode}
					class="h-full w-full flex items-center justify-center text-xs border rounded-xs font-black cursor-pointer transition-colors leading-none text-center {$currentTrack.blendMode === mode
						? 'border-[#c678dd] bg-[#c678dd] text-black font-black'
						: 'border-white/20 text-white/70 hover:bg-white/10'}"
				>
					{mode.toUpperCase()}
				</button>
			{/each}
		</div>

		<div class="col-span-7 grid grid-cols-2 gap-0.5 border-l border-white/10 pl-1.5 h-full items-center py-0.5">
			<RotaryKnob label="MORPH" value={Math.round($currentTrack.morphAmount * 100)} min={0} max={100} unit="%" color="#c678dd" size={32} onChange={(v) => updateActiveTrack({ morphAmount: v / 100 })} />
			<RotaryKnob label="RATIO" value={$currentTrack.osc2Ratio} min={0.5} max={4} step={0.5} unit="x" color="#56b6c2" size={32} onChange={(v) => updateActiveTrack({ osc2Ratio: v })} />
			<RotaryKnob label="X-FADE" value={Math.round(($currentTrack.xfade ?? 0.5) * 100)} min={0} max={100} step={5} unit="%" color="#d19a66" size={32} onChange={(v) => updateActiveTrack({ xfade: v / 100 })} />
			<RotaryKnob label="GLIDE" value={$currentTrack.glideTime ?? 0} min={0} max={300} step={10} unit="ms" color="#e5c07b" size={32} onChange={(v) => updateActiveTrack({ glideTime: v })} />
		</div>
	</div>
</div>
