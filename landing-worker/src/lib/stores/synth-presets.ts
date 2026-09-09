import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { playSound } from '../sound';
import { tr } from '../i18n';
import { KEY_TIMBRE_KEYS, BLANK_TRACK_TIMBRE, type TrackData } from '../synth';
import { SMB1_NOISE_KEYS } from '../songs/mario1';
import { activeKey, activeTrackRow, currentTrack, noteNameOf, updateActiveTrack, applyKitToActiveTrack, setTrackEditedHook } from './synth-tracks';
import { showSaveStatus } from './synth-patch';
import { askConfirm } from './synth-confirm';

const STORAGE_KEY = 'krsz-synth-presets-v1';
const KIT_STORAGE_KEY = 'krsz-synth-kits-v1';
const FILE_FORMAT = 'krsz-synth-preset';
const KIT_FILE_FORMAT = 'krsz-synth-kit';

/* Ten families, each of which can hold both kinds of sound: an electric one
   built by subtraction on racks 1-7, and an acoustic one built as a signal path
   in the patch bay. The pair is the point -- a LEAD is a lead whether it is a
   saw through a filter or a bowed string -- so they share a heading and `kind`
   separates them within it. */
export type PresetCategory =
	| 'LEAD'
	| 'PAD'
	| 'BASS'
	| 'PLUCK'
	| 'KEYBOARD'
	| 'ORGAN'
	| 'STRING'
	| 'MALLET'
	| 'FX'
	| 'DRUM';

/** E = electric, built by subtraction. AC = acoustic, built as a signal path. */
export type PresetKind = 'E' | 'AC';

