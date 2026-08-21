/**
 * Tests for `handleFetch` in the cache-worker.
 *
 * The handler is the manual control surface for the refresh/heartbeat/search
 * cron workers. These tests focus on the AA-related behaviour: forcing a
 * leaderboard refresh past the two-hour guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.fn();

vi.mock("../lib/refresh", () => ({
    refreshCache: refreshMock,
}));

const { handleFetch } = await import("./fetch");

const buildEnv = (overrides: Record<string, unknown> = {}): unknown => ({
    CRON_SECRET: "secret",
    ARTIFICIAL_ANALYSIS_API_KEY: undefined,
    GITHUB_PERSONAL_ACCESS_TOKEN: undefined,
    GH_USERNAME: undefined,
    ...overrides,
});

const buildRequest = (
    url: string,
    method = "POST",
    auth: string | null = "Bearer secret",
): Request => {
    const headers: Record<string, string> = {};
    if (auth !== null) headers.Authorization = auth;
    return new Request(url, { method, headers });
};

beforeEach(() => {
    refreshMock.mockReset();
    refreshMock.mockResolvedValue([]);
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("handleFetch — /__refresh", () => {
    it("rejects unauthenticated callers with 401", async () => {
        const res = await handleFetch(
            buildRequest("https://x.test/__refresh", "POST", "Bearer wrong"),
            buildEnv() as never,
        );
        expect(res.status).toBe(401);
        expect(refreshMock).not.toHaveBeenCalled();
    });

    it("passes forceLLM=false by default", async () => {
        const res = await handleFetch(
            buildRequest("https://x.test/__refresh"),
            buildEnv() as never,
        );
        expect(res.status).toBe(200);
        expect(refreshMock).toHaveBeenCalledWith(expect.anything(), {
            forceLLM: false,
        });
    });

    it("lets an authenticated caller force a refresh via ?force=1", async () => {
        const res = await handleFetch(
            buildRequest("https://x.test/__refresh?force=1"),
            buildEnv() as never,
        );
        expect(res.status).toBe(200);
        expect(refreshMock).toHaveBeenCalledWith(expect.anything(), {
            forceLLM: true,
        });
    });

    it("never lets an unauthenticated caller force a refresh", async () => {
        const res = await handleFetch(
            buildRequest(
                "https://x.test/__refresh?force=1",
                "POST",
                "Bearer wrong",
            ),
            buildEnv() as never,
        );
        expect(res.status).toBe(401);
        expect(refreshMock).not.toHaveBeenCalled();
    });

    it("treats an empty CRON_SECRET as a fully public endpoint", async () => {
        // With no secret configured the handler must accept any caller but
        // refuse the force flag, since the force flag would otherwise let
        // anonymous callers burn the AA quota. This documents today's
        // behaviour: refreshCache is callable, but forceLLM is always false.
        const res = await handleFetch(
            buildRequest("https://x.test/__refresh?force=1", "POST", null),
            buildEnv({ CRON_SECRET: "" }) as never,
        );
        expect(res.status).toBe(200);
        expect(refreshMock).toHaveBeenCalledWith(expect.anything(), {
            forceLLM: false,
        });
    });

    it("returns a 200 with a summary even when refresh throws", async () => {
        refreshMock.mockRejectedValueOnce(new Error("boom"));
        const res = await handleFetch(
            buildRequest("https://x.test/__refresh"),
            buildEnv() as never,
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { success: boolean; logs: string };
        expect(body.success).toBe(false);
        expect(body.logs).toMatch(/FATAL: boom/);
    });

    it("returns the health-check page for unknown paths", async () => {
        const res = await handleFetch(
            buildRequest("https://x.test/health", "GET", null),
            buildEnv() as never,
        );
        expect(res.status).toBe(200);
        expect(await res.text()).toContain("cf-blog-cache");
    });
});
