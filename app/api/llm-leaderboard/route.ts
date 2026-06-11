import { NextResponse } from "next/server";
import { r2Get } from "@/lib/r2";
import { r2Paths } from "@/lib/r2-paths";

// The leaderboard is refreshed by cache-worker every 30 min. Edge-caching the
// response for the same window lets repeat visitors skip the R2 read entirely
// (and means a single R2 hit is shared across all concurrent reads in a region).
const CACHE_MAX_AGE = 1800;

interface CachedPayload {
    fetchedAt?: string;
    models?: unknown[];
}

export async function GET() {
    try {
        const data = await r2Get(r2Paths.llmLeaderboardCache);
        const parsed = JSON.parse(data);

        // Backward compatible: pre-wrapper caches were a bare model array.
        // Once cache-worker has run at least once after the wrapper change,
        // `parsed` will be `{ fetchedAt, models }`.
        const models = Array.isArray(parsed)
            ? parsed
            : ((parsed as CachedPayload).models ?? []);
        const fetchedAt = Array.isArray(parsed)
            ? null
            : ((parsed as CachedPayload).fetchedAt ?? null);

        return NextResponse.json(
            { models, fetchedAt },
            {
                headers: {
                    "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}`,
                },
            },
        );
    } catch {
        // Empty list lets the client render a graceful "no data" state
        // instead of bubbling a 500 to a user who just opened the modal.
        return NextResponse.json(
            { models: [], fetchedAt: null },
            { headers: { "Cache-Control": "no-store" } },
        );
    }
}
