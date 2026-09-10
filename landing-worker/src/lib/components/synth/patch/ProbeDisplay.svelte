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

	let {
		kind,
		nodeId,
		color,
		/* The module's own knobs. A meter you cannot adjust shows one view of the
		   signal and hides every other: a scope at a fixed span cannot resolve a
		   kick and a hi-hat both, and a spectrum at a fixed floor either buries
		   the quiet detail or fills with noise. */
		params = {}
	}: {
		kind: 'scope' | 'fft' | 'meter';
		nodeId: string;
		color: string;
		params?: Record<string, number>;
	} = $props();

	const p = (key: string, def: number) => params[key] ?? def;

	let canvas = $state<HTMLCanvasElement | null>(null);

	onMount(() => {
		let raf = 0;
		const time = new Uint8Array(8192);
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
				an.getByteTimeDomainData(time);
				/* SPAN is a window in milliseconds, so a 20 ms setting shows about
				   one cycle of a bass note and forty of a cymbal -- which is what
				   makes a scope readable at both ends rather than at neither. */
				const rate = an.context.sampleRate;
				const want = Math.round((p('scopeSpan', 20) / 1000) * rate);
				const n = Math.max(8, Math.min(Math.min(an.fftSize, time.length), want));
				const gain = Math.pow(10, p('scopeGain', 0) / 20);
				ctx.beginPath();
				for (let i = 0; i < n; i++) {
					const x = (i / (n - 1)) * w;
					const v = Math.max(-1, Math.min(1, ((time[i] - 128) / 128) * gain));
					const y = h / 2 - v * (h / 2);
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
				// Centre line, so a trace at rest reads as silence and not as an
				// absent signal.
				ctx.globalAlpha = 0.25;
				ctx.beginPath();
				ctx.moveTo(0, h / 2);
				ctx.lineTo(w, h / 2);
				ctx.stroke();
				ctx.globalAlpha = 1;
			} else if (kind === 'fft') {
				const n = Math.min(an.frequencyBinCount, freq.length);
				an.getByteFrequencyData(freq);
				// Log-spaced, so the bottom four octaves are not one pixel wide.
				an.smoothingTimeConstant = Math.max(0, Math.min(0.95, p('fftSmooth', 20) / 100));
				/* FLOOR is where the display bottoms out. The analyser reports
				   0..255 across its own dB range, so the floor is read back onto
				   that: raise it to see the quiet detail, lower it to keep the
				   noise out. */
				const floorDb = p('fftFloor', -90);
				const span = Math.max(1, an.maxDecibels - floorDb);
				const bars = 40;
				for (let b = 0; b < bars; b++) {
					const lo = Math.floor(Math.pow(n, b / bars));
					const hi = Math.max(lo + 1, Math.floor(Math.pow(n, (b + 1) / bars)));
					let peak = 0;
					for (let i = lo; i < hi && i < n; i++) if (freq[i] > peak) peak = freq[i];
					const db = an.minDecibels + (peak / 255) * (an.maxDecibels - an.minDecibels);
					const bh = Math.max(0, Math.min(1, (db - floorDb) / span)) * h;
					ctx.fillRect((b / bars) * w, h - bh, w / bars - 1, bh);
				}
			} else {
				an.smoothingTimeConstant = Math.max(0, Math.min(0.95, p('loudSmooth', 60) / 100));
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

<!-- A scope and a spectrum are the module; a level meter is a reading beside
     one. Sized accordingly, and the backing store matches so the trace is not
     drawn at a quarter resolution and stretched. -->
<canvas
	bind:this={canvas}
	width={kind === 'meter' ? 224 : 320}
	height={kind === 'meter' ? 80 : 192}
	class="w-full bg-black/70 border border-white/15 rounded-xs"
	style="height: {kind === 'meter' ? 40 : 96}px"
></canvas>
