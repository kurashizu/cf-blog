<script lang="ts">
	import { untrack } from 'svelte';
	import { resolvedTheme, THEME_VIDEO, type FixedTheme } from '../../stores/theme';
	import { performanceMode } from '../../stores/performance';
	import { audioContextRunning } from '../../sound';

	/*
	 * Safari + a running AudioContext + this muted video = 2-3 fps site-wide.
	 * A Web Inspector recording of krsz.in (Sep 2026) showed it plainly: the
	 * moment the synth's audio engine started, every frame's *composite* step
	 * went to 300-500 ms while the main thread sat at 5-13 % CPU, and the
	 * video toggled its "power-efficient playback" state 107 times in 21 s --
	 * Safari kept bouncing the clip between the hardware overlay path and a
	 * software path it has to read back and blend under the backdrop-filter
	 * panels. It stayed that way on every view until the page was reloaded.
	 * So on Safari the visible layer is frozen on its current frame (paused)
	 * while the context is running, and resumes when the engine suspends.
	 */
	const isSafari =
		typeof navigator !== 'undefined' && /safari/i.test(navigator.userAgent) && !/chrome|chromium|crios|fxios|android|edg/i.test(navigator.userAgent);
	let holdVideo = $derived(isSafari && $audioContextRunning);

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

	/*
	 * Client-only: the server can't know the visitor's resolved theme (auto
	 * follows the clock), so any src it rendered would just be re-fetched and
	 * restarted on hydration -- one wasted download and a visible restart.
	 */
	let mounted = $state(false);
	$effect(() => {
		mounted = true;
	});

	const FADE_MS = 700;

	let slotA = $state<FixedTheme>($resolvedTheme);
	let slotB = $state<FixedTheme | null>(null);
	let showB = $state(false);
	let videoA = $state<HTMLVideoElement | undefined>();
	let videoB = $state<HTMLVideoElement | undefined>();

	/*
	 * A theme change only *loads* the new clip into whichever layer is hidden.
	 * The fade to it waits for `onReady` -- i.e. until that layer has decoded a
	 * frame -- otherwise the crossfade starts against a still-black element.
	 * Unless the hidden layer already holds that clip (cycling back to a theme
	 * we just left, or auto returning to one from earlier in the day): then
	 * the src doesn't change, no `loadeddata` will ever come, and the fade
	 * has to be started right here.
	 */
	$effect(() => {
		const next = $resolvedTheme;
		untrack(() => {
			const visible = showB ? slotB : slotA;
			if (next === visible) return;
			const hiddenTheme = showB ? slotA : slotB;
			if (hiddenTheme === next) reveal(showB ? 'A' : 'B');
			else if (showB) slotA = next;
			else slotB = next;
		});
	});

	function play(v: HTMLVideoElement | undefined) {
		if (holdVideo) return;
		if (v && v.paused) void v.play().catch(() => {});
	}

	$effect(() => {
		const v = showB ? videoB : videoA;
		if (holdVideo) v?.pause();
		else play(v);
	});

	let fadeGen = 0;

	function reveal(slot: 'A' | 'B') {
		showB = slot === 'B';
		play(slot === 'A' ? videoA : videoB);
		// Once the outgoing layer has faded out, stop its decoder. A second AV1
		// stream running invisibly forever is real CPU for nothing. Generation
		// check so a quick flip back doesn't pause the layer that is now visible.
		const gen = ++fadeGen;
		setTimeout(() => {
			if (gen !== fadeGen) return;
			(showB ? videoA : videoB)?.pause();
		}, FADE_MS + 50);
	}

	function onReady(slot: 'A' | 'B') {
		const hidden = slot === 'A' ? showB : !showB;
		if (!hidden) return;
		const loaded = slot === 'A' ? slotA : slotB;
		if (loaded !== $resolvedTheme) {
			// Theme moved on while this was loading; don't leave it decoding for nothing.
			(slot === 'A' ? videoA : videoB)?.pause();
			return;
		}
		reveal(slot);
	}

	/*
	 * Browsers pause background video on their own: tab hidden, OS power
	 * saving, or autoplay refused at load. Nothing restarts it unless we do,
	 * so resume the visible layer when the tab comes back and on the first
	 * gesture (which is also what unlocks a blocked autoplay).
	 */
	$effect(() => {
		const resume = () => play(showB ? videoB : videoA);
		const onVisibility = () => {
			if (document.visibilityState === 'visible') resume();
		};
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pointerdown', resume, { passive: true });
		window.addEventListener('keydown', resume);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('pointerdown', resume);
			window.removeEventListener('keydown', resume);
		};
	});

	/*
	 * Looping. The native `loop` attribute restarts through a full
	 * stop/reset/play of the decode pipeline, which for 720p AV1 shows up as a
	 * stall right at the loop point. Seeking back to the start a few frames
	 * *before* the end keeps the same decode session alive instead.
	 *
	 * The seek is timed off requestVideoFrameCallback (per presented frame,
	 * ~42ms at 24fps) rather than `timeupdate`, which Chrome only fires every
	 * ~250ms -- with a 0.12s window that missed the end about half the time,
	 * and with `loop` switched off the video then simply ended and froze on
	 * its last frame. `loop` now stays on as the fallback for the cases where
	 * the frame callback can't keep up (throttled background tab), and
	 * `ended` is handled too in case a browser gets there anyway.
	 */
	const LOOP_EPSILON = 0.15;
	/* If currentTime hasn't moved forward by this much within this many
	   frame-callbacks, the video is stuck -- decoder stall, a seek that
	   never resolved, anything -- and nothing else here will ever notice,
	   since every check above assumes currentTime keeps advancing normally.
	   ~1s of frames at 24fps with slack for a throttled tab. */
	const STALL_CHECK_FRAMES = 40;
	const STALL_EPSILON = 0.01;

	function seamlessLoop(node: HTMLVideoElement) {
		node.loop = true;
		const rvfc = typeof node.requestVideoFrameCallback === 'function';
		let handle = 0;
		// Set right after issuing the loop-seek and cleared once currentTime
		// is actually seen back near zero: without this, a seek that has not
		// visibly landed yet (currentTime still reads near the end, `seeking`
		// not yet true -- both observed to lag the call by more than one
		// frame-callback on a single-keyframe AV1 stream) gets re-issued on
		// every subsequent tick, and stacking seeks like that is what left
		// the clip frozen mid-loop rather than at the boundary this was
		// already guarding.
		let loopPending = false;
		let lastTime = -1;
		let stallCounter = 0;

		const check = () => {
			const d = node.duration;
			const t = node.currentTime;
			if (loopPending) {
				if (t < LOOP_EPSILON) loopPending = false;
			} else if (isFinite(d) && d > 0 && !node.seeking && t >= d - LOOP_EPSILON) {
				loopPending = true;
				node.currentTime = 0.001;
			}

			// Stall watchdog: only meaningful once playing and not mid-seek,
			// otherwise a legitimately paused/seeking frame reads as stuck.
			if (!node.paused && !node.seeking && !loopPending) {
				if (Math.abs(t - lastTime) < STALL_EPSILON) {
					stallCounter++;
					if (stallCounter >= STALL_CHECK_FRAMES) {
						stallCounter = 0;
						// Nudge the decoder: a tiny seek forces it to re-render
						// from wherever it actually is, and play() covers the
						// case where playback silently paused itself.
						node.currentTime = Math.min(t + 0.03, isFinite(d) ? d - 0.05 : t);
						play(node);
					}
				} else {
					stallCounter = 0;
				}
			} else {
				stallCounter = 0;
			}
			lastTime = t;
			schedule();
		};
		const schedule = () => {
			handle = rvfc ? node.requestVideoFrameCallback(check) : requestAnimationFrame(check);
		};
		schedule();

		const onEnded = () => {
			node.currentTime = 0.001;
			play(node);
		};
		node.addEventListener('ended', onEnded);

		return {
			destroy() {
				if (rvfc) node.cancelVideoFrameCallback(handle);
				else cancelAnimationFrame(handle);
				node.removeEventListener('ended', onEnded);
			}
		};
	}
</script>

{#if mounted && !reducedMotion && !$performanceMode}
	<div class="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
		<video
			bind:this={videoA}
			class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out"
			style="opacity: {showB ? 0 : 1}"
			src={THEME_VIDEO[slotA]}
			onloadeddata={() => onReady('A')}
			use:seamlessLoop
			autoplay
			muted
			playsinline
			preload="auto"
			disablepictureinpicture
		></video>
		{#if slotB}
			<video
				bind:this={videoB}
				class="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out"
				style="opacity: {showB ? 1 : 0}"
				src={THEME_VIDEO[slotB]}
				onloadeddata={() => onReady('B')}
				use:seamlessLoop
				autoplay
				muted
				playsinline
				preload="auto"
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
		<div class="absolute inset-0" style="background-color: rgba(0, 0, 0, 0.86)"></div>
	</div>
{/if}
