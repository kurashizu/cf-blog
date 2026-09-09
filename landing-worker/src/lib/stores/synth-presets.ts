import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { playSound } from '../sound';
import { tr } from '../i18n';
import { KEY_TIMBRE_KEYS, BLANK_TRACK_TIMBRE, type TrackData } from '../synth';
import { SMB1_NOISE_KEYS } from '../songs/mario1';
import { activeKey, activeTrackRow, currentTrack, noteNameOf, updateActiveTrack, applyKitToActiveTrack, setTrackEditedHook } from './synth-tracks';
import { showSaveStatus } from './synth-patch';
import { askConfirm } from './synth-confirm';
import { startingGraph } from './graph-model';
import type { GraphNode, GraphCable } from './graph-model';

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

/**
 * The same signal path, drawn.
 *
 * The AC presets are built as a chain, and a chain is what the engine plays --
 * but ADV opens on the patch bay, and a canvas reading "add modules from the
 * palette" while a piano is sounding says the wrong thing entirely. So each
 * chain preset also ships the graph that draws it: the same modules in the same
 * order, wired left to right, laid out on the grid.
 *
 * The engine prefers a graph over a chain when both are present, and these two
 * describe the same path, so what you hear does not change -- it just becomes
 * something you can see and take apart.
 */
function chainGraph(chain: string[]): { nodes: GraphNode[]; cables: GraphCable[] } {
	const nodes = chain.map((type, i) => ({
		id: `${type}-${i}`,
		type,
		// Spread along the grid with room for a card between each.
		x: 64 + i * 192,
		y: 96
	}));
	const cables = nodes.slice(1).map((n, i) => ({
		from: nodes[i].id,
		fromPort: 'out',
		to: n.id,
		toPort: 'in'
	}));
	return { nodes, cables };
}

