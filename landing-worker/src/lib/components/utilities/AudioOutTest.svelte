<script lang="ts">
	import { onMount } from 'svelte';
	import Dropdown from '../chrome/Dropdown.svelte';

	/**
	 * This tool owns its own AudioContext rather than borrowing the site's sound
	 * engine: a speaker test has to be routed per-channel at a known gain, and it
	 * must still make sound when the workbench itself is muted.
	 */
	let ctx: AudioContext | null = null;
	let master: GainNode | null = null;
	let active: { stop: () => void } | null = null;

	let gain = $state(0.15);
	let running = $state<string | null>(null);
	let sweepHz = $state(0);
	let info = $state<{ label: string; value: string }[]>([]);
	let error = $state<string | null>(null);

	let outputs = $state<MediaDeviceInfo[]>([]);
	let selectedOutput = $state('');
	/** AudioContext.setSinkId is Chromium-only today; elsewhere the picker is inert. */
	let sinkSupported = $state(true);
	/** Output labels stay blank until some device permission has been granted. */
	let labelsHidden = $derived(outputs.length > 0 && outputs.every((d) => !d.label));

	async function listOutputs() {
		if (!navigator.mediaDevices?.enumerateDevices) return;
		try {
			const all = await navigator.mediaDevices.enumerateDevices();
			outputs = all.filter((d) => d.kind === 'audiooutput');
		} catch {
			outputs = [];
		}
	}

	/** Move the live context to another output, if this browser allows it. */
	async function applySink(deviceId: string) {
		selectedOutput = deviceId;
		const c = ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
		if (!c) return;
		if (typeof c.setSinkId !== 'function') {
			sinkSupported = false;
			return;
		}
		try {
			await c.setSinkId(deviceId);
			readInfo();
		} catch (e) {
			error = e instanceof Error ? `Could not switch output: ${e.message}` : 'Could not switch output';
		}
	}

	function ensureContext(): AudioContext | null {
		if (ctx) return ctx;
		try {
			const Klass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			if (!Klass) {
				error = 'WebAudio unavailable in this browser';
				return null;
			}
			ctx = new Klass();
			sinkSupported = typeof (ctx as unknown as { setSinkId?: unknown }).setSinkId === 'function';
			master = ctx.createGain();
			master.gain.value = gain;
			master.connect(ctx.destination);
			if (selectedOutput) void applySink(selectedOutput);
			readInfo();
			return ctx;
		} catch {
			error = 'Could not open an AudioContext';
			return null;
		}
	}

	/** Every row is read back from the live AudioContext — no assumed values. */
	function readInfo() {
		if (!ctx) return;
		const rows: { label: string; value: string }[] = [
			{ label: 'SAMPLE RATE', value: `${ctx.sampleRate} Hz` },
			{ label: 'STATE', value: ctx.state },
			{ label: 'CHANNELS', value: `${ctx.destination.channelCount} of max ${ctx.destination.maxChannelCount}` },
			{ label: 'BASE LATENCY', value: ctx.baseLatency === undefined ? 'n/a' : `${(ctx.baseLatency * 1000).toFixed(1)} ms` }
		];
		// A flat 0 means "not reported" here, not a latency-free device — say so
		// rather than printing a number no output could actually achieve.
		const outLatency = (ctx as unknown as { outputLatency?: number }).outputLatency;
		rows.push({
			label: 'OUTPUT LATENCY',
			value: !outLatency ? 'not reported by this browser' : `${(outLatency * 1000).toFixed(1)} ms`
		});
		const sink = (ctx as unknown as { sinkId?: string }).sinkId;
		rows.push({
			label: 'SINK',
			value: !sinkSupported
				? 'system default (setSinkId unsupported)'
				: !sink
					? 'system default'
					: (outputs.find((d) => d.deviceId === sink)?.label ?? sink.slice(0, 12))
		});
		info = rows;
	}

	function stopAll() {
		active?.stop();
		active = null;
		running = null;
		sweepHz = 0;
	}

	/** Route a source to one channel, both, or both with the right side inverted. */
	function connectRouted(node: AudioNode, mode: 'left' | 'right' | 'both' | 'inverted'): AudioNode {
		if (!ctx || !master) return node;
		if (mode === 'both') {
			node.connect(master);
			return node;
		}
		const merger = ctx.createChannelMerger(2);
		if (mode === 'left') node.connect(merger, 0, 0);
		else if (mode === 'right') node.connect(merger, 0, 1);
		else {
			const invert = ctx.createGain();
			invert.gain.value = -1;
			node.connect(merger, 0, 0);
			node.connect(invert);
			invert.connect(merger, 0, 1);
		}
		merger.connect(master);
		return merger;
	}

	function tone(mode: 'left' | 'right' | 'both' | 'inverted', label: string) {
		const c = ensureContext();
		if (!c) return;
		stopAll();
		void c.resume();
		const osc = c.createOscillator();
		osc.type = 'sine';
		osc.frequency.value = 440;
		// Short fades keep the speaker from clicking on start/stop.
		const env = c.createGain();
		env.gain.setValueAtTime(0, c.currentTime);
		env.gain.linearRampToValueAtTime(1, c.currentTime + 0.02);
		osc.connect(env);
		connectRouted(env, mode);
		osc.start();
		running = label;
		active = {
			stop: () => {
				env.gain.cancelScheduledValues(c.currentTime);
				env.gain.setValueAtTime(env.gain.value, c.currentTime);
				env.gain.linearRampToValueAtTime(0, c.currentTime + 0.03);
				osc.stop(c.currentTime + 0.05);
			}
		};
	}

	function noise(mode: 'left' | 'right' | 'both') {
		const c = ensureContext();
		if (!c) return;
		stopAll();
		void c.resume();
		const seconds = 2;
		const buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
		const src = c.createBufferSource();
		src.buffer = buffer;
		src.loop = true;
		connectRouted(src, mode);
		src.start();
		running = `NOISE ${mode.toUpperCase()}`;
		active = { stop: () => src.stop() };
	}

	function sweep() {
		const c = ensureContext();
		if (!c) return;
		stopAll();
		void c.resume();
		const duration = 8;
		const osc = c.createOscillator();
		osc.type = 'sine';
		const t0 = c.currentTime;
		osc.frequency.setValueAtTime(20, t0);
		osc.frequency.exponentialRampToValueAtTime(20000, t0 + duration);
		const env = c.createGain();
		env.gain.setValueAtTime(0, t0);
		env.gain.linearRampToValueAtTime(1, t0 + 0.05);
		env.gain.setValueAtTime(1, t0 + duration - 0.1);
		env.gain.linearRampToValueAtTime(0, t0 + duration);
		osc.connect(env);
		env.connect(master!);
		osc.start();
		osc.stop(t0 + duration);
		running = 'SWEEP 20 Hz → 20 kHz';

		// The readout tracks the same exponential curve the oscillator follows.
		let raf = 0;
		const tick = () => {
			const elapsed = c.currentTime - t0;
			if (elapsed >= duration) {
				stopAll();
				return;
			}
			sweepHz = Math.round(20 * Math.pow(1000, elapsed / duration));
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		active = {
			stop: () => {
				cancelAnimationFrame(raf);
				try {
					osc.stop();
				} catch {
					/* already stopped at its scheduled end */
				}
			}
		};
	}

	$effect(() => {
		if (master) master.gain.value = gain;
	});

	onMount(() => {
		void listOutputs();
		const onDeviceChange = () => void listOutputs();
		navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
		return () => {
			navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
			stopAll();
			void ctx?.close();
			ctx = null;
		};
	});

	const CHANNEL_TESTS = [
		{ label: 'LEFT ONLY', mode: 'left' as const, color: '#61afef', hint: 'Sound must come from the left speaker only' },
		{ label: 'RIGHT ONLY', mode: 'right' as const, color: '#e06c75', hint: 'Sound must come from the right speaker only' },
		{ label: 'BOTH', mode: 'both' as const, color: '#98c379', hint: 'Centred between both speakers' },
		{ label: 'OUT OF PHASE', mode: 'inverted' as const, color: '#c678dd', hint: 'Right channel inverted — should sound hollow, and near-silent in mono' }
	];
</script>

<div class="space-y-3">
	{#if error}
		<div class="text-xs text-[#e06c75] font-mono">{error}</div>
	{/if}

	<div class="text-[11px] sm:text-xs text-white/45 font-mono leading-relaxed">
		Runs on its own AudioContext, so it plays even while the workbench is muted.
		Start at a low level — the sweep reaches full-scale 20 kHz.
	</div>

	<div class="flex flex-wrap items-center gap-2">
		{#each CHANNEL_TESTS as t (t.mode)}
			<button
				onclick={() => tone(t.mode, `440 Hz ${t.label}`)}
				title={t.hint}
				class="px-2.5 py-1.5 border rounded-xs text-xs font-bold cursor-pointer transition-colors hover:bg-white/10"
				style="border-color: {t.color}66; color: {t.color}"
			>
				440Hz {t.label}
			</button>
		{/each}
		<button
			onclick={sweep}
			class="px-2.5 py-1.5 border border-[#e5c07b]/40 text-[#e5c07b] rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10"
			title="Logarithmic sine sweep, 20 Hz to 20 kHz over 8 seconds — reveals resonances and rolloff"
		>
			SWEEP 20Hz→20kHz
		</button>
		{#each ['left', 'right', 'both'] as const as m (m)}
			<button
				onclick={() => noise(m)}
				class="px-2.5 py-1.5 border border-white/25 text-white/70 rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10"
				title="White noise on the {m} channel"
			>
				NOISE {m.toUpperCase()}
			</button>
		{/each}
		<button
			onclick={stopAll}
			class="px-2.5 py-1.5 border border-[#e06c75] text-[#e06c75] rounded-xs text-xs font-black cursor-pointer hover:bg-[#e06c75] hover:text-black"
		>
			STOP
		</button>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<span class="text-[10px] font-mono font-bold text-white/45 uppercase">OUTPUT</span>
		<Dropdown
			bind:value={selectedOutput}
			onchange={applySink}
			disabled={!sinkSupported}
			color="#98c379"
			width="280px"
			placeholder="system default"
			title={sinkSupported
				? 'Route the test tones to a specific output device'
				: 'This browser cannot redirect WebAudio to a chosen output — it always uses the system default'}
			options={[
				{ value: '', label: `system default`, note: outputs.length ? `${outputs.length} available` : undefined },
				...outputs.map((d) => ({ value: d.deviceId, label: d.label || `output ${d.deviceId.slice(0, 6)}` }))
			]}
		/>
		{#if !sinkSupported}
			<span class="text-[11px] font-mono text-[#e5c07b]">setSinkId unsupported — playing on the system default</span>
		{:else if labelsHidden}
			<span class="text-[11px] font-mono text-white/40">
				Device names stay hidden until a microphone grant exists — the MIC IN tool unlocks them.
			</span>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-3 border border-white/15 bg-black/40 rounded-xs px-2.5 py-2">
		<span class="text-[10px] font-mono font-bold text-white/45 uppercase">LEVEL</span>
		<input type="range" min="0" max="0.6" step="0.01" bind:value={gain} class="flex-1 min-w-[120px] accent-[#98c379]" />
		<span class="text-xs font-mono text-[#98c379] w-12 text-right">{Math.round(gain * 100)}%</span>
		<span class="text-xs font-mono {running ? 'text-[#e5c07b]' : 'text-white/35'} min-w-[160px]">
			{running ?? 'idle'}{sweepHz ? ` · ${sweepHz} Hz` : ''}
		</span>
	</div>

	{#if info.length}
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
			{#each info as row (row.label)}
				<div class="border border-white/15 bg-black/40 rounded-xs px-2.5 py-2 flex items-baseline justify-between gap-2">
					<span class="text-[10px] font-mono font-bold text-white/45 uppercase shrink-0">{row.label}</span>
					<span class="text-xs font-mono font-bold text-[#d8dee9] truncate">{row.value}</span>
				</div>
			{/each}
		</div>
	{:else}
		<div class="text-[11px] font-mono text-white/35">Press a test to open the audio device and read its real parameters.</div>
	{/if}
</div>
