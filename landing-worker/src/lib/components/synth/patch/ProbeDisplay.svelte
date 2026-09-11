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
		/* Which family is actually patched in. The card knows, because it knows
		   which socket has a cable on it, and the scale depends entirely on the
		   answer: audio is read against a fixed full scale, a value against its
		   own declared bounds. Guessing from the samples cannot work -- a CV
		   that happens to sit inside -1..1 is indistinguishable from audio. */
		cv = false,
		/* The module's own knobs. A meter you cannot adjust shows one view of the
		   signal and hides every other: a scope at a fixed span cannot resolve a
		   kick and a hi-hat both, and a spectrum at a fixed floor either buries
		   the quiet detail or fills with noise. */
		params = {}
	}: {
		kind: 'scope' | 'fft' | 'meter';
		nodeId: string;
		color: string;
		cv?: boolean;
		params?: Record<string, number>;
	} = $props();

	const p = (key: string, def: number) => params[key] ?? def;

	/* The axis, low and high.
	
	   Sorted rather than trusted in order, so a range typed backwards draws
	   upside down instead of drawing nothing: an axis of zero height is a blank
	   card, which looks like a broken probe rather than like a typo. */
	const bounds = $derived.by(() => {
		const a = p('cvLo', -1);
		const b = p('cvHi', 1);
		const lo = Math.min(a, b);
		const hi = Math.max(a, b);
		return hi - lo < 1e-9 ? { lo, hi: lo + 1 } : { lo, hi };
	});

	/** A number short enough to sit in a 4-pixel gutter and still be read. */
	function tickLabel(v: number): string {
		const a = Math.abs(v);
		if (a === 0) return '0';
		if (a >= 1e4 || (a < 0.01 && a > 0)) return v.toExponential(0).replace('e+', 'e');
		if (a >= 100) return v.toFixed(0);
		if (a >= 10) return v.toFixed(1).replace(/\.0$/, '');
		/* Both trailing zeros, not one.

		   `/0$/` strips a single character, so 1.00 came back as "1.0" while the
		   branch above turned 10.0 into "10" -- the same axis reading 1.0 at one
		   end and 10 at the other. Every audio probe hits it: the fixed -1..1
		   scale is drawn as "1.0 / 0 / -1.0", one tick with a decimal place and
		   its own midpoint without. Strip the zeros, then the dot they left. */
		return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
	}

	let canvas = $state<HTMLCanvasElement | null>(null);

	onMount(() => {
		let raf = 0;
		const time = new Uint8Array(8192);
		/* Control values are read as floats, because the byte view cannot carry
		   them: getByteTimeDomainData maps 0..255 onto -1..1 and *saturates*, so
		   a CV of 3 and a CV of 10 both read back as 0.992 and every range above
		   unity would draw as a flat line pinned to the ceiling. Measured, not
		   assumed. Audio keeps the byte path, where it is exact and cheaper. */
		const timeF = new Float32Array(8192);
		const freq = new Uint8Array(1024);

		/* Horizontal rules with their values written on them.
		
		   A trace without numbers says a shape changed and not what it changed
		   to, which is the difference between a picture and a measurement -- and
		   a probe exists to be read off. */
		function drawScale(
			ctx: CanvasRenderingContext2D,
			w: number,
			h: number,
			lo: number,
			hi: number
		) {
			const ticks = [hi, (hi + lo) / 2, lo];
			ctx.save();
			ctx.font = '9px ui-monospace, monospace';
			ctx.textBaseline = 'middle';
			for (const t of ticks) {
				const y = h - ((t - lo) / (hi - lo)) * h;
				// Clear of the very edge, so the top and bottom labels are not clipped.
				const ly = Math.max(6, Math.min(h - 6, y));
				ctx.globalAlpha = 0.22;
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(w, y);
				ctx.stroke();
				ctx.globalAlpha = 0.65;
				ctx.fillText(tickLabel(t), 3, ly);
			}
			ctx.restore();
		}

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
				/* SPAN is a window in milliseconds, so a 20 ms setting shows about
				   one cycle of a bass note and forty of a cymbal -- which is what
				   makes a scope readable at both ends rather than at neither. */
				const rate = an.context.sampleRate;
				const want = Math.round((p('scopeSpan', 20) / 1000) * rate);
				const n = Math.max(8, Math.min(Math.min(an.fftSize, time.length), want));
				/* The two families are drawn against different axes, and that is
				   the whole point of knowing which one arrived: audio has a defined
				   full scale, so -1..1 is not a setting but what the numbers mean.
				   A control value has no ceiling at all, so its axis is whatever
				   was typed. */
				const lo = cv ? bounds.lo : -1;
				const hi = cv ? bounds.hi : 1;
				if (cv) an.getFloatTimeDomainData(timeF);
				else an.getByteTimeDomainData(time);
				const gain = Math.pow(10, p('scopeGain', 0) / 20);
				drawScale(ctx, w, h, lo, hi);
				ctx.strokeStyle = color;
				ctx.beginPath();
				for (let i = 0; i < n; i++) {
					const x = (i / (n - 1)) * w;
					const raw = cv ? timeF[i] : ((time[i] - 128) / 128) * gain;
					// Clamped to the axis rather than to -1..1, so a trace that runs
					// off the top is drawn at the top instead of wrapping.
					const v = Math.max(lo, Math.min(hi, raw));
					const y = h - ((v - lo) / (hi - lo)) * h;
					if (i === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
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
			} else if (cv) {
				/* A value, shown on its own axis and written out.
				
				   Not dB: decibels are a ratio against full scale, and a control
				   value has no full scale to be a ratio against -- a cutoff of 5000
				   is not "+74 dB of anything". The number is the reading, so the
				   bar says where it sits between the bounds and the text says what
				   it is. Averaged rather than peak-held, matching the audio side. */
				const n = Math.min(an.fftSize, timeF.length);
				an.getFloatTimeDomainData(timeF);
				let sum = 0;
				for (let i = 0; i < n; i++) sum += timeF[i];
				const mean = sum / n;
				const { lo, hi } = bounds;
				const frac = Math.max(0, Math.min(1, (mean - lo) / (hi - lo)));
				/* Grown from where zero sits, when zero is on the axis. A bar that
				   always grows from the left says nothing about sign, and sign is
				   most of what anyone is looking for in a bipolar CV. */
				const zero = lo <= 0 && hi >= 0 ? (0 - lo) / (hi - lo) : 0;
				const x0 = Math.min(frac, zero) * w;
				const x1 = Math.max(frac, zero) * w;
				ctx.fillRect(x0, 2, Math.max(1, x1 - x0), h - 4);
				ctx.save();
				ctx.font = '10px ui-monospace, monospace';
				ctx.textBaseline = 'middle';
				ctx.globalAlpha = 0.35;
				ctx.fillText(tickLabel(lo), 3, h / 2);
				const hiText = tickLabel(hi);
				ctx.fillText(hiText, w - ctx.measureText(hiText).width - 3, h / 2);
				// The reading itself, centred and brightest: it is the thing.
				ctx.globalAlpha = 1;
				ctx.fillStyle = '#fff';
				const t = tickLabel(mean);
				ctx.fillText(t, (w - ctx.measureText(t).width) / 2, h / 2);
				ctx.restore();
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
