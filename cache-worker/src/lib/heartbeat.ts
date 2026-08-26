/**
 * heartbeat — 3-min cron step that turns ONE pending news item into an AI
 * rewrite.
 *
 * Queue: the oldest row with `summary = ''`, skipping items that have used
 * up their rewrite retry budget.
 *
 * That budget is the point of this module. Before it existed, a failure
 * wrote nothing to the database, so the very same item was selected again
 * on the next tick — forever. One story whose URL 404s or whose content
 * trips a safety filter would sit at the head of the queue and silently
 * starve every newer item behind it, with no counter to see it by.
 *
 * `rewrite_retry_count` is deliberately NOT `retry_count`: that column is
 * the search-index budget. Sharing one counter would mean a rewrite that
 * failed five times leaves the item permanently ineligible for indexing
 * even after the rewrite eventually succeeds.
 */
import { generateItemRewrite } from "./sources";
import { withAudit, extractErrorCode } from "./audit";
import type { Env, HNStory } from "../types";

/** Consecutive rewrite failures before an item is parked. */
export const MAX_REWRITE_RETRIES = 5;

const MAX_ERROR_LEN = 300;

/**
 * Quota exhaustion is an external condition that clears when the daily
 * Gemini allowance resets — not a problem with the item. Mirrors the same
 * policy in handlers/search-index.ts so the two pipelines behave alike.
 */
export function isQuotaError(e: unknown): boolean {
    const code = extractErrorCode(e);
    if (code === "429" || code === "RESOURCE_EXHAUSTED" || code === "8") {
        return true;
    }
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    return (
        msg.includes("quota") ||
        msg.includes("exhausted") ||
        msg.includes("429")
    );
}

export async function handleHeartbeat(
    env: Env,
): Promise<{ ok: boolean; detail: string }> {
    if (!env.GEMINI_API_KEY) {
        return { ok: false, detail: "GEMINI_API_KEY not set" };
    }

    const row = await env.DB.prepare(
        `SELECT * FROM news_items
         WHERE summary = ''
           AND rewrite_retry_count < ?
         ORDER BY time ASC
         LIMIT 1`,
    )
        .bind(MAX_REWRITE_RETRIES)
        .first();

    if (!row) {
        return { ok: true, detail: "nothing pending" };
    }

    const story = row as unknown as HNStory & { rewrite_retry_count?: number };
    const retries = story.rewrite_retry_count ?? 0;

    try {
        const rewrite = await withAudit(
            env,
            "gemini_generate",
            "summary_rewrite",
            `news-${story.id}`,
            () => generateItemRewrite(story, env.GEMINI_API_KEY!),
            { metadata: { source: "cache-worker", attempt: retries + 1 } },
        );

        // Success clears the budget so a later re-queue starts fresh, and
        // nulls search_updated_at to hand the item to the indexer.
        await env.DB.prepare(
            `UPDATE news_items
             SET summary = ?,
                 search_updated_at = NULL,
                 rewrite_retry_count = 0,
                 rewrite_failed_at = NULL,
                 rewrite_error = NULL
             WHERE id = ?`,
        )
            .bind(rewrite, story.id)
            .run();

        return {
            ok: true,
            detail: `${story.id}: rewrite generated (${rewrite.length} chars)`,
        };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const quota = isQuotaError(e);

        if (quota) {
            // Record when it happened, but don't spend budget — the item
            // must be retried as soon as quota is available again.
            await env.DB.prepare(
                `UPDATE news_items
                 SET rewrite_failed_at = datetime('now'),
                     rewrite_error = ?
                 WHERE id = ?`,
            )
                .bind(message.slice(0, MAX_ERROR_LEN), story.id)
                .run();

            return {
                ok: false,
                detail: `${story.id}: quota exhausted, not counted - ${message}`,
            };
        }

        const next = retries + 1;
        await env.DB.prepare(
            `UPDATE news_items
             SET rewrite_retry_count = ?,
                 rewrite_failed_at = datetime('now'),
                 rewrite_error = ?
             WHERE id = ?`,
        )
            .bind(next, message.slice(0, MAX_ERROR_LEN), story.id)
            .run();

        const parked = next >= MAX_REWRITE_RETRIES;
        return {
            ok: false,
            detail: parked
                ? `${story.id}: failed ${next}x, parked (requeue from /admin/news to retry) - ${message}`
                : `${story.id}: failed ${next}/${MAX_REWRITE_RETRIES} - ${message}`,
        };
    }
}
