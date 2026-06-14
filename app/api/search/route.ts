/**
 * Search API — accepts a query string, returns vector search results.
 *
 * GET /api/search?q=async+rust&topK=15
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { embedSearchQuery } from "@/lib/embeddings";

interface SearchEnv {
    SEARCH_INDEX: VectorizeIndex;
    GEMINI_API_KEY: string;
}

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
        const { env } = getCloudflareContext();
        const cfEnv = env as unknown as {
            SEARCH_INDEX: VectorizeIndex;
            GEMINI_API_KEY: string;
        };

        if (!cfEnv.GEMINI_API_KEY) {
            return NextResponse.json(
                { error: "GEMINI_API_KEY not configured" },
                { status: 500 },
            );
        }

        // 1. Embed the query
        const queryVector = await embedSearchQuery(
            q.trim(),
            cfEnv.GEMINI_API_KEY,
        );

        // 2. Search Vectorize
        const matches = await cfEnv.SEARCH_INDEX.query(queryVector, {
            topK,
            returnValues: false,
            returnMetadata: "all",
        });

        // 3. Format results
        const results = (matches.matches ?? []).map((match) => {
            const meta = match.metadata as Record<string, unknown>;
            return {
                id: match.id,
                score: match.score,
                source: meta.source as string,
                type: meta.type as string,
                title: meta.title as string,
                heading: (meta.heading as string) ?? null,
                excerpt: meta.excerpt as string,
                tags: meta.tags as string[] | undefined,
                url: (meta.url as string) ?? null,
                by: (meta.by as string) ?? null,
                published_at: meta.published_at as string,
            };
        });

        return NextResponse.json({ results, query: q.trim() });
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
