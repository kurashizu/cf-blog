# Personal Blog on Cloudflare Pages — Design Spec

## Overview

A personal blog deployed to Cloudflare Pages with automatic deployments via GitHub Actions. Articles are stored in Cloudflare R2 and fetched at runtime. Built with Next.js (App Router).

---

## 1. Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Author    │────▶│  GitHub     │────▶│  GitHub      │────▶│  Cloudflare │
│  (writes MD)│     │  Repository │     │  Actions     │     │  Pages      │
└─────────────┘     └─────────────┘     └──────────────┘     └─────────────┘
                                                                   │
                                                                   ▼
                                                               ┌─────────┐
                                                               │   R2    │
                                                               │ (articles)│
                                                               └─────────┘
```

- **Write:** Author edits MD files locally, pushes to GitHub
- **Build:** GitHub Actions builds the Next.js site
- **Deploy:** Cloudflare Pages serves the static parts + fetches articles from R2 at runtime

---

## 2. Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** English (UI + code comments)
- **Styling:** Tailwind CSS
- **Content:** Markdown files stored in R2, fetched at runtime
- **Deployment:** Cloudflare Pages + GitHub Actions
- **Storage:** Cloudflare R2 for articles and dynamic media
- **Accessibility:** WCAG 2.1 AA compliant

---

## 3. File Structure

```
/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD pipeline
├── app/
│   ├── blog/
│   │   ├── [slug]/
│   │   │   └── page.tsx        # Article page
│   │   ├── page.tsx            # Blog list page
│   │   └── loading.tsx         # Loading skeleton
│   ├── about/
│   │   └── page.tsx
│   ├── admin/                  # Admin Dashboard
│   │   ├── page.tsx
│   │   ├── editor/
│   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── [slug]/
│   │   │       └── page.tsx
│   │   └── layout.tsx          # Admin layout with auth check
│   ├── page.tsx                # Home page
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                     # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   └── ...
│   ├── layout/                 # Layout components
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   └── ...
│   └── theme/                  # Theme tokens
│       ├── colors.ts
│       ├── typography.ts
│       └── ...
├── lib/
│   ├── r2.ts                   # R2 read/write logic
│   └── posts.ts                # Article fetching logic
├── public/
│   └── images/                 # Static images
├── package.json
├── tsconfig.json
├── next.config.js
└── tailwind.config.js
```

---

## 4. R2 Storage Structure

Key = file path, acts as slug.

```
articles/2025/05/hello-world.md   → slug: "2025/05/hello-world"
articles/tech/rust-intro.md         → slug: "tech/rust-intro"
```

### Article Format (Markdown)

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
draft: false
---

# Hello World

Article content here...
```

---

## 5. Key Pages

### Home Page (`/`)
- Hero section with name/tagline
- Recent posts list (latest 5)
- About brief link

### Blog List (`/blog`)
- All published posts
- Sorted by date (newest first)
- Tag filtering (future)

### Article Page (`/blog/[slug]`)
- Article title, date, author, tags
- Cover image (if exists)
- MD content rendered to HTML
- Back link to blog list

### About (`/about`)
- Static page with bio

### Admin Dashboard (`/admin`)
- Article list with status (published/draft)
- Edit/Delete actions
- Cloudflare Access authentication

### Admin Editor (`/admin/editor/[slug]`)
- Split view: Markdown editor + live preview
- Frontmatter fields: title, slug, date, tags, published
- Save to R2 on submit

---

## 6. GitHub Actions Workflow

```yaml
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install & Build
        run: |
          npm ci
          npm run build

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: 'cf-blog'
          directory: '.next'
```

---

## 7. UI Style (Dark Theme)

- **Aesthetic:** Dark mode, clean, modern, generous whitespace
- **Colors:**
  - Background: #050505 (primary), #0f0f0f (secondary), #111111 (card)
  - Border: #1f1f1f
  - Text: #f5f5f5 (primary), #888888 (secondary), #555555 (muted)
  - Accent: #ff6b00 (orange), #ff8534 (orange light)
- **Edge glow:** Subtle orange gradient on left/right edges only
- **Typography:** Sans-serif, readable, hierarchy through weight/size
- **Layout:** Centered max-width container, ample vertical rhythm

---

## 8. Accessibility (WCAG 2.1 AA)

- **Color contrast:** All text must meet 4.5:1 contrast ratio (normal text) or 3:1 (large text)
- **Focus states:** All interactive elements must have visible focus indicators
- **Keyboard navigation:** Full keyboard accessibility for all functionality
- **Semantic HTML:** Proper heading hierarchy, landmarks, and ARIA labels
- **Alt text:** All images must have descriptive alt attributes
- **Form labels:** All form inputs must have associated labels
- **Resizable text:** Support 200% zoom without horizontal scrolling

---

## 9. Authentication

- **Admin:** Cloudflare Access (Zero Trust)
- **Method:** Workers `getUserInfo()` API or similar
- **Flow:** Unauthenticated users redirected to Cloudflare Access login

---

## 10. TODO

- [ ] Initialize Next.js project
- [ ] Configure Tailwind CSS
- [ ] Build UI components (WCAG compliant)
- [ ] Implement R2 article fetching
- [ ] Create pages (home, blog, article, about)
- [ ] Build Admin dashboard with auth
- [ ] Build Admin editor with live preview
- [ ] Set up GitHub Actions workflow
- [ ] Configure Cloudflare Pages
- [ ] WCAG compliance verification

---

*Document version: 1.1*
*Created: 2025-05-01*
*Updated: 2025-05-01 — Added Admin section, WCAG compliance, darker theme*