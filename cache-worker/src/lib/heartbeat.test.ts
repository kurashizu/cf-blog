/**
 * Tests for the rewrite heartbeat's retry budget.
 *
 * The behaviour under test is the fix for a poison item silently starving
 * the queue: before this, a failure wrote nothing, so the same row was
 * re-selected on every tick forever.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateItemRewrite = vi.fn();

vi.mock("./sources", () => ({
    generateItemRewrite: (...args: unknown[]) => generateItemRewrite(...args),
}));

// withAudit just runs the operation here; audit rows aren't under test.
vi.mock("./audit", async () => {
    const actual = await vi.importActual<typeof import("./audit")>("./audit");
    return {
        ...actual,
        withAudit: async (
            _env: unknown,
            _cat: unknown,
            _op: unknown,
            _target: unknown,
            fn: () => Promise<unknown>,
        ) => fn(),
    };
});

const { handleHeartbeat, isQuotaError, MAX_REWRITE_RETRIES } = await import(
    "./heartbeat"
);

interface Recorded {
    sql: string;
    binds: unknown[];
}

/** Minimal D1 double: one canned SELECT result, every write recorded. */
function buildEnv(pendingRow: Record<string, unknown> | null) {
    const writes: Recorded[] = [];
    const env = {
        GEMINI_API_KEY: "key",
        DB: {
            prepare(sql: string) {
                return {
                    bind(...binds: unknown[]) {
                        return {
                            first: async () => pendingRow,
                            run: async () => {
                                writes.push({ sql, binds });
                                return { meta: { changes: 1 } };
                            },
                        };
                    },
                    first: async () => pendingRow,
                    run: async () => {
                        writes.push({ sql, binds: [] });
                        return { meta: { changes: 1 } };
                    },
                };
            },
        },
    } as unknown as Parameters<typeof handleHeartbeat>[0];
    return { env, writes };
}

const story = (over: Record<string, unknown> = {}) => ({
    id: 42,
    title: "A story",
    url: "https://example.test/a",
    score: 10,
    by: "someone",
    time: 1_700_000_000,
    descendants: 3,
    domain: "example.test",
    summary: "",
    rewrite_retry_count: 0,
    ...over,
});

beforeEach(() => {
    generateItemRewrite.mockReset();
});

describe("isQuotaError", () => {
    it.each([
        ['Gemini 429: {"error":{"code":429}}', true],
        ['{"status":"RESOURCE_EXHAUSTED"}', true],
        ["daily quota exhausted", true],
        ["fetch failed: 404 Not Found", false],
        ["content blocked by safety filter", false],
    ])("%s → %s", (message, expected) => {
        expect(isQuotaError(new Error(message))).toBe(expected);
    });
});

describe("handleHeartbeat", () => {
    it("reports idle when nothing is pending", async () => {
        const { env, writes } = buildEnv(null);
        const res = await handleHeartbeat(env);
        expect(res).toEqual({ ok: true, detail: "nothing pending" });
        expect(writes).toHaveLength(0);
    });

    it("fails closed without an API key", async () => {
        const { env } = buildEnv(story());
        const res = await handleHeartbeat({
            ...env,
            GEMINI_API_KEY: undefined,
        } as unknown as Parameters<typeof handleHeartbeat>[0]);
        expect(res.ok).toBe(false);
    });

    it("only selects items still inside the retry budget", async () => {
        const { env } = buildEnv(null);
        const prepare = vi.spyOn(env.DB, "prepare");
        await handleHeartbeat(env);
        const sql = prepare.mock.calls[0][0];
        expect(sql).toMatch(/rewrite_retry_count\s*<\s*\?/);
        expect(sql).toMatch(/summary\s*=\s*''/);
    });

    it("clears the budget on success and re-dirties the search index", async () => {
        generateItemRewrite.mockResolvedValue("a fresh summary");
        const { env, writes } = buildEnv(story({ rewrite_retry_count: 3 }));

        const res = await handleHeartbeat(env);

        expect(res.ok).toBe(true);
        expect(writes).toHaveLength(1);
        expect(writes[0].sql).toMatch(/rewrite_retry_count = 0/);
        expect(writes[0].sql).toMatch(/rewrite_failed_at = NULL/);
        expect(writes[0].sql).toMatch(/search_updated_at = NULL/);
        expect(writes[0].binds[0]).toBe("a fresh summary");
    });

    it("spends one retry on a genuine failure", async () => {
        generateItemRewrite.mockRejectedValue(new Error("404 Not Found"));
        const { env, writes } = buildEnv(story({ rewrite_retry_count: 1 }));

        const res = await handleHeartbeat(env);

        expect(res.ok).toBe(false);
        expect(res.detail).toContain(`2/${MAX_REWRITE_RETRIES}`);
        expect(writes).toHaveLength(1);
        expect(writes[0].sql).toMatch(/rewrite_retry_count = \?/);
        expect(writes[0].binds[0]).toBe(2);
    });

    it("announces parking on the final failure", async () => {
        generateItemRewrite.mockRejectedValue(new Error("still broken"));
        const { env, writes } = buildEnv(
            story({ rewrite_retry_count: MAX_REWRITE_RETRIES - 1 }),
        );

        const res = await handleHeartbeat(env);

        expect(res.detail).toContain("parked");
        expect(writes[0].binds[0]).toBe(MAX_REWRITE_RETRIES);
    });

    it("does NOT spend budget on a quota error", async () => {
        generateItemRewrite.mockRejectedValue(
            new Error('Gemini 429: {"error":{"code":429}}'),
        );
        const { env, writes } = buildEnv(story({ rewrite_retry_count: 2 }));

        const res = await handleHeartbeat(env);

        expect(res.ok).toBe(false);
        expect(res.detail).toContain("not counted");
        expect(writes).toHaveLength(1);
        // Timestamp + error recorded, but retry_count untouched.
        expect(writes[0].sql).not.toMatch(/rewrite_retry_count\s*=/);
        expect(writes[0].sql).toMatch(/rewrite_failed_at = datetime/);
    });

    it("truncates a huge error message before storing it", async () => {
        generateItemRewrite.mockRejectedValue(new Error("x".repeat(1000)));
        const { env, writes } = buildEnv(story());

        await handleHeartbeat(env);

        const stored = writes[0].binds[1] as string;
        expect(stored.length).toBeLessThanOrEqual(300);
    });
});
