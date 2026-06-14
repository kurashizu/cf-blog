import { getDB } from "./d1";

export interface Language {
    name: string;
    count: number;
    percentage: number;
    color: string;
}

// GitHub's official language colors — recognizable
const LANGUAGE_COLORS: Record<string, string> = {
    TypeScript: "#3178c6",
    JavaScript: "#f1e05a",
    Python: "#3572A5",
    Go: "#00ADD8",
    Rust: "#dea584",
    Java: "#b07219",
    "C++": "#f34b7d",
    C: "#555555",
    "C#": "#178600",
    Ruby: "#701516",
    PHP: "#4F5D95",
    Swift: "#F05138",
    Kotlin: "#A97BFF",
    HTML: "#e34c26",
    CSS: "#563d7c",
    Shell: "#89e051",
    Lua: "#000080",
    Elixir: "#6e4a7e",
    Haskell: "#5e5086",
    Dart: "#00B4AB",
    Vue: "#41b883",
    Svelte: "#ff3e00",
};

const DEFAULT_COLOR = "#8b8b8b";

export function getLanguageColor(name: string): string {
    return LANGUAGE_COLORS[name] || DEFAULT_COLOR;
}

/**
 * Compute the top N languages from D1 github_repos table.
 * Excludes forks and repos without a language. Counts by repo (not bytes —
 * the GitHub API doesn't expose bytes here).
 */
export async function getTopLanguages(limit = 5): Promise<Language[]> {
    try {
        const db = getDB();
        const rows = await db
            .prepare(
                "SELECT language, COUNT(*) as count FROM github_repos WHERE fork = 0 AND language IS NOT NULL GROUP BY language ORDER BY count DESC",
            )
            .all();

        const results = (rows.results ?? []) as {
            language: string;
            count: number;
        }[];
        if (results.length === 0) return [];

        const total = results.reduce((sum, r) => sum + r.count, 0);

        return results
            .map((r) => ({
                name: r.language,
                count: r.count,
                percentage: Math.round((r.count / total) * 100),
                color: getLanguageColor(r.language),
            }))
            .slice(0, limit);
    } catch {
        return [];
    }
}
