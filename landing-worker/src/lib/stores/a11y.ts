import { writable, derived, get } from 'svelte/store';

/**
 * Accessibility preferences and the live-region announcer.
 *
 * Two manual switches, both in Global Settings, both persisted:
 *
 * - reduceMotion: a site-level override of the OS `prefers-reduced-motion`
 *   query. The OS setting is still honoured everywhere it was before; this
 *   only adds a way to ask for the same thing from inside the site, for a
 *   visitor who cannot or does not want to change it system-wide. Applied as
 *   `:root[data-motion='reduce']` so app.css can match it beside the media
 *   query, and read by perf-transitions so Svelte's inline-style transitions
 *   (which CSS cannot reach) collapse too.
 *
 * - singleKeyHotkeys: whether the bare printable shortcuts (T for theme, ? for
 *   the keymap, ` for the console) are live. WCAG 2.1.4: a single-character
 *   shortcut must be turnable off, because speech-input users and anyone who
 *   types with unintended keystrokes fire them by accident. Ctrl+digit and F1
 *   are unaffected -- they need a modifier or are not printable.
 */
const MOTION_KEY = 'krsz.a11y.reduceMotion';
const HOTKEYS_KEY = 'krsz.a11y.singleKeyHotkeys';

function readFlag(key: string, fallback: boolean): boolean {
	try {
		const v = localStorage.getItem(key);
		if (v === null) return fallback;
		return v === '1';
	} catch {
		return fallback;
	}
}

function writeFlag(key: string, on: boolean): void {
	try {
		localStorage.setItem(key, on ? '1' : '0');
	} catch {
		/* private mode -- the switch still holds for this visit */
	}
}

/** The manual override only; see `motionReduced` for the effective value. */
export const reduceMotion = writable<boolean>(false);
/** What the OS asked for. Tracked live: a visitor can flip it mid-session. */
const osReducedMotion = writable<boolean>(false);
/** True when either the OS or the site setting asks for less motion. */
export const motionReduced = derived([reduceMotion, osReducedMotion], ([manual, os]) => manual || os);

export const singleKeyHotkeys = writable<boolean>(true);

export function initA11y(): void {
	reduceMotion.set(readFlag(MOTION_KEY, false));
	singleKeyHotkeys.set(readFlag(HOTKEYS_KEY, true));
	if (typeof matchMedia === 'function') {
		const mq = matchMedia('(prefers-reduced-motion: reduce)');
		osReducedMotion.set(mq.matches);
		mq.addEventListener('change', (e) => osReducedMotion.set(e.matches));
	}
}

export function setReduceMotion(on: boolean): void {
	reduceMotion.set(on);
	writeFlag(MOTION_KEY, on);
}

export function setSingleKeyHotkeys(on: boolean): void {
	singleKeyHotkeys.set(on);
	writeFlag(HOTKEYS_KEY, on);
}

/** Non-reactive read for code paths that run outside a component (transitions). */
export function isMotionReduced(): boolean {
	return get(motionReduced);
}

/* ---------------------------------------------------------------------- */

export interface Announcement {
	text: string;
	/** `assertive` interrupts whatever the reader is saying; use for errors only. */
	priority: 'polite' | 'assertive';
	/** Changes on every call so the same text twice is still re-read. */
	seq: number;
}

/**
 * One aria-live region for the whole site, rendered by LiveRegion.svelte in
 * the layout. State changes that a sighted visitor sees happen (a view
 * switch, the theme cycling, a test finishing, an error line) are otherwise
 * silent to a screen reader, since nothing there received focus. Call this
 * with the sentence you would want read; keep it short, and never announce
 * something that is also about to receive focus -- it would be read twice.
 */
export const announcement = writable<Announcement | null>(null);
let seq = 0;

export function announce(text: string, priority: 'polite' | 'assertive' = 'polite'): void {
	if (!text) return;
	announcement.set({ text, priority, seq: ++seq });
}
