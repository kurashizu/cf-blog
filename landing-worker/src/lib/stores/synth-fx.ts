import { writable } from 'svelte/store';
import { modularSynth } from '../synth';

export const delayMix = writable<number>(modularSynth.getDelayMix());
export const delayTime = writable<number>(modularSynth.getDelayTime());
export const delayFeedback = writable<number>(modularSynth.getDelayFeedback());
export const reverbMix = writable<number>(modularSynth.getReverbMix());
export const drive = writable<number>(modularSynth.getDrive());
export const activeFxTab = writable<'fx' | 'eq'>('fx');
export const isEqEnabled = writable<boolean>(modularSynth.isEqEnabled());
export const eqGains = writable<number[]>(modularSynth.getEqGains());

export function setDelayMix(v: number): void {
	modularSynth.setDelayMix(v);
	delayMix.set(v);
}

export function setDelayTime(v: number): void {
	modularSynth.setDelayTime(v);
	delayTime.set(v);
}

export function setDelayFeedback(v: number): void {
	modularSynth.setDelayFeedback(v);
	delayFeedback.set(v);
}

export function setReverbMix(v: number): void {
	modularSynth.setReverbMix(v);
	reverbMix.set(v);
}

export function setDrive(v: number): void {
	modularSynth.setDrive(v);
	drive.set(v);
}

export function setEqEnabled(enabled: boolean): void {
	modularSynth.setEqEnabled(enabled);
	isEqEnabled.set(enabled);
}

export function setEqBandGain(bandIdx: number, gainDb: number): void {
	modularSynth.setEqBandGain(bandIdx, gainDb);
	eqGains.set(modularSynth.getEqGains());
}
