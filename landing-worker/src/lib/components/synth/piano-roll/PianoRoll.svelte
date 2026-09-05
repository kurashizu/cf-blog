<script lang="ts">
	import { playSound } from '../../../sound';
	import { modularSynth, PIANO_ROLL_NOTES, METER_SPECS, stepsPerColumn, hasSubColumns, ternaryColFactor } from '../../../synth';
	import { timeMeter, snapDiv, activeStepPage, cursorStep, seqCurrentStep, isSeqPlaying, totalPatternSteps, activeTrackId } from '../../../stores/synth-transport';
	import { currentTrack, visibleTracks, tracksState, handlePianoRollCellClick, handlePianoRollSubCellClick, cycleAccent } from '../../../stores/synth-tracks';
	import PianoRollRow from './PianoRollRow.svelte';

	let octaveFrom = $state(3);
	let octaveTo = $state(5);

	let meterSpec = $derived(METER_SPECS[$timeMeter] || METER_SPECS['4/4']);
	// Column layout follows the snap family: binary snaps use 1/4-beat columns,
	// ternary snaps (1/3, 1/6, 1/12) use 1/6-beat columns.
	let spc = $derived(stepsPerColumn($snapDiv));
	let colFactor = $derived(ternaryColFactor($snapDiv));
	let effColsPerBar = $derived(meterSpec.colsPerBar * colFactor);
	let effColsPerBeat = $derived(meterSpec.colsPerBeat * colFactor);
	let colsPerPage = $derived(effColsPerBar);
	let stepsPerPage = $derived(meterSpec.stepsPerBar);
	let viewportStartCol = $derived($activeStepPage * colsPerPage);
	let activeCol = $derived($isSeqPlaying && Math.floor($seqCurrentStep / stepsPerPage) === $activeStepPage ? Math.floor(($seqCurrentStep % stepsPerPage) / spc) : -1);
	let activeSubCol = $derived($isSeqPlaying ? Math.floor(($seqCurrentStep % spc) / (spc / 2)) : -1);
	/* The playhead and the cursor as plain column/sub-column numbers.
	   Every cell in the ruler and the accent row used to test $seqCurrentStep
	   itself, so a step change invalidated all ~880 of them rather than the two
	   the playhead actually moved between -- which is what made the whole page
	   stutter while the sequencer ran. Reading the store once here and handing
	   the cells a number leaves each comparing two integers. */
	let playCol = $derived($isSeqPlaying ? Math.floor($seqCurrentStep / spc) : -1);
	let playSubCol = $derived($isSeqPlaying ? Math.floor(($seqCurrentStep % spc) / (spc / 2)) : -1);
	let cursorCol = $derived(Math.floor($cursorStep / spc));
	let cursorSubCol = $derived(Math.floor(($cursorStep % spc) / (spc / 2)));

	function clearPage() {
		for (let i = 0; i < stepsPerPage; i++) {
			const actualStep = $activeStepPage * stepsPerPage + i;
			modularSynth.clearTrackStep($activeTrackId, actualStep);
		}
		tracksState.set([...modularSynth.getTracks()]);
		playSound('click');
	}

	function auditionNote(idx: number) {
		modularSynth.triggerTrackVoice($activeTrackId, idx, 0);
		playSound('click');
	}

	function jumpRulerCursor(step: number) {
		cursorStep.set(step);
		if (!$isSeqPlaying) {
			modularSynth.setPlaybackStep(step);
			seqCurrentStep.set(step);
		}
		playSound('click');
	}

	function handleCycleAccent(step: number) {
		cycleAccent(step);
		playSound('click');
	}
</script>