export interface SoundPreset {
	name: string;
	/** Built-ins carry one; user presets are listed under MY PRESETS regardless. */
	category?: PresetCategory;
	/** Which half of its family this is. Absent means electric. */
	kind?: PresetKind;
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
	/* BASS */
	{
		name: '8-BIT BASS',
		category: 'BASS',
		kind: 'E',
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
		// One sine and the SUB under it, nothing above 800 Hz: weight, no edge.
		name: 'SUB BASS',
		category: 'BASS',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sine',
			osc1Gain: 1,
			osc2Gain: 0,
			subOscGain: 0.7,
			cutoff: 800,
			resonance: 0.2,
			ampAttack: 0.005,
			ampDecay: 0.2,
			ampSustain: 0.9,
			ampRelease: 0.15
		})
	},
	{
		// A saw into a high-Q low-pass that the envelope sweeps, with glide: the 303 recipe.
		name: 'ACID BASS',
		category: 'BASS',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			glideTime: 60,
			cutoff: 400,
			resonance: 8,
			filterEnvAmount: 0.7,
			filterAttack: 0.003,
			filterDecay: 0.2,
			filterSustain: 0,
			filterRelease: 0.1,
			ampAttack: 0.003,
			ampDecay: 0.25,
			ampSustain: 0.6,
			ampRelease: 0.12
		})
	},
	{
		// Sine modulated by a sine an octave up; the envelope on the filter stands in for an FM index envelope.
		name: 'FM BASS',
		category: 'BASS',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sine',
			osc1Gain: 1,
			osc2Waveform: 'sine',
			osc2Gain: 0.8,
			osc2Ratio: 2,
			blendMode: 'fm',
			morphAmount: 0.5,
			cutoff: 3000,
			resonance: 0.5,
			filterEnvAmount: 0.4,
			filterDecay: 0.25,
			filterSustain: 0.2,
			ampAttack: 0.003,
			ampDecay: 0.3,
			ampSustain: 0.5,
			ampRelease: 0.15
		})
	},

	/* LEAD */
	{
		// Was osc1Waveform 'pulse', which is not a Web Audio oscillator type:
		// every note threw on osc.type and the preset was silent. A pulse is a
		// square with PW off 50%, which the engine now actually builds.
		name: 'LEAD',
		category: 'LEAD',
		kind: 'E',
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
	{
		// Two saws 14 cents apart with a delayed vibrato.
		name: 'SAW LEAD',
		category: 'LEAD',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 0.9,
			osc2Waveform: 'sawtooth',
			osc2Gain: 0.8,
			detuneCents: 14,
			cutoff: 5000,
			resonance: 1,
			ampAttack: 0.01,
			ampDecay: 0.2,
			ampSustain: 0.8,
			ampRelease: 0.2,
			lfoWaveform: 'sine',
			lfoRate: 5.5,
			lfoPitchAmt: 0.1,
			lfoFadeTime: 300
		})
	},
	{
		// SYNC mode with the second oscillator at a fifth; the filter envelope gives it the rip.
		name: 'SYNC LEAD',
		category: 'LEAD',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Waveform: 'square',
			osc2Gain: 0.9,
			osc2Ratio: 1.5,
			blendMode: 'sync',
			morphAmount: 0.7,
			cutoff: 7000,
			resonance: 2,
			filterEnvAmount: 0.5,
			filterDecay: 0.3,
			filterSustain: 0.3,
			ampAttack: 0.005,
			ampDecay: 0.3,
			ampSustain: 0.7,
			ampRelease: 0.2
		})
	},
	{
		// A 15% pulse, no filter, a fast vibrato: the NES lead voice.
		name: 'CHIP LEAD',
		category: 'LEAD',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'square',
			osc1Gain: 1,
			pulseWidth: 15,
			osc2Gain: 0,
			cutoff: 12000,
			resonance: 0.2,
			ampAttack: 0,
			ampDecay: 0.1,
			ampSustain: 0.8,
			ampRelease: 0.05,
			lfoWaveform: 'triangle',
			lfoRate: 6,
			lfoPitchAmt: 0.08,
			lfoFadeTime: 150
		})
	},
	{
		name: 'BRASS',
		category: 'LEAD',
		kind: 'E',
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

	/* PLUCK */
	{
		name: 'PLUCK',
		category: 'PLUCK',
		kind: 'E',
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
		// Triangle with a sine an octave up, a filter that snaps shut, no sustain: a plucked string.
		name: 'KOTO',
		category: 'PLUCK',
		kind: 'AC',
		preset: synth({
			osc1Waveform: 'triangle',
			osc1Gain: 1,
			osc2Waveform: 'sine',
			osc2Gain: 0.4,
			osc2Ratio: 2,
			cutoff: 4000,
			resonance: 1,
			keyTracking: 0.5,
			filterEnvAmount: 0.6,
			filterAttack: 0,
			filterDecay: 0.08,
			filterSustain: 0,
			ampAttack: 0.002,
			ampDecay: 0.4,
			ampSustain: 0,
			ampRelease: 0.3,
			rackChain: ['string', 'body'],
			rackParams: { decayTime: 1.8, damping: 26, stiffness: 55, strBlend: 100, bodySize: 40, bodyDepth: 45, bodyMix: 50 }
		})
	},
	{
		// Sine body and a quieter triangle an octave up, decaying together.
		name: 'MARIMBA',
		category: 'MALLET',
		kind: 'AC',
		preset: synth({
			osc1Waveform: 'sine',
			osc1Gain: 1,
			osc2Waveform: 'triangle',
			osc2Gain: 0.6,
			osc2Ratio: 2,
			cutoff: 8000,
			resonance: 0.3,
			ampAttack: 0,
			ampDecay: 0.35,
			ampSustain: 0,
			ampRelease: 0.25,
			rackChain: ['modes', 'body'],
			rackParams: { mode1: 1, mode2: 3.9, mode3: 9.2, modeQ: 22, modeMix: 85, bodySize: 45, bodyDepth: 50, bodyMix: 55 }
		})
	},
	{
		// Two sines ring-modulated at a 3.5 ratio: inharmonic partials, long tail, air.
		name: 'BELL',
		category: 'MALLET',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sine',
			osc1Gain: 1,
			osc2Waveform: 'sine',
			osc2Gain: 1,
			osc2Ratio: 3.5,
			blendMode: 'ring',
			cutoff: 12000,
			resonance: 0.2,
			ampAttack: 0.002,
			ampDecay: 0.8,
			ampSustain: 0.2,
			ampRelease: 1.2,
			airGain: 0.3
		})
	},

	/* KEYS */
	{
		// Sine carrier, sine modulator four octaves up at a light index: the tine.
		name: 'E-PIANO',
		category: 'KEYBOARD',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sine',
			osc1Gain: 1,
			osc2Waveform: 'sine',
			osc2Gain: 0.5,
			osc2Ratio: 4,
			blendMode: 'fm',
			morphAmount: 0.2,
			cutoff: 6000,
			resonance: 0.3,
			filterEnvAmount: 0.3,
			filterDecay: 0.4,
			filterSustain: 0.2,
			ampAttack: 0.002,
			ampDecay: 0.6,
			ampSustain: 0.35,
			ampRelease: 0.3
		})
	},
	{
		// Drawbars: fundamental, octave, and the SUB below; no envelope to speak of; a slow tremolo.
		name: 'ORGAN',
		category: 'ORGAN',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sine',
			osc1Gain: 0.8,
			osc2Waveform: 'sine',
			osc2Gain: 0.5,
			osc2Ratio: 2,
			subOscGain: 0.5,
			cutoff: 12000,
			resonance: 0.2,
			ampAttack: 0.005,
			ampDecay: 0.05,
			ampSustain: 1,
			ampRelease: 0.05,
			lfoWaveform: 'sine',
			lfoRate: 6,
			lfoAmpAmt: 0.15
		})
	},
	{
		// A 25% pulse through a resonant low-pass that closes fast.
		name: 'CLAV',
		category: 'KEYBOARD',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'square',
			osc1Gain: 1,
			pulseWidth: 25,
			osc2Waveform: 'sawtooth',
			osc2Gain: 0.4,
			cutoff: 3500,
			resonance: 4,
			filterEnvAmount: 0.7,
			filterAttack: 0,
			filterDecay: 0.12,
			filterSustain: 0.1,
			ampAttack: 0,
			ampDecay: 0.3,
			ampSustain: 0.15,
			ampRelease: 0.08
		})
	},
	{
		// Saw with a square an octave up, plucked and bright.
		name: 'HARPSICHORD',
		category: 'KEYBOARD',
		kind: 'AC',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 0.9,
			osc2Waveform: 'square',
			osc2Gain: 0.4,
			osc2Ratio: 2,
			cutoff: 9000,
			resonance: 1,
			filterEnvAmount: 0.3,
			filterDecay: 0.2,
			filterSustain: 0,
			ampAttack: 0,
			ampDecay: 0.5,
			ampSustain: 0,
			ampRelease: 0.2,
			rackChain: ['string', 'body'],
			rackParams: { decayTime: 1.1, damping: 6, stiffness: 85, strBlend: 100, bodySize: 25, bodyDepth: 35, bodyMix: 25 }
		})
	},

	/* PAD */
	{
		// Detuned saws behind a low filter that breathes with a slow LFO.
		name: 'WARM PAD',
		category: 'PAD',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 0.9,
			osc2Waveform: 'sawtooth',
			osc2Gain: 0.9,
			detuneCents: 10,
			cutoff: 1800,
			resonance: 0.8,
			filterEnvAmount: 0.1,
			filterAttack: 0.6,
			filterDecay: 0.5,
			filterSustain: 0.8,
			ampAttack: 0.6,
			ampDecay: 0.5,
			ampSustain: 0.9,
			ampRelease: 1.2,
			lfoWaveform: 'sine',
			lfoRate: 0.3,
			lfoCutoffAmt: 0.15
		})
	},
	{
		// Wider detune, brighter filter, a vibrato that fades in.
		name: 'STRINGS',
		category: 'PAD',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 0.9,
			osc2Waveform: 'sawtooth',
			osc2Gain: 0.9,
			detuneCents: 18,
			cutoff: 4000,
			resonance: 0.5,
			ampAttack: 0.4,
			ampDecay: 0.3,
			ampSustain: 1,
			ampRelease: 0.9,
			lfoWaveform: 'sine',
			lfoRate: 5,
			lfoPitchAmt: 0.06,
			lfoFadeTime: 600
		})
	},
	{
		// Triangle and a sine an octave up, open filter, air on top, drifting in the stereo field.
		name: 'GLASS PAD',
		category: 'PAD',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'triangle',
			osc1Gain: 0.9,
			osc2Waveform: 'sine',
			osc2Gain: 0.7,
			osc2Ratio: 2,
			detuneCents: 6,
			cutoff: 12000,
			resonance: 0.2,
			ampAttack: 0.5,
			ampDecay: 0.3,
			ampSustain: 1,
			ampRelease: 1.5,
			airGain: 0.5,
			lfoWaveform: 'sine',
			lfoRate: 0.4,
			lfoPanAmt: 0.3
		})
	},
	{
		// Square with a square an octave below, a low filter the LFO opens and closes.
		name: 'HOLLOW PAD',
		category: 'PAD',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'square',
			osc1Gain: 0.8,
			osc2Waveform: 'square',
			osc2Gain: 0.6,
			osc2Ratio: 0.5,
			cutoff: 2500,
			resonance: 1.5,
			ampAttack: 0.7,
			ampDecay: 0.4,
			ampSustain: 0.9,
			ampRelease: 1.4,
			lfoWaveform: 'triangle',
			lfoRate: 0.2,
			lfoCutoffAmt: 0.25
		})
	},

	/* ACOUSTIC. These are not subtractive patches with a filter doing the work:
	   each one is an excitation shaped by the amp envelope, driven into a
	   resonator and a body from the patch bay (ADV -> RACK). That chain is what
	   a real instrument is, and what the racks alone cannot reach -- a plucked
	   string needs partials that decay at different rates, which no single
	   filter produces.

	   Measured at C4, key held 1.5s (peak / spectral centroid / length):
	     PIANO    -12.2 dB   596 Hz  1.81 s
	     GUITAR   -12.4 dB   475 Hz  1.00 s
	     BASS     -14.2 dB   467 Hz  1.37 s
	     STRINGS  -16.1 dB  1287 Hz  1.62 s
	     CLARINET -17.9 dB  2281 Hz  1.66 s
	     FLUTE    -15.6 dB  2384 Hz  1.66 s

	   The plucked three ignore how long the key is held, as a struck string
	   does; the blown three sound for as long as they are blown. */
	{
		// A hammer, a stiff string and a soundboard. STIF is what stretches the
		// partials sharp of the harmonic series -- the reason a piano does not
		// sound like an organ.
		name: 'PIANO',
		category: 'KEYBOARD',
		kind: 'AC',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			cutoff: 9000,
			ampAttack: 0.001,
			ampDecay: 0.06,
			ampSustain: 0,
			ampRelease: 0.03,
			rackChain: ['string', 'body'],
			rackParams: { decayTime: 4, damping: 22, stiffness: 45, strBlend: 100, bodySize: 35, bodyDepth: 55, bodyMix: 55 }
		})
	},
	{
		// The same pluck on a slack string in a bigger box.
		name: 'GUITAR',
		category: 'PLUCK',
		kind: 'AC',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			cutoff: 9000,
			ampAttack: 0.001,
			ampDecay: 0.06,
			ampSustain: 0,
			ampRelease: 0.03,
			rackChain: ['string', 'body'],
			rackParams: { decayTime: 2.2, damping: 34, stiffness: 6, strBlend: 100, bodySize: 62, bodyDepth: 65, bodyMix: 70 }
		})
	},
	{
		// Heavily damped, in the largest body: an upright rather than a synth bass.
		name: 'UPRIGHT BASS',
		category: 'BASS',
		kind: 'AC',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			cutoff: 9000,
			ampAttack: 0.001,
			ampDecay: 0.06,
			ampSustain: 0,
			ampRelease: 0.03,
			rackChain: ['string', 'body'],
			rackParams: { decayTime: 3, damping: 52, stiffness: 3, strBlend: 100, bodySize: 88, bodyDepth: 60, bodyMix: 60 }
		})
	},
	{
		// A bow, not a pluck: the excitation sustains, so the envelope holds.
		name: 'BOWED STRINGS',
		category: 'STRING',
		kind: 'AC',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			cutoff: 6000,
			ampAttack: 0.09,
			ampDecay: 0.3,
			ampSustain: 0.8,
			ampRelease: 0.25,
			rackChain: ['string', 'body'],
			rackParams: { decayTime: 1.4, damping: 40, stiffness: 2, strBlend: 75, bodySize: 55, bodyDepth: 50, bodyMix: 60 }
		})
	},
	{
		// Breath into a tube closed at one end: odd harmonics only.
		name: 'CLARINET',
		category: 'STRING',
		kind: 'AC',
		preset: synth({
			osc1Waveform: 'noise',
			osc1Gain: 0.6,
			osc2Gain: 0,
			cutoff: 5000,
			ampAttack: 0.05,
			ampDecay: 0.2,
			ampSustain: 0.85,
			ampRelease: 0.15,
			rackChain: ['tube', 'body'],
			rackParams: { tubeDecay: 1.1, tubeDamp: 45, tubeOdd: 100, tubeMix: 85, bodySize: 45, bodyDepth: 40, bodyMix: 40 }
		})
	},
	{
		// Open at both ends, so all the harmonics are there.
		name: 'FLUTE',
		category: 'STRING',
		kind: 'AC',
		preset: synth({
			osc1Waveform: 'noise',
			osc1Gain: 0.6,
			osc2Gain: 0,
			cutoff: 5000,
			ampAttack: 0.05,
			ampDecay: 0.2,
			ampSustain: 0.85,
			ampRelease: 0.15,
			rackChain: ['tube', 'body'],
			rackParams: { tubeDecay: 0.9, tubeDamp: 60, tubeOdd: 0, tubeMix: 80, bodySize: 38, bodyDepth: 30, bodyMix: 35 }
		})
	},

	/* FX -- the sounds that are not an instrument.
	   Everything here is a noise, a sweep or a texture rather than something you
	   would play a melody on, which is why they share a heading instead of being
	   filed under whichever family they happen to resemble. These are E: they are
	   made from the oscillators, the filter and the LFO, none of which needs the
	   patch bay to do what it does here. */
	{
		// White noise through a filter the envelope drags down from wide open:
		// the shape of a wave falling back, hence the long release.
		name: 'SEA WASH',
		category: 'FX',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'noise',
			osc1Gain: 1,
			osc2Gain: 0,
			noiseGain: 0.5,
			filterType: 'lowpass',
			cutoff: 900,
			resonance: 2.5,
			ampAttack: 0.9,
			ampDecay: 1.2,
			ampSustain: 0.55,
			ampRelease: 1.8,
			filterAttack: 1.1,
			filterDecay: 1.6,
			filterSustain: 0.2,
			filterRelease: 2,
			filterEnvAmount: 0.85,
			lfoWaveform: 'sine',
			lfoRate: 0.35,
			lfoCutoffAmt: 0.4
		})
	},
	{
		// A pitch envelope that falls two octaves into a resonant filter. The
		// drop is the sound; the note only says where it starts.
		name: 'LASER ZAP',
		category: 'FX',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			filterType: 'lowpass',
			cutoff: 6000,
			resonance: 9,
			ampAttack: 0.001,
			ampDecay: 0.28,
			ampSustain: 0,
			ampRelease: 0.12,
			pitchAttack: 0.001,
			pitchDecay: 0.22,
			pitchEnvAmount: -24
		})
	},
	{
		// Two saws a long way apart, swept slowly: the beating is the texture,
		// so the detune is deliberately past what would be called in tune.
		name: 'DRONE',
		category: 'FX',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 0.8,
			osc2Waveform: 'sawtooth',
			osc2Gain: 0.8,
			detuneCents: 34,
			subOscGain: 0.5,
			filterType: 'lowpass',
			cutoff: 1400,
			resonance: 5,
			ampAttack: 1.4,
			ampDecay: 1,
			ampSustain: 0.9,
			ampRelease: 2.2,
			lfoWaveform: 'triangle',
			lfoRate: 0.18,
			lfoCutoffAmt: 0.55,
			lfoPitchAmt: 0.05
		})
	},
	{
		// Noise retriggered fast enough to have a pitch of its own, which is what
		// makes it read as a machine rather than as wind.
		name: 'STATIC',
		category: 'FX',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'noise',
			osc1Gain: 1,
			osc2Gain: 0,
			noiseGain: 0.85,
			noiseRetrig: 1,
			noiseRetrigGap: 3,
			/* A wide bandpass: at Q=7 the filter discards most of what a noise
			   source has to offer and the texture thins out. */
			filterType: 'bandpass',
			cutoff: 2600,
			resonance: 2.5,
			ampAttack: 0.004,
			ampDecay: 0.25,
			ampSustain: 0.5,
			ampRelease: 0.2,
			lfoWaveform: 'square',
			lfoRate: 11,
			lfoCutoffAmt: 0.6
		})
	},
	{
		// A square gated by the LFO faster than the ear separates: one note
		// arrives as a run of them.
		name: 'STUTTER',
		category: 'FX',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'square',
			osc1Gain: 1,
			osc2Waveform: 'square',
			osc2Gain: 0.5,
			osc2Semitone: 12,
			filterType: 'lowpass',
			cutoff: 3200,
			resonance: 3,
			ampAttack: 0.002,
			ampDecay: 0.3,
			ampSustain: 0.7,
			ampRelease: 0.08,
			lfoWaveform: 'square',
			lfoRate: 16,
			lfoAmpAmt: 0.95
		})
	},
	{
		// The filter opening slowly under a bright saw: a riser, which is only
		// interesting held.
		name: 'RISER',
		category: 'FX',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Waveform: 'sawtooth',
			osc2Gain: 0.6,
			detuneCents: 12,
			filterType: 'lowpass',
			cutoff: 300,
			resonance: 8,
			ampAttack: 0.6,
			ampDecay: 1,
			ampSustain: 0.95,
			ampRelease: 0.5,
			filterAttack: 2.6,
			filterDecay: 1,
			filterSustain: 1,
			filterRelease: 0.4,
			filterEnvAmount: 0.95,
			lfoWaveform: 'sine',
			lfoRate: 5.5,
			lfoPitchAmt: 0.12
		})
	}
];

