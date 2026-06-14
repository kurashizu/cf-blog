/**
 * R2 Storage Path Constants
 * Centralized R2 key paths for article storage
 */

export const r2Paths = {
    articlesPrefix: "articles/",
    article: (slug: string) => `articles/${slug}.md`,
    extractSlug: (key: string) =>
        key.replace(r2Paths.articlesPrefix, "").replace(".md", ""),
    cachePrefix: "cache/",
    articlesIndexCache: "cache/articles-index.json",
    llmLeaderboardCache: "cache/llm-leaderboard.json",
    githubContributionsCache: "cache/github-contributions.json",
} as const;
