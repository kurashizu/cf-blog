/**
 * admin-stats — counts for the admin overview.
 *
 * One round-trip per concern, all guarded: the dashboard must render even
 * when a table is empty or a query fails, so every getter falls back to a
 * zeroed shape rather than throwing.
 */

import { getDB } from "./d1";

export interface AdminStats {
    posts: { total: number; published: number; drafts: number };
    messages: { total: number; pending: number };
    news: { total: number; missingSummary: number };
    traffic24h: {
        requests: number;
        uniqueIps: number;
        rateLimited: number;
        errors: number;
        upstreamCalls: number;
    };
    audit24h: { total: number; failed: number };
    indexing: { postsPending: number; newsPending: number };
}

const EMPTY: AdminStats = {
    posts: { total: 0, published: 0, drafts: 0 },
    messages: { total: 0, pending: 0 },
    news: { total: 0, missingSummary: 0 },
    traffic24h: {
        requests: 0,
        uniqueIps: 0,
        rateLimited: 0,
        errors: 0,
        upstreamCalls: 0,
    },
    audit24h: { total: 0, failed: 0 },
    indexing: { postsPending: 0, newsPending: 0 },
};

/** Run a query, returning `fallback` if the table is missing or the query fails. */
async function safeFirst<T>(
    run: () => Promise<T | null>,
    fallback: T,
): Promise<T> {
    try {
        return (await run()) ?? fallback;
    } catch (e) {
        console.error("admin stats query failed:", e);
        return fallback;
    }
}

export async function getAdminStats(): Promise<AdminStats> {
    const db = getDB();

    const [posts, messages, news, traffic, audit, indexing] = await Promise.all([
        safeFirst(
            () =>
                db
                    .prepare(
                        `SELECT COUNT(*) AS total,
                                COALESCE(SUM(status = 'published'), 0) AS published
                         FROM posts`,
                    )
                    .first<{ total: number; published: number }>(),
            { total: 0, published: 0 },
        ),
        safeFirst(
            () =>
                db
                    .prepare(
                        `SELECT COUNT(*) AS total,
                                COALESCE(SUM(approved = 0), 0) AS pending
                         FROM guestbook_messages`,
                    )
                    .first<{ total: number; pending: number }>(),
            { total: 0, pending: 0 },
        ),
        safeFirst(
            () =>
                db
                    .prepare(
                        `SELECT COUNT(*) AS total,
                                COALESCE(SUM(summary = ''), 0) AS missing
                         FROM news_items`,
                    )
                    .first<{ total: number; missing: number }>(),
            { total: 0, missing: 0 },
        ),
        safeFirst(
            () =>
                db
                    .prepare(
                        `SELECT COUNT(*) AS requests,
                                COUNT(DISTINCT ip) AS unique_ips,
                                COALESCE(SUM(outcome = 'rate_limited'), 0) AS rate_limited,
                                COALESCE(SUM(outcome = 'error'), 0) AS errors,
                                COALESCE(SUM(request_count), 0) AS upstream_calls
                         FROM api_access_log
                         WHERE ts >= datetime('now', '-1 day')`,
                    )
                    .first<{
                        requests: number;
                        unique_ips: number;
                        rate_limited: number;
                        errors: number;
                        upstream_calls: number;
                    }>(),
            {
                requests: 0,
                unique_ips: 0,
                rate_limited: 0,
                errors: 0,
                upstream_calls: 0,
            },
        ),
        safeFirst(
            () =>
                db
                    .prepare(
                        `SELECT COUNT(*) AS total,
                                COALESCE(SUM(status = 'failed'), 0) AS failed
                         FROM audit_log
                         WHERE ts >= datetime('now', '-1 day')`,
                    )
                    .first<{ total: number; failed: number }>(),
            { total: 0, failed: 0 },
        ),
        safeFirst(
            () =>
                db
                    .prepare(
                        `SELECT
                            (SELECT COUNT(*) FROM posts
                              WHERE status = 'published'
                                AND search_updated_at IS NULL) AS posts_pending,
                            (SELECT COUNT(*) FROM news_items
                              WHERE summary != ''
                                AND search_updated_at IS NULL) AS news_pending`,
                    )
                    .first<{ posts_pending: number; news_pending: number }>(),
            { posts_pending: 0, news_pending: 0 },
        ),
    ]);

    return {
        posts: {
            total: posts.total,
            published: posts.published,
            drafts: posts.total - posts.published,
        },
        messages: { total: messages.total, pending: messages.pending },
        news: { total: news.total, missingSummary: news.missing },
        traffic24h: {
            requests: traffic.requests,
            uniqueIps: traffic.unique_ips,
            rateLimited: traffic.rate_limited,
            errors: traffic.errors,
            upstreamCalls: traffic.upstream_calls,
        },
        audit24h: { total: audit.total, failed: audit.failed },
        indexing: {
            postsPending: indexing.posts_pending,
            newsPending: indexing.news_pending,
        },
    };
}

export { EMPTY as EMPTY_ADMIN_STATS };

/**
 * Tags and categories already in use, offered as suggestions in the editor
 * so the vocabulary stays consistent instead of drifting on every typo.
 */
export async function getKnownTaxonomy(): Promise<{
    tags: string[];
    categories: string[];
}> {
    try {
        const db = getDB();
        const [tagRows, catRows] = await Promise.all([
            db.prepare(`SELECT tags FROM posts`).all<{ tags: string }>(),
            db
                .prepare(
                    `SELECT DISTINCT category FROM posts
                     WHERE category IS NOT NULL AND category != ''
                     ORDER BY category`,
                )
                .all<{ category: string }>(),
        ]);

        const tags = new Set<string>();
        for (const row of tagRows.results ?? []) {
            try {
                const parsed: unknown = JSON.parse(row.tags ?? "[]");
                if (Array.isArray(parsed)) {
                    for (const t of parsed) {
                        if (typeof t === "string" && t.trim()) tags.add(t);
                    }
                }
            } catch {
                // A malformed tags column must not break the editor.
            }
        }

        return {
            tags: [...tags].sort((a, b) => a.localeCompare(b)),
            categories: (catRows.results ?? []).map((r) => r.category),
        };
    } catch (e) {
        console.error("taxonomy query failed:", e);
        return { tags: [], categories: [] };
    }
}
