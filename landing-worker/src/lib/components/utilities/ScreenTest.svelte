<script lang="ts">
	import { fade } from 'svelte/transition';
	import { playSound } from '../../sound';
	import { suspendNavHotkeys } from '../../stores/hotkeys';

	type Step =
		| { group: string; name: string; kind: 'fill'; bg: string; hintDark?: boolean }
		| { group: string; name: string; kind: 'bars'; n: number }
		| { group: string; name: string; kind: 'gradient'; css: string }
		| { group: string; name: string; kind: 'crush'; side: 'black' | 'white' }
		| { group: string; name: string; kind: 'pattern'; css: string }
		| { group: string; name: string; kind: 'text'; inverted: boolean }
		| { group: string; name: string; kind: 'ghosting' };

	const PIXEL_STEPS: Step[] = [
		{ group: 'DEAD PIXELS', name: 'WHITE', kind: 'fill', bg: '#ffffff', hintDark: true },
		{ group: 'DEAD PIXELS', name: 'BLACK', kind: 'fill', bg: '#000000' },
		{ group: 'DEAD PIXELS', name: 'RED', kind: 'fill', bg: '#ff0000' },
		{ group: 'DEAD PIXELS', name: 'GREEN', kind: 'fill', bg: '#00ff00', hintDark: true },
		{ group: 'DEAD PIXELS', name: 'BLUE', kind: 'fill', bg: '#0000ff' },
		{ group: 'DEAD PIXELS', name: 'GRAY 50%', kind: 'fill', bg: '#808080' }
	];

	const GRAYSCALE_STEPS: Step[] = [
		{ group: 'GRAYSCALE', name: '8 STEPS', kind: 'bars', n: 8 },
		{ group: 'GRAYSCALE', name: '16 STEPS', kind: 'bars', n: 16 },
		{ group: 'GRAYSCALE', name: '32 STEPS', kind: 'bars', n: 32 },
		{ group: 'GRAYSCALE', name: '64 STEPS', kind: 'bars', n: 64 },
		{ group: 'GRAYSCALE', name: 'CONTINUOUS', kind: 'gradient', css: 'linear-gradient(90deg,#000,#fff)' }
	];

	const GRADIENT_STEPS: Step[] = [
		{ group: 'GRADIENTS', name: 'RED RAMP', kind: 'gradient', css: 'linear-gradient(90deg,#000,#f00)' },
		{ group: 'GRADIENTS', name: 'GREEN RAMP', kind: 'gradient', css: 'linear-gradient(90deg,#000,#0f0)' },
		{ group: 'GRADIENTS', name: 'BLUE RAMP', kind: 'gradient', css: 'linear-gradient(90deg,#000,#00f)' },
		{ group: 'GRADIENTS', name: 'HUE SWEEP', kind: 'gradient', css: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }
	];

	const CRUSH_STEPS: Step[] = [
		{ group: 'LEVELS', name: 'BLACK CRUSH', kind: 'crush', side: 'black' },
		{ group: 'LEVELS', name: 'WHITE SATURATION', kind: 'crush', side: 'white' }
	];

	const SHARPNESS_STEPS: Step[] = [
		{
			group: 'SHARPNESS',
			name: '1PX CHECKERBOARD',
			kind: 'pattern',
			css: 'background-image: conic-gradient(#fff 0 25%, #000 0 50%, #fff 0 75%, #000 0); background-size: 2px 2px;'
		},
		{
			group: 'SHARPNESS',
			name: '1PX VERTICAL LINES',
			kind: 'pattern',
			css: 'background-image: repeating-linear-gradient(90deg, #000 0 1px, #fff 1px 2px);'
		},
		{
			group: 'SHARPNESS',
			name: '1PX HORIZONTAL LINES',
			kind: 'pattern',
			css: 'background-image: repeating-linear-gradient(0deg, #000 0 1px, #fff 1px 2px);'
		},
		{
			group: 'SHARPNESS',
			name: '8PX GRID',
			kind: 'pattern',
			css: 'background-color:#fff; background-image: repeating-linear-gradient(90deg, #000 0 1px, transparent 1px 8px), repeating-linear-gradient(0deg, #000 0 1px, transparent 1px 8px);'
		}
	];

	const TEXT_STEPS: Step[] = [
		{ group: 'TEXT CLARITY', name: 'LIGHT ON DARK', kind: 'text', inverted: false },
		{ group: 'TEXT CLARITY', name: 'DARK ON LIGHT', kind: 'text', inverted: true }
	];

	const GHOSTING_STEPS: Step[] = [{ group: 'GHOSTING', name: 'MOVING BLOCKS', kind: 'ghosting' }];

	interface Mode {
		id: string;
		label: string;
		color: string;
		desc: string;
		steps: Step[];
	}

	const MODES: Mode[] = [
		{ id: 'pixels', label: 'DEAD PIXELS', color: '#e5c07b', desc: '6 solid fills — stuck or dead subpixels show as off-color dots', steps: PIXEL_STEPS },
		{ id: 'grayscale', label: 'GRAYSCALE', color: '#98c379', desc: 'Stepped ramps 8→64 plus continuous — banding and gamma tracking', steps: GRAYSCALE_STEPS },
		{ id: 'gradients', label: 'GRADIENTS', color: '#56b6c2', desc: 'Continuous R/G/B and hue ramps — color banding and tint shifts', steps: GRADIENT_STEPS },
		{ id: 'levels', label: 'B/W LEVELS', color: '#c678dd', desc: 'Near-black and near-white patches — shadow crush, highlight clipping', steps: CRUSH_STEPS },
		{ id: 'sharpness', label: 'SHARPNESS', color: '#e06c75', desc: '1px checkerboard, lines, grid — scaling blur and moiré', steps: SHARPNESS_STEPS },
		{ id: 'text', label: 'TEXT CLARITY', color: '#61afef', desc: 'Font rendering 8–20px, three families, both polarities', steps: TEXT_STEPS },
		{ id: 'ghosting', label: 'GHOSTING', color: '#d19a66', desc: 'Moving blocks at three speeds — pixel-response trails', steps: GHOSTING_STEPS }
	];

	const ALL_STEPS: Step[] = MODES.flatMap((m) => m.steps);

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
		<p class="text-xs font-mono text-white/60 leading-relaxed">
			Fullscreen display test suite — {ALL_STEPS.length} patterns across {MODES.length} groups. Inside a test:
			click / any key = next pattern, ← = previous, Esc = exit (Ctrl+0-3 navigation keeps working).
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
						<span class="text-[10px] font-mono text-white/35">{mode.steps.length} pattern{mode.steps.length > 1 ? 's' : ''}</span>
					</div>
					<div class="text-[10px] font-mono text-white/45 leading-snug mt-0.5">{mode.desc}</div>
				</button>
			{/each}
		</div>

		<button
			onclick={() => start(ALL_STEPS)}
			class="press w-full px-3 py-1.5 border border-[#e5c07b]/60 bg-[#e5c07b]/10 text-[#e5c07b] hover:bg-[#e5c07b]/25 rounded-xs font-black text-xs cursor-pointer transition-colors"
		>
			▶▶ RUN FULL SEQUENCE ({ALL_STEPS.length} patterns)
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
					{step.side === 'black'
						? 'Each square should be barely distinguishable from pure black. If 4%+ squares vanish, shadows are being crushed.'
						: 'Each square should be barely distinguishable from pure white. If 96%- squares vanish, highlights are clipping.'}
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
						<div style="font-family: 'JetBrains Mono', monospace">{px}px mono — {TEXT_SAMPLE}</div>
						<div style="font-family: ui-sans-serif, system-ui, sans-serif">{px}px sans — Sphinx of black quartz, judge my vow. {TEXT_SAMPLE.slice(-14)}</div>
						<div style="font-family: Georgia, 'Times New Roman', serif">{px}px serif — Waltz, bad nymph, for quick jigs vex. {TEXT_SAMPLE.slice(-14)}</div>
					</div>
				{/each}
				<p class="text-xs pt-2" style="color: {step.inverted ? '#888' : '#777'}; font-family: 'JetBrains Mono', monospace">
					Small sizes should stay legible with clean stroke edges — fringing or smearing points at subpixel rendering / scaling issues.
				</p>
			</div>
		{:else if step.kind === 'ghosting'}
			<div class="absolute inset-0 flex flex-col justify-center gap-8" style="background: #7f7f7f">
				{#each [{ label: 'SLOW', dur: 4 }, { label: 'MEDIUM', dur: 2 }, { label: 'FAST', dur: 1 }] as lane (lane.label)}
					<div class="relative h-24">
						<span class="absolute left-3 top-1 text-[10px] font-mono font-bold text-black/50">{lane.label}</span>
						<div class="ghost-box bg-white border border-black/30" style="animation-duration: {lane.dur}s; top: 24px;"></div>
						<div class="ghost-box bg-black border border-white/30" style="animation-duration: {lane.dur}s; animation-delay: -{lane.dur / 2}s; top: 24px;"></div>
					</div>
				{/each}
				<p class="text-xs font-mono text-black/60 text-center px-6">
					Follow a block with your eyes — visible trails behind the edges are pixel-response ghosting / overdrive artifacts. Motion is refresh-rate locked.
				</p>
			</div>
		{/if}

		{#if hintVisible}
			<div
				class="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/85 border border-white/20 rounded-xs text-xs font-mono text-white/85 pointer-events-none whitespace-nowrap"
				transition:fade={{ duration: 150 }}
			>
				{step.group} · {step.name} ({stepIdx + 1}/{steps.length})
				{#if step.kind === 'pattern'}&nbsp;· 1 css px = {dpr}× device px{/if}
				&nbsp;— click/key next · ← prev · Esc exit
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
