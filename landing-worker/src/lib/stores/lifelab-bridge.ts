/**
 * Console-side handle onto LIFE.LAB's control API (main.js's `consoleControl`).
 *
 * main.js is loaded dynamically by the /lifelab page itself (it touches
 * `document`/`localStorage` at import time, which the prerender pass has
 * neither of, and it is heavy enough that every other view would rather not
 * carry it in their own chunk). The console lives outside that page and can
 * be opened from anywhere, so it cannot import main.js statically either --
 * doing so would pull the whole game back into the main bundle for every
 * view. `import()` here resolves to the same cached module instance the page
 * already loaded (or loads it cold, harmlessly, if the game has never
 * mounted this session -- its top-level code has no side effects; only
 * start() touches the DOM), so this is just a way to reach the live
 * `consoleControl` binding without a static import.
 */
export interface LifelabInfo {
	gen: number;
	pop: number;
	w: number;
	h: number;
	running: boolean;
	speed: number;
}

export interface LifelabControl {
	run(): void;
	pause(): void;
	toggle(): void;
	step(n?: number): void;
	clear(): void;
	random(density?: number): void;
	setSpeed(gen: number): boolean;
	speeds(): number[];
	resize(w: number, h: number): { w: number; h: number };
	loadPattern(key: string): boolean;
	patternMeta(key: string): { label: string; note?: string; credit?: string; cat?: string; custom?: boolean } | null;
	info(): LifelabInfo;
}

/** Null while the game has never mounted, or after it has unmounted (stop() clears it). */
export async function getLifelabControl(): Promise<LifelabControl | null> {
	const mod = (await import('../components/lifelab/main.js')) as { consoleControl: LifelabControl | null };
	return mod.consoleControl;
}
