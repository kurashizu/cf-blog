<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import Dropdown from '../chrome/Dropdown.svelte';

	let stream: MediaStream | null = null;
	let video: HTMLVideoElement | undefined = $state();
	let running = $state(false);
	let error = $state<string | null>(null);
	let devices = $state<MediaDeviceInfo[]>([]);
	let selected = $state<string>('');
	let settings = $state<{ label: string; value: string }[]>([]);
	/** Frames counted through requestVideoFrameCallback — a real delivered-frame rate. */
	let measuredFps = $state<number | null>(null);
	let frameCallbackSupported = $state(true);

	async function listDevices() {
		if (!navigator.mediaDevices?.enumerateDevices) return;
		const all = await navigator.mediaDevices.enumerateDevices();
		devices = all.filter((d) => d.kind === 'videoinput');
	}

	async function start(deviceId?: string) {
		error = null;
		stop();
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: deviceId ? { deviceId: { exact: deviceId } } : true
			});
		} catch (e) {
			error = e instanceof Error ? `${e.name}: ${e.message}` : 'Camera access denied';
			return;
		}
		running = true;
		if (video) {
			video.srcObject = stream;
			await video.play().catch(() => {});
		}
		// Labels only populate after a grant, so re-enumerate here.
		await listDevices();
		selected = stream.getVideoTracks()[0]?.getSettings().deviceId ?? '';
		readSettings();
		measureFps();
	}

	function readSettings() {
		const track = stream?.getVideoTracks()[0];
		if (!track) return;
		const s = track.getSettings();
		const caps = track.getCapabilities?.();
		settings = [
			{ label: 'DEVICE', value: track.label || '(label withheld)' },
			{ label: 'RESOLUTION', value: s.width && s.height ? `${s.width} × ${s.height}` : 'n/a' },
			{ label: 'DECLARED FPS', value: s.frameRate ? `${Math.round(s.frameRate)} fps` : 'n/a' },
			{ label: 'ASPECT', value: s.aspectRatio ? s.aspectRatio.toFixed(3) : 'n/a' },
			{ label: 'FACING', value: s.facingMode ?? 'n/a (desktop cameras omit it)' },
			{
				label: 'MAX CAPABILITY',
				value:
					caps?.width && caps?.height
						? `${(caps.width as { max?: number }).max ?? '?'} × ${(caps.height as { max?: number }).max ?? '?'}`
						: 'n/a'
			}
		];
	}

	function measureFps() {
		const el = video as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }) | undefined;
		if (!el?.requestVideoFrameCallback) {
			frameCallbackSupported = false;
			return;
		}
		let frames = 0;
		let windowStart = performance.now();
		const onFrame = () => {
			if (!running) return;
			frames++;
			const now = performance.now();
			if (now - windowStart >= 1000) {
				measuredFps = Math.round((frames * 1000) / (now - windowStart));
				frames = 0;
				windowStart = now;
			}
			el.requestVideoFrameCallback!(onFrame);
		};
		el.requestVideoFrameCallback(onFrame);
	}

	function stop() {
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		running = false;
		measuredFps = null;
		if (video) video.srcObject = null;
	}

	onMount(() => {
		void listDevices();
		return stop;
	});
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-center gap-2">
		{#if running}
			<button
				onclick={stop}
				class="press px-2.5 py-1.5 border border-[#e06c75] text-[#e06c75] rounded-xs text-xs font-black cursor-pointer hover:bg-[#e06c75] hover:text-black transition-colors"
			>
				STOP &amp; RELEASE CAMERA
			</button>
		{:else}
			<button
				onclick={() => start()}
				class="press px-2.5 py-1.5 border border-[#98c379] text-[#98c379] rounded-xs text-xs font-black cursor-pointer hover:bg-[#98c379] hover:text-black transition-colors {error ? 'shake-once' : ''}"
			>
				GRANT CAMERA &amp; START
			</button>
		{/if}

		{#if devices.length > 1}
			<Dropdown
				bind:value={selected}
				onchange={(v) => start(v)}
				color="#c678dd"
				width="260px"
				placeholder="camera"
				title="Capture device"
				options={devices.map((d) => ({ value: d.deviceId, label: d.label || `camera ${d.deviceId.slice(0, 6)}` }))}
			/>
		{/if}

		<span class="text-[11px] font-mono text-white/40">
			The preview stays in this tab — no frame is stored or sent anywhere.
		</span>
	</div>

	{#if error}
		<div class="text-xs font-mono text-[#e06c75]" transition:fade={{ duration: 150 }}>{error}</div>
	{/if}

	<div class="border border-white/15 bg-black/50 rounded-xs overflow-hidden flex items-center justify-center min-h-[180px] relative">
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={video} muted playsinline class="max-h-[42vh] w-auto transition-opacity duration-200 {running ? 'opacity-100' : 'opacity-0 absolute'}"></video>
		{#if running}
			<span class="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 bg-black/70 border border-[#e06c75]/50 rounded-xs text-[10px] font-mono font-bold text-[#e06c75]">
				<span class="w-1.5 h-1.5 rounded-full bg-[#e06c75] blink-live"></span>LIVE
			</span>
		{:else}
			<span class="text-xs font-mono text-white/30 py-12">no stream</span>
		{/if}
	</div>

	{#if running}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
			{#each settings as row (row.label)}
				<div class="border border-white/15 bg-black/40 rounded-xs px-2.5 py-2 flex items-baseline justify-between gap-2">
					<span class="text-[10px] font-mono font-bold text-white/45 uppercase shrink-0">{row.label}</span>
					<span class="text-xs font-mono font-bold text-[#d8dee9] truncate" title={row.value}>{row.value}</span>
				</div>
			{/each}
			<div class="border border-white/15 bg-black/40 rounded-xs px-2.5 py-2 flex items-baseline justify-between gap-2">
				<span class="text-[10px] font-mono font-bold text-white/45 uppercase shrink-0">MEASURED FPS</span>
				<span class="text-xs font-mono font-bold text-[#98c379] truncate">
					{#if !frameCallbackSupported}
						n/a (no requestVideoFrameCallback)
					{:else}
						{measuredFps === null ? 'sampling…' : `${measuredFps} fps`}
					{/if}
				</span>
			</div>
		</div>
	{/if}
</div>
