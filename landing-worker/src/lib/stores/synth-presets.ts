import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { playSound } from '../sound';
import { KEY_TIMBRE_KEYS, type TrackData } from '../synth';
import { SMB1_NOISE_KEYS } from '../songs/mario1';
import { activeKey, activeTrackRow, currentTrack, noteNameOf, updateActiveTrack, applyKitToActiveTrack } from './synth-tracks';
import { showSaveStatus } from './synth-patch';

const STORAGE_KEY = 'krsz-synth-presets-v1';
const KIT_STORAGE_KEY = 'krsz-synth-kits-v1';
const FILE_FORMAT = 'krsz-synth-preset';
const KIT_FILE_FORMAT = 'krsz-synth-kit';

export type PresetCategory = 'SYNTH' | 'DRUMS';

export interface SoundPreset {
	name: string;
	category?: PresetCategory;
	preset: Partial<TrackData>;
}

/* Every built-in starts from a full, neutral timbre and overrides what it
   needs. A preset that only set the fields it cared about left the rest --
   an LFO, a noise mix, a sub, a pulse width -- over from whatever the track
   was before, so the same preset sounded different on every track. Now a
   preset is the whole sound. */
const BASE: Partial<TrackData> = {
	osc1Waveform: 'square',
	osc1Gain: 0.9,
	osc2Waveform: 'sawtooth',
	osc2Gain: 0.5,
	osc2Ratio: 1,
	detuneCents: 0,
	phaseOffset: 0,
	osc2Semitone: 0,
	pulseWidth: 50,
	subOscGain: 0,
	noiseGain: 0,
	noiseRetrig: 1,
	noiseRetrigGap: 12,
	blendMode: 'layer',
	morphAmount: 0,
	glideTime: 0,
	xfade: 0.5,
	filterType: 'lowpass',
	cutoff: 12000,
	resonance: 0.2,
	envFilterMod: 0,
	keyTracking: 0,
	attack: 0.005,
	decay: 0.15,
	sustain: 0.7,
	release: 0.1,
	ampAttack: 0.005,
	ampDecay: 0.15,
	ampSustain: 0.7,
	ampRelease: 0.1,
	filterAttack: 0.005,
	filterDecay: 0.15,
	filterSustain: 0.3,
	filterRelease: 0.1,
	filterEnvAmount: 0,
	pitchAttack: 0.001,
	pitchDecay: 0.03,
	pitchEnvAmount: 0,
	lfoWaveform: 'sine',
	lfoRate: 5,
	lfoPitchAmt: 0,
	lfoCutoffAmt: 0,
	lfoPanAmt: 0,
	lfoAmpAmt: 0,
	lfoFadeTime: 0,
	eqOn: false,
	eqGains: [0, 0, 0, 0, 0, 0],
	airGain: 0
};

/* A one-shot: instant on, no sustain, and the legacy attack/decay/sustain/
   release aliases kept in step with the AMP envelope so an old reader of the
   patch agrees with a new one. */
function hit(ampDecay: number, ampRelease: number, extra: Partial<TrackData>): Partial<TrackData> {
	return {
		...BASE,
		osc2Gain: 0,
		ampAttack: 0,
		ampDecay,
		ampSustain: 0,
		ampRelease,
		attack: 0,
		decay: ampDecay,
		sustain: 0,
		release: ampRelease,
		...extra
	};
}

function synth(extra: Partial<TrackData>): Partial<TrackData> {
	const p = { ...BASE, ...extra };
	// keep the legacy aliases in step
	p.attack = p.ampAttack;
	p.decay = p.ampDecay;
	p.sustain = p.ampSustain;
	p.release = p.ampRelease;
	return p;
}

