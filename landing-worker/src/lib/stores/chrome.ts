import { writable } from 'svelte/store';

/**
 * Visibility of the three chrome overlays. They live in a store rather than in
 * +layout.svelte's local state because the tab bar, the console and the
 * walkthrough all open each other.
 */
export const consoleOverlayOpen = writable<boolean>(false);
export const hotkeyOverlayOpen = writable<boolean>(false);
export const guideOpen = writable<boolean>(false);
/** True while the POST screen covers the page, so nothing else opens under it. */
export const bootOpen = writable<boolean>(false);
/** The gear-icon global settings panel: sound, and clearing any of the site's storage. */
export const globalSettingsOpen = writable<boolean>(false);
/** The full-screen "let's get started" welcome, shown once before the anchored
 *  site tour on a first visit -- see WELCOME_KEY in +layout.svelte. */
export const welcomeOpen = writable<boolean>(false);

export function toggleConsoleOverlay(): void {
	consoleOverlayOpen.update((v) => !v);
}

export function toggleHotkeyOverlay(): void {
	hotkeyOverlayOpen.update((v) => !v);
}

/**
 * Per-view walkthroughs are offered once and then only on request, the same
 * way the site tour is. Each view keeps its own flag, so seeing the site tour
 * does not consume the synth's, and a new view added later starts unseen for
 * everybody rather than being silently skipped by returning visitors.
 *
 * Every access is guarded: in private mode localStorage throws on read as well
 * as write, and a walkthrough is never worth breaking a page over. Failing to
 * read counts as seen, so the tour cannot reappear on every load.
 */
const SEEN_PREFIX = 'krsz.guide.';

export function guideSeen(view: string): boolean {
	try {
		return localStorage.getItem(SEEN_PREFIX + view) === '1';
	} catch {
		return true;
	}
}

/**
 * Resolves once the page is clear of the chrome that owns the screen on a first
 * visit: the POST screen, the welcome screen, then the site tour. A view's own
 * walkthrough waits on this so it cannot open underneath the boot sequence or
 * the welcome screen, or stack on top of the site tour when a first visit
 * lands straight on that view.
 *
 * The boot and welcome screens matter as much as the tour here: both are
 * shown before the site tour is offered, so a bare `guideOpen` check passes
 * during either and the view tour would open behind it.
 */
export function afterSiteGuide(): Promise<void> {
	return new Promise((resolve) => {
		let boot = false;
		let welcome = false;
		let guide = false;
		let stopBoot: (() => void) | undefined;
		let stopWelcome: (() => void) | undefined;
		let stopGuide: (() => void) | undefined;
		let done = false;

		const settle = () => {
			if (done || boot || welcome || guide) return;
			done = true;
			resolve();
			// subscribe() runs its callback synchronously, so on the nothing-showing
			// path the unsubscribers are not assigned yet; releasing them is
			// deferred to let those assignments land.
			queueMicrotask(() => {
				stopBoot?.();
				stopWelcome?.();
				stopGuide?.();
			});
		};

		stopBoot = bootOpen.subscribe((v) => {
			boot = v;
			settle();
		});
		stopWelcome = welcomeOpen.subscribe((v) => {
			welcome = v;
			settle();
		});
		stopGuide = guideOpen.subscribe((v) => {
			guide = v;
			settle();
		});
	});
}

export function markGuideSeen(view: string): void {
	try {
		localStorage.setItem(SEEN_PREFIX + view, '1');
	} catch {
		/* nothing to remember it with; it will offer again next visit */
	}
}
