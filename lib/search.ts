/**
 * search — server-side search logic, callable from both the API route
 * and the SSR page without an extra HTTP round-trip.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { embedSearchQuery } from "@/lib/embeddings";

interface SearchEnv {
    SEARCH_INDEX: VectorizeIndex;
    GEMINI_API_KEY: string;
}

export interface SearchHit {
    id: string;
    score: number;
    source: string;
    type: string;
    title: string;
    heading: string | null;
    excerpt: string;
    tags?: string[];
    url: string | null;
    by: string | null;
    published_at: string;
}

export interface SearchResult {
    results: SearchHit[];
    query: string;
}

export async function performSearch(
    query: string,
    topK: number = 15,
): Promise<SearchResult> {
    const { env } = getCloudflareContext();
    const cfEnv = env as unknown as SearchEnv;

    if (!cfEnv.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not configured");
    }

    // 1. Embed the query
    const queryVector = await embedSearchQuery(query, cfEnv.GEMINI_API_KEY);

    // 2. Search Vectorize
    const matches = await cfEnv.SEARCH_INDEX.query(queryVector, {
        topK,
        returnValues: false,
        returnMetadata: "all",
    });

    // 3. Format results
    const results: SearchHit[] = (matches.matches ?? []).map((match) => {
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

    return { results, query };
}
