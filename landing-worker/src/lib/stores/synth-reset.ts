import type { TrackData } from '../synth';
import { playSound } from '../sound';
import { updateActiveTrack } from './synth-tracks';
import { setDelayTime, setDelayFeedback, setDelayMix, setReverbMix, setDrive } from './synth-fx';

/* "Neutral" for each rack: the values at which it does nothing to the sound.
   One oscillator, straight through; no blend, no glide; the filter wide open
   with no resonance and nothing sweeping it; envelopes that are instantly on
   and instantly off; every LFO depth at zero; dry, clean, flat; centred at
   unity. These are not the factory defaults of any song -- a track loaded
   from a built-in keeps its own sound until you ask for this. The same
   numbers are what right-clicking a single control snaps to, so RESET on a
   rack and right-click on each of its knobs agree. */

export const RACK1_NEUTRAL: Partial<TrackData> = {
	osc1Waveform: 'square',
	osc1Gain: 1,
	osc2Waveform: 'square',
	osc2Gain: 0,
	detuneCents: 0,
	osc2Semitone: 0,
	pulseWidth: 50,
	waveParams: {},
	phaseOffset: 0,
	subOscGain: 0,
	noiseGain: 0,
	noiseRetrig: 1,
	noiseRetrigGap: 12
};

export const RACK2_NEUTRAL: Partial<TrackData> = {
	blendMode: 'layer',
	morphAmount: 0,
	osc2Ratio: 1,
	xfade: 0.5,
	glideTime: 0
};

export const RACK3_NEUTRAL: Partial<TrackData> = {
	filterType: 'lowpass',
	cutoff: 12000,
	resonance: 0.2,
	keyTracking: 0,
	filterEnvAmount: 0,
	envFilterMod: 0
};

// The release floors are one fader step above zero rather than zero: a hard
// cut at note-off clicks, which is an effect of its own.
export const RACK4_NEUTRAL: Partial<TrackData> = {
	ampAttack: 0,
	attack: 0,
	ampDecay: 0.01,
	decay: 0.01,
	ampSustain: 1,
	sustain: 1,
	ampRelease: 0.02,
	release: 0.02,
	filterAttack: 0,
	filterDecay: 0.01,
	filterSustain: 0,
	filterRelease: 0,
	pitchAttack: 0.001,
	pitchDecay: 0.01,
	pitchEnvAmount: 0
};

export const RACK5_NEUTRAL: Partial<TrackData> = {
	lfoWaveform: 'sine',
	lfoRate: 5,
	lfoPitchAmt: 0,
	lfoCutoffAmt: 0,
	lfoAmpAmt: 0,
	lfoPanAmt: 0,
	lfoFadeTime: 0
};

export const RACK6_EQ_NEUTRAL: Partial<TrackData> = {
	eqOn: false,
	eqGains: [0, 0, 0, 0, 0, 0]
};

export const RACK7_NEUTRAL: Partial<TrackData> = {
	pan: 0,
	airGain: 0,
	volume: 1
};

/** The DUCK tab of rack 6: sidechain off, timing at its defaults. */
export const RACK6_DUCK_NEUTRAL: Partial<TrackData> = {
	duckSource: -1,
	duckKeys: [],
	duckDepth: 0,
	duckDip: 5,
	duckHold: 40,
	duckRelease: 150
};

/** Global FX defaults, in the stores' own units (seconds / 0-1). */
export const FX_NEUTRAL = { delayTime: 0.3, delayFeedback: 0, delayMix: 0, reverbMix: 0, drive: 0 };

function resetTrackRack(partial: Partial<TrackData>): void {
	updateActiveTrack(partial);
	playSound('toggle');
}

export const resetRack1 = () => resetTrackRack(RACK1_NEUTRAL);
export const resetRack2 = () => resetTrackRack(RACK2_NEUTRAL);
export const resetRack3 = () => resetTrackRack(RACK3_NEUTRAL);
export const resetRack4 = () => resetTrackRack(RACK4_NEUTRAL);
export const resetRack5 = () => resetTrackRack(RACK5_NEUTRAL);
export const resetRack7 = () => resetTrackRack(RACK7_NEUTRAL);

/** All three tabs at once: the global delay/reverb/drive, the active track's EQ and its DUCK. MASTER is a level, not an effect, and stays. */
export function resetRack6(): void {
	setDelayTime(FX_NEUTRAL.delayTime);
	setDelayFeedback(FX_NEUTRAL.delayFeedback);
	setDelayMix(FX_NEUTRAL.delayMix);
	setReverbMix(FX_NEUTRAL.reverbMix);
	setDrive(FX_NEUTRAL.drive);
	updateActiveTrack({ ...RACK6_EQ_NEUTRAL, ...RACK6_DUCK_NEUTRAL });
	playSound('toggle');
}
