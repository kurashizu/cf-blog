<script lang="ts">
	import { onMount } from 'svelte';
	import { playSound } from '../../sound';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';
	import { t } from '$lib/i18n';

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	// e.button -> index: 0 L, 1 M, 2 R, 3 X1(back), 4 X2(forward)
	const BUTTON_NAME_KEYS = [
		'utilities.mouse.button.left',
		'utilities.mouse.button.middleName',
		'utilities.mouse.button.right',
		'utilities.mouse.button.backName',
		'utilities.mouse.button.fwdName'
	];
	let BUTTON_NAMES = $derived(BUTTON_NAME_KEYS.map((k) => $t(k)));

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
			{$t('utilities.mouse.readout.pos')} <span class="font-bold text-[#e5c07b]">{pos.x}, {pos.y}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60" title={$t('utilities.mouse.readout.moveEvents.title')}>
			{$t('utilities.mouse.readout.moveEvents')} <span class="font-bold text-[#56b6c2]">{moveRate}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60" title={$t('utilities.mouse.readout.clickGap.title')}>
			{$t('utilities.mouse.readout.clickGap')} <span class="font-bold text-[#c678dd]">{lastClickGap === null ? '—' : $t('utilities.mouse.readout.clickGap.value', { ms: lastClickGap })}</span>
		</span>
		<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">
			{$t('utilities.mouse.readout.dblClicks')} <span class="font-bold text-[#98c379]">{dblClicks}</span>
		</span>
		<button onclick={reset} class="press ml-auto px-2 py-1 border border-white/20 hover:border-[#e06c75] text-white/60 hover:text-[#e06c75] rounded-xs font-bold cursor-pointer transition-colors">
			{$t('utilities.mouse.reset')}
		</button>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-2">
		<!-- Mouse diagram -->
		<div class="border border-white/15 bg-black/40 rounded-xs p-3 flex flex-col items-center gap-2">
			<div class="flex gap-1 w-full">
				<div class="flex flex-col gap-1 justify-center">
					<div class="border rounded-xs w-7 h-8 flex items-center justify-center text-[9px] font-mono font-bold transition-colors duration-75 {btnClass(4)}" style={isDown(4) ? `background-color: ${themeStyles.cursorColor}; border-color: ${themeStyles.cursorColor};` : ''} title={$t('utilities.mouse.button.forward')}>X2</div>
					<div class="border rounded-xs w-7 h-8 flex items-center justify-center text-[9px] font-mono font-bold transition-colors duration-75 {btnClass(3)}" style={isDown(3) ? `background-color: ${themeStyles.cursorColor}; border-color: ${themeStyles.cursorColor};` : ''} title={$t('utilities.mouse.button.back')}>X1</div>
				</div>
				<div class="flex-1 grid grid-cols-[1fr_22px_1fr] gap-1">
					<div class="border rounded-tl-2xl rounded-bl-xs h-[76px] flex items-end justify-center pb-1 text-[9px] font-mono font-bold transition-colors duration-75 {btnClass(0)}" style={isDown(0) ? `background-color: ${themeStyles.cursorColor}; border-color: ${themeStyles.cursorColor};` : ''}>L</div>
					<div class="flex flex-col items-center justify-start pt-1 gap-1">
						<div class="border rounded-full w-4 h-9 flex items-center justify-center text-[9px] font-mono font-bold transition-colors duration-75 {btnClass(1)}" style={isDown(1) ? `background-color: ${themeStyles.cursorColor}; border-color: ${themeStyles.cursorColor};` : ''} title={$t('utilities.mouse.button.middle')}>M</div>
						<div class="text-[9px] font-mono transition-colors {lastWheelDelta < 0 ? 'text-[#56b6c2] font-bold' : 'text-white/50'}">▲{wheelUp}</div>
						<div class="text-[9px] font-mono transition-colors {lastWheelDelta > 0 ? 'text-[#e5c07b] font-bold' : 'text-white/50'}">▼{wheelDown}</div>
					</div>
					<div class="border rounded-tr-2xl rounded-br-xs h-[76px] flex items-end justify-center pb-1 text-[9px] font-mono font-bold transition-colors duration-75 {btnClass(2)}" style={isDown(2) ? `background-color: ${themeStyles.cursorColor}; border-color: ${themeStyles.cursorColor};` : ''}>R</div>
				</div>
			</div>
			<div class="w-full border border-white/10 rounded-b-2xl rounded-t-xs h-16 bg-black/30"></div>
			<div class="w-full space-y-0.5 text-[10px] font-mono">
				{#each BUTTON_NAMES as name, i (i)}
					<div class="flex justify-between {testedButtons[i] ? 'text-[#98c379]' : 'text-white/60'}">
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
				<span class="text-white/50 text-xs font-mono text-center px-4 whitespace-pre-line">{$t('utilities.mouse.surface.hint')}</span>
			</div>
			{#if buttonsMask !== 0}
				<div class="absolute top-2 left-2 px-2 py-1 bg-black/70 border rounded-xs text-xs font-mono font-bold" style="color: {themeStyles.cursorColor}; border-color: {themeStyles.cursorColor};">
					{$t('utilities.mouse.surface.buttons', { mask: buttonsMask })}
				</div>
			{/if}
			<div class="absolute bottom-2 right-2 px-2 py-1 bg-black/70 border border-white/15 rounded-xs text-[10px] font-mono text-white/50">
				{$t('utilities.mouse.surface.deltaWheel', { delta: lastWheelDelta })}
			</div>
		</div>
	</div>
</div>
