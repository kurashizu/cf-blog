/**
 * ops — read-only health queries plus the few safe D1 maintenance writes
 * that back `/admin/ops`.
 *
 * ── Why this page can't push buttons on the cache worker ──
 *
 * `cf-blog-cache` (cache-worker/) exposes POST `/__refresh`, `/__heartbeat`,
 * `/__search-index` and `/__hn-cron` behind `Authorization: Bearer
 * <CRON_SECRET>`, but from cf-blog's side that door is shut:
 *
 *   - `cache-worker/wrangler.toml` declares `[triggers] crons` and no
 *     `routes` / `route` — it is a cron-only worker with no custom hostname.
 *   - cf-blog's `wrangler.toml` has no `[[services]]` binding to it, so
 *     there is no in-process dispatch either.
 *   - cf-blog's env (see `cloudflare-env.d.ts`) has no `CRON_SECRET`, so
 *     even over a workers.dev hostname every call would come back 401.
 *
 * The only URL that exists anywhere is a workers.dev host hardcoded in
 * AGENTS.md for curl-from-a-laptop use; hardcoding it here would produce a
 * button that always 401s. So the page instead does everything at the D1
 * level — the cron handlers pick their work out of D1, so clearing an
 * item's indexing state IS the requeue — and labels the rest as cron-only.
 */

import { getDB } from "./d1";
import { MAX_NEWS_RETRIES } from "./news";

/* ── Cache freshness ──────────────────────────────────────────────────── */

export interface CacheHealthRow {
    key: string;
    /** `cache_entries` blob, or a dedicated table refreshed by the same cron. */
    source: "cache_entries" | "table";
    fetched_at: string | null;
    age_seconds: number | null;
    /** Serialized size of the blob; null for table-backed entries. */
    bytes: number | null;
    /** Row count; null for blob entries. */
    row_count: number | null;
    /** Age past which the entry is considered stale, given its refresh cron. */
    expected_max_age_seconds: number;
    stale: boolean;
    /** True when the cron has never written this key at all. */
    missing: boolean;
}

const HALF_HOUR_CRON_SLA = 90 * 60; // refreshed every 30 min → 3 missed ticks
const LLM_LEADERBOARD_SLA = 3 * 60 * 60; // upstream guard throttles to 2h

/**
 * Keys the 30-min refresh is expected to write. Listed explicitly so a key
 * the cron has stopped writing shows up as missing instead of silently
 * vanishing from the table listing.
 */
const EXPECTED_CACHE_KEYS: { key: string; sla: number }[] = [
    { key: "llm-leaderboard", sla: LLM_LEADERBOARD_SLA },
    { key: "github-contributions", sla: HALF_HOUR_CRON_SLA },
];

/**
 * Age is computed in SQL: `fetched_at` is written as an ISO string by the
 * refresh cron but as `datetime('now')` elsewhere, and JS `Date.parse` reads
 * the latter as *local* time. SQLite treats both as UTC.
 */
const AGE_SQL = `CAST((julianday('now') - julianday(fetched_at)) * 86400 AS INTEGER)`;

