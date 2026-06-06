# AGENTS.md

Multi-worker Cloudflare monorepo. This file is a quick orientation for AI agents; deeper per-worker context lives in the `CLAUDE.md` files and the cache worker's inline comments.

## Workers

| Worker | Path | URL | Purpose |
|---|---|---|---|
| `cf-blog` | `./` | https://blog.022025.xyz | Main blog (Next.js) |
| `cf-agent` | `agent-worker/` | https://agent.022025.xyz | AI agent with tool calling (Next.js) |
| `cf-blog-cache` | `cache-worker/` | (cron-only) | Refreshes homepage cache into R2 every 30 min |

Per-worker guidance:
- `cf-blog` → `CLAUDE.md` (build, deploy, R2 ops, file structure, rate limits)
- `cf-agent` → `agent-worker/CLAUDE.md` (tool system, streaming SSE, deploy)

## Cache Worker

`cache-worker/` is a cron-triggered Cloudflare Worker that pre-fetches all external data into R2. The homepage never calls GitHub / Artificial Analysis on user requests — everything is served from R2.

| Cache key | Source | Notes |
|---|---|---|
| `cache/github-repos.json` | GitHub API | Top 6 non-fork repos |
| `cache/github-starred.json` | GitHub API | Top 10 starred |
| `cache/articles-index.json` | R2 scan of `articles/*.md` | Parsed frontmatter, sorted by date |
| `cache/llm-leaderboard.json` | Artificial Analysis API | Needs `ARTIFICIAL_ANALYSIS_API_KEY` secret |
| `cache/github-contributions.json` | GitHub GraphQL | Needs `GITHUB_PERSONAL_ACCESS_TOKEN` secret |

Manual trigger:
```bash
curl -X POST https://cf-blog-cache.kurashizu123.workers.dev/__refresh \
  -H "Authorization: Bearer $CRON_SECRET"
```
Response is `{ success, logs }` with one `OK/FAILED/SKIPPED` line per cache. Useful for diagnosing cron failures without `wrangler tail`.

## Hero Data Widgets (cf-blog)

The homepage hero has two data widgets, both transparent (no card chrome):

1. **Contributions ribbon** — single horizontal row of 51 cells (14×14 each, day-by-day), shows the user's last ~2 months of GitHub activity. Month labels (Apr/May/Jun) above the cells at month boundaries.
2. **Top languages donut** — 100×100 SVG donut in the hero right column, with a compact vertical legend of dot + language name beside it. Color-coded using GitHub's official language palette. Center of donut shows the dominant language name + "TOP" label.

Both are powered by `cf-blog-cache` cron → R2, rendered server-side via `getContributions()` / `getTopLanguages()` from `lib/contributions.ts` / `lib/languages.ts`.

## Rate Limiting

Two-layer: Cloudflare Rate Limiter (burst) + KV (daily).

| Worker | Endpoint | Burst | Daily |
|---|---|---|---|
| cf-blog | `/api/llm` | 2/10s | 200/IP |
| cf-blog | `/api/guestbook` | 2/10s | 5/IP |
| cf-agent | `/api/chat` | 2/10s | 100/IP |
| cf-agent | `/api/tool` | 10/10s | 200/IP |

`lib/ratelimiter.ts` exports `checkBurst(binding, key, limit, period)` and `checkDailyKV(kv, endpoint, ip, dailyLimit)`.

## Triple-Worker CI

`.github/workflows/deploy.yml` runs on push to `main`. Builds all three workers in parallel, then deploys in parallel.

Direct deploy (skips CI):
- `npx wrangler deploy` (cf-blog)
- `cd agent-worker && npm run build:cf && npx wrangler deploy` (cf-agent)
- `cd cache-worker && npx wrangler deploy` (cf-blog-cache)

## Conventions

- All Next.js workers use `@opennextjs/cloudflare` (not `next start`).
- Static assets go in `public/`. R2-bound content (article markdown) lives in R2, not the repo.
- Theme colors via CSS variables in `components/theme/global.css`. Tailwind utilities map to these (`bg-bg-card`, `text-text-muted`, etc.).
- Component files: one per file, filename matches component name. `"use client"` only when needed.
- For R2 operations, use `wrangler r2 object` (the Cloudflare MCP API has known issues).
- Delete obsolete code completely — no commented-out blocks, no `_unused` files, no half-removed components. If a file is dead, `git rm` it.
