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
		rollHeight
	}: {
		/** Steps visible on this page. */
		steps: number;
		startStep: number;
		snapSteps: number;
		colsPerPage: number;
		spc: number;
		effColsPerBar: number;
		/** How tall the roll is, so the expanded editor can cover it. */
		rollHeight: number;
	} = $props();

	const FOLDED_H = 26;
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
		<div
			class="border border-white/20 rounded-xs bg-black mb-1"
			style="height: {expandedH}px"
		>
			<!-- Chips built like the TRK row: every lane is drawn at once, and the
			     chip says which one the pointer edits. Same shape, same reading --
			     a filled square is the one you are working on, a hollow one is
			     visible but not being drawn. -->
			<div class="flex items-center gap-1.5 px-1 h-6 border-b border-white/10 text-xs font-mono overflow-x-auto no-scrollbar">
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
							onclick={() => { selectLane(l.id); playSound('click'); }}
							class="press pl-1.5 pr-0.5 py-0.5 flex items-center justify-center cursor-pointer group"
							title={l.mode === 'sampled'
								? $t('synthPanels.lane.sampledHint')
								: $t('synthPanels.lane.continuousHint')}
						>
							<span
								class="w-2.5 h-2.5 inline-block shrink-0 rounded-[1px] transition-all {isEditing
									? 'shadow-[0_0_6px_currentColor]'
									: 'border border-current bg-transparent opacity-60 group-hover:opacity-100'}"
								style="color: {l.color}; background-color: {isEditing ? l.color : 'transparent'}; border-color: {l.color};"
							></span>
						</button>
						<button
							type="button"
							onclick={() => { selectLane(l.id); playSound('click'); }}
							class="press pl-1 pr-1.5 py-0.5 font-bold cursor-pointer flex items-center transition-colors"
							style={isEditing ? `color: ${l.color}` : ''}
						>{l.name}</button>
						{#if l.id !== 'vel'}
							<button
								onclick={() => { removeTrackLane(l.id); playSound('click'); }}
								class="press px-1 border-l border-white/15 text-[#e06c75] hover:text-white cursor-pointer leading-none"
								title={$t('synthPanels.lane.removeHint')}>×</button>
						{/if}
					</div>
				{/each}

				{#if $lanesRemaining > 0}
					<button
						onclick={() => { addTrackLane(); playSound('click'); }}
						class="press px-1.5 py-0.5 rounded-xs border border-white/25 text-white/60 hover:text-white hover:border-white/60 cursor-pointer shrink-0 font-bold"
						title={$t('synthPanels.lane.addHint')}>+</button>
				{/if}

				<span class="flex-1"></span>

				<button
					onclick={() => { resetLane(); playSound('click'); }}
					class="press px-1 py-0.5 rounded-xs border border-white/25 text-white/50 hover:text-white hover:border-white/60 cursor-pointer"
					title={$t('synthPanels.lane.clearHint')}>CLR</button>
				<button
					onclick={() => { toggleLaneEditor(); playSound('click'); }}
					class="press px-1 py-0.5 rounded-xs border border-white/25 text-white/60 hover:text-white hover:border-white/60 cursor-pointer"
					title={$t('synthPanels.lane.closeHint')}>▾</button>
			</div>

			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={stripEl}
				onpointerdown={onDown}
				onpointermove={onMove}
				onpointerup={onUp}
				onpointercancel={onUp}
				class="relative cursor-crosshair"
				style="height: {expandedH - 20}px"
			>
				<svg class="absolute inset-0 w-full h-full" viewBox="0 0 100 {expandedH - 20}" preserveAspectRatio="none">
					<!-- Bar lines, so a curve can be aimed at the bar it belongs to. -->
					{#each Array.from({ length: Math.ceil(colsPerPage / effColsPerBar) + 1 }) as _, b (b)}
						<line
							x1={(b * effColsPerBar * spc / steps) * 100} x2={(b * effColsPerBar * spc / steps) * 100}
							y1="0" y2={expandedH - 20}
							stroke="rgba(86,182,194,0.35)" stroke-width="0.4" vector-effect="non-scaling-stroke" />
					{/each}
					<line x1="0" x2="100" y1={(expandedH - 20) / 2} y2={(expandedH - 20) / 2}
						stroke="rgba(255,255,255,0.12)" stroke-width="1" vector-effect="non-scaling-stroke" />

					<!-- Every lane at once, like OVLY draws every track: the one being
					     edited is solid and the rest sit behind it, so a curve can be
					     shaped against the others rather than in isolation. -->
					{#each $trackLanes as l (l.id)}
						{#if l.id !== $activeLaneId}
							<polyline points={pathOf(l, expandedH - 20)} fill="none" stroke={l.color}
								stroke-opacity="0.5" stroke-width="1.5" stroke-dasharray="3 2"
								vector-effect="non-scaling-stroke" />
						{/if}
					{/each}
					{#if $activeLane}
						<polyline points={pathOf($activeLane, expandedH - 20)} fill="none"
							stroke={$activeLane.color} stroke-width="2" vector-effect="non-scaling-stroke" />
					{/if}
				</svg>
			</div>
		</div>
	{/if}

	<!-- Folded: every lane at a glance, and the handle that opens the editor. -->
	<div class="flex items-center gap-1 pt-1 border-t border-white/10 text-xs font-mono">
		<button
			onclick={() => { toggleLaneEditor(); playSound('click'); }}
			class="w-9 shrink-0 text-right pr-1 font-black cursor-pointer transition-colors {$laneEditorOpen
				? 'text-[#e5c07b]'
				: 'text-[#e06c75] hover:text-white'}"
			title={$t('synthPanels.lane.toggleHint')}
		>LANE</button>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="flex-1 relative border border-white/10 rounded-xs bg-black/40 cursor-pointer"
			style="height: {FOLDED_H}px"
			onpointerdown={() => { if (!$laneEditorOpen) { toggleLaneEditor(); playSound('click'); } }}
		>
			<svg class="absolute inset-0 w-full h-full" viewBox="0 0 100 {FOLDED_H}" preserveAspectRatio="none">
				{#each $trackLanes as l (l.id)}
					<polyline points={pathOf(l, FOLDED_H)} fill="none" stroke={l.color}
						stroke-width={l.id === $activeLaneId ? 1.6 : 1}
						stroke-opacity={l.id === $activeLaneId ? 1 : 0.45}
						vector-effect="non-scaling-stroke" />
				{/each}
			</svg>
		</div>
	</div>
</div>
