import { writable } from 'svelte/store';
import { modularSynth } from '../synth';
import { soundEngine } from '../sound';

export const isSynthSettingsOpen = writable<boolean>(false);
export const synthSettingsTab = writable<'dsp' | 'audio_hw' | 'midi' | 'voice'>('dsp');

// DSP / buffer settings
export const noiseDurationSetting = writable<number>(modularSynth.getNoiseBufferDuration());
export const noiseColorSetting = writable<'white' | 'pink' | 'brown'>(modularSynth.getNoiseColor());
export const reverbDurationSetting = writable<number>(modularSynth.getReverbDuration());
export const reverbDecaySetting = writable<number>(modularSynth.getReverbDecayRate());
export const eqlCompSetting = writable<boolean>(modularSynth.getEqlCompensation());

// Audio hardware / output specs
export const audioSampleRate = writable<number>(soundEngine.getAudioSampleRate());
export const fftSizeSetting = writable<number>(soundEngine.getFftSize());
export const fftSmoothingSetting = writable<number>(soundEngine.getFftSmoothing());
export const latencyHintSetting = writable<'interactive' | 'balanced' | 'playback'>(modularSynth.getLatencyHintMode());
export const masterLimiterSetting = writable<boolean>(modularSynth.isMasterLimiterEnabled());

// Voice engine specs
export const masterTuningSetting = writable<number>(modularSynth.getMasterTuningFreq());
export const maxPolyphonySetting = writable<number>(modularSynth.getMaxPolyphony());
export const voiceStealingSetting = writable<'oldest' | 'quietest' | 'lowest'>(modularSynth.getVoiceStealingMode());

export function setNoiseDuration(sec: number): void {
	modularSynth.setNoiseBufferDuration(sec);
	noiseDurationSetting.set(sec);
}

export function setNoiseColor(color: 'white' | 'pink' | 'brown'): void {
	modularSynth.setNoiseColor(color);
	noiseColorSetting.set(color);
}

export function setReverbDuration(sec: number): void {
	modularSynth.setReverbDuration(sec);
	reverbDurationSetting.set(sec);
}

export function setReverbDecay(decay: number): void {
	modularSynth.setReverbDecayRate(decay);
	reverbDecaySetting.set(decay);
}

export function setEqlComp(enabled: boolean): void {
	modularSynth.setEqlCompensation(enabled);
	eqlCompSetting.set(enabled);
}

export function setFftSize(size: number): void {
	soundEngine.setFftSize(size);
	fftSizeSetting.set(size);
}

export function setFftSmoothing(val: number): void {
	soundEngine.setFftSmoothing(val);
	fftSmoothingSetting.set(val);
}

export function setLatencyHint(mode: 'interactive' | 'balanced' | 'playback'): void {
	modularSynth.setLatencyHintMode(mode);
	latencyHintSetting.set(mode);
}

export function setMasterLimiter(enabled: boolean): void {
	modularSynth.setMasterLimiterEnabled(enabled);
	masterLimiterSetting.set(enabled);
}

export function setMasterTuning(freq: number): void {
	modularSynth.setMasterTuningFreq(freq);
	masterTuningSetting.set(freq);
}

export function setMaxPolyphony(n: number): void {
	modularSynth.setMaxPolyphony(n);
	maxPolyphonySetting.set(n);
}

export function setVoiceStealing(mode: 'oldest' | 'quietest' | 'lowest'): void {
	modularSynth.setVoiceStealingMode(mode);
	voiceStealingSetting.set(mode);
}
