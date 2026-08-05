import { NextResponse } from "next/server";
import { getCacheEntry } from "@/lib/d1";

const CACHE_MAX_AGE = 1800;

interface CachedPayload {
    fetchedAt: string;
    intelligenceIndexVersion?: number;
    models: unknown[];
}

export async function GET() {
    try {
        const entry = await getCacheEntry<CachedPayload>("llm-leaderboard");
        if (!entry) {
            return NextResponse.json(
                {
                    models: [],
                    fetchedAt: null,
                    intelligenceIndexVersion: null,
                },
                { headers: { "Cache-Control": "no-store" } },
            );
        }

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
    } catch {
        return NextResponse.json(
            { models: [], fetchedAt: null, intelligenceIndexVersion: null },
            { headers: { "Cache-Control": "no-store" } },
        );
    }
}
