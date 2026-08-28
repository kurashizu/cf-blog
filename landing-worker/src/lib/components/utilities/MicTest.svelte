<script lang="ts">
	import { onMount } from 'svelte';

	const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

	let stream: MediaStream | null = null;
	let ctx: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let raf = 0;

	let listening = $state(false);
	let error = $state<string | null>(null);
	let rms = $state(-Infinity);
	let peak = $state(-Infinity);
	let clipped = $state(false);
	let dominantHz = $state(0);
	let settings = $state<{ label: string; value: string }[]>([]);
	let canvas: HTMLCanvasElement | undefined = $state();

	/** dBFS from a linear 0..1 amplitude. -Infinity for silence. */
	function toDb(v: number): number {
		return v <= 0 ? -Infinity : 20 * Math.log10(v);
	}

	function noteFor(hz: number): string {
		if (hz <= 0) return '';
		const midi = Math.round(69 + 12 * Math.log2(hz / 440));
		if (midi < 0 || midi > 127) return '';
		const cents = Math.round(1200 * Math.log2(hz / (440 * Math.pow(2, (midi - 69) / 12))));
		return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}${cents === 0 ? '' : ` ${cents > 0 ? '+' : ''}${cents}¢`}`;
	}

	async function start() {
		error = null;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				// Raw input — the processing chain would fight a level meter.
				audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
			});
		} catch (e) {
			error = e instanceof Error ? `${e.name}: ${e.message}` : 'Microphone access denied';
			return;
		}

		const Klass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		ctx = new Klass();
		const source = ctx.createMediaStreamSource(stream);
		analyser = ctx.createAnalyser();
		analyser.fftSize = 2048;
		analyser.smoothingTimeConstant = 0.7;
		source.connect(analyser);
		listening = true;
		readSettings();
		loop();
	}

	/** Whatever the browser actually granted, not what we asked for. */
	function readSettings() {
		const track = stream?.getAudioTracks()[0];
		if (!track || !ctx) return;
		const s = track.getSettings();
		settings = [
			{ label: 'DEVICE', value: track.label || '(label withheld)' },
			{ label: 'SAMPLE RATE', value: `${s.sampleRate ?? ctx.sampleRate} Hz` },
			{ label: 'CHANNELS', value: String(s.channelCount ?? 1) },
			{ label: 'ECHO CANCEL', value: String(s.echoCancellation ?? 'n/a') },
			{ label: 'NOISE SUPPR.', value: String(s.noiseSuppression ?? 'n/a') },
			{ label: 'AUTO GAIN', value: String(s.autoGainControl ?? 'n/a') }
		];
	}

	function stop() {
		cancelAnimationFrame(raf);
		stream?.getTracks().forEach((t) => t.stop());
		void ctx?.close();
		stream = null;
		ctx = null;
		analyser = null;
		listening = false;
		rms = -Infinity;
		peak = -Infinity;
		dominantHz = 0;
		clipped = false;
	}

	function loop() {
		if (!analyser || !ctx) return;
		const time = new Float32Array(analyser.fftSize);
		const freq = new Uint8Array(analyser.frequencyBinCount);

		const tick = () => {
			if (!analyser || !ctx) return;
			analyser.getFloatTimeDomainData(time);
			analyser.getByteFrequencyData(freq);

			let sum = 0;
			let max = 0;
			for (const v of time) {
				sum += v * v;
				const a = Math.abs(v);
				if (a > max) max = a;
			}
			rms = toDb(Math.sqrt(sum / time.length));
			peak = toDb(max);
			if (max >= 0.999) clipped = true;

			let bin = 0;
			for (let i = 1; i < freq.length; i++) if (freq[i] > freq[bin]) bin = i;
			dominantHz = freq[bin] > 24 ? Math.round((bin * ctx.sampleRate) / analyser.fftSize) : 0;

			draw(freq);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
	}

	function draw(freq: Uint8Array) {
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
			canvas.width = w * dpr;
			canvas.height = h * dpr;
		}
		const g = canvas.getContext('2d');
		if (!g) return;
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, w, h);

		// Log-spaced bars so the low end isn't crushed into a few pixels.
		const bars = Math.min(160, Math.floor(w / 3));
		for (let i = 0; i < bars; i++) {
			const lo = Math.floor(Math.pow(freq.length, i / bars));
			const hi = Math.max(lo + 1, Math.floor(Math.pow(freq.length, (i + 1) / bars)));
			let peakBin = 0;
			for (let j = lo; j < hi && j < freq.length; j++) peakBin = Math.max(peakBin, freq[j]);
			const bh = (peakBin / 255) * h;
			const x = (i / bars) * w;
			g.fillStyle = `hsl(${190 - (peakBin / 255) * 130}, 70%, 55%)`;
			g.fillRect(x, h - bh, w / bars - 1, bh);
		}
	}

	onMount(() => stop);

	let level = $derived(rms === -Infinity ? 0 : Math.max(0, Math.min(1, (rms + 60) / 60)));
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-center gap-2">
		{#if listening}
			<button
				onclick={stop}
				class="px-2.5 py-1.5 border border-[#e06c75] text-[#e06c75] rounded-xs text-xs font-black cursor-pointer hover:bg-[#e06c75] hover:text-black"
			>
				STOP &amp; RELEASE MIC
			</button>
			<button
				onclick={() => (clipped = false)}
				class="px-2.5 py-1.5 border border-white/25 text-white/70 rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10"
			>
				RESET CLIP
			</button>
		{:else}
			<button
				onclick={start}
				class="px-2.5 py-1.5 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black"
			>
				GRANT MIC &amp; START
			</button>
		{/if}
		<span class="text-[11px] font-mono text-white/40">
			Audio never leaves the page — analysed in the browser, nothing is recorded or uploaded.
		</span>
	</div>

	{#if error}
		<div class="text-xs font-mono text-[#e06c75]">{error}</div>
	{/if}

	<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-2">
		<div class="flex items-center gap-2">
			<span class="text-[10px] font-mono font-bold text-white/45 uppercase w-10">RMS</span>
			<div class="flex-1 h-3 bg-black/60 border border-white/10 rounded-xs overflow-hidden">
				<div
					class="h-full transition-[width] duration-75"
					style="width: {level * 100}%; background: linear-gradient(90deg, #98c379, #e5c07b 70%, #e06c75 92%)"
				></div>
			</div>
			<span class="text-xs font-mono text-[#98c379] w-20 text-right">
				{rms === -Infinity ? '—' : `${rms.toFixed(1)} dBFS`}
			</span>
		</div>
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono">
			<span class="text-white/45">PEAK <span class="text-[#e5c07b]">{peak === -Infinity ? '—' : `${peak.toFixed(1)} dBFS`}</span></span>
			<span class="text-white/45">
				DOMINANT <span class="text-[#56b6c2]">{dominantHz ? `${dominantHz} Hz` : '—'}</span>
				{#if dominantHz}<span class="text-[#c678dd]"> · {noteFor(dominantHz)}</span>{/if}
			</span>
			{#if clipped}<span class="text-[#e06c75] font-bold">CLIP DETECTED</span>{/if}
		</div>
	</div>

	<canvas bind:this={canvas} class="w-full h-32 sm:h-40 border border-white/15 bg-black/50 rounded-xs"></canvas>

	{#if settings.length}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
			{#each settings as row (row.label)}
				<div class="border border-white/15 bg-black/40 rounded-xs px-2.5 py-2 flex items-baseline justify-between gap-2">
					<span class="text-[10px] font-mono font-bold text-white/45 uppercase shrink-0">{row.label}</span>
					<span class="text-xs font-mono font-bold text-[#d8dee9] truncate" title={row.value}>{row.value}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>
