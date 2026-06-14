/**
 * search — server-side search logic, callable from both the API route
 * and the SSR page without an extra HTTP round-trip.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { embedSearchQuery } from "@/lib/embeddings";
import { checkDailyKV } from "@/shared/ratelimiter";

interface SearchEnv {
    SEARCH_INDEX: VectorizeIndex;
    GEMINI_API_KEY: string;
    SESSION_KV: KVNamespace;
}

export interface SearchHit {
    /** Vector ID (e.g. "blog-my-post-overview") — not used for navigation. */
    id: string;
    /** Content slug (e.g. "my-post" for blog, "43928174" for news). */
    slug: string;
    score: number;
    source: "blog" | "news";
    type: string;
    title: string;
    heading: string | null;
    excerpt: string;
    tags?: string[];
    url: string | null;
    by: string | null;
    published_at: string;
}

export class RateLimitError extends Error {
    constructor(msg: string) {
        super(msg);
        this.name = "RateLimitError";
    }
}

export interface SearchResult {
    results: SearchHit[];
    query: string;
}

export interface SearchOptions {
    topK?: number;
    sourceFilter?: "blog" | "news";
    /** IP address for rate limiting. If omitted, rate limiting is skipped. */
    clientIP?: string;
}

export async function performSearch(
    query: string,
    options: SearchOptions = {},
): Promise<SearchResult> {
    const { topK = 15, sourceFilter, clientIP } = options;
    const { env } = getCloudflareContext();
    const cfEnv = env as unknown as SearchEnv;

    if (!cfEnv.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not configured");
    }

    // Rate limiting (daily KV)
    if (clientIP && cfEnv.SESSION_KV) {
        const dailyResp = await checkDailyKV(
            cfEnv.SESSION_KV,
            "search",
            clientIP,
            100,
        );
        if (dailyResp) {
            const body = (await dailyResp.json()) as { error: string };
            throw new RateLimitError(body.error);
        }
    }

    // 1. Embed the query
    const queryVector = await embedSearchQuery(query, cfEnv.GEMINI_API_KEY);

    // 2. Search Vectorize
    // Fetch extra results when filtering so we still have enough after client-side filter.
    const fetchTopK = sourceFilter ? topK * 3 : topK;
    const matches = await cfEnv.SEARCH_INDEX.query(queryVector, {
        topK: fetchTopK,
        returnValues: false,
        returnMetadata: "all",
    });

    // 3. Format + filter results
    let results: SearchHit[] = (matches.matches ?? []).map((match) => {
        const meta = match.metadata as Record<string, unknown>;
        const metaId = (meta.id as string) ?? "";
        // meta.id is the slug for blog, or "news-{id}" — strip prefix for news
        const slug =
            meta.source === "news" ? metaId.replace(/^news-/, "") : metaId;
        return {
            id: match.id,
            slug,
            score: match.score,
            source: meta.source as "blog" | "news",
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

    if (sourceFilter) {
        results = results.filter((r) => r.source === sourceFilter);
    }

    // Trim to requested topK
    if (results.length > topK) {
        results = results.slice(0, topK);
    }

    return { results, query };
}
