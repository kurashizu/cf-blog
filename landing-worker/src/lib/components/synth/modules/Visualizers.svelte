<script lang="ts">
	import { onMount } from 'svelte';
	import { playSound } from '../../../sound';
	import { sound } from '../../../sound';
	import { soundState } from '../../../stores/sound';

	export type VisualizerMode = 'fft' | 'scope' | 'loudness';
	type TimeBase = '0.25x' | '0.5x' | '1x' | '2x' | '4x' | '8x' | '16x';

	let { mode }: { mode: VisualizerMode } = $props();
	let activeOutVisualizer = $derived(mode);
	let timeBase = $state<TimeBase>('1x');

	let fftCanvas: HTMLCanvasElement | undefined = $state();
	let waveCanvas: HTMLCanvasElement | undefined = $state();
	let loudnessCanvas: HTMLCanvasElement | undefined = $state();

	function setTimeBase(tb: TimeBase) {
		timeBase = tb;
		playSound('click');
	}

	const TIME_BASES: TimeBase[] = ['0.5x', '1x', '2x', '4x', '8x', '16x'];
	const WINDOW_SIZES: Record<TimeBase, number> = { '0.25x': 64, '0.5x': 128, '1x': 256, '2x': 512, '4x': 1024, '8x': 2048, '16x': 4096 };

	onMount(() => {
		const fftCtx = fftCanvas?.getContext('2d');
		const waveCtx = waveCanvas?.getContext('2d');

		let loudnessHistory: number[] = new Array(360).fill(-100);
		let animId = 0;
		const minLog = Math.log10(20);
		const maxLog = Math.log10(20000);
		const logRange = maxLog - minLog;

		const render = () => {
			animId = requestAnimationFrame(render);
			const isMuted = $soundState.muted;
			const freqData = sound.getByteFrequencyData();
			const timeData = sound.getByteTimeDomainData();

			// FFT log-frequency spectrum
			if (fftCanvas && fftCtx) {
				const w = fftCanvas.width;
				const h = fftCanvas.height;
				fftCtx.clearRect(0, 0, w, h);
				fftCtx.fillStyle = 'rgba(10, 12, 16, 0.95)';
				fftCtx.fillRect(0, 0, w, h);

				const tick100 = ((Math.log10(100) - minLog) / logRange) * w;
				const tick1k = ((Math.log10(1000) - minLog) / logRange) * w;
				const tick10k = ((Math.log10(10000) - minLog) / logRange) * w;

				fftCtx.save();
				fftCtx.setLineDash([2, 3]);
				fftCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
				fftCtx.lineWidth = 1;
				for (const tx of [tick100, tick1k, tick10k]) {
					fftCtx.beginPath();
					fftCtx.moveTo(tx, 0);
					fftCtx.lineTo(tx, h);
					fftCtx.stroke();
				}
				fftCtx.beginPath();
				fftCtx.moveTo(0, h * 0.5);
				fftCtx.lineTo(w, h * 0.5);
				fftCtx.stroke();
				fftCtx.restore();

				fftCtx.font = '7px monospace';
				fftCtx.fillStyle = 'rgba(255, 255, 255, 0.35)';
				fftCtx.fillText('100', tick100 - 6, 8);
				fftCtx.fillText('1k', tick1k - 4, 8);
				fftCtx.fillText('10k', tick10k - 6, 8);

				if (freqData && !isMuted) {
					const binCount = freqData.length;
					const nyquist = 22050;
					const grad = fftCtx.createLinearGradient(0, 0, 0, h);
					grad.addColorStop(0, '#e5c07b');
					grad.addColorStop(0.5, '#c678dd');
					grad.addColorStop(1, '#56b6c2');
					fftCtx.fillStyle = grad;
					fftCtx.beginPath();
					fftCtx.moveTo(0, h);
					const stepX = 2;
					for (let x = 0; x <= w; x += stepX) {
						const f = Math.pow(10, minLog + (x / w) * logRange);
						const binIdx = Math.min(binCount - 1, Math.max(0, (f / nyquist) * binCount));
						const idxLow = Math.floor(binIdx);
						const idxHigh = Math.min(binCount - 1, idxLow + 1);
						const frac = binIdx - idxLow;
						const amp = (freqData[idxLow] * (1 - frac) + freqData[idxHigh] * frac) / 255.0;
						const barH = amp * (h - 4);
						fftCtx.lineTo(x, h - barH);
					}
					fftCtx.lineTo(w, h);
					fftCtx.closePath();
					fftCtx.globalAlpha = 0.85;
					fftCtx.fill();
					fftCtx.globalAlpha = 1.0;
				}
			}

			// Oscilloscope
			if (waveCanvas && waveCtx) {
				const w = waveCanvas.width;
				const h = waveCanvas.height;
				waveCtx.clearRect(0, 0, w, h);
				waveCtx.fillStyle = 'rgba(10, 12, 16, 0.95)';
				waveCtx.fillRect(0, 0, w, h);

				waveCtx.save();
				waveCtx.setLineDash([2, 3]);
				waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
				waveCtx.lineWidth = 1;
				for (let i = 1; i < 4; i++) {
					const gx = (w / 4) * i;
					waveCtx.beginPath();
					waveCtx.moveTo(gx, 0);
					waveCtx.lineTo(gx, h);
					waveCtx.stroke();
				}
				waveCtx.beginPath();
				waveCtx.moveTo(0, h / 2);
				waveCtx.lineTo(w, h / 2);
				waveCtx.moveTo(0, h * 0.2);
				waveCtx.lineTo(w, h * 0.2);
				waveCtx.moveTo(0, h * 0.8);
				waveCtx.lineTo(w, h * 0.8);
				waveCtx.stroke();
				waveCtx.restore();

				if (timeData && !isMuted) {
					let windowSize = Math.min(timeData.length, WINDOW_SIZES[timeBase]);
					let startIdx = 0;
					const maxSearch = Math.min(256, timeData.length - windowSize);
					for (let i = 0; i < maxSearch; i++) {
						if (timeData[i] < 128 && timeData[i + 1] >= 128) {
							startIdx = i;
							break;
						}
					}

					waveCtx.save();
					waveCtx.strokeStyle = '#98c379';
					waveCtx.lineWidth = 1.6;
					waveCtx.shadowColor = '#98c379';
					waveCtx.shadowBlur = 3;
					waveCtx.beginPath();
					const vGain = 2.5;
					for (let i = 0; i < windowSize; i++) {
						const raw = timeData[startIdx + i];
						const normalized = ((raw !== undefined ? raw : 128) - 128) / 128.0;
						const amplified = Math.max(-1, Math.min(1, normalized * vGain));
						const y = ((1 - amplified) * h) / 2;
						const x = (i / (windowSize - 1)) * w;
						if (i === 0) waveCtx.moveTo(x, y);
						else waveCtx.lineTo(x, y);
					}
					waveCtx.stroke();
					waveCtx.restore();
				} else {
					waveCtx.strokeStyle = 'rgba(152, 195, 121, 0.4)';
					waveCtx.lineWidth = 1;
					waveCtx.beginPath();
					waveCtx.moveTo(0, h / 2);
					waveCtx.lineTo(w, h / 2);
					waveCtx.stroke();
				}
			}

			// RMS loudness meter/history
			const loudCtx = loudnessCanvas?.getContext('2d');
			if (loudnessCanvas && loudCtx) {
				const w = loudnessCanvas.width;
				const h = loudnessCanvas.height;
				loudCtx.clearRect(0, 0, w, h);
				loudCtx.fillStyle = 'rgba(10, 12, 16, 0.95)';
				loudCtx.fillRect(0, 0, w, h);

				let sum = 0;
				if (timeData && !isMuted) {
					for (let i = 0; i < timeData.length; i++) {
						const val = (timeData[i] - 128) / 128;
						sum += val * val;
					}
				}
				const rms = Math.sqrt(sum / (timeData?.length || 1));
				const db = isMuted ? -100 : rms > 0 ? 20 * Math.log10(rms) : -100;

				loudnessHistory.push(db);
				if (loudnessHistory.length > w) loudnessHistory.shift();

				loudCtx.save();
				loudCtx.setLineDash([2, 3]);
				loudCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
				loudCtx.lineWidth = 1;
				const mapDbToY = (val: number) => {
					const maxDb = 6;
					const minDb = -60;
					return h - Math.max(0, Math.min(1, (val - minDb) / (maxDb - minDb))) * h;
				};
				const y0 = mapDbToY(0);
				const y6 = mapDbToY(-6);
				const y12 = mapDbToY(-12);
				for (const y of [y0, y6, y12]) {
					loudCtx.beginPath();
					loudCtx.moveTo(0, y);
					loudCtx.lineTo(w, y);
					loudCtx.stroke();
				}
				loudCtx.restore();

				loudCtx.font = '7px monospace';
				loudCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
				loudCtx.fillText('0dB', 2, y0 - 2);
				loudCtx.fillText('-6', 2, y6 - 2);
				loudCtx.fillText('-12', 2, y12 - 2);

				loudCtx.beginPath();
				for (let i = 0; i < loudnessHistory.length; i++) {
					const y = mapDbToY(loudnessHistory[i]);
					if (i === 0) loudCtx.moveTo(i, y);
					else loudCtx.lineTo(i, y);
				}
				loudCtx.strokeStyle = '#e06c75';
				loudCtx.lineWidth = 1.5;
				loudCtx.stroke();

				const grad = loudCtx.createLinearGradient(0, 0, 0, h);
				grad.addColorStop(0, 'rgba(224, 108, 117, 0.6)');
				grad.addColorStop(1, 'rgba(224, 108, 117, 0.0)');
				loudCtx.lineTo(w, h);
				loudCtx.lineTo(0, h);
				loudCtx.fillStyle = grad;
				loudCtx.fill();

				const curDb = loudnessHistory[loudnessHistory.length - 1];
				const barH = h - mapDbToY(curDb);
				loudCtx.fillStyle = curDb > 0 ? 'rgba(255, 0, 0, 0.8)' : 'rgba(152, 195, 121, 0.8)';
				loudCtx.fillRect(w - 6, h - barH, 6, barH);
			}
		};

		render();
		return () => cancelAnimationFrame(animId);
	});
