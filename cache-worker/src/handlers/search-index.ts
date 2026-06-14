/**
 * search-index — 3-min cron handler for indexing + cleanup.
 *
 * Each tick:
 *  1. Process one dirty blog post (chunk → embed → upsert → mark clean)
 *  2. If none, process one dirty news item
 *  3. If none, run cleanup (compare expected vs actual vector IDs)
 */

import { chunkItem, chunkVectorId } from "../lib/chunker";
import type { IndexableItem, Chunk } from "../lib/chunker";
import { embedBatch, buildVectors } from "../lib/embeddings";
import type { Env } from "../types";

const SEARCH_VECTORS_R2_KEY = "cache/search-vectors.json";

export interface SearchIndexResult {
    ok: boolean;
    detail: string;
}

export async function handleSearchIndexing(
    env: Env,
): Promise<SearchIndexResult> {
    if (!env.GEMINI_API_KEY) {
        return { ok: false, detail: "GEMINI_API_KEY not set" };
    }

    // ── Step 1: Try a dirty blog post ──
    const dirtyPost = await env.DB.prepare(
        `SELECT id, slug, title, excerpt, content, tags, published_at
         FROM posts
         WHERE status = 'published'
           AND search_updated_at IS NULL
         ORDER BY published_at ASC
         LIMIT 1`,
    ).first<{
        id: string;
        slug: string;
        title: string;
        excerpt: string;
        content: string;
        tags: string;
        published_at: string | null;
    }>();

    if (dirtyPost) {
        return indexBlogPost(dirtyPost, env);
    }

    // ── Step 2: Try a dirty news item ──
    const dirtyNews = await env.DB.prepare(
        `SELECT id, title, url, by, summary, time
         FROM news_items
         WHERE summary != ''
           AND search_updated_at IS NULL
         ORDER BY time ASC
         LIMIT 1`,
    ).first<{
        id: number;
        title: string;
        url: string | null;
        by: string;
        summary: string;
        time: number;
    }>();

    if (dirtyNews) {
        return indexNewsItem(dirtyNews, env);
    }

    // ── Step 3: Nothing dirty → cleanup ──
    return cleanupSearchIndex(env);
}

// ── Blog indexing ──

interface DirtyPostRow {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    content: string;
    tags: string;
    published_at: string | null;
}

async function indexBlogPost(
    row: DirtyPostRow,
    env: Env,
): Promise<SearchIndexResult> {
    const tags: string[] = parseTags(row.tags);

    if (!row.content) {
        // No content, mark as indexed so we don't retry
        await markClean(env, "posts", row.slug);
        return {
            ok: true,
            detail: `${row.slug}: content empty, skipped`,
        };
    }

    const item: IndexableItem = {
        source: "blog",
        id: row.slug,
        title: row.title,
        content: row.content,
        description: row.excerpt,
        tags,
        published_at: row.published_at ?? "",
    };

    return indexItem(item, env, "posts", row.slug);
}

// ── News indexing ──

interface DirtyNewsRow {
    id: number;
    title: string;
    url: string | null;
    by: string;
    summary: string;
    time: number;
}

async function indexNewsItem(
    row: DirtyNewsRow,
    env: Env,
): Promise<SearchIndexResult> {
    const id = String(row.id);
    const content = `## ${row.title}\n${row.summary}`;

    const item: IndexableItem = {
        source: "news",
        id,
        title: row.title,
        content,
        url: row.url ?? "",
        by: row.by ?? "",
        published_at: new Date(row.time * 1000).toISOString().slice(0, 10),
    };

    return indexItem(item, env, "news_items", id);
}

// ── Shared indexing ──

