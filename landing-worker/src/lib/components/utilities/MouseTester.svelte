<script lang="ts">
	import { onMount } from 'svelte';
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';

	let themeStyles = $derived(THEME_STYLES[$theme]);

	// e.button -> index: 0 L, 1 M, 2 R, 3 X1(back), 4 X2(forward)
	const BUTTON_NAMES = ['LEFT', 'MIDDLE', 'RIGHT', 'BACK (X1)', 'FWD (X2)'];

	let buttonsMask = $state(0);
	let clickCounts = $state([0, 0, 0, 0, 0]);
	let testedButtons = $state([false, false, false, false, false]);
	let wheelUp = $state(0);
	let wheelDown = $state(0);
	let lastWheelDelta = $state(0);
	let dblClicks = $state(0);
	let lastClickGap = $state<number | null>(null);
	let lastLeftDownAt = 0;
	let pos = $state({ x: 0, y: 0 });
	let moveRate = $state(0);
	let surfaceEl: HTMLDivElement | undefined = $state();

	// Rolling 1s window of coalesced move events — closest a page can get to the device report rate.
	let moveTimestamps: number[] = [];

	function handlePointerDown(e: PointerEvent) {
		buttonsMask = e.buttons;
		if (e.button >= 0 && e.button < 5) {
			clickCounts[e.button]++;
			testedButtons[e.button] = true;
		}
		if (e.button === 0) {
			const now = performance.now();
			if (lastLeftDownAt > 0) lastClickGap = Math.round(now - lastLeftDownAt);
			lastLeftDownAt = now;
		}
	}

	function handlePointerUp(e: PointerEvent) {
		buttonsMask = e.buttons;
	}

	function handlePointerMove(e: PointerEvent) {
		if (surfaceEl) {
			const r = surfaceEl.getBoundingClientRect();
			pos = { x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top) };
		}
		const now = performance.now();
		const coalesced = e.getCoalescedEvents?.().length || 1;
		for (let i = 0; i < coalesced; i++) moveTimestamps.push(now);
		while (moveTimestamps.length > 0 && now - moveTimestamps[0] > 1000) moveTimestamps.shift();
		moveRate = moveTimestamps.length;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		lastWheelDelta = Math.round(e.deltaY);
		if (e.deltaY < 0) wheelUp++;
		else if (e.deltaY > 0) wheelDown++;
	}

	function handleDblClick() {
		dblClicks++;
	}

	function reset() {
		clickCounts = [0, 0, 0, 0, 0];
		testedButtons = [false, false, false, false, false];
		wheelUp = 0;
		wheelDown = 0;
		lastWheelDelta = 0;
		dblClicks = 0;
		lastClickGap = null;
		lastLeftDownAt = 0;
		moveTimestamps = [];
		moveRate = 0;
		playSound('click');
	}

	onMount(() => {
		// wheel must be non-passive to preventDefault, so it's attached manually
		surfaceEl?.addEventListener('wheel', handleWheel, { passive: false });
		return () => surfaceEl?.removeEventListener('wheel', handleWheel);
	});

	function isDown(idx: number): boolean {
		// e.buttons bitmask: 1 L, 2 R, 4 M, 8 X1, 16 X2
		const bit = [1, 4, 2, 8, 16][idx];
		return (buttonsMask & bit) !== 0;
	}

	function btnClass(idx: number): string {
		if (isDown(idx)) return 'text-black font-black';
		if (testedButtons[idx]) return 'border-[#98c379]/70 text-[#98c379] bg-[#98c379]/10';
		return 'border-white/20 text-white/50 bg-black/40';
	}
</script>

