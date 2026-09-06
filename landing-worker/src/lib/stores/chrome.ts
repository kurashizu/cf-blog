import { writable, derived, get, type Readable } from 'svelte/store';

/**
 * Visibility of the chrome overlays. They live in a store rather than in
 * +layout.svelte's local state because the tab bar, the console and the
 * walkthrough all open each other.
 */
export const consoleOverlayOpen = writable<boolean>(false);
export const hotkeyOverlayOpen = writable<boolean>(false);
/** The gear-icon global settings panel: sound, and clearing any of the site's storage. */
export const globalSettingsOpen = writable<boolean>(false);
/** The open-source credits, opened from the footer. In a store because, like
 *  the panels above, it has to render at the layout root: the page body sits in
 *  a `relative z-10` wrapper, and a fixed overlay inside that stacking context
 *  cannot rise above its siblings however high its own z-index goes. */
export const creditsOpen = writable<boolean>(false);
/** The privacy notice -- opened on request from the link on the welcome
 *  screen (or anywhere else), not part of the first-visit gate itself:
 *  the welcome screen's own CTA is what counts as agreeing. */
export const privacyOpen = writable<boolean>(false);

export function toggleConsoleOverlay(): void {
	consoleOverlayOpen.update((v) => !v);
}

/**
 * A first visit stacks up to four full-screen "own the page" moments: the
 * POST/boot screen, the welcome screen, the site-wide tour, and (landing
 * straight on a view like /synth) that view's own tour. Only one may ever be
 * on screen. These used to be four independent booleans, closed and opened
 * across each other by hand (dismissBoot, closeWelcome, ...), and every one
 * of those handoffs was a spot where the outgoing flag could clear before
 * the incoming one was set -- a window, however brief, where all four read
 * false at once. Anything gating on "is nothing else showing" (a view's own
 * tour) could slip through exactly then, landing on top of whatever opened
 * a tick later. Two of those windows shipped as real bugs before this queue
 * replaced the booleans.
 *
 * A queue has no such window: a stage is either in the array or it isn't,
 * membership changes in one atomic array update, and "am I showing" is
 * simply "am I first" -- there is no separate flag to fall out of step with
 * the array. `enqueueOnboarding` only ever appends (a stage already queued,
 * or already showing, is a no-op), so requesting a stage twice is safe, and
 * a stage can be requested long before its turn (a view's onMount fires
 * immediately; it does not need to wait for its turn the way the old
 * afterSiteGuide() promise did -- it just becomes front eventually, or never,
 * if the user navigates away first).
 */
export const onboardingQueue = writable<string[]>([]);

/** Fixed site-level order. A view's own tour (any id not listed here) always
 *  sorts after all of these, regardless of enqueue order -- a view's onMount
 *  fires and enqueues its tour well before boot dismisses or welcome closes,
 *  so plain FIFO would let it cut ahead of whichever of these hadn't been
 *  enqueued yet at that point. Two view tours enqueued before their own turn
 *  keep FIFO order between themselves; there is normally only ever one. */
const SITE_STAGE_ORDER = ['boot', 'welcome', 'site-tour'];

function stagePriority(stage: string): number {
	const i = SITE_STAGE_ORDER.indexOf(stage);
	return i === -1 ? SITE_STAGE_ORDER.length : i;
}

export function enqueueOnboarding(stage: string): void {
	onboardingQueue.update((q) => {
		if (q.includes(stage)) return q;
		const withStage = [...q, stage];
		// Stable sort by priority: equal-priority stages (any two view tours)
		// keep the relative order they were enqueued in.
		return withStage
			.map((s, i) => ({ s, i }))
			.sort((a, b) => stagePriority(a.s) - stagePriority(b.s) || a.i - b.i)
			.map(({ s }) => s);
	});
}

/** Drop a stage from wherever it sits in the queue -- not just the front, so
 *  a stage that was never actually shown (skipped past by a fast dismiss, or
 *  a view unmounting before its turn) can still be retracted cleanly. */
export function dequeueOnboarding(stage: string): void {
	onboardingQueue.update((q) => q.filter((s) => s !== stage));
}

/** True while `stage` is at the front of the queue, i.e. it is its turn. */
export function isOnboardingActive(stage: string): Readable<boolean> {
	return derived(onboardingQueue, (q) => q[0] === stage);
}

export function onboardingActiveNow(stage: string): boolean {
	return get(onboardingQueue)[0] === stage;
}

/** A user explicitly asking for a walkthrough (the [?] button, a console
 *  command) means now, not "whenever its turn in the first-visit queue comes
 *  up" -- jump it to the front instead of appending. */
export function openOnboardingNow(stage: string): void {
	onboardingQueue.update((q) => [stage, ...q.filter((s) => s !== stage)]);
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

export function markGuideSeen(view: string): void {
	try {
		localStorage.setItem(SEEN_PREFIX + view, '1');
	} catch {
		/* nothing to remember it with; it will offer again next visit */
	}
}
