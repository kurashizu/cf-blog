/**
 * Tests for `fetchLLMLeaderboard` (Artificial Analysis V2 migration).
 *
 * The old endpoint returned a single unpaginated array. V2 splits the catalog
 * into 200-item pages with `pagination.has_more` and exposes median
 * performance inside a nested `performance` object. These tests cover the
 * paging loop, payload projection, and the new validation guards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchLLMLeaderboard } from "./sources";

type ModelBody = {
    id: string;
    name: string;
    slug: string;
    release_date: string | null;
    model_creator: { id: string; name: string } | null;
    evaluations: {
        artificial_analysis_intelligence_index: number | null;
        artificial_analysis_coding_index: number | null;
        artificial_analysis_agentic_index: number | null;
    };
    pricing: {
        price_1m_input_tokens: number | null;
        price_1m_output_tokens: number | null;
    };
    performance: {
        median_output_tokens_per_second: number | null;
        median_time_to_first_token_seconds: number | null;
        median_time_to_first_answer_token_seconds: number | null;
        median_end_to_end_response_time_seconds: number | null;
    };
};

const baseModel = (
    overrides: Partial<ModelBody> = {},
): ModelBody => ({
    id: "id-1",
    name: "Test Model",
    slug: "test-model",
    release_date: "2026-01-01",
    model_creator: { id: "c1", name: "Acme" },
    evaluations: {
        artificial_analysis_intelligence_index: 50,
        artificial_analysis_coding_index: 30,
        artificial_analysis_agentic_index: 20,
    },
    pricing: { price_1m_input_tokens: 3, price_1m_output_tokens: 15 },
    performance: {
        median_output_tokens_per_second: 120,
        median_time_to_first_token_seconds: 0.5,
        median_time_to_first_answer_token_seconds: 2,
        median_end_to_end_response_time_seconds: 5,
    },
    ...overrides,
});

const buildPage = (
    models: ModelBody[],
    page: number,
    hasMore: boolean,
    version = 4.1,
): Response =>
    new Response(
        JSON.stringify({
            tier: "free",
            intelligence_index_version: version,
            pagination: {
                page,
                page_size: 200,
                total_pages: hasMore ? page + 1 : page,
                has_more: hasMore,
            },
            data: models,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
    );

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("fetchLLMLeaderboard — V2 migration", () => {
    it("fetches every page until has_more is false", async () => {
        const page1 = Array.from({ length: 200 }, (_, i) =>
            baseModel({
                id: `id-${i}`,
                slug: `model-${i}`,
                evaluations: {
                    ...baseModel().evaluations,
                    artificial_analysis_intelligence_index: 100 - i,
                },
            }),
        );
        const page2 = [
            baseModel({ id: "id-x", slug: "model-x" }),
            baseModel({ id: "id-y", slug: "model-y" }),
        ];
        fetchMock
            .mockResolvedValueOnce(buildPage(page1, 1, true))
            .mockResolvedValueOnce(buildPage(page2, 2, false));

        const { models, intelligenceIndexVersion } =
            await fetchLLMLeaderboard("fake-key");

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
        expect(firstUrl.pathname).toBe("/api/v2/language/models/free");
        expect(firstUrl.searchParams.get("page")).toBe("1");
        expect(models).toHaveLength(202);
        expect(intelligenceIndexVersion).toBe(4.1);
        // Sorted by intelligence_index desc — page-1 has scores 100..1 so
        // they all outrank the page-2 defaults (50). `model-0` tops the
        // board, page-2 entries come last, and the array length confirms
        // pagination joined both pages.
        expect(models[0].slug).toBe("model-0");
        expect(models).toHaveLength(202);
        // Page-1 models have intelligence 100, 99, …, 1, all > 50, so they
        // must sort before the page-2 defaults regardless of any stable-sort
        // behaviour. Every page-1 slug is `model-<n>`, and the page-2 slugs
        // are `model-x` and `model-y` — they share the same prefix, so a
        // string check could misclassify them. Compare by intelligence index
        // instead.
        const pageOneMin = models
            .slice(0, 200)
            .reduce(
                (min, m) =>
                    Math.min(
                        min,
                        m.evaluations.artificial_analysis_intelligence_index ??
                            Number.POSITIVE_INFINITY,
                    ),
                Number.POSITIVE_INFINITY,
            );
        const pageTwoMax = models
            .slice(200)
            .reduce(
                (max, m) =>
                    Math.max(
                        max,
                        m.evaluations.artificial_analysis_intelligence_index ??
                            Number.NEGATIVE_INFINITY,
                    ),
                Number.NEGATIVE_INFINITY,
            );
        expect(pageOneMin).toBeGreaterThan(pageTwoMax);
    });

    it("projects the V2 fields and synthesizes blended pricing", async () => {
        fetchMock.mockResolvedValueOnce(
            buildPage(
                [
                    baseModel({
                        pricing: {
                            price_1m_input_tokens: 4,
                            price_1m_output_tokens: 20,
                        },
                    }),
                ],
                1,
                false,
            ),
        );

        const { models } = await fetchLLMLeaderboard("fake-key");
        const m = models[0];
        expect(m.evaluations).toEqual({
            artificial_analysis_intelligence_index: 50,
            artificial_analysis_coding_index: 30,
            artificial_analysis_agentic_index: 20,
        });
        // Blended = (4*3 + 20) / 4 = 8
        expect(m.pricing).toEqual({
            price_1m_blended_3_to_1: 8,
            price_1m_input_tokens: 4,
            price_1m_output_tokens: 20,
        });
        expect(m.median_output_tokens_per_second).toBe(120);
        expect(m.median_time_to_first_token_seconds).toBe(0.5);
    });

    it("falls back to 'Unknown' when the creator is missing", async () => {
        fetchMock.mockResolvedValueOnce(
            buildPage([baseModel({ model_creator: null })], 1, false),
        );

        const { models } = await fetchLLMLeaderboard("fake-key");
        expect(models[0].model_creator.name).toBe("Unknown");
    });

    it("omits blended pricing when either input or output is missing", async () => {
        fetchMock.mockResolvedValueOnce(
            buildPage(
                [
                    baseModel({
                        pricing: {
                            price_1m_input_tokens: 4,
                            price_1m_output_tokens: null,
                        },
                    }),
                ],
                1,
                false,
            ),
        );

        const { models } = await fetchLLMLeaderboard("fake-key");
        expect(models[0].pricing.price_1m_blended_3_to_1).toBeUndefined();
    });

    it("throws when an error response includes a JSON error body", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ error: "Invalid API key." }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            }),
        );
        await expect(fetchLLMLeaderboard("bad-key")).rejects.toThrow(
            /AA API 401.*Invalid API key/,
        );
    });

    it("surfaces Retry-After headers on 429 responses", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
                status: 429,
                headers: {
                    "Content-Type": "application/json",
                    "Retry-After": "86400",
                },
            }),
        );
        await expect(fetchLLMLeaderboard("k")).rejects.toThrow(
            /Retry-After: 86400/,
        );
    });

    it("rejects malformed JSON responses", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ wrong: "shape" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
        await expect(fetchLLMLeaderboard("k")).rejects.toThrow(/invalid/);
    });

    it("rejects when the page index does not match the request", async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    tier: "free",
                    intelligence_index_version: 4.1,
                    pagination: {
                        page: 5,
                        page_size: 200,
                        total_pages: 5,
                        has_more: false,
                    },
                    data: [],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            ),
        );
        await expect(fetchLLMLeaderboard("k")).rejects.toThrow(
            /expected 1/,
        );
    });

    it("rejects when the index version changes mid-pagination", async () => {
        fetchMock
            .mockResolvedValueOnce(buildPage([baseModel()], 1, true, 4.1))
            .mockResolvedValueOnce(buildPage([baseModel()], 2, false, 4.0));
        await expect(fetchLLMLeaderboard("k")).rejects.toThrow(
            /Intelligence Index version/,
        );
    });

    it("refuses to page beyond the safety limit", async () => {
        // Always claim there is more data — the worker must bail out. We
        // make the first page report an enormous total_pages so the paging
        // loop runs all the way to the safety limit.
        const build = (page: number) =>
            new Response(
                JSON.stringify({
                    tier: "free",
                    intelligence_index_version: 4.1,
                    pagination: {
                        page,
                        page_size: 200,
                        total_pages: 50,
                        has_more: true,
                    },
                    data: [baseModel({ id: `id-${page}`, slug: `m-${page}` })],
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            );
        fetchMock.mockImplementation(async (url) => {
            const reqUrl = new URL(url as string);
            return build(Number(reqUrl.searchParams.get("page")));
        });
        await expect(fetchLLMLeaderboard("k")).rejects.toThrow(
            /(safety limit|invalid pagination)/,
        );
    });

    it("throws when the upstream returns zero models", async () => {
        fetchMock.mockResolvedValueOnce(buildPage([], 1, false));
        await expect(fetchLLMLeaderboard("k")).rejects.toThrow(
            /empty response/,
        );
    });
});
