/**
 * audit — fire-and-forget audit logging for external API calls in cf-blog.
 *
 * Mirrors `cache-worker/src/lib/audit.ts` and writes to the same
 * `audit_log` D1 table so both workers' calls show up in one place.
 *
 * Design rules (same as cache-worker):
 *   - Audit writes MUST NEVER break the main flow. Every write is wrapped
 *     in try/catch and only `console.error`s on failure.
 *   - One row per API call. request_count = number of items in the batch.
 */

export type AuditCategory = "embedding" | "gemini_generate" | "other";

export type AuditStatus = "ok" | "failed" | "skipped";

export interface AuditEntry {
    category: AuditCategory;
    operation: string;
    target?: string;
    status: AuditStatus;
    latencyMs?: number;
    requestCount?: number;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
}

/** Truncate long error messages / metadata so we don't bloat the table. */
const MAX_ERROR_LEN = 500;
const MAX_META_LEN = 2000;
const MAX_TARGET_LEN = 200;

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + "…" : s;
}

/** Minimal env shape required to write audit rows. */
interface AuditEnv {
    DB: D1Database;
}

/**
 * Write a single audit row. Safe to await — on failure, logs and returns.
 * Never throws.
 */
export async function recordAudit(
    env: AuditEnv,
    entry: AuditEntry,
): Promise<void> {
    try {
        const meta = entry.metadata ? JSON.stringify(entry.metadata) : "{}";
        await env.DB.prepare(
            `INSERT INTO audit_log (
                category, operation, target, status,
                latency_ms, request_count,
                error_code, error_message, metadata
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                entry.category,
                entry.operation,
                entry.target ? truncate(entry.target, MAX_TARGET_LEN) : "",
                entry.status,
                entry.latencyMs ?? null,
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
            `audit write failed (${entry.category}/${entry.operation}):`,
            e instanceof Error ? e.message : String(e),
        );
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