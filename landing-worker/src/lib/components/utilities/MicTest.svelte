<script lang="ts">
	import { onMount } from 'svelte';

	const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
	/** Long enough to test a phrase, short enough that a forgotten recording can't grow without bound. */
	const MAX_REC_MS = 30_000;

	let stream: MediaStream | null = null;
	let ctx: AudioContext | null = null;
	let source: MediaStreamAudioSourceNode | null = null;
	let analyser: AnalyserNode | null = null;
	let monitorGain: GainNode | null = null;
	let raf = 0;

	let listening = $state(false);
	let error = $state<string | null>(null);
	let rms = $state(-Infinity);
	let peak = $state(-Infinity);
	let clipped = $state(false);
	let dominantHz = $state(0);
	let settings = $state<{ label: string; value: string }[]>([]);
	let canvas: HTMLCanvasElement | undefined = $state();

	let devices = $state<MediaDeviceInfo[]>([]);
	let selectedDevice = $state('');

	// ── recording ──
	let recorder: MediaRecorder | null = null;
	let chunks: Blob[] = [];
	let recTimer: ReturnType<typeof setInterval> | null = null;
	let recording = $state(false);
	let recMs = $state(0);
	let take = $state<{ blob: Blob; buffer: AudioBuffer; ext: string } | null>(null);
	let decoding = $state(false);

	// ── playback ──
	let playSource: AudioBufferSourceNode | null = null;
	let playRaf = 0;
	let playStartedAt = 0;
	let playing = $state(false);
	let playPos = $state(0);
	let monitor = $state(false);
	let takeCanvas: HTMLCanvasElement | undefined = $state();

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

	async function listDevices() {
		if (!navigator.mediaDevices?.enumerateDevices) return;
		const all = await navigator.mediaDevices.enumerateDevices();
		devices = all.filter((d) => d.kind === 'audioinput');
	}

	async function start(deviceId?: string) {
		error = null;
		teardownAudio();
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				// Raw input — the processing chain would fight a level meter.
				audio: {
					...(deviceId ? { deviceId: { exact: deviceId } } : {}),
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false
				}
			});
		} catch (e) {
			error = e instanceof Error ? `${e.name}: ${e.message}` : 'Microphone access denied';
			return;
		}

		const Klass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		ctx = new Klass();
		source = ctx.createMediaStreamSource(stream);
		analyser = ctx.createAnalyser();
		analyser.fftSize = 2048;
		analyser.smoothingTimeConstant = 0.7;
		source.connect(analyser);
		listening = true;
		// Device labels only populate once a grant exists, so re-read them here.
		await listDevices();
		selectedDevice = stream.getAudioTracks()[0]?.getSettings().deviceId ?? '';
		if (monitor) applyMonitor(true);
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

	function applyMonitor(on: boolean) {
		if (!ctx || !source) return;
		if (on) {
			if (monitorGain) return;
			monitorGain = ctx.createGain();
			monitorGain.gain.value = 0.8;
			source.connect(monitorGain);
			monitorGain.connect(ctx.destination);
		} else if (monitorGain) {
			try {
				source.disconnect(monitorGain);
			} catch {
				/* already detached with the source */
			}
			monitorGain.disconnect();
			monitorGain = null;
		}
	}

	function toggleMonitor() {
		monitor = !monitor;
		applyMonitor(monitor);
	}

	/** Release the mic and audio graph but keep any recorded take. */
	function teardownAudio() {
		cancelAnimationFrame(raf);
		stopRecording();
		stopPlayback();
		applyMonitor(false);
		stream?.getTracks().forEach((t) => t.stop());
		void ctx?.close();
		stream = null;
		ctx = null;
		source = null;
		analyser = null;
		listening = false;
		rms = -Infinity;
		peak = -Infinity;
		dominantHz = 0;
		clipped = false;
	}

	function stop() {
		teardownAudio();
		// A take decoded against the closed context can still be redrawn, but it
		// can no longer be played, so drop it with the device.
		take = null;
		recMs = 0;
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

	function fitCanvas(el: HTMLCanvasElement): CanvasRenderingContext2D | null {
		const dpr = window.devicePixelRatio || 1;
		const w = el.clientWidth;
		const h = el.clientHeight;
		if (el.width !== w * dpr || el.height !== h * dpr) {
			el.width = w * dpr;
			el.height = h * dpr;
		}
		const g = el.getContext('2d');
		if (!g) return null;
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, w, h);
		return g;
	}

	function draw(freq: Uint8Array) {
		if (!canvas) return;
		const g = fitCanvas(canvas);
		if (!g) return;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;

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

	/** Min/max envelope of the recorded take, plus a playhead. */
	function drawTake() {
		if (!takeCanvas || !take) return;
		const g = fitCanvas(takeCanvas);
		if (!g) return;
		const w = takeCanvas.clientWidth;
		const h = takeCanvas.clientHeight;
		const data = take.buffer.getChannelData(0);
		const perColumn = Math.max(1, Math.floor(data.length / w));

		g.fillStyle = '#e5c07b';
		for (let x = 0; x < w; x++) {
			let lo = 1;
			let hi = -1;
			const start = x * perColumn;
			for (let i = start; i < start + perColumn && i < data.length; i++) {
				if (data[i] < lo) lo = data[i];
				if (data[i] > hi) hi = data[i];
			}
			if (hi < lo) continue;
			const y1 = ((1 - hi) / 2) * h;
			const y2 = ((1 - lo) / 2) * h;
			g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
		}

		g.strokeStyle = 'rgba(255,255,255,0.15)';
		g.beginPath();
		g.moveTo(0, h / 2);
		g.lineTo(w, h / 2);
		g.stroke();

		if (playing) {
			const x = (playPos / take.buffer.duration) * w;
			g.fillStyle = '#98c379';
			g.fillRect(x, 0, 2, h);
		}
	}

	$effect(() => {
		// Redraw whenever the take or the playhead changes.
		take;
		playPos;
		playing;
		drawTake();
	});

	// ── recording ───────────────────────────────────────────────────────────

	function pickMimeType(): string | null {
		if (typeof MediaRecorder === 'undefined') return null;
		for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
			if (MediaRecorder.isTypeSupported(t)) return t;
		}
		return null;
	}

	function extensionFor(mime: string): string {
		if (mime.startsWith('audio/mp4')) return 'm4a';
		if (mime.startsWith('audio/ogg')) return 'ogg';
		return 'webm';
	}

	function startRecording() {
		if (!stream || recording) return;
		const mimeType = pickMimeType();
		if (!mimeType) {
			error = 'MediaRecorder cannot capture audio in this browser.';
			return;
		}
		stopPlayback();
		take = null;
		chunks = [];
		recorder = new MediaRecorder(stream, { mimeType });
		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};
		recorder.onstop = () => void finishRecording(mimeType);
		recorder.start(200);
		recording = true;
		recMs = 0;
		const startedAt = performance.now();
		recTimer = setInterval(() => {
			recMs = performance.now() - startedAt;
			if (recMs >= MAX_REC_MS) stopRecording();
		}, 100);
	}

	function stopRecording() {
		if (recTimer) {
			clearInterval(recTimer);
			recTimer = null;
		}
		if (!recording) return;
		recording = false;
		try {
			recorder?.stop();
		} catch {
			/* already stopped */
		}
		recorder = null;
	}

	async function finishRecording(mimeType: string) {
		if (chunks.length === 0 || !ctx) return;
		decoding = true;
		const blob = new Blob(chunks, { type: mimeType });
		chunks = [];
		try {
			const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
			take = { blob, buffer, ext: extensionFor(mimeType) };
		} catch {
			error = 'Recorded, but this browser could not decode the take for playback.';
		} finally {
			decoding = false;
		}
	}

	function toggleRecording() {
		if (recording) stopRecording();
		else startRecording();
	}

	// ── playback ────────────────────────────────────────────────────────────

	function playTake() {
		if (!take || !ctx) return;
		stopPlayback();
		playSource = ctx.createBufferSource();
		playSource.buffer = take.buffer;
		playSource.connect(ctx.destination);
		playSource.onended = () => {
			playing = false;
			playPos = 0;
			cancelAnimationFrame(playRaf);
		};
		playStartedAt = ctx.currentTime;
		playSource.start();
		playing = true;

		const follow = () => {
			if (!playing || !ctx || !take) return;
			playPos = Math.min(take.buffer.duration, ctx.currentTime - playStartedAt);
			playRaf = requestAnimationFrame(follow);
		};
		playRaf = requestAnimationFrame(follow);
	}

	function stopPlayback() {
		cancelAnimationFrame(playRaf);
		if (playSource) {
			playSource.onended = null;
			try {
				playSource.stop();
			} catch {
				/* never started, or already ended */
			}
			playSource.disconnect();
			playSource = null;
		}
		playing = false;
		playPos = 0;
	}

	function saveTake() {
		if (!take) return;
		const url = URL.createObjectURL(take.blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `mic-take-${take.buffer.duration.toFixed(1)}s.${take.ext}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	onMount(() => {
		void listDevices();
		const onDeviceChange = () => void listDevices();
		navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
		return () => {
			navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
			teardownAudio();
		};
	});

	let level = $derived(rms === -Infinity ? 0 : Math.max(0, Math.min(1, (rms + 60) / 60)));
	let recSeconds = $derived((recMs / 1000).toFixed(1));
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
		{:else}
			<button
				onclick={() => start(selectedDevice || undefined)}
				class="px-2.5 py-1.5 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black"
			>
				GRANT MIC &amp; START
			</button>
		{/if}

		<select
			bind:value={selectedDevice}
			onchange={() => listening && start(selectedDevice || undefined)}
			title={devices.some((d) => d.label)
				? 'Input device'
				: 'Device names appear once microphone access has been granted'}
			class="px-2 py-1.5 bg-black/60 border border-white/25 rounded-xs text-xs font-mono text-[#d8dee9] cursor-pointer max-w-[260px]"
		>
			<option value="">default input{devices.length ? ` (${devices.length} available)` : ''}</option>
			{#each devices as d (d.deviceId)}
				<option value={d.deviceId}>{d.label || `input ${d.deviceId.slice(0, 6)}`}</option>
			{/each}
		</select>

		{#if listening}
			<button
				onclick={toggleMonitor}
				title="Route the microphone straight to the output so you can hear yourself. Use headphones — on speakers this will feed back."
				class="px-2.5 py-1.5 border rounded-xs text-xs font-bold cursor-pointer transition-colors {monitor
					? 'border-[#e5c07b] bg-[#e5c07b]/20 text-[#e5c07b]'
					: 'border-white/25 text-white/70 hover:bg-white/10'}"
			>
				MONITOR: {monitor ? 'ON' : 'OFF'}
			</button>
			<button
				onclick={() => (clipped = false)}
				class="px-2.5 py-1.5 border border-white/25 text-white/70 rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10"
			>
				RESET CLIP
			</button>
		{/if}

		<span class="text-[11px] font-mono text-white/40">
			Audio never leaves the page — analysed and played back in the browser, nothing is uploaded.
		</span>
	</div>

	{#if monitor}
		<div class="text-[11px] font-mono text-[#e5c07b]">
			Monitoring is on — wear headphones, or the microphone will pick up its own output.
		</div>
	{/if}

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

	<canvas bind:this={canvas} class="w-full h-28 sm:h-36 border border-white/15 bg-black/50 rounded-xs"></canvas>

	<!-- Record a take and hear it back — the part of a mic test that tells you
	     whether the input actually sounds right, not just whether it registers -->
	<div class="border border-[#e5c07b]/30 bg-black/25 rounded-xs p-2.5 space-y-2">
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs font-black font-mono text-[#e5c07b]">RECORD &amp; PLAY BACK</span>

			<button
				onclick={toggleRecording}
				disabled={!listening}
				class="px-2.5 py-1 border rounded-xs text-xs font-black cursor-pointer transition-colors disabled:opacity-35 disabled:cursor-not-allowed {recording
					? 'border-[#e06c75] bg-[#e06c75]/25 text-[#e06c75]'
					: 'border-[#e06c75]/50 text-[#e06c75] hover:bg-[#e06c75]/20'}"
				title={listening ? `Record up to ${MAX_REC_MS / 1000}s from this input` : 'Start the microphone first'}
			>
				{recording ? `■ STOP ${recSeconds}s` : '● RECORD'}
			</button>

			<button
				onclick={playing ? stopPlayback : playTake}
				disabled={!take}
				class="px-2.5 py-1 border rounded-xs text-xs font-bold cursor-pointer transition-colors disabled:opacity-35 disabled:cursor-not-allowed {playing
					? 'border-[#98c379] bg-[#98c379]/25 text-[#98c379]'
					: 'border-[#98c379]/50 text-[#98c379] hover:bg-[#98c379]/20'}"
			>
				{playing ? '■ STOP' : '▶ PLAY TAKE'}
			</button>

			<button
				onclick={saveTake}
				disabled={!take}
				class="px-2.5 py-1 border border-white/25 text-white/70 rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
				title="Download the recording in the format this browser captured it as"
			>
				SAVE
			</button>

			<span class="text-[11px] font-mono text-white/40">
				{#if recording}
					recording — stops automatically at {MAX_REC_MS / 1000}s
				{:else if decoding}
					decoding take…
				{:else if take}
					{take.buffer.duration.toFixed(1)}s · {take.buffer.sampleRate / 1000} kHz · {take.buffer.numberOfChannels === 1
						? 'mono'
						: `${take.buffer.numberOfChannels} ch`} · {(take.blob.size / 1024).toFixed(0)} KB {take.ext}
				{:else}
					no take yet
				{/if}
			</span>
		</div>

		{#if take}
			<canvas bind:this={takeCanvas} class="w-full h-16 sm:h-20 border border-white/10 bg-black/50 rounded-xs"></canvas>
		{/if}
	</div>

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
