<script lang="ts">
	import { playSound } from '../../../sound';
	import { PIANO_ROLL_NOTES } from '../../../synth';
	import { activeTrackId } from '../../../stores/synth-transport';
	import { currentTrack, tracksState, isOverlayMode, overlayTrackIds, activePlayingNotes, holdManualNote, releaseManualNote } from '../../../stores/synth-tracks';
	import { midiConnectedDevice, isSustainActive, setSustainPedal, velocityCurve, cycleVelocityCurve } from '../../../stores/synth-midi';

	let kbOctaveFrom = $state(1);
	let kbOctaveTo = $state(7);

	interface WhiteKey {
		note: string;
		idx: number;
	}
	interface BlackKey {
		note: string;
		idx: number;
		whiteKeyIndexBefore: number;
	}

	let whiteKeys = $derived.by(() => {
		const keys: WhiteKey[] = [];
		const wNoteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
		for (let oct = kbOctaveFrom; oct <= kbOctaveTo; oct++) {
			wNoteNames.forEach((n) => {
				const fullName = `${n}${oct}`;
				const idx = PIANO_ROLL_NOTES.findIndex((p) => p.note === fullName);
				if (idx >= 0) keys.push({ note: fullName, idx });
			});
		}
		return keys;
	});

	let blackKeys = $derived.by(() => {
		const keys: BlackKey[] = [];
		for (let oct = kbOctaveFrom; oct <= kbOctaveTo; oct++) {
			const bSpecs = [
				{ name: `C#${oct}`, afterWhite: `C${oct}` },
				{ name: `D#${oct}`, afterWhite: `D${oct}` },
				{ name: `F#${oct}`, afterWhite: `F${oct}` },
				{ name: `G#${oct}`, afterWhite: `G${oct}` },
				{ name: `A#${oct}`, afterWhite: `A${oct}` }
			];
			bSpecs.forEach((b) => {
				const idx = PIANO_ROLL_NOTES.findIndex((p) => p.note === b.name);
				const wIdx = whiteKeys.findIndex((w) => w.note === b.afterWhite);
				if (idx >= 0 && wIdx >= 0) keys.push({ note: b.name, idx, whiteKeyIndexBefore: wIdx });
			});
		}
		return keys;
	});

	let keyWidthPct = $derived(whiteKeys.length > 0 ? 100 / whiteKeys.length : 0);

	function keyColorFor(idx: number): string {
		const entry = $activePlayingNotes.get(idx);
		const isPlaying = !!entry && ($isOverlayMode ? $overlayTrackIds.includes(entry.trackId) : entry.trackId === $activeTrackId);
		if (!isPlaying) return '';
		const trk = entry && $tracksState[entry.trackId];
		return trk ? trk.color : $currentTrack.color;
	}

	function isKeyPlaying(idx: number): boolean {
		const entry = $activePlayingNotes.get(idx);
		return !!entry && ($isOverlayMode ? $overlayTrackIds.includes(entry.trackId) : entry.trackId === $activeTrackId);
	}

	function pressKey(idx: number) {
		holdManualNote($activeTrackId, idx, 80);
		playSound('click');
	}
	function releaseKey(idx: number) {
		releaseManualNote($activeTrackId, idx);
	}
</script>

