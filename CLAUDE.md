# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Deploy

```bash
npm run dev          # Local development (Next.js on localhost)
npm run build        # Next.js production build
npm run build:cf    # Build for Cloudflare Workers via @opennextjs/cloudflare
npm run lint         # ESLint check
npm run deploy:cf   # Direct deploy (bypasses CI, use git push instead)
```

## Rate Limiting

Two-layer rate limiting via CF Rate Limiter (burst) + Durable Object (daily):
- **LLM API**: 2 requests/10s burst, 100/day
- **Guestbook API**: 2 requests/10s burst, 5/day

`lib/ratelimiter.ts` exports `checkRateLimit(key, type)` — handles both layers.

## Dual-Worker CI

GitHub Actions deploys two workers in parallel:
- `cf-blog` — main blog at `cf-blog.kurashizu.workers.dev`
- `cf-agent` — agent worker at `cf-agent.kurashizu.workers.dev`

Push to `main` to trigger deployment (via GitHub Actions, not direct wrangler deploy). `cf-agent` builds from `agent-worker/` directory.

**Direct deploy for cf-agent** (faster than CI):
```bash
cd agent-worker && npm run build:cf && npx wrangler deploy
```

## Architecture

### Cloudflare Deployment
- Uses `@opennextjs/cloudflare` to deploy Next.js to Cloudflare Workers
- R2 bucket (`cf-blog-bucket`) stores articles as markdown files
- R2 paths: `articles/{slug}.md`
- Wrangler bindings: R2 bucket, rate limiters (LLM/GUESTBOOK), Durable Object (RATE_LIMIT_DO)

### Article System
- Articles stored in R2 with YAML frontmatter
- Frontmatter fields: `title`, `date`, `slug`, `description`, `tags`, `published`, `coverImage`, `author`, `draft`
- `tags` can be array or comma-separated string (handled by `parsePost`)
- `lib/articles.ts` provides `createArticlesRepo()` with `getAll()`, `getRecent()`, `getBySlug()`, `save()`, `delete()`
- Markdown rendered via `marked` library

### Rate Limiting
- `lib/ratelimiter.ts` — RateLimitDO (Durable Object) + checkRateLimit driver
- CF Rate Limiter handles burst (10s), DO handles daily reset at midnight
- Durable Object alarm clears stale entries; TTL 7 days on storage

### Theme System
- Three themes: `dark` (orange accent), `deep-blue` (blue accent), `deep-green` (green accent)
- ThemeProvider with localStorage persistence + custom `themechange` event
- CSS variables in `components/theme/global.css`

### API Routes
- `/api/llm` - Gemini API proxy (public, see robustness notes)
- `/admin/api/posts` - CRUD for articles (Cloudflare access protected)
- `/admin/api/posts/[slug]` - Single article CRUD (Cloudflare access protected)

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
- `lib/gemini.ts` - Gemini API wrapper with system prompt
- `lib/frontmatter.ts` - YAML frontmatter parser/builder
- `lib/ratelimiter.ts` - Rate limiting (CF Rate Limiter + Durable Object)
- `components/ui/ParticleBackground.tsx` - Canvas particle animation
- `components/providers/ThemeProvider.tsx` - Theme context

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
  ratelimiter.ts     # Rate limiting (DO class + checkRateLimit)

agent-worker/        # Separate Cloudflare Worker (cf-agent)
  lib/
    tools/           # Tool implementations (eval-expression, fetch-webpage, get-time)
      index.ts     # Tool registry — exports TOOLS, FUNCTION_DECLARATIONS, executeTool()
      eval-expression.ts
      fetch-webpage.ts
      get-time.ts
    evaluator.ts    # Safe JS expression evaluator
    html-to-md.ts  # HTML to Markdown converter
  app/
    api/
      tool/         # GET list tools, POST execute tool
      chat/        # Gemini tool-calling loop
  wrangler.toml     # Worker config (GEMINI_API_KEY secret)
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
{
  "tools": [
    { "name": "eval_expression", "description": "...", "example": "..." },
    { "name": "fetch_webpage", "description": "...", "example": "..." },
    { "name": "get_time", "description": "...", "example": "..." }
  ],
  "functionDeclarations": [...]  // Gemini format
}

// POST /api/tool → execute a tool directly
{ "name": "eval_expression", "args": { "code": "1+2" } }

// Response
{ "success": true, "result": "3", "tool": "eval_expression" }
```

### /api/chat Tool Loop

1. Send `tools: { functionDeclarations }` to Gemini
2. If response has `functionCall` → `executeTool(name, args)` → Gemini with `functionResponse`
3. Max 5 iterations to prevent infinite loops
4. Default model: `gemma-4-31b-it`

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
