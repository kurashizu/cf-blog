<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { playSound } from '../../sound';
	import { suspendNavHotkeys } from '../../stores/hotkeys';
	import { t } from '$lib/i18n';

	interface Caps {
		colorGamut: string;
		dynamicRange: string;
		videoDynamicRange: string;
		colorDepth: number | string;
		forcedColors: string;
		prefersContrast: string;
		supportsP3: boolean;
		supportsRec2020: boolean;
	}

	function readCaps(): Caps {
		const mm = (q: string) => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false);
		let colorGamut = 'srgb';
		if (mm('(color-gamut: rec2020)')) colorGamut = 'rec2020';
		else if (mm('(color-gamut: p3)')) colorGamut = 'p3';
		else if (mm('(color-gamut: srgb)')) colorGamut = 'srgb';
		else colorGamut = 'n/a';

		return {
			colorGamut,
			dynamicRange: mm('(dynamic-range: high)') ? 'high' : mm('(dynamic-range: standard)') ? 'standard' : 'n/a',
			videoDynamicRange: mm('(video-dynamic-range: high)') ? 'high' : mm('(video-dynamic-range: standard)') ? 'standard' : 'n/a',
			colorDepth: typeof screen !== 'undefined' ? screen.colorDepth : 'n/a',
			forcedColors: mm('(forced-colors: active)') ? 'active' : 'none',
			prefersContrast: mm('(prefers-contrast: more)') ? 'more' : mm('(prefers-contrast: less)') ? 'less' : mm('(prefers-contrast: custom)') ? 'custom' : 'no-preference',
			supportsP3: typeof CSS !== 'undefined' && CSS.supports('color', 'color(display-p3 1 0 0)'),
			supportsRec2020: typeof CSS !== 'undefined' && CSS.supports('color', 'color(rec2020 1 0 0)')
		};
	}

	let caps = $state<Caps>({
		colorGamut: 'n/a',
		dynamicRange: 'n/a',
		videoDynamicRange: 'n/a',
		colorDepth: 'n/a',
		forcedColors: 'n/a',
		prefersContrast: 'n/a',
		supportsP3: false,
		supportsRec2020: false
	});

	const WATCHED_QUERIES = ['(color-gamut: srgb)', '(color-gamut: p3)', '(color-gamut: rec2020)', '(dynamic-range: high)', '(video-dynamic-range: high)', '(forced-colors: active)', '(prefers-contrast: more)', '(prefers-contrast: less)'];
	let mqls: MediaQueryList[] = [];

	function refresh() {
		caps = readCaps();
	}

	onMount(() => {
		refresh();
		mqls = WATCHED_QUERIES.map((q) => window.matchMedia(q));
		mqls.forEach((m) => m.addEventListener('change', refresh));
	});
	onDestroy(() => {
		mqls.forEach((m) => m.removeEventListener('change', refresh));
	});

	// Wide-gamut swatch pairs: nominal color shown in sRGB vs display-p3/rec2020.
	const WIDE_PAIRS = [
		{ nameKey: 'utilities.color.swatch.red', srgb: '#ff0000', p3: 'color(display-p3 1 0 0)', rec2020: 'color(rec2020 1 0 0)' },
		{ nameKey: 'utilities.color.swatch.green', srgb: '#00ff00', p3: 'color(display-p3 0 1 0)', rec2020: 'color(rec2020 0 1 0)' },
		{ nameKey: 'utilities.color.swatch.blue', srgb: '#0000ff', p3: 'color(display-p3 0 0 1)', rec2020: 'color(rec2020 0 0 1)' }
	];

	// Gamma bands: solid grey at (0.5^(1/gamma))*255 next to a 1px on/off pattern averaging 50%.
	const GAMMAS = [1.8, 2.0, 2.2, 2.4, 2.6];
	function gammaGrey(gamma: number): number {
		return Math.round(Math.pow(0.5, 1 / gamma) * 255);
	}

	const BLACK_STEPS = Array.from({ length: 12 }, (_, i) => i + 1);
	const WHITE_STEPS = Array.from({ length: 13 }, (_, i) => 243 + i).filter((v) => v <= 255);

	const SAT_COLORS: { key: string; hue: number }[] = [
		{ key: 'R', hue: 0 },
		{ key: 'G', hue: 120 },
		{ key: 'B', hue: 240 },
		{ key: 'C', hue: 180 },
		{ key: 'M', hue: 300 },
		{ key: 'Y', hue: 60 }
	];
	const SAT_STEPS = 8;

	const WHITE_POINTS = [
		{ key: 'utilities.color.whitePoint.warm', css: '#fff4e0' },
		{ key: 'utilities.color.whitePoint.pure', css: '#ffffff' },
		{ key: 'utilities.color.whitePoint.cool', css: '#e6f0ff' }
	];

	// Fullscreen sections, following ScreenTest's approach.
	type SectionId = 'wide' | 'gamma' | 'black' | 'white' | 'saturation' | 'whitepoint';
	let active = $state(false);
	let section = $state<SectionId>('wide');
	let overlayEl: HTMLDivElement | undefined = $state();
	let dpr = $derived(active && typeof window !== 'undefined' ? window.devicePixelRatio : 1);
	let patternSize = $derived(Math.max(1, 1 / dpr));

	$effect(() => {
		suspendNavHotkeys.set(active);
		return () => suspendNavHotkeys.set(false);
	});

	async function open(id: SectionId) {
		section = id;
		active = true;
		playSound('click');
		await new Promise((r) => requestAnimationFrame(r));
		overlayEl?.requestFullscreen?.().catch(() => {});
	}

	function close() {
		active = false;
		if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
		playSound('click');
	}

	function onOverlayKeydown(e: KeyboardEvent) {
		if (!active) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key === 'Escape') close();
	}

	const SECTIONS: { id: SectionId; labelKey: string; color: string }[] = [
		{ id: 'wide', labelKey: 'utilities.color.section.wide', color: '#56b6c2' },
		{ id: 'gamma', labelKey: 'utilities.color.section.gamma', color: '#98c379' },
		{ id: 'black', labelKey: 'utilities.color.section.black', color: '#5c6370' },
		{ id: 'white', labelKey: 'utilities.color.section.white', color: '#e5c07b' },
		{ id: 'saturation', labelKey: 'utilities.color.section.saturation', color: '#c678dd' },
		{ id: 'whitepoint', labelKey: 'utilities.color.section.whitepoint', color: '#61afef' }
	];
