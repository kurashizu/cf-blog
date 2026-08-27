<script lang="ts">
	import { playSound } from '../../../sound';
	import type { LfoWaveform } from '../../../synth';
	import { currentTrack, updateActiveTrack } from '../../../stores/synth-tracks';
	import { LFO_TOOLTIPS } from '../tooltips';
	import RotaryKnob from '../../hardware/RotaryKnob.svelte';

	const LFO_WAVES: LfoWaveform[] = ['sine', 'triangle', 'square', 'sawtooth'];
	const LFO_LABELS: Record<LfoWaveform, string> = { sine: 'SIN', triangle: 'TRI', square: 'SQR', sawtooth: 'SAW' };
</script>

<div class="xl:col-span-3 border border-[#c678dd]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[155px] shrink-0">
	<div class="flex justify-between items-center font-black text-[#c678dd] text-xs border-b border-white/10 pb-0.5 shrink-0">
		<span>5. LFO MOD</span>
		<span class="text-white/40 flex items-center" title="Signal Flow: To Master FX & EQ">
			<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
		</span>
	</div>

	<div class="grid grid-cols-12 gap-1 items-center flex-1 min-h-0 my-auto">
		<div class="col-span-4 flex flex-col justify-between items-center gap-1 border-r border-white/10 pr-1 h-full py-0.5">
			<div class="grid grid-cols-2 gap-0.5 w-full">
				{#each LFO_WAVES as w (w)}
					<button
						onclick={() => {
							updateActiveTrack({ lfoWaveform: w });
							playSound('click');
						}}
						title={LFO_TOOLTIPS[w] || w}
						class="py-1 text-[10px] sm:text-xs border rounded-xs font-black cursor-pointer leading-none text-center {$currentTrack.lfoWaveform === w
							? 'border-[#c678dd] bg-[#c678dd] text-black font-black'
							: 'border-white/20 text-white/60 hover:text-white'}"
					>
						{LFO_LABELS[w]}
					</button>
				{/each}
			</div>
			<RotaryKnob label="RATE" value={$currentTrack.lfoRate} min={0.1} max={20} step={0.2} unit="Hz" color="#c678dd" size={40} onChange={(v) => updateActiveTrack({ lfoRate: v })} />
		</div>

		<div class="col-span-8 flex flex-col justify-around h-full py-0.5 my-auto">
			<div class="grid grid-cols-6 gap-0.5 items-center">
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="PITCH" value={Math.round(($currentTrack.lfoPitchAmt ?? 0) * 100)} min={0} max={100} step={5} unit="%" color="#e5c07b" size={40} onChange={(v) => updateActiveTrack({ lfoPitchAmt: v / 100 })} />
				</div>
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="CUTOFF" value={Math.round(($currentTrack.lfoCutoffAmt ?? 0) * 100)} min={0} max={100} step={5} unit="%" color="#56b6c2" size={40} onChange={(v) => updateActiveTrack({ lfoCutoffAmt: v / 100 })} />
				</div>
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="AMP" value={Math.round(($currentTrack.lfoAmpAmt ?? 0) * 100)} min={0} max={100} step={5} unit="%" color="#d19a66" size={40} onChange={(v) => updateActiveTrack({ lfoAmpAmt: v / 100 })} />
				</div>
			</div>

			<div class="grid grid-cols-6 gap-0.5 items-center">
				<div class="col-span-1"></div>
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="PAN" value={Math.round(($currentTrack.lfoPanAmt ?? 0) * 100)} min={0} max={100} step={5} unit="%" color="#98c379" size={40} onChange={(v) => updateActiveTrack({ lfoPanAmt: v / 100 })} />
				</div>
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="FADE" value={$currentTrack.lfoFadeTime ?? 0} min={0} max={2000} step={50} unit="ms" color="#c678dd" size={40} onChange={(v) => updateActiveTrack({ lfoFadeTime: v })} />
				</div>
				<div class="col-span-1"></div>
			</div>
		</div>
	</div>
</div>
