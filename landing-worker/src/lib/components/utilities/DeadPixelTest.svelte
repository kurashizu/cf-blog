<script lang="ts">
	import { playSound } from '../../sound';

	const COLORS = [
		{ name: 'WHITE', value: '#ffffff' },
		{ name: 'BLACK', value: '#000000' },
		{ name: 'RED', value: '#ff0000' },
		{ name: 'GREEN', value: '#00ff00' },
		{ name: 'BLUE', value: '#0000ff' },
		{ name: 'GRAY 50%', value: '#808080' }
	];

	let active = $state(false);
	let colorIdx = $state(0);
	let hintVisible = $state(true);
	let overlayEl: HTMLDivElement | undefined = $state();
	let hintTimer: ReturnType<typeof setTimeout> | null = null;

	function showHint() {
		hintVisible = true;
		if (hintTimer) clearTimeout(hintTimer);
		hintTimer = setTimeout(() => (hintVisible = false), 2000);
	}

	async function start() {
		active = true;
		colorIdx = 0;
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
		if (colorIdx >= COLORS.length - 1) {
			close();
			return;
		}
		colorIdx++;
		showHint();
	}

	function onOverlayKeydown(e: KeyboardEvent) {
		if (!active) return;
		if (e.key === 'Escape') close();
		else {
			e.preventDefault();
			next();
		}
	}
</script>

<svelte:window onkeydown={onOverlayKeydown} />

<div class="space-y-2">
	<div class="border border-white/15 bg-black/40 rounded-xs p-4 space-y-3">
		<p class="text-xs font-mono text-white/60 leading-relaxed">
			Cycles the whole screen through {COLORS.length} solid colors. Stuck or dead pixels show up as dots that
			don't match the fill — a stuck subpixel is easiest to spot on the opposite primary colors.
		</p>
		<div class="flex flex-wrap gap-1.5">
			{#each COLORS as c (c.name)}
				<span class="flex items-center gap-1.5 px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-[10px] font-mono text-white/60">
					<span class="w-2.5 h-2.5 rounded-xs border border-white/30" style="background-color: {c.value}"></span>
					{c.name}
				</span>
			{/each}
		</div>
		<button
			onclick={start}
			class="px-3 py-1.5 border border-[#e5c07b]/60 bg-[#e5c07b]/10 text-[#e5c07b] hover:bg-[#e5c07b]/25 rounded-xs font-black text-xs cursor-pointer transition-colors"
		>
			▶ START TEST (fullscreen · click/any key = next color · Esc = exit)
		</button>
	</div>
</div>

{#if active}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={overlayEl}
		onclick={next}
		class="fixed inset-0 z-[300] cursor-pointer"
		style="background-color: {COLORS[colorIdx].value}"
	>
		{#if hintVisible}
			<div class="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/80 border border-white/20 rounded-xs text-xs font-mono text-white/80 pointer-events-none">
				{COLORS[colorIdx].name} ({colorIdx + 1}/{COLORS.length}) — click for next, Esc to exit
			</div>
		{/if}
	</div>
{/if}
