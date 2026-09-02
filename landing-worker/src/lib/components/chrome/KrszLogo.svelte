<script lang="ts">
	/**
	 * The site mark, same artwork as static/favicon.svg: K / R / S / Z in
	 * Unbounded Black, one per quadrant, each in its fixed brand color
	 * (stores/theme.ts's KRSZ_LETTER_COLORS). The letters overlap and a keyline
	 * in the site's darkest tone separates them (paint-order: stroke), so they
	 * read as four interlocking plates rather than four floating glyphs. No
	 * background: the mark sits directly on whatever surface hosts it. The
	 * glyphs are baked to paths so the mark never depends on a webfont.
	 *
	 * Inlined rather than an <img> so it inherits the page's rendering and
	 * costs no extra request.
	 */
	let { size = 16, title = 'krsz.in' }: { size?: number; title?: string } = $props();
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
	<g stroke="#0b0e14" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke">
		<path fill="#56b6c2" d="M1.16 16.9V1.9H6.28V12.88L4.98 11.78L12.44 1.9H17.84L5.84 16.9ZM8.36 10 12.16 7.02 18.04 16.9H12.2Z" />
		<path fill="#e5c07b" d="M18.16 8.32H23.2Q23.96 8.32 24.38 7.96Q24.8 7.6 24.8 6.92Q24.8 6.24 24.38 5.88Q23.96 5.52 23.2 5.52H17.44L19.76 3.2V16.9H14.6V1.9H24Q25.8 1.9 27.15 2.53Q28.5 3.16 29.25 4.28Q30 5.4 30 6.92Q30 8.4 29.25 9.53Q28.5 10.66 27.15 11.28Q25.8 11.9 24 11.9H18.16ZM19.92 9.88H25.62L30.6 16.9H24.7Z" />
		<path fill="#c678dd" d="M1.56 25.36H6.8Q6.88 25.8 7.26 26.11Q7.64 26.42 8.3 26.59Q8.96 26.76 9.88 26.76Q11.08 26.76 11.75 26.52Q12.42 26.28 12.42 25.74Q12.42 25.38 12.04 25.13Q11.66 24.88 10.48 24.8L8 24.64Q4.62 24.42 3.12 23.2Q1.62 21.98 1.62 19.98Q1.62 18.3 2.58 17.18Q3.54 16.06 5.27 15.5Q7 14.94 9.32 14.94Q11.58 14.94 13.33 15.57Q15.08 16.2 16.11 17.34Q17.14 18.48 17.24 20H12Q11.94 19.64 11.61 19.38Q11.28 19.12 10.68 18.98Q10.08 18.84 9.22 18.84Q8.12 18.84 7.49 19.06Q6.86 19.28 6.86 19.78Q6.86 20.12 7.23 20.36Q7.6 20.6 8.66 20.68L11.46 20.86Q13.66 21 15.02 21.51Q16.38 22.02 17.01 22.92Q17.64 23.82 17.64 25.14Q17.64 26.8 16.66 28.04Q15.68 29.28 13.91 29.97Q12.14 30.66 9.78 30.66Q7.34 30.66 5.5 30Q3.66 29.34 2.63 28.14Q1.6 26.94 1.56 25.36Z" />
		<path fill="#98c379" d="M15.16 30.3V26.64L24.14 18.34L28.02 19.24H15.22V15.28H29.98V18.94L21.02 27.24L17.7 26.34H30.04V30.3Z" />
	</g>
</svg>