</script>

<div class="col-span-8 flex flex-col justify-between border border-white/15 bg-black/90 rounded-xs p-1 h-full">
	<div class="flex items-center justify-between text-[10px] font-mono text-white/50 px-1 pb-0.5 border-b border-white/10 shrink-0">
		<span class={activeOutVisualizer === 'fft' ? 'text-[#56b6c2] font-black' : activeOutVisualizer === 'scope' ? 'text-[#98c379] font-black' : 'text-[#e06c75] font-black'}>
			{activeOutVisualizer === 'fft' ? 'FFT LOG SPECTRUM' : activeOutVisualizer === 'scope' ? 'OSCILLOSCOPE WAVE' : 'RMS LOUDNESS GRAPH'}
		</span>
		{#if activeOutVisualizer === 'fft'}
			<span class="text-[9px] text-white/50 font-bold">20Hz-20k</span>
		{:else if activeOutVisualizer === 'loudness'}
			<span class="text-[9px] text-white/50 font-bold">-60dB to +6dB</span>
		{:else}
			<div class="flex items-center gap-0.5">
				{#each TIME_BASES as tb (tb)}
					<button
						onclick={() => setTimeBase(tb)}
						class="px-1 py-0.2 rounded-xs border text-[8px] cursor-pointer font-black leading-none {timeBase === tb
							? 'border-[#98c379] bg-[#98c379] text-black font-black'
							: 'border-white/20 text-white/60 hover:text-white'}"
					>
						{tb}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="relative flex-1 min-h-[46px] rounded-xs overflow-hidden mt-0.5">
		<canvas bind:this={fftCanvas} width="360" height="46" class="w-full h-full {activeOutVisualizer === 'fft' ? 'block' : 'hidden'}"></canvas>
		<canvas bind:this={waveCanvas} width="360" height="46" class="w-full h-full {activeOutVisualizer === 'scope' ? 'block' : 'hidden'}"></canvas>
		<canvas bind:this={loudnessCanvas} width="360" height="46" class="w-full h-full {activeOutVisualizer === 'loudness' ? 'block' : 'hidden'}"></canvas>
	</div>
</div>
