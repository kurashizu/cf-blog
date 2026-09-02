<script lang="ts">
	import { playSound } from '../../../sound';
	import type { FilterType } from '../../../synth';
	import { currentTrack, updateActiveTrack } from '../../../stores/synth-tracks';
	import { FILTER_TOOLTIPS } from '../tooltips';
	import RotaryKnob from '../../hardware/RotaryKnob.svelte';

	const FILTER_TYPES: FilterType[] = ['lowpass', 'bandpass', 'highpass', 'notch'];
	const FILTER_LABELS: Record<FilterType, string> = { lowpass: 'LPF', bandpass: 'BPF', highpass: 'HPF', notch: 'NOTCH' };
</script>

<div class="border border-[#56b6c2]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[115px] shrink-0 xl:grow-[3]">
	<div class="flex justify-between items-center font-black text-[#56b6c2] text-xs border-b border-white/10 pb-0.5 shrink-0">
		<span>3. VCF FILTER</span>
		<span class="text-white/40 flex items-center" title="Signal Flow: To Envelopes & VCA">
			<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
		</span>
	</div>

	<div class="grid grid-cols-12 gap-2 items-center flex-1 min-h-0 my-auto py-0.5">
		<div class="col-span-5 grid grid-cols-2 grid-rows-2 gap-1 h-full py-0.5">
			{#each FILTER_TYPES as f (f)}
				<button
					onclick={() => {
						updateActiveTrack({ filterType: f });
						playSound('click');
					}}
					title={FILTER_TOOLTIPS[f] || f}
					class="press h-full w-full flex items-center justify-center text-xs border rounded-xs font-black cursor-pointer transition-colors leading-none text-center {$currentTrack.filterType === f
						? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
						: 'border-white/20 text-white/70 hover:bg-white/10'}"
				>
					{FILTER_LABELS[f]}
				</button>
			{/each}
		</div>

		<div class="col-span-7 grid grid-cols-2 gap-0.5 border-l border-white/10 pl-1.5 h-full items-center py-0.5">
			<RotaryKnob label="CUTOFF" value={$currentTrack.cutoff} min={40} max={12000} step={50} unit="Hz" color="#56b6c2" size={32} onChange={(v) => updateActiveTrack({ cutoff: v })} />
			<RotaryKnob label="RES (Q)" value={$currentTrack.resonance} min={0.2} max={14} step={0.2} color="#e5c07b" size={32} onChange={(v) => updateActiveTrack({ resonance: v })} />
			<RotaryKnob label="KEY TRK" value={Math.round(($currentTrack.keyTracking ?? 0.0) * 100)} min={0} max={100} step={5} unit="%" color="#61afef" size={32} onChange={(v) => updateActiveTrack({ keyTracking: v / 100 })} />
			<RotaryKnob
				label="ENV AMT"
				value={Math.round(($currentTrack.filterEnvAmount ?? $currentTrack.envFilterMod ?? 0.5) * 100)}
				min={-100}
				max={100}
				unit="%"
				color="#98c379"
				size={32}
				onChange={(v) => updateActiveTrack({ filterEnvAmount: v / 100, envFilterMod: Math.max(0, v / 100) })}
			/>
		</div>
	</div>
</div>
