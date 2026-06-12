/**
 * Tests for the shared rate-limiter.
 *
 * The KV daily check is the only "persistent" guard between one user and the
 * LLM/guestbook endpoints — if its counter logic regresses, the blog can
 * either be DoS'd by a single IP or, conversely, never rate-limit at all.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { hashIP, checkBurst, checkDailyKV, getIP } from "./ratelimiter";

// Minimal KV mock that satisfies the operations checkDailyKV uses.
function makeKV(initial: Record<string, string | number> = {}): KVNamespace {
    const store = new Map<string, string | number>();
    for (const [k, v] of Object.entries(initial)) store.set(k, v);
    return {
        get: vi.fn(async (k: string) => {
            const v = store.get(k);
            return v === undefined ? null : String(v);
        }),
        put: vi.fn(async (k: string, v: string) => {
            store.set(k, v);
        }),
        delete: vi.fn(async (k: string) => {
            store.delete(k);
        }),
        list: vi.fn(),
        getWithMetadata: vi.fn(),
    } as unknown as KVNamespace;
}

describe("hashIP", () => {
    it("returns a base-36 string", () => {
        expect(hashIP("1.2.3.4")).toMatch(/^[0-9a-z]+$/);
    });

    it("is deterministic", () => {
        expect(hashIP("1.2.3.4")).toBe(hashIP("1.2.3.4"));
    });

    it("produces different hashes for different IPs", () => {
        expect(hashIP("1.2.3.4")).not.toBe(hashIP("1.2.3.5"));
    });

    it("handles empty string without throwing", () => {
        expect(hashIP("")).toMatch(/^[0-9a-z]+$/);
    });
});

describe("getIP", () => {
    it("reads CF-Connecting-IP", () => {
        const req = new Request("https://x", {
            headers: { "CF-Connecting-IP": "203.0.113.5" },
        });
        expect(getIP(req)).toBe("203.0.113.5");
    });

    it("falls back to 'unknown' when header is missing", () => {
        expect(getIP(new Request("https://x"))).toBe("unknown");
    });
});

describe("checkBurst", () => {
    it("returns null when binding is undefined (dev mode)", async () => {
        expect(await checkBurst(undefined, "ip", 2, 10)).toBeNull();
    });

    it("returns null when the binding allows the request", async () => {
        const binding = { limit: vi.fn(async () => ({ success: true })) } as unknown as RateLimit;
        expect(await checkBurst(binding, "ip", 2, 10)).toBeNull();
    });

    it("returns a 429 Response when the binding rejects the request", async () => {
        const binding = { limit: vi.fn(async () => ({ success: false })) } as unknown as RateLimit;
        const resp = await checkBurst(binding, "ip", 2, 10);
        expect(resp).not.toBeNull();
        expect(resp!.status).toBe(429);
        const body = (await resp!.json()) as Record<string, unknown>;
        expect(body.type).toBe("burst");
        expect(body.limit).toBe(2);
        expect(body.period).toBe(10);
    });
});

describe("checkDailyKV", () => {
    let kv: KVNamespace;

    beforeEach(() => {
        kv = makeKV();
    });

    it("returns null when kv is undefined (dev mode)", async () => {
        expect(await checkDailyKV(undefined, "llm", "1.1.1.1", 200)).toBeNull();
    });

    it("increments the counter on a fresh request", async () => {
        await checkDailyKV(kv, "llm", "1.1.1.1", 200);
        expect(kv.put).toHaveBeenCalledOnce();
        const [, value] = (kv.put as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(value).toBe("1");
    });

    it("returns 429 when the daily limit is reached", async () => {
        const kv2 = makeKV();
        // Pre-fill the counter to the limit. We don't know today's key
        // format from the outside, so first call once to discover it.
        await checkDailyKV(kv2, "llm", "1.1.1.1", 3);
        const key = (kv2.put as ReturnType<typeof vi.fn>).mock.calls[0][0];
        (kv2.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce("3");

        const resp = await checkDailyKV(kv2, "llm", "1.1.1.1", 3);
        expect(resp).not.toBeNull();
        expect(resp!.status).toBe(429);
        const body = (await resp!.json()) as Record<string, unknown>;
        expect(body.type).toBe("daily");
        expect(body.limit).toBe(3);
        expect(typeof body.resetAt).toBe("string");
        // key sanity-check (don't depend on the exact date)
        expect(key).toMatch(/^ratelimit:daily:llm:/);
    });

    it("uses different keys for different endpoints", async () => {
        await checkDailyKV(kv, "llm", "1.1.1.1", 200);
        await checkDailyKV(kv, "guestbook", "1.1.1.1", 5);
        const keys = (kv.put as ReturnType<typeof vi.fn>).mock.calls.map(
            (c) => c[0],
        );
        expect(keys[0]).toMatch(/^ratelimit:daily:llm:/);
        expect(keys[1]).toMatch(/^ratelimit:daily:guestbook:/);
    });
});
