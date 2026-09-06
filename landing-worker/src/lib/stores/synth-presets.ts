import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { playSound } from '../sound';
import { type TrackData, type SynthWaveform, type FilterType } from '../synth';
import { activeTrackId } from './synth-transport';
import { tracksState, updateActiveTrack } from './synth-tracks';
import { showSaveStatus } from './synth-patch';

const STORAGE_KEY = 'krsz-synth-presets-v1';
const FILE_FORMAT = 'krsz-synth-preset';

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

/* What a preset is: the sound of a track, and nothing about where it sits in
   the mix or what it plays. So every rack 1-6 parameter plus the AIR shelf
   from rack 7, and not volume, pan, mute/solo, the notes, or the track's
   identity. An allow-list rather than a deny-list so an imported file can
   only ever set fields the synth actually has. */
const TIMBRE_KEYS = [
	'osc1Waveform', 'osc1Gain', 'osc2Waveform', 'osc2Gain', 'osc2Ratio', 'detuneCents', 'phaseOffset',
	'osc2Semitone', 'pulseWidth', 'subOscGain', 'noiseGain',
	'blendMode', 'morphAmount', 'glideTime', 'xfade',
	'filterType', 'cutoff', 'resonance', 'envFilterMod', 'keyTracking',
	'attack', 'decay', 'sustain', 'release',
	'ampAttack', 'ampDecay', 'ampSustain', 'ampRelease',
	'filterAttack', 'filterDecay', 'filterSustain', 'filterRelease', 'filterEnvAmount',
	'pitchAttack', 'pitchDecay', 'pitchEnvAmount',
	'lfoWaveform', 'lfoRate', 'lfoPitchAmt', 'lfoCutoffAmt', 'lfoPanAmt', 'lfoAmpAmt', 'lfoFadeTime',
	'lfoDepth', 'lfoTarget',
	'eqOn', 'eqGains', 'airGain', 'modRoutes'
] as const satisfies readonly (keyof TrackData)[];

interface PresetFile {
	format: typeof FILE_FORMAT;
	version: 1;
	name: string;
	timbre: Partial<TrackData>;
}

function pickTimbre(src: Record<string, unknown>): Partial<TrackData> {
	const out: Record<string, unknown> = {};
	for (const k of TIMBRE_KEYS) {
		const v = src[k];
		if (v === undefined || v === null) continue;
		const t = typeof v;
		if (t === 'number' || t === 'string' || t === 'boolean' || Array.isArray(v)) out[k] = v;
	}
	return out as Partial<TrackData>;
}

export function isPresetFile(parsed: unknown): parsed is PresetFile {
	return (
		typeof parsed === 'object' &&
		parsed !== null &&
		(parsed as PresetFile).format === FILE_FORMAT &&
		typeof (parsed as PresetFile).timbre === 'object' &&
		(parsed as PresetFile).timbre !== null
	);
}

function loadUserPresets(): SoundPreset[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const list = JSON.parse(raw);
		if (!Array.isArray(list)) return [];
		return list
			.filter((p) => p && typeof p.name === 'string' && p.preset && typeof p.preset === 'object')
			.map((p) => ({ name: String(p.name), preset: pickTimbre(p.preset) }));
	} catch {
		return [];
	}
}

/** Presets the user saved or imported — persist across visits, listed after the built-ins. */
export const userPresets = writable<SoundPreset[]>(loadUserPresets());
if (browser) {
	userPresets.subscribe((list) => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
		} catch {
			/* quota / private mode — the list still works for this session */
		}
	});
}

export const allPresets = derived(userPresets, ($user) => [...SOUND_PRESETS, ...$user]);
/** Index into allPresets of the last preset applied (or picked) — what the menu trigger names. */
export const soundPresetIdx = writable<number>(0);

