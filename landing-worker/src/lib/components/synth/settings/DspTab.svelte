<script lang="ts">
	import { playSound } from '../../../sound';
	import {
		audioSampleRate,
		noiseDurationSetting,
		setNoiseDuration,
		noiseColorSetting,
		setNoiseColor,
		reverbDurationSetting,
		setReverbDuration,
		reverbDecaySetting,
		setReverbDecay
	} from '../../../stores/synth-settings';

	const NOISE_COLORS = ['white', 'pink', 'brown'] as const;
</script>

<div class="space-y-4">
	<!-- Noise Buffer Config -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-2.5">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#c678dd] font-black">NOISE GENERATOR PCM AUDIO BUFFER</span>
			<span class="text-white/40 text-[10px]">AudioBuffer Allocation</span>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
			<div>
				<div class="flex justify-between text-white/70 mb-1">
					<span>PCM Buffer Length:</span>
					<span class="text-[#c678dd] font-bold">{$noiseDurationSetting.toFixed(1)}s ({($noiseDurationSetting * $audioSampleRate).toLocaleString()} samples)</span>
				</div>
				<input
					type="range"
					min={0.5}
					max={5.0}
					step={0.5}
					value={$noiseDurationSetting}
					oninput={(e) => setNoiseDuration(parseFloat((e.currentTarget as HTMLInputElement).value))}
					class="w-full accent-[#c678dd] cursor-pointer"
				/>
				<div class="flex justify-between text-[9px] text-white/40 mt-0.5">
					<span>0.5s (22k samples)</span>
					<span>2.0s (Default)</span>
					<span>5.0s (220k samples)</span>
				</div>
			</div>

			<div>
				<div class="flex justify-between text-white/70 mb-1">
					<span>Noise Color Spectrum:</span>
					<span class="text-[#c678dd] font-bold uppercase">{$noiseColorSetting}</span>
				</div>
				<div class="grid grid-cols-3 gap-1 mt-1">
					{#each NOISE_COLORS as col (col)}
						<button
							onclick={() => {
								setNoiseColor(col);
								playSound('toggle');
							}}
							class="press py-1 rounded-xs border text-center font-bold uppercase transition-all {$noiseColorSetting === col
								? 'border-[#c678dd] bg-[#c678dd] text-black font-black'
								: 'border-white/15 bg-white/5 text-white/60 hover:text-white'} cursor-pointer"
						>
							{col}
						</button>
					{/each}
				</div>
			</div>
		</div>
	</div>

	<!-- Convolution Space Reverb Buffer -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-2.5">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#c678dd] font-black">CONVOLUTION REVERB IMPULSE RESPONSE BUFFER</span>
			<span class="text-white/40 text-[10px]">Stereo IR Buffer</span>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
			<div>
				<div class="flex justify-between text-white/70 mb-1">
					<span>Impulse Duration (RT60):</span>
					<span class="text-[#c678dd] font-bold">{$reverbDurationSetting.toFixed(1)}s ({($reverbDurationSetting * $audioSampleRate * 2).toLocaleString()} stereo samples)</span>
				</div>
				<input
					type="range"
					min={0.2}
					max={6.0}
					step={0.2}
					value={$reverbDurationSetting}
					oninput={(e) => setReverbDuration(parseFloat((e.currentTarget as HTMLInputElement).value))}
					class="w-full accent-[#c678dd] cursor-pointer"
				/>
				<div class="flex justify-between text-[9px] text-white/40 mt-0.5">
					<span>0.2s (Room)</span>
					<span>1.8s (Plate)</span>
					<span>6.0s (Cathedral)</span>
				</div>
			</div>

			<div>
				<div class="flex justify-between text-white/70 mb-1">
					<span>Decay Factor (Air Absorption):</span>
					<span class="text-[#c678dd] font-bold">{$reverbDecaySetting.toFixed(2)}</span>
				</div>
				<input
					type="range"
					min={0.1}
					max={2.0}
					step={0.05}
					value={$reverbDecaySetting}
					oninput={(e) => setReverbDecay(parseFloat((e.currentTarget as HTMLInputElement).value))}
					class="w-full accent-[#c678dd] cursor-pointer"
				/>
				<div class="flex justify-between text-[9px] text-white/40 mt-0.5">
					<span>0.1 (Dark)</span>
					<span>0.6 (Warm)</span>
					<span>2.0 (Bright Air)</span>
				</div>
			</div>
		</div>
	</div>
</div>
