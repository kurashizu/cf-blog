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
    artificial_analysis_intelligence_index?: number | null;
    artificial_analysis_coding_index?: number | null;
    artificial_analysis_math_index?: number | null;
    mmlu_pro?: number | null;
    gpqa?: number | null;
    hle?: number | null;
    livecodebench?: number | null;
    scicode?: number | null;
    math_500?: number | null;
    aime?: number | null;
    aime_25?: number | null;
    ifbench?: number | null;
    lcr?: number | null;
    terminalbench_hard?: number | null;
    tau2?: number | null;
}

interface AAPricing {
    price_1m_blended_3_to_1?: number | null;
    price_1m_input_tokens?: number | null;
    price_1m_output_tokens?: number | null;
}

interface AAModel {
    id: string;
    name: string;
    slug: string;
    release_date?: string;
    model_creator: { id: string; name: string; slug: string };
    evaluations: AAEvaluations;
    pricing: AAPricing;
    median_output_tokens_per_second?: number | null;
    median_time_to_first_token_seconds?: number | null;
    median_time_to_first_answer_token?: number | null;
}

interface AALeaderboardResponse {
    status: number;
    data: AAModel[];
}

interface Env {
    BUCKET: R2Bucket;
    CRON_SECRET?: string;
    ARTIFICIAL_ANALYSIS_API_KEY?: string;
    GITHUB_PERSONAL_ACCESS_TOKEN?: string;
    GH_USERNAME?: string;
}

interface ContributionDayRaw {
    date: string;
    contributionCount: number;
}

interface ContributionsGraphQLResponse {
    data?: {
        user?: {
            contributionsCollection: {
                contributionCalendar: {
                    totalContributions: number;
                    weeks: { contributionDays: ContributionDayRaw[] }[];
                };
            };
        };
    };
}

interface ContributionsCache {
    username: string;
    fetchedAt: string;
    totalContributions: number;
    days: { date: string; count: number }[];
}

// Shape written to R2. Slimmed-down projection of AAModel:
//   - Drops model UUID, creator UUID/slug, and unused evaluation fields
//   - Rounds 0–1 decimal benchmarks to 3 decimal places
//   - Converts null → undefined so JSON.stringify omits them entirely
interface SlimModel {
    name: string;
    slug: string;
    release_date?: string;
    model_creator: { name: string };
    evaluations: {
        artificial_analysis_intelligence_index?: number;
        artificial_analysis_coding_index?: number;
        artificial_analysis_math_index?: number;
        gpqa?: number;
        hle?: number;
        livecodebench?: number;
        scicode?: number;
        math_500?: number;
        aime?: number;
        aime_25?: number;
        ifbench?: number;
        lcr?: number;
        terminalbench_hard?: number;
        tau2?: number;
    };
    pricing: {
        price_1m_blended_3_to_1?: number;
        price_1m_input_tokens?: number;
        price_1m_output_tokens?: number;
    };
    median_output_tokens_per_second?: number;
    median_time_to_first_token_seconds?: number;
}

const opt = <T>(v: T | null | undefined): T | undefined =>
    v === undefined || v === null ? undefined : v;

const round3 = (n: number | null | undefined): number | undefined => {
    if (n === undefined || n === null) return undefined;
    return Math.round(n * 1000) / 1000;
};

function projectModel(m: AAModel): SlimModel {
    return {
        name: m.name,
        slug: m.slug,
        release_date: opt(m.release_date),
        model_creator: { name: m.model_creator.name },
        evaluations: {
            artificial_analysis_intelligence_index: opt(
                m.evaluations.artificial_analysis_intelligence_index,
            ),
            artificial_analysis_coding_index: opt(
                m.evaluations.artificial_analysis_coding_index,
            ),
            artificial_analysis_math_index: opt(
                m.evaluations.artificial_analysis_math_index,
            ),
            gpqa: round3(m.evaluations.gpqa),
            hle: round3(m.evaluations.hle),
            livecodebench: round3(m.evaluations.livecodebench),
            scicode: round3(m.evaluations.scicode),
            math_500: round3(m.evaluations.math_500),
            aime: round3(m.evaluations.aime),
            aime_25: round3(m.evaluations.aime_25),
            ifbench: round3(m.evaluations.ifbench),
            lcr: round3(m.evaluations.lcr),
            terminalbench_hard: round3(m.evaluations.terminalbench_hard),
            tau2: round3(m.evaluations.tau2),
        },
        pricing: {
            price_1m_blended_3_to_1: opt(m.pricing.price_1m_blended_3_to_1),
            price_1m_input_tokens: opt(m.pricing.price_1m_input_tokens),
            price_1m_output_tokens: opt(m.pricing.price_1m_output_tokens),
        },
        median_output_tokens_per_second: opt(m.median_output_tokens_per_second),
        median_time_to_first_token_seconds: opt(
            m.median_time_to_first_token_seconds,
        ),
    };
}

