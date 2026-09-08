<script lang="ts">
	import { soundEngine } from '../../../sound';
	import { t } from '../../../i18n';
	import HorizontalHardwareFader from '../../hardware/HorizontalHardwareFader.svelte';
	import {
		audioSampleRate,
		latencyHintSetting,
		setLatencyHint,
		fftSizeSetting,
		setFftSize,
		fftSmoothingSetting,
		setFftSmoothing,
		masterLimiterSetting,
		setMasterLimiter
	} from '../../../stores/synth-settings';

	const LATENCY_HINTS = [
		{ id: 'balanced', labelKey: 'synthPanels.audioHw.latencyBalanced', descKey: 'synthPanels.audioHw.latencyBalancedDesc' },
		{ id: 'interactive', labelKey: 'synthPanels.audioHw.latencyInteractive', descKey: 'synthPanels.audioHw.latencyInteractiveDesc' },
		{ id: 'playback', labelKey: 'synthPanels.audioHw.latencyPlayback', descKey: 'synthPanels.audioHw.latencyPlaybackDesc' }
	] as const;

	const FFT_SIZES = [1024, 2048, 4096, 8192];
</script>

<div class="space-y-4">
	<!-- System Audio Output Info -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-3">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#56b6c2] font-black">{$t('synthPanels.audioHw.contextTitle')}</span>
			<span class="text-white/40 text-[10px]">{$t('synthPanels.audioHw.webAudioApi')}</span>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
			<div class="p-2 border border-white/10 bg-black/30 rounded-xs">
				<div class="text-white/40 text-[10px] uppercase">{$t('synthPanels.audioHw.dacSampleRate')}</div>
				<div class="text-white font-bold text-sm">{$audioSampleRate} Hz</div>
				<div class="text-white/50 text-[10px] mt-0.5">{$t('synthPanels.audioHw.deviceClock')}</div>
			</div>

			<div class="p-2 border border-white/10 bg-black/30 rounded-xs">
				<div class="text-white/40 text-[10px] uppercase">{$t('synthPanels.audioHw.engineState')}</div>
				<div class="text-[#98c379] font-bold text-sm uppercase">{soundEngine.getAudioContextState()}</div>
				<div class="text-white/50 text-[10px] mt-0.5">{$t('synthPanels.audioHw.directRouting')}</div>
			</div>
		</div>
	</div>

	<!-- Audio Engine Latency Hint -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-2.5">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#56b6c2] font-black">{$t('synthPanels.audioHw.latencyTitle')}</span>
			<span class="text-white/40 text-[10px]">{$t('synthPanels.audioHw.bufferTradeoff')}</span>
		</div>

		<div class="grid grid-cols-3 gap-2 pt-1">
			{#each LATENCY_HINTS as item (item.id)}
				<button
					onclick={() => setLatencyHint(item.id)}
					class="press p-2 rounded-xs border text-left cursor-pointer transition-all {$latencyHintSetting === item.id
						? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
						: 'border-white/10 bg-white/5 text-white/70 hover:text-white'}"
				>
					<div class="font-bold">{$t(item.labelKey)}</div>
					<div class="text-[9px] {$latencyHintSetting === item.id ? 'text-black/80' : 'text-white/40'}">{$t(item.descKey)}</div>
				</button>
			{/each}
		</div>
	</div>

	<!-- FFT Visualizer Resolution & Smoothing -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-3">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#56b6c2] font-black">{$t('synthPanels.audioHw.fftTitle')}</span>
			<span class="text-white/40 text-[10px]">{$t('synthPanels.audioHw.analyserSpec')}</span>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
			<div>
				<div class="flex justify-between text-white/70 mb-1">
					<span>{$t('synthPanels.audioHw.fftSizeLabel')}</span>
					<span class="text-[#56b6c2] font-bold">{$t('synthPanels.audioHw.fftBinsValue', { size: $fftSizeSetting, bins: $fftSizeSetting / 2 })}</span>
				</div>
				<div class="grid grid-cols-4 gap-1">
					{#each FFT_SIZES as size (size)}
						<button
							onclick={() => setFftSize(size)}
							class="press py-1 rounded-xs border text-center font-bold text-[11px] transition-all {$fftSizeSetting === size
								? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
								: 'border-white/15 bg-white/5 text-white/60 hover:text-white'} cursor-pointer"
						>
							{size}
						</button>
					{/each}
				</div>
			</div>

			<div>
				<div class="flex justify-between text-white/70 mb-1">
					<span>{$t('synthPanels.audioHw.smoothingLabel')}</span>
					<span class="text-[#56b6c2] font-bold">{$fftSmoothingSetting.toFixed(2)}</span>
				</div>
				<HorizontalHardwareFader
					value={$fftSmoothingSetting}
					min={0.1}
					max={0.95}
					step={0.05}
					color="#56b6c2"
					width="100%"
					onChange={setFftSmoothing}
				/>
				<div class="flex justify-between text-[9px] text-white/40 mt-0.5">
					<span>{$t('synthPanels.audioHw.smoothingFast')}</span>
					<span>{$t('synthPanels.audioHw.smoothingDefault')}</span>
					<span>{$t('synthPanels.audioHw.smoothingCinema')}</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Brickwall Soft Limiter -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-2">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#56b6c2] font-black">{$t('synthPanels.audioHw.limiterTitle')}</span>
			<span class="text-white/40 text-[10px]">{$t('synthPanels.audioHw.outputProtection')}</span>
		</div>

		<div class="flex items-center justify-between pt-1">
			<div>
				<p class="text-white/80 font-bold">{$masterLimiterSetting ? $t('synthPanels.audioHw.limiterActive') : $t('synthPanels.audioHw.limiterBypassed')}</p>
				<p class="text-white/40 text-[10px]">{$t('synthPanels.audioHw.limiterDesc')}</p>
			</div>
			<button
				onclick={() => setMasterLimiter(!$masterLimiterSetting)}
				class="press px-3 py-1 rounded-xs border font-black text-xs cursor-pointer transition-all {$masterLimiterSetting
					? 'border-[#98c379] bg-[#98c379] text-black shadow-[0_0_8px_#98c379]'
					: 'border-white/20 bg-white/5 text-white/60 hover:text-white'}"
			>
				{$masterLimiterSetting ? 'LIMITER: ON' : 'LIMITER: OFF'}
			</button>
		</div>
	</div>
</div>
