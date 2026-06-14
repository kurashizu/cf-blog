import type { Tool } from "./index";

const ARTICLE_API = "https://blog.022025.xyz/api/articles";

export const blogReadTool: Tool = {
    name: "blog_read",
    description:
        "Read the Markdown content of a blog article by its slug. " +
        "Returns a chunk starting at `offset` with up to `maxLength` characters. " +
        "If `has_more` is true, call again with `next_offset` to get the next chunk. " +
        "Use this after blog_search returns a relevant result.",
    example: JSON.stringify({
        slug: "understanding-rust-async",
        offset: 0,
        maxLength: 16000,
    }),
    parameters: {
        type: "object",
        properties: {
            slug: {
                type: "string",
                description:
                    "The article slug (e.g. 'understanding-rust-async'). Extract it from the blog_search result url.",
            },
            offset: {
                type: "number",
                description:
                    "Character offset to start reading from (default 0). Set to the response's `next_offset` to continue reading.",
                default: 0,
            },
            maxLength: {
                type: "number",
                description:
                    "Maximum characters to return (1000-64000, default 16000). Use a smaller value for a quick summary, larger for full content.",
                default: 16000,
            },
        },
        required: ["slug"],
    },
    execute: async ({ slug, offset, maxLength }) => {
        const s = String(slug ?? "").trim();
        if (!s) {
            return { success: false, error: "Slug is required" };
        }

        const off = Math.max(0, Number(offset) || 0);
        const len = Math.min(Math.max(Number(maxLength) || 16000, 1000), 64000);
        const url = `${ARTICLE_API}/${encodeURIComponent(s)}?offset=${off}&maxLength=${len}`;

        try {
            const resp = await fetch(url, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(10_000),
            });

            if (resp.status === 404) {
                return {
                    success: false,
                    error: `Article "${s}" not found.`,
                };
            }

            if (!resp.ok) {
                const body = await resp.text().catch(() => "");
                return {
                    success: false,
                    error: `Article API ${resp.status}: ${body}`,
                };
            }

            const data = (await resp.json()) as {
                title: string;
                slug: string;
                description: string;
                tags: string[];
                published_at: string;
                content: string;
                offset: number;
                max_length: number;
                total_length: number;
                has_more: boolean;
                next_offset?: number;
            };

            return {
                success: true,
                result: {
                    title: data.title,
                    slug: data.slug,
                    description: data.description,
                    tags: data.tags,
                    published_at: data.published_at,
                    content: data.content,
                    offset: data.offset,
                    max_length: data.max_length,
                    total_length: data.total_length,
                    has_more: data.has_more,
                    next_offset: data.next_offset,
                },
            };
        } catch (e) {
            return {
                success: false,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    },
};
