<script lang="ts">
	import { resolvedTheme, THEME_VIDEO, type FixedTheme } from '../../stores/theme';

	/*
	 * Two stacked <video> elements rather than one whose src is swapped: a src
	 * swap restarts decoding from a black frame, which reads as a flash every
	 * time the theme changes (hourly under auto, or on every press of T). Two
	 * layers let the incoming theme fade in over the outgoing one instead.
	 *
	 * prefers-reduced-motion gets no video at all -- an 8-second looping
	 * background is exactly the kind of motion that setting exists to suppress
	 * -- and the theme's own solid color (already painted on :root, see the
	 * root layout) is a fine backdrop on its own.
	 */
	let reducedMotion = $state(false);
	$effect(() => {
		const mq = matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = mq.matches;
		const onChange = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	let slotA = $state<FixedTheme>($resolvedTheme);
	let slotB = $state<FixedTheme | null>(null);
	let showB = $state(false);

	$effect(() => {
		const next = $resolvedTheme;
		const current = showB ? slotB : slotA;
		if (next === current) return;
		if (showB) {
			slotA = next;
			showB = false;
		} else {
			slotB = next;
			showB = true;
		}
	});
</script>

{#if !reducedMotion}
	<div class="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
		<video
			class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out"
			style="opacity: {showB ? 0 : 1}"
			src={THEME_VIDEO[slotA]}
			autoplay
			muted
			loop
			playsinline
			disablepictureinpicture
		></video>
		{#if slotB}
			<video
				class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out"
				style="opacity: {showB ? 1 : 0}"
				src={THEME_VIDEO[slotB]}
				autoplay
				muted
				loop
				playsinline
				disablepictureinpicture
			></video>
		{/if}
		<!-- Darkens and evens out the footage so panel text sitting on cardBgVideo
		     keeps its contrast regardless of which moment of the loop is showing.
		     Kept heavy on purpose -- this is a backdrop, not a focal point. Panel
		     opacity (theme.ts) is a separate knob and stays where it was;
		     dimming the video itself is what actually mutes it without also
		     flattening panel surfaces that have nothing to do with the video. -->
		<div class="absolute inset-0 bg-black/88"></div>
	</div>
{/if}
