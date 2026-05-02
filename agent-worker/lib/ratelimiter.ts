/**
 * Rate limiting utilities for Cloudflare Workers
 * Two-layer: CF Rate Limiter (burst) + KV-based daily counter (date-keyed)
 *
 * Usage:
 * - checkBurst(): CF Rate Limiter burst check (10s window)
 * - checkDailyKV(): KV-based daily counter per IP (date-keyed, auto-expiry)
 *
 * Error response shape:
 * { error: string, type: "burst"|"daily", limit: number, period?: number, retryAfter?: number, resetAt?: string }
 */

export interface RateLimitError {
  error: string;
  type: "burst" | "daily";
  limit: number;
  period?: number;
  retryAfter?: number;
  resetAt?: string;
}

/** Hash IP to a compact string for KV key privacy */
export function hashIP(ip: string): string {
  let h = 0;
  for (let i = 0; i < ip.length; i++) {
    h = (Math.imul(31, h) + ip.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export function getNextMidnightUTC(): number {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).getTime();
}

function getTodayUTC(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
}

function kvDailyLimitKey(endpoint: string, ip: string): string {
  return `ratelimit:${endpoint}:${hashIP(ip)}:${getTodayUTC()}`;
}

/**
 * CF Rate Limiter burst check — fast path, no network call.
 * Returns 429 Response if exceeded, null if OK.
 */
export async function checkBurst(
  binding: RateLimit | undefined,
  key: string,
  limit: number,
  period: number
): Promise<Response | null> {
  if (!binding) return null;

  const { success } = await binding.limit({ key });
  if (!success) {
    return Response.json(
      { error: "Rate limit exceeded", type: "burst", limit, period, retryAfter: period },
      { status: 429 }
    );
  }
  return null;
}

/**
 * KV-based daily rate limit check.
 * Key format: ratelimit:{endpoint}:{ipHash}:{YYYY-MM-DD}
 * TTL: 86400s (24h) — auto-expires after midnight.
 * Returns 429 Response if exceeded, null if OK.
 */
export async function checkDailyKV(
  kv: KVNamespace | undefined,
  endpoint: string,
  ip: string,
  dailyLimit: number
): Promise<Response | null> {
  if (!kv) return null;

  const key = kvDailyLimitKey(endpoint, ip);

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
      { status: 429 }
    );
  }

  await kv.put(key, String(count + 1), { expirationTtl: 86400 });
  return null;
}

export function getIP(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}