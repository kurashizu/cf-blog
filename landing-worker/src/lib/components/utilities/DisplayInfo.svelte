<script lang="ts">
	import { onMount } from 'svelte';

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
		{ label: 'SCREEN', value: `${screenInfo.w} × ${screenInfo.h}`, color: '#e5c07b' },
		{ label: 'AVAILABLE', value: `${screenInfo.availW} × ${screenInfo.availH}` },
		{ label: 'VIEWPORT', value: `${viewport.w} × ${viewport.h}`, color: '#56b6c2' },
		{ label: 'PIXEL RATIO', value: `${dpr}x${dpr >= 2 ? ' (HiDPI)' : ''}`, color: '#c678dd' },
		{ label: 'COLOR DEPTH', value: `${screenInfo.depth}-bit` },
		{ label: 'REFRESH (rAF)', value: `~${fps} FPS`, color: '#98c379', title: 'requestAnimationFrame rate over the last 500ms — matches display refresh when the tab is unthrottled' },
		{ label: 'POINTER', value: pointerFine ? 'fine (mouse/trackpad)' : 'coarse (touch)' },
		{ label: 'TOUCH POINTS', value: String(touchPoints) },
		{ label: 'CPU THREADS', value: cores === null ? 'n/a' : String(cores) },
		{ label: 'DEVICE MEMORY', value: deviceMemory === null ? 'n/a (browser withholds)' : `≥${deviceMemory} GB`, title: 'navigator.deviceMemory — a coarse bucket, not exact RAM; some browsers omit it entirely' },
		{ label: 'LANGUAGE', value: language },
		{ label: 'TIMEZONE', value: timezone },
		{ label: 'NETWORK', value: online ? 'online' : 'offline', color: online ? '#98c379' : '#e06c75' }
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
		<div class="text-[10px] font-mono font-bold text-white/45 uppercase mb-1">USER AGENT</div>
		<div class="text-[10px] font-mono text-white/70 break-all leading-relaxed">{userAgent}</div>
	</div>
</div>