<div class="border border-white/20 bg-black/60 rounded-xs p-1.5 pt-1 flex flex-col gap-1 shrink-0 select-none">
	<div class="flex flex-wrap items-center justify-between gap-1.5 text-xs font-mono">
		<div class="flex items-center gap-1.5">
			<span class="font-black text-[#56b6c2]">PIANO KEYBOARD</span>
			<span class="text-white/40 text-[10px] hidden sm:inline">| C{kbOctaveFrom} - B{kbOctaveTo} AUDITION</span>
		</div>

		<div class="flex items-center gap-2">
			<div class="flex items-center gap-1 text-xs">
				<span class="opacity-60 text-xs font-bold" title="Keyboard Octave Range (FROM - TO) — Changes visible keybed range">OCT:</span>

				<div class="flex items-center gap-0.5">
					<span class="text-white/50 text-[10px] font-bold">FROM</span>
					<button
						onclick={() => {
							kbOctaveFrom = Math.max(1, kbOctaveFrom - 1);
							playSound('click');
						}}
						disabled={kbOctaveFrom <= 1}
						class="px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs"
						title="Lower starting octave"
					>
						◄
					</button>
					<span class="px-1.5 py-0.5 text-xs font-mono font-bold bg-white/10 rounded-xs text-[#56b6c2] min-w-[20px] text-center">{kbOctaveFrom}</span>
					<button
						onclick={() => {
							kbOctaveFrom = Math.min(kbOctaveTo, kbOctaveFrom + 1);
							playSound('click');
						}}
						disabled={kbOctaveFrom >= kbOctaveTo}
						class="px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs"
						title="Raise starting octave"
					>
						►
					</button>
				</div>

				<div class="flex items-center gap-0.5">
					<span class="text-white/50 text-[10px] font-bold">TO</span>
					<button
						onclick={() => {
							kbOctaveTo = Math.max(kbOctaveFrom, kbOctaveTo - 1);
							playSound('click');
						}}
						disabled={kbOctaveTo <= kbOctaveFrom}
						class="px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs"
						title="Lower ending octave"
					>
						◄
					</button>
					<span class="px-1.5 py-0.5 text-xs font-mono font-bold bg-white/10 rounded-xs text-[#56b6c2] min-w-[20px] text-center">{kbOctaveTo}</span>
					<button
						onclick={() => {
							kbOctaveTo = Math.min(7, kbOctaveTo + 1);
							playSound('click');
						}}
						disabled={kbOctaveTo >= 7}
						class="px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs"
						title="Raise ending octave"
					>
						►
					</button>
				</div>
			</div>

			<span class="opacity-30">|</span>

			<button
				onclick={() => {
					setSustainPedal(!$isSustainActive);
					playSound('toggle');
				}}
				class="px-1.5 py-0.2 rounded-xs border text-[10px] font-bold cursor-pointer transition-all {$isSustainActive
					? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black shadow-[0_0_6px_#e5c07b]'
					: 'border-white/20 bg-white/5 text-white/50 hover:text-white hover:border-white/40'}"
				title="Sustain Pedal (PEDAL / CC64) — Keeps sounding notes sustained until released"
			>
				SUS: {$isSustainActive ? 'ON' : 'OFF'}
			</button>

			<span class="opacity-30">|</span>

			<button
				onclick={() => {
					cycleVelocityCurve();
					playSound('toggle');
				}}
				class="px-1.5 py-0.2 rounded-xs border text-[10px] font-bold cursor-pointer transition-all {$velocityCurve === 'EXP'
					? 'border-[#61afef] bg-[#61afef] text-black font-black shadow-[0_0_6px_#61afef]'
					: $velocityCurve === 'LINEAR'
						? 'border-[#98c379] bg-[#98c379] text-black font-black shadow-[0_0_6px_#98c379]'
						: $velocityCurve === 'LOG'
							? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black shadow-[0_0_6px_#e5c07b]'
							: $velocityCurve === 'HARD'
								? 'border-[#e06c75] bg-[#e06c75] text-black font-black shadow-[0_0_6px_#e06c75]'
								: 'border-white/20 bg-white/5 text-white/40 hover:text-white hover:border-white/40'}"
				title={`MIDI Velocity Curve: ${$velocityCurve} (Click to cycle: EXP [Natural Piano] → LIN [Linear 1:1] → LOG [Soft Touch] → HARD [Aggressive] → OFF [Fixed Volume])`}
			>
				VEL: {$velocityCurve === 'LINEAR' ? 'LIN' : $velocityCurve}
			</button>

			<span class="opacity-30">|</span>

			<div class="flex items-center gap-1 px-1.5 py-0.2 rounded-xs border text-[10px] font-bold {$midiConnectedDevice ? 'border-[#98c379] bg-[#98c379]/15 text-[#98c379]' : 'border-white/20 bg-white/5 text-white/40'}">
				<span class="w-1.5 h-1.5 rounded-full {$midiConnectedDevice ? 'bg-[#98c379] animate-pulse' : 'bg-white/30'}"></span>
				<span>MIDI: {$midiConnectedDevice ? $midiConnectedDevice.toUpperCase() : 'STANDBY'}</span>
			</div>
		</div>
	</div>

	<div class="relative h-12 w-full flex bg-black/80 rounded-xs border border-white/15 p-0.5 overflow-hidden">
		{#if whiteKeys.length > 0}
			<div class="flex w-full h-full gap-0.5">
				{#each whiteKeys as wk (wk.note)}
					{@const isPlaying = isKeyPlaying(wk.idx)}
					{@const color = keyColorFor(wk.idx)}
					<button
						onmousedown={() => pressKey(wk.idx)}
						onmouseup={() => releaseKey(wk.idx)}
						onmouseleave={() => releaseKey(wk.idx)}
						ontouchstart={(e) => {
							e.preventDefault();
							pressKey(wk.idx);
						}}
						ontouchend={() => releaseKey(wk.idx)}
						class="flex-1 h-full rounded-xs flex flex-col justify-end pb-0.5 items-center cursor-pointer transition-all border {isPlaying
							? 'shadow-[0_0_10px_currentColor]'
							: 'bg-[#e8e6e1] hover:bg-white text-black/70 border-black/30'}"
						style={isPlaying ? `background-color: ${color}; border-color: ${color}; color: #000;` : ''}
						title={`Play ${wk.note} (${PIANO_ROLL_NOTES[wk.idx]?.freq.toFixed(1)} Hz)`}
					>
						<span class="text-[9px] font-mono font-black opacity-70 leading-none">{wk.note}</span>
					</button>
				{/each}
			</div>

			{#each blackKeys as bk (bk.note)}
				{@const isPlaying = isKeyPlaying(bk.idx)}
				{@const color = keyColorFor(bk.idx)}
				{@const leftPos = (bk.whiteKeyIndexBefore + 1) * keyWidthPct - keyWidthPct * 0.32}
				{@const bWidth = keyWidthPct * 0.64}
				<button
					onmousedown={(e) => {
						e.stopPropagation();
						pressKey(bk.idx);
					}}
					onmouseup={(e) => {
						e.stopPropagation();
						releaseKey(bk.idx);
					}}
					onmouseleave={() => releaseKey(bk.idx)}
					ontouchstart={(e) => {
						e.preventDefault();
						e.stopPropagation();
						pressKey(bk.idx);
					}}
					ontouchend={(e) => {
						e.stopPropagation();
						releaseKey(bk.idx);
					}}
					class="absolute top-0 h-[62%] rounded-b-xs flex flex-col justify-end pb-0.5 items-center cursor-pointer z-10 transition-all border {isPlaying
						? 'shadow-[0_0_10px_currentColor]'
						: 'bg-[#181a1f] hover:bg-[#282c34] text-white/60 border-black'}"
					style="left: {leftPos}%; width: {bWidth}%; {isPlaying ? `background-color: ${color}; border-color: ${color}; color: #000;` : ''}"
					title={`Play ${bk.note} (${PIANO_ROLL_NOTES[bk.idx]?.freq.toFixed(1)} Hz)`}
				>
					<span class="text-[8px] font-mono font-bold leading-none">{bk.note.replace('#', '')}#</span>
				</button>
			{/each}
		{/if}
	</div>
</div>
