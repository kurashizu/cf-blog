# Publishing Blog Posts

This document explains how to publish a blog post to the D1 database using `npx wrangler`. Blog articles are stored directly in D1 (not as files in the repo), so you need to insert them via the database.

## Quick Start

Run the helper script to parse a markdown file with YAML frontmatter and insert it directly into D1:

```bash
node scripts/publish-post.mjs docs/drafts/your-post.md
```

The script reads the frontmatter, generates the SQL, and executes it via `npx wrangler d1 execute`.

---

## Prerequisites

- Wrangler installed (`npx wrangler`)
- Authenticated with Cloudflare (`npx wrangler login`)
- The D1 database `cf-blog-db` must exist (defined in `wrangler.toml`)
- Blog post must be written as a `.md` file with YAML frontmatter

---

## Manual Workflow

### 1. Write Your Post

Create a markdown file with YAML frontmatter. Example:

```markdown
---
title: "Your Post Title"
date: 2026-06-26
description: "A short excerpt for listing pages."
tags: ["linux", "tutorial"]
slug: your-post-slug
author: Kurashizu
draft: false
---

# Your Post Title

Body content in markdown...
```

**Frontmatter fields:**

| Field       | Required | Description                                 |
|-------------|----------|---------------------------------------------|
| `title`     | yes      | Post title                                  |
| `slug`      | yes      | URL slug (lowercase, hyphens, no spaces)    |
| `date`      | yes      | Publish date (YYYY-MM-DD)                   |
| `description` | no    | Short excerpt for listing pages             |
| `tags`      | no       | Array of tag strings                        |
| `author`    | no       | Defaults to "Kurashizu"                     |
| `draft`     | no       | Set to `true` to save as draft              |
| `coverImage` | no      | URL for cover image                         |

### 2. Generate the SQL INSERT

Use the helper script to parse the markdown and generate the SQL:

```bash
node scripts/publish-post.mjs docs/drafts/your-post.md
```

This will:
1. Parse the YAML frontmatter
2. Extract the body content
3. Generate an `INSERT INTO posts ...` SQL statement
4. Execute it via `npx wrangler d1 execute`
5. Output the result (success or error)

### 3. Verify

Check the post on the blog:

```bash
curl https://blog.krsz.in/blog/your-post-slug
```

Or query the database directly:

```bash
npx wrangler d1 execute cf-blog-db \
  --command "SELECT slug, title, status, published_at FROM posts WHERE slug = 'your-post-slug'" \
  --remote
```

---

## Updating an Existing Post

To update a post, use the same workflow but use `INSERT OR REPLACE` or run an `UPDATE`:

```bash
npx wrangler d1 execute cf-blog-db \
  --command "UPDATE posts SET title = 'New Title', content = '...' WHERE slug = 'your-post-slug'" \
  --remote
```

The helper script handles this automatically — it uses `INSERT ... ON CONFLICT(id) DO UPDATE SET ...` (matching the `save()` logic in `lib/articles.ts`), so re-running it with the same slug will update the existing post.

---

## Deleting a Post

```bash
npx wrangler d1 execute cf-blog-db \
  --command "DELETE FROM posts WHERE slug = 'your-post-slug'" \
  --remote
```

---

## Draft vs Published

The `status` column is set to `"published"` by default. To save as a draft, set `draft: true` in the frontmatter — the helper script maps this to `status = "draft"`.

Drafts are not visible on the public blog listing. They can still be viewed at their direct URL if you know the slug, or via the admin panel at `/admin`.

---

## References

- Database schema: `database/schema.sql`
- Article repository: `lib/articles.ts`
- Admin API: `app/admin/api/posts/route.ts`
- Admin API (single post): `app/admin/api/posts/[slug]/route.ts`
