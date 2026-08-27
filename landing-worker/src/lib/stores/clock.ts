import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export const BRAILLE_WAVES = ['⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿', '⣶', '⣦', '⣤', '⣄'];

export const spinnerFrame = writable<number>(0);
export const pulseStep = writable<number>(0);
export const sydneyTime = writable<string>('');

export function brailleSpark(pulse: number, offset: number): string {
	return BRAILLE_WAVES.map((_, i) => BRAILLE_WAVES[(i + pulse + offset) % BRAILLE_WAVES.length]).join('');
}

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

	const animInterval = setInterval(() => {
		spinnerFrame.update((f) => (f + 1) % SPINNER_FRAMES.length);
		pulseStep.update((p) => (p + 1) % 12);
	}, 80);

	return () => {
		clearInterval(clockInterval);
		clearInterval(animInterval);
	};
}
