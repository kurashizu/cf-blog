import {
	migratePatch,
	isPatchFile,
	trackResetDefaults,
	blankTrack,
	STEPS_PER_BEAT,
	PATCH_VERSION,
	type SynthPatchFile
} from './patch-format';
import { SPAIN_STEPS } from '../songs/spain';
import { TAKE_FIVE_STEPS } from '../songs/take-five';
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { tr } from '$lib/i18n';
import { codecSupported, encodeToFragment, decodeFromFragment } from '../share-codec';
import { playSound } from '../sound';
import { modularSynth, type TrackData, type TimeSignature } from '../synth';
import { isPresetFile, applyPresetFile, isKitFile, applyKitFile, activeKitName } from './synth-presets';
import { ensureCustomWaves, wavesUsedBy } from './synth-waves';
import type { CustomWave } from '../synth';
import {
	bpm,
	setBpm,
	timeMeter,
	setTimeMeter,
	totalPatternSteps,
	cursorStep,
	seqCurrentStep,
	activeStepPage,
	stop as stopTransport
} from './synth-transport';
import { tracksState, isOverlayMode, overlayTrackIds } from './synth-tracks';
import { askConfirm } from './synth-confirm';

const STORAGE_KEY = 'krsz-synth-patch-v1';

export interface BuiltinSong {
	id: string;
	name: string;
	steps: number;
	bpm: number;
	meter: TimeSignature;
}

export const BUILTIN_SONGS: BuiltinSong[] = [
	{ id: 'MARIO_1', name: 'SMB1 - OVERWORLD', steps: 3840, bpm: 105, meter: '4/4' },
	{ id: 'UNDERWATER', name: 'SMB1 - UNDERWATER', steps: 2304, bpm: 100, meter: '6/8' },
	{ id: 'OVERWORLD_1', name: 'SMB3 - OVERWORLD 1', steps: 10080, bpm: 150, meter: '4/4' },
	{ id: 'OVERWORLD_2', name: 'SMB3 - OVERWORLD 2', steps: 2016, bpm: 90, meter: '4/4' },
	{ id: 'SPAIN', name: 'C.COREA - SPAIN', steps: SPAIN_STEPS, bpm: 115, meter: '4/4' },
	{ id: 'TAKE_FIVE', name: 'D.BRUBECK - TAKE FIVE', steps: TAKE_FIVE_STEPS, bpm: 180, meter: '5/4' }
];

// Must match the synth's boot state (INITIAL_TRACKS / bpm / totalSteps), otherwise the
// selector names one song while the sequencer holds another. Looked up by id so
// reordering the list can't desync it.
const DEFAULT_SONG_IDX = Math.max(0, BUILTIN_SONGS.findIndex((s) => s.id === 'SPAIN'));

export const builtinSongIdx = writable<number>(DEFAULT_SONG_IDX);
/** What is loaded right now — used to name exports. Set by every loader. */
export const currentSongName = writable<string>(BUILTIN_SONGS[DEFAULT_SONG_IDX]?.name ?? 'patch');
export const saveStatus = writable<string | null>(null);

export function showSaveStatus(msg: string): void {
	saveStatus.set(msg);
	setTimeout(() => saveStatus.set(null), 2000);
}

function refreshTracks(): void {
	tracksState.set([...modularSynth.getTracks()]);
}

function resetPlayheadState(): void {
	stopTransport();
	modularSynth.setPlaybackStep(0);
	cursorStep.set(0);
	seqCurrentStep.set(0);
	activeStepPage.set(0);
}

export function handleNewProject(): void {
	askConfirm({
		title: tr('synth.confirm.newProjectTitle'),
		body: tr('synth.confirm.newProjectBody'),
		confirmLabel: tr('synth.confirm.discard'),
		onConfirm: doNewProject
	});
}

function doNewProject(): void {
	resetPlayheadState();
	modularSynth.resetToBlank(192);
	totalPatternSteps.set(192);
	setBpm(120);
	timeMeter.set('4/4');
	refreshTracks();
	// The blank track carries no kit, so the preset trigger must stop naming one.
	activeKitName.set(null);
	currentSongName.set('blank');
	showSaveStatus(tr('synth.status.newOk'));
	playSound('click');
}