export function applyPresetAt(idx: number): void {
	const sel = get(allPresets)[idx];
	if (!sel) return;
	soundPresetIdx.set(idx);
	updateActiveTrack(sel.preset);
	playSound('toggle');
}

/** Arrow-key cycling from the transport hotkeys: wraps through built-ins and user presets alike. */
export function stepPreset(dir: number): void {
	const n = get(allPresets).length;
	if (!n) return;
	applyPresetAt((((get(soundPresetIdx) + dir) % n) + n) % n);
}

function activeTrack(): TrackData | undefined {
	const tracks = get(tracksState);
	return tracks[get(activeTrackId)] || tracks[0];
}

/** "TRK 3: STEEL DRUM / MARIMBA" -> "STEEL DRUM / MARIMBA"; the slot number is not part of the sound. */
function presetNameFor(track: TrackData): string {
	return track.name.replace(/^TRK\s*\d+\s*:\s*/i, '').trim().toUpperCase() || 'PRESET';
}

function uniqueName(base: string, taken: string[]): string {
	if (!taken.includes(base)) return base;
	let n = 2;
	while (taken.includes(`${base} ${n}`)) n++;
	return `${base} ${n}`;
}

/** Store the current preset in the user list, replacing an existing user entry of the same name. */
function upsertUserPreset(p: SoundPreset): void {
	userPresets.update((list) => {
		const i = list.findIndex((u) => u.name === p.name);
		if (i >= 0) {
			const next = [...list];
			next[i] = p;
			return next;
		}
		return [...list, p];
	});
	soundPresetIdx.set(get(allPresets).findIndex((q) => q.name === p.name));
}

export function saveActiveAsPreset(): void {
	const trk = activeTrack();
	if (!trk) return;
	const name = uniqueName(presetNameFor(trk), get(allPresets).map((p) => p.name));
	upsertUserPreset({ name, preset: pickTimbre(trk as unknown as Record<string, unknown>) });
	showSaveStatus(`✓ PRESET ${name}`);
	playSound('click');
}

export function deleteUserPreset(userIdx: number): void {
	const removedAbs = SOUND_PRESETS.length + userIdx;
	userPresets.update((list) => list.filter((_, i) => i !== userIdx));
	soundPresetIdx.update((i) => (i === removedAbs ? 0 : i > removedAbs ? i - 1 : i));
	playSound('click');
}

export function exportActivePreset(): void {
	const trk = activeTrack();
	if (!trk) return;
	const name = presetNameFor(trk);
	const file: PresetFile = {
		format: FILE_FORMAT,
		version: 1,
		name,
		timbre: pickTimbre(trk as unknown as Record<string, unknown>)
	};
	const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `krsz-preset-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'preset'}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	playSound('click');
}

/** Apply a parsed preset file to the active track and keep it in the user list. */
export function applyPresetFile(file: PresetFile): void {
	const timbre = pickTimbre(file.timbre as Record<string, unknown>);
	if (Object.keys(timbre).length === 0) throw new Error('empty preset');
	const base = (typeof file.name === 'string' && file.name.trim().toUpperCase()) || 'IMPORTED';
	// A re-import of the user's own file overwrites its entry; only a clash with
	// a built-in name gets a suffix, since those cannot be replaced.
	const name = SOUND_PRESETS.some((p) => p.name === base)
		? uniqueName(base, get(allPresets).map((p) => p.name))
		: base;
	upsertUserPreset({ name, preset: timbre });
	updateActiveTrack(timbre);
	showSaveStatus(`✓ PRESET ${name}`);
	playSound('toggle');
}

export function handleImportPresetFile(file: File): void {
	const reader = new FileReader();
	reader.onload = (ev) => {
		try {
			const parsed = JSON.parse(ev.target?.result as string);
			if (!isPresetFile(parsed)) throw new Error('not a preset');
			applyPresetFile(parsed);
		} catch {
			showSaveStatus('X NOT A PRESET');
		}
	};
	reader.readAsText(file);
}
