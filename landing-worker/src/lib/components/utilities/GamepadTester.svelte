<script lang="ts">
	import { onMount } from 'svelte';
	import { playSound } from '../../sound';
	import { theme, THEME_STYLES } from '../../stores/theme';

	let themeStyles = $derived(THEME_STYLES[$theme]);

	interface PadSnapshot {
		id: string;
		index: number;
		mapping: string;
		buttons: { pressed: boolean; value: number }[];
		axes: number[];
		canRumble: boolean;
	}

	let pad = $state<PadSnapshot | null>(null);
	let everConnected = $state(false);
	let testedButtons = $state<Set<number>>(new Set());

	// Standard-mapping names; non-standard pads fall back to indices.
	const STD_NAMES = ['A/✕', 'B/○', 'X/□', 'Y/△', 'L1', 'R1', 'L2', 'R2', 'SELECT', 'START', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME', 'TOUCH'];

	function buttonName(i: number): string {
		return pad?.mapping === 'standard' && STD_NAMES[i] ? STD_NAMES[i] : `B${i}`;
	}

	function rumble() {
		const gp = navigator.getGamepads()[pad?.index ?? 0];
		const actuator = (gp as unknown as { vibrationActuator?: { playEffect: (t: string, o: object) => Promise<unknown> } })?.vibrationActuator;
		actuator?.playEffect('dual-rumble', { duration: 400, strongMagnitude: 1.0, weakMagnitude: 0.6 });
		playSound('click');
	}

	onMount(() => {
		let raf = 0;
		const poll = () => {
			raf = requestAnimationFrame(poll);
			const gps = navigator.getGamepads?.() ?? [];
			const gp = gps.find((g) => g !== null);
			if (!gp) {
				pad = null;
				return;
			}
			everConnected = true;
			gp.buttons.forEach((b, i) => {
				if (b.pressed && !testedButtons.has(i)) {
					testedButtons = new Set(testedButtons).add(i);
				}
			});
			pad = {
				id: gp.id,
				index: gp.index,
				mapping: gp.mapping,
				buttons: gp.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
				axes: [...gp.axes],
				canRumble: !!(gp as unknown as { vibrationActuator?: unknown }).vibrationActuator
			};
		};
		raf = requestAnimationFrame(poll);
		return () => cancelAnimationFrame(raf);
	});
</script>

<div class="space-y-2">
	{#if !pad}
		<div class="border border-white/15 bg-black/40 rounded-xs p-6 text-center space-y-2">
			<div class="text-sm font-mono text-white/60">{everConnected ? 'CONTROLLER DISCONNECTED' : 'NO CONTROLLER DETECTED'}</div>
			<div class="text-xs font-mono text-white/35">Connect a gamepad and press any button — browsers hide devices until first input.</div>
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-1.5 text-xs font-mono">
			<span class="px-2 py-1 border border-[#98c379]/50 bg-[#98c379]/10 rounded-xs text-[#98c379] font-bold truncate max-w-[60%]" title={pad.id}>
				● {pad.id}
			</span>
			<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">MAPPING: <span class="font-bold text-white/80">{pad.mapping || 'custom'}</span></span>
			{#if pad.canRumble}
				<button onclick={rumble} class="px-2 py-1 border border-[#c678dd]/50 text-[#c678dd] hover:bg-[#c678dd]/20 rounded-xs font-bold cursor-pointer transition-colors">
					◉ RUMBLE TEST
				</button>
			{/if}
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
			<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-1">
				<div class="text-[10px] font-mono font-bold text-white/45 uppercase pb-1 border-b border-white/10">Buttons ({testedButtons.size}/{pad.buttons.length} tested)</div>
				<div class="grid grid-cols-2 gap-x-3 gap-y-1">
					{#each pad.buttons as b, i (i)}
						<div class="flex items-center gap-1.5 text-[10px] font-mono">
							<span class="w-14 shrink-0 truncate {b.pressed ? 'font-black' : testedButtons.has(i) ? 'text-[#98c379]' : 'text-white/40'}" style={b.pressed ? `color: ${themeStyles.cursorColor}` : ''}>
								{buttonName(i)}
							</span>
							<div class="flex-1 h-2 bg-black/60 border border-white/10 rounded-xs overflow-hidden">
								<div class="h-full transition-[width] duration-75" style="width: {Math.round(b.value * 100)}%; background-color: {b.pressed ? themeStyles.cursorColor : 'rgba(152,195,121,0.6)'};"></div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-1.5">
				<div class="text-[10px] font-mono font-bold text-white/45 uppercase pb-1 border-b border-white/10">Axes</div>
				{#each pad.axes as a, i (i)}
					<div class="flex items-center gap-1.5 text-[10px] font-mono">
						<span class="w-14 shrink-0 text-white/40">AXIS {i}</span>
						<div class="flex-1 h-2.5 bg-black/60 border border-white/10 rounded-xs relative overflow-hidden">
							<div class="absolute top-0 bottom-0 left-1/2 w-px bg-white/25"></div>
							<div
								class="absolute top-0 bottom-0 w-1.5 rounded-xs"
								style="left: calc({((a + 1) / 2) * 100}% - 3px); background-color: {Math.abs(a) > 0.05 ? themeStyles.cursorColor : 'rgba(255,255,255,0.35)'};"
							></div>
						</div>
						<span class="w-12 text-right shrink-0 {Math.abs(a) > 0.05 ? 'text-[#e5c07b] font-bold' : 'text-white/35'}">{a.toFixed(2)}</span>
					</div>
				{/each}
				<div class="text-[10px] font-mono text-white/30 pt-1">Sticks centered read ~0.00 — persistent offset at rest = drift.</div>
			</div>
		</div>
	{/if}
</div>