async function indexItem(
    item: IndexableItem,
    env: Env,
    table: string,
    idField: string,
): Promise<SearchIndexResult> {
    try {
        const chunks = chunkItem(item);
        if (chunks.length === 0) {
            await markClean(env, table, idField);
            return { ok: true, detail: `${idField}: 0 chunks, skipped` };
        }

        const texts = chunks.map((c) => c.text);
        const embeddings = await embedBatch(texts, env.GEMINI_API_KEY!);
        const vectors = buildVectors(chunks, embeddings);

        await env.SEARCH_INDEX.upsert(vectors);
        await markClean(env, table, idField);

        return {
            ok: true,
            detail: `${idField}: ${vectors.length} vectors indexed`,
        };
    } catch (e) {
        return {
            ok: false,
            detail: `${idField}: failed - ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}

// ── Cleanup ──

async function cleanupSearchIndex(env: Env): Promise<SearchIndexResult> {
    try {
        // 1. Read old vector ID list from R2
        let oldIds: string[] = [];
        try {
            const obj = await env.BUCKET.get(SEARCH_VECTORS_R2_KEY);
            if (obj) {
                oldIds = JSON.parse(await obj.text()) as string[];
            }
        } catch {
            // File missing → first run, nothing to clean
        }
        if (oldIds.length === 0) {
            return { ok: true, detail: "cleanup: no old vectors, skipping" };
        }

        // 2. Build expected vector ID set
        const expectedIds = new Set<string>();

        // Blog posts
        const posts = await env.DB.prepare(
            `SELECT slug, title, excerpt, content, tags, published_at
             FROM posts WHERE status = 'published'`,
        ).all<{
            slug: string;
            title: string;
            excerpt: string;
            content: string;
            tags: string;
            published_at: string | null;
        }>();

        for (const post of posts.results ?? []) {
            if (!post.content) continue;
            const item: IndexableItem = {
                source: "blog",
                id: post.slug,
                title: post.title,
                content: post.content,
                description: post.excerpt,
                tags: parseTags(post.tags),
                published_at: post.published_at ?? "",
            };
            const chunks = chunkItem(item);
            for (const c of chunks) {
                expectedIds.add(chunkVectorId(c));
            }
        }

        // News items
        const newsItems = await env.DB.prepare(
            `SELECT id, title, url, by, summary, time
             FROM news_items WHERE summary != ''`,
        ).all<{
            id: number;
            title: string;
            url: string | null;
            by: string;
            summary: string;
            time: number;
        }>();

        for (const news of newsItems.results ?? []) {
            const item: IndexableItem = {
                source: "news",
                id: String(news.id),
                title: news.title,
                content: `## ${news.title}\n${news.summary}`,
                url: news.url ?? "",
                by: news.by ?? "",
                published_at: new Date(news.time * 1000)
                    .toISOString()
                    .slice(0, 10),
            };
            const chunks = chunkItem(item);
            for (const c of chunks) {
                expectedIds.add(chunkVectorId(c));
            }
        }

        // 3. Compute deleted
        const deleteSet = oldIds.filter((id) => !expectedIds.has(id));
        if (deleteSet.length === 0) {
            return { ok: true, detail: "cleanup: nothing to delete" };
        }

        // 4. Delete stale vectors
        // Vectorize deleteByIds accepts up to 100 IDs at once; batch if needed
        const BATCH = 100;
        for (let i = 0; i < deleteSet.length; i += BATCH) {
            const batch = deleteSet.slice(i, i + BATCH);
            await env.SEARCH_INDEX.deleteByIds(batch);
        }

        // 5. Write updated ID list
        const newIds = [...expectedIds];
        await env.BUCKET.put(SEARCH_VECTORS_R2_KEY, JSON.stringify(newIds));

        return {
            ok: true,
            detail: `cleanup: ${deleteSet.length} stale vectors deleted`,
        };
    } catch (e) {
        return {
            ok: false,
            detail: `cleanup failed: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}

// ── Helpers ──

async function markClean(
    env: Env,
    table: string,
    idField: string,
): Promise<void> {
    const column = table === "news_items" ? "id" : "slug";
    await env.DB.prepare(
        `UPDATE ${table} SET search_updated_at = datetime('now') WHERE ${column} = ?`,
    )
        .bind(idField)
        .run();
}

function parseTags(tags: string | string[]): string[] {
    if (Array.isArray(tags)) return tags;
    try {
        const parsed = JSON.parse(tags);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return typeof tags === "string" && tags
            ? tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
            : [];
    }
}
