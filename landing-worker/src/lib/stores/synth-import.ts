import { writable } from 'svelte/store';
import { playSound } from '../sound';
import { parseMidiFile, splitByChannel, MidiParseError, type MidiTrack } from '../midi-file';
import { METER_SPECS, modularSynth, PIANO_ROLL_NOTES, STEPS_PER_BEAT, type TimeSignature } from '../synth';
import {
	setBpm,
	setTimeMeter,
	setTotalPatternSteps,
	cursorStep,
	seqCurrentStep,
	activeStepPage,
	stop as stopTransport
} from './synth-transport';
import { tracksState, isOverlayMode, overlayTrackIds } from './synth-tracks';
import { builtinSongIdx, currentSongName, saveStatus } from './synth-patch';

/** Notes that don't fit the 88-key table, tracks that didn't fit, etc. */
export const importReport = writable<string[] | null>(null);

/** The engine allocates its grids at this fixed length. */
const GRID_CAPACITY = 12288;
/** TrackData documents the grid as up to 8 simultaneous notes per step. */
const MAX_POLYPHONY = 8;
/** PIANO_ROLL_NOTES[0] is C8 = MIDI 108, descending by semitone to A0 = MIDI 21. */
const TOP_MIDI = 108;

function midiToNoteIndex(midi: number): number | null {
	const idx = TOP_MIDI - midi;
	return idx >= 0 && idx < PIANO_ROLL_NOTES.length ? idx : null;
}

