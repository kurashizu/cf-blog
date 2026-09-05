<script lang="ts">
	import { soundEngine } from '../../../sound';
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
		{ id: 'balanced', label: 'BALANCED (DEFAULT)', desc: 'Stable & Glitch-free (~20ms)' },
		{ id: 'interactive', label: 'INTERACTIVE', desc: 'Ultra-low Latency (~5ms)' },
		{ id: 'playback', label: 'PLAYBACK', desc: 'Maximum Buffer (~50ms)' }
	] as const;

	const FFT_SIZES = [1024, 2048, 4096, 8192];
</script>

<div class="space-y-4">
	<!-- System Audio Output Info -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-3">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#56b6c2] font-black">AUDIO CONTEXT & HARDWARE SAMPLE RATE</span>
			<span class="text-white/40 text-[10px]">Web Audio API</span>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
			<div class="p-2 border border-white/10 bg-black/30 rounded-xs">
				<div class="text-white/40 text-[10px] uppercase">DAC Sample Rate</div>
				<div class="text-white font-bold text-sm">{$audioSampleRate} Hz</div>
				<div class="text-white/50 text-[10px] mt-0.5">Device Native Audio Clock</div>
			</div>

			<div class="p-2 border border-white/10 bg-black/30 rounded-xs">
				<div class="text-white/40 text-[10px] uppercase">AudioContext Engine State</div>
				<div class="text-[#98c379] font-bold text-sm uppercase">{soundEngine.getAudioContextState()}</div>
				<div class="text-white/50 text-[10px] mt-0.5">Direct Destination Routing</div>
			</div>
		</div>
	</div>

	<!-- Audio Engine Latency Hint -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-2.5">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#56b6c2] font-black">AUDIO LATENCY BUFFER TARGET</span>
			<span class="text-white/40 text-[10px]">Buffer Tradeoff</span>
		</div>

		<div class="grid grid-cols-3 gap-2 pt-1">
			{#each LATENCY_HINTS as item (item.id)}
				<button
					onclick={() => setLatencyHint(item.id)}
					class="press p-2 rounded-xs border text-left cursor-pointer transition-all {$latencyHintSetting === item.id
						? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
						: 'border-white/10 bg-white/5 text-white/70 hover:text-white'}"
				>
					<div class="font-bold">{item.label}</div>
					<div class="text-[9px] {$latencyHintSetting === item.id ? 'text-black/80' : 'text-white/40'}">{item.desc}</div>
				</button>
			{/each}
		</div>
	</div>

	<!-- FFT Visualizer Resolution & Smoothing -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-3">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#56b6c2] font-black">FFT SPECTRUM ANALYSER RESOLUTION</span>
			<span class="text-white/40 text-[10px]">AnalyserNode Spec</span>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
			<div>
				<div class="flex justify-between text-white/70 mb-1">
					<span>FFT Size (Frequency Bins):</span>
					<span class="text-[#56b6c2] font-bold">{$fftSizeSetting} ({$fftSizeSetting / 2} bins)</span>
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
					<span>Time Smoothing Constant:</span>
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
					<span>0.10 (Instant/Fast)</span>
					<span>0.75 (Default)</span>
					<span>0.95 (Smooth Cinema)</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Brickwall Soft Limiter -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-2">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#56b6c2] font-black">MASTER BRICKWALL PEAK LIMITER</span>
			<span class="text-white/40 text-[10px]">Output Protection</span>
		</div>

		<div class="flex items-center justify-between pt-1">
			<div>
				<p class="text-white/80 font-bold">{$masterLimiterSetting ? 'Brickwall Safety Limiter: ACTIVE' : 'Safety Limiter: BYPASSED'}</p>
				<p class="text-white/40 text-[10px]">Prevents hardware clipping and DAC overload distortion when multiple tracks layer</p>
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
