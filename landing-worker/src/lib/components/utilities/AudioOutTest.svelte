<script lang="ts">
	import { onMount } from 'svelte';
	import HorizontalHardwareFader from '../hardware/HorizontalHardwareFader.svelte';
	import Dropdown from '../chrome/Dropdown.svelte';
	import { t, tr } from '$lib/i18n';

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
			error = e instanceof Error ? tr('utilities.audioout.error.sinkSwitch', { message: e.message }) : tr('utilities.audioout.error.sinkSwitchGeneric');
		}
	}

	function ensureContext(): AudioContext | null {
		if (ctx) return ctx;
		try {
			const Klass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			if (!Klass) {
				error = tr('utilities.audioout.error.webAudioUnavailable');
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
			error = tr('utilities.audioout.error.contextFailed');
			return null;
		}
	}

	/** Every row is read back from the live AudioContext — no assumed values. */
	function readInfo() {
		if (!ctx) return;
		const rows: { label: string; value: string }[] = [
			{ label: tr('utilities.audioout.info.sampleRate'), value: `${ctx.sampleRate} Hz` },
			{ label: tr('utilities.audioout.info.state'), value: ctx.state },
			{ label: tr('utilities.audioout.info.channels'), value: tr('utilities.audioout.info.channels.value', { count: ctx.destination.channelCount, max: ctx.destination.maxChannelCount }) },
			{ label: tr('utilities.audioout.info.baseLatency'), value: ctx.baseLatency === undefined ? tr('utilities.audioout.info.baseLatency.na') : tr('utilities.audioout.info.baseLatency.value', { ms: (ctx.baseLatency * 1000).toFixed(1) }) }
		];
		// A flat 0 means "not reported" here, not a latency-free device — say so
		// rather than printing a number no output could actually achieve.
		const outLatency = (ctx as unknown as { outputLatency?: number }).outputLatency;
		rows.push({
			label: tr('utilities.audioout.info.outputLatency'),
			value: !outLatency ? tr('utilities.audioout.info.outputLatency.notReported') : tr('utilities.audioout.info.baseLatency.value', { ms: (outLatency * 1000).toFixed(1) })
		});
		const sink = (ctx as unknown as { sinkId?: string }).sinkId;
		rows.push({
			label: tr('utilities.audioout.info.sink'),
			value: !sinkSupported
				? tr('utilities.audioout.info.sink.unsupported')
				: !sink
					? tr('utilities.audioout.info.sink.default')
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
		running = tr('utilities.audioout.noise.running', { channel: mode.toUpperCase() });
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
		running = tr('utilities.audioout.sweep.running');

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

	const CHANNEL_TEST_DEFS = [
		{ labelKey: 'utilities.audioout.channel.left.label', mode: 'left' as const, color: '#61afef', hintKey: 'utilities.audioout.channel.left.hint' },
		{ labelKey: 'utilities.audioout.channel.right.label', mode: 'right' as const, color: '#e06c75', hintKey: 'utilities.audioout.channel.right.hint' },
		{ labelKey: 'utilities.audioout.channel.both.label', mode: 'both' as const, color: '#98c379', hintKey: 'utilities.audioout.channel.both.hint' },
		{ labelKey: 'utilities.audioout.channel.inverted.label', mode: 'inverted' as const, color: '#c678dd', hintKey: 'utilities.audioout.channel.inverted.hint' }
	];
	let CHANNEL_TESTS = $derived(CHANNEL_TEST_DEFS.map((c) => ({ ...c, label: $t(c.labelKey), hint: $t(c.hintKey) })));
</script>

<div class="space-y-3">
	{#if error}
		<div class="text-xs text-[#e06c75] font-mono">{error}</div>
	{/if}

	<div class="text-[11px] sm:text-xs text-white/45 font-mono leading-relaxed whitespace-pre-line">
		{$t('utilities.audioout.intro')}
	</div>

	<div class="flex flex-wrap items-center gap-2">
		{#each CHANNEL_TESTS as ct (ct.mode)}
			<button
				onclick={() => tone(ct.mode, $t('utilities.audioout.channel.toneRunning', { label: ct.label }))}
				title={ct.hint}
				class="press px-2.5 py-1.5 border rounded-xs text-xs font-bold cursor-pointer transition-colors hover:bg-white/10"
				style="border-color: {ct.color}66; color: {ct.color}"
			>
				{$t('utilities.audioout.channel.tone', { label: ct.label })}
			</button>
		{/each}
		<button
			onclick={sweep}
			class="press px-2.5 py-1.5 border border-[#e5c07b]/40 text-[#e5c07b] rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10 transition-colors"
			title={$t('utilities.audioout.sweep.title')}
		>
			{$t('utilities.audioout.sweep.button')}
		</button>
		{#each ['left', 'right', 'both'] as const as m (m)}
			<button
				onclick={() => noise(m)}
				class="press px-2.5 py-1.5 border border-white/25 text-white/70 rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10 transition-colors"
				title={$t('utilities.audioout.noise.title', { channel: m })}
			>
				{$t('utilities.audioout.noise.button', { channel: m.toUpperCase() })}
			</button>
		{/each}
		<button
			onclick={stopAll}
			class="press px-2.5 py-1.5 border border-[#e06c75] text-[#e06c75] rounded-xs text-xs font-black cursor-pointer hover:bg-[#e06c75] hover:text-black transition-colors"
		>
			{$t('utilities.audioout.stop')}
		</button>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<span class="text-[10px] font-mono font-bold text-white/45 uppercase">{$t('utilities.audioout.output.label')}</span>
		<Dropdown
			bind:value={selectedOutput}
			onchange={applySink}
			disabled={!sinkSupported}
			color="#98c379"
			width="280px"
			placeholder={$t('utilities.audioout.output.placeholder')}
			title={sinkSupported
				? $t('utilities.audioout.output.title.supported')
				: $t('utilities.audioout.output.title.unsupported')}
			options={[
				{ value: '', label: $t('utilities.audioout.output.systemDefault'), note: outputs.length ? $t('utilities.audioout.output.available', { count: outputs.length }) : undefined },
				...outputs.map((d) => ({ value: d.deviceId, label: d.label || $t('utilities.audioout.output.deviceFallback', { id: d.deviceId.slice(0, 6) }) }))
			]}
		/>
		{#if !sinkSupported}
			<span class="text-[11px] font-mono text-[#e5c07b]">{$t('utilities.audioout.output.unsupportedNote')}</span>
		{:else if labelsHidden}
			<span class="text-[11px] font-mono text-white/40">
				{$t('utilities.audioout.output.labelsHiddenNote')}
			</span>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-3 border border-white/15 bg-black/40 rounded-xs px-2.5 py-2">
		<span class="text-[10px] font-mono font-bold text-white/45 uppercase">{$t('utilities.audioout.level.label')}</span>
		<div class="flex-1 min-w-[120px]">
			<HorizontalHardwareFader
				value={gain}
				min={0}
				max={0.6}
				step={0.01}
				color="#98c379"
				width="100%"
				onChange={(v) => (gain = v)}
			/>
		</div>
		<span class="text-xs font-mono text-[#98c379] w-12 text-right">{Math.round(gain * 100)}%</span>
		<span class="text-xs font-mono transition-colors min-w-[160px] flex items-center gap-1.5 {running ? 'text-[#e5c07b]' : 'text-white/35'}">
			{#if running}<span class="w-1.5 h-1.5 rounded-full bg-[#e5c07b] blink-live shrink-0"></span>{/if}
			{running ?? $t('utilities.audioout.level.idle')}{sweepHz ? $t('utilities.audioout.level.hzSuffix', { hz: sweepHz }) : ''}
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
		<div class="text-[11px] font-mono text-white/35">{$t('utilities.audioout.info.hint')}</div>
	{/if}
</div>
