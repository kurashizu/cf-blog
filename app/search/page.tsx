/**
 * Search results page — SSR, calls /api/search via a server-side fetch.
 *
 * If no query is provided, renders an empty search page with just the search bar.
 */

import { SearchResults } from "@/components/search/SearchResults";
import { SearchBar } from "@/components/search/SearchBar";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Search",
    description: "Search articles and news on Kurashizu's Blog",
};

interface SearchResult {
    id: string;
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

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>;
}) {
    const { q } = await searchParams;
    const query = (q ?? "").trim();

    if (!query) {
        return (
            <div className="max-w-4xl mx-auto px-4 pb-12 pt-8 md:pt-12">
                <div className="mb-8">
                    <h1 className="page-title text-2xl font-bold mb-4">
                        Search
                    </h1>
                    <SearchBar variant="inline" />
                    <p className="text-sm text-text-secondary mt-2">
                        Enter a query to search articles and news.
                    </p>
                </div>
            </div>
        );
    }

    // Server-side fetch to /api/search
    let results: SearchResult[] = [];
    let error: string | undefined;

    try {
        // Construct the absolute URL for the internal API call.
        // In Cloudflare Workers, we use the request URL origin.
        const origin = process.env.NEXT_PUBLIC_URL ?? "https://blog.022025.xyz";
        const res = await fetch(
            `${origin}/api/search?q=${encodeURIComponent(query)}&topK=15`,
            { headers: { Accept: "application/json" } },
        );
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            error = `API ${res.status}: ${body}`;
        } else {
            const data = (await res.json()) as {
                results: SearchResult[];
                query: string;
            };
            results = data.results;
        }
    } catch (e) {
        error = e instanceof Error ? e.message : String(e);
    }

    return (
        <SearchResults query={query} results={results} error={error} />
    );
}
