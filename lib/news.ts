/**
 * news — query/mutation layer for `news_items` (the HN archive).
 *
 * Single source of truth shared by `/admin/api/news*` and the admin news
 * manager, so the filter vocabulary, the row shape and the SQL are defined
 * exactly once (same split as `lib/access-log.ts`).
 *
 * Pipeline this table moves through, and the columns that track it:
 *
 *   1. daily HN cron inserts a row with `summary = ''`
 *   2. 3-min heartbeat picks the OLDEST row with `summary = ''`, asks Gemini
 *      for a rewrite, writes it back and nulls `search_updated_at`
 *   3. 3-min search-index tick picks a row with a summary and a NULL
 *      `search_updated_at`, embeds it, upserts to Vectorize and stamps
 *      `search_updated_at` (resetting `retry_count` / `last_failed_at`)
 *
 * `retry_count` / `last_failed_at` are written ONLY by step 3 (see
 * `cache-worker/src/handlers/search-index.ts`) — they are the search-index
 * retry budget, not a rewrite-failure counter. Step 2 records nothing on
 * failure. It now spends a `rewrite_retry_count` budget and parks the item
 * after MAX_REWRITE_RETRIES, so one permanently-failing story can no longer
 * starve every newer item behind it. Parked items show under the
 * "Rewrite parked" filter and are cleared by a rewrite requeue.
 */

import { getDB } from "./d1";

/**
 * Mirrors `MAX_NEWS_RETRIES` in
 * `cache-worker/src/handlers/search-index.ts` — once `retry_count` reaches
 * it the item is filtered out of the indexing queue for good, and only a
 * manual reset (requeue) brings it back.
 */
export const MAX_NEWS_RETRIES = 5;

/**
 * Mirrors `MAX_REWRITE_RETRIES` in `cache-worker/src/lib/heartbeat.ts`.
 * Once `rewrite_retry_count` reaches it the item is parked: the heartbeat
 * skips it so it can no longer block newer items, and only a manual
 * requeue clears it.
 */
export const MAX_REWRITE_RETRIES = 5;

/** Row shape for the list — `summary` is replaced by length + preview. */
export interface NewsListRow {
    id: number;
    title: string;
    url: string | null;
    score: number;
    by: string;
    time: number;
    descendants: number;
    domain: string | null;
    fetched_at: string;
    search_updated_at: string | null;
    retry_count: number;
    last_failed_at: string | null;
    rewrite_retry_count: number;
    rewrite_failed_at: string | null;
    rewrite_error: string | null;
    summary_length: number;
    summary_preview: string;
}

/** Full row, including the summary body. */
export interface NewsItem extends Omit<NewsListRow, "summary_length" | "summary_preview"> {
    summary: string;
}

export interface NewsStats {
    total: number;
    with_summary: number;
    awaiting_rewrite: number;
    rewrite_stalled: number;
    awaiting_index: number;
    with_retries: number;
    stalled: number;
    indexed: number;
}

export type NewsFilter =
    | "all"
    | "has-summary"
    | "awaiting-rewrite"
    | "failed"
    | "stalled"
    | "rewrite-stalled"
    | "never-indexed";

export const NEWS_FILTER_OPTIONS: { value: NewsFilter; label: string }[] = [
    { value: "all", label: "All items" },
    { value: "has-summary", label: "Has summary" },
    { value: "awaiting-rewrite", label: "Awaiting rewrite" },
    { value: "failed", label: "Failed at least once" },
    { value: "stalled", label: `Stalled (either pipeline)` },
    {
        value: "rewrite-stalled",
        label: `Rewrite parked (${MAX_REWRITE_RETRIES} fails)`,
    },
    { value: "never-indexed", label: "Never indexed" },
];

const VALID_FILTERS = NEWS_FILTER_OPTIONS.map((o) => o.value);

export interface NewsFilters {
    filter: NewsFilter;
    /** Free-form title/domain substring. Always a bound parameter. */
    q: string | null;
    limit: number;
    offset: number;
}

