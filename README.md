# cf-blog

A personal blog + AI agent deployed to Cloudflare Workers. The homepage has a real-time activity dashboard (GitHub contributions + top languages) refreshed every 30 min by a cron worker.

## Features

- **Blog** — Markdown articles in D1, syntax-highlighted code
- **HN News Archive** — Top 5 HN stories fetched every 30 min, with full-length AI rewrites (Gemma 4 via 3-min heartbeat cron)
- **GitHub Contributions Heatmap** — Real-time activity ribbon in the hero
- **Top Languages Donut** — 5-segment SVG donut with hover interaction (shows language name + percentage in center), color-coded legend (hero sidebar)
- **Visitor Terminal** — Typewriter effect showing your IP/location/ISP at the top of the hero
- **KurAgent** — AI assistant with tool calling (web search, time, JS eval) at `agent.022025.xyz`
- **LLM Leaderboard** — Full-screen modal showing top 50 models from Artificial Analysis
- **Guestbook** — Per-visitor message at `/guestbook`
- **News Archive** — Paginated HN news index at `/news` with full-text AI rewrites
- **Particle Background** — Canvas character rain (ku/ra/shi/zu)
- **Three Themes** — dark / deep-blue / deep-green, toggle in the header

## Architecture

Three Cloudflare Workers, deployed in parallel by GitHub Actions on push to `main`:

| Worker | Path | URL | Purpose |
|---|---|---|---|
| `cf-blog` | `./` | https://blog.022025.xyz | Main blog (Next.js) |
| `cf-agent` | `agent-worker/` | https://agent.022025.xyz | AI agent with tool calling |
| `cf-blog-cache` | `cache-worker/` | (cron-only) | Homepage cache refresh (30-min) + News rewrite heartbeat (3-min) |

The homepage never calls GitHub / Artificial Analysis on user requests. `cf-blog-cache` pre-fetches data into D1 (posts, news, github_repos) and into a couple of read-only R2 caches (contributions, LLM leaderboard); the homepage reads from D1 for posts, news, and GitHub repos, and from R2 for contributions and LLM leaderboard. Cold cache = empty hero; ISR revalidates every 5 min.

CI runs on push to `main`: **migrate-db** (`database/schema.sql`) first, then deploys all three workers in parallel.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + React 19
- **Styling**: Tailwind CSS + CSS variables for theming; custom animations in `components/theme/*.css`
- **Storage**: Cloudflare D1 (articles, news, github_repos, guestbook) + Cloudflare R2 (contributions + LLM leaderboard caches) + Cloudflare KV (sessions, rate limits)
- **AI**: Gemini (with quota-based model fallback for TPD/RPM 429s)
- **Deploy**: Cloudflare Workers via `@opennextjs/cloudflare`

## Development

```bash
npm ci --legacy-peer-deps    # Install
npm run dev                  # Local dev server on :3000
npm run build:cf             # Build for Cloudflare Workers
npm run lint                 # ESLint
```

Direct deploy (skips CI):

```bash
npx wrangler deploy                                       # cf-blog
cd agent-worker && npm run build:cf && npx wrangler deploy   # cf-agent
cd cache-worker && npx wrangler deploy                    # cf-blog-cache
```

## AI Agent (cf-agent)

KurAgent supports three tools via the `/api/tool` and `/api/chat` endpoints:

- `@web_search <query>` — Brave Search API
- `@get_time <timezone>` — Current time in any IANA timezone
- `@eval_expression <code>` — Safe JS expression evaluator (recursive-descent parser, no `eval`/`Function`)

Default model: `gemma-4-31b-it`. Streams via SSE. Max 5 tool-call iterations per turn.

## Project Structure

```
.                         # cf-blog (main blog)
├── app/                  # Next.js App Router
├── components/           # React components (UI, activity, agent, llm, theme, layout, providers)
├── lib/                  # Backend logic (D1, articles, guestbook, rate limit, model pool, languages)
├── database/             # D1 schema (schema.sql — all tables: posts, news_items, github_repos, etc.)
├── public/               # Static assets served by Next.js
├── agent-worker/         # cf-agent (separate Next.js worker)
├── cache-worker/         # cf-blog-cache (cron refresher)
└── AGENTS.md             # AI agent orientation
```

## See Also

- `AGENTS.md` — Multi-worker architecture, hero features, conventions, D1/R2 storage layout
