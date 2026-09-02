<script lang="ts">
	import { playSound } from '../../../sound';
	import { getWaveformAbbr, type SynthWaveform } from '../../../synth';
	import { currentTrack, updateActiveTrack } from '../../../stores/synth-tracks';
	import { eqlCompSetting, setEqlComp } from '../../../stores/synth-settings';
	import { WAVE_TOOLTIPS } from '../tooltips';
	import RotaryKnob from '../../hardware/RotaryKnob.svelte';

	const OSC1_WAVES: SynthWaveform[] = ['square', 'sawtooth', 'triangle', 'sine', 'noise'];
	const OSC2_WAVES: SynthWaveform[] = ['sawtooth', 'square', 'sine', 'triangle', 'noise'];
</script>

<div class="border border-[#e5c07b]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[175px] shrink-0 xl:grow-[5]">
	<div class="flex justify-between items-center font-black text-[#e5c07b] text-xs border-b border-white/10 pb-0.5 shrink-0">
		<div class="flex items-center gap-1.5">
			<span>1. DUAL OSC</span>
			<button
				onclick={() => {
					setEqlComp(!$eqlCompSetting);
					playSound('click');
				}}
				title="Equal Loudness (ISO 226): Automatically balances perceptual loudness across Square, Saw, Triangle, and Sine waveforms"
				class="press px-1 py-0.2 text-[9px] rounded-xs font-mono font-bold cursor-pointer transition-colors border {$eqlCompSetting
					? 'bg-[#98c379]/20 border-[#98c379]/60 text-[#98c379]'
					: 'bg-white/5 border-white/20 text-white/40 hover:text-white/70'}"
			>
				EQL:{$eqlCompSetting ? 'AUTO' : 'RAW'}
			</button>
		</div>
		<span class="text-white/40 flex items-center" title="Signal Flow: To Timbre Fusion">
			<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
		</span>
	</div>

	<div class="grid grid-cols-12 gap-1 items-center flex-1 min-h-0 my-auto py-0.5">
		<div class="col-span-3 flex flex-col justify-between h-full py-0.5">
			<span class="text-[10px] text-white/60 font-black text-center mb-0.5 leading-none">OSC1</span>
			<div class="flex flex-col gap-0.5 flex-1 justify-between">
				{#each OSC1_WAVES as w (w)}
					<button
						onclick={() => {
							updateActiveTrack({ osc1Waveform: w });
							playSound('click');
						}}
						title={`Oscillator 1 Waveform: ${WAVE_TOOLTIPS[w] || w}`}
						class="press flex-1 flex items-center justify-center text-[10px] border rounded-xs font-black cursor-pointer transition-colors leading-none text-center {$currentTrack.osc1Waveform === w
							? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black'
							: 'border-white/20 text-white/70 hover:bg-white/10'}"
					>
						{getWaveformAbbr(w)}
					</button>
				{/each}
			</div>
		</div>

		<div class="col-span-3 flex flex-col justify-between h-full py-0.5">
			<span class="text-[10px] text-white/60 font-black text-center mb-0.5 leading-none">OSC2</span>
			<div class="flex flex-col gap-0.5 flex-1 justify-between">
				{#each OSC2_WAVES as w (w)}
					<button
						onclick={() => {
							updateActiveTrack({ osc2Waveform: w });
							playSound('click');
						}}
						title={`Oscillator 2 Waveform: ${WAVE_TOOLTIPS[w] || w}`}
						class="press flex-1 flex items-center justify-center text-[10px] border rounded-xs font-black cursor-pointer transition-colors leading-none text-center {$currentTrack.osc2Waveform === w
							? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
							: 'border-white/20 text-white/70 hover:bg-white/10'}"
					>
						{getWaveformAbbr(w)}
					</button>
				{/each}
			</div>
		</div>

		<div class="col-span-6 grid grid-cols-2 gap-0.5 border-l border-white/10 pl-1.5 h-full items-center py-0.5">
			<RotaryKnob label="OSC1" value={Math.round($currentTrack.osc1Gain * 100)} min={0} max={100} unit="%" color="#e5c07b" size={32} onChange={(v) => updateActiveTrack({ osc1Gain: v / 100 })} />
			<RotaryKnob label="OSC2" value={Math.round($currentTrack.osc2Gain * 100)} min={0} max={100} unit="%" color="#56b6c2" size={32} onChange={(v) => updateActiveTrack({ osc2Gain: v / 100 })} />
			<RotaryKnob label="DET" value={$currentTrack.detuneCents} min={-50} max={50} step={2} unit="c" color="#e06c75" size={32} onChange={(v) => updateActiveTrack({ detuneCents: v })} />
			<RotaryKnob label="SEMI" value={$currentTrack.osc2Semitone ?? 0} min={-24} max={24} step={1} unit="st" color="#c678dd" size={32} onChange={(v) => updateActiveTrack({ osc2Semitone: v })} />
			<RotaryKnob label="PW" value={$currentTrack.pulseWidth ?? 50} min={5} max={95} step={5} unit="%" color="#d19a66" size={32} onChange={(v) => updateActiveTrack({ pulseWidth: v })} />
			<RotaryKnob label="PHS" value={$currentTrack.phaseOffset} min={0} max={360} step={15} unit="°" color="#98c379" size={32} onChange={(v) => updateActiveTrack({ phaseOffset: v })} />
			<RotaryKnob label="SUB" value={Math.round(($currentTrack.subOscGain ?? 0) * 100)} min={0} max={100} unit="%" color="#61afef" size={32} onChange={(v) => updateActiveTrack({ subOscGain: v / 100 })} />
			<RotaryKnob label="NOISE" value={Math.round(($currentTrack.noiseGain ?? 0) * 100)} min={0} max={100} unit="%" color="#abb2bf" size={32} onChange={(v) => updateActiveTrack({ noiseGain: v / 100 })} />
		</div>
	</div>
</div>
