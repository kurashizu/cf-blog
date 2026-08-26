import { parseFrontmatter } from "./frontmatter";
import { getDB } from "./d1";

export interface Post {
    slug: string;
    title: string;
    date: string;
    description: string;
    tags: string[];
    category: string;
    published: boolean;
    coverImage?: string;
    externalUrl?: string;
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

/**
 * Read the `tags` column defensively. It's free-form TEXT, so it can hold
 * invalid JSON or valid-but-non-array JSON ("null", "{}"); either used to
 * throw and, because the callers swallow errors, silently empty the whole
 * post list.
 */
function parseTagsColumn(value: unknown): string[] {
    if (Array.isArray(value)) return value as string[];
    if (typeof value !== "string") return [];
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
        return [];
    }
}

/** Queries alias `published_at AS date`; raw `SELECT *` doesn't. Accept both. */
function rowDate(row: Record<string, unknown>): string {
    return (row.date as string) || (row.published_at as string) || "";
}

function rowToPostListItem(row: Record<string, unknown>): PostListItem {
    return {
        slug: row.slug as string,
        title: (row.title as string) || "",
        date: rowDate(row),
        description: (row.excerpt as string) ?? (row.description as string) ?? "",
        tags: parseTagsColumn(row.tags),
        category: (row.category as string) || "",
        published: (row.status as string) === "published",
        coverImage: (row.cover_image as string) || undefined,
        externalUrl: (row.external_url as string) || undefined,
        author: (row.author as string) || "Kurashizu",
        draft: (row.status as string) === "draft",
    };
}

function rowToPost(row: Record<string, unknown>): Post {
    return {
        ...rowToPostListItem(row),
        content: (row.content as string) || "",
    };
}

/**
 * Resolve the stored `status` column from frontmatter.
 *
 * The same fact arrives under two names: `draft` (used by the publishing
 * script) and `published` (used by the admin editor's checkbox). Only
 * `draft` used to be read, so toggling Publish in the editor did nothing.
 * `published` wins when present, since it's the explicit UI control.
 */
function resolveStatus(data: Record<string, unknown>): "draft" | "published" {
    if (data.published !== undefined) {
        return normaliseBool(data.published, true) ? "published" : "draft";
    }
    return normaliseBool(data.draft, false) ? "draft" : "published";
}

/** SHA-256 hex digest using the Web Crypto API. */
async function sha256Hex(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
                            cover_image, external_url, tags, status,
                            published_at as date, author
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

            // Compute content hash from title + description + first 500 body chars
            const bodyPreview = body.slice(0, 500);
            const contentHash = await sha256Hex(
                `${(data.title as string) || ""}|${(data.description as string) || ""}|${bodyPreview}`,
            );

            await db
                .prepare(
                    `
                INSERT INTO posts
                    (id, slug, title, excerpt, content,
                     cover_image, external_url, category, tags, author, status,
                     published_at, content_hash, search_updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    slug = excluded.slug,
                    title = excluded.title,
                    excerpt = excluded.excerpt,
                    content = excluded.content,
                    cover_image = excluded.cover_image,
                    external_url = excluded.external_url,
                    category = excluded.category,
                    tags = excluded.tags,
                    author = excluded.author,
                    status = excluded.status,
                    published_at = excluded.published_at,
                    content_hash = excluded.content_hash,
                    search_updated_at = CASE
                        WHEN posts.content_hash IS NULL THEN NULL
                        WHEN posts.content_hash != excluded.content_hash THEN NULL
                        ELSE posts.search_updated_at
                    END
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
                    (data.externalUrl as string) ||
                        (data.external_url as string) ||
                        "",
                    (data.category as string) || "",
                    JSON.stringify(tags),
                    (data.author as string) || "Kurashizu",
                    resolveStatus(data),
                    normaliseDate(data.date) || null,
                    contentHash,
                    null,
                )
                .run();
        },

        async delete(slug: string): Promise<void> {
            await db.prepare("DELETE FROM posts WHERE id = ?").bind(slug).run();
        },
    };
}
