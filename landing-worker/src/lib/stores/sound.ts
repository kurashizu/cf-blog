import { readable } from 'svelte/store';
import { browser } from '$app/environment';
import { soundEngine, type SoundEngineState } from '../sound';

const INITIAL_STATE: SoundEngineState = { muted: false, volume: 0.5, initialized: false };

/** Mirrors soundEngine's own pub/sub — real values only ever arrive client-side. */
export const soundState = readable<SoundEngineState>(INITIAL_STATE, (set) => {
	if (!browser) return;
	return soundEngine.subscribe(set);
});

export function setMuted(muted: boolean): void {
	soundEngine.setMuted(muted);
}

export function toggleMute(): boolean {
	return soundEngine.toggleMute();
}

export function setVolume(volume: number): void {
	soundEngine.setVolume(volume);
}
