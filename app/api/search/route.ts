/**
 * Search API — accepts a query string, returns vector search results.
 *
 * GET /api/search?q=async+rust&topK=15
 */

import { NextRequest, NextResponse } from "next/server";
import { performSearch } from "@/lib/search";

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
        const result = await performSearch(q.trim(), topK);
        return NextResponse.json(result);
    } catch (e) {
        console.error("Search error:", e);
        return NextResponse.json(
            {
                error: e instanceof Error ? e.message : String(e),
                results: [],
            },
            { status: 500 },
        );
    }
}