export const SOUND_PRESETS: SoundPreset[] = [
	{
		name: '8-BIT BASS',
		category: 'SYNTH',
		preset: synth({
			osc1Waveform: 'square',
			osc2Waveform: 'triangle',
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
		})
	},
	{
		name: 'PLUCK',
		category: 'SYNTH',
		preset: synth({
			osc1Waveform: 'square',
			osc2Waveform: 'sawtooth',
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
		})
	},
	{
		name: 'BRASS',
		category: 'SYNTH',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc2Waveform: 'sawtooth',
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
		})
	},
	{
		// Was osc1Waveform 'pulse', which is not a Web Audio oscillator type:
		// every note threw on osc.type and the preset was silent. A pulse is a
		// square with PW off 50%, which the engine now actually builds.
		name: 'LEAD',
		category: 'SYNTH',
		preset: synth({
			osc1Waveform: 'square',
			pulseWidth: 25,
			osc2Waveform: 'sawtooth',
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
		})
	},

	/* DRUMS. Sequence them on any key; the pitched ones follow the note, the
	   noise ones use KEY TRK to get brighter up the keyboard. Numbers were
	   settled by rendering each hit offline and reading its length, peak and
	   spectral centroid, then listening -- see the commit that added them. */
	{
		// Sine with a 2.5-octave pitch drop over 45 ms and a sub underneath it.
		name: 'KICK 808',
		category: 'DRUMS',
		preset: hit(0.32, 0.06, {
			osc1Waveform: 'sine',
			osc1Gain: 1,
			subOscGain: 0.6,
			pitchEnvAmount: 2.5,
			pitchAttack: 0.001,
			pitchDecay: 0.045,
			cutoff: 3000
		})
	},
	{
		// Shorter, harder, a triangle for some edge and a burst of noise for the beater.
		name: 'KICK PUNCH',
		category: 'DRUMS',
		preset: hit(0.17, 0.04, {
			osc1Waveform: 'triangle',
			osc1Gain: 1,
			subOscGain: 0.4,
			noiseGain: 0.15,
			pitchEnvAmount: 3,
			pitchAttack: 0.001,
			pitchDecay: 0.03,
			cutoff: 5000,
			filterEnvAmount: -0.6,
			filterAttack: 0.001,
			filterDecay: 0.05,
			filterSustain: 0
		})
	},
	{
		// Body from a triangle and a sine a fifth up, rattle from the NOISE mix,
		// a short pitch snap on the body.
		name: 'SNARE',
		category: 'DRUMS',
		preset: hit(0.18, 0.05, {
			osc1Waveform: 'triangle',
			osc1Gain: 0.8,
			osc2Waveform: 'sine',
			osc2Gain: 0.5,
			osc2Semitone: 7,
			noiseGain: 0.9,
			pitchEnvAmount: 1,
			pitchAttack: 0.001,
			pitchDecay: 0.02,
			cutoff: 8000,
			resonance: 0.5,
			keyTracking: 0.5,
			filterEnvAmount: 0.3,
			filterAttack: 0.001,
			filterDecay: 0.08,
			filterSustain: 0,
			airGain: 0.2
		})
	},
	{
		// Three noise bursts 11 ms apart, high-passed at 1 kHz with the top
		// shelved down -- a band-pass there was 10 dB quieter than the hats.
		name: 'CLAP',
		category: 'DRUMS',
		preset: hit(0.25, 0.08, {
			osc1Waveform: 'noise',
			osc1Gain: 1,
			noiseRetrig: 3,
			noiseRetrigGap: 11,
			filterType: 'highpass',
			cutoff: 1000,
			resonance: 0.7,
			airGain: -0.4
		})
	},
	{
		name: 'CLOSED HAT',
		category: 'DRUMS',
		preset: hit(0.045, 0.02, {
			osc1Waveform: 'noise',
			osc1Gain: 1,
			filterType: 'highpass',
			cutoff: 7000,
			resonance: 0.5,
			keyTracking: 0.8,
			airGain: 0.4
		})
	},
	{
		name: 'OPEN HAT',
		category: 'DRUMS',
		preset: hit(0.35, 0.15, {
			osc1Waveform: 'noise',
			osc1Gain: 1,
			filterType: 'highpass',
			cutoff: 7000,
			resonance: 0.5,
			keyTracking: 0.8,
			airGain: 0.4
		})
	},
	{
		// Like the kick but a shallower drop and longer body; play it across a few keys for a rack of toms.
		name: 'TOM',
		category: 'DRUMS',
		preset: hit(0.35, 0.08, {
			osc1Waveform: 'sine',
			osc1Gain: 1,
			osc2Waveform: 'triangle',
			osc2Gain: 0.3,
			subOscGain: 0.3,
			noiseGain: 0.12,
			pitchEnvAmount: 1.2,
			pitchAttack: 0.001,
			pitchDecay: 0.08,
			cutoff: 2500
		})
	},
	{
		// Two oscillators ring-modulated (sum and difference tones two octaves
		// apart), 40 ms, high-passed so the ping is what is left.
		name: 'RIMSHOT',
		category: 'DRUMS',
		preset: hit(0.04, 0.02, {
			osc1Waveform: 'triangle',
			osc1Gain: 1,
			osc2Waveform: 'square',
			osc2Gain: 1,
			osc2Ratio: 4,
			blendMode: 'ring',
			filterType: 'highpass',
			cutoff: 600,
			resonance: 2,
			pitchEnvAmount: 0.5,
			pitchAttack: 0.001,
			pitchDecay: 0.01,
			airGain: 0.3
		})
	},
	{
		// Two squares a fifth-ish apart (the 808 uses 540 and 800 Hz), band-passed.
		name: 'COWBELL',
		category: 'DRUMS',
		preset: hit(0.3, 0.1, {
			osc1Waveform: 'square',
			osc1Gain: 1,
			osc2Waveform: 'square',
			osc2Gain: 1,
			osc2Ratio: 1.5,
			filterType: 'bandpass',
			cutoff: 1500,
			resonance: 1
		})
	},
	{
		// Noise with a soft attack and a filter that opens and closes with it.
		name: 'SHAKER',
		category: 'DRUMS',
		preset: hit(0.08, 0.05, {
			osc1Waveform: 'noise',
			osc1Gain: 1,
			ampAttack: 0.012,
			attack: 0.012,
			filterType: 'bandpass',
			cutoff: 6000,
			resonance: 2,
			keyTracking: 0.6,
			filterEnvAmount: 0.4,
			filterAttack: 0.01,
			filterDecay: 0.05,
			filterSustain: 0
		})
	}
];

