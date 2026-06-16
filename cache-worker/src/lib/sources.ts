/**
 * External data fetchers: GitHub REST/GraphQL + Artificial Analysis LLM board.
 *
 * Each function is a thin wrapper around `fetch()` that:
 *  - Sets a consistent User-Agent so upstream logs are recognizable
 *  - Throws on non-2xx so the orchestrator (`refresh.ts`) can record the failure
 *  - Returns only the public fields the cache actually needs
 */
import { validateMarkdown } from "./validate-markdown";
import type {
    AALeaderboardResponse,
    AAModel,
    ContributionsCache,
    ContributionsGraphQLResponse,
    GitHubRepo,
    HNStory,
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
        median_output_tokens_per_second: opt(m.median_output_tokens_per_second),
        median_time_to_first_token_seconds: opt(
            m.median_time_to_first_token_seconds,
        ),
    };
}

// ---------- GitHub REST ----------

/**
 * Fetch ALL public repos for the configured user.
 * Handles pagination: GitHub returns 100 per page max, so most accounts
 * finish in 1-2 pages.
 */
export async function fetchGithubRepos(): Promise<GitHubRepo[]> {
    const all: GitHubRepo[] = [];
    let page = 1;
    for (;;) {
        const res = await fetch(
            `https://api.github.com/users/kurashizu/repos?per_page=100&page=${page}&type=public`,
            {
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept: "application/vnd.github.v3+json",
                },
            },
        );
        if (!res.ok) throw new Error(`GitHub API ${res.status}`);
        const repos = (await res.json()) as GitHubRepo[];
        if (repos.length === 0) break;
        all.push(...repos);
        page++;
    }
    return all;
}

/**
 * Fetch per-repo language breakdown from GitHub.
 * Returns sorted array of { name, bytes } descending by bytes.
 */
export async function fetchRepoLanguages(
    fullName: string,
): Promise<{ name: string; bytes: number }[]> {
    const res = await fetch(
        `https://api.github.com/repos/${fullName}/languages`,
        {
            headers: {
                "User-Agent": USER_AGENT,
                Accept: "application/vnd.github.v3+json",
            },
        },
    );
    if (!res.ok) throw new Error(`GitHub languages API ${res.status}`);
    const raw = (await res.json()) as Record<string, number>;
    return Object.entries(raw)
        .map(([name, bytes]) => ({ name, bytes }))
        .sort((a, b) => b.bytes - a.bytes);
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
    return json.data.map(projectModel).sort((a, b) => {
        const ai =
            a.evaluations.artificial_analysis_intelligence_index ?? -Infinity;
        const bi =
            b.evaluations.artificial_analysis_intelligence_index ?? -Infinity;
        return bi - ai;
    });
}

// ---------- Hacker News Fetching ----------

function extractDomain(url: string | null): string | null {
    if (!url) return null;
    try {
        const u = new URL(url);
        return u.hostname.replace(/^www\./, "");
    } catch {
        return null;
    }
}

interface HNItemRaw {
    id: number;
    title?: string;
    url?: string;
    score?: number;
    by?: string;
    time?: number;
    descendants?: number;
}

export async function fetchHNNews(count: number = 5): Promise<HNStory[]> {
    const idsRes = await fetch(
        "https://hacker-news.firebaseio.com/v0/topstories.json",
    );
    if (!idsRes.ok) throw new Error(`HN topstories ${idsRes.status}`);
    const allIds = (await idsRes.json()) as number[];
    const topIds = allIds.slice(0, count);

    const items = await Promise.all(
        topIds.map(async (id) => {
            const itemRes = await fetch(
                `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
            );
            if (!itemRes.ok)
                throw new Error(`HN item ${id}: ${itemRes.status}`);
            return (await itemRes.json()) as HNItemRaw;
        }),
    );

    return items.map((item) => ({
        id: item.id,
        title: item.title ?? "(no title)",
        url: item.url ?? null,
        score: item.score ?? 0,
        by: item.by ?? "unknown",
        time: item.time ?? 0,
        descendants: item.descendants ?? 0,
        domain: extractDomain(item.url ?? null),
        summary: "",
    }));
}

// ---------- Single-item LLM Rewrite ----------

const GEMINI_MODEL = "gemma-4-31b-it";

function extractPageContent(html: string): { text: string; images: string[] } {
    const withoutScripts = html.replace(
        /<script[^>]*>[\s\S]*?<\/script>/gi,
        " ",
    );
    const withoutStyles = withoutScripts.replace(
        /<style[^>]*>[\s\S]*?<\/style>/gi,
        " ",
    );
    const withoutNav = withoutStyles.replace(
        /<nav[^>]*>[\s\S]*?<\/nav>/gi,
        " ",
    );
    const withoutFooter = withoutNav.replace(
        /<footer[^>]*>[\s\S]*?<\/footer>/gi,
        " ",
    );

    const imageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const images: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = imageRegex.exec(withoutFooter)) !== null) {
        const src = m[1];
        if (src.startsWith("http") && !images.includes(src)) {
            const altMatch = m[0].match(/alt=["']([^"']*)["']/i);
            const alt = altMatch ? altMatch[1] : "";
            images.push(`![${alt}](${src})`);
        }
    }

    const text = withoutFooter
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const lines = text.split(/(?<=[.!?])\s+/);
    const substantial = lines.filter((l) => l.length > 60);
    return {
        text: substantial.length > 3 ? substantial.join("\n\n") : text,
        images: images.slice(0, 10),
    };
}

export async function generateItemRewrite(
    story: HNStory,
    apiKey: string,
): Promise<string> {
    let articleContent: string;

    if (story.url) {
        try {
            const res = await fetch(story.url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; Kurashizu-Bot)",
                },
                signal: AbortSignal.timeout(10000),
            });
            if (res.ok) {
                const html = await res.text();
                const { text, images } = extractPageContent(html);
                const textPart = text.slice(0, 6000);
                const imagePart =
                    images.length > 0
                        ? `\n\nImages from the article:\n${images.join("\n")}`
                        : "";
                articleContent = `Title: ${story.title}\n\n${textPart}${imagePart}`;
            } else {
                articleContent = `Title: ${story.title}`;
            }
        } catch {
            articleContent = `Title: ${story.title}`;
        }
    } else {
        articleContent = `Title: ${story.title}`;
    }

    const prompt = `Rewrite this article in your own words, preserving all content, details, and nuance. Output must be roughly the same length as the original. Use every Markdown feature that fits: headings, bold, italic, lists, tables, blockquotes, inline code, code blocks, images, Mermaid diagrams (\`\`\`mermaid), strikethrough, task lists, and LaTeX math where appropriate. Do not wrap the entire output in a code block.\n\n${articleContent}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 4096,
            },
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Gemini ${res.status}: ${body}`);
    }
    const json = (await res.json()) as {
        candidates?: {
            content?: { parts?: { text?: string; thought?: boolean }[] };
        }[];
    };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("")
        .trim();
    if (!text) throw new Error("Gemini returned empty response");

    await validateMarkdown(text);
    return text;
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
