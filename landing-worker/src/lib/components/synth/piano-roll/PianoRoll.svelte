<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { playSound } from '../../../sound';
	import { t } from '../../../i18n';
	import { modularSynth, PIANO_ROLL_NOTES, METER_SPECS, stepsPerColumn, hasSubColumns, ternaryColFactor, divToStepSpan } from '../../../synth';
	import { timeMeter, snapDiv, activeStepPage, cursorStep, seqCurrentStep, isSeqPlaying, totalPatternSteps, activeTrackId } from '../../../stores/synth-transport';
	import { currentTrack, activeTrackRow, activeKey, keyIsCustomised, noteNameOf, resetKeyTimbre, visibleTracks, tracksState, placeOrClearNote, cycleAccent, updateTrack } from '../../../stores/synth-tracks';
	import {
		selection, canUndo, canRedo, undo, redo, runKey, runAt, runsIn, selectedRuns, selectRuns, toggleRun, clearSelection, selectAll,
		deleteRuns, deleteSelection, moveSelection, resizeSelection, duplicateSelection, copySelection, cutSelection, pasteClip,
		transformMove, transformResize, withUndo, beginBatch, endBatch, barSteps, type NoteRun
	} from '../../../stores/synth-edit';
	import { hotkeyOverlayOpen, consoleOverlayOpen } from '../../../stores/chrome';
	import { isSynthSettingsOpen } from '../../../stores/synth-settings';
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
	/** Steps per snap increment: what a click lands on and what a drag or arrow nudge moves by. */
	let snapSteps = $derived(Math.max(1, divToStepSpan($snapDiv)));
	/* The rows that are actually on screen, filtered before the loop.
	   The template used to iterate all 88 notes and hide the out-of-range ones
	   with an {#if} inside, which still creates an each-block per note -- ~50
	   of them holding nothing, on a view that already mounts the most DOM on
	   the site. Filtering here means only the ~36 visible octaves are built,
	   which is most of the difference in how long this tab takes to appear. */
	let visibleNotes = $derived(
		PIANO_ROLL_NOTES.map((nInfo, actualIdx) => ({ nInfo, actualIdx })).filter(
			({ nInfo }) => nInfo.oct >= octaveFrom && nInfo.oct <= octaveTo
		)
	);
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
		const id = $activeTrackId;
		withUndo(id, () => {
			for (let i = 0; i < stepsPerPage; i++) {
				modularSynth.clearTrackStep(id, $activeStepPage * stepsPerPage + i);
			}
		});
		clearSelection();
		tracksState.set([...modularSynth.getTracks()]);
		playSound('click');
	}

	function auditionNote(idx: number) {
		activeKey.set(idx);
		modularSynth.triggerTrackVoice($activeTrackId, idx, 0);
		playSound('click');
	}

	function resetKey(idx: number) {
		resetKeyTimbre($activeTrackId, idx);
		playSound('click');
	}

	let percussion = $derived(!!$activeTrackRow?.percussion);

	/* The track's name, in the roll header, editable in place. Twenty characters
	   show; the rest is an ellipsis and the tooltip. Short names are what the
	   DUCK source stepper and the chips read, so renaming is worth a click. */
	const NAME_SHOW = 20;
	const NAME_MAX = 24;
	let trackName = $derived($activeTrackRow?.name ?? '');
	let shortName = $derived(trackName.length > NAME_SHOW ? trackName.slice(0, NAME_SHOW) + '…' : trackName);
	let editingName = $state(false);
	let nameDraft = $state('');
	let nameInput = $state<HTMLInputElement | null>(null);

	function startRename() {
		nameDraft = trackName;
		editingName = true;
		playSound('click');
		requestAnimationFrame(() => {
			nameInput?.focus();
			nameInput?.select();
		});
	}

	function commitRename() {
		if (!editingName) return;
		editingName = false;
		const next = nameDraft.trim().slice(0, NAME_MAX);
		if (next && next !== trackName) {
			updateTrack($activeTrackId, { name: next });
			playSound('click');
		}
	}

	function onNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') commitRename();
		else if (e.key === 'Escape') editingName = false;
		else return;
		e.preventDefault();
		e.stopPropagation();
	}
	let activeKeyCustom = $derived(keyIsCustomised($activeTrackRow, $activeKey));

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

	/* ------------------------------------------------------------------
	   Editing. One pointer handler on the rows container does everything;
	   the cells only carry data-note / data-step / data-span.
	     click empty        place a note (NOTE DUR long); it becomes the selection
	     drag empty         marquee; Shift adds to the selection
	     click a note       select it; Shift toggles it
	     drag a note        move the selection (snap steps / semitones); Alt drags a copy
	     drag a note's end  resize the selection
	     right-click / drag delete the note(s) under the pointer
	   A move or resize is previewed by rendering a transformed copy of the
	   grid; nothing is written until the pointer goes up.
	   ------------------------------------------------------------------ */
	interface Cell {
		note: number;
		step: number;
		span: number;
		el: HTMLElement;
	}
	type DragMode = 'marquee' | 'move' | 'resize' | 'erase';
	interface Drag {
		mode: DragMode;
		active: boolean;
		x0: number;
		y0: number;
		cell: Cell;
		lastCell: Cell;
		fs0: number;
		shift: boolean;
		copy: boolean;
		base: Set<string>;
		runs: NoteRun[];
		d: { dSteps: number; dNotes: number } | null;
	}

	let rows: HTMLDivElement;
	let rowsWidth = $state(0);
	let drag: Drag | null = null;
	let marquee = $state<{ left: number; top: number; width: number; height: number } | null>(null);
	let marqueeKeys = $state<Set<string> | null>(null);
	let preview = $state<{ grid: number[][]; keys: Set<string> } | null>(null);
	let hoverCursor = $state('');

	/* While a move or resize is in flight the primary track is drawn from the transformed copy. */
	let rowTracks = $derived(preview ? $visibleTracks.map((t) => (t.isPrimary ? { ...t, grid: preview!.grid } : t)) : $visibleTracks);
	let shownSelection = $derived(preview ? preview.keys : (marqueeKeys ?? $selection));

	function cellFromEl(el: Element | null): Cell | null {
		const c = el?.closest?.('[data-step]') as HTMLElement | null;
		if (!c || !rows.contains(c)) return null;
		return { note: Number(c.dataset.note), step: Number(c.dataset.step), span: Number(c.dataset.span), el: c };
	}

	function cellAt(x: number, y: number): Cell | null {
		return cellFromEl(document.elementFromPoint(x, y));
	}

	/** Pointer x inside the cell as a fractional step, so a note narrower than the cell still hits. */
	function fracStep(cell: Cell, x: number): number {
		const r = cell.el.getBoundingClientRect();
		return cell.step + Math.min(0.999, Math.max(0, (x - r.left) / Math.max(1, r.width))) * cell.span;
	}

	function hitRun(cell: Cell, x: number): { run: NoteRun; edge: boolean } | null {
		const grid = $activeTrackRow?.grid;
		if (!grid) return null;
		const fs = fracStep(cell, x);
		let run = runAt(grid, cell.note, Math.floor(fs));
		for (let s = cell.step; !run && s < cell.step + cell.span; s++) run = runAt(grid, cell.note, s);
		if (!run) return null;
		const r = cell.el.getBoundingClientRect();
		const pxPerStep = r.width / cell.span;
		const runPx = run.len * pxPerStep;
		const ptrPx = (fs - run.start) * pxPerStep;
		const zone = Math.min(runPx * 0.5, Math.max(6, runPx * 0.25));
		return { run, edge: runPx - ptrPx <= zone };
	}

	function placeAt(cell: Cell) {
		const start = Math.floor(cell.step / snapSteps) * snapSteps;
		activeKey.set(cell.note);
		placeOrClearNote($activeTrackId, cell.note, start);
	}

	function onPointerDown(e: PointerEvent) {
		if (drag || (e.button !== 0 && e.button !== 2)) return;
		const cell = cellFromEl(e.target as Element);
		if (!cell || !$activeTrackRow) return;
		const total = $totalPatternSteps;
		const common = { active: false, x0: e.clientX, y0: e.clientY, cell, lastCell: cell, fs0: fracStep(cell, e.clientX), shift: e.shiftKey, copy: e.altKey, base: new Set<string>(), runs: [] as NoteRun[], d: null };

		if (e.button === 2) {
			e.preventDefault();
			beginBatch($activeTrackId);
			const hit = hitRun(cell, e.clientX);
			if (hit) deleteRuns([hit.run]);
			drag = { ...common, mode: 'erase', active: true };
			rows.setPointerCapture(e.pointerId);
			return;
		}

		const hit = hitRun(cell, e.clientX);
		if (hit) {
			const k = runKey(hit.run.note, hit.run.start);
			if (e.shiftKey) {
				toggleRun(hit.run);
				if (!get(selection).has(k)) return; // shift-click took it out: nothing to drag
			} else if (!get(selection).has(k)) {
				selectRuns([hit.run]);
			}
			activeKey.set(cell.note);
			if (e.pointerType === 'touch') return;
			drag = { ...common, mode: hit.edge ? 'resize' : 'move', runs: selectedRuns($activeTrackRow.grid, total, get(selection)) };
		} else {
			drag = { ...common, mode: 'marquee', base: e.shiftKey ? new Set(get(selection)) : new Set() };
		}
		rows.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!drag) {
			const cell = cellFromEl(e.target as Element);
			const hit = cell && hitRun(cell, e.clientX);
			hoverCursor = hit ? (hit.edge ? 'ew-resize' : 'grab') : '';
			return;
		}
		if (!drag.active) {
			if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
			drag.active = true;
			if (drag.mode === 'move') hoverCursor = 'grabbing';
		}
		const trk = $activeTrackRow;
		if (!trk) return;
		const total = $totalPatternSteps;
		const cell = cellAt(e.clientX, e.clientY) ?? drag.lastCell;
		drag.lastCell = cell;

		switch (drag.mode) {
			case 'erase': {
				const hit = hitRun(cell, e.clientX);
				if (hit) deleteRuns([hit.run]);
				break;
			}
			case 'marquee': {
				const a = drag.cell;
				const noteLo = Math.min(a.note, cell.note);
				const noteHi = Math.max(a.note, cell.note);
				const stepLo = Math.min(a.step, cell.step);
				const stepHi = Math.max(a.step + a.span, cell.step + cell.span);
				const keys = new Set(drag.base);
				for (const r of runsIn(trk.grid, total, noteLo, noteHi, stepLo, stepHi)) keys.add(runKey(r.note, r.start));
				marqueeKeys = keys;
				const ra = a.el.getBoundingClientRect();
				const rb = cell.el.getBoundingClientRect();
				const rc = rows.getBoundingClientRect();
				const left = Math.min(ra.left, rb.left);
				const top = Math.min(ra.top, rb.top);
				marquee = {
					left: left - rc.left + rows.scrollLeft,
					top: top - rc.top + rows.scrollTop,
					width: Math.max(ra.right, rb.right) - left,
					height: Math.max(ra.bottom, rb.bottom) - top
				};
				break;
			}
			case 'move': {
				const dSteps = Math.round((fracStep(cell, e.clientX) - drag.fs0) / snapSteps) * snapSteps;
				const dNotes = cell.note - drag.cell.note;
				const out = transformMove(trk.grid, trk.accents as number[], total, drag.runs, dSteps, dNotes, drag.copy);
				preview = { grid: out.grid, keys: out.keys };
				drag.d = { dSteps: out.dSteps, dNotes: out.dNotes };
				break;
			}
			case 'resize': {
				const dLen = Math.round((fracStep(cell, e.clientX) - drag.fs0) / snapSteps) * snapSteps;
				const out = transformResize(trk.grid, total, drag.runs, dLen);
				preview = { grid: out.grid, keys: out.keys };
				drag.d = { dSteps: dLen, dNotes: 0 };
				break;
			}
		}
	}

	function finishDrag(e: PointerEvent, commit: boolean) {
		const d = drag;
		if (!d) return;
		drag = null;
		hoverCursor = '';
		marquee = null;
		const keys = marqueeKeys;
		marqueeKeys = null;
		preview = null;
		try {
			rows.releasePointerCapture(e.pointerId);
		} catch {
			/* already released */
		}

		if (d.mode === 'erase') {
			endBatch();
			return;
		}
		if (!commit) return;
		if (!d.active) {
			// A plain click. On a note the selection was settled on the way down.
			if (d.mode === 'marquee') {
				if (!d.shift) clearSelection();
				placeAt(d.cell);
			}
			return;
		}
		if (d.mode === 'marquee') {
			selection.set(keys ?? d.base);
		} else if (d.mode === 'move' && d.d && (d.d.dSteps || d.d.dNotes || d.copy)) {
			moveSelection(d.d.dSteps, d.d.dNotes, d.copy);
			playSound('click');
		} else if (d.mode === 'resize' && d.d?.dSteps) {
			resizeSelection(d.d.dSteps);
			playSound('click');
		}
	}

	function cancelDrag() {
		if (!drag) return;
		if (drag.mode === 'erase') endBatch();
		drag = null;
		hoverCursor = '';
		marquee = null;
		marqueeKeys = null;
		preview = null;
	}

	/* Keyboard: registered in the capture phase so the transport's and the
	   QWERTY piano's window listeners see these keys only when nothing here
	   wanted them. Ctrl/Cmd combos are free (both other listeners skip them);
	   Delete, Backspace, Esc and the arrows only act while a selection exists. */
	function onKeydown(e: KeyboardEvent) {
		if ($hotkeyOverlayOpen || $consoleOverlayOpen || $isSynthSettingsOpen) return;
		const target = e.target as HTMLElement | null;
		const tag = target?.tagName?.toLowerCase() ?? '';
		if (['input', 'textarea', 'select'].includes(tag) || target?.isContentEditable) return;
		const mod = e.ctrlKey || e.metaKey;
		const hasSel = $selection.size > 0;

		if (mod && !e.altKey) {
			switch (e.key.toLowerCase()) {
				case 'a': selectAll($activeStepPage * stepsPerPage, stepsPerPage); break;
				case 'c': if (!copySelection()) return; break;
				case 'x': if (!cutSelection()) return; break;
				case 'v':
					// Let the native paste event through: it carries the clipboard text
					// without a permission prompt. If none arrives (empty clipboard,
					// another browser), the in-page clip is pasted after a beat.
					pasteKeyAt = performance.now();
					window.setTimeout(() => {
						if (pasteKeyAt && performance.now() - pasteKeyAt >= 80) {
							pasteKeyAt = 0;
							if (pasteClip(null)) playSound('click');
						}
					}, 100);
					return;
				case 'd': if (!duplicateSelection()) return; break;
				case 'z': if (!(e.shiftKey ? redo() : undo())) return; break;
				case 'y': if (!redo()) return; break;
				default: return;
			}
			e.preventDefault();
			e.stopPropagation();
			playSound('click');
			return;
		}
		if (e.key === 'Escape') {
			if (drag) cancelDrag();
			else if (hasSel) clearSelection();
			else return;
			e.preventDefault();
			return;
		}
		if (!hasSel || e.altKey) return;
		switch (e.key) {
			case 'Delete':
			case 'Backspace': deleteSelection(); break;
			case 'ArrowLeft': moveSelection(-(e.shiftKey ? barSteps() : snapSteps), 0); break;
			case 'ArrowRight': moveSelection(e.shiftKey ? barSteps() : snapSteps, 0); break;
			case 'ArrowUp': moveSelection(0, -(e.shiftKey ? 12 : 1)); break; // lower index = higher pitch
			case 'ArrowDown': moveSelection(0, e.shiftKey ? 12 : 1); break;
			default: return;
		}
		e.preventDefault();
		e.stopPropagation();
		playSound('click');
	}

	let pasteKeyAt = 0;
	function onPaste(e: ClipboardEvent) {
		if ($hotkeyOverlayOpen || $consoleOverlayOpen || $isSynthSettingsOpen) return;
		const target = e.target as HTMLElement | null;
		const tag = target?.tagName?.toLowerCase() ?? '';
		if (['input', 'textarea', 'select'].includes(tag) || target?.isContentEditable) return;
		pasteKeyAt = 0;
		const text = e.clipboardData?.getData('text/plain') ?? '';
		if (pasteClip(text)) {
			e.preventDefault();
			playSound('click');
		}
	}

	onMount(() => {
		window.addEventListener('keydown', onKeydown, true);
		window.addEventListener('paste', onPaste, true);
		return () => {
			window.removeEventListener('keydown', onKeydown, true);
			window.removeEventListener('paste', onPaste, true);
		};
	});

	function pointerEdit(node: HTMLElement) {
		const h_pointerdown = onPointerDown;
		node.addEventListener('pointerdown', h_pointerdown as EventListener);
		const h_pointermove = onPointerMove;
		node.addEventListener('pointermove', h_pointermove as EventListener);
		const h_pointerup = (e: PointerEvent) => finishDrag(e, true);
		node.addEventListener('pointerup', h_pointerup as EventListener);
		const h_pointercancel = (e: PointerEvent) => finishDrag(e, false);
		node.addEventListener('pointercancel', h_pointercancel as EventListener);
		const h_contextmenu = (e: MouseEvent) => e.preventDefault();
		node.addEventListener('contextmenu', h_contextmenu as EventListener);
		return {
			destroy() {
				node.removeEventListener('pointerdown', h_pointerdown as EventListener);
				node.removeEventListener('pointermove', h_pointermove as EventListener);
				node.removeEventListener('pointerup', h_pointerup as EventListener);
				node.removeEventListener('pointercancel', h_pointercancel as EventListener);
				node.removeEventListener('contextmenu', h_contextmenu as EventListener);
			}
		};
	}
