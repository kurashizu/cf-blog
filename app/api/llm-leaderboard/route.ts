import { NextRequest, NextResponse } from "next/server";
import { getCacheEntry } from "@/lib/d1";
import { withApiAudit } from "@/lib/api-audit";

const CACHE_MAX_AGE = 1800;

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
                    { headers: { "Cache-Control": "no-store" } },
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
                { headers: { "Cache-Control": "no-store" } },
            );
        }
    });
}
