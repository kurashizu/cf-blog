<script lang="ts">
	/**
	 * Draw MAP's transfer curve by hand.
	 *
	 * The ninth shape in MAP's list is DRAW, and the evaluator has always read
	 * it -- `drawN` points named `d0`..`dN` -- but nothing wrote them, so it was
	 * a menu entry that did nothing. This is what writes them.
	 *
	 * Not WaveDrawDialog, though the gesture is the same. That one draws a
	 * *cycle*: its y runs -1..1, it wraps at the edges, and what it produces is
	 * a named wave saved to a library and referenced by name. A transfer curve
	 * runs 0..1, has two fixed ends rather than a wrap, and belongs to the one
	 * node that drew it. Sharing the component would mean bending both toward a
	 * shape neither wants.
	 */
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { playSound } from '../../../sound';

	let {
		/** Existing points, 0..1, or null for a fresh curve. */
		initial = null,
		onSave,
		onClose
	}: {
		initial?: number[] | null;
		onSave: (points: number[]) => void;
		onClose: () => void;
	} = $props();

	/* Sixteen points. Enough to draw a knee, a stair or an S, and few enough
	   that every one is reachable with a pointer at this size -- the evaluator
	   interpolates between them, so the curve is smooth however coarse the
	   table. */
	const N = 16;

	/* Read once, deliberately. The dialog is created fresh each time it opens
	   and destroyed on close, so `initial` cannot change while it lives -- and a
	   derived would fight the pointer, resetting the drawing to the saved curve
	   on every stroke. An undrawn curve starts as the straight line, which is
	   what DRAW does before anyone touches it. */
	// svelte-ignore state_referenced_locally
	let points = $state<number[]>(
		initial && initial.length >= 2
			? resample(initial, N)
			: Array.from({ length: N }, (_, i) => i / (N - 1))
	);
	let canvas = $state<HTMLCanvasElement | null>(null);
	let drawing = $state(false);
	let last = $state<number | null>(null);

	function resample(src: number[], n: number): number[] {
		const out: number[] = [];
		for (let i = 0; i < n; i++) {
			const f = (i / (n - 1)) * (src.length - 1);
			const k = Math.floor(f);
			const a = src[Math.min(src.length - 1, k)] ?? 0;
			const b = src[Math.min(src.length - 1, k + 1)] ?? a;
			out.push(a + (b - a) * (f - k));
		}
		return out;
	}

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	/* Escape closes it, as it does every other modal in this tree -- the wave
	   editor, the settings panel and the confirm dialog all bind it the same
	   way. This one was the exception, and it is the one opened from a card on
	   the patch canvas: the canvas has its own Escape (clear the selection), so
	   without this the key reached straight past an open dialog and cleared the
	   selection underneath it while the dialog stayed up. Captured and stopped
	   for that reason, which is what WaveDrawDialog does. */
	onMount(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				onClose();
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});

	/* A stroke sets every point it passes, not just the one under the pointer:
	   a quick drag would otherwise leave gaps wherever the pointer jumped more
	   than one column between events. */
	function paint(e: PointerEvent) {
		if (!canvas) return;
		const r = canvas.getBoundingClientRect();
		const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
		const y = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
		const i = Math.round(x * (N - 1));
		const from = last ?? i;
		const lo = Math.min(from, i);
		const hi = Math.max(from, i);
		const next = [...points];
		if (lo === hi) next[i] = y;
		else {
			const startY = points[from];
			for (let k = lo; k <= hi; k++) {
				const tt = (k - from) / (i - from || 1);
				next[k] = startY + (y - startY) * Math.max(0, Math.min(1, tt));
			}
		}
		points = next;
		last = i;
	}

	function preset(kind: string) {
		points = Array.from({ length: N }, (_, i) => {
			const x = i / (N - 1);
			if (kind === 'line') return x;
			if (kind === 'scurve') return x * x * (3 - 2 * x);
			if (kind === 'stair') return Math.floor(x * 4) / 3;
			return 1 - x;
		});
		playSound('click');
	}

	/** A 3-tap average, which rounds a hand-drawn stroke without moving its ends. */
	function smooth() {
		points = points.map((v, i, a) => {
			if (i === 0 || i === a.length - 1) return v;
			return (a[i - 1] + v + a[i + 1]) / 3;
		});
		playSound('click');
	}

	let path = $derived(
		points.map((v, i) => `${((i / (N - 1)) * 100).toFixed(2)},${(100 - v * 100).toFixed(2)}`).join(' L ')
	);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	use:portal
	class="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center"
	onclick={onClose}
	transition:fade={{ duration: 140 }}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="bg-[#121417] border border-[#abb2bf]/40 rounded-sm shadow-[0_16px_48px_rgba(0,0,0,0.8)] p-3 font-mono"
		onclick={(e) => e.stopPropagation()}
		transition:scale={{ duration: 160, start: 0.96, easing: cubicOut }}
	>
		<div class="text-[11px] font-bold text-white/70 mb-2">MAP · DRAW</div>

		<div class="relative">
			<svg
				viewBox="0 0 100 100"
				class="block w-[280px] h-[180px] bg-black/70 border border-white/15 rounded-xs"
				preserveAspectRatio="none"
			>
				<!-- Quarters, so a stroke can be placed against something. -->
				{#each [25, 50, 75] as g (g)}
					<line x1={g} y1="0" x2={g} y2="100" stroke="#ffffff14" stroke-width="0.4" />
					<line x1="0" y1={g} x2="100" y2={g} stroke="#ffffff14" stroke-width="0.4" />
				{/each}
				<path
					d="M {path}"
					fill="none"
					stroke="#abb2bf"
					stroke-width="1.5"
					vector-effect="non-scaling-stroke"
				/>
			</svg>
			<!-- Ends the stroke on cancel as well as on up. The browser can take the
			     pointer away mid-stroke -- a touch claimed by scroll, a palm
			     rejected -- and `pointerup` never arrives when it does, so `drawing`
			     stayed true and the curve kept following the pointer with nothing
			     held down. The wave editor beside this one already handles both. -->
			<canvas
				bind:this={canvas}
				class="absolute inset-0 w-full h-full cursor-crosshair"
				onpointerdown={(e) => {
					drawing = true;
					last = null;
					(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
					paint(e);
				}}
				onpointermove={(e) => drawing && paint(e)}
				onpointerup={() => {
					drawing = false;
					last = null;
				}}
				onpointercancel={() => {
					drawing = false;
					last = null;
				}}
			></canvas>
		</div>

		<div class="flex gap-1 mt-2">
			{#each [['line', 'LINE'], ['scurve', 'S'], ['stair', 'STEP'], ['inv', 'INV']] as [id, label] (id)}
				<button
					onclick={() => preset(id)}
					class="press px-2 py-0.5 text-[10px] font-black border border-white/20 rounded-xs text-white/70 hover:bg-white/10 cursor-pointer"
					>{label}</button
				>
			{/each}
			<button
				onclick={smooth}
				class="press px-2 py-0.5 text-[10px] font-black border border-white/20 rounded-xs text-white/70 hover:bg-white/10 cursor-pointer"
				>SMOOTH</button
			>
		</div>

		<div class="flex gap-1 mt-2 justify-end">
			<button
				onclick={onClose}
				class="press px-3 py-1 text-[10px] font-black border border-white/20 rounded-xs text-white/60 hover:bg-white/10 cursor-pointer"
				>CANCEL</button
			>
			<button
				onclick={() => {
					onSave(points);
					playSound('click');
				}}
				class="press px-3 py-1 text-[10px] font-black border border-[#98c379]/60 bg-[#98c379]/15 text-[#98c379] rounded-xs hover:bg-[#98c379]/25 cursor-pointer"
				>SAVE</button
			>
		</div>
	</div>
</div>
