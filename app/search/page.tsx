/**
 * Search results page — SSR, directly invokes the search logic.
 *
 * If no query is provided, renders an empty search page with just the search bar.
 */

import { performSearch, RateLimitError } from "@/lib/search";
import type { SearchHit } from "@/lib/search";
import { SearchResults } from "@/components/search/SearchResults";
import { headers } from "next/headers";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Search",
    description: "Search articles and news on Kurashizu's Blog",
};

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; source?: string }>;
}) {
    const { q, source } = await searchParams;
    const query = (q ?? "").trim();
    const sourceFilter =
        source === "blog" || source === "news" ? source : undefined;

    if (!query) {
        return (
            <div className="max-w-4xl mx-auto px-4 pb-12 pt-8 md:pt-12">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold mb-4">
                        Search
                    </h1>
                    <p className="text-sm text-text-secondary">
                        Use the search bar in the header above to run a
                        semantic search across blog articles and news.
                    </p>
                </div>
            </div>
        );
    }

    let results: SearchHit[] = [];
    let error: string | undefined;
    let isRateLimited = false;

    try {
        const headersList = await headers();
        const clientIP = headersList.get("CF-Connecting-IP") ?? undefined;
        const result = await performSearch(query, {
            topK: 15,
            sourceFilter,
            clientIP,
        });
        results = result.results;
    } catch (e) {
        if (e instanceof RateLimitError) {
            isRateLimited = true;
            error = "Too many searches. Please try again later.";
        } else {
            error = e instanceof Error ? e.message : String(e);
        }
    }

    return (
        <SearchResults
            query={query}
            results={results}
            error={error}
            sourceFilter={sourceFilter ?? "all"}
            isRateLimited={isRateLimited}
        />
    );
}
