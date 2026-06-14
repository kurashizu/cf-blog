/**
 * refreshCache — orchestrates a full cache refresh.
 *
 * Every upstream is tried independently so a single failure doesn't take
 * down the others. Results are accumulated as `OK / FAILED / SKIPPED` lines
 * suitable for log scraping. The same orchestrator is used by the cron
 * trigger and the manual POST /__refresh endpoint.
 */
import { parseFrontmatter } from "./articles";
import {
    fetchContributions,
    fetchGithubRepos,
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
        // Scan ALL R2 articles (including drafts) and sync to D1
        const db = env.DB;
        let cursor: string | undefined;
        const keys: string[] = [];
        do {
            const result = await env.BUCKET.list({
                prefix: "articles/",
                cursor,
            });
            keys.push(...result.objects.map((o) => o.key));
            cursor = result.truncated ? result.cursor : undefined;
        } while (cursor);

        let upserted = 0;
        for (const key of keys) {
            if (!key.endsWith(".md")) continue;

            let fullContent: string;
            try {
                const obj = await env.BUCKET.get(key);
                if (!obj) continue;
                fullContent = await obj.text();
            } catch {
                continue;
            }

            const { data, body } = parseFrontmatter(fullContent);
            const slug = key.replace("articles/", "").replace(".md", "");

            // Normalise frontmatter fields
            const rawDate = data.date;
            const date =
                rawDate instanceof Date
                    ? rawDate.toISOString().slice(0, 10)
                    : (rawDate as string) || "";
            const draft = data.draft === true || data.draft === "true";
            const status = draft ? "draft" : "published";
            const tv = data.tags;
            const tags: string[] = Array.isArray(tv)
                ? tv.filter((t): t is string => typeof t === "string")
                : typeof tv === "string"
                  ? tv
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                  : [];

            // Compute content hash from title + excerpt + first 500 body chars
            const bodyPreview = body.slice(0, 500);
            const newHash = await sha256Hex(
                `${data.title as string}|${data.description as string}|${bodyPreview}`,
            );

            await db
                .prepare(
                    `
                INSERT INTO posts
                    (id, slug, title, excerpt, content,
                     cover_image, category, tags, author, status, published_at,
                     content_hash, search_updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    slug = excluded.slug,
                    title = excluded.title,
                    excerpt = excluded.excerpt,
                    content = excluded.content,
                    cover_image = excluded.cover_image,
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
                    (data.category as string) || "",
                    JSON.stringify(tags),
                    (data.author as string) || "Kurashizu",
                    status,
                    date || null,
                    newHash,
                    null,
                )
                .run();
            upserted++;
        }
        return `${keys.length} articles (${upserted} upserted)`;
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
