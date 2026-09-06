<script lang="ts">
	import { playSound } from '../../../sound';
	import { resetRack7 } from '../../../stores/synth-reset';
	import { currentTrack, updateActiveTrack, tracksState, noteNameOf } from '../../../stores/synth-tracks';
	import { activeTrackId, totalPatternSteps } from '../../../stores/synth-transport';
	import { allRuns } from '../../../stores/synth-edit';
	import { isRecording, recSeconds, recError, toggleRecording } from '../../../stores/recorder';
	import RotaryKnob from '../../hardware/RotaryKnob.svelte';
	import Visualizers, { type VisualizerMode } from './Visualizers.svelte';

	let activeOutVisualizer = $state<VisualizerMode>('fft');

	function setMode(mode: VisualizerMode) {
		activeOutVisualizer = mode;
		playSound('click');
	}

	/* Sidechain: which track (and optionally which of its keys) makes this one dip. */
	let duckSource = $derived($currentTrack.duckSource ?? -1);
	let duckKey = $derived($currentTrack.duckKey ?? -1);
	let duckOn = $derived(duckSource >= 0 && ($currentTrack.duckDepth ?? 0) > 0);
	let sourceOptions = $derived($tracksState.filter((t) => t.id !== $activeTrackId));
	/* Only the keys the source actually plays are offered -- for a percussion
	   track that is its kick / snare / hat, which is what you key a duck to. */
	let keyOptions = $derived.by(() => {
		const src = $tracksState[duckSource];
		if (!src) return [] as number[];
		const notes = new Set<number>();
		for (const r of allRuns(src.grid, $totalPatternSteps)) notes.add(r.note);
		if (duckKey >= 0) notes.add(duckKey);
		return [...notes].sort((a, b) => a - b);
	});

	function setDuckSource(e: Event) {
		const id = Number((e.target as HTMLSelectElement).value);
		// Picking a source with the depth still at zero would do nothing audible.
		const depth = ($currentTrack.duckDepth ?? 0) > 0 ? {} : { duckDepth: 0.6 };
		updateActiveTrack({ duckSource: id, duckKey: -1, ...(id >= 0 ? depth : {}) });
		playSound('click');
	}

	function setDuckKey(e: Event) {
		updateActiveTrack({ duckKey: Number((e.target as HTMLSelectElement).value) });
		playSound('click');
	}
</script>

