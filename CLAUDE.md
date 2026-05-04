# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Deploy

```bash
npm run dev          # Local development (Next.js on localhost)
npm run build        # Next.js production build
npm run build:cf      # Build for Cloudflare Workers via @opennextjs/cloudflare
npm run lint         # ESLint check
```

**Direct deploy** (bypasses CI):
- cf-blog: `npx wrangler deploy`
- cf-agent: `cd agent-worker && npm run build:cf && npx wrangler deploy`

## Rate Limiting

Two-layer: CF Rate Limiter (burst) + KV (daily).

| Worker | Endpoint | Burst | Daily |
|---|---|---|---|
| cf-blog | `/api/llm` | 2/10s | 200/IP |
| cf-blog | `/api/guestbook` | 2/10s | 5/IP |
| cf-agent | `/api/chat` | 2/10s | 100/IP |
| cf-agent | `/api/tool` | 10/10s | 200/IP |

`lib/ratelimiter.ts` exports `checkBurst(binding, key, limit, period)` for CF Rate Limiter and `checkDailyKV(kv, endpoint, ip, dailyLimit)` for KV daily counters.

## Dual-Worker CI

GitHub Actions deploys two workers in parallel:
- `cf-blog` — main blog (also `cf-blog.kurashizu123.workers.dev`)
- `cf-agent` — agent worker (also `agent.kurashizu123.workers.dev`)

Push to `main` to trigger CI deploy. `cf-agent` builds from `agent-worker/` directory.

## Architecture

### Cloudflare Deployment
- Uses `@opennextjs/cloudflare` to deploy Next.js to Cloudflare Workers
- R2 bucket (`cf-blog-bucket`) stores articles as markdown files; paths: `articles/{slug}.md`
- Wrangler bindings: R2 bucket, rate limiters, KV namespace for sessions
- KV keys for rate limiting: `ratelimit:daily:{endpoint}:{ipHash}:{YYYY-MM-DD}`

### UI Components
- `Card` / `MiniCard` - Frosted glass cards with glow animations
- `ParticleBackground` - Canvas character rain (ku/ra/shi/zu) with random rotation/size/font
- `ChatWidget` - Floating chat with icon images (hover swaps icon2/icon3)
- `ThemeProvider` - Client component for theme state

## R2 Operations

Use wrangler for R2 operations (not Cloudflare MCP API which has issues):

```bash
# Upload article (make sure to include correct frontmatter, you can reference existing articles in R2 for format)
npx wrangler r2 object put cf-blog-bucket/articles/{slug}.md --file=/tmp/file.md --content-type=text/markdown --remote

# List articles
npx wrangler r2 object list cf-blog-bucket --prefix=articles/
```

## Key Files

- `lib/articles.ts` - Article repository with R2 backend
- `lib/r2.ts` - R2 client using `@opennextjs/cloudflare` (getCloudflareContext pattern)
- `lib/gemini.ts` - Gemini API wrapper
- `lib/model-pool.ts` - Model pool with MiniMax (OpenAI API) primary + Gemini fallback; handles format conversion between OpenAI and Gemini
- `lib/frontmatter.ts` - YAML frontmatter parser/builder
- `lib/ratelimiter.ts` - Rate limiting (`checkBurst`, `checkDailyKV`)
- `lib/llm.ts` - LLM API route handlers

## File Structure

```
app/                    # Next.js App Router pages
  page.tsx            # Homepage (hero + 4-section grid + guestbook)
  layout.tsx           # Root layout with ThemeProvider
  blog/               # Blog pages
  admin/              # Admin pages (editor, API)
  api/                # Public API routes
    llm/             # Gemini proxy
    guestbook/       # Guestbook API

components/
  ui/                # Reusable UI components (Card, MiniCard, Button, Tag)
  layout/            # Header, Footer
  providers/         # Context providers (ThemeProvider)
  theme/             # CSS files (global.css, layout.css, etc.)
  guestbook/         # Guestbook components
  agent/             # Agent components (future)

lib/                 # Backend logic
  articles.ts        # Article repository
  r2.ts             # R2 storage client
  gemini.ts          # Gemini API wrapper
  frontmatter.ts     # YAML frontmatter parser/builder
  utils.ts          # Utility functions
  guestbook.ts       # Guestbook repository
  r2-paths.ts       # R2 key paths
  ratelimiter.ts     # Rate limiting (`checkBurst`, `checkDailyKV`)

agent-worker/        # Separate Cloudflare Worker (cf-agent)
  lib/
    tools/           # Tool implementations
      index.ts       # Tool registry — exports TOOLS, FUNCTION_DECLARATIONS, executeTool()
      eval-expression.ts  # Safe JS expression evaluator (no eval/Function)
      web-search.ts      # Brave Search API for web queries
      get-time.ts        # Timezone time (UTC fallback)
    evaluator.ts    # Recursive descent expression parser
    html-to-md.ts   # Regex-based HTML→Markdown converter
    model-pool.ts   # Model pool with MiniMax primary + Gemini fallback
  app/api/
    tool/           # GET list tools, POST execute tool
    chat/           # Streaming chat with tool-calling loop
  wrangler.toml     # Worker config, GEMINI_MODELS env var
```

## cf-agent Tool System

### Tool Structure

Each tool in `lib/tools/` follows this interface:

```typescript
interface Tool {
  name: string;           // "eval_expression"
  description: string;
  example: string;
  parameters: object;      // JSON Schema
  execute(args: Record<string, unknown>): Promise<unknown>;
}
```

### /api/tool Endpoint

```json
// GET /api/tool → list all tools
// POST /api/tool → execute a tool: { "name": "eval_expression", "args": { "code": "1+2" } }
// Response: { "success": true, "result": "3", "tool": "eval_expression" }
```

### /api/chat Endpoint

Tool-calling loop with streaming SSE events. Streams text chunks between `start_text`/`end_text` events. Think blocks (`<think>...</think>`) are filtered out before text is emitted.

```
data: {"type":"start_process","content":""}
data: {"type":"start_text","content":"Hello"}
data: {"type":"end_process","content":"done, hitIterationLimit: false, toolCalls: 0"}
```

Tool calls emit `tool_start` → `tool_result` → `end_tool` → final `start_text`/`text`/`end_text` events.

Max 5 tool call iterations. Session messages stored in KV with 1-hour TTL.

## Code Style

### CSS & Theming
- Use Tailwind CSS with CSS variables for theming
- Theme colors via Tailwind: `bg-bg-card`, `text-text-muted`, `border-border`, `text-accent`
- Custom CSS animations in `components/theme/*.css` (not Tailwind)
- Components use `backdrop-blur-sm` for frosted glass effect

### Component Patterns
- Client components: `"use client"` directive at top
- Forward refs: Use `React.forwardRef` for components that need refs
- ClassName merging: Use `cn()` from `lib/utils.ts` for conditional classes
- Component files: One component per file, filename matches component name

### TypeScript
- Explicit return types for exported functions
- Interface for props (e.g., `interface CardProps extends React.HTMLAttributes<HTMLDivElement>`)
- Use `type` for unions/intersections, `interface` for object shapes

### API Routes
- Always handle errors with try/catch and return appropriate status codes
- Validate input before processing
- Use `NextResponse.json()` for responses
- Sanitize and clamp numeric parameters (temperature, maxTokens, etc.)
- Whitelist allowed values (models, etc.)
