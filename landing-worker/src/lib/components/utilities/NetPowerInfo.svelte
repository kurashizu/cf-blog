<script lang="ts">
	import { onMount } from 'svelte';
	import { edgeTrace, edgeTraceMs, edgeTraceStatus, loadEdgeTrace } from '../../stores/edge';

	interface Row {
		label: string;
		value: string;
		color?: string;
		title?: string;
	}

	let battery = $state<Row[]>([{ label: 'BATTERY', value: 'reading…' }]);
	let network = $state<Row[]>([]);
	let storage = $state<Row[]>([]);
	let permissions = $state<Row[]>([]);

	interface BatteryLike extends EventTarget {
		level: number;
		charging: boolean;
		chargingTime: number;
		dischargingTime: number;
	}

	function formatSeconds(s: number): string {
		if (!isFinite(s) || s === 0) return 'n/a';
		const h = Math.floor(s / 3600);
		const m = Math.round((s % 3600) / 60);
		return h ? `${h}h ${m}m` : `${m}m`;
	}

	async function readBattery(): Promise<() => void> {
		const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
		if (!nav.getBattery) {
			battery = [{ label: 'BATTERY', value: 'n/a — Battery API removed in this browser', color: '#e5c07b' }];
			return () => {};
		}
		let b: BatteryLike;
		try {
			b = await nav.getBattery();
		} catch {
			battery = [{ label: 'BATTERY', value: 'n/a (blocked)', color: '#e5c07b' }];
			return () => {};
		}
		const render = () => {
			battery = [
				{ label: 'CHARGE', value: `${Math.round(b.level * 100)}%`, color: b.level > 0.2 ? '#98c379' : '#e06c75' },
				{ label: 'STATE', value: b.charging ? 'charging' : 'on battery', color: b.charging ? '#98c379' : '#e5c07b' },
				{ label: 'TIME TO FULL', value: b.charging ? formatSeconds(b.chargingTime) : '—' },
				{ label: 'TIME REMAINING', value: b.charging ? '—' : formatSeconds(b.dischargingTime) }
			];
		};
		render();
		const events = ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'];
		events.forEach((e) => b.addEventListener(e, render));
		return () => events.forEach((e) => b.removeEventListener(e, render));
	}

	function readNetwork(): () => void {
		const conn = (navigator as Navigator & {
			connection?: EventTarget & { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean; type?: string };
		}).connection;
		const render = () => {
			network = [
				{ label: 'ONLINE', value: navigator.onLine ? 'yes' : 'no', color: navigator.onLine ? '#98c379' : '#e06c75' },
				...(conn
					? [
							{ label: 'EFFECTIVE TYPE', value: conn.effectiveType ?? 'n/a', color: '#56b6c2', title: 'Network Information API — a bucket derived from recent throughput, not the physical link' },
							{ label: 'DOWNLINK EST.', value: conn.downlink === undefined ? 'n/a' : `${conn.downlink} Mbit/s` },
							{ label: 'RTT EST.', value: conn.rtt === undefined ? 'n/a' : `${conn.rtt} ms` },
							{ label: 'DATA SAVER', value: conn.saveData ? 'on' : 'off' }
						]
					: [{ label: 'CONNECTION API', value: 'n/a — Chromium only', color: '#e5c07b' }])
			];
		};
		render();
		conn?.addEventListener('change', render);
		const onOnline = () => render();
		window.addEventListener('online', onOnline);
		window.addEventListener('offline', onOnline);
		return () => {
			conn?.removeEventListener('change', render);
			window.removeEventListener('online', onOnline);
			window.removeEventListener('offline', onOnline);
		};
	}

	async function readStorage() {
		if (!navigator.storage?.estimate) {
			storage = [{ label: 'STORAGE', value: 'n/a', color: '#e5c07b' }];
			return;
		}
		const { quota, usage } = await navigator.storage.estimate();
		const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
		storage = [
			{ label: 'QUOTA', value: quota === undefined ? 'n/a' : `${(quota / 1024 ** 3).toFixed(2)} GB`, color: '#56b6c2' },
			{ label: 'USED', value: usage === undefined ? 'n/a' : `${(usage / 1024 ** 2).toFixed(2)} MB` },
			{ label: 'PERSISTED', value: persisted === null ? 'n/a' : persisted ? 'yes' : 'no (evictable)' }
		];
	}

	async function readPermissions() {
		if (!navigator.permissions?.query) {
			permissions = [{ label: 'PERMISSIONS API', value: 'n/a', color: '#e5c07b' }];
			return;
		}
		const names = ['camera', 'microphone', 'geolocation', 'notifications', 'midi'];
		const rows: Row[] = [];
		for (const name of names) {
			try {
				const status = await navigator.permissions.query({ name: name as PermissionName });
				rows.push({
					label: name.toUpperCase(),
					value: status.state,
					color: status.state === 'granted' ? '#98c379' : status.state === 'denied' ? '#e06c75' : '#e5c07b'
				});
			} catch {
				rows.push({ label: name.toUpperCase(), value: 'not queryable' });
			}
		}
		permissions = rows;
	}

	onMount(() => {
		const cleanups: (() => void)[] = [readNetwork()];
		void readBattery().then((c) => cleanups.push(c));
		void readStorage();
		void readPermissions();
		void loadEdgeTrace();
		return () => cleanups.forEach((c) => c());
	});

	let traceRows = $derived<Row[]>(
		$edgeTrace
			? [
					{ label: 'COLO', value: `${$edgeTrace.colo}${$edgeTrace.loc ? ` / ${$edgeTrace.loc}` : ''}`, color: '#98c379', title: 'The Cloudflare point of presence serving you right now' },
					{ label: 'PROTOCOL', value: $edgeTrace.http, color: '#56b6c2' },
					{ label: 'TLS', value: $edgeTrace.tls },
					{ label: 'KEY EXCHANGE', value: $edgeTrace.kex || 'n/a' },
					{ label: 'CLIENT IP', value: $edgeTrace.ip },
					{ label: 'WARP', value: $edgeTrace.warp },
					{ label: 'TRACE RTT', value: $edgeTraceMs === null ? 'n/a' : `${$edgeTraceMs} ms`, color: '#e5c07b' },
					{ label: 'REQUEST ID', value: $edgeTrace.fl }
				]
			: [{ label: 'EDGE TRACE', value: $edgeTraceStatus === 'probing' ? 'probing…' : 'unavailable', color: '#e5c07b' }]
	);

	const SECTIONS = [
		{ key: 'edge', title: 'CLOUDFLARE EDGE', color: '#98c379', note: 'live from /cdn-cgi/trace' },
		{ key: 'network', title: 'NETWORK', color: '#56b6c2', note: 'browser-reported' },
		{ key: 'battery', title: 'POWER', color: '#e5c07b', note: 'Battery Status API' },
		{ key: 'storage', title: 'STORAGE', color: '#c678dd', note: 'StorageManager estimate' },
		{ key: 'permissions', title: 'PERMISSIONS', color: '#61afef', note: 'Permissions API state' }
	] as const;

	let sectionRows = $derived<Record<string, Row[]>>({
		edge: traceRows,
		network,
		battery,
		storage,
		permissions
	});
</script>

<div class="space-y-3">
	<div class="flex flex-wrap items-center gap-2">
		<button
			onclick={() => loadEdgeTrace(true)}
			class="press px-2.5 py-1.5 border border-[#98c379]/50 text-[#98c379] rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10 transition-colors"
		>
			RE-TRACE EDGE
		</button>
	</div>

	{#each SECTIONS as section (section.key)}
		<div class="border rounded-xs bg-black/25 p-2.5" style="border-color: {section.color}33">
			<div class="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1 mb-1.5">
				<span class="text-xs font-black font-mono" style="color: {section.color}">{section.title}</span>
				<span class="text-[10px] font-mono text-white/35">{section.note}</span>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
				{#each sectionRows[section.key] as row (row.label)}
					<div class="border border-white/10 bg-black/40 rounded-xs px-2.5 py-1.5 flex items-baseline justify-between gap-2" title={row.title}>
						<span class="text-[10px] font-mono font-bold text-white/45 uppercase shrink-0">{row.label}</span>
						<span class="text-xs font-mono font-bold truncate" style="color: {row.color ?? '#d8dee9'}" title={row.value}>{row.value}</span>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>
