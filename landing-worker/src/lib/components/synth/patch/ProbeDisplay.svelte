<script lang="ts">
	/**
	 * What a probe module is seeing, drawn live.
	 *
	 * The analyser is created by the engine when a voice is built and parked in
	 * modularSynth.graphProbes under the node's id, so this only has to find it
	 * and draw. Nothing here touches the signal -- a meter that changed the
	 * sound would be useless for finding out what the sound is.
	 *
	 * One rAF loop per probe, stopped as soon as the card unmounts, and it draws
	 * nothing at all while no analyser exists (between notes) rather than
	 * spinning on an empty buffer.
	 */
	import { onMount } from 'svelte';
	import { modularSynth } from '../../../synth';

	let { kind, nodeId, color }: { kind: 'scope' | 'fft' | 'meter'; nodeId: string; color: string } = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);

	onMount(() => {
		let raf = 0;
		const time = new Uint8Array(2048);
		const freq = new Uint8Array(1024);

		function frame() {
			raf = requestAnimationFrame(frame);
			const el = canvas;
			const an = modularSynth.graphProbes.get(nodeId);
			if (!el) return;
			const ctx = el.getContext('2d');
			if (!ctx) return;
			const w = el.width;
			const h = el.height;
			ctx.clearRect(0, 0, w, h);
			if (!an) return;

			ctx.strokeStyle = color;
			ctx.fillStyle = color;
			ctx.lineWidth = 1;

			if (kind === 'scope') {
				const n = Math.min(an.fftSize, time.length);
				an.getByteTimeDomainData(time);
				ctx.beginPath();
				for (let i = 0; i < n; i++) {
					const x = (i / (n - 1)) * w;
					const y = h - ((time[i] - 128) / 128) * (h / 2) - h / 2;
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			} else if (kind === 'fft') {
				const n = Math.min(an.frequencyBinCount, freq.length);
				an.getByteFrequencyData(freq);
				// Log-spaced, so the bottom four octaves are not one pixel wide.
				const bars = 32;
				for (let b = 0; b < bars; b++) {
					const lo = Math.floor(Math.pow(n, b / bars));
					const hi = Math.max(lo + 1, Math.floor(Math.pow(n, (b + 1) / bars)));
					let peak = 0;
					for (let i = lo; i < hi && i < n; i++) if (freq[i] > peak) peak = freq[i];
					const bh = (peak / 255) * h;
					ctx.fillRect((b / bars) * w, h - bh, w / bars - 1, bh);
				}
			} else {
				const n = Math.min(an.fftSize, time.length);
				an.getByteTimeDomainData(time);
				let sum = 0;
				for (let i = 0; i < n; i++) {
					const v = (time[i] - 128) / 128;
					sum += v * v;
				}
				const rms = Math.sqrt(sum / n);
				// dBFS across the width, floored at -60 where a meter stops being useful.
				const db = 20 * Math.log10(Math.max(1e-6, rms));
				const frac = Math.max(0, Math.min(1, (db + 60) / 60));
				ctx.fillRect(0, 2, frac * w, h - 4);
			}
		}

		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});
</script>

<canvas
	bind:this={canvas}
	width="112"
	height="26"
	class="w-full bg-black/70 border border-white/15 rounded-xs"
	style="height: 26px"
></canvas>
