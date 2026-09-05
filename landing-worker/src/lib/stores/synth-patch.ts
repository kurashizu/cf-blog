import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { codecSupported, encodeToFragment, decodeFromFragment } from '../share-codec';
import { playSound } from '../sound';
import { modularSynth, type TrackData, type TimeSignature, type SynthWaveform, type FilterType } from '../synth';
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
	{ id: 'OVERWORLD_2', name: 'SMB3 - OVERWORLD 2', steps: 2016, bpm: 90, meter: '4/4' }
];

// Must match the synth's boot state (INITIAL_TRACKS / bpm / totalSteps), otherwise the
// selector names one song while the sequencer holds another. Looked up by id so
// reordering the list can't desync it.
const DEFAULT_SONG_IDX = Math.max(0, BUILTIN_SONGS.findIndex((s) => s.id === 'OVERWORLD_1'));

export interface SoundPreset {
	name: string;
	preset: Partial<TrackData>;
}

export const SOUND_PRESETS: SoundPreset[] = [
	{
		name: '8-BIT BASS',
		preset: {
			osc1Waveform: 'square' as SynthWaveform,
			osc2Waveform: 'triangle' as SynthWaveform,
			cutoff: 1200,
			resonance: 4.2,
			ampAttack: 0.003,
			ampDecay: 0.12,
			ampSustain: 0.45,
			ampRelease: 0.08,
			filterAttack: 0.005,
			filterDecay: 0.15,
			filterSustain: 0.3,
			filterRelease: 0.08,
			filterEnvAmount: 0.6
		}
	},
	{
		name: 'PLUCK',
		preset: {
			osc1Waveform: 'square' as SynthWaveform,
			osc2Waveform: 'sawtooth' as SynthWaveform,
			cutoff: 1800,
			resonance: 3.5,
			ampAttack: 0.003,
			ampDecay: 0.35,
			ampSustain: 0.7,
			ampRelease: 0.2,
			filterAttack: 0.003,
			filterDecay: 0.08,
			filterSustain: 0.0,
			filterRelease: 0.06,
			filterEnvAmount: 0.85
		}
	},
	{
		name: 'BRASS',
		preset: {
			osc1Waveform: 'sawtooth' as SynthWaveform,
			osc2Waveform: 'sawtooth' as SynthWaveform,
			detuneCents: 12,
			cutoff: 2400,
			resonance: 2.0,
			ampAttack: 0.04,
			ampDecay: 0.25,
			ampSustain: 0.8,
			ampRelease: 0.2,
			filterAttack: 0.06,
			filterDecay: 0.2,
			filterSustain: 0.5,
			filterRelease: 0.15,
			filterEnvAmount: 0.55
		}
	},
	{
		name: 'LEAD',
		preset: {
			osc1Waveform: 'pulse' as SynthWaveform,
			osc2Waveform: 'sawtooth' as SynthWaveform,
			detuneCents: 8,
			cutoff: 6500,
			resonance: 2.8,
			ampAttack: 0.005,
			ampDecay: 0.2,
			ampSustain: 0.8,
			ampRelease: 0.18,
			filterAttack: 0.005,
			filterDecay: 0.25,
			filterSustain: 0.6,
			filterRelease: 0.12,
			filterEnvAmount: 0.4
		}
	},
	{
		name: 'HI-HAT',
		preset: {
			osc1Waveform: 'noise' as SynthWaveform,
			osc2Waveform: 'triangle' as SynthWaveform,
			osc2Gain: 0.0,
			filterType: 'highpass' as FilterType,
			cutoff: 40,
			resonance: 0.0,
			envFilterMod: 0.0,
			ampAttack: 0.001,
			ampDecay: 0.2,
			ampSustain: 0.0,
			ampRelease: 0.04,
			filterAttack: 0.001,
			filterDecay: 0.05,
			filterSustain: 0.0,
			filterRelease: 0.03,
			filterEnvAmount: 0.0,
			pitchEnvAmount: 0.0,
			pitchAttack: 0.001,
			pitchDecay: 0.03
		}
	}
];

export const builtinSongIdx = writable<number>(DEFAULT_SONG_IDX);
/** What is loaded right now — used to name exports. Set by every loader. */
export const currentSongName = writable<string>(BUILTIN_SONGS[DEFAULT_SONG_IDX]?.name ?? 'patch');
export const soundPresetIdx = writable<number>(0);
export const saveStatus = writable<string | null>(null);