export const PRESET_CATEGORIES: PresetCategory[] = [
	'LEAD',
	'PAD',
	'BASS',
	'PLUCK',
	'KEYBOARD',
	'ORGAN',
	'STRING',
	'MALLET',
	'FX',
	'DRUM'
];

const CATEGORY_HINT_KEYS: Record<PresetCategory, string> = {
	LEAD: 'synthPanels.presets.hintLead',
	PAD: 'synthPanels.presets.hintPad',
	BASS: 'synthPanels.presets.hintBass',
	PLUCK: 'synthPanels.presets.hintPluck',
	KEYBOARD: 'synthPanels.presets.hintKeyboard',
	ORGAN: 'synthPanels.presets.hintOrgan',
	STRING: 'synthPanels.presets.hintString',
	MALLET: 'synthPanels.presets.hintMallet',
	FX: 'synthPanels.presets.hintFx',
	DRUM: 'synthPanels.presets.hintDrums'
};

/* A sibling component (PresetMenu.svelte) indexes this by category as a plain
   Record; the Proxy resolves each hint through `tr()` at access time (never
   at import time), so it always reads in the current locale without either
   side needing to change shape. */
export const CATEGORY_HINTS: Record<PresetCategory, string> = new Proxy({} as Record<PresetCategory, string>, {
	get: (_target, prop: string) => tr(CATEGORY_HINT_KEYS[prop as PresetCategory])
});

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

