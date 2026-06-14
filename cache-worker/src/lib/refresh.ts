/**
 * refreshCache — orchestrates a full cache refresh.
 *
 * Every upstream is tried independently so a single failure doesn't take
 * down the others. Results are accumulated as `OK / FAILED / SKIPPED` lines
 * suitable for log scraping. The same orchestrator is used by the cron
 * trigger and the manual POST /__refresh endpoint.
 */
import { buildArticleIndex } from "./articles";
import {
    fetchContributions,
    fetchGithubRepos,
    fetchHNNews,
    fetchLLMLeaderboard,
    fetchRepoLanguages,
} from "./sources";
import type { Env } from "../types";

/** SHA-256 hex digest using the Web Crypto API (available in Workers). */
async function sha256Hex(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RefreshResult {
    line: string;
    ok: boolean;
    skipped?: boolean;
}

export async function refreshCache(env: Env): Promise<RefreshResult[]> {
    const results: RefreshResult[] = [];

    // Each step is its own try/catch so one failure doesn't poison the rest.
    await runStep(results, "github-repos", async () => {
        const repos = await fetchGithubRepos();
        if (repos.length === 0) throw new Error("empty response");

        const fetchedAt = new Date().toISOString();
        const stmt = env.DB.prepare(
            `INSERT OR REPLACE INTO github_repos
                (id, name, full_name, owner_login, description, html_url,
                 homepage, language, topics, languages_json, stargazers_count,
                 forks_count, open_issues_count, fork, archived, disabled,
                 license_spdx_id, size, pushed_at, created_at, updated_at,
                 fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        for (const repo of repos) {
            // Fetch per-repo language breakdown
            let languagesJson = "[]";
            try {
                const langs = await fetchRepoLanguages(repo.full_name);
                const total = langs.reduce((s, l) => s + l.bytes, 0);
                const top3 = langs.slice(0, 3).map((l) => ({
                    name: l.name,
                    pct: Math.round((l.bytes / total) * 100),
                }));
                languagesJson = JSON.stringify(top3);
            } catch {
                // Non-fatal: leave as empty array
            }

            await stmt
                .bind(
                    repo.id,
                    repo.name,
                    repo.full_name,
                    repo.owner.login,
                    repo.description ?? null,
                    repo.html_url,
                    repo.homepage ?? "",
                    repo.language ?? null,
                    JSON.stringify(repo.topics ?? []),
                    languagesJson,
                    repo.stargazers_count,
                    repo.forks_count,
                    repo.open_issues_count,
                    repo.fork ? 1 : 0,
                    repo.archived ? 1 : 0,
                    repo.disabled ? 1 : 0,
                    repo.license?.spdx_id ?? null,
                    repo.size,
                    repo.pushed_at,
                    repo.created_at,
                    repo.updated_at,
                    fetchedAt,
                )
                .run();
        }

        return `${repos.length} repos`;
    });

    await runStep(results, "articles-index", async () => {
        const posts = await buildArticleIndex(env.BUCKET);
        // Sync to D1 with content-hash tracking for search index
        const db = env.DB;
        let changed = 0;
        for (const post of posts) {
            // Compute content hash from title + excerpt + body preview
            let bodyPreview = "";
            try {
                const obj = await env.BUCKET.get(`articles/${post.slug}.md`);
                if (obj) {
                    const content = await obj.text();
                    // Strip frontmatter, take first 500 chars of body
                    const body = content.replace(/^---[\s\S]*?\n---\n/, "");
                    bodyPreview = body.slice(0, 500);
                }
            } catch {
                /* best-effort */
            }
            const newHash = await sha256Hex(
                `${post.title}|${post.description}|${bodyPreview}`,
            );

            // Upsert with conditional dirty-marking
            await db
                .prepare(
                    `
                INSERT INTO posts
                    (id, slug, title, excerpt, content_r2_key,
                     cover_image, category, tags, status, published_at,
                     content_hash, search_updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    slug = excluded.slug,
                    title = excluded.title,
                    excerpt = excluded.excerpt,
                    content_r2_key = excluded.content_r2_key,
                    cover_image = excluded.cover_image,
                    category = excluded.category,
                    tags = excluded.tags,
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
                    post.slug,
                    post.slug,
                    post.title,
                    post.description,
                    `articles/${post.slug}.md`,
                    post.coverImage ?? "",
                    "",
                    JSON.stringify(post.tags),
                    "published",
                    post.date,
                    newHash,
                    null, // search_updated_at: null for insert, CASE handles update
                )
                .run();
            changed++;
        }
        return `${posts.length} posts (${changed} upserted)`;
    });

    await runStep(results, "llm-leaderboard", async () => {
        if (!env.ARTIFICIAL_ANALYSIS_API_KEY) {
            throw new Error("ARTIFICIAL_ANALYSIS_API_KEY not set");
        }
        const models = await fetchLLMLeaderboard(
            env.ARTIFICIAL_ANALYSIS_API_KEY,
        );
        if (models.length === 0) throw new Error("empty response");
        // Wrap with fetchedAt so the client can show "last update: 5 min ago"
        // without an extra R2 round-trip. Old bare-array caches are still
        // readable (see /api/llm-leaderboard) until the next refresh.
        const payload = {
            fetchedAt: new Date().toISOString(),
            models,
        };
        await env.BUCKET.put(
            "cache/llm-leaderboard.json",
            JSON.stringify(payload),
        );
        return `${models.length} models`;
    });

    await runStep(results, "hn-news", async () => {
        const stories = await fetchHNNews();
        if (stories.length === 0) throw new Error("empty response");

        // Write to R2 for homepage backward compatibility
        await env.BUCKET.put("cache/hn-news.json", JSON.stringify(stories));

        // Write to D1 — skip if already fetched today
        const today = new Date().toISOString().slice(0, 10);
        const db = env.DB;
        const existing = await db
            .prepare("SELECT date FROM news_fetch_log WHERE date = ?")
            .bind(today)
            .first();
        if (!existing) {
            for (const story of stories) {
                await db
                    .prepare(
                        `
                    INSERT OR REPLACE INTO news_items
                        (id, title, url, score, by, time, descendants, domain, summary)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                    )
                    .bind(
                        story.id,
                        story.title,
                        story.url,
                        story.score,
                        story.by,
                        story.time,
                        story.descendants,
                        story.domain,
                        "",
                    )
                    .run();
            }
            await db
                .prepare(
                    "INSERT INTO news_fetch_log (date, count) VALUES (?, ?)",
                )
                .bind(today, stories.length)
                .run();
            return `${stories.length} stories (fresh)`;
        }
        return `${stories.length} stories (cached)`;
    });

    await runStep(results, "github-contributions", async () => {
        if (!env.GITHUB_PERSONAL_ACCESS_TOKEN) {
            throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN not set");
        }
        if (!env.GH_USERNAME) {
            throw new Error("GH_USERNAME not set");
        }
        const data = await fetchContributions(
            env.GITHUB_PERSONAL_ACCESS_TOKEN,
            env.GH_USERNAME,
        );
        await env.BUCKET.put(
            "cache/github-contributions.json",
            JSON.stringify(data),
        );
        return `${data.days.length} days, ${data.totalContributions} total`;
    });

    return results;
}

async function runStep(
    out: RefreshResult[],
    name: string,
    step: () => Promise<string>,
): Promise<void> {
    try {
        const detail = await step();
        out.push({ line: `${name}: OK (${detail})`, ok: true });
    } catch (e) {
        out.push({
            line: `${name}: FAILED (${e instanceof Error ? e.message : String(e)})`,
            ok: false,
        });
    }
}
