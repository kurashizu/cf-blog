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

	/*
	 * The native `loop` attribute hands the restart to the browser: on end it
	 * fires `ended`, resets `currentTime` to 0, and calls `play()` again --
	 * a full stop/reset/restart of the decode pipeline. For a 1280x720 AV1
	 * stream (one of the more expensive formats to decode, especially without
	 * hardware support) that round trip is slow enough to show up as a stall
	 * right at the loop point, on top of whatever the footage itself is doing.
	 *
	 * Driving the loop by hand sidesteps that: `timeupdate` fires many times a
	 * second, and jumping `currentTime` back near zero a little before the
	 * real end keeps the same decode session running instead of tearing it
	 * down and rebuilding it. The video never actually reaches its `ended`
	 * state, so the expensive reset never happens.
	 */
	const LOOP_EPSILON = 0.12;

	function manualLoop(node: HTMLVideoElement) {
		node.loop = false;
		const onTimeUpdate = () => {
			const d = node.duration;
			if (!isFinite(d) || d <= 0) return;
			if (node.currentTime >= d - LOOP_EPSILON) {
				node.currentTime = 0.001;
			}
		};
		node.addEventListener('timeupdate', onTimeUpdate);
		return {
			destroy() {
				node.removeEventListener('timeupdate', onTimeUpdate);
			}
		};
	}
</script>

{#if !reducedMotion}
	<div class="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
		<video
			class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out"
			style="opacity: {showB ? 0 : 1}"
			src={THEME_VIDEO[slotA]}
			use:manualLoop
			autoplay
			muted
			playsinline
			disablepictureinpicture
		></video>
		{#if slotB}
			<video
				class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out"
				style="opacity: {showB ? 1 : 0}"
				src={THEME_VIDEO[slotB]}
				use:manualLoop
				autoplay
				muted
				playsinline
				disablepictureinpicture
			></video>
		{/if}
		<!-- Darkens and evens out the footage so panel text sitting on cardBgVideo
		     keeps its contrast regardless of which moment of the loop is showing.
		     Kept heavy on purpose -- this is a backdrop, not a focal point. Panel
		     opacity (theme.ts) is a separate knob and stays where it was;
		     dimming the video itself is what actually mutes it without also
		     flattening panel surfaces that have nothing to do with the video.
		     Inline style, not an arbitrary-value class: Tailwind only ever
		     generated the handful of bg-black/NN opacities already used
		     elsewhere in the codebase (20/25/30/40/50/55/60/70/80/85/90/95) --
		     any other number silently compiles to nothing, so the overlay was
		     briefly fully transparent at /91 with no visible error anywhere. -->
		<div class="absolute inset-0" style="background-color: rgba(0, 0, 0, 0.91)"></div>
	</div>
{/if}