/* True once the track has been edited away from the preset it was loaded from.
   The trigger then reads MODIFIED rather than naming a preset the sound is no
   longer -- which is what tells the player there is something worth saving, and
   stops a name from vouching for a sound it does not describe.

   Hooked into updateActiveTrack, which every edit passes through, so no knob
   has to remember to report itself. Applying a preset goes through the same
   function and clears the flag again afterwards. */
export const presetModified = writable<boolean>(false);
setTrackEditedHook(() => presetModified.set(true));

/* The name of the kit on the active track, or null when a single preset is
   what was last applied. A kit replaces the whole key table rather than the
   track's one timbre, so soundPresetIdx cannot describe it -- it kept naming
   whichever preset happened to be selected before, which is a sound the track
   is no longer making. The menu trigger prefers this when it is set. */
export const activeKitName = writable<string | null>(null);

export function applyPresetAt(idx: number): void {
	const sel = get(allPresets)[idx];
	if (!sel) return;
	soundPresetIdx.set(idx);
	activeKitName.set(null);
	/* A preset built as a signal path turns ADV on and opens the patch bay: the
	   chain only sounds in ADV, so applying one without switching would leave
	   the player hearing the bare excitation and wondering what broke. One that
	   is not built that way turns ADV off, which is what makes it sound like
	   itself -- but the chain stays on the track rather than being cleared, so
	   coming back to an acoustic preset finds its path intact. */
	const isChainPreset = Array.isArray(sel.preset.rackChain) && sel.preset.rackChain.length > 0;
	updateActiveTrack({
		...sel.preset,
		advanced: isChainPreset,
		...(isChainPreset ? { advancedView: 'rack' as const } : {})
	});
	presetModified.set(false);
	playSound('toggle');
}

/* Start from nothing rather than from whatever happened to be loaded.
 *
 * Two of them, because the synth has two instruments in it: the plain one is a
 * neutral subtractive voice edited on racks 1-7, and the advanced one is a
 * signal path with a string and a body already placed -- the shape most
 * acoustic instruments take -- so there is something to hear while the rest is
 * built up. Both count as modified from the start: there is no preset they came
 * from, and the point is to save what you make. */
function blankTimbre(): Partial<TrackData> {
	const blank = JSON.parse(JSON.stringify(BLANK_TRACK_TIMBRE)) as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const k of TIMBRE_KEYS) if (blank[k] !== undefined) out[k] = blank[k];
	return out as Partial<TrackData>;
}

export function newPreset(): void {
	askConfirm({
		title: tr('synth.confirm.newPatchTitle'),
		body: tr('synth.confirm.newPatchBody'),
		confirmLabel: tr('synth.confirm.discard'),
		onConfirm: doNewPreset
	});
}

function doNewPreset(): void {
	/* The graph goes too. A patch that kept the last one's wiring is not new,
	   and the modules would be invisible until ADV was switched back on. */
	updateActiveTrack({
		...blankTimbre(),
		rackChain: [],
		rackParams: {},
		rackGraph: { nodes: [], cables: [] },
		graphParams: {},
		advanced: false
	});
	presetModified.set(true);
	showSaveStatus(tr('synthPanels.toast.newPreset'));
	playSound('click');
}

export function newAdvancedPreset(): void {
	askConfirm({
		title: tr('synth.confirm.newAdvPatchTitle'),
		body: tr('synth.confirm.newAdvPatchBody'),
		confirmLabel: tr('synth.confirm.discard'),
		onConfirm: doNewAdvancedPreset
	});
}