function parseFrontmatter(content: string): {
    data: Record<string, unknown>;
    body: string;
} {
    const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!m) return { data: {}, body: content };
    const data: Record<string, unknown> = {};
    const lines = m[1].split("\n");
    let currentKey = "";
    let currentArray: string[] = [];
    for (const line of lines) {
        if (line.trimStart().startsWith("- ")) {
            const v = line.trimStart().substring(2).trim();
            if (v) currentArray.push(v);
            continue;
        }
        if (currentArray.length > 0 && !line.includes(":")) {
            data[currentKey] = [...currentArray];
            currentArray = [];
        }
        const ci = line.indexOf(":");
        if (ci > 0) {
            const k = line.substring(0, ci).trim();
            const v = line.substring(ci + 1).trim();
            if (currentArray.length > 0) {
                data[currentKey] = [...currentArray];
                currentArray = [];
            }
            if (v === "") {
                currentKey = k;
            } else {
                data[k] = v;
                currentKey = "";
            }
        }
    }
    if (currentArray.length > 0) data[currentKey] = currentArray;
    return { data, body: m[2] };
}

function parsePostMeta(content: string, key: string): PostListItem | null {
    const { data } = parseFrontmatter(content);
    const slug = key.replace("articles/", "").replace(".md", "");
    const tv = data.tags;
    const tags: string[] = Array.isArray(tv)
        ? tv.filter((t): t is string => typeof t === "string")
        : typeof tv === "string"
          ? tv
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
          : [];
    const post: PostListItem = {
        slug,
        title: (data.title as string) || "",
        date: (data.date as string) || "",
        description: (data.description as string) || "",
        tags,
        published: data.published !== "false",
        coverImage: data.coverImage as string | undefined,
        author: (data.author as string) || "Kurashizu",
        draft: data.draft === "true",
    };
    if (post.draft || !post.published) return null;
    return post;
}