/** A chain preset, plus the graph that draws it and the params keyed per node. */
function acoustic(chain: string[], params: Record<string, number>): Partial<TrackData> {
	const graph = chainGraph(chain);
	const graphParams: Record<string, number> = {};
	for (const n of graph.nodes) {
		for (const [k, v] of Object.entries(params)) graphParams[`${n.id}.${k}`] = v;
	}
	return { rackChain: chain, rackParams: params, rackGraph: graph, graphParams };
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
			...acoustic(['string', 'body'], { decayTime: 1.8, damping: 26, stiffness: 55, strBlend: 100, bodySize: 40, bodyDepth: 45, bodyMix: 50 })
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
			...acoustic(['modes', 'body'], { mode1: 1, mode2: 3.9, mode3: 9.2, modeQ: 22, modeMix: 85, bodySize: 45, bodyDepth: 50, bodyMix: 55 })
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
			...acoustic(['string', 'body'], { decayTime: 1.1, damping: 6, stiffness: 85, strBlend: 100, bodySize: 25, bodyDepth: 35, bodyMix: 25 })
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
			...acoustic(['string', 'body'], { decayTime: 4, damping: 22, stiffness: 45, strBlend: 100, bodySize: 35, bodyDepth: 55, bodyMix: 55 })
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
			...acoustic(['string', 'body'], { decayTime: 2.2, damping: 34, stiffness: 6, strBlend: 100, bodySize: 62, bodyDepth: 65, bodyMix: 70 })
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
			...acoustic(['string', 'body'], { decayTime: 3, damping: 52, stiffness: 3, strBlend: 100, bodySize: 88, bodyDepth: 60, bodyMix: 60 })
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
			...acoustic(['string', 'body'], { decayTime: 1.4, damping: 40, stiffness: 2, strBlend: 75, bodySize: 55, bodyDepth: 50, bodyMix: 60 })
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
			...acoustic(['tube', 'body'], { tubeDecay: 1.1, tubeDamp: 45, tubeOdd: 100, tubeMix: 85, bodySize: 45, bodyDepth: 40, bodyMix: 40 })
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
			...acoustic(['tube', 'body'], { tubeDecay: 0.9, tubeDamp: 60, tubeOdd: 0, tubeMix: 80, bodySize: 38, bodyDepth: 30, bodyMix: 35 })
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
		/* A pitch envelope that falls into a resonant filter. The drop is the
		   sound; the note only says where it starts.

		   The drop costs level -- the fundamental walks down out of the band
		   the filter passes -- and the first version paid for it twice: -24
		   semitones took it to around 16 Hz, and an amp decay of 0.28 into
		   zero sustain had the voice nearly gone before the step released it.
		   Measured 0.005 peak against 0.05-0.13 for the rest of the presets,
		   which is inaudible next to any of them. Shorter drop, a sustain to
		   hold it, and a sub and a square under the saw to carry the weight
		   the falling fundamental gives up: 0.052. */
		name: 'LASER ZAP',
		category: 'FX',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Waveform: 'square',
			osc2Gain: 0.7,
			subOscGain: 0.5,
			filterType: 'lowpass',
			cutoff: 6000,
			resonance: 9,
			ampAttack: 0.001,
			ampDecay: 0.5,
			ampSustain: 0.6,
			ampRelease: 0.3,
			pitchAttack: 0.001,
			pitchDecay: 0.3,
			pitchEnvAmount: -18
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
			/* A wide bandpass, held. A bandpass is what makes this read as a
			   machine rather than as wind, so it stays -- but a narrow one
			   throws away most of what a noise source has to offer: at Q=7 this
			   measured 0.029 peak against a 0.056 median, the quietest preset in
			   the library. Wider, lower and sustaining brings it to 0.053
			   without turning it into a wash. */
			filterType: 'bandpass',
			cutoff: 1800,
			resonance: 1,
			ampAttack: 0.004,
			ampDecay: 0.12,
			ampSustain: 0.9,
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

/* The keys whose value is a plain object rather than a scalar or an array.
   Everything else is copied by value; these are cloned, so a saved preset does
   not share a graph with the track it was saved from. */
const OBJECT_TIMBRE_KEYS = new Set<string>(['rackGraph', 'rackParams', 'graphParams', 'waveParams', 'modRoutes']);

function pickTimbre(src: Record<string, unknown>): Partial<TrackData> {
	const out: Record<string, unknown> = {};
	for (const k of TIMBRE_KEYS) {
		const v = src[k];
		if (v === undefined || v === null) continue;
		const t = typeof v;
		if (t === 'number' || t === 'string' || t === 'boolean' || Array.isArray(v)) out[k] = v;
		/* Objects were dropped here, which is why a patch bay never survived a
		   save: rackGraph and graphParams are plain objects, so every preset came
		   back with an empty rack however it was built. Deep-copied rather than
		   referenced, or editing the track afterwards would rewrite the preset. */
		else if (t === 'object' && OBJECT_TIMBRE_KEYS.has(k)) out[k] = JSON.parse(JSON.stringify(v));
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
	/* A patch is two sounds that share a track: the subtractive voice racks 1-7
	   edit, and the signal path the patch bay edits. Both travel with the preset
	   and only one is in force, so applying one has to set both sides -- the ADV
	   half explicitly, even when the preset has none.

	   Spreading the preset alone only writes the keys it happens to carry, so a
	   preset with no rack inherited whatever the last one left behind: loading
	   PIANO then SUB BASS and switching to ADV showed PIANO's string and body
	   under the bass. Every preset owns its own rack now, empty included. */
	const isChainPreset = Array.isArray(sel.preset.rackChain) && sel.preset.rackChain.length > 0;
	const hasGraph = !!sel.preset.rackGraph?.nodes?.length;
	updateActiveTrack({
		...sel.preset,
		rackChain: sel.preset.rackChain ?? [],
		rackParams: sel.preset.rackParams ?? {},
		rackGraph: sel.preset.rackGraph ?? { nodes: [], cables: [] },
		graphParams: sel.preset.graphParams ?? {},
		advanced: isChainPreset || hasGraph,
		...(isChainPreset || hasGraph ? { advancedView: 'rack' as const } : {})
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
		rackGraph: startingGraph(),
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
		rackGraph: startingGraph(),
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
/* A drum built the acoustic way: a strike into a set of modes into a body.
 *
 * The three modules and their wiring are the same for every drum in the kit --
 * what changes is the numbers, which is the point: a kick and a ride differ in
 * how hard they are hit, what they ring at and how long, not in what they are
 * made of. Written as one function so a drum reads as its physics rather than
 * as forty lines of graph.
 *
 * `tune` is the note the modes are built on, as a multiple of the key's own
 * pitch -- a drum map plays every key at a different frequency, and a kit needs
 * each drum to sound like itself wherever it sits. */
function drumPatch(o: {
	/** Strike: 0 soft mallet, 100 hard stick. */
	hard: number;
	/** Contact time in ms. */
	len: number;
	/** Strike brightness in Hz. */
	tone: number;
	/** The three mode ratios, against the key's pitch. */
	modes: [number, number, number];
	/** Ring: roughly q/12 seconds of audible tail on the lowest mode. */
	q: number;
	/** Shell size 0-100, and how much of it is heard. */
	body: number;
	bodyMix: number;
	/** Amp envelope, which cuts the whole voice. */
	decay: number;
	release?: number;
	/** Keys sharing a group cut each other off. 0 is none. */
	group?: number;
}): Partial<TrackData> {
	const nodes = [
		{ id: 'e', type: 'excite', x: 64, y: 96 },
		{ id: 'm', type: 'modes', x: 256, y: 96 },
		{ id: 'b', type: 'body', x: 448, y: 96 },
		{ id: 'o', type: 'out', x: 640, y: 96 }
	];
	const cables = [
		{ from: 'e', fromPort: 'out', to: 'm', toPort: 'in' },
		{ from: 'm', fromPort: 'out', to: 'b', toPort: 'in' },
		{ from: 'b', fromPort: 'out', to: 'o', toPort: 'in' }
	];
	return keyOnly({
		advanced: true,
		advancedView: 'rack',
		rackGraph: { nodes, cables },
		graphParams: {
			'e.hardness': o.hard,
			'e.exLength': o.len,
			'e.exTone': o.tone,
			'm.mode1': o.modes[0],
			'm.mode2': o.modes[1],
			'm.mode3': o.modes[2],
			'm.modeQ': o.q,
			'm.modeMix': 100,
			'b.bodySize': o.body,
			'b.bodyDepth': 50,
			'b.bodyMix': o.bodyMix,
			'o.outLevel': 100,
			'o.outPan': 0
		},
		// The graph makes the sound; the oscillators are off.
		osc1Gain: 0,
		osc2Gain: 0,
		subOscGain: 0,
		noiseGain: 0,
		ampAttack: 0.001,
		/* The modes ring for about q/40 seconds, and the amp envelope must not
		   close before they finish -- a crash written to ring 1.3 s measured
		   0.25 because the envelope reaped the voice first. The drum's own
		   decay still shapes it; this only stops the gate arriving early. */
		ampDecay: Math.max(o.decay, o.q / 12),
		ampSustain: 0,
		ampRelease: o.release ?? 0.04,
		muteGroup: o.group ?? 0
	});
}

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
		/* JAZZ KIT -- built in the patch bay rather than from oscillators.
		 *
		 * Every drum here is the same three ideas an acoustic drum actually is:
		 * something strikes a surface (EXCT), the surface rings at frequencies
		 * that are not a harmonic series (MODES), and a shell or a cymbal body
		 * colours what comes off it (BODY). The 808 kit next to it is the other
		 * way of doing this -- oscillators and envelopes, which is what a drum
		 * machine is -- so the two are different instruments rather than two
		 * attempts at one.
		 *
		 * A jazz kit rather than a rock one: smaller shells tuned higher, sticks
		 * rather than beaters, and cymbals that are thin and quick. That is what
		 * the numbers below say -- short decays, high mode ratios, and a light
		 * strike.
		 *
		 * Laid out on the General MIDI map (notes 35-81), so a MIDI drum part
		 * written anywhere else plays correctly here.
		 */
		name: 'JAZZ KIT',
		keys: {
			// GM 35 ACOUSTIC BASS DRUM
			73: drumPatch({ hard: 30, len: 9, tone: 1400, modes: [1, 1.6, 2.4], q: 7, body: 30, bodyMix: 70, decay: 0.2 }),
			// GM 36 BASS DRUM 1
			72: drumPatch({ hard: 38, len: 8, tone: 1700, modes: [1, 1.7, 2.6], q: 6, body: 28, bodyMix: 70, decay: 0.17 }),
			// GM 37 SIDE STICK
			71: drumPatch({ hard: 90, len: 2, tone: 6000, modes: [1, 3.1, 5.4], q: 4, body: 14, bodyMix: 45, decay: 0.06 }),
			// GM 38 ACOUSTIC SNARE
			70: drumPatch({ hard: 72, len: 3, tone: 5200, modes: [1, 2.6, 4.3], q: 6, body: 20, bodyMix: 55, decay: 0.14 }),
			// GM 39 HAND CLAP
			69: drumPatch({ hard: 80, len: 5, tone: 4200, modes: [1, 2.2, 3.7], q: 3, body: 22, bodyMix: 40, decay: 0.13 }),
			// GM 40 ELECTRIC SNARE
			68: drumPatch({ hard: 85, len: 3, tone: 6200, modes: [1, 2.8, 4.6], q: 5, body: 18, bodyMix: 50, decay: 0.12 }),
			// GM 41 LOW FLOOR TOM
			67: drumPatch({ hard: 45, len: 6, tone: 2400, modes: [1, 1.9, 3.0], q: 11, body: 38, bodyMix: 65, decay: 0.34 }),
			// GM 42 CLOSED HI-HAT
			66: drumPatch({ hard: 95, len: 2, tone: 9000, modes: [1, 4.2, 7.1], q: 3, body: 8, bodyMix: 25, decay: 0.05, group: 1 }),
			// GM 43 HIGH FLOOR TOM
			65: drumPatch({ hard: 46, len: 6, tone: 2600, modes: [1, 1.9, 3.0], q: 10, body: 35, bodyMix: 65, decay: 0.3 }),
			// GM 44 PEDAL HI-HAT
			64: drumPatch({ hard: 88, len: 3, tone: 7600, modes: [1, 4.0, 6.8], q: 4, body: 9, bodyMix: 25, decay: 0.07, group: 1 }),
			// GM 45 LOW TOM
			63: drumPatch({ hard: 48, len: 5, tone: 2800, modes: [1, 1.9, 3.1], q: 9, body: 32, bodyMix: 62, decay: 0.27 }),
			// GM 46 OPEN HI-HAT
			62: drumPatch({ hard: 92, len: 3, tone: 8600, modes: [1, 4.1, 7.0], q: 14, body: 8, bodyMix: 25, decay: 0.42, group: 1 }),
			// GM 47 LOW-MID TOM
			61: drumPatch({ hard: 50, len: 5, tone: 3000, modes: [1, 2.0, 3.2], q: 9, body: 29, bodyMix: 60, decay: 0.25 }),
			// GM 48 HI-MID TOM
			60: drumPatch({ hard: 52, len: 4, tone: 3200, modes: [1, 2.0, 3.2], q: 8, body: 26, bodyMix: 58, decay: 0.22 }),
			// GM 49 CRASH CYMBAL 1
			59: drumPatch({ hard: 88, len: 4, tone: 9500, modes: [1, 3.4, 6.2], q: 30, body: 6, bodyMix: 20, decay: 1.3 }),
			// GM 50 HIGH TOM
			58: drumPatch({ hard: 54, len: 4, tone: 3400, modes: [1, 2.1, 3.3], q: 7, body: 23, bodyMix: 55, decay: 0.2 }),
			// GM 51 RIDE CYMBAL 1
			57: drumPatch({ hard: 94, len: 2, tone: 9800, modes: [1, 3.8, 6.9], q: 16, body: 6, bodyMix: 18, decay: 0.55 }),
			// GM 52 CHINESE CYMBAL
			56: drumPatch({ hard: 86, len: 5, tone: 8200, modes: [1, 2.9, 5.1], q: 26, body: 7, bodyMix: 22, decay: 1.1 }),
			// GM 53 RIDE BELL
			55: drumPatch({ hard: 96, len: 2, tone: 10500, modes: [1, 2.7, 5.4], q: 22, body: 5, bodyMix: 16, decay: 0.75 }),
			// GM 54 TAMBOURINE
			54: drumPatch({ hard: 92, len: 2, tone: 9200, modes: [1, 3.6, 6.1], q: 6, body: 10, bodyMix: 30, decay: 0.16 }),
			// GM 55 SPLASH CYMBAL
			53: drumPatch({ hard: 90, len: 3, tone: 10000, modes: [1, 3.3, 6.0], q: 18, body: 5, bodyMix: 18, decay: 0.6 }),
			// GM 56 COWBELL
			52: drumPatch({ hard: 88, len: 3, tone: 5200, modes: [1, 1.5, 2.7], q: 12, body: 16, bodyMix: 40, decay: 0.3 }),
			// GM 57 CRASH CYMBAL 2
			51: drumPatch({ hard: 86, len: 4, tone: 9200, modes: [1, 3.2, 5.9], q: 28, body: 6, bodyMix: 20, decay: 1.2 }),
			// GM 58 VIBRASLAP
			50: drumPatch({ hard: 70, len: 8, tone: 4600, modes: [1, 2.4, 4.1], q: 10, body: 18, bodyMix: 42, decay: 0.55 }),
			// GM 59 RIDE CYMBAL 2
			49: drumPatch({ hard: 92, len: 2, tone: 9400, modes: [1, 3.7, 6.6], q: 15, body: 6, bodyMix: 18, decay: 0.5 }),
			// GM 60 HI BONGO
			48: drumPatch({ hard: 68, len: 3, tone: 4600, modes: [1, 2.3, 3.8], q: 6, body: 18, bodyMix: 52, decay: 0.14 }),
			// GM 61 LOW BONGO
			47: drumPatch({ hard: 64, len: 4, tone: 3800, modes: [1, 2.2, 3.7], q: 7, body: 22, bodyMix: 55, decay: 0.18 }),
			// GM 62 MUTE HI CONGA
			46: drumPatch({ hard: 72, len: 3, tone: 4400, modes: [1, 2.2, 3.6], q: 4, body: 20, bodyMix: 48, decay: 0.1 }),
			// GM 63 OPEN HI CONGA
			45: drumPatch({ hard: 66, len: 4, tone: 4000, modes: [1, 2.1, 3.5], q: 8, body: 24, bodyMix: 56, decay: 0.22 }),
			// GM 64 LOW CONGA
			44: drumPatch({ hard: 60, len: 5, tone: 3200, modes: [1, 2.0, 3.3], q: 9, body: 28, bodyMix: 58, decay: 0.26 }),
			// GM 65 HIGH TIMBALE
			43: drumPatch({ hard: 82, len: 3, tone: 6000, modes: [1, 2.5, 4.2], q: 8, body: 15, bodyMix: 45, decay: 0.2 }),
			// GM 66 LOW TIMBALE
			42: drumPatch({ hard: 78, len: 4, tone: 5200, modes: [1, 2.4, 4.0], q: 9, body: 19, bodyMix: 48, decay: 0.24 }),
			// GM 67 HIGH AGOGO
			41: drumPatch({ hard: 90, len: 2, tone: 7000, modes: [1, 2.0, 3.4], q: 13, body: 12, bodyMix: 35, decay: 0.28 }),
			// GM 68 LOW AGOGO
			40: drumPatch({ hard: 88, len: 3, tone: 6200, modes: [1, 1.9, 3.3], q: 14, body: 14, bodyMix: 38, decay: 0.32 }),
			// GM 69 CABASA
			39: drumPatch({ hard: 94, len: 2, tone: 9600, modes: [1, 4.4, 7.6], q: 2, body: 7, bodyMix: 22, decay: 0.07 }),
			// GM 70 MARACAS
			38: drumPatch({ hard: 95, len: 2, tone: 10200, modes: [1, 4.6, 7.9], q: 2, body: 6, bodyMix: 20, decay: 0.06 }),
			// GM 71 SHORT WHISTLE
			37: drumPatch({ hard: 60, len: 6, tone: 7200, modes: [1, 2.0, 3.0], q: 10, body: 10, bodyMix: 30, decay: 0.2, group: 4 }),
			// GM 72 LONG WHISTLE
			36: drumPatch({ hard: 58, len: 8, tone: 7000, modes: [1, 2.0, 3.0], q: 14, body: 10, bodyMix: 30, decay: 0.45, group: 4 }),
			// GM 73 SHORT GUIRO
			35: drumPatch({ hard: 86, len: 4, tone: 6600, modes: [1, 3.0, 5.2], q: 3, body: 12, bodyMix: 30, decay: 0.1 }),
			// GM 74 LONG GUIRO
			34: drumPatch({ hard: 84, len: 9, tone: 6400, modes: [1, 3.0, 5.2], q: 4, body: 12, bodyMix: 30, decay: 0.34 }),
			// GM 75 CLAVES
			33: drumPatch({ hard: 98, len: 2, tone: 8000, modes: [1, 2.8, 5.0], q: 8, body: 10, bodyMix: 32, decay: 0.12 }),
			// GM 76 HI WOOD BLOCK
			32: drumPatch({ hard: 96, len: 2, tone: 7400, modes: [1, 2.7, 4.8], q: 7, body: 12, bodyMix: 34, decay: 0.11 }),
			// GM 77 LOW WOOD BLOCK
			31: drumPatch({ hard: 94, len: 3, tone: 6600, modes: [1, 2.6, 4.6], q: 8, body: 15, bodyMix: 36, decay: 0.13 }),
			// GM 78 MUTE CUICA
			30: drumPatch({ hard: 64, len: 4, tone: 4200, modes: [1, 1.8, 2.9], q: 5, body: 20, bodyMix: 45, decay: 0.12, group: 3 }),
			// GM 79 OPEN CUICA
			29: drumPatch({ hard: 60, len: 6, tone: 3800, modes: [1, 1.8, 2.9], q: 11, body: 24, bodyMix: 50, decay: 0.34, group: 3 }),
			// GM 80 MUTE TRIANGLE
			28: drumPatch({ hard: 98, len: 2, tone: 11000, modes: [1, 2.6, 4.9], q: 6, body: 4, bodyMix: 14, decay: 0.09, group: 2 }),
			// GM 81 OPEN TRIANGLE
			27: drumPatch({ hard: 98, len: 2, tone: 11000, modes: [1, 2.6, 4.9], q: 34, body: 4, bodyMix: 14, decay: 1.4, group: 2 }),
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
