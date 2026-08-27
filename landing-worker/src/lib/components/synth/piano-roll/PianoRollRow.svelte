<script lang="ts">
	import { METER_SPECS, divToColumnSpan, type TimeSignature, type NoteDurationDiv } from '../../../synth';

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
		activeCol,
		activeSubCol,
		timeMeter,
		snapDiv,
		onAudition,
		onCellClick,
		onSubCellClick
	}: {
		nInfo: { note: string; freq: number; isBlack: boolean; oct: number };
		actualIdx: number;
		visibleTracks: VisibleTrackItem[];
		viewportStartCol: number;
		activeCol: number;
		activeSubCol: number;
		timeMeter: TimeSignature;
		snapDiv: NoteDurationDiv;
		onAudition: (noteIdx: number) => void;
		onCellClick: (noteIdx: number, colIdx: number) => void;
		onSubCellClick: (noteIdx: number, colIdx: number, subCol: number) => void;
	} = $props();

	let isRootC = $derived(nInfo.note.startsWith('C') && !nInfo.note.includes('#'));
	let meterSpec = $derived(METER_SPECS[timeMeter] || METER_SPECS['4/4']);
	let colsCount = $derived(meterSpec.colsPerBar);
	let spanInt = $derived(Math.max(1, Math.floor(divToColumnSpan(snapDiv))));

	function noteBarGeometry(t: VisibleTrackItem, step0: number, step1: number) {
		const is0 = t.grid[step0]?.includes(actualIdx) || false;
		const is1 = t.grid[step1]?.includes(actualIdx) || false;
		if (!is0 && !is1) return null;

		const isPrevConnected = is0 && (t.grid[step0 - 1]?.includes(actualIdx) || false);
		const isNextConnected = is1 && (t.grid[step1 + 1]?.includes(actualIdx) || false);

		let leftClass = 'left-0 rounded-l-xs';
		let rightClass = 'right-0 rounded-r-xs';
		let widthStyle = '100%';
		let leftStyle: string | undefined;

		if (is0 && is1) {
			if (isPrevConnected && isNextConnected) {
				leftClass = '-left-[2px] rounded-none';
				rightClass = '-right-[2px]';
				widthStyle = 'calc(100% + 4px)';
				leftStyle = '-2px';
			} else if (isPrevConnected) {
				leftClass = '-left-[2px] rounded-l-none';
				rightClass = 'right-0 rounded-r-xs';
				widthStyle = 'calc(100% + 2px)';
				leftStyle = '-2px';
			} else if (isNextConnected) {
				leftClass = 'left-0 rounded-l-xs border-l-2 border-white/80';
				rightClass = '-right-[2px] rounded-r-none';
				widthStyle = 'calc(100% + 2px)';
				leftStyle = '0px';
			} else {
				leftClass = 'left-0 rounded-xs border-l-2 border-white/80';
				rightClass = 'right-0';
				widthStyle = '100%';
				leftStyle = '0px';
			}
		} else if (is0 && !is1) {
			if (isPrevConnected) {
				leftClass = '-left-[2px] rounded-l-none';
				rightClass = 'rounded-r-xs';
				widthStyle = 'calc(50% + 2px)';
				leftStyle = '-2px';
			} else {
				leftClass = 'left-0 rounded-xs border-l-2 border-white/80';
				widthStyle = '50%';
				leftStyle = '0px';
			}
		} else {
			if (isNextConnected) {
				leftClass = 'rounded-l-xs border-l-2 border-white/80';
				rightClass = '-right-[2px] rounded-r-none';
				widthStyle = 'calc(50% + 2px)';
				leftStyle = '50%';
			} else {
				leftClass = 'rounded-xs border-l-2 border-white/80';
				widthStyle = '50%';
				leftStyle = '50%';
			}
		}

		return { leftClass, rightClass, widthStyle, leftStyle };
	}
</script>