<div class="xl:col-span-4 border border-white/20 p-1.5 bg-black/60 rounded-xs flex flex-col justify-between min-h-[155px] shrink-0">
	<div class="flex items-center justify-between font-black text-white text-xs border-b border-white/10 pb-0.5 shrink-0">
		<div class="flex items-center gap-2">
			<span class="text-white text-xs font-black">7. OUT</span>
			<div class="flex items-center gap-1">
				<button
					onclick={() => setMode('fft')}
					title="Visualizer Mode: FFT Log Spectrum Analyzer — Shows frequency distribution across 20Hz to 20kHz"
					class="press px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors {activeOutVisualizer === 'fft'
						? 'border-[#56b6c2] bg-[#56b6c2] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
				>
					FFT
				</button>
				<button
					onclick={() => setMode('scope')}
					title="Visualizer Mode: Oscilloscope Waveform — Real-time time-domain audio wave display"
					class="press px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors {activeOutVisualizer === 'scope'
						? 'border-[#98c379] bg-[#98c379] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
				>
					SCOPE
				</button>
				<button
					onclick={() => setMode('loudness')}
					title="Visualizer Mode: RMS Loudness Meter & History — Real-time dynamic decibel range (-60dB to +6dB)"
					class="press px-1.5 py-0.2 text-[10px] sm:text-xs rounded-xs border font-black cursor-pointer transition-colors {activeOutVisualizer === 'loudness'
						? 'border-[#e06c75] bg-[#e06c75] text-black font-black'
						: 'border-white/20 text-white/60 hover:text-white'}"
				>
					LOUD
				</button>
			</div>
		</div>
		<div class="flex items-center gap-1.5">
			{#if $recError}
				<span class="text-[9px] font-mono text-[#e06c75]">{$recError}</span>
			{/if}
			<!-- The label was "REC" idle and "REC 4s — STOP & SAVE" while recording:
			     seven times the text, in a rack header with no room for it, so the
			     button wrapped to two lines and shoved the row apart the moment
			     recording started. It now says REC and then the running count, which
			     is the only part that has to change, and the elapsed time is
			     tabular-nums and fixed-width so ticking from 9s to 10s does not
			     resize it either. What the click does is in the tooltip, where the
			     rest of the controls keep that kind of thing. -->
			<button
				onclick={toggleRecording}
				title={$isRecording
					? `Recording — ${$recSeconds}s. Click to stop and download.`
					: 'Record the master output and download it when stopped (WebM/Opus, or M4A on Safari)'}
				class="press px-1.5 py-0.2 rounded-xs border text-[10px] font-black cursor-pointer transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 {$isRecording
					? 'border-[#e06c75] bg-[#e06c75] text-black shadow-[0_0_8px_#e06c75]'
					: 'border-[#e06c75]/50 bg-[#e06c75]/10 text-[#e06c75] hover:bg-[#e06c75]/25'}"
			>
				<span class="w-1.5 h-1.5 rounded-full shrink-0 {$isRecording ? 'bg-black animate-pulse' : 'bg-[#e06c75]'}"></span>
				<span>REC</span>
				{#if $isRecording}
					<span class="tabular-nums text-right" style="min-width: 3ch;">{$recSeconds}s</span>
				{/if}
			</button>
			<button onclick={resetRack7} title="RST — reset: put this rack at its neutral values, where it does nothing to the sound" class="press px-1 py-0.2 text-[9px] rounded-xs font-mono font-bold cursor-pointer transition-colors border border-white/20 text-white/40 hover:text-white hover:border-white/60">RST</button>
		</div>
	</div>

	<div class="grid grid-cols-12 gap-1.5 items-center flex-1 min-h-0 my-auto">
		<div class="col-span-5 flex gap-1 border-r border-white/10 pr-1 h-full items-stretch py-0.5">
			<!-- Per-track output: level, pan, air -->
			<div class="flex flex-col justify-around items-center shrink-0">
				<RotaryKnob label="VOL" value={Math.round($currentTrack.volume * 100)} min={0} max={100} unit="%" color="#98c379" size={32} reset={100} onChange={(v) => updateActiveTrack({ volume: v / 100 })} />
				<RotaryKnob label="PAN" value={Math.round($currentTrack.pan * 100)} min={-100} max={100} step={5} unit="" color="#56b6c2" size={32} reset={0} onChange={(v) => updateActiveTrack({ pan: v / 100 })} />
				<RotaryKnob
					label="AIR"
					value={Math.round(($currentTrack.airGain ?? 0) * 100)}
					min={-100}
					max={100}
					step={5}
					unit="%"
					color="#e5c07b"
					size={32}
					description="Air Shelf EQ — Boosts/cuts high-end brilliance (±8dB @ 10kHz)"
					reset={0}
					onChange={(v) => updateActiveTrack({ airGain: v / 100 })}
				/>
			</div>

			<!-- Sidechain ducking: this track dips every time the source track (or one key of it) plays -->
			<div class="flex-1 min-w-0 flex flex-col gap-0.5 border-l border-white/10 pl-1">
				<div class="flex items-center gap-1 text-[9px] font-mono font-bold shrink-0">
					<span class="font-black {duckOn ? 'text-[#e06c75]' : 'text-white/40'}" title="DUCK — sidechain: every note of the SRC track (or just its KEY) pushes this track down by DEPTH, in DIP ms, holds for HOLD ms and comes back in REL ms. Lets a drum cut through a pad or bass for the instant it lasts.">DUCK</span>
					<select value={duckSource} onchange={setDuckSource} title="SRC — the track whose notes trigger the dip" class="min-w-0 flex-1 bg-black/60 border border-white/20 rounded-xs px-0.5 text-[9px] font-mono text-white/80 cursor-pointer hover:border-white/50">
						<option value={-1}>SRC: OFF</option>
						{#each sourceOptions as t (t.id)}
							<option value={t.id}>T{t.id + 1} {t.name}</option>
						{/each}
					</select>
					<select value={duckKey} onchange={setDuckKey} disabled={duckSource < 0} title="KEY — trigger on one key of the source only (its kick, say), or on any of its notes" class="w-[52px] bg-black/60 border border-white/20 rounded-xs px-0.5 text-[9px] font-mono text-white/80 cursor-pointer hover:border-white/50 disabled:opacity-30 disabled:cursor-not-allowed">
						<option value={-1}>ANY</option>
						{#each keyOptions as n (n)}
							<option value={n}>{noteNameOf(n)}</option>
						{/each}
					</select>
				</div>
				<div class="grid grid-cols-4 gap-0.5 flex-1 min-h-0 items-center">
					<RotaryKnob label="DEPTH" value={Math.round(($currentTrack.duckDepth ?? 0) * 100)} min={0} max={100} step={5} unit="%" color="#e06c75" size={28} description="How far this track dips on each trigger (100% = to silence)" reset={0} onChange={(v) => updateActiveTrack({ duckDepth: v / 100 })} />
					<RotaryKnob label="DIP" value={$currentTrack.duckDip ?? 5} min={1} max={50} step={1} unit="ms" color="#e06c75" size={28} description="Time to reach the floor after the trigger" reset={5} onChange={(v) => updateActiveTrack({ duckDip: v })} />
					<RotaryKnob label="HOLD" value={$currentTrack.duckHold ?? 40} min={0} max={300} step={10} unit="ms" color="#e06c75" size={28} description="Time held at the floor before the release" reset={40} onChange={(v) => updateActiveTrack({ duckHold: v })} />
					<RotaryKnob label="REL" value={$currentTrack.duckRelease ?? 150} min={20} max={800} step={10} unit="ms" color="#e06c75" size={28} description="Time back to full level -- long values pump, short ones just clear the hit" reset={150} onChange={(v) => updateActiveTrack({ duckRelease: v })} />
				</div>
			</div>
		</div>

		<Visualizers mode={activeOutVisualizer} />
	</div>
</div>
