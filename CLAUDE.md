# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Deploy

```bash
npm run dev          # Local development (cf-blog only)
npm run build:cf    # Build for Cloudflare Workers (cf-blog)

cd agent-worker && npm ci && npm run build:cf  # Build cf-agent separately

git push origin main  # Push to GitHub to trigger CI — both cf-blog AND cf-agent deploy
```

## Dual-Worker CI

GitHub Actions deploys two workers in parallel:
- `cf-blog` — main blog at `cf-blog.kurashizu.workers.dev`
- `cf-agent` — agent worker at `cf-agent.kurashizu.workers.dev`

## Architecture

### Cloudflare Deployment
- Uses `@opennextjs/cloudflare` to deploy Next.js to Cloudflare Workers
- R2 bucket (`cf-blog-bucket`) stores articles as markdown files
- R2 paths: `articles/{slug}.md`

### Article System
- Articles stored in R2 with YAML frontmatter
- Frontmatter fields: `title`, `date`, `slug`, `description`, `tags`, `published`, `coverImage`, `author`, `draft`
- `tags` can be array or comma-separated string (handled by `parsePost`)
- `lib/articles.ts` provides `createArticlesRepo()` with `getAll()`, `getRecent()`, `getBySlug()`, `save()`, `delete()`
- Markdown rendered via `marked` library

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
- `lib/r2.ts` - R2 client using `@opennextjs/cloudflare`
- `lib/gemini.ts` - Gemini API wrapper with system prompt
- `lib/frontmatter.ts` - YAML frontmatter parser/builder
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

agent-worker/        # Separate Next.js Worker (cf-agent)
  app/              # Minimal Next.js app (stub for now)
```

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