<div class="space-y-2">
	<div class="flex flex-wrap items-center gap-1.5 text-xs font-mono">
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">
			POS: <span class="font-bold text-[#e5c07b]">{pos.x}, {pos.y}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60" title="Coalesced pointermove events in the last second — browser-visible report rate, capped by the OS/browser">
			MOVE EVENTS/s: <span class="font-bold text-[#56b6c2]">{moveRate}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60" title="Interval between the last two left-button presses">
			CLICK GAP: <span class="font-bold text-[#c678dd]">{lastClickGap === null ? '—' : `${lastClickGap}ms`}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">
			DBL-CLICKS: <span class="font-bold text-[#98c379]">{dblClicks}</span>
		</span>
		<button onclick={reset} class="ml-auto px-2 py-1 border border-white/20 hover:border-[#e06c75] text-white/60 hover:text-[#e06c75] rounded-xs font-bold cursor-pointer transition-colors">
			✕ RESET
		</button>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-2">
		<!-- Mouse diagram -->
		<div class="border border-white/15 bg-black/40 rounded-xs p-3 flex flex-col items-center gap-2">
			<div class="flex gap-1 w-full">
				<div class="flex flex-col gap-1 justify-center">
					<div class="border rounded-xs w-7 h-8 flex items-center justify-center text-[9px] font-mono font-bold {btnClass(4)}" style={isDown(4) ? `background-color: ${themeStyles.cursorColor}; border-color: ${themeStyles.cursorColor};` : ''} title="Forward (X2)">X2</div>
					<div class="border rounded-xs w-7 h-8 flex items-center justify-center text-[9px] font-mono font-bold {btnClass(3)}" style={isDown(3) ? `background-color: ${themeStyles.cursorColor}; border-color: ${themeStyles.cursorColor};` : ''} title="Back (X1)">X1</div>
				</div>
				<div class="flex-1 grid grid-cols-[1fr_22px_1fr] gap-1">
					<div class="border rounded-tl-2xl rounded-bl-xs h-[76px] flex items-end justify-center pb-1 text-[9px] font-mono font-bold {btnClass(0)}" style={isDown(0) ? `background-color: ${themeStyles.cursorColor}; border-color: ${themeStyles.cursorColor};` : ''}>L</div>
					<div class="flex flex-col items-center justify-start pt-1 gap-1">
						<div class="border rounded-full w-4 h-9 flex items-center justify-center text-[9px] font-mono font-bold {btnClass(1)}" style={isDown(1) ? `background-color: ${themeStyles.cursorColor}; border-color: ${themeStyles.cursorColor};` : ''} title="Middle / wheel click">M</div>
						<div class="text-[9px] font-mono {lastWheelDelta < 0 ? 'text-[#56b6c2] font-bold' : 'text-white/30'}">▲{wheelUp}</div>
						<div class="text-[9px] font-mono {lastWheelDelta > 0 ? 'text-[#e5c07b] font-bold' : 'text-white/30'}">▼{wheelDown}</div>
					</div>
					<div class="border rounded-tr-2xl rounded-br-xs h-[76px] flex items-end justify-center pb-1 text-[9px] font-mono font-bold {btnClass(2)}" style={isDown(2) ? `background-color: ${themeStyles.cursorColor}; border-color: ${themeStyles.cursorColor};` : ''}>R</div>
				</div>
			</div>
			<div class="w-full border border-white/10 rounded-b-2xl rounded-t-xs h-16 bg-black/30"></div>
			<div class="w-full space-y-0.5 text-[10px] font-mono">
				{#each BUTTON_NAMES as name, i (name)}
					<div class="flex justify-between {testedButtons[i] ? 'text-[#98c379]' : 'text-white/40'}">
						<span>{testedButtons[i] ? '●' : '○'} {name}</span>
						<span class="font-bold">{clickCounts[i]}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Test surface -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={surfaceEl}
			onpointerdown={handlePointerDown}
			onpointerup={handlePointerUp}
			onpointermove={handlePointerMove}
			ondblclick={handleDblClick}
			oncontextmenu={(e) => e.preventDefault()}
			class="border border-white/15 bg-black/60 rounded-xs min-h-[240px] relative overflow-hidden cursor-crosshair select-none"
		>
			<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
				<span class="text-white/25 text-xs font-mono text-center px-4">
					TEST SURFACE — click any button, scroll, double-click.<br />
					Right-click menu is suppressed here.
				</span>
			</div>
			{#if buttonsMask !== 0}
				<div class="absolute top-2 left-2 px-2 py-1 bg-black/70 border rounded-xs text-xs font-mono font-bold" style="color: {themeStyles.cursorColor}; border-color: {themeStyles.cursorColor};">
					buttons = {buttonsMask}
				</div>
			{/if}
			<div class="absolute bottom-2 right-2 px-2 py-1 bg-black/70 border border-white/15 rounded-xs text-[10px] font-mono text-white/50">
				Δwheel: {lastWheelDelta}
			</div>
		</div>
	</div>
</div>
