<script lang="ts">
	import { fade } from '$lib/perf-transitions';
	import { playSound } from '../../sound';
	import { suspendNavHotkeys } from '../../stores/hotkeys';
	import { t } from '$lib/i18n';

	type Step =
		| { group: string; name: string; kind: 'fill'; bg: string; hintDark?: boolean }
		| { group: string; name: string; kind: 'bars'; n: number }
		| { group: string; name: string; kind: 'gradient'; css: string }
		| { group: string; name: string; kind: 'crush'; side: 'black' | 'white' }
		| { group: string; name: string; kind: 'pattern'; css: string }
		| { group: string; name: string; kind: 'text'; inverted: boolean }
		| { group: string; name: string; kind: 'ghosting' };

	// group/name hold i18n keys (translated lazily at render, never at import time).
	const PIXEL_STEPS: Step[] = [
		{ group: 'utilities.screen.mode.pixels.label', name: 'utilities.screen.step.white', kind: 'fill', bg: '#ffffff', hintDark: true },
		{ group: 'utilities.screen.mode.pixels.label', name: 'utilities.screen.step.black', kind: 'fill', bg: '#000000' },
		{ group: 'utilities.screen.mode.pixels.label', name: 'utilities.screen.step.red', kind: 'fill', bg: '#ff0000' },
		{ group: 'utilities.screen.mode.pixels.label', name: 'utilities.screen.step.green', kind: 'fill', bg: '#00ff00', hintDark: true },
		{ group: 'utilities.screen.mode.pixels.label', name: 'utilities.screen.step.blue', kind: 'fill', bg: '#0000ff' },
		{ group: 'utilities.screen.mode.pixels.label', name: 'utilities.screen.step.gray50', kind: 'fill', bg: '#808080' }
	];

	const GRAYSCALE_STEPS: Step[] = [
		{ group: 'utilities.screen.mode.grayscale.label', name: 'utilities.screen.step.steps8', kind: 'bars', n: 8 },
		{ group: 'utilities.screen.mode.grayscale.label', name: 'utilities.screen.step.steps16', kind: 'bars', n: 16 },
		{ group: 'utilities.screen.mode.grayscale.label', name: 'utilities.screen.step.steps32', kind: 'bars', n: 32 },
		{ group: 'utilities.screen.mode.grayscale.label', name: 'utilities.screen.step.steps64', kind: 'bars', n: 64 },
		{ group: 'utilities.screen.mode.grayscale.label', name: 'utilities.screen.step.continuous', kind: 'gradient', css: 'linear-gradient(90deg,#000,#fff)' }
	];

	const GRADIENT_STEPS: Step[] = [
		{ group: 'utilities.screen.mode.gradients.label', name: 'utilities.screen.step.redRamp', kind: 'gradient', css: 'linear-gradient(90deg,#000,#f00)' },
		{ group: 'utilities.screen.mode.gradients.label', name: 'utilities.screen.step.greenRamp', kind: 'gradient', css: 'linear-gradient(90deg,#000,#0f0)' },
		{ group: 'utilities.screen.mode.gradients.label', name: 'utilities.screen.step.blueRamp', kind: 'gradient', css: 'linear-gradient(90deg,#000,#00f)' },
		{ group: 'utilities.screen.mode.gradients.label', name: 'utilities.screen.step.hueSweep', kind: 'gradient', css: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }
	];

	const CRUSH_STEPS: Step[] = [
		{ group: 'utilities.screen.mode.levels.label', name: 'utilities.screen.step.blackCrush', kind: 'crush', side: 'black' },
		{ group: 'utilities.screen.mode.levels.label', name: 'utilities.screen.step.whiteSaturation', kind: 'crush', side: 'white' }
	];

	const SHARPNESS_STEPS: Step[] = [
		{
			group: 'utilities.screen.mode.sharpness.label',
			name: 'utilities.screen.step.checkerboard',
			kind: 'pattern',
			css: 'background-image: conic-gradient(#fff 0 25%, #000 0 50%, #fff 0 75%, #000 0); background-size: 2px 2px;'
		},
		{
			group: 'utilities.screen.mode.sharpness.label',
			name: 'utilities.screen.step.verticalLines',
			kind: 'pattern',
			css: 'background-image: repeating-linear-gradient(90deg, #000 0 1px, #fff 1px 2px);'
		},
		{
			group: 'utilities.screen.mode.sharpness.label',
			name: 'utilities.screen.step.horizontalLines',
			kind: 'pattern',
			css: 'background-image: repeating-linear-gradient(0deg, #000 0 1px, #fff 1px 2px);'
		},
		{
			group: 'utilities.screen.mode.sharpness.label',
			name: 'utilities.screen.step.grid8px',
			kind: 'pattern',
			css: 'background-color:#fff; background-image: repeating-linear-gradient(90deg, #000 0 1px, transparent 1px 8px), repeating-linear-gradient(0deg, #000 0 1px, transparent 1px 8px);'
		}
	];

	const TEXT_STEPS: Step[] = [
		{ group: 'utilities.screen.mode.text.label', name: 'utilities.screen.step.lightOnDark', kind: 'text', inverted: false },
		{ group: 'utilities.screen.mode.text.label', name: 'utilities.screen.step.darkOnLight', kind: 'text', inverted: true }
	];

	const GHOSTING_STEPS: Step[] = [{ group: 'utilities.screen.mode.ghosting.label', name: 'utilities.screen.step.movingBlocks', kind: 'ghosting' }];

	interface Mode {
		id: string;
		labelKey: string;
		color: string;
		descKey: string;
		steps: Step[];
	}

	const MODE_DEFS: Mode[] = [
		{ id: 'pixels', labelKey: 'utilities.screen.mode.pixels.label', color: '#e5c07b', descKey: 'utilities.screen.mode.pixels.desc', steps: PIXEL_STEPS },
		{ id: 'grayscale', labelKey: 'utilities.screen.mode.grayscale.label', color: '#98c379', descKey: 'utilities.screen.mode.grayscale.desc', steps: GRAYSCALE_STEPS },
		{ id: 'gradients', labelKey: 'utilities.screen.mode.gradients.label', color: '#56b6c2', descKey: 'utilities.screen.mode.gradients.desc', steps: GRADIENT_STEPS },
		{ id: 'levels', labelKey: 'utilities.screen.mode.levels.label', color: '#c678dd', descKey: 'utilities.screen.mode.levels.desc', steps: CRUSH_STEPS },
		{ id: 'sharpness', labelKey: 'utilities.screen.mode.sharpness.label', color: '#e06c75', descKey: 'utilities.screen.mode.sharpness.desc', steps: SHARPNESS_STEPS },
		{ id: 'text', labelKey: 'utilities.screen.mode.text.label', color: '#61afef', descKey: 'utilities.screen.mode.text.desc', steps: TEXT_STEPS },
		{ id: 'ghosting', labelKey: 'utilities.screen.mode.ghosting.label', color: '#d19a66', descKey: 'utilities.screen.mode.ghosting.desc', steps: GHOSTING_STEPS }
	];

	let MODES = $derived(MODE_DEFS.map((m) => ({ ...m, label: $t(m.labelKey), desc: $t(m.descKey) })));

	const ALL_STEPS: Step[] = MODE_DEFS.flatMap((m) => m.steps);

	// Near-black / near-white patch luminances (percent). The first 2-3 dark patches
	// merging into the background is normal on most panels; more than that is crush.
	const BLACK_PATCHES = [1, 2, 3, 4, 5, 6, 7, 8];
	const WHITE_PATCHES = [99, 98, 97, 96, 95, 94, 93, 92];

	const TEXT_SIZES = [8, 9, 10, 11, 12, 14, 16, 20];
	const TEXT_SAMPLE = 'The quick brown fox jumps over the lazy dog 0123456789 il1I|oO0 永體體験あア한';

	let active = $state(false);
	let steps = $state<Step[]>([]);
	let stepIdx = $state(0);
	let hintVisible = $state(true);
	let overlayEl: HTMLDivElement | undefined = $state();
	let hintTimer: ReturnType<typeof setTimeout> | null = null;

	let step = $derived(steps[stepIdx]);
	let dpr = $derived(active && typeof window !== 'undefined' ? window.devicePixelRatio : 1);

	// The overlay owns the whole keyboard while it is up — Ctrl+0-3/T must not navigate away.
	$effect(() => {
		suspendNavHotkeys.set(active);
		return () => suspendNavHotkeys.set(false);
	});

	function showHint() {
		hintVisible = true;
		if (hintTimer) clearTimeout(hintTimer);
		hintTimer = setTimeout(() => (hintVisible = false), 2600);
	}

	async function start(stepList: Step[]) {
		steps = stepList;
		stepIdx = 0;
		active = true;
		playSound('click');
		showHint();
		// Fullscreen is best-effort — the fixed overlay covers the viewport either way.
		await new Promise((r) => requestAnimationFrame(r));
		overlayEl?.requestFullscreen?.().catch(() => {});
	}

	function close() {
		active = false;
		if (hintTimer) clearTimeout(hintTimer);
		if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
		playSound('click');
	}

	function next() {
		if (stepIdx >= steps.length - 1) {
			close();
			return;
		}
		stepIdx++;
		showHint();
	}

	function prev() {
		if (stepIdx > 0) {
			stepIdx--;
			showHint();
		}
	}

	function onOverlayKeydown(e: KeyboardEvent) {
		if (!active) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+0-3 nav passes through
		if (e.key === 'Escape') {
			close();
			return;
		}
		e.preventDefault();
		if (e.repeat) return;
		if (e.key === 'ArrowLeft') prev();
		else next();
	}
