import { writable, derived, get } from 'svelte/store';
import {
	modularSynth,
	METER_SPECS,
	PIANO_ROLL_NOTES,
	divToColumnSpan,
	divToStepSpan,
	stepsPerColumn,
	ternaryColFactor,
	effectiveTimbre,
	isKeyTimbreKey,
	type TrackData
} from '../synth';
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

/* The key the racks edit in percussion mode: whichever key was last placed on
   the roll, auditioned from its label, or pressed on the keyboard (mouse,
   QWERTY or MIDI). Outside percussion mode it is only informational. */
export const activeKey = writable<number>(48); // C4

/** The racks read this: the active track, seen through the active key when the track is in percussion mode. */
export const currentTrack = derived(
	[tracksState, activeTrackId, activeKey],
	([$tracksState, $activeTrackId, $activeKey]) => {
		const trk = $tracksState[$activeTrackId] || $tracksState[0];
		return trk ? effectiveTimbre(trk, $activeKey) : trk;
	}
);

/** The active track row itself, without the key overlay. */
export const activeTrackRow = derived(
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

export function noteNameOf(noteIndex: number): string {
	return PIANO_ROLL_NOTES[noteIndex]?.note ?? `#${noteIndex}`;
}

/**
 * Edit the active track. In percussion mode the sound fields go to the active
 * key's entry and everything else (volume, pan, EQ, name...) to the track row,
 * so the racks, the presets and RST all work per key without knowing about it.
 */
export function updateActiveTrack(partial: Partial<TrackData>): void {
	const id = get(activeTrackId);
	const trk = modularSynth.getTrack(id);
	if (trk?.percussion) {
		const key = get(activeKey);
		const toKey: Record<string, unknown> = {};
		const toTrack: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(partial)) (isKeyTimbreKey(k) ? toKey : toTrack)[k] = v;
		if (Object.keys(toKey).length) modularSynth.updateKeyTimbre(id, key, toKey as Partial<TrackData>);
		if (Object.keys(toTrack).length) modularSynth.updateTrack(id, toTrack as Partial<TrackData>);
	} else {
		modularSynth.updateTrack(id, partial);
	}
	refreshTracks();
}

export function updateTrack(trackId: number, partial: Partial<TrackData>): void {
	modularSynth.updateTrack(trackId, partial);
	refreshTracks();
}

export function toggleTrackPercussion(trackId: number): void {
	const trk = modularSynth.getTrack(trackId);
	if (!trk) return;
	// The key table survives a round trip through off, so a mis-click does not lose a kit.
	modularSynth.updateTrack(trackId, { percussion: !trk.percussion, keyTimbres: trk.keyTimbres ?? {} });
	refreshTracks();
}

export function keyIsCustomised(trk: TrackData | undefined, noteIndex: number): boolean {
	const kt = trk?.keyTimbres?.[noteIndex];
	return !!kt && Object.keys(kt).length > 0;
}

/** Drop a key's own sound so it plays the track timbre again. */
export function resetKeyTimbre(trackId: number, noteIndex: number): void {
	modularSynth.clearKeyTimbre(trackId, noteIndex);
	refreshTracks();
}

/** Replace the active track's whole key table (a kit) and switch percussion on. */
export function applyKitToActiveTrack(keys: Record<number, Partial<TrackData>>): void {
	const id = get(activeTrackId);
	const copy: Record<number, Partial<TrackData>> = {};
	for (const [k, v] of Object.entries(keys)) copy[Number(k)] = { ...v };
	modularSynth.updateTrack(id, { percussion: true, keyTimbres: copy });
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
	const snap = get(snapDiv);
	const meterCols = (METER_SPECS[get(timeMeter)] || METER_SPECS['4/4']).colsPerBar * ternaryColFactor(snap);
	return get(activeStepPage) * meterCols + colIndex;
}

/** Toggle a note in the polyphonic piano roll — up to 8 notes per step, snapped to the current grid division. */
export function handlePianoRollCellClick(noteIndex: number, colIndex: number): void {
	const snap = get(snapDiv);
	const snapSpanCols = divToColumnSpan(snap, snap);
	const snapInt = snapSpanCols >= 1 ? Math.floor(snapSpanCols) : 1;
	const snappedCol = Math.floor(colIndex / snapInt) * snapInt;
	const trackId = get(activeTrackId);
	const startStep = currentGlobalCol(snappedCol) * stepsPerColumn(snap);
	activeKey.set(noteIndex);
	placeOrClearNote(trackId, noteIndex, startStep);
}

export function handlePianoRollSubCellClick(noteIndex: number, colIndex: number, subCol: number): void {
	const snap = get(snapDiv);
	const spc = stepsPerColumn(snap);
	const trackId = get(activeTrackId);
	const startStep = currentGlobalCol(colIndex) * spc + subCol * (spc / 2);
	activeKey.set(noteIndex);
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
		const durSteps = Math.max(1, divToStepSpan(get(noteDur)));
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
	if (trackId === get(activeTrackId)) activeKey.set(noteIdx);
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