function showSaveStatus(msg: string): void {
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
	resetPlayheadState();
	modularSynth.resetToBlank(192);
	totalPatternSteps.set(192);
	setBpm(120);
	timeMeter.set('4/4');
	refreshTracks();
	currentSongName.set('blank');
	showSaveStatus('✓ NEW');
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
	showSaveStatus(`✓ ${song.name}`);
	playSound('toggle');
}

interface SynthPatchData {
	tracks: Partial<TrackData>[];
	bpm: number;
	meter: TimeSignature;
	totalSteps: number;
	/** Grid resolution the patch was saved at. Absent = legacy 8-steps-per-beat patch. */
	stepsPerBeat?: number;
}

function gatherPatchData(): SynthPatchData {
	return {
		tracks: modularSynth.getTracks(),
		bpm: get(bpm),
		meter: get(timeMeter),
		totalSteps: get(totalPatternSteps),
		stepsPerBeat: 24
	};
}

/** Legacy patches were saved on the 1/8-beat grid — expand to the 1/24-beat grid. */
function migratePatchData(data: SynthPatchData): SynthPatchData {
	if (data.stepsPerBeat === 24) return data;
	return {
		...data,
		totalSteps: data.totalSteps ? data.totalSteps * 3 : data.totalSteps,
		tracks: (data.tracks ?? []).map((t) => ({
			...t,
			grid: t.grid ? t.grid.flatMap((cell) => [[...cell], [...cell], [...cell]]) : t.grid,
			accents: t.accents ? (t.accents as number[]).flatMap((a) => [Number(a) || 0, 0, 0]) : t.accents
		})),
		stepsPerBeat: 24
	};
}

function applyPatchData(raw: SynthPatchData): void {
	const data = migratePatchData(raw);
	resetPlayheadState();
	if (data.bpm) setBpm(data.bpm);
	if (data.meter) timeMeter.set(data.meter);
	if (data.totalSteps) totalPatternSteps.set(data.totalSteps);
	if (data.tracks && Array.isArray(data.tracks)) {
		data.tracks.forEach((tData) => {
			// Patches predating per-track EQ carry no eq fields — reset to flat instead
			// of leaving whatever the previous song had on the live filter chains.
			if (tData.id !== undefined)
				modularSynth.updateTrack(tData.id, { eqOn: false, eqGains: [0, 0, 0, 0, 0, 0], ...tData });
		});
		refreshTracks();
	}
}

export function handleSavePatch(): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(gatherPatchData()));
		showSaveStatus('✓ SAVED');
		playSound('click');
	} catch {
		showSaveStatus('X ERR');
	}
}

export function handleLoadPatch(): void {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			applyPatchData(JSON.parse(stored));
			showSaveStatus('✓ LOADED');
			playSound('toggle');
		} else {
			showSaveStatus('X EMPTY');
		}
	} catch {
		showSaveStatus('X ERR');
	}
}

export function handleExportPatch(): void {
	const patch = gatherPatchData();
	const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'krsz-patch-export.json';
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
		showSaveStatus('X NO CODEC');
		return;
	}
	let url: string;
	try {
		const fragment = await encodeToFragment(gatherPatchData());
		url = `${location.origin}/synth#patch=${fragment}`;
	} catch {
		showSaveStatus('X ENCODE ERR');
		return;
	}
	if (await copyText(url)) {
		shareUrlFallback.set(null);
		showSaveStatus(`✓ LINK COPIED (${(url.length / 1024).toFixed(1)}KB)`);
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
		showSaveStatus('X NO CODEC');
		return;
	}
	try {
		const data = await decodeFromFragment<SynthPatchData>(m[1]);
		applyPatchData(data);
		history.replaceState(null, '', location.pathname);
		showSaveStatus('✓ SHARED PATCH LOADED');
		playSound('toggle');
	} catch {
		showSaveStatus('X BAD SHARE LINK');
	}
}

export function handleImportPatchFile(file: File): void {
	const reader = new FileReader();
	reader.onload = (ev) => {
		try {
			const parsed = JSON.parse(ev.target?.result as string);
			applyPatchData(parsed);
			showSaveStatus('✓ IMPORTED');
			playSound('toggle');
		} catch {
			showSaveStatus('X INVALID');
		}
	};
	reader.readAsText(file);
}
