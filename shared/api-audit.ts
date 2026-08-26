/**
 * api-audit — inbound request auditing shared by cf-blog and cf-agent.
 *
 * Counterpart to `lib/audit.ts` / `cache-worker/src/lib/audit.ts`, which
 * record OUTBOUND calls we make to upstream APIs. This module records who
 * called US: IP, geo, ASN, user agent, and — for model-calling routes —
 * the model and tokens their request consumed. Rows go to `api_access_log`.
 *
 * Design rules (same spirit as the outbound audit):
 *   - An audit write MUST NEVER break or delay a response. Every write is
 *     wrapped in try/catch, and call sites hand it to `waitUntil` so it
 *     settles after the response has shipped.
 *   - One row per inbound request.
 *   - `ip` is personal data. Retention (30-day prune by the refresh cron)
 *     is the privacy control — don't add long-lived copies elsewhere.
 *
 * This file is intentionally dependency-free (no `getCloudflareContext`) so
 * every worker can import it. Each worker wraps it in a thin local helper
 * that supplies env/cf/ctx — see `lib/api-audit.ts`.
 */

export type ApiOutcome =
    | "ok"
    | "rate_limited"
    | "unauthorized"
    | "bad_request"
    | "error";

/** Minimal env shape required to write access rows. */
export interface ApiAuditEnv {
    DB?: D1Database;
}

/** Caller identity resolved at the edge — no third-party lookup. */
export interface CallerInfo {
    ip: string;
    country: string;
    city: string;
    asn: number | null;
    asOrg: string;
    userAgent: string;
    referer: string;
    rayId: string;
}

/** Fields a handler can attach while serving the request. */
export interface ApiAuditFields {
    outcome?: ApiOutcome;
    httpStatus?: number;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    requestCount?: number;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
}

export interface ApiAccessEntry extends ApiAuditFields {
    worker: string;
    route: string;
    method: string;
    latencyMs?: number;
    caller: CallerInfo;
}

const MAX_UA_LEN = 300;
const MAX_REFERER_LEN = 300;
const MAX_ERROR_LEN = 500;
const MAX_META_LEN = 2000;
const MAX_AS_ORG_LEN = 120;

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + "…" : s;
}

/** Subset of `request.cf` we read. Undefined in local dev. */
interface CfGeo {
    country?: string;
    city?: string;
    asn?: number;
    asOrganization?: string;
}

/**
 * Resolve the caller from request headers + Cloudflare's edge geo data.
 * Everything here is already attached to the request — no extra I/O.
 */
export function getCallerInfo(request: Request, cf?: unknown): CallerInfo {
    const h = request.headers;
    const geo = (cf ?? {}) as CfGeo;
    return {
        ip:
            h.get("cf-connecting-ip") ??
            h.get("x-real-ip") ??
            h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            "",
        country: geo.country ?? "",
        city: geo.city ?? "",
        asn: typeof geo.asn === "number" ? geo.asn : null,
        asOrg: truncate(geo.asOrganization ?? "", MAX_AS_ORG_LEN),
        userAgent: truncate(h.get("user-agent") ?? "", MAX_UA_LEN),
        referer: truncate(h.get("referer") ?? "", MAX_REFERER_LEN),
        rayId: h.get("cf-ray") ?? "",
    };
}

/** Map an HTTP status to an outcome, when the handler didn't set one. */
export function outcomeFromStatus(status: number): ApiOutcome {
    if (status < 400) return "ok";
    if (status === 401 || status === 403) return "unauthorized";
    if (status === 429) return "rate_limited";
    if (status < 500) return "bad_request";
    return "error";
}

/**
 * Write a single access row. Safe to await — on failure it logs and
 * returns. Never throws.
 */
