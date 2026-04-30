/**
 * R2 Storage Path Constants
 * Centralized R2 key paths for article storage
 */

export const r2Paths = {
  articlesPrefix: 'articles/',
  article: (slug: string) => `articles/${slug}.md`,
} as const;