</script>

<div class="border border-white/20 p-1.5 bg-black/60 rounded-xs flex-1 min-h-0 flex flex-col overflow-hidden gap-1">
	<div class="flex flex-wrap items-center justify-between gap-1.5 text-xs font-bold shrink-0">
		<div class="flex items-center gap-2">
			<span class="font-black text-xs" style="color: {$currentTrack.color}">PIANO ROLL</span>
			{#if editingName}
				<input
					bind:this={nameInput}
					bind:value={nameDraft}
					onkeydown={onNameKeydown}
					onblur={commitRename}
					maxlength={NAME_MAX}
					spellcheck="false"
					aria-label={$t('synthPanels.roll.trackNameLabel')}
					class="w-[190px] px-1.5 py-0.5 text-xs font-mono font-bold bg-black/60 border rounded-xs outline-none text-white"
					style="border-color: {$currentTrack.color}"
				/>
			{:else}
				<button
					onclick={startRename}
					title={$t('synthPanels.roll.renameHint', { name: trackName, track: $activeTrackId + 1, max: NAME_MAX, show: NAME_SHOW })}
					class="press px-1.5 py-0.5 text-xs font-mono font-bold rounded-xs border cursor-pointer transition-colors hover:brightness-125 max-w-[190px] truncate"
					style="color: {$currentTrack.color}; border-color: color-mix(in srgb, {$currentTrack.color} 50%, transparent); background: color-mix(in srgb, {$currentTrack.color} 12%, transparent)"
				>
					{shortName}
				</button>
			{/if}
			{#if percussion}
				<!-- Which key the racks are editing, and whether it has its own sound yet -->
				<span class="text-xs font-mono font-bold text-[#c678dd]" title={activeKeyCustom ? $t('synthPanels.roll.keyCustomHint', { note: noteNameOf($activeKey) }) : $t('synthPanels.roll.keyDefaultHint', { note: noteNameOf($activeKey) })}>
					KEY {noteNameOf($activeKey)} {activeKeyCustom ? '●' : '○'}
				</span>
			{/if}
			<span class="text-xs text-[#98c379] font-mono font-bold">
				BAR {Math.floor($seqCurrentStep / stepsPerPage) + 1}.{Math.floor(($seqCurrentStep % stepsPerPage) / (stepsPerPage / meterSpec.beatsPerBar)) + 1} (STEP {$seqCurrentStep + 1}/{$totalPatternSteps})
			</span>
		</div>

		<div class="flex items-center gap-1.5 text-xs">
			{#if $selection.size}
				<span class="text-xs font-mono font-bold text-white/80 px-1.5 py-0.5 border border-white/40 rounded-xs" title={$t('synthPanels.roll.selectionHint')}>
					SEL {$selection.size}
				</span>
			{/if}
			<button onclick={() => { if (undo()) playSound('click'); }} disabled={!$canUndo} class="press border border-white/20 px-1.5 py-0.5 rounded-xs hover:border-white/50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold transition-colors" title={$t('synthPanels.roll.undoHint')}>↶</button>
			<button onclick={() => { if (redo()) playSound('click'); }} disabled={!$canRedo} class="press border border-white/20 px-1.5 py-0.5 rounded-xs hover:border-white/50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold transition-colors" title={$t('synthPanels.roll.redoHint')}>↷</button>
			<button onclick={clearPage} class="press border border-white/20 px-2 py-0.5 rounded-xs hover:border-red-400 text-red-300 cursor-pointer text-xs font-bold transition-colors" title={$t('synthPanels.roll.clearPageHint')}>
				✕ CLR
			</button>

			<span class="opacity-30">|</span>

			<div class="flex items-center gap-1 text-xs">
				<span class="opacity-60 text-xs font-bold" title={$t('synthPanels.roll.octScopeHint')}>OCT:</span>

				<div class="flex items-center gap-0.5">
					<span class="text-white/50 text-[10px] font-bold">FROM</span>
					<button
						onclick={() => {
							octaveFrom = Math.max(1, octaveFrom - 1);
							playSound('click');
						}}
						disabled={octaveFrom <= 1}
						class="press px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs transition-colors"
						title={$t('synthPanels.roll.lowerStartHint')}
					>
						◄
					</button>
					<span class="px-1.5 py-0.5 text-xs font-mono font-bold bg-white/10 rounded-xs text-[#56b6c2] min-w-[20px] text-center" title={$t('synthPanels.roll.startOctaveHint', { octave: octaveFrom })}>{octaveFrom}</span>
					<button
						onclick={() => {
							octaveFrom = Math.min(octaveTo, octaveFrom + 1);
							playSound('click');
						}}
						disabled={octaveFrom >= octaveTo}
						class="press px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs transition-colors"
						title={$t('synthPanels.roll.raiseStartHint')}
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
						title={$t('synthPanels.roll.lowerEndHint')}
					>
						◄
					</button>
					<span class="px-1.5 py-0.5 text-xs font-mono font-bold bg-white/10 rounded-xs text-[#e5c07b] min-w-[20px] text-center" title={$t('synthPanels.roll.endOctaveHint', { octave: octaveTo })}>{octaveTo}</span>
					<button
						onclick={() => {
							octaveTo = Math.min(7, octaveTo + 1);
							playSound('click');
						}}
						disabled={octaveTo >= 7}
						class="press px-1.5 py-0.5 border border-white/20 rounded-xs font-bold disabled:opacity-30 hover:border-white/50 cursor-pointer disabled:cursor-not-allowed text-xs transition-colors"
						title={$t('synthPanels.roll.raiseEndHint')}
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
															: 'text-white/50 hover:bg-white/10 hover:text-white/70'}"
											title={$t('synthPanels.roll.jumpToStepHint', { step: step + 1, bar: barNum, beat: beatNum })}
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
													: 'text-white/50 hover:bg-white/10 hover:text-white/70'}"
									title={$t('synthPanels.roll.jumpToColumnHint', { column: colIdx + 1, step: globalCol * spc + 1, bar: barNum, beat: beatNum })}
								>
									{isBarStart ? `${barNum}.1` : isBeatStart ? `${barNum}.${beatNum}` : `${colIdx + 1}`}
								</button>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- Scrollable note rows. Pointer editing is attached as an action: the rows are a drawing surface, not a control; the keyboard path is the grid above. -->
			<div
				bind:this={rows}
				data-target-size-essential
				bind:clientWidth={rowsWidth}
				class="relative flex-1 min-h-0 space-y-0.5 font-mono text-xs pr-0.5 flex flex-col overflow-y-auto custom-scrollbar select-none"
				style="cursor: {hoverCursor || 'auto'}; touch-action: pan-y;"
				use:pointerEdit
			>
				{#each visibleNotes as { nInfo, actualIdx } (nInfo.note)}
					<PianoRollRow
						{nInfo}
						{actualIdx}
						visibleTracks={rowTracks}
						{viewportStartCol}
						timeMeter={$timeMeter}
						snapDiv={$snapDiv}
						selected={shownSelection}
						{percussion}
						isActiveKey={percussion && $activeKey === actualIdx}
						isCustomKey={percussion && keyIsCustomised($activeTrackRow, actualIdx)}
						onResetKey={resetKey}
						onAudition={auditionNote}
					/>
				{/each}
				<!-- The playhead: one element moved per step. It used to be a prop on
				     every row, which re-evaluated ~600 cell classes 46 times a second at
				     115 BPM and held the whole page to ~30 fps. -->
				{#if activeCol >= 0 && rowsWidth > 40}
					{@const pitch = (rowsWidth - 40) / colsPerPage}
					{@const sub = hasSubColumns($snapDiv)}
					<div
						class="absolute top-0 left-0 !mt-0 z-[1] pointer-events-none rounded-xs bg-white/20 border border-white/60 will-change-transform"
						style="transform: translateX({40 + (activeCol + (sub ? activeSubCol * 0.5 : 0)) * pitch}px); width: {pitch / (sub ? 2 : 1) - 2}px; height: {visibleNotes.length * 20 - 2}px;"
					></div>
				{/if}
				{#if marquee}
					<div class="absolute z-[5] pointer-events-none border border-white/70 bg-white/10 rounded-xs" style="left: {marquee.left}px; top: {marquee.top}px; width: {marquee.width}px; height: {marquee.height}px;"></div>
				{/if}
			</div>

			<!-- Fixed accent track: one cell per half-step, so its targets are the
			     grid itself (WCAG 2.5.8 essential-size exception, see tests/a11y). -->
			<div data-target-size-essential class="flex items-center gap-1 pt-1 border-t border-white/10 text-xs font-mono shrink-0 select-none">
				<div class="w-9 text-right pr-1 font-black text-[#e06c75] shrink-0 select-none text-xs flex items-center justify-end min-h-[24px]">
					<span title={$t('synthPanels.roll.accentTrackHint')}>ACC</span>
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
																	: 'border border-white/10 bg-black/40 text-white/60 hover:border-white/30'}"
										title={$t('synthPanels.roll.accentStepHint', { step: step + 1, side: subCol === 0 ? 'L' : 'R', value: accVal > 0 ? `+${accVal}dB` : 'OFF (0dB)' })}
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