export async function getCacheHealth(): Promise<CacheHealthRow[]> {
    const db = getDB();

    const [entriesRes, reposRes] = await Promise.all([
        db
            .prepare(
                `SELECT key, fetched_at, LENGTH(value) AS bytes,
                        ${AGE_SQL} AS age_seconds
                 FROM cache_entries
                 ORDER BY key`,
            )
            .all<{
                key: string;
                fetched_at: string;
                bytes: number;
                age_seconds: number | null;
            }>(),
        db
            .prepare(
                `SELECT COUNT(*) AS n, MAX(fetched_at) AS fetched_at
                 FROM github_repos`,
            )
            .first<{ n: number; fetched_at: string | null }>(),
    ]);

    const found = new Map(
        (entriesRes.results ?? []).map((r) => [r.key, r] as const),
    );
    const slaFor = (key: string) =>
        EXPECTED_CACHE_KEYS.find((e) => e.key === key)?.sla ??
        HALF_HOUR_CRON_SLA;

    const rows: CacheHealthRow[] = [];

    // Expected keys first (so a missing one keeps its slot), then any extra
    // key the worker writes that this list doesn't know about yet.
    const keys = [
        ...EXPECTED_CACHE_KEYS.map((e) => e.key),
        ...(entriesRes.results ?? [])
            .map((r) => r.key)
            .filter((k) => !EXPECTED_CACHE_KEYS.some((e) => e.key === k)),
    ];

    for (const key of keys) {
        const row = found.get(key);
        const sla = slaFor(key);
        rows.push({
            key,
            source: "cache_entries",
            fetched_at: row?.fetched_at ?? null,
            age_seconds: row?.age_seconds ?? null,
            bytes: row?.bytes ?? null,
            row_count: null,
            expected_max_age_seconds: sla,
            stale: row ? (row.age_seconds ?? 0) > sla : true,
            missing: !row,
        });
    }

    // `github-repos` is part of the same 30-min refresh but lands in its own
    // table rather than in `cache_entries` — surface it alongside, otherwise
    // a third of the refresh has no visibility at all.
    const repoAge = reposRes?.fetched_at
        ? await ageOf(reposRes.fetched_at)
        : null;
    rows.push({
        key: "github-repos",
        source: "table",
        fetched_at: reposRes?.fetched_at ?? null,
        age_seconds: repoAge,
        bytes: null,
        row_count: reposRes?.n ?? 0,
        expected_max_age_seconds: HALF_HOUR_CRON_SLA,
        stale: repoAge == null || repoAge > HALF_HOUR_CRON_SLA,
        missing: !reposRes?.fetched_at,
    });

    return rows;
}

/** Age of a stored timestamp, evaluated by SQLite so UTC parsing matches. */
async function ageOf(ts: string): Promise<number | null> {
    const db = getDB();
    const row = await db
        .prepare(
            `SELECT CAST((julianday('now') - julianday(?)) * 86400 AS INTEGER) AS age`,
        )
        .bind(ts)
        .first<{ age: number | null }>();
    return row?.age ?? null;
}

/* ── Search index backlog ─────────────────────────────────────────────── */

export interface IndexStatus {
    posts_published: number;
    posts_pending: number;
    news_total: number;
    news_awaiting_rewrite: number;
    news_pending_index: number;
    news_indexed: number;
    news_stalled: number;
    news_with_retries: number;
    /** Ceiling on how long the backlog takes to drain at one item / 3 min. */
    backlog_minutes: number;
}

export async function getIndexStatus(): Promise<IndexStatus> {
    const db = getDB();
    const [posts, news] = await Promise.all([
        db
            .prepare(
                `SELECT
                    COALESCE(SUM(status = 'published'), 0) AS posts_published,
                    COALESCE(SUM(status = 'published'
                                 AND search_updated_at IS NULL), 0) AS posts_pending
                 FROM posts`,
            )
            .first<{ posts_published: number; posts_pending: number }>(),
        db
            .prepare(
                `SELECT
                    COUNT(*) AS news_total,
                    COALESCE(SUM(summary = ''), 0) AS news_awaiting_rewrite,
                    COALESCE(SUM(summary != ''
                                 AND search_updated_at IS NULL
                                 AND retry_count < ?), 0) AS news_pending_index,
                    COALESCE(SUM(search_updated_at IS NOT NULL), 0) AS news_indexed,
                    COALESCE(SUM(retry_count >= ?), 0) AS news_stalled,
                    COALESCE(SUM(retry_count > 0), 0) AS news_with_retries
                 FROM news_items`,
            )
            .bind(MAX_NEWS_RETRIES, MAX_NEWS_RETRIES)
            .first<Omit<IndexStatus, "posts_published" | "posts_pending" | "backlog_minutes">>(),
    ]);

    const postsPending = posts?.posts_pending ?? 0;
    const newsPending = news?.news_pending_index ?? 0;
    const rewritePending = news?.news_awaiting_rewrite ?? 0;

    return {
        posts_published: posts?.posts_published ?? 0,
        posts_pending: postsPending,
        news_total: news?.news_total ?? 0,
        news_awaiting_rewrite: rewritePending,
        news_pending_index: newsPending,
        news_indexed: news?.news_indexed ?? 0,
        news_stalled: news?.news_stalled ?? 0,
        news_with_retries: news?.news_with_retries ?? 0,
        // Both the rewrite heartbeat and the index tick do exactly one item
        // per 3-min cron, and they're separate crons, so the slower of the
        // two queues sets the drain time.
        backlog_minutes: Math.max(postsPending + newsPending, rewritePending) * 3,
    };
}

/* ── Queue heads ──────────────────────────────────────────────────────── */

