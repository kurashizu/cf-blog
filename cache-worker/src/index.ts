interface GitHubRepo {
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  fork: boolean;
  owner: { login: string };
}

interface PostListItem {
  slug: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  published: boolean;
  coverImage?: string;
  author: string;
  draft: boolean;
}

interface AAEvaluations {
  artificial_analysis_intelligence_index?: number;
  artificial_analysis_coding_index?: number;
  artificial_analysis_math_index?: number;
  mmlu_pro?: number;
  gpqa?: number;
  hle?: number;
  livecodebench?: number;
  scicode?: number;
  math_500?: number;
  aime?: number;
}

interface AAPricing {
  price_1m_blended_3_to_1?: number;
  price_1m_input_tokens?: number;
  price_1m_output_tokens?: number;
}

interface AAModel {
  id: string;
  name: string;
  slug: string;
  model_creator: { id: string; name: string; slug: string };
  evaluations: AAEvaluations;
  pricing: AAPricing;
  median_output_tokens_per_second?: number;
  median_time_to_first_token_seconds?: number;
  median_time_to_first_answer_token?: number;
}

interface AALeaderboardResponse {
  status: number;
  data: AAModel[];
}

interface Env {
  BUCKET: R2Bucket;
  CRON_SECRET?: string;
  ARTIFICIAL_ANALYSIS_API_KEY?: string;
}

function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { data: {}, body: content };
  const data: Record<string, unknown> = {};
  const lines = m[1].split('\n');
  let currentKey = '';
  let currentArray: string[] = [];
  for (const line of lines) {
    if (line.trimStart().startsWith('- ')) {
      const v = line.trimStart().substring(2).trim();
      if (v) currentArray.push(v);
      continue;
    }
    if (currentArray.length > 0 && !line.includes(':')) {
      data[currentKey] = [...currentArray];
      currentArray = [];
    }
    const ci = line.indexOf(':');
    if (ci > 0) {
      const k = line.substring(0, ci).trim();
      const v = line.substring(ci + 1).trim();
      if (currentArray.length > 0) {
        data[currentKey] = [...currentArray];
        currentArray = [];
      }
      if (v === '') { currentKey = k; }
      else { data[k] = v; currentKey = ''; }
    }
  }
  if (currentArray.length > 0) data[currentKey] = currentArray;
  return { data, body: m[2] };
}

function parsePostMeta(content: string, key: string): PostListItem | null {
  const { data } = parseFrontmatter(content);
  const slug = key.replace('articles/', '').replace('.md', '');
  const tv = data.tags;
  const tags: string[] = Array.isArray(tv)
    ? tv.filter((t): t is string => typeof t === 'string')
    : typeof tv === 'string'
      ? tv.split(',').map(t => t.trim()).filter(Boolean)
      : [];
  const post: PostListItem = {
    slug,
    title: (data.title as string) || '',
    date: (data.date as string) || '',
    description: (data.description as string) || '',
    tags,
    published: data.published !== 'false',
    coverImage: data.coverImage as string | undefined,
    author: (data.author as string) || 'Kurashizu',
    draft: data.draft === 'true',
  };
  if (post.draft || !post.published) return null;
  return post;
}

async function fetchGithubRepos(): Promise<GitHubRepo[]> {
  const res = await fetch(
    "https://api.github.com/users/kurashizu/repos?sort=stars&per_page=6&type=public",
    { headers: { "User-Agent": "Kurashizu-Blog-Cache", "Accept": "application/vnd.github.v3+json" } }
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const repos = await res.json<GitHubRepo[]>();
  return repos.filter(r => !r.fork).slice(0, 6);
}

async function fetchStarredRepos(): Promise<GitHubRepo[]> {
  const res = await fetch(
    "https://api.github.com/users/kurashizu/starred?per_page=10&sort=stars",
    { headers: { "User-Agent": "Kurashizu-Blog-Cache", "Accept": "application/vnd.github.v3+json" } }
  );
  if (!res.ok) throw new Error(`GitHub starred API ${res.status}`);
  return await res.json<GitHubRepo[]>();
}

async function fetchLLMLeaderboard(apiKey: string): Promise<AAModel[]> {
  const res = await fetch(
    "https://artificialanalysis.ai/api/v2/data/llms/models",
    { headers: { "x-api-key": apiKey, "Accept": "application/json", "User-Agent": "Kurashizu-Blog-Cache" } }
  );
  if (!res.ok) throw new Error(`AA API ${res.status}`);
  const json = await res.json<AALeaderboardResponse>();
  // Sort by intelligence index descending so the cache is already ranked.
  return json.data.sort((a, b) => {
    const ai = a.evaluations.artificial_analysis_intelligence_index ?? -Infinity;
    const bi = b.evaluations.artificial_analysis_intelligence_index ?? -Infinity;
    return bi - ai;
  });
}

async function buildArticleIndex(bucket: R2Bucket): Promise<PostListItem[]> {
  let cursor: string | undefined;
  const keys: string[] = [];
  do {
    const result = await bucket.list({ prefix: 'articles/', cursor });
    keys.push(...result.objects.map(o => o.key));
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  const posts: PostListItem[] = [];
  for (const key of keys) {
    if (!key.endsWith('.md')) continue;
    try {
      const obj = await bucket.get(key);
      if (!obj) continue;
      const meta = parsePostMeta(await obj.text(), key);
      if (meta) posts.push(meta);
    } catch { /* skip corrupt article */ }
  }

  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return posts;
}

async function refreshCache(env: Env): Promise<void> {
  const results: string[] = [];

  try {
    const repos = await fetchGithubRepos();
    if (repos.length > 0) {
      await env.BUCKET.put("cache/github-repos.json", JSON.stringify(repos));
      results.push("github-repos: OK");
    }
  } catch (e) {
    results.push(`github-repos: FAILED (${e})`);
  }

  try {
    const starred = await fetchStarredRepos();
    if (starred.length > 0) {
      await env.BUCKET.put("cache/github-starred.json", JSON.stringify(starred));
      results.push("github-starred: OK");
    }
  } catch (e) {
    results.push(`github-starred: FAILED (${e})`);
  }

  try {
    const posts = await buildArticleIndex(env.BUCKET);
    await env.BUCKET.put("cache/articles-index.json", JSON.stringify(posts));
    results.push(`articles-index: OK (${posts.length} posts)`);
  } catch (e) {
    results.push(`articles-index: FAILED (${e})`);
  }

  try {
    if (!env.ARTIFICIAL_ANALYSIS_API_KEY) {
      results.push("llm-leaderboard: SKIPPED (ARTIFICIAL_ANALYSIS_API_KEY not set)");
    } else {
      const models = await fetchLLMLeaderboard(env.ARTIFICIAL_ANALYSIS_API_KEY);
      if (models.length > 0) {
        await env.BUCKET.put("cache/llm-leaderboard.json", JSON.stringify(models));
        results.push(`llm-leaderboard: OK (${models.length} models)`);
      } else {
        results.push("llm-leaderboard: SKIPPED (empty response)");
      }
    }
  } catch (e) {
    results.push(`llm-leaderboard: FAILED (${e})`);
  }

  console.log("Cache refresh:", results.join(" | "));
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    console.log("Cron trigger");
    await refreshCache(env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "POST" && new URL(request.url).pathname === "/__refresh") {
      const auth = request.headers.get("Authorization");
      if (env.CRON_SECRET && auth !== `Bearer ${env.CRON_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      await refreshCache(env);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("cf-blog-cache worker", { status: 200 });
  },
};
