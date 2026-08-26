/**
 * access-log — query layer for `api_access_log` (inbound request audit).
 *
 * Single source of truth shared by the admin page (server component) and
 * `/admin/api/access-log` (client-side filtering/pagination), so the query,
 * the filter validation, and the row shape are defined exactly once.
 */

import { getDB } from "./d1";

export interface AccessLogRow {
    id: number;
    ts: string;
    worker: string;
    route: string;
    method: string;
    outcome: string;
    http_status: number | null;
    latency_ms: number | null;
    ip: string | null;
    country: string | null;
    city: string | null;
    asn: number | null;
    as_org: string | null;
    user_agent: string | null;
    referer: string | null;
    ray_id: string | null;
    model: string | null;
    input_tokens: number | null;
    output_tokens: number | null;
    request_count: number | null;
    error_code: string | null;
    error_message: string | null;
    metadata: string | null;
}

export interface AccessLogSummary {
    requests: number;
    unique_ips: number;
    rate_limited: number;
    errors: number;
    upstream_calls: number;
    total_tokens: number;
}

export interface TopCaller {
    ip: string;
    country: string | null;
    as_org: string | null;
    requests: number;
    upstream_calls: number;
    rate_limited: number;
}

export interface AccessLogFilters {
    days: number;
    worker: string | null;
    route: string | null;
    outcome: string | null;
    ip: string | null;
    /** Only rows that consumed an upstream model/API call. */
    upstreamOnly: boolean;
    limit: number;
    offset: number;
}

export interface AccessLogPage {
    rows: AccessLogRow[];
    total: number;
    summary: AccessLogSummary;
    topCallers: TopCaller[];
    routes: string[];
    filters: AccessLogFilters;
}

export const VALID_OUTCOMES = [
    "ok",
    "rate_limited",
    "unauthorized",
    "bad_request",
    "error",
] as const;

export const VALID_WORKERS = ["cf-blog", "cf-agent"] as const;

const VALID_DAYS = [1, 7, 30, 90];
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const TOP_CALLER_LIMIT = 10;

/** Validate/normalise raw query params into filters. Never throws. */
export function parseAccessLogFilters(
    sp: URLSearchParams,
): AccessLogFilters {
    const daysRaw = parseInt(sp.get("days") ?? "7", 10);
    const outcome = sp.get("outcome");
    const worker = sp.get("worker");
    // `route` and `ip` are free-form user input, but they're only ever used
    // as bound parameters — never interpolated into SQL.
    const route = sp.get("route")?.trim() || null;
    const ip = sp.get("ip")?.trim() || null;

    return {
        days: VALID_DAYS.includes(daysRaw) ? daysRaw : 7,
        worker: (VALID_WORKERS as readonly string[]).includes(worker ?? "")
            ? worker
            : null,
        route: route && route.length <= 200 ? route : null,
        outcome: (VALID_OUTCOMES as readonly string[]).includes(outcome ?? "")
            ? outcome
            : null,
        ip: ip && ip.length <= 64 ? ip : null,
        upstreamOnly: sp.get("upstream") === "1",
        limit: Math.min(
            Math.max(parseInt(sp.get("limit") ?? "", 10) || DEFAULT_LIMIT, 1),
            MAX_LIMIT,
        ),
        offset: Math.max(parseInt(sp.get("offset") ?? "", 10) || 0, 0),
    };
}

function buildWhere(f: AccessLogFilters): {
    sql: string;
    binds: (string | number)[];
} {
    const where = [`ts >= datetime('now', ?)`];
    const binds: (string | number)[] = [`-${f.days} days`];
    if (f.worker) {
        where.push("worker = ?");
        binds.push(f.worker);
    }
    if (f.route) {
        where.push("route = ?");
        binds.push(f.route);
    }
    if (f.outcome) {
        where.push("outcome = ?");
        binds.push(f.outcome);
    }
    if (f.ip) {
        where.push("ip = ?");
        binds.push(f.ip);
    }
    if (f.upstreamOnly) {
        where.push("COALESCE(request_count, 0) > 0");
    }
    return { sql: where.join(" AND "), binds };
}

/**
 * Fetch one page of access rows plus the summary, top callers, and the
 * route list used to populate the filter dropdown.
 *
 * Summary/top-callers respect every filter except pagination, so narrowing
 * to one IP shows that caller's own totals.
 */
export async function queryAccessLog(
    f: AccessLogFilters,
): Promise<AccessLogPage> {
    const db = getDB();
    const { sql: whereSql, binds } = buildWhere(f);

    const [rowsRes, totalRes, summaryRes, topRes, routesRes] =
        await Promise.all([
            db
                .prepare(
                    `SELECT id, ts, worker, route, method, outcome, http_status,
                            latency_ms, ip, country, city, asn, as_org,
                            user_agent, referer, ray_id, model, input_tokens,
                            output_tokens, request_count, error_code,
                            error_message, metadata
                     FROM api_access_log
                     WHERE ${whereSql}
                     ORDER BY id DESC
                     LIMIT ? OFFSET ?`,
                )
                .bind(...binds, f.limit, f.offset)
                .all<AccessLogRow>(),
            db
                .prepare(
                    `SELECT COUNT(*) AS n FROM api_access_log WHERE ${whereSql}`,
                )
                .bind(...binds)
                .first<{ n: number }>(),
            db
                .prepare(
                    `SELECT
                        COUNT(*) AS requests,
                        COUNT(DISTINCT ip) AS unique_ips,
                        COALESCE(SUM(outcome = 'rate_limited'), 0) AS rate_limited,
                        COALESCE(SUM(outcome = 'error'), 0) AS errors,
                        COALESCE(SUM(request_count), 0) AS upstream_calls,
                        COALESCE(SUM(COALESCE(input_tokens, 0) +
                                     COALESCE(output_tokens, 0)), 0) AS total_tokens
                     FROM api_access_log WHERE ${whereSql}`,
                )
                .bind(...binds)
                .first<AccessLogSummary>(),
            db
                .prepare(
                    `SELECT ip,
                            MAX(country) AS country,
                            MAX(as_org) AS as_org,
                            COUNT(*) AS requests,
                            COALESCE(SUM(request_count), 0) AS upstream_calls,
                            COALESCE(SUM(outcome = 'rate_limited'), 0) AS rate_limited
                     FROM api_access_log
                     WHERE ${whereSql} AND ip IS NOT NULL
                     GROUP BY ip
                     ORDER BY requests DESC
                     LIMIT ?`,
                )
                .bind(...binds, TOP_CALLER_LIMIT)
                .all<TopCaller>(),
            db
                .prepare(
                    `SELECT DISTINCT route FROM api_access_log
                     WHERE ts >= datetime('now', ?)
                     ORDER BY route`,
                )
                .bind(`-${f.days} days`)
                .all<{ route: string }>(),
        ]);

    return {
        rows: rowsRes.results ?? [],
        total: totalRes?.n ?? 0,
        summary: summaryRes ?? {
            requests: 0,
            unique_ips: 0,
            rate_limited: 0,
            errors: 0,
            upstream_calls: 0,
            total_tokens: 0,
        },
        topCallers: topRes.results ?? [],
        routes: (routesRes.results ?? []).map((r) => r.route),
        filters: f,
    };
}
