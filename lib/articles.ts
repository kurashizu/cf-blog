import { parseFrontmatter } from "./frontmatter";
import { getDB } from "./d1";

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

/** Normalise a date value from gray-matter to a YYYY-MM-DD string. */
function normaliseDate(v: unknown): string {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "string") return v;
    return "";
}

/** Normalise a boolean-like value from YAML. */
function normaliseBool(v: unknown, defaultVal: boolean): boolean {
    if (v === undefined || v === null) return defaultVal;
    if (v === true || v === false) return v;
    if (v === "true") return true;
    if (v === "false") return false;
    return defaultVal;
}

function parseTags(tagsValue: unknown): string[] {
    return Array.isArray(tagsValue)
        ? tagsValue.filter((t): t is string => typeof t === "string")
        : typeof tagsValue === "string"
          ? tagsValue
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
          : [];
}

function rowToPost(row: Record<string, unknown>): Post {
    const tags: string[] =
        typeof row.tags === "string"
            ? JSON.parse(row.tags as string)
            : (row.tags as string[]) || [];
    return {
        slug: row.slug as string,
        title: (row.title as string) || "",
        date: (row.published_at as string) || "",
        description: (row.excerpt as string) || "",
        tags,
        published: (row.status as string) === "published",
        coverImage: (row.cover_image as string) || undefined,
        author: (row.author as string) || "Kurashizu",
        draft: (row.status as string) === "draft",
        content: (row.content as string) || "",
    };
}

function rowToPostListItem(row: Record<string, unknown>): PostListItem {
    const tags: string[] =
        typeof row.tags === "string"
            ? JSON.parse(row.tags as string)
            : (row.tags as string[]) || [];
    return {
        slug: row.slug as string,
        title: (row.title as string) || "",
        date: (row.published_at as string) || "",
        description: (row.excerpt as string) || "",
        tags,
        published: (row.status as string) === "published",
        coverImage: (row.cover_image as string) || undefined,
        author: (row.author as string) || "Kurashizu",
        draft: (row.status as string) === "draft",
    };
}

export function createArticlesRepo() {
    const db = getDB();

    return {
        async getBySlug(slug: string): Promise<Post | null> {
            try {
                const row = await db
                    .prepare(`SELECT * FROM posts WHERE id = ?`)
                    .bind(slug)
                    .first<Record<string, unknown>>();
                if (!row) return null;
                return rowToPost(row);
            } catch {
                return null;
            }
        },

        async getAll(): Promise<PostListItem[]> {
            try {
                const rows = await db
                    .prepare(
                        `SELECT slug, title, excerpt as description,
                            cover_image, tags, status, published_at as date,
                            author
                     FROM posts
                     ORDER BY published_at DESC`,
                    )
                    .all<Record<string, unknown>>();
                return (rows.results ?? []).map(rowToPostListItem);
            } catch {
                return [];
            }
        },

        async getRecent(limit: number = 5): Promise<PostListItem[]> {
            const posts = await this.getAll();
            return posts.slice(0, limit);
        },

        async save(slug: string, fullContent: string): Promise<void> {
            const { data, body } = parseFrontmatter(fullContent);
            const tags = parseTags(data.tags);

            await db
                .prepare(
                    `
                INSERT OR REPLACE INTO posts
                    (id, slug, title, excerpt, content,
                     cover_image, category, tags, author, status, published_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
                )
                .bind(
                    slug,
                    slug,
                    (data.title as string) || "",
                    (data.description as string) || "",
                    body,
                    (data.coverImage as string) ||
                        (data.cover_image as string) ||
                        "",
                    (data.category as string) || "",
                    JSON.stringify(tags),
                    (data.author as string) || "Kurashizu",
                    normaliseBool(data.draft, false) ? "draft" : "published",
                    normaliseDate(data.date) || null,
                )
                .run();
        },

        async delete(slug: string): Promise<void> {
            await db.prepare("DELETE FROM posts WHERE id = ?").bind(slug).run();
        },
    };
}