export async function recordApiAccess(
    env: ApiAuditEnv,
    entry: ApiAccessEntry,
): Promise<void> {
    if (!env.DB) return;
    try {
        const meta = entry.metadata ? JSON.stringify(entry.metadata) : "{}";
        const { caller } = entry;
        await env.DB.prepare(
            `INSERT INTO api_access_log (
                worker, route, method, outcome, http_status, latency_ms,
                ip, country, city, asn, as_org, user_agent, referer, ray_id,
                model, input_tokens, output_tokens, request_count,
                error_code, error_message, metadata
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                entry.worker,
                entry.route,
                entry.method,
                entry.outcome ?? "ok",
                entry.httpStatus ?? null,
                entry.latencyMs ?? null,
                caller.ip || null,
                caller.country || null,
                caller.city || null,
                caller.asn,
                caller.asOrg || null,
                caller.userAgent || null,
                caller.referer || null,
                caller.rayId || null,
                entry.model ?? null,
                entry.inputTokens ?? null,
                entry.outputTokens ?? null,
                entry.requestCount ?? null,
                entry.errorCode ?? null,
                entry.errorMessage
                    ? truncate(entry.errorMessage, MAX_ERROR_LEN)
                    : null,
                truncate(meta, MAX_META_LEN),
            )
            .run();
    } catch (e) {
        // Audit must never break the main flow.
        console.error(
            `api access audit write failed (${entry.route}):`,
            e instanceof Error ? e.message : String(e),
        );
    }
}

/**
 * Mutable handle passed to the wrapped handler so it can attach details
 * discovered while serving (model used, tokens spent, why it rejected).
 */
export class ApiAuditContext {
    private fields: ApiAuditFields = {};
    private deferred = false;
    private flushed = false;
    private flushFn?: (fields: ApiAuditFields) => void;

    constructor(readonly caller: CallerInfo) {}

    /** Merge in fields; `metadata` merges key-wise rather than replacing. */
    set(fields: ApiAuditFields): void {
        const { metadata, ...rest } = fields;
        Object.assign(this.fields, rest);
        if (metadata) {
            this.fields.metadata = { ...this.fields.metadata, ...metadata };
        }
    }

    /** Count an upstream API call made while serving this request. */
    countUpstreamCall(n = 1): void {
        this.fields.requestCount = (this.fields.requestCount ?? 0) + n;
    }

    /**
     * Suppress the automatic write that happens when the handler returns.
     * For streaming routes (SSE): the Response is returned before any real
     * work happens, so the interesting fields — model, tools invoked, tokens
     * — are only known once the stream closes. Defer, then call `complete()`
     * from the stream's terminal path. Latency then covers the whole stream.
     *
     * A deferred row that never completes is never written, so every exit
     * path of the stream (success, error, iteration limit) must call it.
     */
    defer(): void {
        this.deferred = true;
    }

    isDeferred(): boolean {
        return this.deferred;
    }

    /** Write the row now. Idempotent — extra calls are ignored. */
    complete(fields?: ApiAuditFields): void {
        if (this.flushed) return;
        this.flushed = true;
        if (fields) this.set(fields);
        this.flushFn?.(this.fields);
    }

    /** @internal — the runner installs the actual writer. */
    installFlush(fn: (fields: ApiAuditFields) => void): void {
        this.flushFn = fn;
    }

    snapshot(): ApiAuditFields {
        return this.fields;
    }
}

export interface RunApiAuditOptions<T> {
    request: Request;
    route: string;
    worker: string;
    env: ApiAuditEnv;
    cf?: unknown;
    /** Usually `ctx.waitUntil`; falls back to fire-and-forget. */
    waitUntil?: (p: Promise<unknown>) => void;
    handler: (audit: ApiAuditContext) => Promise<T>;
}

/**
 * Run a route handler and record exactly one access row for it.
 *
 * The row is written via `waitUntil`, so it never delays the response.
 * Outcome/status are inferred from the returned Response unless the
 * handler set them explicitly. Errors are recorded and re-thrown so the
 * caller's own error handling is unchanged.
 *
 * Note for streaming routes (SSE): the row is written when the Response
 * object is returned — i.e. when headers ship, not when the stream ends.
 * Latency therefore covers setup only, and token counts are absent unless
 * the handler attached them before returning.
 */
export async function runApiAudit<T extends Response>(
    opts: RunApiAuditOptions<T>,
): Promise<T> {
    const { request, route, worker, env, cf, waitUntil, handler } = opts;
    const caller = getCallerInfo(request, cf);
    const audit = new ApiAuditContext(caller);
    const start = Date.now();

    const flush = (entry: ApiAccessEntry) => {
        const p = recordApiAccess(env, entry);
        if (waitUntil) waitUntil(p);
        else void p;
    };

    const flushFields = (fields: ApiAuditFields, fallbackStatus: number) => {
        const httpStatus = fields.httpStatus ?? fallbackStatus;
        flush({
            worker,
            route,
            method: request.method,
            latencyMs: Date.now() - start,
            caller,
            ...fields,
            httpStatus,
            outcome: fields.outcome ?? outcomeFromStatus(httpStatus),
        });
    };

    // Installed before the handler runs so a deferred route can complete
    // from anywhere — including a stream callback that outlives this call.
    audit.installFlush((fields) => flushFields(fields, 200));

    try {
        const response = await handler(audit);
        if (audit.isDeferred()) {
            // The handler owns the write; it calls audit.complete() when
            // its stream terminates.
            return response;
        }
        audit.complete({
            httpStatus: audit.snapshot().httpStatus ?? response.status,
        });
        return response;
    } catch (e) {
        // complete() is idempotent, so a deferred handler that already
        // wrote its row before throwing won't produce a second one.
        audit.complete({
            httpStatus: audit.snapshot().httpStatus ?? 500,
            outcome: "error",
            errorMessage:
                audit.snapshot().errorMessage ??
                (e instanceof Error ? e.message : String(e)),
        });
        throw e;
    }
}
