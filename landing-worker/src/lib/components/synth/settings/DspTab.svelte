<script lang="ts">
	import { playSound } from '../../../sound';
	import { t } from '../../../i18n';
	import HorizontalHardwareFader from '../../hardware/HorizontalHardwareFader.svelte';
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
			<span class="text-[#c678dd] font-black">{$t('synthPanels.dsp.noiseBufferTitle')}</span>
			<span class="text-white/60 text-[10px]">{$t('synthPanels.dsp.audioBufferAllocation')}</span>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
			<div>
				<div class="flex justify-between text-white/70 mb-1">
					<span>{$t('synthPanels.dsp.pcmBufferLength')}</span>
					<span class="text-[#c678dd] font-bold">{$t('synthPanels.dsp.durationSamples', { seconds: $noiseDurationSetting.toFixed(1), samples: ($noiseDurationSetting * $audioSampleRate).toLocaleString() })}</span>
				</div>
				<HorizontalHardwareFader
					value={$noiseDurationSetting}
					min={0.5}
					max={5.0}
					step={0.5}
					color="#c678dd"
					width="100%"
					onChange={setNoiseDuration}
				/>
				<div class="flex justify-between text-[9px] text-white/60 mt-0.5">
					<span>{$t('synthPanels.dsp.noiseDurationMin')}</span>
					<span>{$t('synthPanels.dsp.noiseDurationDefault')}</span>
					<span>{$t('synthPanels.dsp.noiseDurationMax')}</span>
				</div>
			</div>

			<div>
				<div class="flex justify-between text-white/70 mb-1">
					<span>{$t('synthPanels.dsp.noiseColorLabel')}</span>
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
			<span class="text-[#c678dd] font-black">{$t('synthPanels.dsp.reverbBufferTitle')}</span>
			<span class="text-white/60 text-[10px]">{$t('synthPanels.dsp.stereoIrBuffer')}</span>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
			<div>
				<div class="flex justify-between text-white/70 mb-1">
					<span>{$t('synthPanels.dsp.impulseDuration')}</span>
					<span class="text-[#c678dd] font-bold">{$t('synthPanels.dsp.durationStereoSamples', { seconds: $reverbDurationSetting.toFixed(1), samples: ($reverbDurationSetting * $audioSampleRate * 2).toLocaleString() })}</span>
				</div>
				<HorizontalHardwareFader
					value={$reverbDurationSetting}
					min={0.2}
					max={6.0}
					step={0.2}
					color="#c678dd"
					width="100%"
					onChange={setReverbDuration}
				/>
				<div class="flex justify-between text-[9px] text-white/60 mt-0.5">
					<span>{$t('synthPanels.dsp.reverbDurationRoom')}</span>
					<span>{$t('synthPanels.dsp.reverbDurationPlate')}</span>
					<span>{$t('synthPanels.dsp.reverbDurationCathedral')}</span>
				</div>
			</div>

			<div>
				<div class="flex justify-between text-white/70 mb-1">
					<span>{$t('synthPanels.dsp.decayFactorLabel')}</span>
					<span class="text-[#c678dd] font-bold">{$reverbDecaySetting.toFixed(2)}</span>
				</div>
				<HorizontalHardwareFader
					value={$reverbDecaySetting}
					min={0.1}
					max={2.0}
					step={0.05}
					color="#c678dd"
					width="100%"
					onChange={setReverbDecay}
				/>
				<div class="flex justify-between text-[9px] text-white/60 mt-0.5">
					<span>{$t('synthPanels.dsp.decayDark')}</span>
					<span>{$t('synthPanels.dsp.decayWarm')}</span>
					<span>{$t('synthPanels.dsp.decayBrightAir')}</span>
				</div>
			</div>
		</div>
	</div>
</div>
