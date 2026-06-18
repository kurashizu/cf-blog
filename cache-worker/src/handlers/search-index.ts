/**
 * search-index — 3-min cron handler for semantic search indexing.
 *
 * Each tick:
 *  1. Process one dirty blog post (chunk → embed → upsert → mark clean)
 *  2. If none, process one dirty news item
 *  3. If none, idle (nothing to index)
 */

import { chunkItem } from "../lib/chunker";
import type { IndexableItem } from "../lib/chunker";
import { embedBatch, buildVectors } from "../lib/embeddings";
import type { Env } from "../types";

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

    // ── Step 3: Nothing dirty ──
    return { ok: true, detail: "nothing dirty" };
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
