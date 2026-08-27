<script lang="ts">
	import { playSound } from '../../../sound';
	import { currentTrack, updateActiveTrack } from '../../../stores/synth-tracks';
	import { isRecording, recSeconds, recError, toggleRecording } from '../../../stores/recorder';
	import RotaryKnob from '../../hardware/RotaryKnob.svelte';
	import Visualizers, { type VisualizerMode } from './Visualizers.svelte';

	let activeOutVisualizer = $state<VisualizerMode>('fft');

	function setMode(mode: VisualizerMode) {
		activeOutVisualizer = mode;
		playSound('click');
	}
</script>

<div class="xl:col-span-4 border border-white/20 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[155px] shrink-0">
	<div class="flex items-center justify-between font-black text-white text-xs border-b border-white/10 pb-0.5 shrink-0">
		<div class="flex items-center gap-2">
			<span class="text-white text-xs font-black">7. OUT</span>
			<div class="flex items-center gap-1">
				<button
					onclick={() => setMode('fft')}
					title="Visualizer Mode: FFT Log Spectrum Analyzer — Shows frequency distribution across 20Hz to 20kHz"
					class="px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors {activeOutVisualizer === 'fft'
						? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
				>
					FFT
				</button>
				<button
					onclick={() => setMode('scope')}
					title="Visualizer Mode: Oscilloscope Waveform — Real-time time-domain audio wave display"
					class="px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors {activeOutVisualizer === 'scope'
						? 'border-[#98c379] bg-[#98c379] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
				>
					SCOPE
				</button>
				<button
					onclick={() => setMode('loudness')}
					title="Visualizer Mode: RMS Loudness Meter & History — Real-time dynamic decibel range (-60dB to +6dB)"
					class="px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors {activeOutVisualizer === 'loudness'
						? 'border-[#e06c75] bg-[#e06c75] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
				>
					LOUD
				</button>
			</div>
		</div>
		<div class="flex items-center gap-1.5">
			{#if $recError}
				<span class="text-[9px] font-mono text-[#e06c75]">{$recError}</span>
			{/if}
			<button
				onclick={toggleRecording}
				title="Record the master output and download it when stopped (WebM/Opus, or M4A on Safari)"
				class="px-1.5 py-0.2 rounded-xs border text-[10px] font-black cursor-pointer transition-all flex items-center gap-1 {$isRecording
					? 'border-[#e06c75] bg-[#e06c75] text-black shadow-[0_0_8px_#e06c75]'
					: 'border-[#e06c75]/50 bg-[#e06c75]/10 text-[#e06c75] hover:bg-[#e06c75]/25'}"
			>
				<span class="w-1.5 h-1.5 rounded-full {$isRecording ? 'bg-black animate-pulse' : 'bg-[#e06c75]'}"></span>
				<span>{$isRecording ? `REC ${$recSeconds}s — STOP & SAVE` : 'REC'}</span>
			</button>
		</div>
	</div>

	<div class="grid grid-cols-12 gap-1.5 items-center flex-1 min-h-0 my-auto">
		<div class="col-span-4 grid grid-cols-2 gap-0.5 border-r border-white/10 pr-1 h-full items-center py-0.5">
			<RotaryKnob label="PAN" value={Math.round($currentTrack.pan * 100)} min={-100} max={100} step={5} unit="" color="#56b6c2" size={40} onChange={(v) => updateActiveTrack({ pan: v / 100 })} />
			<RotaryKnob
				label="AIR"
				value={Math.round(($currentTrack.airGain ?? 0) * 100)}
				min={-100}
				max={100}
				step={5}
				unit="%"
				color="#e5c07b"
				size={40}
				description="Air Shelf EQ — Boosts/cuts high-end brilliance (±8dB @ 10kHz)"
				onChange={(v) => updateActiveTrack({ airGain: v / 100 })}
			/>
			<!-- Third knob centered under the pair — all three are per-track; there is no
			     fourth real per-track output parameter, and decorative knobs got cut on purpose -->
			<div class="col-span-2 flex justify-center">
				<RotaryKnob label="VOL" value={Math.round($currentTrack.volume * 100)} min={0} max={100} unit="%" color="#98c379" size={40} onChange={(v) => updateActiveTrack({ volume: v / 100 })} />
			</div>
		</div>

		<Visualizers mode={activeOutVisualizer} />
	</div>
</div>
