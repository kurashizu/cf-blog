/**
 * Search API — accepts a query string, returns vector search results.
 *
 * GET /api/search?q=async+rust&topK=15
 */

import { NextRequest, NextResponse } from "next/server";
import { performSearch, RateLimitError } from "@/lib/search";
import { getIP } from "@/shared/ratelimiter";

export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams.get("q");
    if (!q || q.trim().length === 0) {
        return NextResponse.json({ results: [] });
    }

    const topK = Math.min(
        parseInt(request.nextUrl.searchParams.get("topK") ?? "15", 10),
        50,
    );

    try {
        const clientIP = getIP(request);
        const result = await performSearch(q.trim(), {
            topK,
            clientIP,
        });
        return NextResponse.json(result);
    } catch (e) {
        console.error("Search error:", e);
        // Rate-limit errors carry a user-facing message; anything else stays
        // server-side to avoid leaking internals.
        if (e instanceof RateLimitError) {
            return NextResponse.json(
                { error: e.message, results: [] },
                { status: 429 },
            );
        }
        return NextResponse.json(
            { error: "Search failed", results: [] },
            { status: 500 },
        );
    }
}
