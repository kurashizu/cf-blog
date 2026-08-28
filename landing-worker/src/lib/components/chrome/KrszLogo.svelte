<script lang="ts">
	/**
	 * The site mark, same artwork as static/favicon.svg: a terminal badge with a
	 * geometric K. Inlined rather than an <img> so it inherits the page's
	 * rendering and costs no extra request.
	 */
	let { size = 16, title = 'krsz.in' }: { size?: number; title?: string } = $props();

	/** The header dots are sub-pixel below this and only muddy the glyph. */
	let detailed = $derived(size >= 22);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 32 32"
	role="img"
	aria-label={title}
	class="shrink-0 block"
>
	<title>{title}</title>
	<defs>
		<linearGradient id="krsz-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
			<stop offset="0%" stop-color="#88c0d0" />
			<stop offset="100%" stop-color="#56b6c2" />
		</linearGradient>
		<linearGradient id="krsz-amber" x1="0%" y1="0%" x2="100%" y2="100%">
			<stop offset="0%" stop-color="#ffd166" />
			<stop offset="100%" stop-color="#e5c07b" />
		</linearGradient>
	</defs>

	<rect x="1" y="1" width="30" height="30" rx="7" fill="#0f1218" stroke="#3b4252" stroke-width="1.5" />

	{#if detailed}
		<rect x="5" y="5" width="22" height="2.5" rx="1" fill="#1e222a" />
		<circle cx="7.5" cy="6.25" r="0.9" fill="#e06c75" />
		<circle cx="10.5" cy="6.25" r="0.9" fill="#e5c07b" />
		<circle cx="13.5" cy="6.25" r="0.9" fill="#98c379" />
	{/if}

	<!-- K: stem, upper branch, lower branch -->
	<rect x="6" y="10.5" width="4.5" height="15" rx="1" fill="url(#krsz-cyan)" />
	<path d="M10.5 18 L18.5 10.5 L23 10.5 L13.5 19.5 Z" fill="url(#krsz-amber)" />
	<path d="M11 18 L19 25.5 L23.5 25.5 L14.5 17 Z" fill="#98c379" />

	<!-- Block cursor -->
	<rect x="20.5" y="22" width="5.5" height="3.5" rx="0.8" fill="#56b6c2" />
</svg>