function doNewAdvancedPreset(): void {
	updateActiveTrack({
		...blankTimbre(),
		// A short excitation: a resonator answers a strike, and a blank ADV patch
		// that droned would teach the wrong thing about what the chain is for.
		ampAttack: 0.002,
		ampDecay: 0.08,
		ampSustain: 0,
		ampRelease: 0.05,
		attack: 0.002,
		decay: 0.08,
		sustain: 0,
		release: 0.05,
		rackChain: ['string', 'body'],
		rackParams: {},
		// An empty canvas, so the seeded chain is what sounds: a leftover graph
		// takes precedence over the chain and would silently win.
		rackGraph: { nodes: [], cables: [] },
		graphParams: {},
		advanced: true,
		advancedView: 'rack'
	});
	presetModified.set(true);
	showSaveStatus(tr('synthPanels.toast.newAdvancedPreset'));
	playSound('click');
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
	showSaveStatus(tr('synthPanels.toast.presetSaved', { name }));
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
	showSaveStatus(tr('synthPanels.toast.presetSaved', { name }));
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
			showSaveStatus(tr('synthPanels.toast.notAPreset'));
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

/* The single drums.
 *
 * Not presets: a player wants a kit, not a lone snare, so these never appear
 * in the menu. They exist because the kits below name them, and because each
 * one is a voice worth keeping the working for -- see BUILTIN_KITS for the
 * measured numbers behind the KRSZ kit.
 */
const DRUM_VOICES: Record<string, Partial<TrackData>> = {
	// Sine with a 2.5-octave pitch drop over 45 ms and a sub underneath it.
	'KICK 808': hit(0.32, 0.06, {
			osc1Waveform: 'sine',
			osc1Gain: 1,
			subOscGain: 0.6,
			pitchEnvAmount: 2.5,
			pitchAttack: 0.001,
			pitchDecay: 0.045,
			cutoff: 3000
		}),
	// Shorter, harder, a triangle for some edge and a burst of noise for the beater.
	'KICK PUNCH': hit(0.17, 0.04, {
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
		}),
	// Body from a triangle and a sine a fifth up, rattle from the NOISE mix,
	// a short pitch snap on the body.
	'SNARE': hit(0.18, 0.05, {
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
		}),
	// Three noise bursts 11 ms apart, high-passed at 1 kHz with the top
	// shelved down -- a band-pass there was 10 dB quieter than the hats.
	'CLAP': hit(0.25, 0.08, {
			osc1Waveform: 'noise',
			osc1Gain: 1,
			noiseRetrig: 3,
			noiseRetrigGap: 11,
			filterType: 'highpass',
			cutoff: 1000,
			resonance: 0.7,
			airGain: -0.4
		}),
	'CLOSED HAT': hit(0.045, 0.02, {
			osc1Waveform: 'noise',
			osc1Gain: 1,
			filterType: 'highpass',
			cutoff: 7000,
			resonance: 0.5,
			keyTracking: 0.8,
			airGain: 0.4
		}),
	'OPEN HAT': hit(0.35, 0.15, {
			osc1Waveform: 'noise',
			osc1Gain: 1,
			filterType: 'highpass',
			cutoff: 7000,
			resonance: 0.5,
			keyTracking: 0.8,
			airGain: 0.4
		}),
	// Like the kick but a shallower drop and longer body; play it across a few keys for a rack of toms.
	'TOM': hit(0.35, 0.08, {
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
		}),
	// Two oscillators ring-modulated (sum and difference tones two octaves
	// apart), 40 ms, high-passed so the ping is what is left.
	'RIMSHOT': hit(0.04, 0.02, {
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
		}),
	// Two squares a fifth-ish apart (the 808 uses 540 and 800 Hz), band-passed.
	'COWBELL': hit(0.3, 0.1, {
			osc1Waveform: 'square',
			osc1Gain: 1,
			osc2Waveform: 'square',
			osc2Gain: 1,
			osc2Ratio: 1.5,
			filterType: 'bandpass',
			cutoff: 1500,
			resonance: 1
		}),
	// Noise with a soft attack and a filter that opens and closes with it.
	'SHAKER': hit(0.08, 0.05, {
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
		}),
};

function drum(name: string): Partial<TrackData> {
	return keyOnly(DRUM_VOICES[name] ?? {});
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
		/* Voiced against the 808 kit's two measured faults rather than by taste
		   alone. Every hit here was rendered offline at the key it sits on and
		   measured for peak, spectral centroid and decay; the numbers below are
		   what that pass settled on.

		   The 808 kit spans 11 dB peak-to-peak, so its cowbell and shaker
		   disappear under its own kick and have to be ridden by hand. This one
		   spans 7.6 dB, and what is left is deliberate -- hats and shaker are
		   meant to sit under the kick, not level with it.

		   Its clap also centred at 11 kHz, which is hiss rather than hands (a
		   real 808 clap sits at 1-2 kHz). The fix was not a narrower filter: a
		   bandpass tight enough to darken it cost ~9 dB that no gain could win
		   back, since osc1Gain was already at 1. A gentle low-pass gets the
		   same 3.2 kHz centre 6 dB louder, and the same trade is why the
		   rimshot and shaker high-pass instead of band-passing.

		   All 47 General MIDI percussion notes (35-81), not a selection: a drum
		   part written anywhere else names its sounds by GM number, so a kit
		   that stops after ten of them drops whatever it does not cover. The
		   808 kit's own arrangement had no standard behind it -- ten sounds
		   spread over three octaves -- and a pattern imported onto it landed
		   wherever. Indices count down from C8 = 0, so a key here is 108 - the
		   GM note, and they read high to low because pitch runs the other way.

		   The kick, snare, hats and cymbals are not tuned by ear but fitted to
		   real acoustic recordings -- Dirt-Samples (github.com/tidalcycles),
		   which is public domain. Each reference is reduced to a fingerprint:
		   spectral centroid, 85% rolloff, decay to -40 dB, and the share of
		   energy in seven octave bands. A hill-climb then searches the voice's
		   parameters to minimise the distance to that fingerprint. Guessing at
		   numbers and listening did not converge; a target does. The comment on
		   each of those keys names its reference and the two headline numbers.

		   Fitting them needed per-key EQ, which is why `keyEqGains` exists: a
		   real snare's spectrum dips at 2.5 kHz and rises again above it, and
		   no single filter does that. The six-band EQ the synth already had is
		   per *track*, so one curve would have to serve the kick and the hat.

		   The whole set was balanced in one pass against the kick at -12 dB,
		   each voice rendered at its own key and its gains scaled until it hit
		   a target chosen per instrument (toms near the kick, cymbals and
		   shakers well under it). That leaves 10.6 dB between the loudest and
		   quietest voice, none of it accidental, and nothing clipping. The
		   cymbals sit at the bottom because they are gain-capped -- osc1Gain
		   is already 1 and the high-pass takes the rest. */
		name: 'KRSZ KIT',
		keys: {
			// B1 / GM 35 ACOUSTIC BASS DRUM -- -13.8 dB, 700 Hz, 0.18 s.
			73: keyOnly(
				hit(0.16, 0.04, {
					osc1Waveform: 'triangle',
					osc1Gain: 0.5129,
					subOscGain: 0.2308,
					noiseGain: 0.0923,
					cutoff: 4200,
					filterAttack: 0.001,
					filterDecay: 0.045,
					filterSustain: 0,
					filterEnvAmount: -0.55,
					pitchDecay: 0.028,
					pitchEnvAmount: 2.8
				})
			),
			/* C2 / GM 36 BASS DRUM 1. Fitted to Dirt-Samples drum/000_drum1.wav: centroid
			   1080 Hz against 1194, decay 0.197 s against 0.202. */
			72: keyOnly(
				hit(0.42, 0.07, {
					osc1Waveform: 'sine',
					osc1Gain: 0.58,
					subOscGain: 0.28,
					noiseGain: 0.03,
					cutoff: 5625,
					resonance: 0.6,
					filterAttack: 0.001,
					filterDecay: 0.05,
					filterSustain: 0,
					filterEnvAmount: -0.1,
					pitchDecay: 0.055,
					pitchEnvAmount: 2.4,
					airGain: 0.57,
					keyEqGains: [-1.4, -4, 6.4, -10, 6, 8]
				})
			),
			// C#2 / GM 37 SIDE STICK -- -12.1 dB, 4832 Hz, 0.09 s.
			71: keyOnly(
				hit(0.045, 0.02, {
					osc1Waveform: 'triangle',
					osc1Gain: 0.011,
					osc2Waveform: 'square',
					osc2Gain: 0.011,
					osc2Ratio: 4,
					blendMode: 'ring',
					filterType: 'highpass',
					cutoff: 700,
					resonance: 1.2,
					pitchDecay: 0.01,
					pitchEnvAmount: 0.5,
					airGain: 0.2
				})
			),
			/* D2 / GM 38 ACOUSTIC SNARE. Fitted to Dirt-Samples drum/001_drum2.wav: centroid
			   4966 Hz against 5092, decay 0.143 s against 0.151. */
			70: keyOnly(
				hit(0.2954, 0.05, {
					osc1Waveform: 'triangle',
					osc1Gain: 0.1285,
					osc2Waveform: 'sine',
					osc2Gain: 0.6,
					osc2Semitone: 7,
					noiseGain: 1,
					cutoff: 6000,
					resonance: 1,
					filterAttack: 0.001,
					filterDecay: 0.06,
					filterSustain: 0,
					filterEnvAmount: 0.9,
					pitchDecay: 0.02,
					pitchEnvAmount: 0.7,
					airGain: 0.1928,
					keyEqGains: [8.4, 10.398, 6, -1.229, 0, 0]
				})
			),
			// D#2 / GM 39 HAND CLAP -- -16.6 dB, 3264 Hz, 0.24 s.
			69: keyOnly(
				hit(0.22, 0.07, {
					osc1Waveform: 'noise',
					osc1Gain: 1,
					noiseRetrig: 3,
					noiseRetrigGap: 11,
					cutoff: 3000,
					resonance: 1,
					airGain: -0.5
				})
			),
			// E2 / GM 40 ELECTRIC SNARE -- -13.8 dB, 4823 Hz, 0.17 s.
			68: keyOnly(
				hit(0.14, 0.04, {
					osc1Waveform: 'triangle',
					osc1Gain: 0.5309,
					osc2Waveform: 'sine',
					osc2Gain: 0.2124,
					osc2Semitone: 7,
					noiseGain: 0.5309,
					cutoff: 6500,
					resonance: 1.2,
					keyTracking: 0.3,
					filterAttack: 0.001,
					filterDecay: 0.05,
					filterSustain: 0,
					filterEnvAmount: 0.4,
					pitchDecay: 0.015,
					pitchEnvAmount: 1.2,
					airGain: 0.15
				})
			),
			// F2 / GM 41 LOW FLOOR TOM -- 100 Hz body, -15.6 dB, 0.42 s.
			67: keyOnly(
				hit(0.42, 0.06, {
					osc1Gain: 0,
					osc2Waveform: 'sine',
					osc2Gain: 1,
					osc2Ratio: 1.2599,
					noiseGain: 0.4772,
					cutoff: 3600,
					resonance: 0.9,
					filterAttack: 0.001,
					filterDecay: 0.05,
					filterSustain: 0,
					filterEnvAmount: 0.5,
					pitchDecay: 0.035,
					pitchEnvAmount: 0.45,
					airGain: 0.2
				})
			),
			/* F#2 / GM 42 CLOSED HI-HAT. Fitted to Dirt-Samples drum/002_drum3.wav: centroid
			   9334 Hz against 9674, decay 0.085 s against 0.087. */
			66: keyOnly(
				hit(0.1628, 0.04, {
					osc1Waveform: 'metal',
					osc1Gain: 0.5412,
					osc2Waveform: 'metal',
					osc2Gain: 0.4725,
					osc2Ratio: 1.5874,
					noiseGain: 0.8,
					blendMode: 'ring',
					cutoff: 18000,
					resonance: 1.3171,
					keyTracking: 0.4,
					filterAttack: 0.001,
					filterDecay: 0.04,
					filterSustain: 0,
					filterEnvAmount: 0.9,
					airGain: 0.8,
					keyEqGains: [8.4, -9.627, -8.4, -8.4, 6.4721, 5.2309]
				})
			),
			// G2 / GM 43 HIGH FLOOR TOM -- 138 Hz body, -15.1 dB, 0.38 s.
			65: keyOnly(
				hit(0.38, 0.06, {
					osc1Gain: 0,
					osc2Waveform: 'sine',
					osc2Gain: 1,
					osc2Ratio: 1.3265,
					noiseGain: 0.4698,
					cutoff: 3900,
					resonance: 0.9,
					filterAttack: 0.001,
					filterDecay: 0.05,
					filterSustain: 0,
					filterEnvAmount: 0.5,
					pitchDecay: 0.035,
					pitchEnvAmount: 0.45,
					airGain: 0.2
				})
			),
			// G#2 / GM 44 PEDAL HI-HAT -- the closed hat, shorter still. -17.3 dB, 9548 Hz, 0.11 s.
			64: keyOnly(
				hit(0.075, 0.035, {
					osc1Waveform: 'metal',
					osc1Gain: 1,
					osc2Waveform: 'metal',
					osc2Gain: 1,
					osc2Ratio: 1.5874,
					noiseGain: 0.3794,
					blendMode: 'ring',
					filterType: 'highpass',
					cutoff: 4600,
					resonance: 1,
					keyTracking: 0.6,
					filterAttack: 0.001,
					filterDecay: 0.03,
					filterSustain: 0,
					filterEnvAmount: 0.35,
					airGain: 0.3
				})
			),
			// A2 / GM 45 LOW TOM -- 150 Hz body, -15.7 dB, 0.35 s.
			63: keyOnly(
				hit(0.35, 0.06, {
					osc1Gain: 0,
					osc2Waveform: 'sine',
					osc2Gain: 1,
					osc2Ratio: 1.4091,
					noiseGain: 0.4183,
					cutoff: 4200,
					resonance: 0.9,
					filterAttack: 0.001,
					filterDecay: 0.05,
					filterSustain: 0,
					filterEnvAmount: 0.5,
					pitchDecay: 0.035,
					pitchEnvAmount: 0.45,
					airGain: 0.2
				})
			),
			/* A#2 / GM 46 OPEN HI-HAT. Fitted to Dirt-Samples ho/HHOD0.wav: centroid
			   8307 Hz against 8820, decay 0.271 s against 0.253. */
			62: keyOnly(
				hit(0.4755, 0.14, {
					osc1Waveform: 'metal',
					osc1Gain: 0.3987,
					osc2Waveform: 'metal',
					osc2Gain: 0.9293,
					osc2Ratio: 1.5874,
					noiseGain: 0.8,
					blendMode: 'ring',
					cutoff: 18000,
					resonance: 0.4373,
					keyTracking: 0.4,
					filterAttack: 0.001,
					filterDecay: 0.04,
					filterSustain: 0,
					filterEnvAmount: 0.74,
					airGain: 0.6282,
					keyEqGains: [-11.629, -2.002, -10.402, 2.002, 0, 0]
				})
			),
			// B2 / GM 47 LOW-MID TOM -- 188 Hz body, -16.6 dB, 0.32 s.
			61: keyOnly(
				hit(0.32, 0.06, {
					osc1Gain: 0,
					osc2Waveform: 'sine',
					osc2Gain: 1,
					osc2Ratio: 1.4983,
					noiseGain: 0.4171,
					cutoff: 4600,
					resonance: 0.9,
					filterAttack: 0.001,
					filterDecay: 0.05,
					filterSustain: 0,
					filterEnvAmount: 0.5,
					pitchDecay: 0.035,
					pitchEnvAmount: 0.45,
					airGain: 0.2
				})
			),
			// C3 / GM 48 HI-MID TOM -- 213 Hz body, -14.8 dB, 0.29 s.
			60: keyOnly(
				hit(0.29, 0.06, {
					osc1Gain: 0,
					osc2Waveform: 'sine',
					osc2Gain: 1,
					osc2Ratio: 1.6818,
					noiseGain: 0.4724,
					cutoff: 5000,
					resonance: 0.9,
					filterAttack: 0.001,
					filterDecay: 0.05,
					filterSustain: 0,
					filterEnvAmount: 0.5,
					pitchDecay: 0.035,
					pitchEnvAmount: 0.45,
					airGain: 0.2
				})
			),
			/* C#3 / GM 49 CRASH CYMBAL 1. Fitted to Dirt-Samples hh/001_hh3crash.wav: centroid
			   5768 Hz against 5709, decay 1.337 s against 1.469. */
			59: keyOnly(
				hit(2.4, 0.85, {
					osc1Waveform: 'metal',
					osc1Gain: 1,
					osc2Waveform: 'metal',
					osc2Gain: 0.886,
					osc2Ratio: 1.732,
					noiseGain: 1,
					blendMode: 'ring',
					cutoff: 10000,
					resonance: 0.7801,
					keyTracking: 0.4,
					filterAttack: 0.001,
					filterDecay: 0.04,
					filterSustain: 0,
					filterEnvAmount: 0.2,
					airGain: 0.8,
					ampAttack: 0.003,
					keyEqGains: [0, 0, 0, -2.002, 0, 0]
				})
			),
			// D3 / GM 50 HIGH TOM -- 263 Hz body, -16.5 dB, 0.26 s.
			58: keyOnly(
				hit(0.26, 0.06, {
					osc1Gain: 0,
					osc2Waveform: 'sine',
					osc2Gain: 1,
					osc2Ratio: 1.7708,
					noiseGain: 0.4461,
					cutoff: 5400,
					resonance: 0.9,
					filterAttack: 0.001,
					filterDecay: 0.05,
					filterSustain: 0,
					filterEnvAmount: 0.5,
					pitchDecay: 0.035,
					pitchEnvAmount: 0.45,
					airGain: 0.2
				})
			),
			/* D#3 / GM 51 RIDE CYMBAL 1. Fitted to Dirt-Samples cr/RIDED0.wav: centroid
			   8816 Hz against 8923, decay 1.139 s against 1.151. */
			57: keyOnly(
				hit(2.0166, 0.55, {
					osc1Waveform: 'metal',
					osc1Gain: 0.7,
					osc2Waveform: 'metal',
					osc2Gain: 0.7,
					osc2Ratio: 1.4142,
					noiseGain: 0.5347,
					blendMode: 'ring',
					cutoff: 18000,
					resonance: 0.8232,
					keyTracking: 0.4,
					filterAttack: 0.001,
					filterDecay: 0.04,
					filterSustain: 0,
					filterEnvAmount: 0.3272,
					airGain: 0.35,
					keyEqGains: [8.4, -11.629, -8.4, -5.208, 8.4, 2.002]
				})
			),
			// E3 / GM 52 CHINESE CYMBAL -- darker and trashier than the crashes. -14.8 dB, 11494 Hz, 1.31 s.
			56: keyOnly(
				hit(1.5, 0.9, {
					osc1Waveform: 'metal',
					osc1Gain: 0.3468,
					osc2Waveform: 'metal',
					osc2Gain: 0.3468,
					osc2Ratio: 1.732,
					noiseGain: 0.4211,
					blendMode: 'ring',
					filterType: 'highpass',
					cutoff: 3200,
					resonance: 0.8,
					keyTracking: 0.3,
					airGain: 0.5,
					ampAttack: 0.004
				})
			),
			// F3 / GM 53 RIDE BELL -- the bell: tighter ratio, no wash. -15.5 dB, 2166 Hz, 0.42 s.
			55: keyOnly(
				hit(0.42, 0.22, {
					osc1Waveform: 'metal',
					osc1Gain: 0.7586,
					osc2Waveform: 'metal',
					osc2Gain: 0.7586,
					osc2Ratio: 1.26,
					noiseGain: 0.0379,
					blendMode: 'ring',
					cutoff: 5500,
					resonance: 2.2,
					keyTracking: 0.3,
					airGain: 0.2
				})
			),
			// F#3 / GM 54 TAMBOURINE -- -15.4 dB, 11398 Hz, 0.19 s.
			54: keyOnly(
				hit(0.16, 0.08, {
					osc1Waveform: 'metal',
					osc1Gain: 0.912,
					noiseGain: 0.456,
					filterType: 'highpass',
					cutoff: 5500,
					resonance: 0.8,
					keyTracking: 0.5,
					airGain: 0.2
				})
			),
			// G3 / GM 55 SPLASH CYMBAL -- a short crash. -16.7 dB, 12678 Hz, 0.74 s.
			53: keyOnly(
				hit(0.8, 0.5, {
					osc1Waveform: 'metal',
					osc1Gain: 0.2952,
					osc2Waveform: 'metal',
					osc2Gain: 0.2952,
					osc2Ratio: 1.732,
					noiseGain: 0.3584,
					blendMode: 'ring',
					filterType: 'highpass',
					cutoff: 5200,
					resonance: 0.8,
					keyTracking: 0.3,
					airGain: 0.5,
					ampAttack: 0.004
				})
			),
			// G#3 / GM 56 COWBELL -- -16 dB, 2712 Hz, 0.29 s.
			52: keyOnly(
				hit(0.28, 0.1, {
					osc1Gain: 0.6237,
					osc2Waveform: 'square',
					osc2Gain: 0.6237,
					osc2Ratio: 1.5,
					filterType: 'bandpass',
					cutoff: 1800,
					resonance: 0.5,
					airGain: 0.1
				})
			),
			// A3 / GM 57 CRASH CYMBAL 2 -- the second crash, a touch brighter. -14.8 dB, 12568 Hz, 1.51 s.
			51: keyOnly(
				hit(1.7, 1, {
					osc1Waveform: 'metal',
					osc1Gain: 0.335,
					osc2Waveform: 'metal',
					osc2Gain: 0.335,
					osc2Ratio: 1.732,
					noiseGain: 0.4068,
					blendMode: 'ring',
					filterType: 'highpass',
					cutoff: 4200,
					resonance: 0.8,
					keyTracking: 0.3,
					airGain: 0.5,
					ampAttack: 0.004
				})
			),
			// A#3 / GM 58 VIBRASLAP -- -18.1 dB, 5506 Hz, 0.45 s.
			50: keyOnly(
				hit(0.45, 0.15, {
					osc1Waveform: 'metal',
					osc1Gain: 1,
					noiseGain: 0.8977,
					noiseRetrig: 4,
					noiseRetrigGap: 22,
					filterType: 'bandpass',
					cutoff: 2600,
					resonance: 1.2,
					airGain: 0.1
				})
			),
			/* B3 / GM 59 RIDE CYMBAL 2. Fitted to Dirt-Samples cr/RIDED8.wav: centroid
			   11494 Hz against 11133, decay 0.65 s against 0.655. */
			49: keyOnly(
				hit(1.204, 0.32, {
					osc1Waveform: 'metal',
					osc1Gain: 0.4697,
					osc2Waveform: 'metal',
					osc2Gain: 1,
					osc2Ratio: 1.4142,
					noiseGain: 0.8303,
					blendMode: 'ring',
					cutoff: 18000,
					resonance: 0.96,
					keyTracking: 0.4,
					filterAttack: 0.001,
					filterDecay: 0.04,
					filterSustain: 0,
					filterEnvAmount: 0.2,
					airGain: 0.8,
					keyEqGains: [-2.002, -14, -4.4332, -11.629, 0, 0]
				})
			),
			// C4 / GM 60 HI BONGO -- -15.1 dB, 640 Hz, 0.19 s.
			48: keyOnly(
				hit(0.16, 0.06, {
					osc1Waveform: 'sine',
					osc1Gain: 0.507,
					osc2Waveform: 'triangle',
					osc2Gain: 0.1774,
					noiseGain: 0.0406,
					cutoff: 3600,
					resonance: 0.6,
					pitchDecay: 0.04,
					pitchEnvAmount: 0.9
				})
			),
			// C#4 / GM 61 LOW BONGO -- -14.9 dB, 586 Hz, 0.21 s.
			47: keyOnly(
				hit(0.19, 0.06, {
					osc1Waveform: 'sine',
					osc1Gain: 0.5129,
					osc2Waveform: 'triangle',
					osc2Gain: 0.1795,
					noiseGain: 0.041,
					cutoff: 3000,
					resonance: 0.6,
					pitchDecay: 0.04,
					pitchEnvAmount: 0.85
				})
			),
			// D4 / GM 62 MUTE HI CONGA -- -15.7 dB, 603 Hz, 0.13 s.
			46: keyOnly(
				hit(0.1, 0.06, {
					osc1Waveform: 'sine',
					osc1Gain: 0.4786,
					osc2Waveform: 'triangle',
					osc2Gain: 0.1675,
					noiseGain: 0.0383,
					cutoff: 2800,
					resonance: 0.6,
					pitchDecay: 0.04,
					pitchEnvAmount: 0.8
				})
			),
			// D#4 / GM 63 OPEN HI CONGA -- -14.5 dB, 570 Hz, 0.27 s.
			45: keyOnly(
				hit(0.26, 0.06, {
					osc1Waveform: 'sine',
					osc1Gain: 0.5309,
					osc2Waveform: 'triangle',
					osc2Gain: 0.1858,
					noiseGain: 0.0425,
					cutoff: 2600,
					resonance: 0.6,
					pitchDecay: 0.04,
					pitchEnvAmount: 0.9
				})
			),
			// E4 / GM 64 LOW CONGA -- -14.3 dB, 547 Hz, 0.3 s.
			44: keyOnly(
				hit(0.3, 0.06, {
					osc1Waveform: 'sine',
					osc1Gain: 0.5309,
					osc2Waveform: 'triangle',
					osc2Gain: 0.1858,
					noiseGain: 0.0425,
					cutoff: 2200,
					resonance: 0.6,
					pitchDecay: 0.04,
					pitchEnvAmount: 0.85
				})
			),
			// F4 / GM 65 HIGH TIMBALE -- -15.4 dB, 1212 Hz, 0.24 s.
			43: keyOnly(
				hit(0.22, 0.06, {
					osc1Waveform: 'triangle',
					osc1Gain: 0.537,
					osc2Waveform: 'sine',
					osc2Gain: 0.2148,
					noiseGain: 0.0644,
					cutoff: 4200,
					resonance: 1.2,
					pitchEnvAmount: 0.7,
					airGain: 0.1
				})
			),
			// F#4 / GM 66 LOW TIMBALE -- -14.6 dB, 1069 Hz, 0.27 s.
			42: keyOnly(
				hit(0.26, 0.07, {
					osc1Waveform: 'triangle',
					osc1Gain: 0.5689,
					osc2Waveform: 'sine',
					osc2Gain: 0.2275,
					noiseGain: 0.0683,
					cutoff: 3400,
					resonance: 1.2,
					pitchDecay: 0.035,
					pitchEnvAmount: 0.7,
					airGain: 0.1
				})
			),
			// G4 / GM 67 HIGH AGOGO -- -16 dB, 3291 Hz, 0.27 s.
			41: keyOnly(
				hit(0.26, 0.1, {
					osc1Gain: 0.6607,
					osc2Waveform: 'square',
					osc2Gain: 0.5946,
					osc2Ratio: 1.5,
					filterType: 'bandpass',
					cutoff: 2400,
					resonance: 0.6,
					airGain: 0.15
				})
			),
			// G#4 / GM 68 LOW AGOGO -- -16 dB, 2849 Hz, 0.29 s.
			40: keyOnly(
				hit(0.28, 0.1, {
					osc1Gain: 0.631,
					osc2Waveform: 'square',
					osc2Gain: 0.5679,
					osc2Ratio: 1.5,
					filterType: 'bandpass',
					cutoff: 1900,
					resonance: 0.6,
					airGain: 0.15
				})
			),
			// A4 / GM 69 CABASA -- -18.2 dB, 14773 Hz, 0.11 s.
			39: keyOnly(
				hit(0.07, 0.05, {
					ampAttack: 0.004,
					attack: 0.004,
					osc1Waveform: 'noise',
					osc1Gain: 0.4315,
					filterType: 'highpass',
					cutoff: 5000,
					resonance: 0.7,
					keyTracking: 0.6,
					filterAttack: 0.01,
					filterDecay: 0.05,
					filterSustain: 0,
					filterEnvAmount: 0.4
				})
			),
			// A#4 / GM 70 MARACAS -- -19.6 dB, 14425 Hz, 0.14 s.
			38: keyOnly(
				hit(0.09, 0.05, {
					ampAttack: 0.012,
					attack: 0.012,
					osc1Waveform: 'noise',
					osc1Gain: 0.3981,
					filterType: 'highpass',
					cutoff: 4000,
					resonance: 0.7,
					keyTracking: 0.6,
					filterAttack: 0.01,
					filterDecay: 0.05,
					filterSustain: 0,
					filterEnvAmount: 0.4
				})
			),
			// B4 / GM 71 SHORT WHISTLE -- -17 dB, 593 Hz, 0.15 s.
			37: keyOnly(
				hit(0.12, 0.04, {
					osc1Waveform: 'sine',
					osc1Gain: 0.3981,
					osc2Waveform: 'sine',
					osc2Gain: 0.1991,
					osc2Ratio: 1.5,
					lfoRate: 9,
					lfoPitchAmt: 0.08,
					airGain: 0.2
				})
			),
			// C5 / GM 72 LONG WHISTLE -- -17 dB, 577 Hz, 0.37 s.
			36: keyOnly(
				hit(0.38, 0.1, {
					osc1Waveform: 'sine',
					osc1Gain: 0.3846,
					osc2Waveform: 'sine',
					osc2Gain: 0.1923,
					osc2Ratio: 1.5,
					lfoRate: 9,
					lfoPitchAmt: 0.08,
					airGain: 0.2
				})
			),
			// C#5 / GM 73 SHORT GUIRO -- -17.3 dB, 6455 Hz, 0.15 s.
			35: keyOnly(
				hit(0.12, 0.04, {
					osc1Waveform: 'noise',
					osc1Gain: 1,
					noiseRetrig: 4,
					noiseRetrigGap: 14,
					filterType: 'bandpass',
					cutoff: 3200,
					resonance: 1.4
				})
			),
			// D5 / GM 74 LONG GUIRO -- -17.7 dB, 6407 Hz, 0.4 s.
			34: keyOnly(
				hit(0.4, 0.1, {
					osc1Waveform: 'noise',
					osc1Gain: 1,
					noiseRetrig: 4,
					noiseRetrigGap: 34,
					filterType: 'bandpass',
					cutoff: 3000,
					resonance: 1.4
				})
			),
			// D#5 / GM 75 CLAVES -- -18.9 dB, 3404 Hz, 0.1 s.
			33: keyOnly(
				hit(0.055, 0.02, {
					osc1Waveform: 'triangle',
					osc1Gain: 1,
					osc2Waveform: 'square',
					osc2Gain: 0.6982,
					osc2Ratio: 3,
					blendMode: 'ring',
					filterType: 'bandpass',
					cutoff: 2500,
					resonance: 2.2,
					pitchDecay: 0.008,
					pitchEnvAmount: 0.4,
					airGain: 0.15
				})
			),
			// E5 / GM 76 HI WOOD BLOCK -- -19.6 dB, 3226 Hz, 0.1 s.
			32: keyOnly(
				hit(0.06, 0.02, {
					osc1Waveform: 'triangle',
					osc1Gain: 1,
					osc2Waveform: 'square',
					osc2Gain: 0.7568,
					osc2Ratio: 3,
					blendMode: 'ring',
					filterType: 'bandpass',
					cutoff: 2100,
					resonance: 2,
					pitchDecay: 0.008,
					pitchEnvAmount: 0.4,
					airGain: 0.15
				})
			),
			// F5 / GM 77 LOW WOOD BLOCK -- -18.4 dB, 2734 Hz, 0.11 s.
			31: keyOnly(
				hit(0.07, 0.02, {
					osc1Waveform: 'triangle',
					osc1Gain: 1,
					osc2Waveform: 'square',
					osc2Gain: 0.6591,
					osc2Ratio: 3,
					blendMode: 'ring',
					filterType: 'bandpass',
					cutoff: 1600,
					resonance: 2,
					pitchDecay: 0.008,
					pitchEnvAmount: 0.4,
					airGain: 0.15
				})
			),
			// F#5 / GM 78 MUTE CUICA -- -16 dB, 840 Hz, 0.15 s.
			30: keyOnly(
				hit(0.12, 0.04, {
					osc1Waveform: 'sine',
					osc1Gain: 0.4842,
					glideTime: 40,
					cutoff: 2600,
					resonance: 2.5,
					pitchAttack: 0.002,
					pitchDecay: 0.05,
					pitchEnvAmount: 0.8
				})
			),
			// G5 / GM 79 OPEN CUICA -- -16 dB, 808 Hz, 0.31 s.
			29: keyOnly(
				hit(0.3, 0.1, {
					osc1Waveform: 'sine',
					osc1Gain: 0.4624,
					glideTime: 90,
					cutoff: 3000,
					resonance: 2.5,
					pitchAttack: 0.003,
					pitchDecay: 0.12,
					pitchEnvAmount: 1.2
				})
			),
			// G#5 / GM 80 MUTE TRIANGLE -- -20 dB, 3855 Hz, 0.13 s.
			28: keyOnly(
				hit(0.09, 0.04, {
					osc1Waveform: 'sine',
					osc1Gain: 1,
					osc2Waveform: 'sine',
					osc2Gain: 1,
					osc2Ratio: 3.5,
					blendMode: 'ring',
					filterType: 'highpass',
					cutoff: 5000,
					airGain: 0.3
				})
			),
			// A5 / GM 81 OPEN TRIANGLE -- -18 dB, 3717 Hz, 0.73 s.
			27: keyOnly(
				hit(0.8, 0.5, {
					osc1Waveform: 'sine',
					osc1Gain: 1,
					osc2Waveform: 'sine',
					osc2Gain: 1,
					osc2Ratio: 3.5,
					blendMode: 'ring',
					filterType: 'highpass',
					cutoff: 5000,
					airGain: 0.3
				})
			)
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
	activeKitName.set(kit.name);
	presetModified.set(false);
	showSaveStatus(tr('synthPanels.toast.kitApplied', { name: kit.name }));
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
		showSaveStatus(tr('synthPanels.toast.noKitYet'));
		return;
	}
	const base = row!.name.replace(/^TRK\s*\d+\s*:\s*/i, '').trim().toUpperCase() || 'KIT';
	const name = uniqueName(`${base} KIT`, kitNames());
	upsertUserKit({ name, keys });
	showSaveStatus(tr('synthPanels.toast.kitApplied', { name }));
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
		showSaveStatus(tr('synthPanels.toast.noKitYet'));
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
	activeKitName.set(name);
	applyKitToActiveTrack(keys);
	showSaveStatus(tr('synthPanels.toast.kitApplied', { name }));
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
			showSaveStatus(tr('synthPanels.toast.notAKit'));
		}
	};
	reader.readAsText(file);
}