function isSupportedMeter(sig: string): sig is TimeSignature {
	return sig in METER_SPECS;
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

interface ConvertedTrack {
	name: string;
	grid: number[][];
	accents: number[];
	noteCount: number;
	isDrums: boolean;
}

/**
 * One MIDI track becomes one sequencer track. A note is written into every step
 * it spans, because the scheduler reads a repeated index as one held note.
 */
function convertTrack(track: MidiTrack, ticksPerQuarter: number, index: number): { converted: ConvertedTrack; dropped: number; lastStep: number } {
	const grid: number[][] = Array.from({ length: GRID_CAPACITY }, () => []);
	const accents: number[] = Array.from({ length: GRID_CAPACITY }, () => 0);
	const toStep = (tick: number) => Math.round((tick * STEPS_PER_BEAT) / ticksPerQuarter);

	// Velocity only becomes an accent when it stands out from this track's own
	// baseline — a file recorded at a flat velocity should stay unaccented.
	const base = median(track.notes.map((n) => n.velocity));
	let dropped = 0;
	let lastStep = 0;
	let noteCount = 0;

	for (const note of track.notes) {
		const noteIdx = midiToNoteIndex(note.midi);
		if (noteIdx === null) {
			dropped++;
			continue;
		}
		const start = Math.min(toStep(note.startTick), GRID_CAPACITY - 1);
		const end = Math.min(Math.max(start + 1, toStep(note.endTick)), GRID_CAPACITY);
		let written = false;
		for (let s = start; s < end; s++) {
			const cell = grid[s];
			if (cell.length >= MAX_POLYPHONY || cell.includes(noteIdx)) continue;
			cell.push(noteIdx);
			written = true;
		}
		if (!written) continue;
		noteCount++;
		lastStep = Math.max(lastStep, end);
		const over = note.velocity - base;
		accents[start] = Math.max(accents[start], over >= 32 ? 2 : over >= 16 ? 1 : 0);
	}

	return {
		converted: {
			name: (track.name || `MIDI TRK ${index + 1}`).slice(0, 24).toUpperCase(),
			grid,
			accents,
			noteCount,
			// GM reserves channel 10 (index 9) for percussion.
			isDrums: track.channels.includes(9)
		},
		dropped,
		lastStep
	};
}

/**
 * Parse a `.mid` file and load it into the sequencer, replacing the pattern of
 * every track while leaving each track's synthesis parameters alone.
 */
export async function handleImportMidiFile(file: File): Promise<void> {
	importReport.set(null);
	let parsed;
	try {
		parsed = parseMidiFile(await file.arrayBuffer());
	} catch (e) {
		const message = e instanceof MidiParseError ? e.message : 'Could not read this file as MIDI.';
		importReport.set([`✕ ${file.name}`, message]);
		playSound('ping', false);
		return;
	}

	const engineTracks = modularSynth.getTracks();
	const capacity = engineTracks.length;

	// Format 0 keeps every instrument on one track; split it so they don't merge.
	let sources = parsed.tracks;
	if (sources.length === 1) sources = splitByChannel(sources[0]);

	// When a file has more parts than the rack has tracks, keep the busiest.
	const ranked = [...sources].sort((a, b) => b.notes.length - a.notes.length);
	const kept = ranked.slice(0, capacity);
	const skipped = ranked.slice(capacity);
	// Restore the file's own order among the ones we kept.
	kept.sort((a, b) => sources.indexOf(a) - sources.indexOf(b));

	const results = kept.map((t, i) => convertTrack(t, parsed.ticksPerQuarter, i));
	const droppedNotes = results.reduce((a, r) => a + r.dropped, 0);
	const lastStep = Math.max(1, ...results.map((r) => r.lastStep));

	const meter: TimeSignature = isSupportedMeter(parsed.timeSignature) ? parsed.timeSignature : '4/4';
	const stepsPerBar = METER_SPECS[meter].stepsPerBar;
	const totalSteps = Math.min(GRID_CAPACITY, Math.max(stepsPerBar, Math.ceil(lastStep / stepsPerBar) * stepsPerBar));

	// ── apply ──
	stopTransport();
	modularSynth.setPlaybackStep(0);
	cursorStep.set(0);
	seqCurrentStep.set(0);
	activeStepPage.set(0);

	setBpm(Math.max(40, Math.min(300, parsed.bpm)));
	setTimeMeter(meter);
	setTotalPatternSteps(totalSteps);

	engineTracks.forEach((track, i) => {
		const result = results[i];
		if (!result) {
			// Tracks the file doesn't use are emptied rather than left holding the
			// previous song's pattern underneath the imported one.
			modularSynth.updateTrack(track.id, {
				grid: Array.from({ length: GRID_CAPACITY }, () => []),
				accents: Array.from({ length: GRID_CAPACITY }, () => 0),
				solo: false
			});
			return;
		}
		modularSynth.updateTrack(track.id, {
			name: result.converted.name,
			grid: result.converted.grid,
			accents: result.converted.accents,
			muted: false,
			solo: false
		});
	});

	tracksState.set([...modularSynth.getTracks()]);
	builtinSongIdx.set(-1);
	currentSongName.set(file.name.replace(/\.midi?$/i, ''));
	isOverlayMode.set(true);
	overlayTrackIds.set(results.map((_, i) => i));

	const bars = Math.round(totalSteps / stepsPerBar);
	const report = [
		`✓ ${file.name}`,
		`${results.length} track${results.length === 1 ? '' : 's'} · ${results.reduce((a, r) => a + r.converted.noteCount, 0)} notes · ${bars} bars`,
		`${parsed.bpm} BPM${parsed.bpmFromFile ? '' : ' (file states none — MIDI default)'} · ${meter}${
			isSupportedMeter(parsed.timeSignature) ? '' : ` (${parsed.timeSignature} unsupported, using 4/4)`
		}`,
		...results.map((r, i) => `  ${i + 1}. ${r.converted.name.padEnd(24)} ${r.converted.noteCount} notes${r.converted.isDrums ? '  [GM drum channel]' : ''}`),
		...(droppedNotes ? [`${droppedNotes} note${droppedNotes === 1 ? '' : 's'} outside the 88-key range were dropped`] : []),
		...(skipped.length ? [`${skipped.length} further part${skipped.length === 1 ? '' : 's'} skipped — the rack holds ${capacity} tracks`] : [])
	];
	importReport.set(report);
	saveStatus.set(`✓ ${file.name.replace(/\.midi?$/i, '').slice(0, 18)}`);
	setTimeout(() => saveStatus.set(null), 2000);
	playSound('toggle');
}

/** True for names this importer handles. */
export function isMidiFile(file: File): boolean {
	return /\.midi?$/i.test(file.name) || file.type === 'audio/midi' || file.type === 'audio/x-midi';
}

export function clearImportReport(): void {
	importReport.set(null);
}