<div class="border border-white/20 p-1.5 bg-black/60 rounded-xs flex-1 min-h-0 flex flex-col overflow-hidden gap-1">
	<div class="flex flex-wrap items-center justify-between gap-1.5 text-xs font-bold shrink-0">
		<div class="flex items-center gap-2">
			<span class="font-black text-xs" style="color: {$currentTrack.color}">PIANO ROLL // {$currentTrack.name}</span>
			<span class="text-xs text-[#98c379] font-mono font-bold">
				BAR {Math.floor($seqCurrentStep / stepsPerPage) + 1}.{Math.floor(($seqCurrentStep % stepsPerPage) / (stepsPerPage / meterSpec.beatsPerBar)) + 1} (STEP {$seqCurrentStep + 1}/{$totalPatternSteps})
			</span>
		</div>

		<div class="flex items-center gap-1.5 text-xs">
			<button onclick={clearPage} class="press border border-white/20 px-2 py-0.5 rounded-xs hover:border-red-400 text-red-300 cursor-pointer text-xs font-bold transition-colors" title="Clear Page (CLR) — Removes all placed notes and chords from the current page on the active track">
				✕ CLR
			</button>

			<span class="opacity-30">|</span>

			<div class="flex items-center gap-1 text-xs">
				<span class="opacity-60 text-xs font-bold" title="Octave Scope Range (FROM - TO) — Limits visible pitch range in the piano roll without altering grid cell dimensions">OCT:</span>

				<div class="flex items-center gap-0.5">
					<span class="text-white/50 text-[10px] font-bold">FROM</span>
					<button
						onclick={() => {
							octaveFrom = Math.max(1, octaveFrom - 1);
							playSound('click');
						}}
						disabled={octaveFrom <= 1}
						class="press px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs transition-colors"
						title="Lower starting octave (Octave down)"
					>
						◄
					</button>
					<span class="px-1.5 py-0.5 text-xs font-mono font-bold bg-white/10 rounded-xs text-[#56b6c2] min-w-[20px] text-center" title={`Starting Octave: Octave ${octaveFrom} (C${octaveFrom})`}>{octaveFrom}</span>
					<button
						onclick={() => {
							octaveFrom = Math.min(octaveTo, octaveFrom + 1);
							playSound('click');
						}}
						disabled={octaveFrom >= octaveTo}
						class="press px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs transition-colors"
						title="Raise starting octave (Octave up)"
					>
						►
					</button>
				</div>

				<div class="flex items-center gap-0.5 ml-1">
					<span class="text-white/50 text-[10px] font-bold">TO</span>
					<button
						onclick={() => {
							octaveTo = Math.max(octaveFrom, octaveTo - 1);
							playSound('click');
						}}
						disabled={octaveTo <= octaveFrom}
						class="press px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs transition-colors"
						title="Lower ending octave"
					>
						◄
					</button>
					<span class="px-1.5 py-0.5 text-xs font-mono font-bold bg-white/10 rounded-xs text-[#e5c07b] min-w-[20px] text-center" title={`Ending Octave: Octave ${octaveTo} (B${octaveTo})`}>{octaveTo}</span>
					<button
						onclick={() => {
							octaveTo = Math.min(7, octaveTo + 1);
							playSound('click');
						}}
						disabled={octaveTo >= 7}
						class="press px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs transition-colors"
						title="Raise ending octave"
					>
						►
					</button>
				</div>
			</div>
		</div>
	</div>

	<div class="flex-1 min-h-0 overflow-x-auto no-scrollbar flex flex-col">
		<div class="min-w-[480px] sm:min-w-0 flex-1 min-h-0 flex flex-col justify-between">
			<!-- Fixed timeline ruler -->
			<div class="flex items-center gap-1 pl-10 pr-0.5 text-xs font-mono text-white/50 border-b border-white/10 pb-0.5 shrink-0 select-none">
				<div class="flex-1 gap-0.5" style="display: grid; grid-template-columns: repeat({colsPerPage}, minmax(0, 1fr));">
					{#each Array.from({ length: colsPerPage }) as _, colIdx (colIdx)}
						{@const globalCol = viewportStartCol + colIdx}
						{@const barNum = Math.floor(globalCol / effColsPerBar) + 1}
						{@const colInBar = globalCol % effColsPerBar}
						{@const beatNum = Math.floor(colInBar / effColsPerBeat) + 1}
						{@const isBarStart = colInBar === 0}
						{@const isBeatStart = colInBar % effColsPerBeat === 0}
						{@const isCurrent = playCol === globalCol}
						{@const isCursorCol = cursorCol === globalCol}
						<div class="h-full">
							{#if hasSubColumns($snapDiv)}
								<div class="flex h-full gap-0.5 text-xs">
									{#each [0, 1] as subCol (subCol)}
										{@const step = globalCol * spc + subCol * (spc / 2)}
										{@const isSubCurrent = playCol === globalCol && playSubCol === subCol}
										{@const isSubCursor = cursorCol === globalCol && cursorSubCol === subCol}
										<button
											onclick={() => jumpRulerCursor(step)}
											class="press flex-1 text-center py-0.5 rounded-xs transition-colors cursor-pointer select-none font-bold relative {isSubCurrent
												? 'bg-white text-black font-black shadow-[0_0_6px_#fff]'
												: isSubCursor
													? 'bg-[#56b6c2]/70 text-black border border-[#56b6c2] font-black'
													: isBarStart && subCol === 0
														? 'bg-[#56b6c2]/25 text-[#56b6c2] border border-[#56b6c2]/50 font-black'
														: isBeatStart && subCol === 0
															? 'bg-white/15 text-white font-bold'
															: 'text-white/30 hover:bg-white/10 hover:text-white/70'}"
											title={`Click to set Playback Cursor to Step ${step + 1} (Bar ${barNum}.${beatNum})`}
										>
											{subCol === 0 ? (isBarStart ? `${barNum}.1` : isBeatStart ? `${barNum}.${beatNum}` : `${colIdx + 1}`) : '+'}
										</button>
									{/each}
								</div>
							{:else}
								<button
									onclick={() => jumpRulerCursor(globalCol * spc)}
									class="press w-full text-center py-0.5 rounded-xs transition-colors font-bold text-xs cursor-pointer select-none relative {isCurrent
										? 'bg-white text-black font-black shadow-[0_0_6px_#fff]'
										: isCursorCol
											? 'bg-[#56b6c2]/70 text-black border border-[#56b6c2] font-black'
											: isBarStart
												? 'bg-[#56b6c2]/25 text-[#56b6c2] border border-[#56b6c2]/50 font-black'
												: isBeatStart
													? 'bg-white/15 text-white'
													: 'text-white/30 hover:bg-white/10 hover:text-white/70'}"
									title={`Click to set Playback Cursor to Column ${colIdx + 1} (Step ${globalCol * spc + 1}, Bar ${barNum}.${beatNum})`}
								>
									{isBarStart ? `${barNum}.1` : isBeatStart ? `${barNum}.${beatNum}` : `${colIdx + 1}`}
								</button>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- Scrollable note rows -->
			<div class="flex-1 min-h-0 space-y-0.5 font-mono text-xs pr-0.5 flex flex-col overflow-y-auto custom-scrollbar">
				{#each PIANO_ROLL_NOTES as nInfo, actualIdx (nInfo.note)}
					{#if nInfo.oct >= octaveFrom && nInfo.oct <= octaveTo}
						<PianoRollRow
							{nInfo}
							{actualIdx}
							visibleTracks={$visibleTracks}
							{viewportStartCol}
							{activeCol}
							{activeSubCol}
							timeMeter={$timeMeter}
							snapDiv={$snapDiv}
							onAudition={auditionNote}
							onCellClick={handlePianoRollCellClick}
							onSubCellClick={handlePianoRollSubCellClick}
						/>
					{/if}
				{/each}
			</div>

			<!-- Fixed accent track -->
			<div class="flex items-center gap-1 pt-1 border-t border-white/10 text-xs font-mono shrink-0 select-none">
				<div class="w-9 text-right pr-1 font-black text-[#e06c75] shrink-0 select-none text-xs flex items-center justify-end">
					<span title="Accent Velocity Track — 3-Level Cycle: OFF (0dB) -> Amber (+3dB) -> Red (+6dB)">ACC</span>
				</div>
				<div class="flex-1 gap-0.5" style="display: grid; grid-template-columns: repeat({colsPerPage}, minmax(0, 1fr));">
					{#each Array.from({ length: colsPerPage }) as _, colIdx (colIdx)}
						{@const globalCol = viewportStartCol + colIdx}
						{@const colInBar = globalCol % effColsPerBar}
						{@const isBarStart = colInBar === 0}
						{@const isBeatStart = colInBar % effColsPerBeat === 0}
						<div class="h-full">
							<div class="flex h-full gap-0.5">
								{#each [0, 1] as subCol (subCol)}
									{@const step = globalCol * spc + subCol * (spc / 2)}
									{@const accVal = Number($currentTrack.accents[step] || 0)}
									{@const isSubCurrent = playCol === globalCol && playSubCol === subCol}
									<button
										onclick={() => handleCycleAccent(step)}
										class="press flex-1 py-0.5 text-center text-xs font-bold rounded-xs cursor-pointer border transition-all {isSubCurrent
											? 'border-white bg-white text-black font-black shadow-[0_0_8px_#fff]'
											: accVal === 4
												? 'border-[#e06c75] bg-[#e06c75] text-black font-black shadow-xs'
												: accVal === 3
													? 'border-[#d19a66] bg-[#d19a66] text-black font-black shadow-xs'
													: accVal === 2
														? 'border-[#e5c07b] bg-[#e5c07b] text-black font-black shadow-xs'
														: accVal === 1
															? 'border-[#98c379] bg-[#98c379] text-black font-black shadow-xs'
															: isBarStart && subCol === 0
																? 'border-y border-r border-white/15 border-l-2 border-l-[#56b6c2]/80 bg-black/50 text-white/70 hover:border-white/40'
																: isBeatStart && subCol === 0
																	? 'border-y border-r border-white/15 border-l border-l-white/40 bg-black/50 text-white/50 hover:border-white/40'
																	: 'border border-white/10 bg-black/40 text-white/40 hover:border-white/30'}"
										title={`Step ${step + 1} (${subCol === 0 ? 'L' : 'R'}) Accent: ${accVal > 0 ? `+${accVal}dB` : 'OFF (0dB)'} — Click to cycle`}
									>
										{accVal > 0 ? `+${accVal}` : subCol === 0 ? `${colIdx + 1}` : '·'}
									</button>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>
