import type { LeaderboardPayload } from '../../stores/leaderboard';

/**
 * Build the volume into `root` and return a disposer.
 *
 * The scene itself is plain JavaScript: it is a self-contained WebGL renderer
 * ported from a standalone page, and annotating three thousand lines of it
 * would add noise without catching anything the browser does not. This
 * declaration types the one edge the rest of the app touches.
 */
export function mountLmSpace(
	root: HTMLElement,
	payload: LeaderboardPayload
): Promise<() => void>;
