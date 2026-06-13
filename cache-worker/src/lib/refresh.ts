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
} from "./sources";
import type { Env } from "../types";

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
        await env.BUCKET.put(
            "cache/github-repos.json",
            JSON.stringify(repos),
        );
        return `${repos.length} repos`;
    });

    await runStep(results, "articles-index", async () => {
        const posts = await buildArticleIndex(env.BUCKET);
        // Keep R2 cache for backward compatibility
        await env.BUCKET.put(
            "cache/articles-index.json",
            JSON.stringify(posts),
        );
        // Sync to D1
        const db = env.DB;
        for (const post of posts) {
            await db.prepare(`
                INSERT OR REPLACE INTO posts
                    (id, slug, title, excerpt, content_r2_key,
                     cover_image, category, tags, status, published_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
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
            ).run();
        }
        return `${posts.length} posts`;
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
        const existing = await db.prepare(
            "SELECT date FROM news_fetch_log WHERE date = ?",
        ).bind(today).first();
        if (!existing) {
            for (const story of stories) {
                await db.prepare(`
                    INSERT OR REPLACE INTO news_items
                        (id, title, url, score, by, time, descendants, domain, summary)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    story.id,
                    story.title,
                    story.url,
                    story.score,
                    story.by,
                    story.time,
                    story.descendants,
                    story.domain,
                    "",
                ).run();
            }
            await db.prepare(
                "INSERT INTO news_fetch_log (date, count) VALUES (?, ?)",
            ).bind(today, stories.length).run();
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
