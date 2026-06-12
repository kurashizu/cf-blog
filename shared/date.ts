/**
 * UTC date helpers shared by cf-blog, agent-worker, and cache-worker.
 *
 * Every worker uses UTC keys for rate-limit counters and quota tracking, so
 * the date boundary must be consistent. Keeping this in one place means
 * "midnight UTC" is defined exactly once.
 */

/** Today's date in UTC as YYYY-MM-DD. Used as a key suffix for daily counters. */
export function getTodayUTC(): string {
    const now = new Date();
    return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    )
        .toISOString()
        .slice(0, 10);
}

/** Milliseconds until the next UTC midnight. */
export function getNextMidnightUTC(): number {
    const now = new Date();
    return new Date(
        Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
        ),
    ).getTime();
}
