"use client";

import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/search/SearchBar";

interface SearchResult {
    id: string;
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

interface SearchResultsProps {
    query: string;
    results: SearchResult[];
    error?: string;
    sourceFilter: "all" | "blog" | "news";
    isRateLimited?: boolean;
}

const FILTER_OPTIONS: { value: "all" | "blog" | "news"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "blog", label: "Blog" },
    { value: "news", label: "News" },
];

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

export function SearchResults({
    query,
    results,
    error,
    sourceFilter,
    isRateLimited = false,
}: SearchResultsProps) {
    const router = useRouter();

    function handleFilterChange(value: "all" | "blog" | "news") {
        const params = new URLSearchParams({ q: query });
        if (value !== "all") params.set("source", value);
        router.push(`/search?${params.toString()}`);
    }

    return (
        <div className="max-w-4xl mx-auto px-4 pb-12 pt-8 md:pt-12 animate-fadeIn">
            <div
                className="mb-8 animate-fade-up"
                style={{ animationDelay: "0ms" }}
            >
                <h1 className="page-title text-2xl font-bold mb-2">
                    Search Results
                </h1>

                {/* Search bar + filter pills */}
                <div className="flex items-center gap-2">
                    <div className="flex-1">
                        <SearchBar variant="inline" initialQuery={query} />
                    </div>
                    <div className="flex shrink-0 rounded-lg border border-border bg-bg-card p-0.5">
                        {FILTER_OPTIONS.map((opt) => {
                            const isActive = sourceFilter === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    onClick={() =>
                                        handleFilterChange(opt.value)
                                    }
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                                        isActive
                                            ? "bg-accent text-white shadow-sm"
                                            : "text-text-secondary hover:text-text-primary hover:bg-bg-primary"
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {isRateLimited ? (
                    <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-accent/10 border border-accent/20">
                        <svg
                            className="w-4 h-4 text-accent shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                            />
                        </svg>
                        <p className="text-xs text-text-secondary">{error}</p>
                    </div>
                ) : (
                    <p className="text-sm text-text-secondary mt-2">
                        {results.length > 0
                            ? `Found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}"`
                            : error
                              ? `Search failed: ${error}`
                              : `No results for "${query}"`}
                        {sourceFilter !== "all" &&
                            ` in ${sourceFilter === "blog" ? "blog posts" : "news"}`}
                    </p>
                )}
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
        ? `/news/${result.slug}`
        : `/blog/${result.slug}${result.heading ? `#${result.heading.toLowerCase().replace(/\s+/g, "-")}` : ""}`;

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
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
                                : "bg-accent/20 text-accent"
                        }`}
                    >
                        {isBlog ? (
                            <>
                                <svg
                                    className="w-3.5 h-3.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    />
                                </svg>
                                Blog
                            </>
                        ) : (
                            <>
                                <svg
                                    className="w-3.5 h-3.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 8h6v4H7V8z"
                                    />
                                </svg>
                                News
                            </>
                        )}
                    </span>
                    {result.type === "overview" && (
                        <span className="text-[10px] text-text-muted">
                            (overview match)
                        </span>
                    )}
                    {result.score && (
                        <span className="text-[10px] font-mono text-accent/70">
                            {(result.score * 100).toFixed(0)}%
                        </span>
                    )}
                    <span className="text-[10px] text-text-muted ml-1.5">
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
