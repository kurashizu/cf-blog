<script lang="ts">
	import { t } from '../../../i18n';
	import { playSound } from '../../../sound';
	import { laneAt, type NoteLane } from '../../../stores/note-lanes';
	import {
		laneEditorOpen,
		activeLaneId,
		activeLane,
		trackLanes,
		lanesRemaining,
		toggleLaneEditor,
		selectLane,
		addTrackLane,
		removeTrackLane,
		paintLane,
		paintLaneRun,
		resetLane
	} from '../../../stores/lane-edit';

	/**
	 * The automation lanes, in the strip the accent row used to occupy.
	 *
	 * Folded it is a few pixels of curve per lane -- enough to read the shape of
	 * the dynamics without spending roll height on it. Clicking opens the
	 * editor, which draws upward OVER the roll rather than pushing it down: a
	 * crescendo is aimed at particular notes, so you need to see them while
	 * drawing, and the notes showing through behind the curve is the whole point.
	 */
	let {
		steps,
		startStep,
		snapSteps,
		colsPerPage,
		spc,
		effColsPerBar,
		effColsPerBeat,
		rollHeight
	}: {
		/** Steps visible on this page. */
		steps: number;
		startStep: number;
		snapSteps: number;
		colsPerPage: number;
		spc: number;
		effColsPerBar: number;
		effColsPerBeat: number;
		/** How tall the roll is, so the expanded editor can cover it. */
		rollHeight: number;
	} = $props();

	const FOLDED_H = 26;
	/* The beat numbers along the bottom of the plot. Named because three things
	   have to agree on it: the ruler itself, the 0 label above it, and the value
	   axis, which would otherwise put its last reading underneath the numbers. */
	const BEAT_RULER_H = 10;
	/* Tall enough to place a value by eye, short enough that the notes it is
	   drawn over are still readable underneath. */
	let expandedH = $derived(Math.max(120, Math.min(260, rollHeight - 60)));

	let stripEl = $state<HTMLDivElement | null>(null);
	let drag = $state<{ step: number; value: number } | null>(null);

	/** Pointer x/y to a step and a 0..1 value. */
	function at(e: PointerEvent): { step: number; value: number } | null {
		const r = stripEl?.getBoundingClientRect();
		if (!r || r.width <= 0) return null;
		const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
		const step = startStep + Math.floor(fx * steps);
		// Up is louder: the reading a fader gives, not the one a screen does.
		const value = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
		return { step, value };
	}

	function onDown(e: PointerEvent) {
		if (!$laneEditorOpen) return;
		if (e.button === 2) return;
		const p = at(e);
		if (!p) return;
		e.preventDefault();
		/* Capture so a drag that leaves the strip keeps drawing -- but never let
		   it stop the stroke: capture throws for a pointer id the element does
		   not own, and an exception here aborted the handler before it painted
		   anything. */
		try {
			stripEl?.setPointerCapture?.(e.pointerId);
		} catch {
			/* not a real pointer, or already released */
		}
		drag = p;
		paintLane(p.step, p.value, snapSteps);
	}

	function onMove(e: PointerEvent) {
		if (!drag || !$laneEditorOpen) return;
		const p = at(e);
		if (!p) return;
		/* Interpolate from the last point rather than writing this one alone:
		   pointer events do not fire per pixel, so a quick sweep otherwise
		   lands as a row of disconnected spikes. */
		paintLaneRun(drag.step, drag.value, p.step, p.value, snapSteps);
		drag = p;
	}

	function onUp() {
		drag = null;
	}

	/** A lane's curve as a polyline across the visible page. */
	function pathOf(lane: NoteLane, h: number): string {
		const pts: string[] = [];
		for (let i = 0; i <= steps; i += Math.max(1, Math.floor(snapSteps / 2))) {
			const v = laneAt(lane, startStep + i);
			pts.push(`${(i / steps) * 100},${(1 - v) * h}`);
		}
		return pts.join(' ');
	}
</script>