export interface NewsPage {
    rows: NewsListRow[];
    total: number;
    /** Table-wide counters — deliberately NOT narrowed by the filters, so
     *  the tiles stay a fixed picture of the pipeline while you filter. */
    stats: NewsStats;
    filters: NewsFilters;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const PREVIEW_CHARS = 180;

/** Validate/normalise raw query params into filters. Never throws. */
export function parseNewsFilters(sp: URLSearchParams): NewsFilters {
    const filter = sp.get("filter") ?? "";
    const q = sp.get("q")?.trim() || null;

    return {
        filter: (VALID_FILTERS as string[]).includes(filter)
            ? (filter as NewsFilter)
            : "all",
        q: q && q.length <= 200 ? q : null,
        limit: Math.min(
            Math.max(parseInt(sp.get("limit") ?? "", 10) || DEFAULT_LIMIT, 1),
            MAX_LIMIT,
        ),
        offset: Math.max(parseInt(sp.get("offset") ?? "", 10) || 0, 0),
    };
}

/** `%` / `_` are LIKE wildcards — escape them so a literal search works. */
function likePattern(q: string): string {
    return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function buildWhere(f: NewsFilters): {
    sql: string;
    binds: (string | number)[];
} {
    const where: string[] = [];
    const binds: (string | number)[] = [];

    switch (f.filter) {
        case "has-summary":
            where.push("summary != ''");
            break;
        case "awaiting-rewrite":
            where.push("summary = ''");
            break;
        case "failed":
            where.push(
                `(retry_count > 0 OR last_failed_at IS NOT NULL
                  OR rewrite_retry_count > 0 OR rewrite_failed_at IS NOT NULL)`,
            );
            break;
        case "stalled":
            // Parked by either pipeline: the index budget or the rewrite
            // budget. A rewrite-parked item is the one that used to block
            // the whole queue invisibly.
            where.push("(retry_count >= ? OR rewrite_retry_count >= ?)");
            binds.push(MAX_NEWS_RETRIES, MAX_REWRITE_RETRIES);
            break;
        case "rewrite-stalled":
            where.push("summary = '' AND rewrite_retry_count >= ?");
            binds.push(MAX_REWRITE_RETRIES);
            break;
        case "never-indexed":
            where.push("search_updated_at IS NULL");
            break;
        default:
            break;
    }

    if (f.q) {
        where.push(
            "(title LIKE ? ESCAPE '\\' OR COALESCE(domain, '') LIKE ? ESCAPE '\\')",
        );
        const pattern = likePattern(f.q);
        binds.push(pattern, pattern);
    }

    return { sql: where.length ? where.join(" AND ") : "1 = 1", binds };
}

const LIST_COLUMNS = `id, title, url, score, by, time, descendants, domain,
                      fetched_at, search_updated_at, retry_count, last_failed_at,
                      rewrite_retry_count, rewrite_failed_at, rewrite_error,
                      LENGTH(summary) AS summary_length,
                      SUBSTR(summary, 1, ${PREVIEW_CHARS}) AS summary_preview`;

/** One page of news rows plus the table-wide pipeline counters. */
export async function queryNewsPage(f: NewsFilters): Promise<NewsPage> {
    const db = getDB();
    const { sql: whereSql, binds } = buildWhere(f);

    const [rowsRes, totalRes, statsRes] = await Promise.all([
        db
            .prepare(
                `SELECT ${LIST_COLUMNS}
                 FROM news_items
                 WHERE ${whereSql}
                 ORDER BY time DESC
                 LIMIT ? OFFSET ?`,
            )
            .bind(...binds, f.limit, f.offset)
            .all<NewsListRow>(),
        db
            .prepare(`SELECT COUNT(*) AS n FROM news_items WHERE ${whereSql}`)
            .bind(...binds)
            .first<{ n: number }>(),
        db
            .prepare(
                `SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(summary != ''), 0) AS with_summary,
                    COALESCE(SUM(summary = ''
                                 AND rewrite_retry_count < ?), 0) AS awaiting_rewrite,
                    COALESCE(SUM(summary = ''
                                 AND rewrite_retry_count >= ?), 0) AS rewrite_stalled,
                    COALESCE(SUM(summary != ''
                                 AND search_updated_at IS NULL
                                 AND retry_count < ?), 0) AS awaiting_index,
                    COALESCE(SUM(retry_count > 0), 0) AS with_retries,
                    COALESCE(SUM(retry_count >= ?), 0) AS stalled,
                    COALESCE(SUM(search_updated_at IS NOT NULL), 0) AS indexed
                 FROM news_items`,
            )
            .bind(MAX_REWRITE_RETRIES, MAX_REWRITE_RETRIES, MAX_NEWS_RETRIES, MAX_NEWS_RETRIES)
            .first<NewsStats>(),
    ]);

    return {
        rows: rowsRes.results ?? [],
        total: totalRes?.n ?? 0,
        stats: statsRes ?? {
            total: 0,
            with_summary: 0,
            awaiting_rewrite: 0,
            rewrite_stalled: 0,
            awaiting_index: 0,
            with_retries: 0,
            stalled: 0,
            indexed: 0,
        },
        filters: f,
    };
}

/** Full item including the summary body. `null` when the id doesn't exist. */
export async function getNewsItem(id: number): Promise<NewsItem | null> {
    const db = getDB();
    return db
        .prepare(
            `SELECT id, title, url, score, by, time, descendants, domain,
                    summary, fetched_at, search_updated_at, retry_count,
                    last_failed_at
             FROM news_items WHERE id = ?`,
        )
        .bind(id)
        .first<NewsItem>();
}

/**
 * Replace the summary by hand.
 *
 * `search_updated_at` is nulled so the next search-index tick re-embeds the
 * edited text, and the retry budget is reset — otherwise an item that had
 * already spent its 5 retries would never be picked up again.
 */
export async function updateNewsSummary(
    id: number,
    summary: string,
): Promise<NewsItem | null> {
    const db = getDB();
    const res = await db
        .prepare(
            `UPDATE news_items
             SET summary = ?,
                 search_updated_at = NULL,
                 retry_count = 0,
                 last_failed_at = NULL
             WHERE id = ?`,
        )
        .bind(summary, id)
        .run();
    if ((res.meta?.changes ?? 0) === 0) return null;
    return getNewsItem(id);
}

export type RequeueMode = "rewrite" | "index";

/**
 * Put an item back on a cron queue.
 *
 * - `rewrite` clears the summary, so the 3-min heartbeat regenerates it
 *   (DESTRUCTIVE — the current summary is gone).
 * - `index` only clears the indexing state, so the 3-min search-index tick
 *   re-embeds the existing summary. This is also the escape hatch for an
 *   item stalled at `MAX_NEWS_RETRIES`.
 *
 * Both are pure D1 writes: cf-blog cannot invoke the cron worker (see
 * `lib/ops.ts`), it can only make the next scheduled tick pick the item up.
 */
export async function requeueNewsItem(
    id: number,
    mode: RequeueMode,
): Promise<NewsItem | null> {
    const db = getDB();
    const sql =
        mode === "rewrite"
            ? `UPDATE news_items
               SET summary = '',
                   search_updated_at = NULL,
                   retry_count = 0,
                   rewrite_retry_count = 0,
                   rewrite_failed_at = NULL,
                   rewrite_error = NULL,
                   last_failed_at = NULL
               WHERE id = ?`
            : `UPDATE news_items
               SET search_updated_at = NULL,
                   retry_count = 0,
                   last_failed_at = NULL
               WHERE id = ?`;
    const res = await db.prepare(sql).bind(id).run();
    if ((res.meta?.changes ?? 0) === 0) return null;
    return getNewsItem(id);
}

/**
 * Delete an item. Note this removes the D1 row only — any vectors already
 * upserted for it stay in Vectorize until the index is rebuilt, so a deleted
 * item can still surface in semantic search results.
 */
export async function deleteNewsItem(id: number): Promise<boolean> {
    const db = getDB();
    const res = await db
        .prepare("DELETE FROM news_items WHERE id = ?")
        .bind(id)
        .run();
    return (res.meta?.changes ?? 0) > 0;
}

/**
 * Render a `news_items.time` unix-seconds value as explicit UTC, matching
 * `fmtTs` in `components/admin/ui.tsx`. Formatting in the viewer's zone
 * would drift between server and client render.
 */
export function unixToUtc(seconds: number): string {
    if (!Number.isFinite(seconds)) return "—";
    return `${new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 19)}Z`;
}
