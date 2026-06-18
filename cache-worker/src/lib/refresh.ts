/**
 * refreshCache — orchestrates a full cache refresh.
 *
 * Every upstream is tried independently so a single failure doesn't take
 * down the others. Results are accumulated as `OK / FAILED / SKIPPED` lines
 * suitable for log scraping. The same orchestrator is used by the cron
 * trigger and the manual POST /__refresh endpoint.
 */
import {
    fetchContributions,
    fetchGithubRepos,
    fetchLLMLeaderboard,
    fetchRepoLanguages,
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

    await runStep(results, "llm-leaderboard", async () => {
        if (!env.ARTIFICIAL_ANALYSIS_API_KEY) {
            throw new Error("ARTIFICIAL_ANALYSIS_API_KEY not set");
        }
        const models = await fetchLLMLeaderboard(
            env.ARTIFICIAL_ANALYSIS_API_KEY,
        );
        if (models.length === 0) throw new Error("empty response");
        const fetchedAt = new Date().toISOString();
        const payload = { fetchedAt, models };
        await env.DB.prepare(
            `INSERT OR REPLACE INTO cache_entries (key, value, fetched_at) VALUES (?, ?, ?)`,
        )
            .bind("llm-leaderboard", JSON.stringify(payload), fetchedAt)
            .run();
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
        const fetchedAt = new Date().toISOString();
        await env.DB.prepare(
            `INSERT OR REPLACE INTO cache_entries (key, value, fetched_at) VALUES (?, ?, ?)`,
        )
            .bind(
                "github-contributions",
                JSON.stringify({ ...data, fetchedAt }),
                fetchedAt,
            )
            .run();
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