async function fetchGithubRepos(): Promise<GitHubRepo[]> {
    const res = await fetch(
        "https://api.github.com/users/kurashizu/repos?sort=stars&per_page=6&type=public",
        {
            headers: {
                "User-Agent": "Kurashizu-Blog-Cache",
                Accept: "application/vnd.github.v3+json",
            },
        },
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const repos = await res.json<GitHubRepo[]>();
    return repos.filter((r) => !r.fork).slice(0, 6);
}

async function fetchStarredRepos(): Promise<GitHubRepo[]> {
    const res = await fetch(
        "https://api.github.com/users/kurashizu/starred?per_page=10&sort=stars",
        {
            headers: {
                "User-Agent": "Kurashizu-Blog-Cache",
                Accept: "application/vnd.github.v3+json",
            },
        },
    );
    if (!res.ok) throw new Error(`GitHub starred API ${res.status}`);
    return await res.json<GitHubRepo[]>();
}

async function fetchLLMLeaderboard(apiKey: string): Promise<SlimModel[]> {
    const res = await fetch(
        "https://artificialanalysis.ai/api/v2/data/llms/models",
        {
            headers: {
                "x-api-key": apiKey,
                Accept: "application/json",
                "User-Agent": "Kurashizu-Blog-Cache",
            },
        },
    );
    if (!res.ok) throw new Error(`AA API ${res.status}`);
    const json = await res.json<AALeaderboardResponse>();
    // Project (drop unused fields, round 0–1 benchmarks, null → undefined)
    // then sort by intelligence index descending so the cache is already ranked.
    return json.data.map(projectModel).sort((a, b) => {
        const ai =
            a.evaluations.artificial_analysis_intelligence_index ?? -Infinity;
        const bi =
            b.evaluations.artificial_analysis_intelligence_index ?? -Infinity;
        return bi - ai;
    });
}

async function fetchContributions(
    token: string,
    username: string,
): Promise<ContributionsCache> {
    const query = `
        query($login: String!) {
            user(login: $login) {
                contributionsCollection {
                    contributionCalendar {
                        totalContributions
                        weeks {
                            contributionDays {
                                date
                                contributionCount
                            }
                        }
                    }
                }
            }
        }
    `;
    const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "Kurashizu-Blog-Cache",
        },
        body: JSON.stringify({ query, variables: { login: username } }),
    });
    if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`);
    const json = (await res.json()) as ContributionsGraphQLResponse;
    const calendar =
        json.data?.user?.contributionsCollection.contributionCalendar;
    if (!calendar) throw new Error("No contributionCalendar in response");
    const days = calendar.weeks
        .flatMap((w) => w.contributionDays)
        .map((d) => ({ date: d.date, count: d.contributionCount }));
    return {
        username,
        fetchedAt: new Date().toISOString(),
        totalContributions: calendar.totalContributions,
        days,
    };
}

async function buildArticleIndex(bucket: R2Bucket): Promise<PostListItem[]> {
    let cursor: string | undefined;
    const keys: string[] = [];
    do {
        const result = await bucket.list({ prefix: "articles/", cursor });
        keys.push(...result.objects.map((o) => o.key));
        cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);

    const posts: PostListItem[] = [];
    for (const key of keys) {
        if (!key.endsWith(".md")) continue;
        try {
            const obj = await bucket.get(key);
            if (!obj) continue;
            const meta = parsePostMeta(await obj.text(), key);
            if (meta) posts.push(meta);
        } catch {
            /* skip corrupt article */
        }
    }

    posts.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return posts;
}

async function refreshCache(env: Env): Promise<void> {
    const results: string[] = [];

    try {
        const repos = await fetchGithubRepos();
        if (repos.length > 0) {
            await env.BUCKET.put(
                "cache/github-repos.json",
                JSON.stringify(repos),
            );
            results.push("github-repos: OK");
        }
    } catch (e) {
        results.push(`github-repos: FAILED (${e})`);
    }

    try {
        const starred = await fetchStarredRepos();
        if (starred.length > 0) {
            await env.BUCKET.put(
                "cache/github-starred.json",
                JSON.stringify(starred),
            );
            results.push("github-starred: OK");
        }
    } catch (e) {
        results.push(`github-starred: FAILED (${e})`);
    }

    try {
        const posts = await buildArticleIndex(env.BUCKET);
        await env.BUCKET.put(
            "cache/articles-index.json",
            JSON.stringify(posts),
        );
        results.push(`articles-index: OK (${posts.length} posts)`);
    } catch (e) {
        results.push(`articles-index: FAILED (${e})`);
    }

    try {
        if (!env.ARTIFICIAL_ANALYSIS_API_KEY) {
            results.push(
                "llm-leaderboard: SKIPPED (ARTIFICIAL_ANALYSIS_API_KEY not set)",
            );
        } else {
            const models = await fetchLLMLeaderboard(
                env.ARTIFICIAL_ANALYSIS_API_KEY,
            );
            if (models.length > 0) {
                await env.BUCKET.put(
                    "cache/llm-leaderboard.json",
                    JSON.stringify(models),
                );
                results.push(`llm-leaderboard: OK (${models.length} models)`);
            } else {
                results.push("llm-leaderboard: SKIPPED (empty response)");
            }
        }
    } catch (e) {
        results.push(`llm-leaderboard: FAILED (${e})`);
    }

    try {
        if (!env.GITHUB_PERSONAL_ACCESS_TOKEN) {
            results.push(
                "github-contributions: SKIPPED (GITHUB_PERSONAL_ACCESS_TOKEN not set)",
            );
        } else if (!env.GH_USERNAME) {
            results.push("github-contributions: SKIPPED (GH_USERNAME not set)");
        } else {
            const data = await fetchContributions(
                env.GITHUB_PERSONAL_ACCESS_TOKEN,
                env.GH_USERNAME,
            );
            await env.BUCKET.put(
                "cache/github-contributions.json",
                JSON.stringify(data),
            );
            results.push(
                `github-contributions: OK (${data.days.length} days, ${data.totalContributions} total)`,
            );
        }
    } catch (e) {
        results.push(`github-contributions: FAILED (${e})`);
    }

    console.log("Cache refresh:", results.join(" | "));
}

export default {
    async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
        console.log("Cron trigger");
        await refreshCache(env);
    },

    async fetch(request: Request, env: Env): Promise<Response> {
        if (
            request.method === "POST" &&
            new URL(request.url).pathname === "/__refresh"
        ) {
            const auth = request.headers.get("Authorization");
            if (env.CRON_SECRET && auth !== `Bearer ${env.CRON_SECRET}`) {
                return new Response("Unauthorized", { status: 401 });
            }
            const logs: string[] = [];
            const origLog = console.log;
            console.log = (...args: unknown[]) => {
                logs.push(
                    args
                        .map((a) =>
                            typeof a === "string" ? a : JSON.stringify(a),
                        )
                        .join(" "),
                );
            };
            let success = true;
            try {
                await refreshCache(env);
            } catch (e) {
                success = false;
                logs.push(`FATAL: ${e}`);
            } finally {
                console.log = origLog;
            }
            return new Response(
                JSON.stringify({ success, logs: logs.join("\n") }, null, 2),
                {
                    headers: { "Content-Type": "application/json" },
                },
            );
        }
        return new Response("cf-blog-cache worker", { status: 200 });
    },
};
