import { r2Paths } from './r2-paths';
import { r2Get, r2Put } from './r2';
import { buildArticleIndex } from './articles';

interface GitHubRepo {
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  fork: boolean;
  owner: {
    login: string;
  };
}

async function fetchGitHubRepos(): Promise<GitHubRepo[]> {
  const res = await fetch(
    "https://api.github.com/users/kurashizu/repos?sort=stars&per_page=6&type=public",
    {
      headers: {
        "User-Agent": "Kurashizu-Blog",
        "Accept": "application/vnd.github.v3+json",
      },
    }
  );
  if (!res.ok) {
    console.error("GitHub API error:", res.status, res.statusText);
    return [];
  }
  const repos = await res.json() as GitHubRepo[];
  return repos.filter((r) => !r.fork).slice(0, 6);
}

async function fetchStarredRepos(): Promise<GitHubRepo[]> {
  const res = await fetch(
    "https://api.github.com/users/kurashizu/starred?per_page=10&sort=stars",
    {
      headers: {
        "User-Agent": "Kurashizu-Blog",
        "Accept": "application/vnd.github.v3+json",
      },
    }
  );
  if (!res.ok) {
    console.error("GitHub starred API error:", res.status, res.statusText);
    return [];
  }
  return await res.json() as GitHubRepo[];
}

export async function refreshAllCaches(): Promise<{ articleIndex: number; githubRepos: number; githubStarred: number }> {
  const [articleIndex, repos, starred] = await Promise.all([
    buildArticleIndex(),
    fetchGitHubRepos(),
    fetchStarredRepos(),
  ]);

  const results = { articleIndex: 0, githubRepos: 0, githubStarred: 0 };

  if (repos.length > 0) {
    await r2Put(r2Paths.githubReposCache, JSON.stringify(repos));
    results.githubRepos = repos.length;
  }

  if (starred.length > 0) {
    await r2Put(r2Paths.githubStarredCache, JSON.stringify(starred));
    results.githubStarred = starred.length;
  }

  results.articleIndex = articleIndex.length;
  return results;
}
