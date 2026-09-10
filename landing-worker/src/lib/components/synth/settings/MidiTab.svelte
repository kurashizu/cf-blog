<script lang="ts">
	import { playSound } from '../../../sound';
	import { t } from '../../../i18n';
	import {
		midiDevices,
		midiDeviceTracks,
		toggleMidiDeviceTrack,
		setMidiDeviceTracks
	} from '../../../stores/synth-midi';
	import { TRACK_COUNT } from '../../../synth';

	const TRACKS = Array.from({ length: TRACK_COUNT }, (_, i) => i);

	/* An input with no entry follows the active track; one with an empty list is
	   off. Both read as "not this track" for a numbered button. */
	const plays = (bound: Record<string, number[]>, id: string, trk: number) =>
		!!bound[id]?.includes(trk);
	const isOff = (bound: Record<string, number[]>, id: string) => bound[id]?.length === 0;
	const isAuto = (bound: Record<string, number[]>, id: string) => bound[id] === undefined;
</script>

<div class="space-y-4">
	<!-- MIDI Input Device Selector -->
	<div class="border border-white/10 bg-black/40 rounded-xs p-3 space-y-3">
		<div class="flex items-center justify-between border-b border-white/10 pb-1">
			<span class="text-[#e5c07b] font-black">{$t('synthPanels.midi.deviceTitle')}</span>
			<span class="text-white/40 text-[10px]">{$t('synthPanels.midi.deviceSelector')}</span>
		</div>

		<div class="space-y-2 pt-1">
			{#if $midiDevices.length > 0}
				<!-- Each input picks the tracks it plays, several at once if you want
				     them layered under one key. One keyboard is often listed twice (USB
				     and Bluetooth for the same instrument), which voiced every key press
				     on the same track and sounded like a flam; switching the spare entry
				     OFF fixes that, and two real keyboards can play two tracks.

				     ACTIVE and the numbers are alternatives, not additions -- following
				     the selected track and naming a fixed set are different answers to
				     the same question -- so ACTIVE is set apart by a gap and its own
				     colour. OFF sits up beside the device name, being a state of the
				     input itself rather than one more track to pick. -->
				<div class="space-y-2 mt-2">
					{#each $midiDevices as dev (dev.id)}
						{@const off = isOff($midiDeviceTracks, dev.id)}
						<div class="p-2 border border-white/10 bg-white/5 rounded-xs space-y-1.5">
							<div class="flex items-center gap-2">
								<div class="font-bold truncate text-white/80 {off ? 'opacity-40' : ''}">
									{dev.name}
								</div>
								<button
									onclick={() => {
										setMidiDeviceTracks(dev.id, off ? null : []);
										playSound('click');
									}}
									class="press ml-auto shrink-0 px-1.5 py-0.5 border rounded-xs text-[9px] cursor-pointer {off
										? 'border-[#e06c75] bg-[#e06c75] text-black font-black'
										: 'border-white/10 text-white/50 hover:text-white'}"
									>{$t('synthPanels.midi.deviceOff')}</button
								>
							</div>
							<div class="flex items-center justify-end gap-1 {off ? 'opacity-40' : ''}">
								<span class="text-[9px] text-white/40 mr-auto"
									>{$t('synthPanels.midi.playsTrack')}</span
								>
								<button
									onclick={() => {
										setMidiDeviceTracks(dev.id, null);
										playSound('click');
									}}
									class="press px-1.5 py-0.5 border rounded-xs text-[9px] cursor-pointer mr-2 {isAuto(
										$midiDeviceTracks,
										dev.id
									)
										? 'border-[#61afef] bg-[#61afef] text-black font-black'
										: 'border-white/10 text-white/50 hover:text-white'}"
									>{$t('synthPanels.midi.followsActive')}</button
								>
								{#each TRACKS as trk (trk)}
									<button
										onclick={() => {
											toggleMidiDeviceTrack(dev.id, trk);
											playSound('click');
										}}
										class="press w-5 py-0.5 border rounded-xs text-[9px] text-center cursor-pointer {plays(
											$midiDeviceTracks,
											dev.id,
											trk
										)
											? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black'
											: 'border-white/10 text-white/50 hover:text-white'}">{trk + 1}</button
									>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="p-3 border border-white/5 bg-black/20 rounded-xs text-white/40 text-[11px]">
					{$t('synthPanels.midi.noDevicesHint')}
				</div>
			{/if}
		</div>
	</div>
</div>
