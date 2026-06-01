# Personal Blog — Design Spec

## Overview

Personal blog on Cloudflare Workers with R2 storage, admin panel, and GitHub Actions deployment. Features theme switching (dark/deep-blue), Gemini AI assistant integration, and modular CSS design system.

---

## 1. Architecture

```
Author ──▶ GitHub ──▶ GitHub Actions ──▶ OpenNextjs-Cloudflare Workers ──▶ R2 (articles)
                                                                              │
                                                                       Gemini API (LLM)
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
| AI | Google Gemini API via `/api/llm` |

---

## 3. File Structure

```
/
├── .github/workflows/deploy.yml
├── app/
│   ├── page.tsx                    # Homepage (hero, projects, recent posts)
│   ├── layout.tsx                  # Root layout with ThemeProvider
│   ├── about/page.tsx              # About page
│   ├── blog/
│   │   ├── page.tsx               # Blog listing
│   │   ├── [slug]/page.tsx        # Article page
│   │   └── loading.tsx
│   ├── admin/
│   │   ├── page.tsx               # Admin dashboard
│   │   └── editor/[slug]/page.tsx # Post editor
│   └── api/llm/route.ts           # Gemini proxy endpoint
├── components/
│   ├── ui/
│   │   ├── Button.tsx             # Button with variants
│   │   ├── Card.tsx               # Card (CardHeader, CardContent, CardFooter)
│   │   └── Tag.tsx                # Tag/badge component
│   ├── layout/
│   │   ├── Header.tsx             # Header with nav and theme toggle
│   │   └── Footer.tsx
│   ├── theme/                     # CSS design system
│   │   ├── global.css             # Tokens, base styles, animations
│   │   ├── layout.css             # Hero, section-title, page-title
│   │   ├── article.css            # Article content styles
│   │   ├── admin.css              # Admin table styles
│   │   ├── form.css               # Form input styles
│   │   └── editor.css             # Split pane editor
│   └── providers/
│       └── ThemeProvider.tsx      # Theme context with localStorage
├── lib/
│   ├── r2.ts                      # R2 operations
│   ├── r2-paths.ts                # R2 path constants
│   ├── frontmatter.ts             # YAML frontmatter parse/build
│   ├── articles.ts                # Article business logic
│   ├── gemini.ts                  # Gemini API wrapper + SYSTEM_PROMPT
│   └── utils.ts                   # Utilities (cn, formatDate)
├── wrangler.toml
├── tailwind.config.ts
└── package.json
```

---

## 4. Theme System

### Theme Variants

| Theme | Accent Color | Use Case |
|-------|-------------|----------|
| `dark` | Orange (#ff6b35) | Default |
| `deep-blue` | Blue (#4a9eff) | Alternate |

### CSS Variables (global.css)

```css
:root, [data-theme="dark"] {
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-card: #1a1a24;
  --accent: #ff6b35;
  --accent-hover: #ff8555;
  /* ... */
}

[data-theme="deep-blue"] {
  --bg-primary: #0c0c1a;
  --accent: #4a9eff;
  /* ... */
}
```

### Theme Persistence

Theme stored in `localStorage` key `theme`, restored on page load via `ThemeProvider`.

---

## 5. Styling Architecture

**Core Rule: All styles in `components/theme/`, CSS variables for theming.**

### 5.1 global.css

Contains CSS variables (tokens), base reset, background glow animations, focus states, scrollbar.

### 5.2 Theme CSS Files

| File | Contents |
|------|----------|
| `global.css` | CSS variables, animations, base |
| `layout.css` | `.hero-title`, `.hero-subtitle`, `.section-title`, `.page-title` |
| `article.css` | Article content, metadata, title, description |
| `admin.css` | Admin table styles |
| `form.css` | Form input styles |
| `editor.css` | Split pane editor |

### 5.3 Tailwind Config

Extends with CSS variable-based colors, custom borderRadius, transitionDuration.

---

## 6. R2 Storage

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
---

# Hello World
Article content...
```

---

## 7. API Endpoints

### /api/llm

Gemini API proxy with system prompt prepended.

**POST** — Generate content
```json
{
  "messages": [{"role": "user", "parts": [{"text": "..."}]}],
  "stream": false,
  "options": {"temperature": 0.9}
}
```

**Response**
```json
{
  "text": "Generated response...",
  "usage": {"promptTokens": 8, "candidatesTokens": 12, "totalTokens": 20}
}
```

**Stream** — Set `stream: true`, returns SSE text chunks.

### /admin/api/posts

CRUD for blog posts via R2.

---

## 8. Key Pages

| Route | Description |
|-------|-------------|
| `/` | Hero + projects + recent 3 posts |
| `/blog` | All posts, newest first |
| `/blog/[slug]` | Full article with rendered MD |
| `/about` | Bio, tech stack, social links |
| `/admin` | Post list with status |
| `/admin/editor/[slug]` | Split editor + live preview |

---

## 9. Deployment

```yaml
# .github/workflows/deploy.yml
on: push to main
steps: checkout → setup-node@v22 → npm ci --legacy-peer-deps → npm run build → wrangler deploy
env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
```

```toml
# wrangler.toml
name = "cf-blog"
main = ".open-next/worker.js"
compatibility_date = "2026-04-30"
[[r2_buckets]] binding = "BUCKET", bucket_name = "cf-blog-bucket"
[vars]
TEAM_DOMAIN = ""
POLICY_AUD = ""
GEMINI_MODEL = "gemini-2.5-flash-lite"
```

**Secrets Required:**
- `GEMINI_API_KEY` — Gemini API key (Cloudflare Worker Secret)
- `GEMINI_MODEL` — Model name (optional, defaults to gemini-2.5-flash-lite)

---

## 10. Authentication

- Admin routes protected by Cloudflare Access (Zero Trust)
- Redirect to `/__auth/signin` if not authenticated via `cf-access-authed-user` header

---

## 11. Component Catalog

### UI Components (`components/ui/`)

| Component | Description |
|-----------|-------------|
| `Button` | Variants: primary, secondary, ghost, danger |
| `Card` | Hover glow border, lift effect. Sub-components: CardHeader, CardContent, CardFooter |
| `Tag` | Pill-style tags, status badges |

### Layout Components (`components/layout/`)

| Component | Description |
|-----------|-------------|
| `Header` | Gradient logo (Playfair Display), nav links, theme toggle |
| `Footer` | Admin links |

### Providers (`components/providers/`)

| Component | Description |
|-----------|-------------|
| `ThemeProvider` | React context, localStorage persistence, `useTheme()` hook |

---

## 12. Gemini AI Assistant

System prompt in `lib/gemini.ts` (`SYSTEM_PROMPT`) defines the assistant's identity as Kurashizu's AI assistant with context about:

- Background: IT Master's student, software engineer
- Interests: AI & Infrastructure, HPC, automation, clean UI
- Tech Stack: NixOS, Arch Linux, Zed, Neovim, Zsh, Fish
- Projects: llama-proxy, PodWeaver, YoutubeStreamer

---

## 13. Deployment Commands

```bash
npm run dev          # local dev
npm run build       # production build
git push            # triggers GitHub Actions deploy
```

---

*Spec version: 3.0 — 2026-05-01*