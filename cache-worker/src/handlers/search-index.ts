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
import { recordAudit, extractErrorCode, extractErrorMessage } from "../lib/audit";
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
         ORDER BY length(content) ASC, published_at ASC
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
    // - ORDER BY length(summary) ASC: small news first (cheap, unlikely to
    //   blow the per-item chunk limit), so a single oversized item can't
    //   block the queue.
    // - retry_count < MAX_RETRIES: give up after N consecutive failures
    //   instead of retrying the same item forever. Otherwise a transient
    //   429 / oversized summary can stall the entire dirty backlog.
    const MAX_NEWS_RETRIES = 5;
    const dirtyNews = await env.DB.prepare(
        `SELECT id, title, url, by, summary, time, retry_count
         FROM news_items
         WHERE summary != ''
           AND search_updated_at IS NULL
           AND retry_count < ?
         ORDER BY length(summary) ASC, time ASC
         LIMIT 1`,
    )
        .bind(MAX_NEWS_RETRIES)
        .first<{
        id: number;
        title: string;
        url: string | null;
        by: string;
        summary: string;
        time: number;
        retry_count: number;
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
    retry_count: number;
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

    return indexItem(item, env, "news_items", id, row.retry_count);
}

// ── Shared indexing ──

async function indexItem(
    item: IndexableItem,
    env: Env,
    table: string,
    idField: string,
    retryCount: number = 0,
): Promise<SearchIndexResult> {
    const start = Date.now();
    try {
        const { chunks, truncated, totalBeforeTruncation } = chunkItem(item);
        if (truncated) {
            // Audit the oversize so we can see which items routinely blow
            // the per-item chunk budget. The truncation itself is silent
            // for search users; they just get fewer vectors per item.
            await recordAudit(env, {
                category: "embedding",
                operation: "truncate",
                target: `${item.source}:${idField}`,
                status: "ok",
                metadata: {
                    source: "cache-worker",
                    kept: chunks.length,
                    total: totalBeforeTruncation,
                },
            });
        }
        if (chunks.length === 0) {
            await markClean(env, table, idField);
            await recordAudit(env, {
                category: "embedding",
                operation: "batch_embed",
                target: `${item.source}:${idField}`,
                status: "skipped",
                latencyMs: Date.now() - start,
                metadata: { source: "cache-worker", reason: "0 chunks" },
            });
            return { ok: true, detail: `${idField}: 0 chunks, skipped` };
        }

        const texts = chunks.map((c) => c.text);

        // ── Gemini Embedding API call ──
        let inputTokens = 0;
        try {
            const embedResult = await embedBatch(texts, env.GEMINI_API_KEY!);
            inputTokens = embedResult.inputTokens;
            await recordAudit(env, {
                category: "embedding",
                operation: "batch_embed",
                target: `${item.source}:${idField}`,
                status: "ok",
                latencyMs: Date.now() - start,
                requestCount: texts.length,
                inputTokens,
                metadata: { source: "cache-worker", model: "gemini-embedding-2" },
            });
            const vectors = buildVectors(chunks, embedResult.vectors);

            // ── Vectorize upsert ──
            const upsertStart = Date.now();
            try {
                await env.SEARCH_INDEX.upsert(vectors);
                await recordAudit(env, {
                    category: "vectorize",
                    operation: "upsert",
                    target: `${item.source}:${idField}`,
                    status: "ok",
                    latencyMs: Date.now() - upsertStart,
                    requestCount: vectors.length,
                    metadata: { source: "cache-worker" },
                });
            } catch (e) {
                await recordAudit(env, {
                    category: "vectorize",
                    operation: "upsert",
                    target: `${item.source}:${idField}`,
                    status: "failed",
                    latencyMs: Date.now() - upsertStart,
                    requestCount: vectors.length,
                    errorCode: extractErrorCode(e),
                    errorMessage: extractErrorMessage(e),
                    metadata: { source: "cache-worker" },
                });
                throw e;
            }

            await markClean(env, table, idField);

            return {
                ok: true,
                detail: `${idField}: ${vectors.length} vectors indexed`,
            };
        } catch (embedErr) {
            // embedBatch threw — log audit row, then rethrow so outer
            // catch marks the whole indexItem as failed.
            await recordAudit(env, {
                category: "embedding",
                operation: "batch_embed",
                target: `${item.source}:${idField}`,
                status: "failed",
                latencyMs: Date.now() - start,
                requestCount: texts.length,
                errorCode: extractErrorCode(embedErr),
                errorMessage: extractErrorMessage(embedErr),
                metadata: { source: "cache-worker", model: "gemini-embedding-2" },
            });
            throw embedErr;
        }
    } catch (e) {
        // Track failed retries so the same item doesn't block the queue
        // forever. After MAX_NEWS_RETRIES the SQL filter will skip it
        // entirely, and we still record an audit row.
        //
        // Quota errors (429 / RESOURCE_EXHAUSTED) are NOT counted toward
        // the retry budget — they're an external resource issue that
        // resolves when the daily Gemini quota resets, not a problem with
        // the item itself. We still bump last_failed_at so we know when
        // it last failed, but retry_count stays at 0 so the item gets
        // retried as soon as quota is available again.
        if (table === "news_items") {
            await bumpRetry(env, idField, retryCount, e);
        }
        console.error(
            `search-index failed for ${item.source}:${idField}:`,
            e instanceof Error ? e.message : String(e),
        );
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
    // Reset retry tracking on success — if this item later gets re-dirtied
    // (e.g. summary regenerated), it gets a fresh budget.
    if (table === "news_items") {
        await env.DB.prepare(
            `UPDATE news_items
             SET search_updated_at = datetime('now'),
                 retry_count = 0,
                 last_failed_at = NULL
             WHERE id = ?`,
        )
            .bind(idField)
            .run();
    } else {
        await env.DB.prepare(
            `UPDATE ${table} SET search_updated_at = datetime('now') WHERE ${column} = ?`,
        )
            .bind(idField)
            .run();
    }
}

async function bumpRetry(
    env: Env,
    idField: string,
    currentRetryCount: number,
    error: unknown,
): Promise<void> {
    const errCode = extractErrorCode(error);
    const isQuotaError =
        errCode === "429" ||
        errCode === "RESOURCE_EXHAUSTED" ||
        errCode === "8"; // 8 = RESOURCE_EXHAUSTED gRPC code, just in case
    if (isQuotaError) {
        // Quota issue — don't count toward retry budget; just record the
        // last failure time so we can see when the item last hit 429.
        // The item will be retried normally as soon as the daily quota
        // resets, so we MUST NOT mark it as exhausted.
        await env.DB.prepare(
            `UPDATE news_items
             SET last_failed_at = datetime('now')
             WHERE id = ?`,
        )
            .bind(idField)
            .run();
        return;
    }
    const next = currentRetryCount + 1;
    await env.DB.prepare(
        `UPDATE news_items
         SET retry_count = ?, last_failed_at = datetime('now')
         WHERE id = ?`,
    )
        .bind(next, idField)
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