<div class="flex items-center gap-1 shrink-0 min-h-[18px] h-[18px]">
	<button
		type="button"
		onclick={() => onAudition(actualIdx)}
		title={`Audition ${nInfo.note} (${Math.round(nInfo.freq)}Hz)`}
		class="w-9 h-full text-right pr-1 font-bold shrink-0 rounded-xs flex items-center justify-end select-none cursor-pointer transition-all hover:brightness-125 active:scale-95 {isRootC
			? 'bg-[#56b6c2]/30 text-[#56b6c2] border border-[#56b6c2]/40 hover:bg-[#56b6c2]/50'
			: nInfo.isBlack
				? 'bg-black/90 text-[#e5c07b] border-r border-white/20 hover:bg-neutral-900'
				: 'bg-white/10 text-[#eceff4] hover:bg-white/20'}"
	>
		{nInfo.note}
	</button>

	<div class="flex-1 h-full gap-0.5" style="display: grid; grid-template-columns: repeat({colsCount}, minmax(0, 1fr));">
		{#each Array.from({ length: colsCount }) as _, colIdx (colIdx)}
			{@const globalCol = viewportStartCol + colIdx}
			{@const step0 = globalCol * 2}
			{@const step1 = globalCol * 2 + 1}
			{@const isColActive = activeCol === colIdx}
			{@const colInBar = globalCol % meterSpec.colsPerBar}
			{@const isBarStart = colInBar === 0}
			{@const isBeatStart = colInBar % meterSpec.colsPerBeat === 0}
			{@const isDivBlockStart = colIdx % spanInt === 0}
			<div class="h-full relative flex">
				{#if snapDiv === '1/8'}
					<div class="flex h-full w-full gap-0.5">
						{#each [0, 1] as subCol (subCol)}
							{@const step = globalCol * 2 + subCol}
							{@const isSubCurrent = isColActive && activeSubCol === subCol}
							{@const tracksWithNote = visibleTracks.filter((t) => t.grid[step]?.includes(actualIdx))}
							{@const hasNote = tracksWithNote.length > 0}
							{@const primaryTrackWithNote = tracksWithNote.find((t) => t.isPrimary)}
							{@const displayColor = primaryTrackWithNote ? primaryTrackWithNote.color : tracksWithNote[0]?.color || '#fff'}
							{@const isPrimaryNote = Boolean(primaryTrackWithNote)}
							{@const isPrevConnected = hasNote && visibleTracks.some((t) => t.grid[step]?.includes(actualIdx) && (t.grid[step - 1]?.includes(actualIdx) || false))}
							{@const isNextConnected = hasNote && visibleTracks.some((t) => t.grid[step]?.includes(actualIdx) && (t.grid[step + 1]?.includes(actualIdx) || false))}
							{@const roundedClass = hasNote
								? isPrevConnected && isNextConnected
									? 'rounded-none border-x-0'
									: isPrevConnected
										? 'rounded-l-none rounded-r-xs border-l-0'
										: isNextConnected
											? 'rounded-r-none rounded-l-xs border-r-0 border-l-2 border-white/70'
											: 'rounded-xs border-l-2 border-white/70'
								: 'rounded-xs'}
							{@const spanMargin = hasNote ? (isPrevConnected && isNextConnected ? '-mx-[1.5px] z-[2]' : isPrevConnected ? '-ml-[1.5px] z-[2]' : isNextConnected ? '-mr-[1.5px] z-[2]' : '') : ''}
							<button
								onclick={() => onSubCellClick(actualIdx, colIdx, subCol)}
								class="flex-1 h-full cursor-pointer border {roundedClass} {spanMargin} transition-colors relative {hasNote
									? `shadow-xs ${isSubCurrent ? 'brightness-125 ring-1 ring-white' : ''}`
									: isSubCurrent
										? 'border-white/70 bg-white/30'
										: isBarStart && subCol === 0
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
								style="background-color: {hasNote ? displayColor : ''}; border-color: {hasNote ? displayColor : ''}; opacity: {hasNote && !isPrimaryNote ? 0.75 : 1};"
								title={`Step ${step + 1} (${subCol === 0 ? 'Left' : 'Right'} half)${hasNote ? ` — ${tracksWithNote.length} note(s)` : ''}`}
							></button>
						{/each}
					</div>
				{:else}
					<button
						onclick={() => onCellClick(actualIdx, colIdx)}
						class="relative w-full h-full cursor-pointer rounded-xs border transition-colors {isColActive
							? 'border-white/70 bg-white/25 shadow-xs'
							: isBarStart
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
					>
						{#each visibleTracks as t (t.id)}
							{@const geom = noteBarGeometry(t, step0, step1)}
							{#if geom}
								<div
									class="absolute top-0 h-full {geom.leftClass} {geom.rightClass} shadow-xs {t.isPrimary ? 'z-[3] opacity-100' : 'z-[2] opacity-75'} {isColActive && t.isPrimary ? 'brightness-125 ring-1 ring-white' : ''}"
									style="background-color: {t.color}; left: {geom.leftStyle}; width: {geom.widthStyle};"
								></div>
							{/if}
						{/each}
					</button>
				{/if}
			</div>
		{/each}
	</div>
</div>
