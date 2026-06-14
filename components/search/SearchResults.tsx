"use client";

import { SearchBar } from "@/components/search/SearchBar";

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

interface SearchResultsProps {
    query: string;
    results: SearchResult[];
    error?: string;
}

function formatDate(dateStr: string): string {
    if (!dateStr) return "";
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    } catch {
        return dateStr;
    }
}

export function SearchResults({ query, results, error }: SearchResultsProps) {
    return (
        <div className="max-w-4xl mx-auto px-4 pb-12 pt-8 md:pt-12 animate-fadeIn">
            <div
                className="mb-8 animate-fade-up"
                style={{ animationDelay: "0ms" }}
            >
                <h1 className="page-title text-2xl font-bold mb-2">
                    Search Results
                </h1>
                <SearchBar variant="inline" initialQuery={query} />
                <p className="text-sm text-text-secondary mt-2">
                    {results.length > 0
                        ? `Found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}"`
                        : error
                          ? `Search failed: ${error}`
                          : `No results for "${query}"`}
                </p>
            </div>

            {results.length > 0 && (
                <div className="space-y-4">
                    {results.map((r, i) => (
                        <div
                            key={r.id}
                            className="animate-fade-up-sm"
                            style={{ animationDelay: `${80 + i * 50}ms` }}
                        >
                            <SearchResultCard result={r} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SearchResultCard({ result }: { result: SearchResult }) {
    const isBlog = result.source === "blog";
    const isNews = result.source === "news";
    const href = isNews
        ? `/news/${result.id.replace("news-", "")}`
        : `/blog/${result.id}${result.heading ? `#${result.heading.toLowerCase().replace(/\s+/g, "-")}` : ""}`;

    return (
        <a
            href={href}
            className="block rounded-xl border border-border bg-bg-card
                       hover:border-accent/50 hover:bg-bg-card/80
                       transition-all duration-200 group"
        >
            <div className="p-4">
                {/* Source badge */}
                <div className="flex items-center gap-2 mb-1.5">
                    <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            isBlog
                                ? "bg-accent/10 text-accent"
                                : "bg-green-500/10 text-green-500"
                        }`}
                    >
                        {isBlog ? "📝 Blog" : "📰 News"}
                    </span>
                    {result.type === "overview" && (
                        <span className="text-[10px] text-text-muted">
                            (overview match)
                        </span>
                    )}
                    <span className="text-[10px] text-text-muted ml-auto">
                        {formatDate(result.published_at)}
                    </span>
                </div>

                {/* Title */}
                <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                    {result.title}
                </h3>

                {/* Section heading */}
                {result.heading && (
                    <p className="text-xs text-accent/80 mt-0.5 font-mono">
                        Section: {result.heading}
                    </p>
                )}

                {/* Excerpt */}
                {result.excerpt && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                        {result.excerpt}
                    </p>
                )}

                {/* Meta footer */}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted">
                    {isNews && result.by && <span>by {result.by}</span>}
                    {isNews && result.url && (
                        <a
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-accent transition-colors"
                            onClick={(e) => e.stopPropagation()}
                        >
                            Original source →
                        </a>
                    )}
                    {isBlog && result.tags && result.tags.length > 0 && (
                        <span>
                            {result.tags.slice(0, 3).join(" · ")}
                            {result.tags.length > 3 && " …"}
                        </span>
                    )}
                </div>
            </div>
        </a>
    );
}