export function handleLoadBuiltinSong(idx: number): void {
	const song = BUILTIN_SONGS[idx];
	if (!song) return;
	builtinSongIdx.set(idx);
	resetPlayheadState();
	modularSynth.loadBuiltInSong(song.id);
	totalPatternSteps.set(song.steps);
	setBpm(song.bpm);
	timeMeter.set(song.meter);
	isOverlayMode.set(true);
	overlayTrackIds.set([0, 1, 2, 3]);
	refreshTracks();
	currentSongName.set(song.name);
	showSaveStatus(tr('synth.status.songLoaded', { name: song.name }));
	playSound('toggle');
}

interface SynthPatchData {
	tracks: Partial<TrackData>[];
	bpm: number;
	meter: TimeSignature;
	totalSteps: number;
	/** Grid resolution the patch was saved at. Absent = legacy 8-steps-per-beat patch. */
	stepsPerBeat?: number;
	/** Drawn waves the tracks reference, so the patch plays in another browser. */
	waves?: CustomWave[];
	/** What the file's numbers mean. See PATCH_VERSION in patch-format. */
	version?: number;
}

function gatherPatchData(): SynthPatchData {
	return {
		tracks: modularSynth.getTracks(),
		bpm: get(bpm),
		meter: get(timeMeter),
		totalSteps: get(totalPatternSteps),
		stepsPerBeat: STEPS_PER_BEAT,
		/* What the numbers in this file mean, so a later build knows which of
		   its migrations this one predates. Without it every file looked like
		   every other and only the grid resolution could be asked about. */
		version: PATCH_VERSION,
		waves: wavesUsedBy(modularSynth.getTracks())
	};
}

/* Migration and the reset defaults live in patch-format, which has no Web Audio
   in it and so can be tested -- the questions that break a saved file are
   whether an old one still loads and whether loading one leaves anything of the
   previous song behind, and both are answerable without an audio context. */

/** The meters the transport can actually be set to. */
const METERS: readonly TimeSignature[] = ['4/4', '3/4', '2/4', '5/4', '6/8', '7/8'];
const isMeter = (v: unknown): v is TimeSignature =>
	typeof v === 'string' && (METERS as readonly string[]).includes(v);

function applyPatchData(raw: SynthPatchFile): void {
	const data = migratePatch(raw) as SynthPatchData;
	ensureCustomWaves(data.waves);
	resetPlayheadState();
	if (data.bpm) setBpm(data.bpm);
	/* A saved file's meter is whatever string was in it, which is why
	   patch-format types it as one. Checking it here rather than casting past it
	   is the difference between a hand-edited "9/16" being ignored and it
	   reaching a transport that has no such meter. */
	if (isMeter(data.meter)) timeMeter.set(data.meter);
	if (data.totalSteps) totalPatternSteps.set(data.totalSteps);
	if (data.tracks && Array.isArray(data.tracks)) {
		// Tracks the patch does not mention (older patches carry six) are
		// emptied rather than left holding the previous song's pattern.
		const present = new Set(data.tracks.map((t) => t.id));
		for (const trk of modularSynth.getTracks()) {
			if (present.has(trk.id)) continue;
			modularSynth.updateTrack(trk.id, blankTrack(trk.id, trk.grid.length));
		}
		data.tracks.forEach((tData) => {
			// Patches predating per-track EQ carry no eq fields — reset to flat instead
			// of leaving whatever the previous song had on the live filter chains.
			// Likewise percussion mode: a patch that predates it, or one saved with
			// it off, must not inherit the live track's key table.
			if (tData.id !== undefined)
				// Reset first, so a project saved before a field existed gets the
				// default rather than whatever the live track was holding.
				modularSynth.updateTrack(tData.id, { ...trackResetDefaults(), ...tData });
		});
		refreshTracks();
	}
}

export function handleSavePatch(): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(gatherPatchData()));
		showSaveStatus(tr('synth.status.savedOk'));
		playSound('click');
	} catch {
		showSaveStatus(tr('synth.status.saveErr'));
	}
}

export function handleLoadPatch(): void {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			applyPatchData(JSON.parse(stored));
			showSaveStatus(tr('synth.status.loadedOk'));
			playSound('toggle');
		} else {
			showSaveStatus(tr('synth.status.loadEmpty'));
		}
	} catch {
		showSaveStatus(tr('synth.status.loadErr'));
	}
}

/* The patch's sequencer grids are mostly empty-array cells, repeated thousands
   of times, so plain JSON is almost all redundant text -- gzip typically
   shrinks it 20-50x, the same ratio the #patch= share link relies on
   (share-codec.ts uses deflate-raw for the URL; this uses gzip proper, with
   its header, so the file opens with any system unzip tool, not just here). */
