import { describe, expect, it, vi } from "vitest";
import {
    ApiAuditContext,
    getCallerInfo,
    outcomeFromStatus,
    recordApiAccess,
    runApiAudit,
    type ApiAccessEntry,
    type ApiAuditEnv,
} from "./api-audit";

/** Capture rows instead of writing to D1. */
function fakeEnv(): { env: ApiAuditEnv; rows: unknown[][] } {
    const rows: unknown[][] = [];
    const env = {
        DB: {
            prepare: () => ({
                bind: (...args: unknown[]) => ({
                    run: async () => {
                        rows.push(args);
                        return { meta: { changes: 1 } };
                    },
                }),
            }),
        },
    } as unknown as ApiAuditEnv;
    return { env, rows };
}

const req = (
    init: { method?: string; headers?: Record<string, string> } = {},
) =>
    new Request("https://blog.test/api/thing", {
        method: init.method ?? "GET",
        headers: init.headers ?? {},
    });

describe("getCallerInfo", () => {
    it("prefers cf-connecting-ip and reads cf geo fields", () => {
        const caller = getCallerInfo(
            req({
                headers: {
                    "cf-connecting-ip": "203.0.113.7",
                    "x-forwarded-for": "10.0.0.1",
                    "user-agent": "Mozilla/5.0",
                    "cf-ray": "8f2a-SYD",
                },
            }),
            {
                country: "AU",
                city: "Sydney",
                asn: 13335,
                asOrganization: "Cloudflare",
            },
        );
        expect(caller.ip).toBe("203.0.113.7");
        expect(caller.country).toBe("AU");
        expect(caller.city).toBe("Sydney");
        expect(caller.asn).toBe(13335);
        expect(caller.asOrg).toBe("Cloudflare");
        expect(caller.userAgent).toBe("Mozilla/5.0");
        expect(caller.rayId).toBe("8f2a-SYD");
    });

    it("falls back through x-real-ip then the first x-forwarded-for hop", () => {
        expect(
            getCallerInfo(req({ headers: { "x-real-ip": "198.51.100.4" } })).ip,
        ).toBe("198.51.100.4");
        expect(
            getCallerInfo(
                req({
                    headers: { "x-forwarded-for": "198.51.100.9, 10.0.0.1" },
                }),
            ).ip,
        ).toBe("198.51.100.9");
    });

    it("returns empty geo when request.cf is absent (local dev)", () => {
        const caller = getCallerInfo(req());
        expect(caller.ip).toBe("");
        expect(caller.country).toBe("");
        expect(caller.asn).toBeNull();
    });

    it("truncates an oversized user agent", () => {
        const caller = getCallerInfo(
            req({ headers: { "user-agent": "x".repeat(500) } }),
        );
        expect(caller.userAgent.length).toBeLessThanOrEqual(301);
        expect(caller.userAgent.endsWith("…")).toBe(true);
    });
});

describe("outcomeFromStatus", () => {
    it.each([
        [200, "ok"],
        [204, "ok"],
        [304, "ok"],
        [400, "bad_request"],
        [401, "unauthorized"],
        [403, "unauthorized"],
        [429, "rate_limited"],
        [500, "error"],
        [502, "error"],
    ])("maps %i to %s", (status, expected) => {
        expect(outcomeFromStatus(status)).toBe(expected);
    });
});

