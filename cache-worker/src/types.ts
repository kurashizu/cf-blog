/**
 * Shared type definitions for the cache-worker.
 *
 * Three layers of shapes:
 *  - Upstream payloads (`AAModel`, `GitHubRepo`, `ContributionsGraphQLResponse`)
 *  - Cache objects written to R2 (`PostListItem`, `SlimModel`, `ContributionsCache`)
 *  - The `Env` interface that wrangler.toml binds into the handler context.
 */

export interface GitHubRepo {
    name: string;
    description: string | null;
    html_url: string;
    stargazers_count: number;
    fork: boolean;
    owner: { login: string };
}

export interface PostListItem {
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

export interface AAEvaluations {
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

export interface AAPricing {
    price_1m_blended_3_to_1?: number | null;
    price_1m_input_tokens?: number | null;
    price_1m_output_tokens?: number | null;
}

export interface AAModel {
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

export interface AALeaderboardResponse {
    status: number;
    data: AAModel[];
}

export interface HNStory {
    id: number;
    title: string;
    url: string | null;
    score: number;
    by: string;
    time: number;
    descendants: number;
    domain: string | null;
    summary: string;
}

export interface Env {
    DB: D1Database;
    BUCKET: R2Bucket;
    CRON_SECRET?: string;
    ARTIFICIAL_ANALYSIS_API_KEY?: string;
    GITHUB_PERSONAL_ACCESS_TOKEN?: string;
    GH_USERNAME?: string;
    GEMINI_API_KEY?: string;
}

export interface ContributionDayRaw {
    date: string;
    contributionCount: number;
}

export interface ContributionsGraphQLResponse {
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

export interface ContributionsCache {
    username: string;
    fetchedAt: string;
    totalContributions: number;
    days: { date: string; count: number }[];
}

/** Shape written to R2: slimmed-down projection of AAModel. */
export interface SlimModel {
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
