/**
 * Admin API — audit log viewer.
 *
 * GET /admin/api/audit
 *   ?category=embedding|vectorize|gemini_generate|github|aa|hn|refresh  (optional)
 *   &status=ok|failed|skipped                                          (optional)
 *   &days=1|7|30                                                       (default 7)
 *   &limit=50                                                          (max 500, default 200)
 *   &offset=0                                                          (default 0)
 *
 * Returns:
 *   {
 *     rows: AuditRow[],
 *     total: number,           // total rows matching the filter (ignoring limit/offset)
 *     summary: {
 *       today_embedding_chunks: number,
 *       today_embedding_failed: number,
 *       failed_24h: number,
 *       rows_24h: number,
 *     }
 *   }
 *
 * Audit writes from cache-worker flow into the same `audit_log` table,
 * so this view shows both workers' calls.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const VALID_CATEGORIES = new Set([
    "embedding",
    "vectorize",
    "gemini_generate",
    "github",
    "aa",
    "hn",
    "refresh",
]);
const VALID_STATUSES = new Set(["ok", "failed", "skipped"]);

interface AuditRow {
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
}

export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const category = sp.get("category");
        const status = sp.get("status");
        const daysRaw = parseInt(sp.get("days") ?? "7", 10);
        const days = [1, 7, 30, 90].includes(daysRaw) ? daysRaw : 7;
        const limit = Math.min(
            parseInt(sp.get("limit") ?? "200", 10) || 200,
            500,
        );
        const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);

        const where: string[] = [`ts >= datetime('now', ?)`];
        const binds: (string | number)[] = [`-${days} days`];
        if (category && VALID_CATEGORIES.has(category)) {
            where.push("category = ?");
            binds.push(category);
        }
        if (status && VALID_STATUSES.has(status)) {
            where.push("status = ?");
            binds.push(status);
        }
        const whereSql = where.join(" AND ");

        const { env } = getCloudflareContext();
        const cfEnv = env as unknown as { DB: D1Database };

        const [rowsRes, totalRes, summaryRes] = await Promise.all([
            cfEnv.DB.prepare(
                `SELECT id, ts, category, operation, target, status,
                        http_status, latency_ms, request_count,
                        input_tokens, error_code, error_message
                 FROM audit_log
                 WHERE ${whereSql}
                 ORDER BY id DESC
                 LIMIT ? OFFSET ?`,
            )
                .bind(...binds, limit, offset)
                .all<AuditRow>(),
            cfEnv.DB.prepare(
                `SELECT COUNT(*) AS n FROM audit_log WHERE ${whereSql}`,
            )
                .bind(...binds)
                .first<{ n: number }>(),
            // Summary is always across the same `days` window, ignoring filters
            cfEnv.DB.prepare(
                `SELECT
                    COALESCE(SUM(CASE
                        WHEN category = 'embedding'
                         AND date(ts) = date('now')
                         AND status = 'ok'
                        THEN request_count ELSE 0
                    END), 0) AS today_embed_ok,
                    COALESCE(SUM(CASE
                        WHEN category = 'embedding'
                         AND date(ts) = date('now')
                         AND status = 'failed'
                        THEN request_count ELSE 0
                    END), 0) AS today_embed_failed,
                    COALESCE(SUM(CASE
                        WHEN status = 'failed'
                         AND ts >= datetime('now', '-1 day')
                        THEN 1 ELSE 0
                    END), 0) AS failed_24h,
                    COALESCE(SUM(CASE
                        WHEN ts >= datetime('now', '-1 day')
                        THEN 1 ELSE 0
                    END), 0) AS rows_24h
                 FROM audit_log`,
            ).first<{
                today_embed_ok: number;
                today_embed_failed: number;
                failed_24h: number;
                rows_24h: number;
            }>(),
        ]);

        return NextResponse.json({
            rows: (rowsRes.results ?? []) as AuditRow[],
            total: totalRes?.n ?? 0,
            summary: {
                today_embedding_chunks:
                    (summaryRes?.today_embed_ok ?? 0) +
                    (summaryRes?.today_embed_failed ?? 0),
                today_embedding_failed: summaryRes?.today_embed_failed ?? 0,
                failed_24h: summaryRes?.failed_24h ?? 0,
                rows_24h: summaryRes?.rows_24h ?? 0,
            },
        });
    } catch (e) {
        console.error("Admin audit GET error:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }
}
