# AGENTS.md

Multi-worker Cloudflare monorepo. This file is a quick orientation for AI agents; per-worker details follow in dedicated sections below.

## Workers

| Worker | Path | URL | Purpose |
|---|---|---|---|
| `cf-blog` | `./` | https://blog.022025.xyz | Main blog (Next.js) |
| `cf-agent` | `agent-worker/` | https://agent.022025.xyz | AI agent with tool calling (Next.js) |
| `cf-blog-cache` | `cache-worker/` | (cron-only) | Refreshes homepage cache into R2 every 30 min |



## D1 Database

| Table | Purpose |
|---|---|
| `posts` | Blog article index (slug, title, excerpt, tags, status, published_at) |
| `news_items` | HN news archive (id, title, url, score, summary, etc.) |
| `news_fetch_log` | Tracks which days have been fetched (prevents cron duplicates) |

Both `cf-blog` and `cf-blog-cache` have `DB` binding to the same D1. Cache-worker syncs from R2 → D1; cf-blog reads from D1 directly.

## Cache Worker

`cache-worker/` is a cron-triggered Cloudflare Worker that pre-fetches all external data into R2 + D1. The homepage never calls GitHub / Artificial Analysis on user requests.

| Cache key | Storage | Source | Notes |
|---|---|---|---|
| `cache/github-repos.json` | R2 | GitHub API | Top 6 non-fork repos |
| `cache/articles-index.json` | R2 + D1 `posts` | R2 scan of `articles/*.md` | Parsed frontmatter, sorted by date |
| `cache/hn-news.json` | R2 + D1 `news_items` | HN API + Gemini summaries | Latest 5 in R2, full history in D1 |
| `cache/llm-leaderboard.json` | R2 | Artificial Analysis API | Needs `ARTIFICIAL_ANALYSIS_API_KEY` secret |
| `cache/github-contributions.json` | R2 | GitHub GraphQL | Needs `GITHUB_PERSONAL_ACCESS_TOKEN` secret |

Manual trigger:
```bash
curl -X POST https://cf-blog-cache.kurashizu123.workers.dev/__refresh \
  -H "Authorization: Bearer $CRON_SECRET"
```
Response is `{ success, logs }` with one `OK/FAILED/SKIPPED` line per cache. Useful for diagnosing cron failures without `wrangler tail`.

## Agent Worker (cf-agent)

Separate Next.js Cloudflare Worker using the same `@opennextjs/cloudflare` build as `cf-blog`. URL: https://agent.022025.xyz. No R2 — talks to Gemini directly for chat + tool calling. Default model: `gemma-4-31b-it`.

### Build & Deploy

```bash
cd agent-worker
npm ci --legacy-peer-deps    # package-lock.json required
npm run dev                   # Local dev
npm run build:cf              # Build for Cloudflare Workers
npx wrangler deploy           # Direct deploy (skips CI)
```

Bindings in `wrangler.toml`: `GEMINI_MODELS` env var, KV namespace (1-hour session TTL), rate limiters.

### Tool System

All tools live under `lib/tools/` and are **manually imported** — `fs.readdirSync` does NOT work in Cloudflare Workers.

**To add a new tool:**
1. Create `lib/tools/<tool-name>.ts` implementing the `Tool` interface
2. Import and register in `lib/tools/index.ts` `TOOL_LIST`
3. No other changes — `/api/tool` and `/api/chat` auto-discover via the registry

```typescript
interface Tool {
    name: string;            // "eval_expression"
    description: string;     // Human-readable, sent to Gemini
    example: string;         // Example usage JSON
    parameters: object;      // JSON Schema → functionDeclaration
    execute(args: Record<string, unknown>): Promise<unknown>;
}
```

| Tool | Description | Parameters |
|---|---|---|
| `eval_expression` | Safe JS expression evaluator (recursive-descent, no `eval`/`Function`) | `{ code: string }` |
| `web_search` | Brave Search API | `{ q: string }` |
| `get_time` | Current time in timezone (UTC fallback) | `{ timezone?: string }` |

### API Endpoints

- `GET /api/tool` — list all tools with names, descriptions, examples, and Gemini `functionDeclarations`
- `POST /api/tool` — execute a tool: `{ name, args }` → `{ success, result, tool }`
- `POST /api/chat` — streaming chat with tool-calling loop

**SSE event order** for `/api/chat`:
```
start_process
  ↓ (optional tool iterations, max 5)
tool_start → tool_result → end_tool
  ↓
start_text → text → end_text
  ↓
end_process
```

Think blocks (`<think>...</think>`) are filtered before text is emitted. Session messages stored in KV with 1-hour TTL.

### Key Files

```
agent-worker/
  lib/
    tools/
      index.ts           # TOOLS, FUNCTION_DECLARATIONS, executeTool()
      eval-expression.ts # recursive-descent JS eval (safe)
      web-search.ts      # Brave Search
      get-time.ts        # Timezone time
    evaluator.ts         # Standalone safe expression parser
    model-pool.ts        # Gemini pool with TPD/RPM fallback
  app/api/
    tool/route.ts        # GET list, POST execute
    chat/route.ts        # Streaming chat w/ tool loop
  wrangler.toml          # GEMINI_MODELS, KV, rate limits
```

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
