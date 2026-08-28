import { writable } from 'svelte/store';

/**
 * Visibility of the three chrome overlays. They live in a store rather than in
 * +layout.svelte's local state because the tab bar, the console and the
 * walkthrough all open each other.
 */
export const consoleOverlayOpen = writable<boolean>(false);
export const hotkeyOverlayOpen = writable<boolean>(false);
export const guideOpen = writable<boolean>(false);

export function toggleConsoleOverlay(): void {
	consoleOverlayOpen.update((v) => !v);
}

export function toggleHotkeyOverlay(): void {
	hotkeyOverlayOpen.update((v) => !v);
}