export interface QueueHead {
    /** Which cron would pick this up. */
    queue: "rewrite" | "index";
    kind: "post" | "news";
    id: string;
    title: string;
    /** Age of the item in the queue, human-relevant field per kind. */
    detail: string;
    retry_count: number | null;
    last_failed_at: string | null;
}

/**
 * The exact rows the next heartbeat / index tick will select, using the same
 * ORDER BY as the cron handlers.
 *
 * This is the page's most useful signal: both crons process ONE item per
 * tick, in a deterministic order, and the rewrite heartbeat records nothing
 * on failure — so an item that always fails sits at the head of the queue
 * forever and silently blocks everything behind it. Seeing the same head
 * across refreshes is that symptom.
 */
export async function getQueueHeads(): Promise<QueueHead[]> {
    const db = getDB();
    const heads: QueueHead[] = [];

    const rewrite = await db
        .prepare(
            `SELECT id, title, time, retry_count, last_failed_at
             FROM news_items
             WHERE summary = ''
             ORDER BY time ASC
             LIMIT 1`,
        )
        .first<{
            id: number;
            title: string;
            time: number;
            retry_count: number;
            last_failed_at: string | null;
        }>();
    if (rewrite) {
        heads.push({
            queue: "rewrite",
            kind: "news",
            id: String(rewrite.id),
            title: rewrite.title,
            detail: `posted ${new Date(rewrite.time * 1000).toISOString().slice(0, 10)}`,
            retry_count: rewrite.retry_count,
            last_failed_at: rewrite.last_failed_at,
        });
    }

    // The index tick drains posts fully before it touches news.
    const post = await db
        .prepare(
            `SELECT slug, title, LENGTH(content) AS len
             FROM posts
             WHERE status = 'published' AND search_updated_at IS NULL
             ORDER BY LENGTH(content) ASC, published_at ASC
             LIMIT 1`,
        )
        .first<{ slug: string; title: string; len: number }>();
    if (post) {
        heads.push({
            queue: "index",
            kind: "post",
            id: post.slug,
            title: post.title,
            detail: `${post.len} chars of content`,
            retry_count: null,
            last_failed_at: null,
        });
    } else {
        const news = await db
            .prepare(
                `SELECT id, title, LENGTH(summary) AS len, retry_count, last_failed_at
                 FROM news_items
                 WHERE summary != ''
                   AND search_updated_at IS NULL
                   AND retry_count < ?
                 ORDER BY LENGTH(summary) ASC, time ASC
                 LIMIT 1`,
            )
            .bind(MAX_NEWS_RETRIES)
            .first<{
                id: number;
                title: string;
                len: number;
                retry_count: number;
                last_failed_at: string | null;
            }>();
        if (news) {
            heads.push({
                queue: "index",
                kind: "news",
                id: String(news.id),
                title: news.title,
                detail: `${news.len} chars of summary`,
                retry_count: news.retry_count,
                last_failed_at: news.last_failed_at,
            });
        }
    }

    return heads;
}

/* ── Cron liveness (from the outbound audit trail) ────────────────────── */

export interface CronActivityRow {
    category: string;
    operation: string;
    last_ts: string | null;
    last_status: string | null;
    runs_24h: number;
    failed_24h: number;
}

/**
 * cf-blog can't ask the cache worker whether it is alive, but the worker
 * writes an `audit_log` row for every upstream call it makes — so the last
 * timestamp per operation is a reliable "did the cron run" proxy.
 */
export async function getCronActivity(): Promise<CronActivityRow[]> {
    const db = getDB();
    // `status` is a bare column next to a single MAX() aggregate, which in
    // SQLite is defined to come from the same row as the maximum — so this
    // is the status of the LAST run, not an arbitrary one. A stale OK and a
    // stale failure call for very different reactions.
    const res = await db
        .prepare(
            `SELECT category, operation,
                    MAX(ts) AS last_ts,
                    status AS last_status,
                    COALESCE(SUM(ts >= datetime('now', '-24 hours')), 0) AS runs_24h,
                    COALESCE(SUM(status = 'failed'
                                 AND ts >= datetime('now', '-24 hours')), 0) AS failed_24h
             FROM audit_log
             GROUP BY category, operation
             ORDER BY last_ts DESC`,
        )
        .all<CronActivityRow>();

    return res.results ?? [];
}

