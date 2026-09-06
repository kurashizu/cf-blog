<script lang="ts">
	import { t } from '../../../i18n';
	import { METER_SPECS, divToColumnSpan, stepsPerColumn, hasSubColumns, ternaryColFactor, type TimeSignature, type NoteDurationDiv } from '../../../synth';

	interface VisibleTrackItem {
		id: number;
		color: string;
		grid: number[][];
		isPrimary: boolean;
	}

	let {
		nInfo,
		actualIdx,
		visibleTracks,
		viewportStartCol,
		timeMeter,
		snapDiv,
		selected,
		percussion = false,
		isActiveKey = false,
		isCustomKey = false,
		onResetKey,
		onAudition
	}: {
		nInfo: { note: string; freq: number; isBlack: boolean; oct: number };
		actualIdx: number;
		visibleTracks: VisibleTrackItem[];
		viewportStartCol: number;
		timeMeter: TimeSignature;
		snapDiv: NoteDurationDiv;
		/** `note:start` keys of the selected runs on the primary track. */
		selected: Set<string>;
		/** Percussion mode: the label shows which keys carry their own sound and which one the racks edit. */
		percussion?: boolean;
		isActiveKey?: boolean;
		isCustomKey?: boolean;
		onResetKey?: (noteIdx: number) => void;
		onAudition: (noteIdx: number) => void;
	} = $props();

	let isRootC = $derived(nInfo.note.startsWith('C') && !nInfo.note.includes('#'));
	let meterSpec = $derived(METER_SPECS[timeMeter] || METER_SPECS['4/4']);
	// Columns follow the snap family: 1/4-beat columns (6 steps) for binary snaps,
	// 1/6-beat columns (4 steps) for ternary snaps.
	let spc = $derived(stepsPerColumn(snapDiv));
	let half = $derived(spc / 2);
	let colFactor = $derived(ternaryColFactor(snapDiv));
	let effColsPerBar = $derived(meterSpec.colsPerBar * colFactor);
	let effColsPerBeat = $derived(meterSpec.colsPerBeat * colFactor);
	let colsCount = $derived(effColsPerBar);
	let spanInt = $derived(Math.max(1, Math.floor(divToColumnSpan(snapDiv, snapDiv))));

	interface NoteSeg {
		leftPct: number;
		widthPct: number;
		startsHere: boolean;
		endsHere: boolean;
		runStart: number;
	}

	/**
	 * Pixel-proportional note bars — a note's drawn width IS its step duration,
	 * so 1/12, 1/8, 1/6 and 1/4 placements all look different, like any DAW roll.
	 * Returns the segments of this pitch's note runs that overlap the column.
	 */
	function noteSegments(t: VisibleTrackItem, colStart: number): NoteSeg[] {
		const colEnd = colStart + spc;
		const segs: NoteSeg[] = [];
		let s = colStart;
		while (s < colEnd) {
			if (t.grid[s]?.includes(actualIdx)) {
				let runStart = s;
				while (t.grid[runStart - 1]?.includes(actualIdx)) runStart--;
				let runEnd = s + 1;
				while (t.grid[runEnd]?.includes(actualIdx)) runEnd++;
				const from = Math.max(runStart, colStart);
				const to = Math.min(runEnd, colEnd);
				segs.push({
					leftPct: ((from - colStart) / spc) * 100,
					widthPct: ((to - from) / spc) * 100,
					startsHere: runStart >= colStart,
					endsHere: runEnd <= colEnd,
					runStart
				});
				s = runEnd;
			} else {
				s++;
			}
		}
		return segs;
	}
</script>

