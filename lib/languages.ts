import { r2Get } from "./r2";
import { r2Paths } from "./r2-paths";

interface Repo {
  name: string;
  language: string | null;
  fork: boolean;
}

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
 * Compute the top N languages from the cached GitHub repos.
 * Excludes forks and repos without a language. Counts by repo (not bytes —
 * the GitHub API doesn't expose bytes here).
 */
export async function getTopLanguages(limit = 5): Promise<Language[]> {
  try {
    const data = await r2Get(r2Paths.githubReposCache);
    const repos = JSON.parse(data) as Repo[];

    const counts: Record<string, number> = {};
    for (const repo of repos) {
      if (repo.fork || !repo.language) continue;
      counts[repo.language] = (counts[repo.language] || 0) + 1;
    }

    const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
    if (total === 0) return [];

    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / total) * 100),
        color: getLanguageColor(name),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  } catch {
    return [];
  }
}
