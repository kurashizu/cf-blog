<script lang="ts">
	import { onDestroy } from 'svelte';
	import { playSound } from '../../sound';
	import { t, tr } from '$lib/i18n';
	import type SpeedTestEngine from '@cloudflare/speedtest';
	import type { MeasurementSummary } from '@cloudflare/speedtest';

	/**
	 * Real measurements only — nothing here is a synthetic "score". This tool
	 * runs Cloudflare's own public speed-test engine (`@cloudflare/speedtest`,
	 * MIT), loaded on demand so it never sits in the main bundle. It measures
	 * against speed.cloudflare.com — Cloudflare's own service, not this site's
	 * origin — and krsz.in never sees or stores the transferred bytes.
	 *
	 * The package is loaded with a dynamic import() on first RUN TEST press,
	 * not at module scope, so visitors who never open this tool never fetch it.
	 */

	type Phase = 'idle' | 'running' | 'done';
	let phase = $state<Phase>('idle');
	let error = $state<string | null>(null);

	let latencyMin = $state<number | null>(null);
	let latencyMedian = $state<number | null>(null);
	let latencyJitter = $state<number | null>(null);

	let downloadLive = $state<number | null>(null);
	let downloadResult = $state<number | null>(null);
	let uploadLive = $state<number | null>(null);
	let uploadResult = $state<number | null>(null);

	let totalBytes = $state(0);
	let colo = $state<string | null>(null);

	let engine: SpeedTestEngine | null = null;

	function bpsToMbps(bps: number): number {
		return Math.round((bps / 1_000_000) * 10) / 10;
	}

	/** Cloudflare's own trace endpoint on the speed subdomain — the PoP that actually served the test, which can differ from the site's own edge. */
	async function loadSpeedColo() {
		try {
			const res = await fetch('https://speed.cloudflare.com/cdn-cgi/trace', { cache: 'no-store' });
			if (!res.ok) return;
			const text = await res.text();
			const match = text.match(/^colo=(\w+)/m);
			if (match) colo = match[1];
		} catch {
			/* left as n/a */
		}
	}

	function updateFromResults(results: { getUnloadedLatency: () => number | undefined; getUnloadedJitter: () => number | null | undefined; getDownloadBandwidthPoints: () => { bps: number; bytes: number }[]; getUploadBandwidthPoints: () => { bps: number; bytes: number }[]; getUnloadedLatencyPoints: () => number[] }) {
		const latencyPoints = results.getUnloadedLatencyPoints();
		if (latencyPoints.length) {
			latencyMin = Math.round(Math.min(...latencyPoints) * 10) / 10;
		}
		const median = results.getUnloadedLatency();
		if (median !== undefined) latencyMedian = Math.round(median * 10) / 10;
		const jitter = results.getUnloadedJitter();
		if (jitter !== undefined && jitter !== null) latencyJitter = Math.round(jitter * 10) / 10;

		const downPoints = results.getDownloadBandwidthPoints();
		if (downPoints.length) {
			downloadLive = bpsToMbps(downPoints[downPoints.length - 1].bps);
		}
		const upPoints = results.getUploadBandwidthPoints();
		if (upPoints.length) {
			uploadLive = bpsToMbps(upPoints[upPoints.length - 1].bps);
		}
		// `transferSize` from PerformanceResourceTiming reads 0 for a
		// cross-origin request without Timing-Allow-Origin (which
		// speed.cloudflare.com does not send on every response), so the
		// configured payload size is the reliable count of bytes actually moved.
		totalBytes = [...downPoints, ...upPoints].reduce((sum, p) => sum + (p.bytes || 0), 0);
	}

	async function run() {
		if (phase === 'running') return;
		playSound('click');
		error = null;
		phase = 'running';
		latencyMin = latencyMedian = latencyJitter = null;
		downloadLive = downloadResult = null;
		uploadLive = uploadResult = null;
		totalBytes = 0;

		void loadSpeedColo();

		try {
			const { default: SpeedTest } = await import('@cloudflare/speedtest');
			const test = new SpeedTest({
				autoStart: false,
				measurements: [
					{ type: 'latency', numPackets: 20 },
					{ type: 'download', bytes: 1e5, count: 10 },
					{ type: 'download', bytes: 1e6, count: 8 },
					{ type: 'download', bytes: 1e7, count: 6 },
					{ type: 'download', bytes: 2.5e7, count: 4 },
					{ type: 'upload', bytes: 1e5, count: 8 },
					{ type: 'upload', bytes: 1e6, count: 6 },
					{ type: 'upload', bytes: 1e7, count: 4 }
				]
			});
			engine = test;

			test.onResultsChange = () => updateFromResults(test.results);
			test.onError = (message: string) => {
				error = tr('utilities.speed.error', { message });
				phase = 'idle';
			};
			test.onFinish = (results) => {
				updateFromResults(results);
				const summary: MeasurementSummary = results.getSummary();
				if (summary.download !== undefined) downloadResult = bpsToMbps(summary.download);
				if (summary.upload !== undefined) uploadResult = bpsToMbps(summary.upload);
				if (summary.latency !== undefined) latencyMedian = Math.round(summary.latency * 10) / 10;
				if (summary.jitter !== undefined && summary.jitter !== null) latencyJitter = Math.round(summary.jitter * 10) / 10;
				phase = 'done';
			};

			test.play();
		} catch (e) {
			error = e instanceof Error ? tr('utilities.speed.error', { message: e.message }) : tr('utilities.speed.error', { message: String(e) });
			phase = 'idle';
		}
	}

	function stop() {
		engine?.pause();
		engine = null;
		phase = 'idle';
		downloadLive = null;
		uploadLive = null;
		playSound('click');
	}

	onDestroy(() => {
		engine?.pause();
		engine = null;
	});

	function formatMb(bytes: number): string {
		return (bytes / 1_000_000).toFixed(1);
	}

	let running = $derived(phase === 'running');