<!-- Cells carry data-note / data-step / data-span; the roll's pointer handler reads them, so the cells themselves have no listeners. -->
<div class="piano-roll-row flex items-center gap-1 shrink-0 min-h-[18px] h-[18px]">
	<button
		type="button"
		onclick={() => onAudition(actualIdx)}
		oncontextmenu={(e) => {
			if (!percussion || !onResetKey) return;
			e.preventDefault();
			onResetKey(actualIdx);
		}}
		title={percussion
			? (isCustomKey
					? $t('synthPanels.roll.auditionKeyCustomHint', { note: nInfo.note })
					: $t('synthPanels.roll.auditionKeyDefaultHint', { note: nInfo.note }))
			: $t('synthPanels.roll.auditionNoteHint', { note: nInfo.note, freq: Math.round(nInfo.freq) })}
		class="w-9 h-full text-right pr-1 font-bold shrink-0 rounded-xs flex items-center justify-end gap-0.5 select-none cursor-pointer transition-all hover:brightness-125 active:scale-95 {isActiveKey
			? 'ring-1 ring-[#c678dd] shadow-[0_0_6px_rgba(198,120,221,0.6)]'
			: ''} {isRootC
			? 'bg-[#56b6c2]/30 text-[#56b6c2] border border-[#56b6c2]/40 hover:bg-[#56b6c2]/50'
			: nInfo.isBlack
				? 'bg-black/90 text-[#e5c07b] border-r border-white/20 hover:bg-neutral-900'
				: 'bg-white/10 text-[#eceff4] hover:bg-white/20'}"
	>
		{#if isCustomKey}
			<span class="w-1 h-1 rounded-full bg-[#c678dd] shrink-0" aria-hidden="true"></span>
		{/if}
		{nInfo.note}
	</button>

	<div class="flex-1 h-full gap-0.5" style="display: grid; grid-template-columns: repeat({colsCount}, minmax(0, 1fr));">
		{#each Array.from({ length: colsCount }) as _, colIdx (colIdx)}
			{@const globalCol = viewportStartCol + colIdx}
			{@const colStart = globalCol * spc}
			{@const colInBar = globalCol % effColsPerBar}
			{@const isBarStart = colInBar === 0}
			{@const isBeatStart = colInBar % effColsPerBeat === 0}
			{@const isDivBlockStart = colIdx % spanInt === 0}
			<div class="h-full relative">
				<!-- Hit layer: whole-column cell, or two half-column sub-cells for 1/8 & 1/12 snaps -->
				{#if hasSubColumns(snapDiv)}
					<div class="flex h-full w-full gap-0.5">
						{#each [0, 1] as subCol (subCol)}
							{@const step = colStart + subCol * half}
							<div
								data-note={actualIdx}
								data-step={step}
								data-span={half}
								title={$t('synthPanels.roll.cellStepHint', { note: nInfo.note, step: step + 1 })}
								class="flex-1 h-full border rounded-xs transition-colors {isBarStart && subCol === 0
										? isRootC
											? 'border-l-2 border-[#56b6c2]/80 bg-[#56b6c2]/10 hover:bg-[#56b6c2]/20'
											: nInfo.isBlack
												? 'border-l-2 border-[#56b6c2]/70 bg-black/60 hover:bg-white/10'
												: 'border-l-2 border-[#56b6c2]/70 bg-white/[0.08] hover:bg-white/20'
										: isBeatStart && subCol === 0
											? isRootC
												? 'border-l border-white/40 bg-[#56b6c2]/[0.07] hover:bg-[#56b6c2]/15'
												: nInfo.isBlack
													? 'border-l border-white/25 bg-black/60 hover:bg-white/10'
													: 'border-l border-white/30 bg-white/[0.04] hover:bg-white/20'
											: isRootC
												? 'border-white/10 bg-[#56b6c2]/[0.06] hover:bg-[#56b6c2]/15'
												: nInfo.isBlack
													? subCol === 1
														? 'border-l border-black/20 bg-black/60 hover:bg-white/10'
														: 'border-black/20 bg-black/60 hover:bg-white/10'
													: subCol === 1
														? 'border-l border-white/10 bg-white/[0.03] hover:bg-white/10'
														: 'border-white/5 bg-white/[0.03] hover:bg-white/10'}"
							></div>
						{/each}
					</div>
				{:else}
					<div
						data-note={actualIdx}
						data-step={colStart}
						data-span={spc}
						title={$t('synthPanels.roll.cellStepHint', { note: nInfo.note, step: colStart + 1 })}
						class="w-full h-full rounded-xs border transition-colors {isBarStart
								? isRootC
									? 'border-y border-r border-white/15 border-l-2 border-l-[#56b6c2]/80 bg-[#56b6c2]/10 hover:bg-[#56b6c2]/20'
									: nInfo.isBlack
										? 'border-y border-r border-white/10 border-l-2 border-l-[#56b6c2]/80 bg-black/60 hover:bg-white/10'
										: 'border-y border-r border-white/15 border-l-2 border-l-[#56b6c2]/80 bg-white/[0.08] hover:bg-white/20'
								: isBeatStart
									? isRootC
										? 'border-y border-r border-white/15 border-l border-l-white/40 bg-[#56b6c2]/[0.07] hover:bg-[#56b6c2]/15'
										: nInfo.isBlack
											? 'border-y border-r border-white/10 border-l border-l-white/30 bg-black/60 hover:bg-white/10'
											: 'border-y border-r border-white/15 border-l border-l-white/40 bg-white/[0.04] hover:bg-white/20'
									: isRootC
										? 'border border-white/10 bg-[#56b6c2]/[0.06] hover:bg-[#56b6c2]/15'
										: nInfo.isBlack
											? 'border border-black/20 bg-black/55 hover:bg-white/10'
											: isDivBlockStart
												? 'border border-white/20 bg-white/[0.03] hover:bg-white/10'
												: 'border border-white/10 bg-white/[0.03] hover:bg-white/10'}"
					></div>
				{/if}

				<!-- Note overlay: bar width is exactly the note's step span; pointer events pass through to the cell -->
				{#each visibleTracks as t (t.id)}
					{#each noteSegments(t, colStart) as seg, si (si)}
						{@const isSel = t.isPrimary && selected.has(`${actualIdx}:${seg.runStart}`)}
						<div
							class="absolute top-[1px] bottom-[1px] pointer-events-none shadow-xs {seg.startsHere
								? 'rounded-l-xs border-l-2 border-white/80'
								: ''} {seg.endsHere ? 'rounded-r-xs' : ''} {t.isPrimary ? 'z-[3] opacity-100' : 'z-[2] opacity-70'} {isSel
								? `z-[4] brightness-110 border-2 border-white shadow-[0_0_8px_rgba(255,255,255,0.9)] ${seg.startsHere ? '' : 'border-l-0'} ${seg.endsHere ? '' : 'border-r-0'}`
								: ''}"
							style="background-color: {t.color}; left: {seg.startsHere ? `${seg.leftPct}%` : `calc(${seg.leftPct}% - 2px)`}; width: calc({seg.widthPct}% + {(seg.startsHere ? 0 : 2) + (seg.endsHere ? 0 : 2)}px);"
						></div>
					{/each}
				{/each}
			</div>
		{/each}
	</div>
</div>
