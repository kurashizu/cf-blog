/**
 * YAML frontmatter parser/builder — thin wrapper around gray-matter.
 *
 * Handles all YAML edge cases (empty values, inline arrays, quoted strings,
 * nested objects) that the previous hand-rolled parser mis-handled.
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
        // Graceful degradation: treat unparseable input as plain content.
        return { data: {}, body: content };
    }
}

export function buildFrontmatter(data: Record<string, unknown>): string {
    // matter.stringify('', data) returns "---\n<yaml>\n---\n".
    // Strip trailing newlines to match the legacy format the blog content expects.
    return matter.stringify("", data).replace(/\n+$/, "");
}
