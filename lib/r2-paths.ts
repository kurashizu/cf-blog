/**
 * R2 Storage Path Constants
 * Centralized R2 key paths for article storage
 */

export const r2Paths = {
  articlesPrefix: 'articles/',
  article: (slug: string) => `articles/${slug}.md`,
  extractSlug: (key: string) => key.replace(r2Paths.articlesPrefix, '').replace('.md', ''),
  cachePrefix: 'cache/',
  githubReposCache: 'cache/github-repos.json',
  githubStarredCache: 'cache/github-starred.json',
  guestbookMessages: 'guestbook/messages.json',
  guestbookRateLimit: (ipHash: string) => `guestbook/ratelimit/${ipHash}`,
} as const;
