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
import { withAudit } from "./audit";
import type { Env } from "../types";

export interface RefreshResult {
  line: string;
  ok: boolean;
  skipped?: boolean;
}

type StepResult = string | { detail: string; skipped: true };

export interface RefreshOptions {
  /** Bypass the AA freshness guard for an authenticated manual refresh. */
  forceLLM?: boolean;
}

// The Free AA endpoint is paginated (currently three pages for this catalog)
// and allows 100 requests/day. The worker still runs every 30 minutes for the
// other caches, but refreshes the leaderboard at most once every two hours.
const LLM_MIN_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

export async function refreshCache(
  env: Env,
  options: RefreshOptions = {},
): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];

  // Each step is its own try/catch so one failure doesn't poison the rest.
  await runStep(results, "github-repos", async () => {
    const repos = await withAudit(
      env,
      "github",
      "fetch_repos",
      "kurashizu",
      () => fetchGithubRepos(env.GITHUB_PERSONAL_ACCESS_TOKEN),
      { metadata: { source: "cache-worker" } },
    );
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
      let languagesJson: string;
      try {
        const langs = await fetchRepoLanguages(
          repo.full_name,
          env.GITHUB_PERSONAL_ACCESS_TOKEN,
        );
        const total = langs.reduce((s, l) => s + l.bytes, 0);
        const top3 = langs.slice(0, 3).map((l) => ({
          name: l.name,
          pct: Math.round((l.bytes / total) * 100),
        }));
        languagesJson = JSON.stringify(top3);
      } catch {
        // Fetch failed (e.g. transient network error). Don't clobber existing
        // data — restore the previously stored value, or use repo-level
        // language as fallback for fresh inserts.
        const prev = await env.DB.prepare(
          "SELECT languages_json FROM github_repos WHERE id = ?",
        )
          .bind(repo.id)
          .first<{ languages_json: string }>();
        languagesJson =
          prev?.languages_json ??
          (repo.language
            ? JSON.stringify([{ name: repo.language, pct: 100 }])
            : "[]");
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
    if (
      !options.forceLLM &&
      (await isLLMCacheFresh(env.DB, LLM_MIN_REFRESH_INTERVAL_MS))
    ) {
      return { detail: "fresh cache; upstream request skipped", skipped: true };
    }

    const { models, intelligenceIndexVersion } = await withAudit(
      env,
      "aa",
      "fetch_leaderboard",
      "artificial-analysis",
      () => fetchLLMLeaderboard(env.ARTIFICIAL_ANALYSIS_API_KEY!),
      { metadata: { source: "cache-worker" } },
    );
    if (models.length === 0) throw new Error("empty response");
    const fetchedAt = new Date().toISOString();
    const payload = { fetchedAt, intelligenceIndexVersion, models };
    await env.DB.prepare(
      `INSERT OR REPLACE INTO cache_entries (key, value, fetched_at) VALUES (?, ?, ?)`,
    )
      .bind("llm-leaderboard", JSON.stringify(payload), fetchedAt)
      .run();
    return `${models.length} models (Index v${intelligenceIndexVersion})`;
  });

  await runStep(results, "github-contributions", async () => {
    if (!env.GITHUB_PERSONAL_ACCESS_TOKEN) {
      throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN not set");
    }
    if (!env.GH_USERNAME) {
      throw new Error("GH_USERNAME not set");
    }
    const data = await withAudit(
      env,
      "github",
      "fetch_contributions",
      env.GH_USERNAME,
      () =>
        fetchContributions(
          env.GITHUB_PERSONAL_ACCESS_TOKEN!,
          env.GH_USERNAME!,
        ),
      { metadata: { source: "cache-worker" } },
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

  // ── Audit log cleanup (keep last 30 days) ──
  await runStep(results, "audit-cleanup", async () => {
    const result = await env.DB.prepare(
      `DELETE FROM audit_log WHERE ts < datetime('now', '-30 days')`,
    ).run();
    const deleted = result.meta?.changes ?? 0;
    return `${deleted} old rows pruned`;
  });

  return results;
}

async function isLLMCacheFresh(
  db: D1Database,
  minAgeMs: number,
): Promise<boolean> {
  const entry = await db
    .prepare("SELECT fetched_at FROM cache_entries WHERE key = ?")
    .bind("llm-leaderboard")
    .first<{ fetched_at: string }>();
  if (!entry?.fetched_at) return false;
  const fetchedAt = Date.parse(entry.fetched_at);
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < minAgeMs;
}

async function runStep(
  out: RefreshResult[],
  name: string,
  step: () => Promise<StepResult>,
): Promise<void> {
  try {
    const detail = await step();
    if (typeof detail === "object") {
      out.push({
        line: `${name}: SKIPPED (${detail.detail})`,
        ok: true,
        skipped: true,
      });
    } else {
      out.push({ line: `${name}: OK (${detail})`, ok: true });
    }
  } catch (e) {
    out.push({
      line: `${name}: FAILED (${e instanceof Error ? e.message : String(e)})`,
      ok: false,
    });
  }
}
