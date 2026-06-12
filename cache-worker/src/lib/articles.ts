/**
 * Article frontmatter + R2 article-index builder.
 *
 * Uses gray-matter (same as cf-blog/lib/frontmatter.ts) so the cache-worker
 * reads the same frontmatter grammar as the editor. The previous hand-rolled
 * parser missed edge cases like nested objects, inline arrays, and quoted
 * multi-word values.
 */
import matter from "gray-matter";
import type { PostListItem } from "../types";

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

export function parsePostMeta(
    content: string,
    key: string,
): PostListItem | null {
    const { data } = parseFrontmatter(content);
    const slug = key.replace("articles/", "").replace(".md", "");
    const tv = data.tags;
    const tags: string[] = Array.isArray(tv)
        ? tv.filter((t): t is string => typeof t === "string")
        : typeof tv === "string"
          ? tv
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
          : [];
    // gray-matter returns proper YAML types: dates become Date objects and
    // booleans are real booleans. The old hand-rolled parser always returned
    // strings, which silently hid `draft: true` and `published: false` posts.
    const rawDate = data.date;
    const date =
        rawDate instanceof Date
            ? rawDate.toISOString().slice(0, 10)
            : (rawDate as string) || "";
    const draft = data.draft === true || data.draft === "true";
    const published =
        data.published === undefined
            ? true
            : data.published === true || data.published === "true";
    const post: PostListItem = {
        slug,
        title: (data.title as string) || "",
        date,
        description: (data.description as string) || "",
        tags,
        published,
        coverImage: data.coverImage as string | undefined,
        author: (data.author as string) || "Kurashizu",
        draft,
    };
    if (post.draft || !post.published) return null;
    return post;
}

/** Walk all `articles/*.md` in R2 and build a sorted, public-friendly index. */
export async function buildArticleIndex(
    bucket: R2Bucket,
): Promise<PostListItem[]> {
    let cursor: string | undefined;
    const keys: string[] = [];
    do {
        const result = await bucket.list({ prefix: "articles/", cursor });
        keys.push(...result.objects.map((o) => o.key));
        cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);

    const posts: PostListItem[] = [];
    for (const key of keys) {
        if (!key.endsWith(".md")) continue;
        try {
            const obj = await bucket.get(key);
            if (!obj) continue;
            const meta = parsePostMeta(await obj.text(), key);
            if (meta) posts.push(meta);
        } catch {
            /* skip corrupt article */
        }
    }

    posts.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return posts;
}
