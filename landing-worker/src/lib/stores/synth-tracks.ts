import { writable, derived, get } from 'svelte/store';
import { modularSynth, METER_SPECS, divToColumnSpan, type TrackData } from '../synth';
import {
	activeTrackId,
	snapDiv,
	noteDur,
	timeMeter,
	activeStepPage,
	totalPatternSteps,
	isSeqPlaying,
	seqCurrentStep
} from './synth-transport';

export const tracksState = writable<TrackData[]>(modularSynth.getTracks());
export const isOverlayMode = writable<boolean>(true);
export const overlayTrackIds = writable<number[]>([0, 1, 2, 3]);
/** trackId-noteIndex -> held note, from mouse/touch keyboard presses or live MIDI input. */
export const manualHeldNotes = writable<Map<string, { trackId: number; noteIdx: number }>>(new Map());

export const currentTrack = derived(
	[tracksState, activeTrackId],
	([$tracksState, $activeTrackId]) => $tracksState[$activeTrackId] || $tracksState[0]
);

export const visibleTracks = derived(
	[isOverlayMode, overlayTrackIds, tracksState, activeTrackId],
	([$isOverlayMode, $overlayTrackIds, $tracksState, $activeTrackId]) => {
		if ($isOverlayMode) {
			return $tracksState
				.filter((trk) => $overlayTrackIds.includes(trk.id))
				.map((trk) => ({ id: trk.id, color: trk.color, grid: trk.grid, isPrimary: trk.id === $activeTrackId }));
		}
		const trk = $tracksState[$activeTrackId] || $tracksState[0];
		return trk ? [{ id: trk.id, color: trk.color, grid: trk.grid, isPrimary: true }] : [];
	}
);

function refreshTracks(): void {
	tracksState.set([...modularSynth.getTracks()]);
}

export function updateActiveTrack(partial: Partial<TrackData>): void {
	modularSynth.updateTrack(get(activeTrackId), partial);
	refreshTracks();
}

export function updateTrack(trackId: number, partial: Partial<TrackData>): void {
	modularSynth.updateTrack(trackId, partial);
	refreshTracks();
}

export function toggleTrackMute(trackId: number): void {
	modularSynth.toggleTrackMute(trackId);
	refreshTracks();
}

export function toggleTrackSolo(trackId: number): void {
	modularSynth.toggleTrackSolo(trackId);
	refreshTracks();
}

function currentGlobalCol(colIndex: number): number {
	const meterCols = (METER_SPECS[get(timeMeter)] || METER_SPECS['4/4']).colsPerBar;
	return get(activeStepPage) * meterCols + colIndex;
}

/** Toggle a note in the polyphonic piano roll — up to 8 notes per step, snapped to the current grid division. */
export function handlePianoRollCellClick(noteIndex: number, colIndex: number): void {
	const snapSpanCols = divToColumnSpan(get(snapDiv));
	const snapInt = snapSpanCols >= 1 ? Math.floor(snapSpanCols) : 1;
	const snappedCol = Math.floor(colIndex / snapInt) * snapInt;
	const trackId = get(activeTrackId);
	const startStep = currentGlobalCol(snappedCol) * 2;
	placeOrClearNote(trackId, noteIndex, startStep);
}

export function handlePianoRollSubCellClick(noteIndex: number, colIndex: number, subCol: number): void {
	const trackId = get(activeTrackId);
	const startStep = currentGlobalCol(colIndex) * 2 + subCol;
	placeOrClearNote(trackId, noteIndex, startStep);
}

function placeOrClearNote(trackId: number, noteIndex: number, startStep: number): void {
	const track = modularSynth.getTrack(trackId);
	const total = get(totalPatternSteps);
	if (!track || startStep >= total) return;

	const isAlreadyOn = track.grid[startStep]?.includes(noteIndex) || false;

	if (isAlreadyOn) {
		let s = startStep;
		while (s < total && track.grid[s]?.includes(noteIndex)) {
			const notes = track.grid[s] || [];
			modularSynth.setTrackStepNotes(trackId, s, notes.filter((n) => n !== noteIndex));
			s++;
		}
		refreshTracks();
	} else {
		const durSpanCols = divToColumnSpan(get(noteDur));
		const durSteps = Math.max(1, Math.round(durSpanCols * 2));
		const endStep = Math.min(total, startStep + durSteps);

		for (let s = startStep; s < endStep; s++) {
			const notes = track.grid[s] || [];
			if (!notes.includes(noteIndex) && notes.length < 8) {
				modularSynth.setTrackStepNotes(trackId, s, [...notes, noteIndex].sort((a, b) => a - b));
			}
		}
		refreshTracks();
		const isAccent = track.accents[startStep] || false;
		modularSynth.triggerTrackVoice(trackId, noteIndex, isAccent);
	}
}

export function cycleAccent(step: number): void {
	modularSynth.cycleTrackAccent(get(activeTrackId), step);
	refreshTracks();
}

export function holdManualNote(trackId: number, noteIdx: number, velocity = 100): void {
	modularSynth.noteOn(trackId, noteIdx, velocity);
	manualHeldNotes.update((prev) => {
		const next = new Map(prev);
		next.set(`${trackId}-${noteIdx}`, { trackId, noteIdx });
		return next;
	});
}

export function releaseManualNote(trackId: number, noteIdx: number): void {
	modularSynth.noteOff(trackId, noteIdx);
	manualHeldNotes.update((prev) => {
		const next = new Map(prev);
		next.delete(`${trackId}-${noteIdx}`);
		return next;
	});
}

/** Notes currently ringing on the visual piano keyboard: live sequencer steps + manually/MIDI-held notes. */
export const activePlayingNotes = derived(
	[isSeqPlaying, seqCurrentStep, tracksState, manualHeldNotes],
	([$isSeqPlaying, $seqCurrentStep, $tracksState, $manualHeldNotes]) => {
		const activeMap = new Map<number, { trackId: number }>();

		if ($isSeqPlaying) {
			const hasSolo = $tracksState.some((t) => t.solo);
			$tracksState.forEach((trk) => {
				if (trk.muted) return;
				if (hasSolo && !trk.solo) return;
				const stepNotes = trk.grid[$seqCurrentStep] || [];
				stepNotes.forEach((nIdx) => {
					if (nIdx !== null && nIdx !== undefined) activeMap.set(nIdx, { trackId: trk.id });
				});
			});
		}

		$manualHeldNotes.forEach((entry) => activeMap.set(entry.noteIdx, { trackId: entry.trackId }));
		return activeMap;
	}
);