export const PRESET_CATEGORIES: PresetCategory[] = ['SYNTH', 'DRUMS'];

/* What a preset is: the sound of a track, and nothing about where it sits in
   the mix or what it plays -- the engine's KEY_TIMBRE_KEYS, plus the per-track
   EQ, which a preset carries but a percussion key cannot. An allow-list rather
   than a deny-list so an imported file can only ever set fields the synth has. */
const TIMBRE_KEYS = [...KEY_TIMBRE_KEYS, 'eqOn', 'eqGains', 'modRoutes'] as const satisfies readonly (keyof TrackData)[];

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

/** The sound the racks are showing: the active track, through the active key in percussion mode. */
function activeTrack(): TrackData | undefined {
	return get(currentTrack);
}

/** "TRK 3: STEEL DRUM / MARIMBA" -> "STEEL DRUM / MARIMBA"; the slot number is not part of the sound. In percussion mode the key is. */
function presetNameFor(track: TrackData): string {
	const base = track.name.replace(/^TRK\s*\d+\s*:\s*/i, '').trim().toUpperCase() || 'PRESET';
	return track.percussion ? `${base} ${noteNameOf(get(activeKey))}` : base;
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

/**
 * Rename a user preset in place. Empty names are ignored; a name another
 * preset (built-in or user) already has gets a numeric suffix rather than
 * silently merging two sounds under one label. Returns the name actually used.
 */
export function renameUserPreset(userIdx: number, rawName: string): string | null {
	const name = rawName.trim().toUpperCase().slice(0, 40);
	if (!name) return null;
	const list = get(userPresets);
	const current = list[userIdx];
	if (!current) return null;
	if (name === current.name) return name;
	const taken = get(allPresets).map((p) => p.name).filter((n) => n !== current.name);
	const finalName = uniqueName(name, taken);
	userPresets.update((l) => l.map((p, i) => (i === userIdx ? { ...p, name: finalName } : p)));
	playSound('click');
	return finalName;
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

/* ── Kits: a whole key table for a percussion-mode track ───────────────── */

export interface DrumKit {
	name: string;
	keys: Record<number, Partial<TrackData>>;
}

interface KitFile {
	format: typeof KIT_FILE_FORMAT;
	version: 1;
	name: string;
	keys: Record<string, Partial<TrackData>>;
}

function keyOnly(p: Partial<TrackData>): Partial<TrackData> {
	const out: Record<string, unknown> = {};
	for (const k of KEY_TIMBRE_KEYS) if (p[k] !== undefined) out[k] = p[k];
	return out as Partial<TrackData>;
}

function drum(name: string): Partial<TrackData> {
	const p = SOUND_PRESETS.find((x) => x.name === name)?.preset ?? {};
	return keyOnly(p);
}

/* Indices count down from C8 = 0; C4 = 48. The pitched drums were voiced at
   the key they sit on here (kicks at C2, the tom at C3, the rest around C4). */
export const BUILTIN_KITS: DrumKit[] = [
	{
		name: '808 KIT',
		keys: {
			72: drum('KICK 808'), // C2
			70: drum('KICK PUNCH'), // D2
			60: drum('TOM'), // C3
			48: drum('SNARE'), // C4
			46: drum('CLAP'), // D4
			44: drum('CLOSED HAT'), // E4
			43: drum('OPEN HAT'), // F4
			41: drum('RIMSHOT'), // G4
			39: drum('COWBELL'), // A4
			37: drum('SHAKER') // B4
		}
	},
	{
		// The SMB1 noise channel's three beats on the keys the transcription uses; see songs/mario1.ts.
		name: 'SMB1 NES NOISE',
		keys: SMB1_NOISE_KEYS
	}
];

function sanitiseKeys(raw: Record<string, unknown>): Record<number, Partial<TrackData>> {
	const out: Record<number, Partial<TrackData>> = {};
	for (const [k, v] of Object.entries(raw)) {
		const idx = Number(k);
		if (!Number.isInteger(idx) || idx < 0 || idx > 127 || !v || typeof v !== 'object') continue;
		const t = keyOnly(pickTimbre(v as Record<string, unknown>));
		if (Object.keys(t).length) out[idx] = t;
	}
	return out;
}

export function isKitFile(parsed: unknown): parsed is KitFile {
	return (
		typeof parsed === 'object' &&
		parsed !== null &&
		(parsed as KitFile).format === KIT_FILE_FORMAT &&
		typeof (parsed as KitFile).keys === 'object' &&
		(parsed as KitFile).keys !== null
	);
}

function loadUserKits(): DrumKit[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(KIT_STORAGE_KEY);
		if (!raw) return [];
		const list = JSON.parse(raw);
		if (!Array.isArray(list)) return [];
		return list
			.filter((k) => k && typeof k.name === 'string' && k.keys && typeof k.keys === 'object')
			.map((k) => ({ name: String(k.name), keys: sanitiseKeys(k.keys) }));
	} catch {
		return [];
	}
}

export const userKits = writable<DrumKit[]>(loadUserKits());
if (browser) {
	userKits.subscribe((list) => {
		try {
			localStorage.setItem(KIT_STORAGE_KEY, JSON.stringify(list));
		} catch {
			/* quota / private mode */
		}
	});
}

export const allKits = derived(userKits, ($user) => [...BUILTIN_KITS, ...$user]);

function kitNames(): string[] {
	return get(allKits).map((k) => k.name);
}

/** Put a kit on the active track: percussion on, key table replaced. */
export function applyKit(kit: DrumKit): void {
	applyKitToActiveTrack(kit.keys);
	showSaveStatus(`✓ KIT ${kit.name}`);
	playSound('toggle');
}

function upsertUserKit(kit: DrumKit): void {
	userKits.update((list) => {
		const i = list.findIndex((u) => u.name === kit.name);
		if (i >= 0) {
			const next = [...list];
			next[i] = kit;
			return next;
		}
		return [...list, kit];
	});
}

/** Keep the active track's key table as a kit. Needs percussion mode with at least one customised key. */
export function saveActiveAsKit(): void {
	const row = get(activeTrackRow);
	const keys = row?.percussion ? sanitiseKeys((row.keyTimbres ?? {}) as Record<string, unknown>) : {};
	if (!Object.keys(keys).length) {
		showSaveStatus('X NO KIT — turn on P and give keys their sounds first');
		return;
	}
	const base = row!.name.replace(/^TRK\s*\d+\s*:\s*/i, '').trim().toUpperCase() || 'KIT';
	const name = uniqueName(`${base} KIT`, kitNames());
	upsertUserKit({ name, keys });
	showSaveStatus(`✓ KIT ${name}`);
	playSound('click');
}

export function deleteUserKit(userIdx: number): void {
	userKits.update((list) => list.filter((_, i) => i !== userIdx));
	playSound('click');
}

export function renameUserKit(userIdx: number, rawName: string): string | null {
	const name = rawName.trim().toUpperCase().slice(0, 40);
	if (!name) return null;
	const current = get(userKits)[userIdx];
	if (!current) return null;
	if (name === current.name) return name;
	const finalName = uniqueName(name, kitNames().filter((n) => n !== current.name));
	userKits.update((l) => l.map((k, i) => (i === userIdx ? { ...k, name: finalName } : k)));
	playSound('click');
	return finalName;
}

export function exportActiveKit(): void {
	const row = get(activeTrackRow);
	const keys = row?.percussion ? sanitiseKeys((row.keyTimbres ?? {}) as Record<string, unknown>) : {};
	if (!Object.keys(keys).length) {
		showSaveStatus('X NO KIT — turn on P and give keys their sounds first');
		return;
	}
	const name = row!.name.replace(/^TRK\s*\d+\s*:\s*/i, '').trim().toUpperCase() || 'KIT';
	const file: KitFile = { format: KIT_FILE_FORMAT, version: 1, name, keys };
	const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `krsz-kit-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kit'}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	playSound('click');
}

/** Apply a parsed kit file to the active track and keep it in the user list. */
export function applyKitFile(file: KitFile): void {
	const keys = sanitiseKeys(file.keys as Record<string, unknown>);
	if (!Object.keys(keys).length) throw new Error('empty kit');
	const base = (typeof file.name === 'string' && file.name.trim().toUpperCase()) || 'IMPORTED KIT';
	const name = BUILTIN_KITS.some((k) => k.name === base) ? uniqueName(base, kitNames()) : base;
	upsertUserKit({ name, keys });
	applyKitToActiveTrack(keys);
	showSaveStatus(`✓ KIT ${name}`);
	playSound('toggle');
}

export function handleImportKitFile(file: File): void {
	const reader = new FileReader();
	reader.onload = (ev) => {
		try {
			const parsed = JSON.parse(ev.target?.result as string);
			if (isKitFile(parsed)) applyKitFile(parsed);
			else if (isPresetFile(parsed)) applyPresetFile(parsed);
			else throw new Error('not a kit');
		} catch {
			showSaveStatus('X NOT A KIT');
		}
	};
	reader.readAsText(file);
}
