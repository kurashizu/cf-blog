<script lang="ts">
	import { playSound } from '../../../sound';
	import { EQ_6_BANDS } from '../../../synth';
	import {
		delayTime,
		delayFeedback,
		delayMix,
		reverbMix,
		drive,
		activeFxTab,
		setDelayTime,
		setDelayFeedback,
		setDelayMix,
		setReverbMix,
		setDrive
	} from '../../../stores/synth-fx';
	import { soundState, setVolume } from '../../../stores/sound';
	import { tracksState, updateActiveTrack } from '../../../stores/synth-tracks';
	import { activeTrackId } from '../../../stores/synth-transport';
	import RotaryKnob from '../../hardware/RotaryKnob.svelte';
	import HardwareFader from '../../hardware/HardwareFader.svelte';

	// The EQ tab edits the ACTIVE track's own 6-band chain — switch TRK to shape another voice.
	let activeTrack = $derived($tracksState[$activeTrackId]);
	let trackEqOn = $derived(activeTrack?.eqOn ?? false);
	let trackEqGains = $derived(activeTrack?.eqGains ?? [0, 0, 0, 0, 0, 0]);

	function setBand(idx: number, gainDb: number) {
		const gains = [...trackEqGains];
		gains[idx] = gainDb;
		updateActiveTrack({ eqGains: gains, eqOn: true });
	}

	function setTab(tab: 'fx' | 'eq') {
		activeFxTab.set(tab);
		playSound('click');
	}
</script>

<div class="xl:col-span-2 border border-[#e06c75]/40 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[155px] shrink-0">
	<div class="flex justify-between items-center font-black text-xs border-b border-white/10 pb-0.5 shrink-0">
		<div class="flex items-center gap-1.5">
			<span class="text-[#e06c75] font-black">6. FX</span>
			<div class="flex items-center gap-1">
				<button
					onclick={() => setTab('fx')}
					class="press px-1.5 py-0.2 text-[10px] rounded-xs border font-black cursor-pointer transition-colors {$activeFxTab === 'fx'
						? 'border-[#e06c75] bg-[#e06c75] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
					title="Main FX: Tape Delay, Space Reverb & Tape Overdrive Saturation"
				>
					MAIN
				</button>
				<button
					onclick={() => setTab('eq')}
					class="press px-1.5 py-0.2 text-[10px] rounded-xs border font-black cursor-pointer transition-colors {$activeFxTab === 'eq'
						? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
					title="Per-Track 6-Band Graphic EQ — shapes the active track only"
				>
					EQ
				</button>
			</div>
		</div>
		<span class="text-white/40 flex items-center" title="Signal Flow: To Master Output & Visualizers">
			<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
		</span>
	</div>

	{#if $activeFxTab === 'fx'}
		<div class="flex-1 min-h-0 flex flex-col justify-around py-0.5 my-auto">
			<div class="grid grid-cols-6 gap-0.5 items-center">
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="TIME" value={Math.round($delayTime * 1000)} min={50} max={800} step={10} unit="ms" color="#e06c75" size={40} onChange={(v) => setDelayTime(v / 1000)} />
				</div>
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="FDBK" value={Math.round($delayFeedback * 100)} min={0} max={85} step={5} unit="%" color="#e06c75" size={40} onChange={(v) => setDelayFeedback(v / 100)} />
				</div>
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="D-MIX" value={Math.round($delayMix * 100)} min={0} max={100} step={5} unit="%" color="#e06c75" size={40} onChange={(v) => setDelayMix(v / 100)} />
				</div>
			</div>

			<div class="grid grid-cols-6 gap-0.5 items-center">
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="R-MIX" value={Math.round($reverbMix * 100)} min={0} max={100} step={5} unit="%" color="#c678dd" size={40} onChange={(v) => setReverbMix(v / 100)} />
				</div>
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="DRIVE" value={Math.round($drive * 100)} min={0} max={100} step={5} unit="%" color="#e5c07b" size={40} onChange={(v) => setDrive(v / 100)} />
				</div>
				<div class="col-span-2 flex justify-center">
					<RotaryKnob
						label="MASTER"
						value={Math.round($soundState.volume * 100)}
						min={0}
						max={100}
						step={5}
						unit="%"
						color="#e06c75"
						size={40}
						description="Master Output Volume — global gain for the whole sound engine, persisted in the browser"
						onChange={(v) => setVolume(v / 100)}
					/>
				</div>
			</div>
		</div>
	{:else}
		<div class="flex-1 min-h-0 flex flex-col justify-between py-0.5">
			<div class="flex items-center justify-between px-1 pb-0.5 border-b border-white/10 shrink-0">
				<span class="text-[10px] font-bold text-white/50">TRK {$activeTrackId + 1} · 6-BAND EQ</span>
				<button
					onclick={() => {
						updateActiveTrack({ eqOn: !trackEqOn });
						playSound('toggle');
					}}
					class="press px-2 py-0.2 text-[9px] rounded-xs border font-black cursor-pointer transition-all {trackEqOn
						? 'border-[#98c379] bg-[#98c379] text-black shadow-[0_0_6px_#98c379]'
						: 'border-white/20 bg-white/5 text-white/40 hover:text-white'}"
					title="Toggle this track's 6-band graphic EQ (per-track; saved and shared with the patch)"
				>
					EQ: {trackEqOn ? 'ON' : 'OFF'}
				</button>
			</div>

			<div class="grid grid-cols-6 gap-0.5 items-end flex-1 min-h-0 pt-0.5 px-0.5">
				{#each EQ_6_BANDS as band, idx (band.id)}
					<div class="flex flex-col items-center justify-between h-full">
						<HardwareFader label={band.label} value={trackEqGains[idx] ?? 0} min={-12} max={12} step={0.5} unit="dB" color={band.color} height={48} onChange={(v) => setBand(idx, v)} />
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
