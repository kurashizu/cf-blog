import { NextRequest, NextResponse } from "next/server";
import { getCacheEntry } from "@/lib/d1";
import { withApiAudit } from "@/lib/api-audit";

const CACHE_MAX_AGE = 1800;

// Read-only public data, also consumed by the krsz.in portal's leaderboard view.
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

interface CachedPayload {
    fetchedAt: string;
    intelligenceIndexVersion?: number;
    models: unknown[];
}

export async function GET(request: NextRequest) {
    return withApiAudit(request, "/api/llm-leaderboard", async (audit) => {
        try {
            const entry = await getCacheEntry<CachedPayload>("llm-leaderboard");
            if (!entry) {
                audit.set({ metadata: { cache: "miss" } });
                return NextResponse.json(
                    {
                        models: [],
                        fetchedAt: null,
                        intelligenceIndexVersion: null,
                    },
                    { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
                );
            }

            audit.set({
                metadata: {
                    cache: "hit",
                    models: Array.isArray(entry.models)
                        ? entry.models.length
                        : 0,
                },
            });
            return NextResponse.json(
                {
                    models: entry.models,
                    fetchedAt: entry.fetchedAt,
                    intelligenceIndexVersion:
                        entry.intelligenceIndexVersion ?? null,
                },
                {
                    headers: {
                        ...CORS_HEADERS,
                        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}`,
                    },
                },
            );
        } catch (e) {
            audit.set({
                outcome: "error",
                errorMessage: e instanceof Error ? e.message : String(e),
            });
            return NextResponse.json(
                { models: [], fetchedAt: null, intelligenceIndexVersion: null },
                { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
            );
        }
    });
}