export async function handleExportPatch(): Promise<void> {
	const patch = gatherPatchData();
	const json = new TextEncoder().encode(JSON.stringify(patch));
	let blob: Blob;
	let filename: string;
	if (codecSupported()) {
		const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
		const gzipped = await new Response(stream).arrayBuffer();
		blob = new Blob([gzipped], { type: 'application/gzip' });
		filename = 'krsz-patch-export.json.gz';
	} else {
		blob = new Blob([json], { type: 'application/json' });
		filename = 'krsz-patch-export.json';
	}
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	playSound('click');
}


/** Set when programmatic copy is blocked — PatchManager renders it for manual copy. */
export const shareUrlFallback = writable<string | null>(null);

export async function copyText(text: string): Promise<boolean> {
	// The async Clipboard API can reject after an await consumed the user gesture
	// (Safari) or under a restrictive permissions policy — fall back to execCommand.
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		/* fall through */
	}
	try {
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.setAttribute('readonly', '');
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		document.body.appendChild(ta);
		ta.select();
		const copied = document.execCommand('copy');
		document.body.removeChild(ta);
		return copied;
	} catch {
		return false;
	}
}

/** SHARE: serialize the whole patch into a compressed #patch= URL and copy it. */
export async function handleSharePatch(): Promise<void> {
	if (!codecSupported()) {
		showSaveStatus(tr('synth.status.noCodec'));
		return;
	}
	let url: string;
	try {
		const fragment = await encodeToFragment(gatherPatchData());
		url = `${location.origin}/synth#patch=${fragment}`;
	} catch {
		showSaveStatus(tr('synth.status.encodeErr'));
		return;
	}
	if (await copyText(url)) {
		shareUrlFallback.set(null);
		showSaveStatus(tr('synth.status.linkCopied', { size: (url.length / 1024).toFixed(1) }));
		playSound('toggle');
	} else {
		// Clipboard fully blocked — hand the link over for manual copy instead of erroring out.
		shareUrlFallback.set(url);
		playSound('click');
	}
}

/** On /synth mount: if the URL carries a shared patch, load it and clean the hash. */
export async function tryLoadSharedPatch(): Promise<void> {
	if (!browser) return;
	const m = location.hash.match(/^#patch=([A-Za-z0-9_-]+)$/);
	if (!m) return;
	if (!codecSupported()) {
		showSaveStatus(tr('synth.status.noCodec'));
		return;
	}
	try {
		const data = await decodeFromFragment<SynthPatchData>(m[1]);
		applyPatchData(data);
		history.replaceState(null, '', location.pathname);
		showSaveStatus(tr('synth.status.sharedPatchLoaded'));
		playSound('toggle');
	} catch {
		showSaveStatus(tr('synth.status.badShareLink'));
	}
}

/** True for a gzip member: magic bytes 1f 8b, regardless of file extension. */
async function isGzip(file: File): Promise<boolean> {
	const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
	return head[0] === 0x1f && head[1] === 0x8b;
}

export async function handleImportPatchFile(file: File): Promise<void> {
	try {
		let text: string;
		if (await isGzip(file)) {
			if (!codecSupported()) {
				showSaveStatus(tr('synth.status.noCodec'));
				return;
			}
			const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
			text = await new Response(stream).text();
		} else {
			text = await file.text();
		}
		const parsed = JSON.parse(text);
		// The IMP button and the page-wide drop zone both land here; a preset
		// file is JSON too, so route it to the active track instead of
		// treating it as a (trackless, so silent) patch.
		if (isPresetFile(parsed)) {
			applyPresetFile(parsed);
			return;
		}
		if (isKitFile(parsed)) {
			applyKitFile(parsed);
			return;
		}
		/* A patch is the only thing left it can be, so say so before acting on
		   it. `isPatchFile` was exported and unit-tested and called from
		   nowhere: any JSON that was not a preset or a kit went straight in, and
		   an object with no `tracks` at all reported "imported OK" having set
		   nothing. The try/catch below only covers a throw, and this does not
		   throw -- it quietly does nothing. */
		if (!isPatchFile(parsed)) {
			showSaveStatus(tr('synth.status.importInvalid'));
			return;
		}
		applyPatchData(parsed);
		showSaveStatus(tr('synth.status.importedOk'));
		playSound('toggle');
	} catch {
		showSaveStatus(tr('synth.status.importInvalid'));
	}
}
