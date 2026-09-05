<script lang="ts">
	import { onMount } from 'svelte';
	import { playSound } from '../../sound';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

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
	let testedAxes = $state<Set<number>>(new Set());

	// Standard-mapping names; non-standard pads fall back to indices.
	const STD_NAMES = ['A/✕', 'B/○', 'X/□', 'Y/△', 'L1', 'R1', 'L2', 'R2', 'SELECT', 'START', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME', 'TOUCH'];

	/* The standard mapping is a fixed layout, so a pad reporting it can be drawn
	   as the thing in your hands rather than as a list of indices: the face
	   buttons in their diamond, the d-pad as a cross, the sticks where they
	   physically sit. Everything is placed in one 300x180 viewBox so the parts
	   keep their spatial relationship at any size, and a press lights the shape
	   in the same place you pressed it -- which is the whole point of a tester.
	   Indices are the standard's own, so this doubles as the mapping reference.

	   A pad that reports a non-standard mapping gets the plain list instead:
	   drawing an Xbox silhouette for an arcade stick or a racing wheel would be
	   a confident lie about hardware we cannot identify. */
	const isStandard = $derived(pad?.mapping === 'standard');

	/* Face buttons: A B X Y in their diamond. Centred on (227,82), which is as
	   far right of the middle as the d-pad's cross is left of it, so the two
	   clusters sit symmetrically. The 18px radius is what the shell allows --
	   its right edge runs from x=250 at y=58 out to x=263 at y=104, so a wider
	   diamond puts Y through the casing at the top even while B still fits. */
	const FACE = [
		{ i: 0, cx: 227, cy: 100, label: 'A' },
		{ i: 1, cx: 245, cy: 82, label: 'B' },
		{ i: 2, cx: 209, cy: 82, label: 'X' },
		{ i: 3, cx: 227, cy: 64, label: 'Y' }
	];

	/** D-pad arms, drawn as a cross of rectangles. */
	const DPAD = [
		{ i: 12, x: 64, y: 54, w: 18, h: 18, glyph: '▲' },
		{ i: 13, x: 64, y: 90, w: 18, h: 18, glyph: '▼' },
		{ i: 14, x: 46, y: 72, w: 18, h: 18, glyph: '◀' },
		{ i: 15, x: 82, y: 72, w: 18, h: 18, glyph: '▶' }
	];

	function pressed(i: number): boolean {
		return !!pad?.buttons[i]?.pressed;
	}
	function value(i: number): number {
		return pad?.buttons[i]?.value ?? 0;
	}
	/** Lit when held, dimly marked once tested, otherwise inert. */
	function fill(i: number): string {
		if (pressed(i)) return themeStyles.cursorColor;
		if (testedButtons.has(i)) return 'rgba(152,195,121,0.35)';
		return 'rgba(255,255,255,0.06)';
	}
	function stroke(i: number): string {
		if (pressed(i)) return themeStyles.cursorColor;
		if (testedButtons.has(i)) return 'rgba(152,195,121,0.7)';
		return 'rgba(255,255,255,0.28)';
	}

	/** Stick position, clamped to the well it sits in. */
	function stickPos(xAxis: number, yAxis: number, cx: number, cy: number, r: number) {
		const x = pad?.axes[xAxis] ?? 0;
		const y = pad?.axes[yAxis] ?? 0;
		return { x: cx + x * r, y: cy + y * r, live: Math.hypot(x, y) > 0.08 };
	}

	function buttonName(i: number): string {
		return isStandard && STD_NAMES[i] ? STD_NAMES[i] : `B${i}`;
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
			// An axis counts as exercised once it has been pushed clear of centre,
			// so a stick with drift cannot mark itself tested by sitting still.
			gp.axes.forEach((a, i) => {
				if (Math.abs(a) > 0.5 && !testedAxes.has(i)) {
					testedAxes = new Set(testedAxes).add(i);
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

	let leftStick = $derived(stickPos(0, 1, 116, 112, 14));
	let rightStick = $derived(stickPos(2, 3, 184, 112, 14));
</script>

<div class="space-y-2">
	{#if !pad}
		<div class="border border-white/15 bg-black/40 rounded-xs p-6 text-center space-y-2">
			<div class="text-sm font-mono text-white/60">{everConnected ? 'CONTROLLER DISCONNECTED' : 'NO CONTROLLER DETECTED'}</div>
			<div class="text-xs font-mono text-white/35">Connect a gamepad and press any button — browsers hide devices until first input.</div>
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-1.5 text-xs font-mono">
			<span class="px-2 py-1 border border-[#98c379]/50 bg-[#98c379]/10 rounded-xs text-[#98c379] font-bold truncate max-w-[60%] flex items-center gap-1.5" title={pad.id}>
				<span class="w-1.5 h-1.5 rounded-full bg-[#98c379] blink-live shrink-0"></span>
				{pad.id}
			</span>
			<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">MAPPING: <span class="font-bold text-white/80">{pad.mapping || 'custom'}</span></span>
			<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60">
				TESTED: <span class="font-bold text-white/80">{testedButtons.size}/{pad.buttons.length}</span> btn · <span class="font-bold text-white/80">{testedAxes.size}/{pad.axes.length}</span> axis
			</span>
			{#if pad.canRumble}
				<button onclick={rumble} class="press px-2 py-1 border border-[#c678dd]/50 text-[#c678dd] hover:bg-[#c678dd]/20 rounded-xs font-bold cursor-pointer transition-colors">
					◉ RUMBLE TEST
				</button>
			{/if}
		</div>

		{#if isStandard}
			<!-- The pad itself. Held buttons light up where they sit on the device. -->
			<div class="border border-white/15 bg-black/40 rounded-xs p-2.5">
				<svg viewBox="0 0 300 180" class="w-full max-h-[280px]" role="img" aria-label="Gamepad state">
					<!-- Body -->
					<path
						d="M78 42 h144 a34 34 0 0 1 33 26 l14 62 a26 26 0 0 1 -47 20 l-20 -26 h-104 l-20 26 a26 26 0 0 1 -47 -20 l14 -62 a34 34 0 0 1 33 -26 z"
						fill="rgba(255,255,255,0.035)"
						stroke="rgba(255,255,255,0.18)"
						stroke-width="1.5"
					/>

					<!-- Shoulders: L1/R1 as pads, L2/R2 filling with their analogue value -->
					{#each [{ i: 4, x: 74, label: 'L1' }, { i: 5, x: 190, label: 'R1' }] as s (s.i)}
						<rect x={s.x} y="26" width="36" height="11" rx="4" fill={fill(s.i)} stroke={stroke(s.i)} stroke-width="1.2" />
						<text x={s.x + 18} y="34.5" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.75)" font-family="monospace">{s.label}</text>
					{/each}
					{#each [{ i: 6, x: 74, label: 'L2' }, { i: 7, x: 190, label: 'R2' }] as t (t.i)}
						<rect x={t.x} y="12" width="36" height="11" rx="4" fill="rgba(255,255,255,0.05)" stroke={stroke(t.i)} stroke-width="1.2" />
						<!-- Analogue travel, drawn as fill rather than a separate bar -->
						<rect x={t.x} y="12" width={36 * value(t.i)} height="11" rx="4" fill={themeStyles.cursorColor} opacity="0.75" />
						<text x={t.x + 18} y="20.5" text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.75)" font-family="monospace">{t.label}</text>
					{/each}

					<!-- D-pad -->
					{#each DPAD as d (d.i)}
						<rect x={d.x} y={d.y} width={d.w} height={d.h} rx="2" fill={fill(d.i)} stroke={stroke(d.i)} stroke-width="1.2" />
						<text x={d.x + d.w / 2} y={d.y + d.h / 2 + 3} text-anchor="middle" font-size="7" fill="rgba(255,255,255,0.6)" font-family="monospace">{d.glyph}</text>
					{/each}

					<!-- Face buttons -->
					{#each FACE as f (f.i)}
						<circle cx={f.cx} cy={f.cy} r="10" fill={fill(f.i)} stroke={stroke(f.i)} stroke-width="1.4" />
						<text x={f.cx} y={f.cy + 3.5} text-anchor="middle" font-size="9" font-weight="bold" fill="rgba(255,255,255,0.8)" font-family="monospace">{f.label}</text>
					{/each}

					<!-- SELECT / START / HOME, in the middle between the two clusters -->
					<rect x="126" y="62" width="18" height="7" rx="3" fill={fill(8)} stroke={stroke(8)} stroke-width="1.1" />
					<rect x="156" y="62" width="18" height="7" rx="3" fill={fill(9)} stroke={stroke(9)} stroke-width="1.1" />
					<text x="135" y="57" text-anchor="middle" font-size="5.5" fill="rgba(255,255,255,0.45)" font-family="monospace">SELECT</text>
					<text x="165" y="57" text-anchor="middle" font-size="5.5" fill="rgba(255,255,255,0.45)" font-family="monospace">START</text>
					{#if pad.buttons.length > 16}
						<circle cx="150" cy="84" r="6.5" fill={fill(16)} stroke={stroke(16)} stroke-width="1.2" />
						<text x="150" y="86.5" text-anchor="middle" font-size="6" fill="rgba(255,255,255,0.55)" font-family="monospace">⌂</text>
					{/if}

					<!-- Sticks: the well, then the cap at its axis position. L3/R3 light the ring. -->
					{#each [{ cx: 116, cy: 112, s: leftStick, click: 10, label: 'L3' }, { cx: 184, cy: 112, s: rightStick, click: 11, label: 'R3' }] as st (st.click)}
						<circle cx={st.cx} cy={st.cy} r="17" fill="rgba(0,0,0,0.45)" stroke={pressed(st.click) ? themeStyles.cursorColor : testedButtons.has(st.click) ? 'rgba(152,195,121,0.6)' : 'rgba(255,255,255,0.2)'} stroke-width={pressed(st.click) ? 2 : 1.2} />
						<line x1={st.cx - 17} y1={st.cy} x2={st.cx + 17} y2={st.cy} stroke="rgba(255,255,255,0.1)" stroke-width="0.6" />
						<line x1={st.cx} y1={st.cy - 17} x2={st.cx} y2={st.cy + 17} stroke="rgba(255,255,255,0.1)" stroke-width="0.6" />
						<circle
							cx={st.s.x}
							cy={st.s.y}
							r="7.5"
							fill={st.s.live || pressed(st.click) ? themeStyles.cursorColor : 'rgba(255,255,255,0.28)'}
							stroke="rgba(0,0,0,0.5)"
							stroke-width="1"
						/>
						<text x={st.cx} y={st.cy + 29} text-anchor="middle" font-size="6" fill="rgba(255,255,255,0.4)" font-family="monospace">{st.label}</text>
					{/each}
				</svg>
			</div>
		{/if}

		<!-- The numbers, kept alongside the picture: a tester needs exact values,
		     and a non-standard pad has nothing but these. -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
			<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-1">
				<div class="text-[10px] font-mono font-bold text-white/45 uppercase pb-1 border-b border-white/10">Buttons ({testedButtons.size}/{pad.buttons.length} tested)</div>
				<div class="grid grid-cols-2 gap-x-3 gap-y-1">
					{#each pad.buttons as b, i (i)}
						<div class="flex items-center gap-1.5 text-[10px] font-mono">
							<span class="w-14 shrink-0 truncate transition-colors duration-75 {b.pressed ? 'font-black' : testedButtons.has(i) ? 'text-[#98c379]' : 'text-white/40'}" style={b.pressed ? `color: ${themeStyles.cursorColor}` : ''}>
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
						<span class="w-14 shrink-0 {testedAxes.has(i) ? 'text-[#98c379]' : 'text-white/40'}">AXIS {i}</span>
						<div class="flex-1 h-2.5 bg-black/60 border border-white/10 rounded-xs relative overflow-hidden">
							<div class="absolute top-0 bottom-0 left-1/2 w-px bg-white/25"></div>
							<div
								class="absolute top-0 bottom-0 w-1.5 rounded-xs transition-[background-color] duration-75"
								style="left: calc({((a + 1) / 2) * 100}% - 3px); background-color: {Math.abs(a) > 0.05 ? themeStyles.cursorColor : 'rgba(255,255,255,0.35)'};"
							></div>
						</div>
						<span class="w-12 text-right shrink-0 transition-colors duration-75 {Math.abs(a) > 0.05 ? 'text-[#e5c07b] font-bold' : 'text-white/35'}">{a.toFixed(2)}</span>
					</div>
				{/each}
				<div class="text-[10px] font-mono text-white/30 pt-1">Sticks centered read ~0.00 — persistent offset at rest = drift.</div>
			</div>
		</div>
	{/if}
</div>
