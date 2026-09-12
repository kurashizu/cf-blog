<script lang="ts">
	let {
		attack = 0.005,
		decay = 0.15,
		sustain = 0.5,
		release = 0.1,
		color = '#98c379',
		/* The numbers under the curve repeat whatever knobs sit beside it. On a
		   patch-bay card the knobs are directly below, so the curve alone is the
		   useful half. */
		compact = false,
		/* Whether the numbers are shown. The letters under the curve are what say
		   which segment is which -- they are the graph's axis, not a readout --
		   so they stay even where the values are a duplicate of the faders
		   alongside. `compact` still drops the whole strip, for the patch-bay
		   card where the curve alone is wanted. */
		values = true,
		/* The pitch envelope has no release stage -- its third fader is an AMT in
		   semitones rather than a sustain level, and there is no fourth. Labelling
		   its curve A/D/S/R said it had four segments when it has three. */
		stages = ['A', 'D', 'S', 'R']
	}: {
		attack?: number;
		decay?: number;
		sustain?: number;
		release?: number;
		color?: string;
		compact?: boolean;
		values?: boolean;
		stages?: string[];
	} = $props();

	const width = 160;
	const height = 46;
	const padX = 4;
	const padY = 4;
	const usableW = width - padX * 2;
	const usableH = height - padY * 2;
	const holdTime = 0.25;

	let totalT = $derived(Math.max(0.1, attack + decay + holdTime + release));
	const x0 = padX;
	const y0 = height - padY;
	let wA = $derived((attack / totalT) * usableW);
	let x1 = $derived(x0 + wA);
	const y1 = padY;
	let wD = $derived((decay / totalT) * usableW);
	let x2 = $derived(x1 + wD);
	let y2 = $derived(height - padY - Math.max(0, Math.min(1, sustain)) * usableH);
	let wS = $derived((holdTime / totalT) * usableW);
	let x3 = $derived(x2 + wS);
	let y3 = $derived(y2);
	let wR = $derived((release / totalT) * usableW);
	let x4 = $derived(x3 + wR);
	const y4 = y0;

	let pathD = $derived(
		`M ${x0},${y0} L ${x1},${y1} Q ${(x1 + x2) / 2},${y1 + (y2 - y1) * 0.75} ${x2},${y2} L ${x3},${y3} Q ${(x3 + x4) / 2},${y3 + (y4 - y3) * 0.75} ${x4},${y4}`
	);
	let fillD = $derived(`${pathD} L ${x4},${y0} L ${x0},${y0} Z`);
</script>

<!-- `h-full` and a stretching curve, not a fixed 48px box.

     The graph sat at its own `h-12` inside a `flex-1` parent, so the panel gave
     it the whole column and it used a sliver of it -- the dead space above and
     below the envelope was the rest. `min-h-0` lets the SVG shrink when the rack
     is short; `preserveAspectRatio="none"` lets the curve stretch to whatever
     height it is given, which is right for a shape whose axes are time and
     level rather than a picture that must not distort. -->
<div class="w-full h-full min-h-0 bg-black/70 border border-white/15 rounded-xs p-1 flex flex-col">
	<svg
		viewBox="0 0 {width} {height}"
		preserveAspectRatio="none"
		class="w-full flex-1 min-h-0 overflow-visible select-none"
	>
		<defs>
			<linearGradient id="adsrGrad" x1="0%" y1="0%" x2="0%" y2="100%">
				<stop offset="0%" stop-color={color} stop-opacity="0.4" />
				<stop offset="100%" stop-color={color} stop-opacity="0.02" />
			</linearGradient>
		</defs>

		<line
			x1={padX}
			y1={padY}
			x2={width - padX}
			y2={padY}
			stroke="rgba(255,255,255,0.08)"
			stroke-dasharray="2,2"
		/>
		<line x1={padX} y1={y0} x2={width - padX} y2={y0} stroke="rgba(255,255,255,0.2)" />
		<line {x1} y1={padY} x2={x1} y2={y0} stroke="rgba(255,255,255,0.08)" stroke-dasharray="1,2" />
		<line x1={x2} y1={padY} {x2} y2={y0} stroke="rgba(255,255,255,0.08)" stroke-dasharray="1,2" />
		<line
			x1={x3}
			y1={padY}
			x2={x3}
			y2={y0}
			stroke="rgba(255,255,255,0.08)"
			stroke-dasharray="1,2"
		/>

		<path d={fillD} fill="url(#adsrGrad)" />
		<path
			d={pathD}
			fill="none"
			stroke={color}
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>

		<circle cx={x1} cy={y1} r="2.5" fill={color} />
		<circle cx={x2} cy={y2} r="2" fill="#fff" />
		<circle cx={x3} cy={y3} r="2" fill="#fff" />
	</svg>

	{#if !compact}
		<div
			class="w-full flex flex-col gap-0.5 border-t border-white/10 pt-0.5 font-mono leading-none"
		>
			<div
				class="grid text-center text-xs font-black text-white/60"
				style="grid-template-columns: repeat({stages.length}, minmax(0, 1fr))"
			>
				{#each stages as st (st)}
					<span>{st}</span>
				{/each}
			</div>
			{#if values}
				<div
					class="grid text-center text-[10px] font-black tracking-tight"
					style="grid-template-columns: repeat({stages.length}, minmax(0, 1fr))"
				>
					<span class="truncate" style="color: {color}">{Math.round(attack * 1000)}ms</span>
					<span class="truncate text-white/90">{Math.round(decay * 1000)}ms</span>
					<span class="truncate text-white/90">{Math.round(sustain * 100)}%</span>
					{#if stages.length > 3}
						<span class="truncate" style="color: {color}">{Math.round(release * 1000)}ms</span>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
