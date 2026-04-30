# Personal Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A personal blog on Cloudflare Pages with R2 storage, Admin panel, WCAG AA compliance, orange/black dark theme.

**Architecture:** Next.js 14 App Router + Tailwind. Articles in R2 (key = path/slug). Admin with Cloudflare Access auth. GitHub Actions deploy on push to main.

**Tech Stack:** Next.js, Tailwind CSS, R2 (Cloudflare), GitHub Actions, Cloudflare Pages

---

## File Structure

```
/
├── .github/workflows/deploy.yml
├── app/
│   ├── blog/[slug]/page.tsx, page.tsx, loading.tsx
│   ├── about/page.tsx
│   ├── admin/editor/new/page.tsx, [slug]/page.tsx, page.tsx, layout.tsx
│   ├── page.tsx, layout.tsx, globals.css
│   └── api/posts/route.ts, [slug]/route.ts
├── components/ui/{Button,Card,Input,Textarea}.tsx, index.ts
├── components/layout/{Header,Footer}.tsx, index.ts
├── components/theme/colors.ts, index.ts
└── lib/{r2,posts,utils}.ts
```

---

## Task 1: Project Init

Files: package.json, tsconfig.json, next.config.js, tailwind.config.js, postcss.config.js, app/globals.css

Steps:
- [ ] Create package.json with dependencies (next@14, react, gray-matter, marked, clsx)
- [ ] Create tsconfig.json, next.config.js (image remotePatterns for R2), tailwind.config.js (dark theme colors), postcss.config.js
- [ ] Create app/globals.css with Tailwind directives + CSS vars (bg, text, accent) + edge glow + focus-visible
- [ ] Run npm install
- [ ] Commit: "init: add Next.js project scaffolding with Tailwind"

---

## Task 2: R2 Client and Post Utilities

Files: lib/utils.ts, lib/r2.ts, lib/posts.ts

Steps:
- [ ] Create lib/utils.ts — cn() with clsx, formatDate()
- [ ] Create lib/r2.ts — R2Client class with getArticle, listArticles, saveArticle, deleteArticle + frontmatter parse/build
- [ ] Create lib/posts.ts — initializeR2Client, getPostBySlug, getAllPosts, getRecentPosts, markdownToHtml using marked
- [ ] Commit: "feat: add R2 client and post utilities"

---

## Task 3: UI Components

Files: components/ui/Button.tsx, Card.tsx, Input.tsx, Textarea.tsx, index.ts

Steps:
- [ ] Create Button.tsx — variants (primary/secondary/danger), forwardRef, focus ring
- [ ] Create Card.tsx, CardHeader.tsx, CardContent.tsx — with cn()
- [ ] Create Input.tsx — label support, focus states
- [ ] Create Textarea.tsx — label support, font-mono for editor
- [ ] Create index.ts — barrel exports
- [ ] Commit: "feat: add UI components (Button, Card, Input, Textarea)"

---

## Task 4: Layout Components

Files: components/layout/Header.tsx, Footer.tsx, index.ts

Steps:
- [ ] Create Header.tsx — logo (Kurashizu), nav links with hover
- [ ] Create Footer.tsx — copyright
- [ ] Create index.ts
- [ ] Commit: "feat: add layout components (Header, Footer)"

---

## Task 5: Theme Components

Files: components/theme/colors.ts, index.ts

Steps:
- [ ] Create colors.ts — export color tokens object
- [ ] Create index.ts
- [ ] Commit: "feat: add theme color tokens"

---

## Task 6: Root Layout and Home Page

Files: app/layout.tsx, app/page.tsx

Steps:
- [ ] Create app/layout.tsx — metadata, body with flex-col (Header + main + Footer)
- [ ] Create app/page.tsx — Hero section + recent posts (getRecentPosts), link to /blog
- [ ] Commit: "feat: add root layout and home page"

---

## Task 7: Blog List and Article Pages

Files: app/blog/page.tsx, loading.tsx, [slug]/page.tsx

Steps:
- [ ] Create app/blog/page.tsx — getAllPosts(), card list with meta, tags
- [ ] Create loading.tsx — pulse skeleton
- [ ] Create app/blog/[slug]/page.tsx — getPostBySlug(), markdownToHtml, notFound if null
- [ ] Add @tailwindcss/typography plugin
- [ ] Commit: "feat: add blog list and article pages"

---

## Task 8: About Page

Files: app/about/page.tsx

Steps:
- [ ] Create static about page with bio content
- [ ] Commit: "feat: add about page"

---

## Task 9: Admin Dashboard

Files: app/admin/layout.tsx, page.tsx

Steps:
- [ ] Create app/admin/layout.tsx — auth check (placeholder), admin nav header
- [ ] Create app/admin/page.tsx — getAllPosts(), table with edit buttons
- [ ] Commit: "feat: add admin dashboard with post list"

---

## Task 10: Admin Editor with Live Preview

Files: app/admin/editor/new/page.tsx, [slug]/page.tsx

Steps:
- [ ] Create app/admin/editor/new/page.tsx — split view: Markdown textarea + Preview pane (client component, useState)
- [ ] Create app/admin/editor/[slug]/page.tsx — edit existing post, same split view
- [ ] Commit: "feat: add admin editor with live markdown preview"

---

## Task 11: GitHub Actions Workflow

Files: .github/workflows/deploy.yml

Steps:
- [ ] Create deploy.yml — on push to main, checkout, setup-node, npm ci, npm run build, cloudflare/pages-action
- [ ] Commit: "ci: add GitHub Actions deploy workflow"

---

## Task 12: API Routes for R2

Files: app/api/posts/route.ts, [slug]/route.ts

Steps:
- [ ] Create GET/POST handler for /api/posts (list + create)
- [ ] Create GET/PUT/DELETE handler for /api/posts/[slug]
- [ ] Commit: "feat: add API routes for post CRUD"

---

## Verification

- [ ] npm run dev starts without errors
- [ ] npm run build completes
- [ ] All pages render (home, blog, article, about, admin)
- [ ] Admin editor live preview works
- [ ] WCAG focus states visible
- [ ] GitHub Actions workflow correct

---

*Plan: 2025-05-01, 12 tasks*
