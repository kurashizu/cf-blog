/**
 * Search API — accepts a query string, returns vector search results.
 *
 * GET /api/search?q=async+rust&topK=15
 */

import { NextRequest, NextResponse } from "next/server";
import { performSearch, RateLimitError } from "@/lib/search";
import { getIP } from "@/shared/ratelimiter";
import { withApiAudit } from "@/lib/api-audit";

export async function GET(request: NextRequest) {
    return withApiAudit(request, "/api/search", async (audit) => {
        const q = request.nextUrl.searchParams.get("q");
        if (!q || q.trim().length === 0) {
            audit.set({ metadata: { empty_query: true } });
            return NextResponse.json({ results: [] });
        }

        const topK = Math.min(
            parseInt(request.nextUrl.searchParams.get("topK") ?? "15", 10),
            50,
        );

        // The query itself is logged: it's the whole point of a search audit
        // (what was searched, by whom), and it's already stored per-query in
        // audit_log's `target` by performSearch.
        audit.set({
            metadata: { query: q.trim().slice(0, 200), top_k: topK },
        });

        try {
            const clientIP = getIP(request);
            const result = await performSearch(q.trim(), {
                topK,
                clientIP,
            });
            // One Gemini embedding call per search — attributed to this caller.
            audit.set({
                model: "gemini-embedding-2",
                requestCount: 1,
                metadata: { results: result.results.length },
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
            audit.set({
                errorMessage: e instanceof Error ? e.message : String(e),
            });
            return NextResponse.json(
                { error: "Search failed", results: [] },
                { status: 500 },
            );
        }
    });
}
