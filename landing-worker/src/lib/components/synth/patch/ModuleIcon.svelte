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
		sub: 'M1 6q3.5-5 7 0t7 0M1 12h14',
		pulse: 'M1 12V4h5v8h5V4h4',
		bow: 'M2 13L14 3M3 4l10 9',
		// SHAPE
		filter: 'M1 4h7q4 0 5 8',
		vca: 'M2 13L14 3v10z',
		drive: 'M1 8q2-6 4 0t4 0 4-6',
		eq: 'M3 13V6M8 13V3M13 13V9M1 6h4M6 3h4M11 9h4',
		blend: 'M1 4h6q3 0 3 4t3 4h2M1 12h6',
		reed: 'M2 8h4q2 0 3-4 1 8 3 4h2',
		comp: 'M1 3h5l3 5 3 5h3M1 13h14',
		// RESONATE
		string: 'M1 8q4-5 7 0t6 0M1 8h1M14 8h1',
		tube: 'M2 4h12M2 12h12M2 4v8M14 4v8M6 8h4',
		modes: 'M3 13V5M8 13V2M13 13V7M3 5l5-3 5 5',
		body: 'M8 2q5 2 5 6t-5 6q-5-2-5-6t5-6M8 6v4',
		comb: 'M1 13V3M4 13V6M7 13V3M10 13V6M13 13V3',
		space: 'M8 8m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M8 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
		// MODULATE
		env: 'M1 13L5 3l3 6v4M8 9h3l3 4',
		lfo: 'M1 8q2-5 4 0t4 0 4-5',
		// UTILITY
		delay: 'M2 4v8M6 5v6M10 7v2M14 8v0M2 8h12',
		pan: 'M8 13V6M8 6L3 3M8 6l5-3M1 13h4M11 13h4',
		sum: 'M8 3v10M3 8h10',
		diff: 'M3 8h10',
		ring: 'M8 8m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M4 4l8 8M12 4l-8 8',
		invert: 'M2 5h5q3 0 3 3t3 3h1M2 11h5',
		mix: 'M2 4h4l4 4 4 4M2 12h4l4-4',
		out: 'M4 8h9M10 5l3 3-3 3M2 3v10',
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
		// LOGIC: the execution chain.
		seq: 'M2 8h4M6 5l3 3-3 3M10 8h4M12 4v8',
		when: 'M8 2l6 6-6 6-6-6z',
		act: 'M4 2v12l9-6z',
		// MATH: the operator, or the shape of what it does to a value.
		const: 'M4 4h8M8 4v9M5 13h6',
		add: 'M8 3v10M3 8h10',
		mul: 'M4 4l8 8M12 4l-8 8',
		remap: 'M2 12h5M9 4h5M2 12l7-8',
		clamp: 'M2 5h12M2 11h12M8 5v6',
		lerp: 'M2 12L14 4M2 12h2M12 4h2M7 8h2',
		curve: 'M2 13q8 0 11-10',
		// The two conversions: a note becoming a wave, and a wave becoming a note.
		tofreq: 'M3 4v7a2 2 0 1 0 2-2V4h3M11 8q1.5-3 3 0',
		topitch: 'M2 8q1.5-3 3 0M8 4v7a2 2 0 1 0 2-2V4h3'
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