</script>

<svelte:window onkeydown={onOverlayKeydown} />

<div class="space-y-2">
	<div class="border border-white/15 bg-black/40 rounded-xs p-3 sm:p-4 space-y-3">
		<p class="text-xs font-mono text-white/60 leading-relaxed whitespace-pre-line">
			{$t('utilities.screen.intro', { steps: ALL_STEPS.length, groups: MODES.length })}
		</p>

		<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
			{#each MODES as mode (mode.id)}
				<button
					onclick={() => start(mode.steps)}
					style="border-color: {mode.color}55;"
					class="press text-left border bg-black/40 hover:bg-white/5 rounded-xs px-2.5 py-2 cursor-pointer transition-colors group"
				>
					<div class="flex items-center justify-between">
						<span class="font-black text-xs" style="color: {mode.color}">▶ {mode.label}</span>
						<span class="text-[10px] font-mono text-white/50">{mode.steps.length > 1 ? $t('utilities.screen.pattern.count.plural', { count: mode.steps.length }) : $t('utilities.screen.pattern.count', { count: mode.steps.length })}</span>
					</div>
					<div class="text-[10px] font-mono text-white/60 leading-snug mt-0.5">{mode.desc}</div>
				</button>
			{/each}
		</div>

		<button
			onclick={() => start(ALL_STEPS)}
			class="press w-full px-3 py-1.5 border border-[#e5c07b]/60 bg-[#e5c07b]/10 text-[#e5c07b] hover:bg-[#e5c07b]/25 rounded-xs font-black text-xs cursor-pointer transition-colors"
		>
			{$t('utilities.screen.runAll', { count: ALL_STEPS.length })}
		</button>
	</div>
</div>

{#if active && step}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div bind:this={overlayEl} onclick={next} class="fixed inset-0 z-[300] cursor-pointer overflow-auto bg-black">
		{#if step.kind === 'fill'}
			<div class="absolute inset-0" style="background-color: {step.bg}"></div>
		{:else if step.kind === 'bars'}
			<div class="absolute inset-0 flex">
				{#each Array.from({ length: step.n }, (_, i) => i) as i (i)}
					<div class="flex-1" style="background: hsl(0 0% {(i / (step.n - 1)) * 100}%)"></div>
				{/each}
			</div>
		{:else if step.kind === 'gradient'}
			<div class="absolute inset-0" style="background: {step.css}"></div>
		{:else if step.kind === 'crush'}
			<div
				class="absolute inset-0 flex flex-col items-center justify-center gap-6"
				style="background-color: {step.side === 'black' ? '#000' : '#fff'}"
			>
				<div class="flex flex-wrap items-center justify-center gap-3 px-6">
					{#each step.side === 'black' ? BLACK_PATCHES : WHITE_PATCHES as lum (lum)}
						<div class="flex flex-col items-center gap-1.5">
							<div class="w-16 h-16 sm:w-20 sm:h-20 rounded-xs" style="background: hsl(0 0% {lum}%)"></div>
							<span class="text-[10px] font-mono" style="color: {step.side === 'black' ? '#555' : '#aaa'}">{lum}%</span>
						</div>
					{/each}
				</div>
				<p class="text-xs font-mono px-6 text-center max-w-xl" style="color: {step.side === 'black' ? '#666' : '#999'}">
					{step.side === 'black' ? $t('utilities.screen.crush.black.hint') : $t('utilities.screen.crush.white.hint')}
				</p>
			</div>
		{:else if step.kind === 'pattern'}
			<div class="absolute inset-0" style={step.css}></div>
		{:else if step.kind === 'text'}
			<div
				class="absolute inset-0 overflow-auto p-6 sm:p-10 space-y-4 cursor-pointer"
				style="background: {step.inverted ? '#fff' : '#000'}; color: {step.inverted ? '#000' : '#fff'}"
			>
				{#each TEXT_SIZES as px (px)}
					<div style="font-size: {px}px" class="leading-snug space-y-0.5">
						<div style="font-family: 'Jelly Pixel', 'JetBrains Mono', monospace">{$t('utilities.screen.text.mono', { px, sample: TEXT_SAMPLE })}</div>
						<div style="font-family: ui-sans-serif, system-ui, sans-serif">{$t('utilities.screen.text.sans', { px, sample: TEXT_SAMPLE.slice(-14) })}</div>
						<div style="font-family: Georgia, 'Times New Roman', serif">{$t('utilities.screen.text.serif', { px, sample: TEXT_SAMPLE.slice(-14) })}</div>
					</div>
				{/each}
				<p class="text-xs pt-2" style="color: {step.inverted ? '#888' : '#777'}; font-family: 'Jelly Pixel', 'JetBrains Mono', monospace">
					{$t('utilities.screen.text.hint')}
				</p>
			</div>
		{:else if step.kind === 'ghosting'}
			<div class="absolute inset-0 flex flex-col justify-center gap-8" style="background: #7f7f7f">
				{#each [{ key: 'utilities.screen.ghosting.slow', dur: 4 }, { key: 'utilities.screen.ghosting.medium', dur: 2 }, { key: 'utilities.screen.ghosting.fast', dur: 1 }] as lane (lane.key)}
					<div class="relative h-24">
						<span class="absolute left-3 top-1 text-[10px] font-mono font-bold text-black/50">{$t(lane.key)}</span>
						<div class="ghost-box bg-white border border-black/30" style="animation-duration: {lane.dur}s; top: 24px;"></div>
						<div class="ghost-box bg-black border border-white/30" style="animation-duration: {lane.dur}s; animation-delay: -{lane.dur / 2}s; top: 24px;"></div>
					</div>
				{/each}
				<p class="text-xs font-mono text-black/60 text-center px-6">
					{$t('utilities.screen.ghosting.hint')}
				</p>
			</div>
		{/if}

		{#if hintVisible}
			<div
				class="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/85 border border-white/20 rounded-xs text-xs font-mono text-white/85 pointer-events-none whitespace-nowrap"
				transition:fade={{ duration: 150 }}
			>
				{$t('utilities.screen.overlay.stepCounter', { group: $t(step.group), name: $t(step.name), index: stepIdx + 1, total: steps.length })}
				{#if step.kind === 'pattern'}{$t('utilities.screen.overlay.devicePixels', { dpr })}{/if}
				{$t('utilities.screen.overlay.nav')}
			</div>
		{/if}
	</div>
{/if}

<style>
	.ghost-box {
		position: absolute;
		width: 72px;
		height: 72px;
		animation-name: ghost-x;
		animation-timing-function: linear;
		animation-iteration-count: infinite;
		animation-direction: alternate;
	}
	@keyframes ghost-x {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(calc(100vw - 88px));
		}
	}
</style>