</script>

<div class="space-y-3 min-w-0">
	<div class="text-[11px] sm:text-xs text-white/45 font-mono leading-relaxed">
		{$t('utilities.speed.intro')}
	</div>

	<div class="flex flex-wrap items-center gap-2 min-w-0">
		{#if !running}
			<button
				onclick={run}
				class="press px-2.5 py-1.5 border border-[#61afef]/50 text-[#61afef] rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10 transition-colors"
			>
				{$t('utilities.speed.start')}
			</button>
		{:else}
			<button
				onclick={stop}
				class="press px-2.5 py-1.5 border border-[#e06c75] text-[#e06c75] rounded-xs text-xs font-black cursor-pointer hover:bg-[#e06c75] hover:text-black transition-colors"
			>
				{$t('utilities.speed.stop')}
			</button>
			<span class="text-xs font-mono text-[#e5c07b] flex items-center gap-1.5">
				<span class="w-1.5 h-1.5 rounded-full bg-[#e5c07b] blink-live shrink-0"></span>
				{$t('utilities.speed.running')}
			</span>
		{/if}
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60 text-xs font-mono truncate max-w-full">
			{$t('utilities.speed.pop.label')}
			<span class="font-bold text-white/85">{colo ?? $t('utilities.speed.pop.na')}</span>
		</span>
	</div>

	{#if error}
		<div class="text-xs text-[#e06c75] font-mono">{error}</div>
	{/if}

	{#if phase === 'idle' && downloadResult === null && !error}
		<div class="text-[11px] font-mono text-white/35">{$t('utilities.speed.idle')}</div>
	{/if}

	<!-- Latency -->
	<div class="border rounded-xs bg-black/25 p-2.5 border-[#56b6c2]/20 min-w-0">
		<div class="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1 mb-1.5">
			<span class="text-xs font-black font-mono" style="color: #56b6c2">{$t('utilities.speed.section.latency')}</span>
			<span class="text-[10px] font-mono text-white/35">{$t('utilities.speed.section.latency.note')}</span>
		</div>
		<div class="grid grid-cols-3 gap-1.5">
			{#each [{ label: $t('utilities.speed.latency.min'), v: latencyMin }, { label: $t('utilities.speed.latency.median'), v: latencyMedian }, { label: $t('utilities.speed.latency.jitter'), v: latencyJitter }] as row (row.label)}
				<div class="border border-white/10 bg-black/40 rounded-xs px-2 py-1.5 flex flex-col gap-0.5 min-w-0">
					<span class="text-[10px] font-mono font-bold text-white/45 uppercase truncate">{row.label}</span>
					<span class="text-xs font-mono font-bold truncate" style="color: #56b6c2">{row.v === null ? $t('utilities.speed.latency.na') : $t('utilities.speed.latency.ms', { ms: row.v })}</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- Download -->
	<div class="border rounded-xs bg-black/25 p-2.5 border-[#98c379]/20 min-w-0">
		<div class="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1 mb-1.5">
			<span class="text-xs font-black font-mono" style="color: #98c379">{$t('utilities.speed.section.download')}</span>
			<span class="text-[10px] font-mono text-white/35">{$t('utilities.speed.section.download.note')}</span>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
			<div class="border border-white/10 bg-black/40 rounded-xs px-2 py-1.5 flex flex-col gap-0.5 min-w-0">
				<span class="text-[10px] font-mono font-bold text-white/45 uppercase truncate">{$t('utilities.speed.download.live')}</span>
				<span class="text-xs font-mono font-bold truncate" style="color: #98c379">{running && downloadLive !== null ? $t('utilities.speed.mbps', { mbps: downloadLive }) : $t('utilities.speed.mbps.na')}</span>
			</div>
			<div class="border border-white/10 bg-black/40 rounded-xs px-2 py-1.5 flex flex-col gap-0.5 min-w-0">
				<span class="text-[10px] font-mono font-bold text-white/45 uppercase truncate">{$t('utilities.speed.download.avg')}</span>
				<span class="text-xs font-mono font-bold truncate" style="color: #98c379">{downloadResult === null ? $t('utilities.speed.mbps.na') : $t('utilities.speed.mbps', { mbps: downloadResult })}</span>
			</div>
		</div>
	</div>

	<!-- Upload -->
	<div class="border rounded-xs bg-black/25 p-2.5 border-[#e5c07b]/20 min-w-0">
		<div class="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1 mb-1.5">
			<span class="text-xs font-black font-mono" style="color: #e5c07b">{$t('utilities.speed.section.upload')}</span>
			<span class="text-[10px] font-mono text-white/35">{$t('utilities.speed.section.upload.note')}</span>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
			<div class="border border-white/10 bg-black/40 rounded-xs px-2 py-1.5 flex flex-col gap-0.5 min-w-0">
				<span class="text-[10px] font-mono font-bold text-white/45 uppercase truncate">{$t('utilities.speed.upload.live')}</span>
				<span class="text-xs font-mono font-bold truncate" style="color: #e5c07b">{running && uploadLive !== null ? $t('utilities.speed.mbps', { mbps: uploadLive }) : $t('utilities.speed.mbps.na')}</span>
			</div>
			<div class="border border-white/10 bg-black/40 rounded-xs px-2 py-1.5 flex flex-col gap-0.5 min-w-0">
				<span class="text-[10px] font-mono font-bold text-white/45 uppercase truncate">{$t('utilities.speed.upload.avg')}</span>
				<span class="text-xs font-mono font-bold truncate" style="color: #e5c07b">{uploadResult === null ? $t('utilities.speed.mbps.na') : $t('utilities.speed.mbps', { mbps: uploadResult })}</span>
			</div>
		</div>
	</div>

	<div class="border border-white/15 bg-black/40 rounded-xs px-2.5 py-1.5 flex items-baseline justify-between gap-2 min-w-0">
		<span class="text-[10px] font-mono font-bold text-white/45 uppercase shrink-0">{$t('utilities.speed.totalMoved')}</span>
		<span class="text-xs font-mono font-bold text-[#d8dee9] truncate">{$t('utilities.speed.bytes.mb', { mb: formatMb(totalBytes) })}</span>
	</div>
</div>
