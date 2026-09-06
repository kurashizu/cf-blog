<script lang="ts">
	import { playSound } from '../../../sound';
	import { resetRack6 } from '../../../stores/synth-reset';
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
	import { tracksState, updateActiveTrack, noteNameOf } from '../../../stores/synth-tracks';
	import { activeTrackId, totalPatternSteps } from '../../../stores/synth-transport';
	import { allRuns } from '../../../stores/synth-edit';
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

	function setTab(tab: 'fx' | 'eq' | 'duck') {
		activeFxTab.set(tab);
		playSound('click');
	}

	/* DUCK tab: sidechain for the active track. SRC steps through the other
	   tracks, KEY through the notes the source actually plays (a percussion
	   track's kick / snare / hat) plus ANY. Steppers, like OCT and METER, not
	   native selects. */
	let duckSource = $derived(activeTrack?.duckSource ?? -1);
	let duckKey = $derived(activeTrack?.duckKey ?? -1);
	let duckOn = $derived(duckSource >= 0 && (activeTrack?.duckDepth ?? 0) > 0);
	let sourceIds = $derived($tracksState.filter((t) => t.id !== $activeTrackId).map((t) => t.id));
	let keyOptions = $derived.by(() => {
		const src = $tracksState[duckSource];
		if (!src) return [] as number[];
		const notes = new Set<number>();
		for (const r of allRuns(src.grid, $totalPatternSteps)) notes.add(r.note);
		if (duckKey >= 0) notes.add(duckKey);
		return [...notes].sort((a, b) => a - b);
	});
	let sourceLabel = $derived(duckSource < 0 ? 'OFF' : `T${duckSource + 1} ${($tracksState[duckSource]?.name ?? '').replace(/^TRK \d+:\s*/, '')}`);

	function stepSource(dir: number) {
		const list = [-1, ...sourceIds];
		const i = list.indexOf(duckSource);
		const next = list[(Math.max(0, i) + dir + list.length) % list.length];
		// Picking a source with the depth still at zero would do nothing audible.
		const depth = (activeTrack?.duckDepth ?? 0) > 0 || next < 0 ? {} : { duckDepth: 0.6 };
		updateActiveTrack({ duckSource: next, duckKey: -1, ...depth });
		playSound('click');
	}

	function stepKey(dir: number) {
		const list = [-1, ...keyOptions];
		const i = list.indexOf(duckKey);
		updateActiveTrack({ duckKey: list[(Math.max(0, i) + dir + list.length) % list.length] });
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
				<button
					onclick={() => setTab('duck')}
					class="press px-1.5 py-0.2 text-[10px] rounded-xs border font-black cursor-pointer transition-colors {$activeFxTab === 'duck'
						? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black'
						: duckOn
							? 'border-[#e5c07b]/60 text-[#e5c07b] hover:text-white'
							: 'border-white/20 text-white/60 hover:text-white'}"
					title="Sidechain ducking — the active track dips every time the SRC track (or one KEY of it) plays, so a drum cuts through for the instant it lasts"
				>
					DUCK
				</button>
			</div>
		</div>
		<div class="flex items-center gap-1.5">
			<span class="text-white/40 flex items-center" title="Signal Flow: To Master Output & Visualizers">
				<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
			</span>
			<button onclick={resetRack6} title="RST — reset: put this rack at its neutral values, where it does nothing to the sound" class="press px-1 py-0.2 text-[9px] rounded-xs font-mono font-bold cursor-pointer transition-colors border border-white/20 text-white/40 hover:text-white hover:border-white/60">RST</button>
		</div>
	</div>

	{#if $activeFxTab === 'fx'}
		<div class="flex-1 min-h-0 flex flex-col justify-around py-0.5 my-auto">
			<div class="grid grid-cols-6 gap-0.5 items-center">
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="TIME" value={Math.round($delayTime * 1000)} min={50} max={800} step={10} unit="ms" color="#e06c75" size={40} reset={300} onChange={(v) => setDelayTime(v / 1000)} />
				</div>
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="FDBK" value={Math.round($delayFeedback * 100)} min={0} max={85} step={5} unit="%" color="#e06c75" size={40} reset={0} onChange={(v) => setDelayFeedback(v / 100)} />
				</div>
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="D-MIX" value={Math.round($delayMix * 100)} min={0} max={100} step={5} unit="%" color="#e06c75" size={40} reset={0} onChange={(v) => setDelayMix(v / 100)} />
				</div>
			</div>

			<div class="grid grid-cols-6 gap-0.5 items-center">
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="R-MIX" value={Math.round($reverbMix * 100)} min={0} max={100} step={5} unit="%" color="#c678dd" size={40} reset={0} onChange={(v) => setReverbMix(v / 100)} />
				</div>
				<div class="col-span-2 flex justify-center">
					<RotaryKnob label="DRIVE" value={Math.round($drive * 100)} min={0} max={100} step={5} unit="%" color="#e5c07b" size={40} reset={0} onChange={(v) => setDrive(v / 100)} />
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
						reset={100}
						onChange={(v) => setVolume(v / 100)}
					/>
				</div>
			</div>
		</div>
	{:else if $activeFxTab === 'duck'}
		<div class="flex-1 min-h-0 flex flex-col justify-between py-0.5 gap-0.5">
			<!-- Two steppers, OCT-style, then the envelope of the dip -->
			<div class="flex items-center gap-1 px-0.5 shrink-0" title="SRC — the track whose notes trigger the dip">
				<span class="text-white/50 text-[10px] font-bold w-7 shrink-0">SRC</span>
				<button onclick={() => stepSource(-1)} class="press px-1.5 py-0.5 border border-white/20 rounded-xs font-bold hover:border-white/50 cursor-pointer text-[10px] leading-none transition-colors" title="Previous source track">◄</button>
				<span class="flex-1 min-w-0 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-white/10 rounded-xs text-center truncate leading-none {duckSource < 0 ? 'text-white/40' : 'text-[#e5c07b]'}">{sourceLabel}</span>
				<button onclick={() => stepSource(1)} class="press px-1.5 py-0.5 border border-white/20 rounded-xs font-bold hover:border-white/50 cursor-pointer text-[10px] leading-none transition-colors" title="Next source track">►</button>
			</div>
			<div class="flex items-center gap-1 px-0.5 shrink-0" title="KEY — trigger on one key of the source only (its kick, say), or on any of its notes">
				<span class="text-white/50 text-[10px] font-bold w-7 shrink-0">KEY</span>
				<button onclick={() => stepKey(-1)} disabled={duckSource < 0} class="press px-1.5 py-0.5 border border-white/20 rounded-xs font-bold hover:border-white/50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed text-[10px] leading-none transition-colors" title="Previous key">◄</button>
				<span class="flex-1 min-w-0 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-white/10 rounded-xs text-center truncate leading-none {duckSource < 0 ? 'text-white/30' : duckKey < 0 ? 'text-white/70' : 'text-[#c678dd]'}">{duckKey < 0 ? 'ANY' : noteNameOf(duckKey)}</span>
				<button onclick={() => stepKey(1)} disabled={duckSource < 0} class="press px-1.5 py-0.5 border border-white/20 rounded-xs font-bold hover:border-white/50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed text-[10px] leading-none transition-colors" title="Next key">►</button>
			</div>
			<div class="grid grid-cols-4 gap-0.5 items-center flex-1 min-h-0">
				<div class="flex justify-center">
					<RotaryKnob label="DEPTH" value={Math.round((activeTrack?.duckDepth ?? 0) * 100)} min={0} max={100} step={5} unit="%" color="#e5c07b" size={32} description="How far this track dips on each trigger (100% = to silence)" reset={0} onChange={(v) => updateActiveTrack({ duckDepth: v / 100 })} />
				</div>
				<div class="flex justify-center">
					<RotaryKnob label="DIP" value={activeTrack?.duckDip ?? 5} min={1} max={50} step={1} unit="ms" color="#e5c07b" size={32} description="Time to reach the floor after the trigger" reset={5} onChange={(v) => updateActiveTrack({ duckDip: v })} />
				</div>
				<div class="flex justify-center">
					<RotaryKnob label="HOLD" value={activeTrack?.duckHold ?? 40} min={0} max={300} step={10} unit="ms" color="#e5c07b" size={32} description="Time held at the floor before the release" reset={40} onChange={(v) => updateActiveTrack({ duckHold: v })} />
				</div>
				<div class="flex justify-center">
					<RotaryKnob label="REL" value={activeTrack?.duckRelease ?? 150} min={20} max={800} step={10} unit="ms" color="#e5c07b" size={32} description="Time back to full level — long values pump, short ones just clear the hit" reset={150} onChange={(v) => updateActiveTrack({ duckRelease: v })} />
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
						<HardwareFader label={band.label} value={trackEqGains[idx] ?? 0} min={-12} max={12} step={0.5} unit="dB" color={band.color} height={48} reset={0} onChange={(v) => setBand(idx, v)} />
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
