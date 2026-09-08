<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';

	let viewport = $state({ w: 0, h: 0 });
	let screenInfo = $state({ w: 0, h: 0, availW: 0, availH: 0, depth: 0 });
	let dpr = $state(1);
	let fps = $state(0);
	let pointerFine = $state(false);
	let touchPoints = $state(0);
	let cores = $state<number | null>(null);
	let deviceMemory = $state<number | null>(null);
	let language = $state('');
	let timezone = $state('');
	let online = $state(true);
	let userAgent = $state('');

	function readStatic() {
		viewport = { w: window.innerWidth, h: window.innerHeight };
		screenInfo = {
			w: screen.width,
			h: screen.height,
			availW: screen.availWidth,
			availH: screen.availHeight,
			depth: screen.colorDepth
		};
		dpr = window.devicePixelRatio;
		pointerFine = matchMedia('(pointer: fine)').matches;
		touchPoints = navigator.maxTouchPoints;
		cores = navigator.hardwareConcurrency ?? null;
		deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null;
		language = navigator.language;
		timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		online = navigator.onLine;
		userAgent = navigator.userAgent;
	}

	onMount(() => {
		readStatic();

		const setOnline = () => (online = navigator.onLine);
		window.addEventListener('resize', readStatic);
		window.addEventListener('online', setOnline);
		window.addEventListener('offline', setOnline);

		// Continuous rAF frame counter -> refresh-rate estimate over a rolling window
		let frames = 0;
		let windowStart = performance.now();
		let raf = 0;
		const tick = () => {
			raf = requestAnimationFrame(tick);
			frames++;
			const now = performance.now();
			if (now - windowStart >= 500) {
				fps = Math.round((frames * 1000) / (now - windowStart));
				frames = 0;
				windowStart = now;
			}
		};
		raf = requestAnimationFrame(tick);

		return () => {
			window.removeEventListener('resize', readStatic);
			window.removeEventListener('online', setOnline);
			window.removeEventListener('offline', setOnline);
			cancelAnimationFrame(raf);
		};
	});

	interface Row {
		label: string;
		value: string;
		color?: string;
		title?: string;
	}

	let rows = $derived<Row[]>([
		{ label: $t('utilities.display.row.screen'), value: `${screenInfo.w} × ${screenInfo.h}`, color: '#e5c07b' },
		{ label: $t('utilities.display.row.available'), value: `${screenInfo.availW} × ${screenInfo.availH}` },
		{ label: $t('utilities.display.row.viewport'), value: `${viewport.w} × ${viewport.h}`, color: '#56b6c2' },
		{ label: $t('utilities.display.row.pixelRatio'), value: `${dpr}x${dpr >= 2 ? $t('utilities.display.row.pixelRatio.hidpi') : ''}`, color: '#c678dd' },
		{ label: $t('utilities.display.row.colorDepth'), value: $t('utilities.display.row.colorDepth.value', { bits: screenInfo.depth }) },
		{ label: $t('utilities.display.row.refresh'), value: $t('utilities.display.row.refresh.value', { fps }), color: '#98c379', title: $t('utilities.display.row.refresh.title') },
		{ label: $t('utilities.display.row.pointer'), value: pointerFine ? $t('utilities.display.row.pointer.fine') : $t('utilities.display.row.pointer.coarse') },
		{ label: $t('utilities.display.row.touchPoints'), value: String(touchPoints) },
		{ label: $t('utilities.display.row.cpuThreads'), value: cores === null ? $t('utilities.display.row.na') : String(cores) },
		{ label: $t('utilities.display.row.deviceMemory'), value: deviceMemory === null ? $t('utilities.display.row.deviceMemory.na') : $t('utilities.display.row.deviceMemory.value', { gb: deviceMemory }), title: $t('utilities.display.row.deviceMemory.title') },
		{ label: $t('utilities.display.row.language'), value: language },
		{ label: $t('utilities.display.row.timezone'), value: timezone },
		{ label: $t('utilities.display.row.network'), value: online ? $t('utilities.display.row.network.online') : $t('utilities.display.row.network.offline'), color: online ? '#98c379' : '#e06c75' }
	]);
</script>

<div class="space-y-2">
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
		{#each rows as row (row.label)}
			<div class="border border-white/15 bg-black/40 rounded-xs px-2.5 py-2 flex items-baseline justify-between gap-2" title={row.title}>
				<span class="text-[10px] font-mono font-bold text-white/45 uppercase shrink-0">{row.label}</span>
				<span class="text-xs font-mono font-bold truncate" style="color: {row.color ?? '#d8dee9'}">{row.value}</span>
			</div>
		{/each}
	</div>

	<div class="border border-white/15 bg-black/40 rounded-xs px-2.5 py-2">
		<div class="text-[10px] font-mono font-bold text-white/45 uppercase mb-1">{$t('utilities.display.userAgent')}</div>
		<div class="text-[10px] font-mono text-white/70 break-all leading-relaxed">{userAgent}</div>
	</div>
</div>