<div class="shrink-0 select-none">
	<!-- The expanded editor. Takes the roll's space rather than floating over it:
	     a curve is read against a grid, and a translucent panel put the roll's
	     own lines behind every value you were trying to judge. The roll gives up
	     the height and takes it back on collapse. -->
	{#if $laneEditorOpen}
		<div class="border border-white/20 rounded-xs bg-black mb-1" style="height: {expandedH}px">
			<!-- Chips built like the TRK row: every lane is drawn at once, and the
			     chip says which one the pointer edits. Same shape, same reading --
			     a filled square is the one you are working on, a hollow one is
			     visible but not being drawn. -->
			<div
				class="flex items-center gap-1.5 px-1 h-6 border-b border-white/10 text-xs font-mono overflow-x-auto no-scrollbar"
			>
				<span class="text-white/50 font-bold shrink-0 select-none">LANE:</span>
				{#each $trackLanes as l (l.id)}
					{@const isEditing = $activeLaneId === l.id}
					<div
						class="flex items-center border rounded-xs transition-all shrink-0 {isEditing
							? 'border-white bg-white/20 text-white shadow-sm ring-1 ring-white/60'
							: 'border-white/15 opacity-50 hover:opacity-90'}"
					>
						<button
							type="button"
							onclick={() => {
								selectLane(l.id);
								playSound('click');
							}}
							class="press pl-1.5 pr-0.5 py-0.5 flex items-center justify-center cursor-pointer group"
							title={l.mode === 'sampled'
								? $t('synthPanels.lane.sampledHint')
								: $t('synthPanels.lane.continuousHint')}
						>
							<span
								class="w-2.5 h-2.5 inline-block shrink-0 rounded-[1px] transition-all {isEditing
									? 'shadow-[0_0_6px_currentColor]'
									: 'border border-current bg-transparent opacity-60 group-hover:opacity-100'}"
								style="color: {l.color}; background-color: {isEditing
									? l.color
									: 'transparent'}; border-color: {l.color};"
							></span>
						</button>
						<button
							type="button"
							onclick={() => {
								selectLane(l.id);
								playSound('click');
							}}
							class="press pl-1 pr-1.5 py-0.5 font-bold cursor-pointer flex items-center transition-colors"
							style={isEditing ? `color: ${l.color}` : ''}>{l.name}</button
						>
						{#if l.id !== 'vel'}
							<button
								onclick={() => {
									removeTrackLane(l.id);
									playSound('click');
								}}
								class="press px-1 border-l border-white/15 text-[#e06c75] hover:text-white cursor-pointer leading-none"
								title={$t('synthPanels.lane.removeHint')}>×</button
							>
						{/if}
					</div>
				{/each}

				{#if $lanesRemaining > 0}
					<button
						onclick={() => {
							addTrackLane();
							playSound('click');
						}}
						class="press px-1.5 py-0.5 rounded-xs border border-white/25 text-white/60 hover:text-white hover:border-white/60 cursor-pointer shrink-0 font-bold"
						title={$t('synthPanels.lane.addHint')}>+</button
					>
				{/if}

				<span class="flex-1"></span>

				<button
					onclick={() => {
						resetLane();
						playSound('click');
					}}
					class="press px-1 py-0.5 rounded-xs border border-white/25 text-white/50 hover:text-white hover:border-white/60 cursor-pointer"
					title={$t('synthPanels.lane.clearHint')}>CLR</button
				>
				<button
					onclick={() => {
						toggleLaneEditor();
						playSound('click');
					}}
					class="press px-1 py-0.5 rounded-xs border border-white/25 text-white/60 hover:text-white hover:border-white/60 cursor-pointer"
					title={$t('synthPanels.lane.closeHint')}>▾</button
				>
			</div>

			<div class="flex" style="height: {expandedH - 20}px">
				<!-- A value scale down the left, in exactly the 40px the roll reserves
			     for its note names. Same gutter, so step 0 of the lane sits above
			     step 0 of the grid: a curve is drawn at particular notes, and a
			     plot offset by even a few pixels from the notes it shapes is
			     worse than no ruler at all.
			
			     Percent, because a lane is normalised and does not know what it
			     will end up driving. -->
				<div
					class="shrink-0 relative border-r border-white/10 text-[8px] font-mono text-white/40 select-none"
					style="width: 40px"
				>
					{#each [1, 0.75, 0.5, 0.25, 0] as v (v)}
						<!-- Nudged inward at both ends rather than centred on the line.
					
					     A label is centred on its value, so at 100 the top half sat
					     above the plot and at 0 the bottom half sat below it -- both
					     clipped by the panel edge. The two extremes hang inside
					     instead: 100 sits just under its line, 0 just above its own,
					     which is how a fader scale is printed anyway. -->
						<!-- Both extremes hang INSIDE their line rather than straddling it:
					     100 sits just below the top, 0 just above the bottom. Centred,
					     each had half its height outside the plot and was clipped by
					     the panel -- and at the bottom the beat ruler took that space
					     as well, so 0 overflowed twice over. -->
						<span
							class="absolute right-1 leading-none"
							style="top: {v === 1
								? 1
								: v === 0
									? expandedH - 20 - BEAT_RULER_H - 14
									: (1 - v) * (expandedH - 20) - 4}px">{Math.round(v * 100)}</span
						>
					{/each}
				</div>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					bind:this={stripEl}
					onpointerdown={onDown}
					onpointermove={onMove}
					onpointerup={onUp}
					onpointercancel={onUp}
					class="relative cursor-crosshair flex-1"
					style="height: {expandedH - 20}px"
				>
					<svg
						class="absolute inset-0 w-full h-full"
						viewBox="0 0 100 {expandedH - 20}"
						preserveAspectRatio="none"
					>
						<!-- The same divisions the roll draws: a line per snap column, a
					     brighter one per beat, brightest per bar. Without them the plot
					     was an undivided rectangle and a point could not be placed at a
					     beat except by eye. -->
						{#each Array.from({ length: colsPerPage + 1 }) as _, c (c)}
							{@const isBar = c % effColsPerBar === 0}
							{@const isBeat = c % effColsPerBeat === 0}
							<line
								x1={((c * spc) / steps) * 100}
								x2={((c * spc) / steps) * 100}
								y1="0"
								y2={expandedH - 20}
								stroke={isBar
									? 'rgba(86,182,194,0.55)'
									: isBeat
										? 'rgba(255,255,255,0.22)'
										: 'rgba(255,255,255,0.08)'}
								stroke-width={isBar ? 1 : 0.5}
								vector-effect="non-scaling-stroke"
							/>
						{/each}
						<!-- Quarter lines, so the scale on the left has something to read
					     against: a number in the margin says nothing without a rule
					     across the plot at the same height. -->
						{#each [0.25, 0.5, 0.75] as v (v)}
							<line
								x1="0"
								x2="100"
								y1={(1 - v) * (expandedH - 20)}
								y2={(1 - v) * (expandedH - 20)}
								stroke={v === 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.07)'}
								stroke-width="1"
								vector-effect="non-scaling-stroke"
							/>
						{/each}

						<!-- Every lane at once, like OVLY draws every track: the one being
					     edited is solid and the rest sit behind it, so a curve can be
					     shaped against the others rather than in isolation. -->
						{#each $trackLanes as l (l.id)}
							{#if l.id !== $activeLaneId}
								<polyline
									points={pathOf(l, expandedH - 20)}
									fill="none"
									stroke={l.color}
									stroke-opacity="0.5"
									stroke-width="1.5"
									stroke-dasharray="3 2"
									vector-effect="non-scaling-stroke"
								/>
							{/if}
						{/each}
						{#if $activeLane}
							<polyline
								points={pathOf($activeLane, expandedH - 20)}
								fill="none"
								stroke={$activeLane.color}
								stroke-width="2"
								vector-effect="non-scaling-stroke"
							/>
						{/if}
					</svg>

					<!-- Beat marks along the bottom, numbered within the bar.
				
				     This was bar numbers, which read "1" and nothing else: the editor
				     shows one bar at a time, so numbering bars said only which page
				     you were already looking at. Beats are the useful subdivision
				     here, and they line up with the roll's ruler above. -->
					<div
						class="absolute left-0 right-0 bottom-0 pointer-events-none"
						style="height: {BEAT_RULER_H}px"
					>
						{#each Array.from( { length: Math.max(1, Math.floor(colsPerPage / effColsPerBeat)) } ) as _, b (b)}
							<span
								class="absolute text-[7px] font-mono text-white/30 leading-none"
								style="left: calc({((b * effColsPerBeat * spc) / steps) * 100}% + 2px); bottom: 1px"
								>{b + 1}</span
							>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Folded: every lane at a glance, and the handle that opens the editor. -->
	<div class="flex items-center gap-1 pt-1 border-t border-white/10 text-xs font-mono">
		<button
			onclick={() => {
				toggleLaneEditor();
				playSound('click');
			}}
			style="width: 40px"
			class="shrink-0 text-right pr-1 font-black cursor-pointer transition-colors {$laneEditorOpen
				? 'text-[#e5c07b]'
				: 'text-[#e06c75] hover:text-white'}"
			title={$t('synthPanels.lane.toggleHint')}>LANE</button
		>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="flex-1 relative border border-white/10 rounded-xs bg-black/40 cursor-pointer"
			style="height: {FOLDED_H}px"
			onpointerdown={() => {
				if (!$laneEditorOpen) {
					toggleLaneEditor();
					playSound('click');
				}
			}}
		>
			<svg
				class="absolute inset-0 w-full h-full"
				viewBox="0 0 100 {FOLDED_H}"
				preserveAspectRatio="none"
			>
				{#each $trackLanes as l (l.id)}
					<polyline
						points={pathOf(l, FOLDED_H)}
						fill="none"
						stroke={l.color}
						stroke-width={l.id === $activeLaneId ? 1.6 : 1}
						stroke-opacity={l.id === $activeLaneId ? 1 : 0.45}
						vector-effect="non-scaling-stroke"
					/>
				{/each}
			</svg>
		</div>
	</div>
</div>
