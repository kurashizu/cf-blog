/**
 * audit-log — query layer for `audit_log` (outbound API call audit).
 *
 * Companion to `lib/access-log.ts`. Same rule: the row shape, the filter
 * vocabulary and the SQL live here once, so the admin page and
 * `/admin/api/audit` can't drift apart (they previously declared the row
 * type and the category list separately, and a mismatch failed silently).
 */

import { getDB } from "./d1";

export interface AuditRow {
    id: number;
    ts: string;
    category: string;
    operation: string;
    target: string;
    status: string;
    http_status: number | null;
    latency_ms: number | null;
    request_count: number | null;
    input_tokens: number | null;
    error_code: string | null;
    error_message: string | null;
    metadata: string | null;
}

export interface AuditSummary {
    rows: number;
    failed: number;
    embedding_chunks: number;
    upstream_calls: number;
}

export interface AuditFilters {
    days: number;
    category: string | null;
    status: string | null;
    limit: number;
    offset: number;
}

export interface AuditPage {
    rows: AuditRow[];
    total: number;
    summary: AuditSummary;
    /** Categories actually present in the window — drives the dropdown. */
    categories: string[];
    filters: AuditFilters;
}

/**
 * Every category any worker writes. cf-blog writes embedding/
 * gemini_generate/other; cache-worker adds vectorize/github/aa/hn/refresh.
 * The dropdown is built from what's actually in the window, but this list
 * remains the validation allowlist.
 */
export const AUDIT_CATEGORIES = [
    "embedding",
    "vectorize",
    "gemini_generate",
    "github",
    "aa",
    "hn",
    "refresh",
    "other",
] as const;

export const AUDIT_STATUSES = ["ok", "failed", "skipped"] as const;

const VALID_DAYS = [1, 7, 30, 90];
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export function parseAuditFilters(sp: URLSearchParams): AuditFilters {
    const daysRaw = parseInt(sp.get("days") ?? "7", 10);
    const category = sp.get("category");
    const status = sp.get("status");
    return {
        days: VALID_DAYS.includes(daysRaw) ? daysRaw : 7,
        category: (AUDIT_CATEGORIES as readonly string[]).includes(
            category ?? "",
        )
            ? category
            : null,
        status: (AUDIT_STATUSES as readonly string[]).includes(status ?? "")
            ? status
            : null,
        limit: Math.min(
            Math.max(parseInt(sp.get("limit") ?? "", 10) || DEFAULT_LIMIT, 1),
            MAX_LIMIT,
        ),
        offset: Math.max(parseInt(sp.get("offset") ?? "", 10) || 0, 0),
    };
}

function buildWhere(f: AuditFilters): {
    sql: string;
    binds: (string | number)[];
} {
    const where = [`ts >= datetime('now', ?)`];
    const binds: (string | number)[] = [`-${f.days} days`];
    if (f.category) {
        where.push("category = ?");
        binds.push(f.category);
    }
    if (f.status) {
        where.push("status = ?");
        binds.push(f.status);
    }
    return { sql: where.join(" AND "), binds };
}

export async function queryAuditLog(f: AuditFilters): Promise<AuditPage> {
    const db = getDB();
    const { sql: whereSql, binds } = buildWhere(f);

    const [rowsRes, totalRes, summaryRes, catsRes] = await Promise.all([
        db
            .prepare(
                `SELECT id, ts, category, operation, target, status,
                        http_status, latency_ms, request_count, input_tokens,
                        error_code, error_message, metadata
                 FROM audit_log
                 WHERE ${whereSql}
                 ORDER BY id DESC
                 LIMIT ? OFFSET ?`,
            )
            .bind(...binds, f.limit, f.offset)
            .all<AuditRow>(),
        db
            .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE ${whereSql}`)
            .bind(...binds)
            .first<{ n: number }>(),
        // Scoped to the same filters — the old summary scanned the whole
        // table while claiming to respect the window.
        db
            .prepare(
                `SELECT
                    COUNT(*) AS rows,
                    COALESCE(SUM(status = 'failed'), 0) AS failed,
                    COALESCE(SUM(CASE WHEN category = 'embedding'
                                      THEN COALESCE(request_count, 0)
                                      ELSE 0 END), 0) AS embedding_chunks,
                    COALESCE(SUM(request_count), 0) AS upstream_calls
                 FROM audit_log WHERE ${whereSql}`,
            )
            .bind(...binds)
            .first<AuditSummary>(),
        db
            .prepare(
                `SELECT DISTINCT category FROM audit_log
                 WHERE ts >= datetime('now', ?)
                 ORDER BY category`,
            )
            .bind(`-${f.days} days`)
            .all<{ category: string }>(),
    ]);

    return {
        rows: rowsRes.results ?? [],
        total: totalRes?.n ?? 0,
        summary: summaryRes ?? {
            rows: 0,
            failed: 0,
            embedding_chunks: 0,
            upstream_calls: 0,
        },
        categories: (catsRes.results ?? []).map((r) => r.category),
        filters: f,
    };
}