describe("recordApiAccess", () => {
    const baseEntry = (): ApiAccessEntry => ({
        worker: "cf-blog",
        route: "/api/llm",
        method: "POST",
        caller: getCallerInfo(
            req({ headers: { "cf-connecting-ip": "203.0.113.7" } }),
        ),
    });

    it("is a no-op when no DB binding is present", async () => {
        await expect(recordApiAccess({}, baseEntry())).resolves.toBeUndefined();
    });

    it("never throws when the D1 write fails", async () => {
        const env = {
            DB: {
                prepare: () => {
                    throw new Error("D1 unavailable");
                },
            },
        } as unknown as ApiAuditEnv;
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        await expect(recordApiAccess(env, baseEntry())).resolves.toBeUndefined();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it("writes the caller columns", async () => {
        const { env, rows } = fakeEnv();
        await recordApiAccess(env, {
            ...baseEntry(),
            outcome: "ok",
            httpStatus: 200,
            model: "gemma-4-31b-it",
        });
        expect(rows).toHaveLength(1);
        const [worker, route, method, outcome, status] = rows[0];
        expect(worker).toBe("cf-blog");
        expect(route).toBe("/api/llm");
        expect(method).toBe("POST");
        expect(outcome).toBe("ok");
        expect(status).toBe(200);
        expect(rows[0]).toContain("203.0.113.7");
        expect(rows[0]).toContain("gemma-4-31b-it");
    });
});

describe("ApiAuditContext", () => {
    const ctx = () =>
        new ApiAuditContext(getCallerInfo(req()));

    it("merges metadata key-wise instead of replacing it", () => {
        const c = ctx();
        c.set({ metadata: { a: 1 } });
        c.set({ metadata: { b: 2 } });
        expect(c.snapshot().metadata).toEqual({ a: 1, b: 2 });
    });

    it("accumulates upstream call counts", () => {
        const c = ctx();
        c.countUpstreamCall();
        c.countUpstreamCall(2);
        expect(c.snapshot().requestCount).toBe(3);
    });

    it("only flushes once, however many times complete() is called", () => {
        const c = ctx();
        const flush = vi.fn();
        c.installFlush(flush);
        c.complete({ httpStatus: 200 });
        c.complete({ httpStatus: 500 });
        expect(flush).toHaveBeenCalledTimes(1);
    });
});

describe("runApiAudit", () => {
    const base = (env: ApiAuditEnv) => ({
        request: req({
            method: "POST",
            headers: { "cf-connecting-ip": "203.0.113.7" },
        }),
        route: "/api/llm",
        worker: "cf-blog",
        env,
    });

    it("writes exactly one row and returns the handler's response", async () => {
        const { env, rows } = fakeEnv();
        const res = await runApiAudit({
            ...base(env),
            handler: async () => new Response("ok", { status: 200 }),
        });
        expect(res.status).toBe(200);
        expect(rows).toHaveLength(1);
    });

    it("infers the outcome from the response status", async () => {
        const { env, rows } = fakeEnv();
        await runApiAudit({
            ...base(env),
            handler: async () => new Response("slow down", { status: 429 }),
        });
        expect(rows[0][3]).toBe("rate_limited");
    });

    it("records handler fields such as model and tokens", async () => {
        const { env, rows } = fakeEnv();
        await runApiAudit({
            ...base(env),
            handler: async (audit) => {
                audit.set({
                    model: "gemma-4-31b-it",
                    inputTokens: 120,
                    outputTokens: 30,
                });
                return new Response("ok");
            },
        });
        expect(rows[0]).toContain("gemma-4-31b-it");
        expect(rows[0]).toContain(120);
        expect(rows[0]).toContain(30);
    });

    it("records an error row and re-throws when the handler throws", async () => {
        const { env, rows } = fakeEnv();
        await expect(
            runApiAudit({
                ...base(env),
                handler: async () => {
                    throw new Error("boom");
                },
            }),
        ).rejects.toThrow("boom");
        expect(rows).toHaveLength(1);
        expect(rows[0][3]).toBe("error");
        expect(rows[0]).toContain("boom");
    });

    it("does not write on return when the handler defers", async () => {
        const { env, rows } = fakeEnv();
        let deferredAudit: ApiAuditContext | undefined;
        await runApiAudit({
            ...base(env),
            handler: async (audit) => {
                audit.defer();
                deferredAudit = audit;
                return new Response("streaming");
            },
        });
        expect(rows).toHaveLength(0);

        // ...and writes once the stream completes.
        deferredAudit!.complete({ httpStatus: 200, model: "gemma-4-31b-it" });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toContain("gemma-4-31b-it");
    });

    it("passes the promise to waitUntil so the write outlives the response", async () => {
        const { env } = fakeEnv();
        const waitUntil = vi.fn();
        await runApiAudit({
            ...base(env),
            waitUntil,
            handler: async () => new Response("ok"),
        });
        expect(waitUntil).toHaveBeenCalledTimes(1);
    });
});
