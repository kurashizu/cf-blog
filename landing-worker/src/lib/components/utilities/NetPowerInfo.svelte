<script lang="ts">
	import { onMount } from 'svelte';
	import { edgeTrace, edgeTraceMs, edgeTraceStatus, loadEdgeTrace } from '../../stores/edge';
	import { t, tr } from '$lib/i18n';

	interface Row {
		label: string;
		value: string;
		color?: string;
		title?: string;
	}

	let battery = $state<Row[]>([{ label: tr('utilities.net.battery.label'), value: tr('utilities.net.battery.reading') }]);
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
		if (!isFinite(s) || s === 0) return tr('utilities.net.battery.time.na');
		const h = Math.floor(s / 3600);
		const m = Math.round((s % 3600) / 60);
		return h ? tr('utilities.net.battery.time.hoursMinutes', { h, m }) : tr('utilities.net.battery.time.minutes', { m });
	}

	async function readBattery(): Promise<() => void> {
		const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
		if (!nav.getBattery) {
			battery = [{ label: tr('utilities.net.battery.label'), value: tr('utilities.net.battery.removed'), color: '#e5c07b' }];
			return () => {};
		}
		let b: BatteryLike;
		try {
			b = await nav.getBattery();
		} catch {
			battery = [{ label: tr('utilities.net.battery.label'), value: tr('utilities.net.battery.blocked'), color: '#e5c07b' }];
			return () => {};
		}
		const render = () => {
			battery = [
				{ label: tr('utilities.net.battery.charge'), value: `${Math.round(b.level * 100)}%`, color: b.level > 0.2 ? '#98c379' : '#e06c75' },
				{ label: tr('utilities.net.battery.state'), value: b.charging ? tr('utilities.net.battery.state.charging') : tr('utilities.net.battery.state.onBattery'), color: b.charging ? '#98c379' : '#e5c07b' },
				{ label: tr('utilities.net.battery.timeToFull'), value: b.charging ? formatSeconds(b.chargingTime) : tr('utilities.net.battery.dash') },
				{ label: tr('utilities.net.battery.timeRemaining'), value: b.charging ? tr('utilities.net.battery.dash') : formatSeconds(b.dischargingTime) }
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
				{ label: tr('utilities.net.network.online'), value: navigator.onLine ? tr('utilities.net.network.online.yes') : tr('utilities.net.network.online.no'), color: navigator.onLine ? '#98c379' : '#e06c75' },
				...(conn
					? [
							{ label: tr('utilities.net.network.effectiveType'), value: conn.effectiveType ?? tr('utilities.net.network.effectiveType.na'), color: '#56b6c2', title: tr('utilities.net.network.effectiveType.title') },
							{ label: tr('utilities.net.network.downlink'), value: conn.downlink === undefined ? tr('utilities.net.network.downlink.na') : tr('utilities.net.network.downlink.value', { mbit: conn.downlink }) },
							{ label: tr('utilities.net.network.rtt'), value: conn.rtt === undefined ? tr('utilities.net.network.rtt.na') : tr('utilities.net.network.rtt.value', { ms: conn.rtt }) },
							{ label: tr('utilities.net.network.dataSaver'), value: conn.saveData ? tr('utilities.net.network.dataSaver.on') : tr('utilities.net.network.dataSaver.off') }
						]
					: [{ label: tr('utilities.net.network.connectionApi.label'), value: tr('utilities.net.network.connectionApi.na'), color: '#e5c07b' }])
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
			storage = [{ label: tr('utilities.net.storage.label'), value: tr('utilities.net.storage.na'), color: '#e5c07b' }];
			return;
		}
		const { quota, usage } = await navigator.storage.estimate();
		const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
		storage = [
			{ label: tr('utilities.net.storage.quota'), value: quota === undefined ? tr('utilities.net.storage.quota.na') : tr('utilities.net.storage.quota.value', { gb: (quota / 1024 ** 3).toFixed(2) }), color: '#56b6c2' },
			{ label: tr('utilities.net.storage.used'), value: usage === undefined ? tr('utilities.net.storage.used.na') : tr('utilities.net.storage.used.value', { mb: (usage / 1024 ** 2).toFixed(2) }) },
			{ label: tr('utilities.net.storage.persisted'), value: persisted === null ? tr('utilities.net.storage.persisted.na') : persisted ? tr('utilities.net.storage.persisted.yes') : tr('utilities.net.storage.persisted.no') }
		];
	}

	async function readPermissions() {
		if (!navigator.permissions?.query) {
			permissions = [{ label: tr('utilities.net.permissions.label'), value: tr('utilities.net.permissions.na'), color: '#e5c07b' }];
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
				rows.push({ label: name.toUpperCase(), value: tr('utilities.net.permissions.notQueryable') });
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
					{ label: $t('utilities.net.edge.colo'), value: `${$edgeTrace.colo}${$edgeTrace.loc ? ` / ${$edgeTrace.loc}` : ''}`, color: '#98c379', title: $t('utilities.net.edge.colo.title') },
					{ label: $t('utilities.net.edge.protocol'), value: $edgeTrace.http, color: '#56b6c2' },
					{ label: $t('utilities.net.edge.tls'), value: $edgeTrace.tls },
					{ label: $t('utilities.net.edge.keyExchange'), value: $edgeTrace.kex || $t('utilities.net.edge.na') },
					{ label: $t('utilities.net.edge.clientIp'), value: $edgeTrace.ip },
					{ label: $t('utilities.net.edge.warp'), value: $edgeTrace.warp },
					{ label: $t('utilities.net.edge.traceRtt'), value: $edgeTraceMs === null ? $t('utilities.net.edge.traceRtt.na') : $t('utilities.net.edge.traceRtt.value', { ms: $edgeTraceMs }), color: '#e5c07b' },
					{ label: $t('utilities.net.edge.requestId'), value: $edgeTrace.fl }
				]
			: [{ label: $t('utilities.net.edge.status'), value: $edgeTraceStatus === 'probing' ? $t('utilities.net.edge.status.probing') : $t('utilities.net.edge.status.unavailable'), color: '#e5c07b' }]
	);

	const SECTION_DEFS = [
		{ key: 'edge', color: '#98c379', titleKey: 'utilities.net.section.edge', noteKey: 'utilities.net.section.edge.note' },
		{ key: 'network', color: '#56b6c2', titleKey: 'utilities.net.section.network', noteKey: 'utilities.net.section.network.note' },
		{ key: 'battery', color: '#e5c07b', titleKey: 'utilities.net.section.battery', noteKey: 'utilities.net.section.battery.note' },
		{ key: 'storage', color: '#c678dd', titleKey: 'utilities.net.section.storage', noteKey: 'utilities.net.section.storage.note' },
		{ key: 'permissions', color: '#61afef', titleKey: 'utilities.net.section.permissions', noteKey: 'utilities.net.section.permissions.note' }
	] as const;

	let SECTIONS = $derived(SECTION_DEFS.map((s) => ({ ...s, title: $t(s.titleKey), note: $t(s.noteKey) })));

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
			{$t('utilities.net.retrace')}
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