</script>

<svelte:window onkeydown={onOverlayKeydown} />

<div class="space-y-2">
	<!-- Capabilities -->
	<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-1.5">
		<div class="text-[10px] font-mono font-bold text-white/60 uppercase pb-1 border-b border-white/10">{$t('utilities.color.capabilities')}</div>
		<div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px] font-mono">
			<div class="border border-white/10 bg-black/30 rounded-xs p-1.5"><span class="text-white/60">{$t('utilities.color.cap.gamut')}</span> <span class="font-bold text-[#56b6c2]">{caps.colorGamut}</span></div>
			<div class="border border-white/10 bg-black/30 rounded-xs p-1.5"><span class="text-white/60">{$t('utilities.color.cap.dynamicRange')}</span> <span class="font-bold text-[#98c379]">{caps.dynamicRange}</span></div>
			<div class="border border-white/10 bg-black/30 rounded-xs p-1.5"><span class="text-white/60">{$t('utilities.color.cap.videoDynamicRange')}</span> <span class="font-bold text-[#98c379]">{caps.videoDynamicRange}</span></div>
			<div class="border border-white/10 bg-black/30 rounded-xs p-1.5"><span class="text-white/60">{$t('utilities.color.cap.colorDepth')}</span> <span class="font-bold text-[#e5c07b]">{caps.colorDepth}</span></div>
			<div class="border border-white/10 bg-black/30 rounded-xs p-1.5"><span class="text-white/60">{$t('utilities.color.cap.forcedColors')}</span> <span class="font-bold text-white/70">{caps.forcedColors}</span></div>
			<div class="border border-white/10 bg-black/30 rounded-xs p-1.5"><span class="text-white/60">{$t('utilities.color.cap.prefersContrast')}</span> <span class="font-bold text-white/70">{caps.prefersContrast}</span></div>
			<div class="border border-white/10 bg-black/30 rounded-xs p-1.5"><span class="text-white/60">{$t('utilities.color.cap.cssP3')}</span> <span class="font-bold {caps.supportsP3 ? 'text-[#98c379]' : 'text-[#e06c75]'}">{caps.supportsP3 ? $t('utilities.color.yes') : $t('utilities.color.no')}</span></div>
			<div class="border border-white/10 bg-black/30 rounded-xs p-1.5"><span class="text-white/60">{$t('utilities.color.cap.cssRec2020')}</span> <span class="font-bold {caps.supportsRec2020 ? 'text-[#98c379]' : 'text-[#e06c75]'}">{caps.supportsRec2020 ? $t('utilities.color.yes') : $t('utilities.color.no')}</span></div>
		</div>
	</div>

	<!-- Section launchers -->
	<div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
		{#each SECTIONS as s (s.id)}
			<button onclick={() => open(s.id)} style="border-color: {s.color}55;" class="press text-left border bg-black/40 hover:bg-white/5 rounded-xs px-2.5 py-2 cursor-pointer transition-colors">
				<span class="font-black text-xs" style="color: {s.color}">▶ {$t(s.labelKey)}</span>
			</button>
		{/each}
	</div>

	<!-- Inline previews (non-fullscreen), each opens fullscreen on click -->
	<div class="border border-white/15 bg-black/40 rounded-xs p-3 space-y-3">
		<p class="text-xs font-mono text-white/60 leading-relaxed">{$t('utilities.color.intro')}</p>

		<div class="space-y-1">
			<div class="text-[10px] font-mono font-bold text-white/60 uppercase">{$t('utilities.color.section.wide')}</div>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
				{#each WIDE_PAIRS as pair (pair.nameKey)}
					<div class="border border-white/10 rounded-xs overflow-hidden">
						<div class="text-[10px] font-mono text-white/50 px-1.5 py-0.5 bg-black/40">{$t(pair.nameKey)}</div>
						<div class="flex h-10">
							<div class="flex-1" style="background-color: {pair.srgb}"></div>
							<div class="flex-1" style="background-color: {pair.p3}"></div>
							<div class="flex-1" style="background-color: {pair.rec2020}"></div>
						</div>
					</div>
				{/each}
			</div>
			<div class="text-[10px] font-mono text-white/50">{$t('utilities.color.wideHint')}</div>
		</div>
	</div>
</div>

{#if active}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div bind:this={overlayEl} class="fixed inset-0 z-[300] bg-black overflow-auto cursor-pointer" onclick={close}>
		<div class="min-h-full flex flex-col items-center justify-center gap-6 p-6">
			{#if section === 'wide'}
				<div class="w-full max-w-3xl space-y-3">
					<h2 class="text-white text-sm font-mono font-bold text-center">{$t('utilities.color.section.wide')}</h2>
					{#each WIDE_PAIRS as pair (pair.nameKey)}
						<div class="space-y-1">
							<div class="text-white/60 text-xs font-mono text-center">{$t(pair.nameKey)}</div>
							<div class="flex h-24 rounded-xs overflow-hidden border border-white/10">
								<div class="flex-1 flex items-end justify-center pb-1" style="background-color: {pair.srgb}"><span class="text-[10px] font-mono text-black/50">sRGB</span></div>
								<div class="flex-1 flex items-end justify-center pb-1" style="background-color: {pair.p3}"><span class="text-[10px] font-mono text-black/50">display-p3</span></div>
								<div class="flex-1 flex items-end justify-center pb-1" style="background-color: {pair.rec2020}"><span class="text-[10px] font-mono text-black/50">rec2020</span></div>
							</div>
						</div>
					{/each}
					<p class="text-white/50 text-xs font-mono text-center max-w-xl mx-auto">{$t('utilities.color.wideHint')}</p>
				</div>
			{:else if section === 'gamma'}
				<div class="w-full max-w-3xl space-y-3">
					<h2 class="text-white text-sm font-mono font-bold text-center">{$t('utilities.color.section.gamma')}</h2>
					{#each GAMMAS as g (g)}
						{@const grey = gammaGrey(g)}
						<div class="flex items-center gap-3">
							<span class="text-white/60 text-xs font-mono w-14 shrink-0">γ {g.toFixed(1)}</span>
							<div class="flex-1 h-14 rounded-xs" style="background-color: rgb({grey},{grey},{grey})"></div>
							<div
								class="flex-1 h-14 rounded-xs"
								style="image-rendering: pixelated; background-image: repeating-linear-gradient(90deg, #000 0 {patternSize}px, #fff {patternSize}px {patternSize * 2}px);"
							></div>
						</div>
					{/each}
					<p class="text-white/50 text-xs font-mono text-center max-w-xl mx-auto">{$t('utilities.color.gammaHint')}</p>
					<p class="text-white/50 text-[10px] font-mono text-center">{$t('utilities.color.gammaDpr', { dpr })}</p>
				</div>
			{:else if section === 'black'}
				<div class="w-full flex flex-col items-center gap-4" style="background: #000;">
					<h2 class="text-white/60 text-sm font-mono font-bold">{$t('utilities.color.section.black')}</h2>
					<div class="flex flex-wrap items-center justify-center gap-3 px-6">
						{#each BLACK_STEPS as v (v)}
							<div class="flex flex-col items-center gap-1">
								<div class="w-14 h-14 rounded-xs" style="background: rgb({v},{v},{v})"></div>
								<span class="text-[10px] font-mono text-white/50">{v}</span>
							</div>
						{/each}
					</div>
					<p class="text-white/50 text-xs font-mono text-center max-w-xl px-6">{$t('utilities.color.blackHint')}</p>
				</div>
			{:else if section === 'white'}
				<div class="w-full flex flex-col items-center gap-4" style="background: #fff;">
					<h2 class="text-black/50 text-sm font-mono font-bold">{$t('utilities.color.section.white')}</h2>
					<div class="flex flex-wrap items-center justify-center gap-3 px-6">
						{#each WHITE_STEPS as v (v)}
							<div class="flex flex-col items-center gap-1">
								<div class="w-14 h-14 rounded-xs border border-black/10" style="background: rgb({v},{v},{v})"></div>
								<span class="text-[10px] font-mono text-black/40">{v}</span>
							</div>
						{/each}
					</div>
					<p class="text-black/40 text-xs font-mono text-center max-w-xl px-6">{$t('utilities.color.whiteHint')}</p>
				</div>
			{:else if section === 'saturation'}
				<div class="w-full max-w-3xl space-y-2">
					<h2 class="text-white text-sm font-mono font-bold text-center">{$t('utilities.color.section.saturation')}</h2>
					{#each SAT_COLORS as c (c.key)}
						<div class="flex items-center gap-2">
							<span class="text-white/60 text-xs font-mono w-6 shrink-0">{c.key}</span>
							<div class="flex-1 flex h-9 rounded-xs overflow-hidden">
								{#each Array.from({ length: SAT_STEPS }, (_, i) => i) as i (i)}
									{@const sat = ((i + 1) / SAT_STEPS) * 100}
									<div class="flex-1" style="background: hsl({c.hue} {sat}% 50%)"></div>
								{/each}
							</div>
						</div>
					{/each}
					<p class="text-white/60 text-xs font-mono text-center pt-1">{$t('utilities.color.saturationHint')}</p>
				</div>
			{:else if section === 'whitepoint'}
				<div class="w-full max-w-2xl space-y-3">
					<h2 class="text-white text-sm font-mono font-bold text-center">{$t('utilities.color.section.whitepoint')}</h2>
					<div class="flex h-24 rounded-xs overflow-hidden border border-white/10">
						{#each WHITE_POINTS as wp (wp.key)}
							<div class="flex-1 flex items-end justify-center pb-1" style="background-color: {wp.css}">
								<span class="text-[10px] font-mono text-black/50">{$t(wp.key)}</span>
							</div>
						{/each}
					</div>
					<p class="text-white/50 text-xs font-mono text-center">{$t('utilities.color.whitePointHint')}</p>
				</div>
			{/if}
		</div>
		<div class="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/85 border border-white/20 rounded-xs text-xs font-mono text-white/85 pointer-events-none whitespace-nowrap">
			{$t('utilities.color.overlay.hint')}
		</div>
	</div>
{/if}
