import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { performanceMode } from './performance';

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const spinnerFrame = writable<number>(0);
export const pulseStep = writable<number>(0);
export const sydneyTime = writable<string>('');

/** Drives the header clock + spinner/pulse ticks — call once, client-side, from the root layout's onMount. */
export function initClock(): () => void {
	if (!browser) return () => {};

	const updateTime = () => {
		sydneyTime.set(
			new Intl.DateTimeFormat('en-US', {
				timeZone: 'Australia/Sydney',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			}).format(new Date())
		);
	};
	updateTime();
	const clockInterval = setInterval(updateTime, 1000);

	// The wall clock above is informational (TabBar shows the real time) and
	// stays live regardless. This one is purely decorative -- a braille
	// spinner/pulse that exists to look alive, nothing reads it for meaning
	// -- so under performance mode it just stops advancing rather than
	// ticking 12.5x/second forever on every page for no functional reason.
	const animInterval = setInterval(() => {
		if (get(performanceMode)) return;
		spinnerFrame.update((f) => (f + 1) % SPINNER_FRAMES.length);
		pulseStep.update((p) => (p + 1) % 12);
	}, 80);

	return () => {
		clearInterval(clockInterval);
		clearInterval(animInterval);
	};
}
