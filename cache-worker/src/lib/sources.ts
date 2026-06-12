/**
 * External data fetchers: GitHub REST/GraphQL + Artificial Analysis LLM board.
 *
 * Each function is a thin wrapper around `fetch()` that:
 *  - Sets a consistent User-Agent so upstream logs are recognizable
 *  - Throws on non-2xx so the orchestrator (`refresh.ts`) can record the failure
 *  - Returns only the public fields the cache actually needs
 */
import type {
    AALeaderboardResponse,
    AAModel,
    ContributionsCache,
    ContributionsGraphQLResponse,
    GitHubRepo,
    SlimModel,
} from "../types";

const USER_AGENT = "Kurashizu-Blog-Cache";

const opt = <T>(v: T | null | undefined): T | undefined =>
    v === undefined || v === null ? undefined : v;

const round3 = (n: number | null | undefined): number | undefined => {
    if (n === undefined || n === null) return undefined;
    return Math.round(n * 1000) / 1000;
};

/** Project an AAModel down to the public SlimModel shape. */
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
        median_output_tokens_per_second: opt(
            m.median_output_tokens_per_second,
        ),
        median_time_to_first_token_seconds: opt(
            m.median_time_to_first_token_seconds,
        ),
    };
}

// ---------- GitHub REST ----------

export async function fetchGithubRepos(): Promise<GitHubRepo[]> {
    const res = await fetch(
        "https://api.github.com/users/kurashizu/repos?sort=stars&per_page=6&type=public",
        {
            headers: {
                "User-Agent": USER_AGENT,
                Accept: "application/vnd.github.v3+json",
            },
        },
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const repos = (await res.json()) as GitHubRepo[];
    return repos.filter((r) => !r.fork).slice(0, 6);
}

export async function fetchStarredRepos(): Promise<GitHubRepo[]> {
    const res = await fetch(
        "https://api.github.com/users/kurashizu/starred?per_page=10&sort=stars",
        {
            headers: {
                "User-Agent": USER_AGENT,
                Accept: "application/vnd.github.v3+json",
            },
        },
    );
    if (!res.ok) throw new Error(`GitHub starred API ${res.status}`);
    return (await res.json()) as GitHubRepo[];
}

// ---------- Artificial Analysis ----------

export async function fetchLLMLeaderboard(
    apiKey: string,
): Promise<SlimModel[]> {
    const res = await fetch(
        "https://artificialanalysis.ai/api/v2/data/llms/models",
        {
            headers: {
                "x-api-key": apiKey,
                Accept: "application/json",
                "User-Agent": USER_AGENT,
            },
        },
    );
    if (!res.ok) throw new Error(`AA API ${res.status}`);
    const json = (await res.json()) as AALeaderboardResponse;
    // Project + sort by intelligence index so the cache is already ranked.
    return json.data
        .map(projectModel)
        .sort((a, b) => {
            const ai =
                a.evaluations.artificial_analysis_intelligence_index ??
                -Infinity;
            const bi =
                b.evaluations.artificial_analysis_intelligence_index ??
                -Infinity;
            return bi - ai;
        });
}

// ---------- GitHub GraphQL (contributions) ----------

export async function fetchContributions(
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
            "User-Agent": USER_AGENT,
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
