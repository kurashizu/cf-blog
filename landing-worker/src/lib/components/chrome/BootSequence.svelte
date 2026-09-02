<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { loadEdgeTrace } from '../../stores/edge';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';

	let { onDone }: { onDone: () => void } = $props();

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	interface Row {
		label: string;
		value: string;
		state: 'ok' | 'na';
	}

	/**
	 * Every line is a real capability probe of THIS browser — nothing is scripted
	 * or timed for effect. A check that can't answer prints `n/a`, never a
	 * plausible-looking number.
	 */
	const CHECKS: { label: string; run: () => string | Promise<string> }[] = [
		{ label: 'PLATFORM', run: () => navigator.platform || navigator.userAgent.slice(0, 40) },
		{ label: 'CPU THREADS', run: () => (navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} logical` : 'n/a') },
		{
			label: 'DEVICE MEMORY',
			run: () => {
				const gb = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
				return gb ? `>= ${gb} GB` : 'n/a (browser withholds)';
			}
		},
		{ label: 'DISPLAY', run: () => `${screen.width}x${screen.height} @ ${window.devicePixelRatio}x` },
		{ label: 'COLOR DEPTH', run: () => `${screen.colorDepth}-bit` },
		{ label: 'GPU', run: readGpu },
		{
			label: 'WEBAUDIO',
			run: () =>
				typeof window.AudioContext !== 'undefined' || 'webkitAudioContext' in window
					? 'AudioContext ready (starts on first interaction)'
					: 'n/a'
		},
		{ label: 'MIDI', run: () => ('requestMIDIAccess' in navigator ? 'Web MIDI available' : 'n/a (no Web MIDI)') },
		{ label: 'GAMEPAD', run: () => ('getGamepads' in navigator ? 'Gamepad API available' : 'n/a') },
		{ label: 'STORAGE QUOTA', run: readStorage },
		{ label: 'SERVICE WORKER', run: readServiceWorker },
		{ label: 'LOCALE / TZ', run: () => `${navigator.language} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}` },
		{ label: 'EDGE POP', run: readEdge }
	];

	function readGpu(): string {
		try {
			const canvas = document.createElement('canvas');
			const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
			if (!gl) return 'n/a (no WebGL)';
			const dbg = gl.getExtension('WEBGL_debug_renderer_info');
			const renderer = dbg
				? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string)
				: (gl.getParameter(gl.RENDERER) as string);
			return renderer || 'n/a';
		} catch {
			return 'n/a';
		}
	}

	async function readStorage(): Promise<string> {
		if (!navigator.storage?.estimate) return 'n/a';
		try {
			const { quota, usage } = await navigator.storage.estimate();
			if (quota === undefined) return 'n/a';
			const gb = quota / 1024 ** 3;
			const used = usage === undefined ? '' : ` · ${(usage / 1024 ** 2).toFixed(1)} MB used`;
			return `${gb >= 1 ? `${gb.toFixed(1)} GB` : `${(quota / 1024 ** 2).toFixed(0)} MB`} available${used}`;
		} catch {
			return 'n/a';
		}
	}

	async function readServiceWorker(): Promise<string> {
		if (!navigator.serviceWorker) return 'n/a (unsupported)';
		if (navigator.serviceWorker.controller) return 'active — offline shell cached';
		const reg = await navigator.serviceWorker.getRegistration();
		return reg ? 'registered, activates on next load' : 'not registered';
	}

	async function readEdge(): Promise<string> {
		const t = await loadEdgeTrace();
		return t ? `${t.colo}${t.loc ? `/${t.loc}` : ''} · ${t.http} · ${t.tls}` : 'n/a (trace unreachable)';
	}

	let rows = $state<Row[]>([]);
	let finished = $state(false);
	let closing = $state(false);
	let aborted = false;

	/** Fades the screen out over the background video instead of cutting straight to it. */
	const EXIT_MS = 260;
	function finish() {
		if (closing) return;
		closing = true;
		setTimeout(onDone, EXIT_MS);
	}

	function skip() {
		aborted = true;
		finish();
	}

	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	onMount(() => {
		(async () => {
			for (const check of CHECKS) {
				if (aborted) return;
				let value: string;
				try {
					value = await check.run();
				} catch {
					value = 'n/a';
				}
				if (aborted) return;
				rows = [...rows, { label: check.label, value, state: value.startsWith('n/a') ? 'na' : 'ok' }];
				await sleep(45);
			}
			if (aborted) return;
			finished = true;
			// Long enough to actually read the result — the probes themselves finish
			// in under a second, which made the whole screen a flicker.
			await sleep(1200);
			if (!aborted) finish();
		})();

		window.addEventListener('keydown', skip);
		window.addEventListener('pointerdown', skip);
		return () => {
			aborted = true;
			window.removeEventListener('keydown', skip);
			window.removeEventListener('pointerdown', skip);
		};
	});
</script>

<!-- Translucent like every other panel (cardBgVideo), so the theme's background
     video reads through the self-test instead of hiding it behind a flat
     black screen -- the POST is the very first thing a visitor sees, so it
     should already look like the same surface the rest of the site is built
     from. transform-gpu sidesteps the Safari backdrop-filter repaint bug
     (see +layout.svelte's data-tour="panel" for the full writeup). A soft
     fade+rise on the way in, and a quicker fade on the way out so dismissing
     it (any key, or the auto-continue) never cuts straight to the shell. -->
<div
	class="fixed inset-0 z-[200] {themeStyles.cardBgVideo} text-[#d8dee9] font-mono overflow-hidden flex flex-col p-3 sm:p-6 md:p-10 transform-gpu transition-opacity duration-200 {closing
		? 'opacity-0'
		: 'opacity-100'}"
	in:fade={{ duration: 260 }}
>
	<div class="text-[10px] sm:text-xs text-white/40 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1.5">
		<span>KRSZ EDGE WORKBENCH — POWER-ON SELF TEST</span>
		<span>press any key to skip</span>
	</div>

	<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar pt-2 sm:pt-3 text-[11px] sm:text-sm leading-relaxed">
		{#each rows as row (row.label)}
			<div class="flex items-baseline gap-2 sm:gap-3" in:fly={{ y: -4, duration: 180 }}>
				<span class="shrink-0 font-bold {row.state === 'ok' ? 'text-[#98c379]' : 'text-[#e5c07b]'}">
					[{row.state === 'ok' ? ' OK ' : ' -- '}]
				</span>
				<span class="shrink-0 text-white/45 w-[104px] sm:w-[150px]">{row.label}</span>
				<span class="break-all {row.state === 'ok' ? 'text-[#d8dee9]' : 'text-white/40'}">{row.value}</span>
			</div>
		{/each}

		{#if finished}
			<div class="mt-2 sm:mt-3 pt-2 border-t border-white/10 text-[#56b6c2] font-bold" in:fade={{ duration: 200 }}>
				POST COMPLETE — {rows.filter((r) => r.state === 'ok').length}/{rows.length} checks answered
			</div>
			<div class="text-white/40" in:fade={{ duration: 200, delay: 60 }}>booting workbench…</div>
		{:else}
			<div class="text-white/30">
				<span class="inline-block w-[8px] h-[14px] align-middle bg-[#56b6c2] animate-pulse"></span>
			</div>
		{/if}
	</div>
</div>
