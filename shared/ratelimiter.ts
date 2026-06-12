/**
 * Rate limiting utilities shared by cf-blog and agent-worker.
 *
 * Two layers: CF Rate Limiter (burst, fast) + KV (daily, persistent).
 *
 * Usage in a route handler:
 *   const burstResp = await checkBurst(env.LLM_RATE_LIMIT, ip, 2, 10);
 *   if (burstResp) return burstResp;
 *   const dailyResp = await checkDailyKV(env.SESSION_KV, "llm", ip, 200);
 *   if (dailyResp) return dailyResp;
 *
 * Error response shape:
 *   { error: string, type: "burst" | "daily", limit, period?, retryAfter?, resetAt? }
 */
import { getNextMidnightUTC, getTodayUTC } from "./date";

export interface RateLimitError {
    error: string;
    type: "burst" | "daily";
    limit: number;
    period?: number;
    retryAfter?: number;
    resetAt?: string;
}

/** Hash IP to a compact string for KV key privacy. */
export function hashIP(ip: string): string {
    let h = 0;
    for (let i = 0; i < ip.length; i++) {
        h = (Math.imul(31, h) + ip.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
}

/**
 * CF Rate Limiter burst check — fast path, no network call.
 * Returns a 429 Response if exceeded, null if OK.
 */
export async function checkBurst(
    binding: RateLimit | undefined,
    key: string,
    limit: number,
    period: number,
): Promise<Response | null> {
    if (!binding) return null;

    const { success } = await binding.limit({ key });
    if (!success) {
        return Response.json(
            {
                error: "Rate limit exceeded",
                type: "burst",
                limit,
                period,
                retryAfter: period,
            },
            { status: 429 },
        );
    }
    return null;
}

/**
 * KV-based daily rate limit check.
 * Key format: `ratelimit:daily:{endpoint}:{ipHash}:{YYYY-MM-DD}`
 * TTL: 86400s (24h) — auto-expires after midnight.
 */
export async function checkDailyKV(
    kv: KVNamespace | undefined,
    endpoint: string,
    ip: string,
    dailyLimit: number,
): Promise<Response | null> {
    if (!kv) return null;

    const key = `ratelimit:daily:${endpoint}:${hashIP(ip)}:${getTodayUTC()}`;

    const raw = await kv.get(key);
    const count = Number(raw ?? 0);

    if (count >= dailyLimit) {
        return Response.json(
            {
                error: "Rate limit exceeded",
                type: "daily",
                limit: dailyLimit,
                resetAt: new Date(getNextMidnightUTC()).toISOString(),
            },
            { status: 429 },
        );
    }

    await kv.put(key, String(count + 1), { expirationTtl: 86400 });
    return null;
}

/** Best-effort client IP. Falls back to "unknown" if Cloudflare didn't set the header. */
export function getIP(request: Request): string {
    return request.headers.get("CF-Connecting-IP") || "unknown";
}
