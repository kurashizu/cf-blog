/**
 * audit — fire-and-forget audit logging for external API calls and key
 * operations in cache-worker. Writes go to the `audit_log` D1 table.
 *
 * Design rules:
 *   - Audit writes MUST NEVER break the main flow. Every write is wrapped
 *     in try/catch and only `console.error`s on failure.
 *   - Audit writes run AFTER the main operation returns, so they add at
 *     most a few ms of D1 latency. Use `waitUntil` at call sites when
 *     you want the response to ship even faster.
 *   - One row per API call. `batchEmbedContents` with N chunks is ONE
 *     row with `request_count = N`, so daily quota usage can be summed
 *     via `SELECT SUM(request_count) WHERE category='embedding'`.
 */

import type { Env } from "../types";

export type AuditCategory =
    | "embedding"
    | "vectorize"
    | "gemini_generate"
    | "github"
    | "aa"
    | "hn"
    | "refresh";

export type AuditStatus = "ok" | "failed" | "skipped";

export interface AuditEntry {
    category: AuditCategory;
    operation: string;
    target?: string;
    status: AuditStatus;
    httpStatus?: number;
    latencyMs?: number;
    requestCount?: number;
    inputTokens?: number;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
}

/** Truncate long error messages so we don't bloat the table. */
const MAX_ERROR_LEN = 500;
const MAX_META_LEN = 2000;

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * Write a single audit row. Safe to await — on failure, logs and returns.
 * Never throws.
 */
export async function recordAudit(
    env: Env,
    entry: AuditEntry,
): Promise<void> {
    try {
        const meta = entry.metadata ? JSON.stringify(entry.metadata) : "{}";
        await env.DB.prepare(
            `INSERT INTO audit_log (
                category, operation, target, status,
                http_status, latency_ms, request_count, input_tokens,
                error_code, error_message, metadata
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                entry.category,
                entry.operation,
                entry.target ?? "",
                entry.status,
                entry.httpStatus ?? null,
                entry.latencyMs ?? null,
                entry.requestCount ?? null,
                entry.inputTokens ?? null,
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
            `audit write failed (${entry.category}/${entry.operation}):`,
            e instanceof Error ? e.message : String(e),
        );
    }
}

/**
 * Wrap an async operation: time it, capture success/failure, and write
 * a single audit row. Re-throws on failure so the caller can decide how
 * to handle the original error.
 *
 *   const vectors = await withAudit(
 *       env, "vectorize", "upsert", `blog:${slug}`,
 *       async () => env.SEARCH_INDEX.upsert(v),
 *       { requestCount: v.length },
 *   );
 */
export async function withAudit<T>(
    env: Env,
    category: AuditCategory,
    operation: string,
    target: string,
    fn: () => Promise<T>,
    meta?: {
        requestCount?: number;
        inputTokens?: number;
        metadata?: Record<string, unknown>;
    },
): Promise<T> {
    const start = Date.now();
    try {
        const result = await fn();
        await recordAudit(env, {
            category,
            operation,
            target,
            status: "ok",
            latencyMs: Date.now() - start,
            requestCount: meta?.requestCount,
            inputTokens: meta?.inputTokens,
            metadata: meta?.metadata,
        });
        return result;
    } catch (e) {
        await recordAudit(env, {
            category,
            operation,
            target,
            status: "failed",
            latencyMs: Date.now() - start,
            requestCount: meta?.requestCount,
            inputTokens: meta?.inputTokens,
            errorCode: extractErrorCode(e),
            errorMessage: extractErrorMessage(e),
            metadata: meta?.metadata,
        });
        throw e;
    }
}

/** Extract a short error code from various error shapes (Gemini, fetch, etc.)
 *  Gemini API errors wrap their JSON payload in the Error message:
 *    `Gemini Batch Embed 429: { "error": { "code": 429, "status": "RESOURCE_EXHAUSTED", ... } }`
 *  so we also regex out the embedded code / status. */
export function extractErrorCode(e: unknown): string | undefined {
    if (e && typeof e === "object") {
        const err = e as { code?: unknown; status?: unknown };
        if (typeof err.code === "string") return err.code;
        if (typeof err.status === "string") return err.status;
    }
    const msg = e instanceof Error ? e.message : String(e);
    const codeMatch = msg.match(/"code"\s*:\s*(\d+)/);
    if (codeMatch) return codeMatch[1];
    const statusMatch = msg.match(/"status"\s*:\s*"([A-Z_]+)"/);
    if (statusMatch) return statusMatch[1];
    return undefined;
}

/** Extract a short human-readable error message. */
export function extractErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    return String(e);
}

/**
 * Schedule an audit write without blocking the caller. Use when you want
 * the main operation's response to ship as fast as possible and the
 * audit row to be written in the background.
 *
 * In Workers, the recommended pattern is `ctx.waitUntil(recordAudit(...))`.
 * This helper is for cases where we don't have direct access to `ctx`,
 * e.g. deep utility functions — it just kicks off the promise.
 */
export function scheduleAudit(env: Env, entry: AuditEntry): void {
    // Fire and forget. recordAudit itself swallows errors.
    void recordAudit(env, entry);
}