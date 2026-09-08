<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { t } from '$lib/i18n';
	import { playSound } from '../../sound';
	import type { CustomWave } from '../../synth';
	import { WAVE_SAMPLES } from '../../stores/synth-waves';

	/* Draw one cycle with the pointer: x is phase, y is level. Points between
	   two pointer positions are interpolated so a fast stroke still leaves a
	   continuous line. Seeds give a shape to start from, SMOOTH is a 3-tap
	   average, NORM stretches the drawing to ±1. */
	let {
		initial = null,
		forLabel,
		onSave,
		onClose
	}: {
		initial?: CustomWave | null;
		forLabel: string;
		onSave: (name: string, samples: number[], id?: string) => void;
		onClose: () => void;
	} = $props();

	/* Rendered under <body>: the rack that opens this clips horizontally and
	   sits inside a transformed panel, which would contain a fixed dialog. */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	const N = WAVE_SAMPLES;
	let samples = $state<number[]>(initial ? resample(initial.samples, N) : seed('sine'));
	let name = $state(initial?.name ?? '');
	let canvas = $state<HTMLCanvasElement | null>(null);
	let drawing = false;
	let lastIdx = -1;
	let nameInput = $state<HTMLInputElement | null>(null);

	function resample(src: number[], n: number): number[] {
		return Array.from({ length: n }, (_, i) => src[Math.floor((i / n) * src.length)] ?? 0);
	}

	function seed(kind: 'sine' | 'saw' | 'tri' | 'square' | 'flat'): number[] {
		return Array.from({ length: N }, (_, i) => {
			const x = i / N;
			switch (kind) {
				case 'sine': return Math.sin(2 * Math.PI * x);
				case 'saw': return 2 * x - 1;
				case 'tri': return 1 - 4 * Math.abs(x - 0.5);
				case 'square': return x < 0.5 ? 1 : -1;
				default: return 0;
			}
		});
	}

	function smooth() {
		samples = samples.map((v, i, a) => (a[(i - 1 + N) % N] + v + a[(i + 1) % N]) / 3);
		playSound('click');
	}
	function normalise() {
		const peak = Math.max(1e-6, ...samples.map(Math.abs));
		samples = samples.map((v) => v / peak);
		playSound('click');
	}
	function setSeed(kind: 'sine' | 'saw' | 'tri' | 'square' | 'flat') {
		samples = seed(kind);
		playSound('click');
	}

	function pointToSample(e: PointerEvent): { idx: number; v: number } | null {
		if (!canvas) return null;
		const r = canvas.getBoundingClientRect();
		const x = Math.max(0, Math.min(0.9999, (e.clientX - r.left) / r.width));
		const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
		return { idx: Math.floor(x * N), v: 1 - y * 2 };
	}

	function onDown(e: PointerEvent) {
		if (e.button !== 0) return;
		const p = pointToSample(e);
		if (!p) return;
		drawing = true;
		lastIdx = p.idx;
		samples[p.idx] = p.v;
		samples = samples;
		canvas?.setPointerCapture(e.pointerId);
	}
	function onMove(e: PointerEvent) {
		if (!drawing) return;
		const p = pointToSample(e);
		if (!p) return;
		const a = lastIdx, b = p.idx;
		const va = samples[a], vb = p.v;
		const step = b >= a ? 1 : -1;
		for (let i = a; i !== b + step; i += step) {
			const f = b === a ? 1 : (i - a) / (b - a);
			samples[i] = va + (vb - va) * f;
		}
		lastIdx = b;
		samples = samples;
	}
	function onUp(e: PointerEvent) {
		drawing = false;
		try {
			canvas?.releasePointerCapture(e.pointerId);
		} catch {
			/* not captured */
		}
	}

	function draw() {
		if (!canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const w = Math.round(canvas.clientWidth * dpr);
		const h = Math.round(canvas.clientHeight * dpr);
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = 'rgba(0,0,0,0.6)';
		ctx.fillRect(0, 0, w, h);
		ctx.strokeStyle = 'rgba(255,255,255,0.12)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (let q = 1; q < 4; q++) {
			ctx.moveTo((w * q) / 4, 0);
			ctx.lineTo((w * q) / 4, h);
		}
		ctx.stroke();
		ctx.strokeStyle = 'rgba(255,255,255,0.35)';
		ctx.beginPath();
		ctx.moveTo(0, h / 2);
		ctx.lineTo(w, h / 2);
		ctx.stroke();
		ctx.strokeStyle = '#e5c07b';
		ctx.lineWidth = 2 * dpr;
		ctx.lineJoin = 'round';
		ctx.beginPath();
		for (let i = 0; i < N; i++) {
			const x = ((i + 0.5) / N) * w;
			const y = (h / 2) * (1 - samples[i]);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
	}

	$effect(() => {
		samples;
		draw();
	});

	onMount(() => {
		nameInput?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});

	function save() {
		onSave(name, samples, initial?.id);
		playSound('toggle');
	}

	const btn = 'press px-2 py-0.5 border border-white/20 rounded-xs text-[10px] font-bold cursor-pointer hover:border-white/50 transition-colors';
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div use:portal class="fixed inset-0 z-[160] bg-black/60" onclick={onClose} transition:fade={{ duration: 120 }}></div>
<div
	use:portal
	class="fixed z-[170] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] max-w-[95vw] bg-[#121417] border border-[#56b6c2]/50 rounded-xs shadow-[0_12px_32px_rgba(0,0,0,0.8)] p-3 text-xs font-mono"
	role="dialog"
	aria-label={$t('synth.waveDraw.title')}
	transition:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
>
	<div class="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
		<span class="font-black text-[#56b6c2]">{initial ? $t('synth.waveDraw.editHeading') : $t('synth.waveDraw.drawHeading')} <span class="text-white/60 font-bold">// {forLabel}</span></span>
		<span class="text-white/60 text-[10px] whitespace-nowrap">{$t('synth.waveDraw.dragHint')}</span>
	</div>

	<canvas
		bind:this={canvas}
		class="w-full h-[140px] border border-white/15 rounded-xs cursor-crosshair touch-none select-none"
		onpointerdown={onDown}
		onpointermove={onMove}
		onpointerup={onUp}
		onpointercancel={onUp}
	></canvas>

	<div class="flex flex-wrap items-center gap-1 mt-2">
		<span class="text-white/60 text-[10px] font-bold mr-1">{$t('synth.waveDraw.startFrom')}</span>
		<button onclick={() => setSeed('sine')} class={btn} title={$t('synth.waveDraw.sineHint')}>SIN</button>
		<button onclick={() => setSeed('saw')} class={btn} title={$t('synth.waveDraw.sawHint')}>SAW</button>
		<button onclick={() => setSeed('tri')} class={btn} title={$t('synth.waveDraw.triHint')}>TRI</button>
		<button onclick={() => setSeed('square')} class={btn} title={$t('synth.waveDraw.squareHint')}>SQR</button>
		<button onclick={() => setSeed('flat')} class={btn} title={$t('synth.waveDraw.clearHint')}>CLEAR</button>
		<span class="w-px h-3.5 bg-white/15 mx-1"></span>
		<button onclick={smooth} class={btn} title={$t('synth.waveDraw.smoothHint')}>SMOOTH</button>
		<button onclick={normalise} class={btn} title={$t('synth.waveDraw.normHint')}>NORM</button>
	</div>

	<div class="flex items-center gap-2 mt-3">
		<span class="text-white/60 text-[10px] font-bold">{$t('synth.waveDraw.nameLabel')}</span>
		<input
			bind:this={nameInput}
			bind:value={name}
			onkeydown={(e) => { if (e.key === 'Enter') save(); }}
			maxlength="24"
			spellcheck="false"
			placeholder={$t('synth.waveDraw.namePlaceholder')}
			class="focus-glow flex-1 min-w-0 px-1.5 py-0.5 bg-black/60 border border-[#56b6c2]/50 text-white text-xs font-mono font-bold uppercase rounded-xs outline-none"
			style="--krsz-focus-color: #56b6c2"
			aria-label={$t('synth.waveDraw.nameAria')}
		/>
		<button onclick={onClose} class="{btn} text-white/60">{$t('synth.waveDraw.cancel')}</button>
		<button onclick={save} class="press px-3 py-0.5 border border-[#98c379] bg-[#98c379] text-black rounded-xs text-[10px] font-black cursor-pointer hover:brightness-110" title={$t('synth.waveDraw.saveHint', { forLabel })}>{initial ? $t('synth.waveDraw.save') : $t('synth.waveDraw.saveAndUse')}</button>
	</div>
</div>
