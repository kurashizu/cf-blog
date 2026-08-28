<script lang="ts">
	import { playSound } from '../../sound';
	import { activeTrackId } from '../../stores/synth-transport';
	import { tracksState, isOverlayMode, overlayTrackIds, toggleTrackMute, toggleTrackSolo } from '../../stores/synth-tracks';

	function toggleOverlayMode() {
		const next = !$isOverlayMode;
		isOverlayMode.set(next);
		if (!next) {
			overlayTrackIds.set([$activeTrackId]);
		} else if (!$overlayTrackIds.includes($activeTrackId)) {
			overlayTrackIds.set([$activeTrackId]);
		}
		playSound('toggle');
	}

	function selectActiveTrack(trackId: number) {
		activeTrackId.set(trackId);
		if ($isOverlayMode && !$overlayTrackIds.includes(trackId)) {
			overlayTrackIds.set([...$overlayTrackIds, trackId]);
		}
		playSound('toggle');
	}

	function toggleOverlayVisibility(trackId: number) {
		if ($isOverlayMode) {
			if ($overlayTrackIds.includes(trackId)) {
				if ($overlayTrackIds.length > 1) {
					const next = $overlayTrackIds.filter((id) => id !== trackId);
					overlayTrackIds.set(next);
					if ($activeTrackId === trackId) activeTrackId.set(next[0]);
				}
			} else {
				overlayTrackIds.set([...$overlayTrackIds, trackId]);
			}
		} else {
			activeTrackId.set(trackId);
			overlayTrackIds.set([trackId]);
		}
		playSound('click');
	}
</script>

<div data-tour="synth-tracks" class="flex items-center gap-1.5 text-xs overflow-x-auto no-scrollbar ml-auto">
	<button
		onclick={toggleOverlayMode}
		class="px-2 py-0.5 border rounded-xs font-bold text-xs cursor-pointer transition-all flex items-center gap-1 shrink-0 {$isOverlayMode
			? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black shadow-[0_0_6px_rgba(86,182,194,0.5)]'
			: 'border-white/20 text-white/60 hover:text-white hover:border-white/50'}"
		title={$isOverlayMode
			? 'Multi-Track Overlay Mode: ACTIVE — Click TRKs to multi-select and layer on Piano Roll'
			: 'Multi-Track Overlay Mode: OFF — Click to enable multi-track layered view on Piano Roll'}
	>
		<span>⧉</span>
		<span>OVERLAY</span>
	</button>

	<div class="w-px h-3.5 bg-white/15 mx-0.5 shrink-0"></div>

	{#each $tracksState as trk (trk.id)}
		{@const isSelected = $isOverlayMode ? $overlayTrackIds.includes(trk.id) : $activeTrackId === trk.id}
		{@const isActiveEditingTrack = $activeTrackId === trk.id}
		<div
			class="flex items-center border rounded-xs transition-all {isSelected
				? isActiveEditingTrack
					? 'border-white bg-white/20 text-white shadow-sm ring-1 ring-white/60'
					: 'border-white/40 bg-white/10 text-white'
				: 'border-white/15 text-[#eceff4] opacity-50 hover:opacity-90'}"
		>
			<button
				type="button"
				onclick={(e) => {
					e.stopPropagation();
					selectActiveTrack(trk.id);
				}}
				class="pl-1.5 pr-0.5 py-1 flex items-center justify-center cursor-pointer group"
				title={`Set ${trk.name} as Exclusive Active Track (Controls Modules 1-7, Piano Roll Editing & Piano Keyboard Audition) — Currently ${isActiveEditingTrack ? 'ACTIVE [SOLID]' : 'INACTIVE [HOLLOW]'}`}
			>
				<span
					class="w-2.5 h-2.5 inline-block shrink-0 rounded-[1px] transition-all {isActiveEditingTrack
						? 'shadow-[0_0_6px_currentColor]'
						: 'border border-current bg-transparent opacity-60 group-hover:opacity-100 group-hover:bg-white/20'}"
					style="color: {trk.color}; background-color: {isActiveEditingTrack ? trk.color : 'transparent'}; border-color: {trk.color};"
				></span>
			</button>

			<button
				type="button"
				onclick={() => toggleOverlayVisibility(trk.id)}
				class="pl-1 pr-2 py-0.5 font-bold text-xs cursor-pointer flex items-center"
				style={isSelected ? `color: ${trk.color}` : ''}
				title={$isOverlayMode ? `${trk.name} — Click name to toggle overlay visibility. Active Editing: ${isActiveEditingTrack ? 'YES' : 'NO'}` : `Select ${trk.name}`}
			>
				<span>{trk.name.split(':')[0]}</span>
			</button>

			<div class="flex items-center border-l border-white/15 px-1 gap-0.5">
				<button
					onclick={(e) => {
						e.stopPropagation();
						toggleTrackMute(trk.id);
						playSound('click');
					}}
					class="px-1.5 py-0.2 text-xs font-bold rounded-xs cursor-pointer {trk.muted ? 'bg-red-500 text-black font-black' : 'text-white/40 hover:text-white'}"
					title={`Mute ${trk.name}`}
				>
					M
				</button>
				<button
					onclick={(e) => {
						e.stopPropagation();
						toggleTrackSolo(trk.id);
						playSound('click');
					}}
					class="px-1.5 py-0.2 text-xs font-bold rounded-xs cursor-pointer {trk.solo ? 'bg-amber-500 text-black font-black' : 'text-white/40 hover:text-white'}"
					title={`Solo ${trk.name}`}
				>
					S
				</button>
			</div>
		</div>
	{/each}

</div>
