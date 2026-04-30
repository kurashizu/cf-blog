# Personal Blog — Design Spec

## Overview

Personal blog on Cloudflare Workers with R2 storage, admin panel, and GitHub Actions deployment.

---

## 1. Architecture

```
Author ──▶ GitHub ──▶ GitHub Actions ──▶ OpenNextjs-Cloudflare Workers ──▶ R2 (articles)
```

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Deployment | OpenNextjs-Cloudflare + Wrangler |
| Styling | Tailwind CSS + CSS Variables |
| Content | Markdown in R2 |
| Storage | Cloudflare R2 |
| Auth | Cloudflare Access (Zero Trust) |

---

## 3. File Structure

```
/
├── .github/workflows/deploy.yml
├── app/
│   ├── blog/[slug]/page.tsx, page.tsx, loading.tsx
│   ├── about/page.tsx
│   ├── admin/editor/[slug]/page.tsx, new/page.tsx, page.tsx, layout.tsx
│   ├── page.tsx, layout.tsx, globals.css
├── components/
│   ├── ui/                          # Reusable UI primitives
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Textarea.tsx
│   │   └── index.ts
│   ├── layout/                       # Layout components
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   └── index.ts
│   ├── theme/                        # Theme tokens & style constants
│   │   ├── tokens.ts                 # Color/spacing CSS variable names
│   │   ├── buttons.ts                # Button variant class strings
│   │   ├── badges.ts                 # Status badge class strings
│   │   ├── editor.ts                 # Editor pane/class strings
│   │   ├── admin.ts                  # Admin layout class strings
│   │   ├── form.ts                   # Form element class strings
│   │   └── index.ts
│   └── editor/                       # Editor feature components
│       └── PostEditor.tsx           # Main editor (uses theme/editor.ts)
├── lib/
│   ├── r2.ts                              # R2 driver (CRUD via S3-compatible API)
│   ├── r2-paths.ts                       # R2 storage path constants
│   ├── frontmatter.ts                    # YAML frontmatter parse/build
│   ├── articles.ts                       # Article business logic (Post type, markdownToHtml, CRUD)
├── package.json, tsconfig.json, tailwind.config.ts, wrangler.toml, postcss.config.js
```

---

## 4. Styling Architecture

**Core Rule: All styles in `components/theme/`, zero hardcoded strings in pages.**

### 4.1 globals.css (minimal)

globals.css contains ONLY:
1. `:root` — CSS variable declarations
2. Base reset (`box-sizing: border-box`, `margin: 0`)
3. Edge glow animation (`edge-glow::before`, `::after`)
4. Focus states (`:focus-visible`, `:focus:not(:focus-visible)`)
5. Custom scrollbar (`::-webkit-scrollbar-*`)

**NO utility classes, NO component styles, NO hardcoded colors.**

### 4.2 Theme Files (components/theme/)

Each file exports class name constants — NOT runtime values:

```ts
// tokens.ts — CSS variable names (type-safe references)
export const color = {
  bg: { primary: 'var(--bg-primary)', secondary: 'var(--bg-secondary)', card: 'var(--bg-card)' },
  border: 'var(--border)',
  text: { primary: 'var(--text-primary)', secondary: 'var(--text-secondary)', muted: 'var(--text-muted)' },
  accent: { DEFAULT: 'var(--accent)', light: 'var(--accent-light)' },
} as const;

export const spacing = { /* ... */ } as const;
```

```ts
// buttons.ts — Button variant class strings
export const buttonVariants = {
  primary: 'bg-accent text-white hover:bg-accent/90',
  secondary: 'border border-border bg-transparent text-text-primary hover:bg-bg-secondary',
  danger: 'bg-red-600 text-white hover:bg-red-700',
} as const;
```

```ts
// badges.ts — Status badge class strings
export const badgeVariants = {
  published: 'bg-green-500/10 text-green-400',
  draft: 'bg-accent/10 text-accent',
} as const;
```

```ts
// editor.ts — Editor-specific class strings
export const editorClasses = {
  container: 'grid grid-cols-2 gap-5 h-[450px]',
  pane: 'flex flex-col border border-border rounded-lg overflow-hidden',
  paneHeader: 'px-3 py-2 bg-bg-secondary border-b border-border text-xs font-semibold uppercase tracking-wide text-text-muted',
  paneContent: 'flex-1 overflow-auto p-3.5 bg-bg-primary',
  textarea: 'w-full h-full border-0 bg-transparent text-text-primary font-mono text-sm leading-relaxed resize-none outline-none',
} as const;
```

```ts
// admin.ts — Admin layout class strings
export const adminClasses = {
  header: 'px-4 py-4 bg-gradient-to-b from-bg-secondary to-bg-card border-b border-border',
  title: 'text-lg font-bold text-accent tracking-tight',
  nav: 'flex gap-5',
  navLink: 'text-sm text-text-muted hover:text-accent no-underline transition-colors',
  navLinkActive: 'text-accent font-semibold',
} as const;
```

