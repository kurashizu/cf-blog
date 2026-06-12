import { parseFrontmatter } from "./frontmatter";
import { r2Paths } from "./r2-paths";
import { r2Get, r2List, r2Put, r2Delete } from "./r2";

export interface Post {
    slug: string;
    title: string;
    date: string;
    description: string;
    tags: string[];
    published: boolean;
    coverImage?: string;
    author: string;
    draft: boolean;
    content: string;
}

export type PostListItem = Omit<Post, "content">;

/** Normalise a date value from gray-matter to a YYYY-MM-DD string.
 *  gray-matter parses YAML dates like `2025-01-15` into Date objects;
 *  the bare `as string` cast in parsePost / parsePostMeta doesn't
 *  actually convert the runtime value, so JSON.stringify would serialise
 *  it as an ISO timestamp ("2025-01-15T00:00:00.000Z").
 */
function normaliseDate(v: unknown): string {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string") return v;
    return "";
}

/** Normalise a boolean-like value from YAML (which may be a real bool
 *  or a string like "true" / "false").
 */
function normaliseBool(v: unknown, defaultVal: boolean): boolean {
    if (v === undefined || v === null) return defaultVal;
    if (v === true || v === false) return v;
    if (v === "true") return true;
    if (v === "false") return false;
    return defaultVal;
}

function parsePost(slug: string, content: string, key?: string): Post {
    const { data, body } = parseFrontmatter(content);
    const postSlug = key ? r2Paths.extractSlug(key) : slug;
    const tagsValue = data.tags;
    const tags: string[] = Array.isArray(tagsValue)
        ? tagsValue.filter((t): t is string => typeof t === "string")
        : typeof tagsValue === "string"
          ? tagsValue
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
          : [];
    return {
        slug: postSlug,
        title: (data.title as string) || "",
        date: normaliseDate(data.date),
        description: (data.description as string) || "",
        tags,
        published: normaliseBool(data.published, true),
        coverImage: data.coverImage as string | undefined,
        author: (data.author as string) || "Kurashizu",
        draft: normaliseBool(data.draft, false),
        content: body,
    };
}

function parsePostMeta(content: string, key: string): PostListItem | null {
    const { data } = parseFrontmatter(content);
    const slug = r2Paths.extractSlug(key);
    const tagsValue = data.tags;
    const tags: string[] = Array.isArray(tagsValue)
        ? tagsValue.filter((t): t is string => typeof t === "string")
        : typeof tagsValue === "string"
          ? tagsValue
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
          : [];
    const post = {
        slug,
        title: (data.title as string) || "",
        date: normaliseDate(data.date),
        description: (data.description as string) || "",
        tags,
        published: normaliseBool(data.published, true),
        coverImage: data.coverImage as string | undefined,
        author: (data.author as string) || "Kurashizu",
        draft: normaliseBool(data.draft, false),
    };
    if (post.draft || !post.published) return null;
    return post;
}

export async function buildArticleIndex(): Promise<PostListItem[]> {
    const keys = await r2List(r2Paths.articlesPrefix);
    const posts: PostListItem[] = [];

    for (const key of keys) {
        if (!key.endsWith(".md")) continue;
        try {
            const content = await r2Get(key);
            const meta = parsePostMeta(content, key);
            if (meta) posts.push(meta);
        } catch {
            continue;
        }
    }

    posts.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    await r2Put(r2Paths.articlesIndexCache, JSON.stringify(posts));
    return posts;
}

export function createArticlesRepo() {
    return {
        async getBySlug(slug: string): Promise<Post | null> {
            try {
                const key = r2Paths.article(slug);
                const content = await r2Get(key);
                return parsePost(slug, content, key);
            } catch {
                return null;
            }
        },

        async getAll(): Promise<PostListItem[]> {
            try {
                const cached = await r2Get(r2Paths.articlesIndexCache);
                if (cached) {
                    const parsed = JSON.parse(cached) as PostListItem[];
                    if (parsed.length > 0) {
                        buildArticleIndex().catch((e) =>
                            console.error(
                                "Background index rebuild failed:",
                                e,
                            ),
                        );
                        return parsed;
                    }
                }
            } catch {
                // cache miss
            }
            return buildArticleIndex();
        },

        async getRecent(limit: number = 5): Promise<PostListItem[]> {
            const posts = await this.getAll();
            return posts.slice(0, limit);
        },

        async save(slug: string, content: string): Promise<void> {
            const key = r2Paths.article(slug);
            await r2Put(key, content);
            try {
                await r2Delete(r2Paths.articlesIndexCache);
            } catch {
                /* ignore */
            }
        },

        async delete(slug: string): Promise<void> {
            const key = r2Paths.article(slug);
            await r2Delete(key);
            try {
                await r2Delete(r2Paths.articlesIndexCache);
            } catch {
                /* ignore */
            }
        },
    };
}
