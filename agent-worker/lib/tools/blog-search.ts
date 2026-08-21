import type { Tool } from "./index";
import { BLOG_URL } from "../../../shared/site-config";

const BLOG_SEARCH_API = `${BLOG_URL}/api/search`;

interface SearchHit {
    title: string;
    source: "blog" | "news";
    score: number;
    slug: string;
    heading: string | null;
    excerpt: string;
    published_at: string;
    url: string | null;
    by: string | null;
    tags?: string[];
}

interface SearchResponse {
    results: SearchHit[];
    query: string;
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

export const blogSearchTool: Tool = {
    name: "blog_search",
    description:
        "Search kurashizu's blog articles and Hacker News archive using semantic search. " +
        "Returns results with relevance scores, source type (blog/news), and section headings. " +
        "Use this when asked about content from the blog, technical articles, or tech news.",
    example: JSON.stringify({
        q: "Rust async programming",
        topK: 5,
        source: "all",
    }),
    parameters: {
        type: "object",
        properties: {
            q: {
                type: "string",
                description: "The search query (natural language, not keywords)",
            },
            topK: {
                type: "number",
                description:
                    "Number of results to return (1-15, default 5). Use more when exploring a broad topic.",
                default: 5,
            },
            source: {
                type: "string",
                enum: ["all", "blog", "news"],
                description:
                    "Filter by content type: 'all' for everything, 'blog' for blog posts only, 'news' for HN news only.",
                default: "all",
            },
        },
        required: ["q"],
    },
    execute: async ({ q, topK, source }) => {
        const query = String(q ?? "").trim();
        if (!query) {
            return { success: false, error: "Query is required" };
        }

        const params = new URLSearchParams({ q: query });
        const k = Math.min(Math.max(Number(topK) || 5, 1), 15);
        params.set("topK", String(k));
        if (source && source !== "all") {
            params.set("source", String(source));
        }

        const url = `${BLOG_SEARCH_API}?${params.toString()}`;

        try {
            const resp = await fetch(url, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(10_000),
            });

            if (!resp.ok) {
                const body = await resp.text().catch(() => "");
                return {
                    success: false,
                    error: `Search API ${resp.status}: ${body}`,
                };
            }

            const data = (await resp.json()) as SearchResponse;

            if (!data.results || data.results.length === 0) {
                return {
                    success: true,
                    result: [],
                    message: `No results found for "${query}".`,
                };
            }

            const formatted = data.results.map((r) => ({
                title: r.title,
                type: r.source === "blog" ? "Blog" : "News",
                score: `${Math.round(r.score * 100)}%`,
                date: formatDate(r.published_at),
                section: r.heading || undefined,
                excerpt: r.excerpt || undefined,
                ...(r.source === "news" && r.by
                    ? { author: r.by }
                    : {}),
                ...(r.source === "news" && r.url
                    ? { original_url: r.url }
                    : {}),
                url: `${BLOG_URL}/${r.source === "blog" ? "blog" : "news"}/${r.slug}`,
            }));

            return { success: true, result: formatted };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    },
};
