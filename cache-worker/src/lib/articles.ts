/**
 * Article frontmatter parser.
 *
 * Uses gray-matter (same as cf-blog/lib/frontmatter.ts) so the cache-worker
 * reads the same frontmatter grammar as the editor. The previous hand-rolled
 * parser missed edge cases like nested objects, inline arrays, and quoted
 * multi-word values.
 */
import matter from "gray-matter";

export function parseFrontmatter(content: string): {
    data: Record<string, unknown>;
    body: string;
} {
    try {
        const parsed = matter(content);
        return {
            data: (parsed.data ?? {}) as Record<string, unknown>,
            body: parsed.content,
        };
    } catch {
        // Treat unparseable content as plain markdown.
        return { data: {}, body: content };
    }
}
