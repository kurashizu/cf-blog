/**
 * R2 Storage Path Constants
 * Centralized R2 key paths for read-only caches (GitHub contributions, LLM leaderboard).
 */

export const r2Paths = {
    llmLeaderboardCache: "cache/llm-leaderboard.json",
    githubContributionsCache: "cache/github-contributions.json",
} as const;
