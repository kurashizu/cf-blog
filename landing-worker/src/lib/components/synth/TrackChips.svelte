<script lang="ts">
	import { t } from '$lib/i18n';
	import { playSound } from '../../sound';
	import { activeTrackId } from '../../stores/synth-transport';
	import { tracksState, isOverlayMode, overlayTrackIds, toggleTrackMute, toggleTrackSolo } from '../../stores/synth-tracks';
	import { Button } from '$lib/components/ui';

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
	<Button
		variant="outline"
		color="#56b6c2"
		active={$isOverlayMode}
		sound="toggle"
		onclick={toggleOverlayMode}
		class="flex items-center gap-1 shrink-0"
		title={$isOverlayMode
			? $t('synth.tracks.overlayOnHint')
			: $t('synth.tracks.overlayOffHint')}
	>
		<span aria-hidden="true">⧉</span>
		<span>OVERLAY</span>
	</Button>

	<div class="w-px h-3.5 bg-white/15 mx-0.5 shrink-0"></div>
	<!-- One label for the row; the chips carry only the number, so eight of them still fit. -->
	<span class="text-white/50 font-bold text-xs shrink-0 select-none" title={$t('synth.tracks.trkLabelHint')}>TRK:</span>

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
				class="press min-w-[24px] min-h-[24px] pl-1.5 pr-0.5 py-1 flex items-center justify-center cursor-pointer group"
				aria-label={$t('synth.tracks.setActiveHint', { name: trk.name, state: isActiveEditingTrack ? $t('synth.tracks.activeSolid') : $t('synth.tracks.inactiveHollow') })}
				title={$t('synth.tracks.setActiveHint', { name: trk.name, state: isActiveEditingTrack ? $t('synth.tracks.activeSolid') : $t('synth.tracks.inactiveHollow') })}
			>
				<span
					class="w-2.5 h-2.5 inline-block shrink-0 rounded-[1px] transition-all {isActiveEditingTrack
						? 'shadow-[0_0_6px_currentColor]'
						: 'border border-current bg-transparent opacity-60 group-hover:opacity-100 group-hover:bg-white/20'}"
					style="color: {trk.color}; background-color: {isActiveEditingTrack ? trk.color : 'transparent'}; border-color: {trk.color};"
					aria-hidden="true"
				></span>
			</button>

			<button
				type="button"
				onclick={() => toggleOverlayVisibility(trk.id)}
				class="press min-w-[24px] min-h-[24px] pl-1 pr-2 py-0.5 font-bold text-xs cursor-pointer flex items-center justify-center transition-colors"
				style={isSelected ? `color: ${trk.color}` : ''}
				aria-label={$isOverlayMode ? $t('synth.tracks.overlayToggleHint', { name: trk.name, state: isActiveEditingTrack ? $t('common.yes') : $t('common.no') }) : $t('synth.tracks.selectHint', { name: trk.name })}
				title={$isOverlayMode ? $t('synth.tracks.overlayToggleHint', { name: trk.name, state: isActiveEditingTrack ? $t('common.yes') : $t('common.no') }) : $t('synth.tracks.selectHint', { name: trk.name })}
			>
				<span class="font-mono" aria-hidden="true">{trk.id + 1}</span>
			</button>

			<div class="flex items-center border-l border-white/15 px-1 gap-0.5">
				<button
					onclick={(e) => {
						e.stopPropagation();
						toggleTrackMute(trk.id);
						playSound('click');
					}}
					class="press min-w-[24px] min-h-[24px] px-1.5 py-0.2 text-xs font-bold rounded-xs cursor-pointer transition-colors flex items-center justify-center {trk.muted ? 'bg-red-500 text-black font-black' : 'text-white/60 hover:text-white'}"
					aria-pressed={trk.muted}
					aria-label={$t('synth.tracks.muteHint', { name: trk.name })}
					title={$t('synth.tracks.muteHint', { name: trk.name })}
				>
					<span aria-hidden="true">M</span>
				</button>
				<button
					onclick={(e) => {
						e.stopPropagation();
						toggleTrackSolo(trk.id);
						playSound('click');
					}}
					class="press min-w-[24px] min-h-[24px] px-1.5 py-0.2 text-xs font-bold rounded-xs cursor-pointer transition-colors flex items-center justify-center {trk.solo ? 'bg-amber-500 text-black font-black' : 'text-white/60 hover:text-white'}"
					aria-pressed={trk.solo}
					aria-label={$t('synth.tracks.soloHint', { name: trk.name })}
					title={$t('synth.tracks.soloHint', { name: trk.name })}
				>
					<span aria-hidden="true">S</span>
				</button>
			</div>
		</div>
	{/each}

</div>
