<script lang="ts">
	/**
	 * A clip in the transcript, drawn in the site's own idiom.
	 *
	 * The browser's default `<audio controls>` is a rounded pill that carries its
	 * own typography and colours and ignores the theme entirely, which looked
	 * pasted-in against everything else on the page. This is the same three
	 * controls — play, position, duration — as monospace and hairline rules.
	 */
	let { src, name }: { src: string; name: string } = $props();

	let el: HTMLAudioElement | undefined = $state();
	let playing = $state(false);
	let current = $state(0);
	let total = $state(0);

	/** mm:ss, which is all a voice note ever needs. */
	function clock(sec: number): string {
		if (!isFinite(sec) || sec < 0) sec = 0;
		const m = Math.floor(sec / 60);
		const s = Math.floor(sec % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function toggle() {
		if (!el) return;
		if (el.paused) void el.play();
		else el.pause();
	}

	/** Clicking the bar seeks, which is the one gesture the default gave us. */
	function seek(e: MouseEvent) {
		if (!el || !total) return;
		const bar = e.currentTarget as HTMLElement;
		const rect = bar.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		el.currentTime = ratio * total;
	}

	let pct = $derived(total ? Math.min(100, (current / total) * 100) : 0);
</script>

<div
	class="flex items-center gap-2 border border-[#61afef]/25 bg-black/30 rounded-md px-2 py-1.5 font-mono text-[11px] min-w-56"
	title={name}
>
	<!-- The element itself stays out of the layout; this markup is the interface. -->
	<audio
		bind:this={el}
		{src}
		preload="metadata"
		onplay={() => (playing = true)}
		onpause={() => (playing = false)}
		onended={() => (playing = false)}
		ontimeupdate={() => (current = el?.currentTime ?? 0)}
		onloadedmetadata={() => {
			// A MediaRecorder blob can report Infinity until it has been seeked.
			const d = el?.duration ?? 0;
			total = isFinite(d) ? d : 0;
		}}
		ondurationchange={() => {
			const d = el?.duration ?? 0;
			if (isFinite(d)) total = d;
		}}
		class="hidden"
	></audio>

	<button
		onclick={toggle}
		aria-label={playing ? 'Pause' : 'Play'}
		class="text-[#61afef] hover:text-white cursor-pointer shrink-0 w-3 text-center"
	>
		{playing ? '❚❚' : '▶'}
	</button>

	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div onclick={seek} class="flex-1 h-1 bg-white/10 rounded-full cursor-pointer overflow-hidden">
		<div class="h-full bg-[#61afef]/70" style="width: {pct}%"></div>
	</div>

	<span class="text-white/40 tabular-nums shrink-0">
		{clock(current)}/{clock(total)}
	</span>
</div>