/* ── Static description of what only cron can do ──────────────────────── */

export interface CronJob {
    schedule: string;
    endpoint: string;
    what: string;
}

/**
 * Documented so the page can say precisely what it is NOT able to trigger,
 * instead of offering a button that would 401. Mirrors `[triggers] crons` in
 * `cache-worker/wrangler.toml` and the route table in
 * `cache-worker/src/handlers/fetch.ts`.
 */
export const CRON_JOBS: CronJob[] = [
    {
        schedule: "*/30 * * * *",
        endpoint: "POST /__refresh",
        what: "GitHub repos, LLM leaderboard, contributions; prunes both audit logs to 30 days.",
    },
    {
        schedule: "*/3 * * * *",
        endpoint: "POST /__heartbeat",
        what: "Rewrites the summary of ONE news item with an empty summary (oldest first).",
    },
    {
        schedule: "*/3 * * * *",
        endpoint: "POST /__search-index",
        what: "Embeds and upserts ONE dirty post, else ONE dirty news item.",
    },
    {
        schedule: "0 18 * * *",
        endpoint: "POST /__hn-cron",
        what: "Upserts the HN top 30 into news_items.",
    },
];

export const CACHE_WORKER_REACHABLE = false;

export const CACHE_WORKER_REASON =
    "cf-blog-cache is a cron-only worker: no route in its wrangler.toml, no service binding from cf-blog, and CRON_SECRET is not bound to this worker — so its /__refresh, /__heartbeat, /__search-index and /__hn-cron endpoints can only be called from outside (curl with the secret) or by its own cron triggers.";

/* ── Maintenance writes ───────────────────────────────────────────────── */

export type OpsAction = "reset-stalled-news" | "reset-news-retries";

export const OPS_ACTIONS: {
    action: OpsAction;
    label: string;
    description: string;
}[] = [
    {
        action: "reset-stalled-news",
        label: "Unstall exhausted items",
        description: `Clears retry_count on news items that hit the ${MAX_NEWS_RETRIES}-retry ceiling, putting them back in the search-index queue on the next 3-min tick.`,
    },
    {
        action: "reset-news-retries",
        label: "Clear all retry counters",
        description:
            "Clears retry_count and last_failed_at on every news item that has failed at least once. Use after a quota outage, when the failures were external.",
    },
];

export function isOpsAction(value: unknown): value is OpsAction {
    return OPS_ACTIONS.some((a) => a.action === value);
}

/** Runs one maintenance action; returns how many rows it touched. */
export async function runOpsAction(action: OpsAction): Promise<number> {
    const db = getDB();
    const sql =
        action === "reset-stalled-news"
            ? `UPDATE news_items
               SET retry_count = 0, last_failed_at = NULL
               WHERE retry_count >= ?`
            : `UPDATE news_items
               SET retry_count = 0, last_failed_at = NULL
               WHERE retry_count > 0`;
    const stmt =
        action === "reset-stalled-news"
            ? db.prepare(sql).bind(MAX_NEWS_RETRIES)
            : db.prepare(sql);
    const res = await stmt.run();
    return res.meta?.changes ?? 0;
}

/* ── Snapshot ─────────────────────────────────────────────────────────── */

export interface OpsSnapshot {
    cache: CacheHealthRow[];
    index: IndexStatus;
    queues: QueueHead[];
    activity: CronActivityRow[];
    cacheWorker: {
        reachable: boolean;
        reason: string;
        jobs: CronJob[];
    };
    generated_at: string;
}

export async function getOpsSnapshot(): Promise<OpsSnapshot> {
    const [cache, index, queues, activity] = await Promise.all([
        getCacheHealth(),
        getIndexStatus(),
        getQueueHeads(),
        getCronActivity(),
    ]);

    return {
        cache,
        index,
        queues,
        activity,
        cacheWorker: {
            reachable: CACHE_WORKER_REACHABLE,
            reason: CACHE_WORKER_REASON,
            jobs: CRON_JOBS,
        },
        generated_at: new Date().toISOString(),
    };
}

/** Compact "3h 12m ago" style age, for a column that must stay narrow. */
export function fmtAge(seconds: number | null): string {
    if (seconds == null) return "—";
    if (seconds < 0) return "just now";
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Byte size for the cache table — values are small JSON blobs. */
export function fmtBytes(bytes: number | null): string {
    if (bytes == null) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
