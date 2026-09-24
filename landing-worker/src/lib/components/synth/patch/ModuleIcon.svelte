<script lang="ts">
	/**
	 * One glyph per module, so a palette of thirty can be read by shape rather
	 * than by reading thirty words.
	 *
	 * Drawn on a 16x16 grid with a single stroke and no fill, which is what keeps
	 * them legible at the 10px they render at and consistent with the site's
	 * other line art. Each one says what the module does rather than what it is
	 * called: the oscillators show their waveform, the resonators show what
	 * rings, the maths modules show their operator.
	 */
	let {
		type,
		size = 10,
		color = 'currentColor'
	}: { type: string; size?: number; color?: string } = $props();

	const PATHS: Record<string, string> = {
		// SOURCE
		in: 'M1 8h9M7 5l3 3-3 3M12 3v10',
		osc: 'M1 8q3.5-6 7 0t7 0',
		noise: 'M1 12l2-8 2 6 2-9 2 11 2-7 2 5 2-6',
		excite: 'M8 2v12M4 5l-2-2M12 5l2-2M4 11l-2 2M12 11l2 2',
		// SHAPE
		filter: 'M1 4h7q4 0 5 8',
		// The amplifier triangle, with a line through it: a VCA and an inverter
		// at once, which is why neither has a card of its own.
		gain: 'M3 3l10 5-10 5zM1 8h2M13 8h2',
		// A curve that flattens at both ends: the transfer function itself.
		shape: 'M1 13q3 0 4-5t4-5h6',
		comp: 'M1 3h5l3 5 3 5h3M1 13h14',
		// RESONATE
		string: 'M1 8q4-5 7 0t6 0M1 8h1M14 8h1',
		// A taut string between two bridges, and the hammer above it.
		wire: 'M1 11h14M2 9v4M14 9v4M9 3v6M6 3h6',
		tube: 'M2 4h12M2 12h12M2 4v8M14 4v8M6 8h4',
		modes: 'M3 13V5M8 13V2M13 13V7M3 5l5-3 5 5',
		space: 'M8 8m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M8 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
		// MODULATE
		env: 'M1 13L5 3l3 6v4M8 9h3l3 4',
		// UTILITY
		delay: 'M2 4v8M6 5v6M10 7v2M14 8v0M2 8h12',
		/* An arrow into the loop, and one coming back out of it: the two ends of
		   the same circuit, drawn as the half each one is. */
		fbsend: 'M2 8h7M6 5l3 3-3 3M11 3a5 5 0 0 1 0 10',
		fbrtn: 'M14 8H7M10 5L7 8l3 3M5 3a5 5 0 0 0 0 10',
		pan: 'M8 13V6M8 6L3 3M8 6l5-3M1 13h4M11 13h4',
		sum: 'M8 3v10M3 8h10',
		diff: 'M3 8h10',
		ring: 'M8 8m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M4 4l8 8M12 4l-8 8',
		out: 'M4 8h9M10 5l3 3-3 3M2 3v10',
		nodept: 'M2 8h3M11 8h3M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 100-5',
		nodecv: 'M2 8h2M6 8h1M9 8h1M12 8h2M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 100-5',
		note: 'M3 3h10v7H8l-3 3v-3H3z M5 6h6M5 8h4',
		// STEREO: one line in, two out -- and the pair that turns sound into numbers.
		split: 'M2 8h5l5-4M7 8l5 4',
		merge: 'M2 4l5 4H2m0 0h5m0 0l5-4v8z',
		break: 'M2 8h4M10 4h4M10 12h4M6 8l4-4M6 8l4 4',
		make: 'M2 4h4M2 12h4M6 4l4 4-4 4M10 8h4',
		mono: 'M2 5h4M2 11h4M6 5l4 3-4 3M10 8h4',
		// METER: what the signal looks like at this point.
		scope: 'M1 8q3-6 5 0t5 0 4-4M1 2v12',
		fft: 'M2 13V7M5 13V4M8 13V9M11 13V6M14 13V11',
		loud: 'M2 11h2v2H2zM6 8h2v5H6zM10 5h2v8h-2z',
		/* The two doors between sound and value: a waveform whose outline is
		   traced, and a level that becomes one. */
		follow: 'M1 12q2-8 3 0t3-6 3 5 3-4M1 13h14',
		tosig: 'M2 8h4M6 8q1.5-4 3 0t3 0M2 5v6',
		// The same door the other way: a wave arriving, a value leaving.
		tocv: 'M1 8q1.5-4 3 0t3 0M7 8h4M11 5v6M13 5v6',
		// LOGIC: the execution chain.
		wait: 'M4 3h8M4 13h8M4 3l8 10M12 3L4 13',
		when: 'M8 2l6 6-6 6-6-6z',
		act: 'M4 2v12l9-6z',
		/* A line broken by an arrow driving in from outside: the voice's own
		   run cut off by something that is not itself, which is what makes
		   this a different event from THEN or REL -- neither of which any
		   other node interrupts. */
		onchoke: 'M1 8h5M10 8h5M8 1v4l-2 2 2 2v4',
		/* A pair of scales: two quantities weighed against each other, which is
		   the one node where an amount becomes a yes or a no. */
		cmp: 'M8 3v10M3 6h10M3 6l-1.5 3.5h3zM13 6l-1.5 3.5h3zM5 13h6',
		// The gate body every logic symbol is drawn from: two in, one out.
		logic: 'M4 3v10h3a5 5 0 0 0 0-10zM1 6h3M1 10h3M12 8h3',
		// The same, with the bubble that is the whole of what NOT means.
		not: 'M4 3v10l7-5zM1 8h3M13 8h2M12 8m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
		// MATH: the operator, or the shape of what it does to a value.
		const: 'M4 4h8M8 4v9M5 13h6',
		add: 'M8 3v10M3 8h10',
		sub: 'M3 8h10',
		mul: 'M4 4l8 8M12 4l-8 8',
		// The obelus: a bar between the two dots the ÷ sign itself draws.
		div: 'M3 8h10M8 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0M8 11m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
		// The % sign's own shape: a slash between two circles of unequal size.
		mod: 'M12 4L4 12M5.5 4m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M10.5 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
		clamp: 'M2 5h12M2 11h12M8 5v6',
		// A value bent on its way through: the shape is the module.
		map: 'M2 13q8 0 11-10',
		// A rectangle, because the width is the whole point of it.
		pwm: 'M2 11h3V5h4v6h3V5h2',
		// The two conversions: a note becoming a wave, and a wave becoming a note.
		tofreq: 'M3 4v7a2 2 0 1 0 2-2V4h3M11 8q1.5-3 3 0',
		topitch: 'M2 8q1.5-3 3 0M8 4v7a2 2 0 1 0 2-2V4h3',
		// A note moved up a step.
		trsp: 'M3 6v6a1.5 1.5 0 1 0 1.5-1.5V6h2.5M10 10l2-2 2 2M12 8v5'
	};

	let d = $derived(PATHS[type] ?? 'M8 8m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0');
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 16 16"
	fill="none"
	stroke={color}
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	class="shrink-0"
	aria-hidden="true"
>
	<path {d} />
</svg>