```ts
// form.ts — Form element class strings
export const formClasses = {
  group: 'mb-4',
  row: 'grid grid-cols-2 gap-4',
  label: 'block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5',
  input: 'w-full px-3 py-3 border border-border rounded-lg text-sm bg-bg-secondary text-text-primary transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30',
} as const;
```

### 4.3 Tailwind Config (tailwind.config.ts)

Only defines color palette — NO arbitrary values:

```ts
colors: {
  bg: { primary: "#050505", secondary: "#0f0f0f", card: "#111111" },
  border: "#1f1f1f",
  text: { primary: "#f5f5f5", secondary: "#888888", muted: "#555555" },
  accent: { DEFAULT: "#ff6b00", light: "#ff8534" },
}
```

### 4.4 Page Components

Pages import from theme files, NOT hardcoded strings:

```tsx
// GOOD — imports from theme
import { buttonVariants } from '@/components/theme/buttons';
<Button className={buttonVariants.primary}>Submit</Button>

// BAD — hardcoded in page
<Button className="bg-accent text-white hover:bg-accent/90">Submit</Button>
```

---

## 5. R2 Storage

- Key = file path, acts as slug
- Example: `articles/2025/05/hello-world.md` → slug: `2025/05/hello-world`

### Article Frontmatter

```markdown
---
title: Hello World
date: 2025-05-01
slug: hello-world
description: A gentle introduction
tags: [intro, tutorial]
published: true
coverImage: /images/covers/hello.png
author: Kurashizu
---

# Hello World
Article content...
```

---

## 6. Key Pages

| Route | Description |
|-------|-------------|
| `/` | Hero + recent 5 posts |
| `/blog` | All posts, newest first |
| `/blog/[slug]` | Full article with rendered MD |
| `/about` | Static bio page |
| `/admin` | Post list with status |
| `/admin/editor/[slug]` | Split editor + live preview |

---

## 7. Deployment

```yaml
# .github/workflows/deploy.yml
on: push to main
steps: checkout → setup-node@v22 → npm ci --legacy-peer-deps → npm run build:cf → wrangler deploy
env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
```

```toml
# wrangler.toml
name = "cf-blog"
main = ".open-next/worker.js"
compatibility_date = "2026-04-30"
[[r2_buckets]] binding = "BUCKET", bucket_name = "cf-blog-bucket"
[vars] TEAM_DOMAIN = "", POLICY_AUD = ""
```

```bash
npm run dev          # local dev
npm run build:cf     # production build (OpenNextjs-Cloudflare)
npx wrangler deploy  # deploy to Workers
```

---

## 8. Authentication

- Admin routes protected by Cloudflare Access (Zero Trust)
- `admin/layout.tsx` — Redirect to `/__auth/signin` if not authenticated via `cf-access-authed-user` header
- `TEAM_DOMAIN` and `POLICY_AUD` in wrangler.toml

---

## 9. Code Standards

### Styling Rules
- **NO hardcoded style strings in page components** — use theme constants
- **All reusable styles → components/theme/** — buttons, badges, editor, admin, form
- **CSS variables for theme values** — never hardcode hex values in components
- **Barrel exports** — each component group via `index.ts`

### API Endpoint Constants
- **All API endpoints defined in `lib/api.ts`** — no hardcoded URL strings
- **Public routes** (if any) use `publicApi` object
- **Admin routes** use `adminApi` object for all `/admin/api/*` endpoints
- Example:
```ts
// lib/api.ts
export const publicApi = {
  // Add public API endpoints here when needed
} as const;

export const adminApi = {
  posts: '/admin/api/posts',
  post: (slug: string) => `/admin/api/posts/${slug}`,
} as const;
```

### R2 Storage Path Constants
- **All R2 key paths defined in `lib/r2-paths.ts`** — no hardcoded path strings
- **R2Client class in `lib/r2.ts`** — CRUD driver for R2 operations
- Example:
```ts
// lib/r2-paths.ts
export const r2Paths = {
  articlesPrefix: 'articles/',
  article: (slug: string) => `articles/${slug}.md`,
} as const;
```

### Frontmatter
- **Frontmatter parse/build in `lib/frontmatter.ts`** — YAML frontmatter utilities
- Independent of R2 — only parses/builds markdown metadata
```tsx
// Usage in components
import { adminApi } from '@/lib/api';
const endpoint = isEditing ? adminApi.post(slug) : adminApi.posts;
```

### Component Organization
| Directory | Contents |
|-----------|----------|
| `components/ui/` | Primitive UI (Button, Card, Input, Textarea) |
| `components/layout/` | Page structure (Header, Footer) |
| `components/theme/` | Style constants (tokens, buttons, badges, editor, admin, form) |
| `components/editor/` | Feature components (PostEditor) |

### globals.css Contents (strict list)
1. CSS variables (:root)
2. Base reset
3. Edge glow animation
4. Focus states
5. Custom scrollbar

---

*Spec version: 2.0 — 2026-05-01*
