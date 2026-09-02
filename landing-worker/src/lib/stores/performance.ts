import { writable } from 'svelte/store';

/**
 * Performance mode: a manual override, independent of the OS-level
 * prefers-reduced-motion the site already respects everywhere. That setting
 * is about motion sensitivity; this one is about a slow device or battery
 * saving -- someone on both a powerful machine and fine with motion might
 * still want the background video and blur gone to save a GPU compositing
 * layer, and someone who wants less motion doesn't necessarily want the
 * theme video gone too. Kept as its own toggle rather than folded into
 * reduced-motion for that reason.
 */
const KEY = 'krsz.performance.enabled';

function readInitial(): boolean {
	try {
		return localStorage.getItem(KEY) === '1';
	} catch {
		return false;
	}
}

export const performanceMode = writable<boolean>(false);

export function initPerformanceMode(): void {
	performanceMode.set(readInitial());
}

export function setPerformanceMode(on: boolean): void {
	performanceMode.set(on);
	try {
		localStorage.setItem(KEY, on ? '1' : '0');
	} catch {
		/* private mode -- the toggle still works this visit, just doesn't stick */
	}
}
