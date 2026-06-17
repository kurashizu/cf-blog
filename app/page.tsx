import "@/components/activity/activity.css";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { MiniCard } from "@/components/ui/MiniCard";
import { HeroHeader } from "@/components/hero/HeroHeader";
import { r2Paths } from "@/lib/r2-paths";
import { r2Get } from "@/lib/r2";
import { getDB } from "@/lib/d1";
import { getLanguageColor, type Language } from "@/lib/languages";
import { GuestbookMessages } from "@/components/guestbook/GuestbookMessages";
import { GadgetsPanel } from "@/components/gadgets/GadgetsPanel";
import { NewsSection } from "@/components/news/NewsSection";
import { type ContributionsCache } from "@/lib/contributions";
import { ContributionsRibbon } from "@/components/activity/ContributionsRibbon";
import { DonutChart } from "@/components/activity/DonutChart";
import { VisitorTerminal } from "@/components/visitor/VisitorTerminal";

export const dynamic = "force-dynamic";

// The home page is fully dynamic (R2 reads on every request) so the R2
// cache-worker only needs to refresh every 30 min. Visitor geolocation is
// fetched client-side from /api/visitor-info *after* the page loads (see
// HeroHeader), so SSR is never blocked by a third-party API call.

interface Post {
    slug: string;
    title: string;
    date: string;
    description?: string;
    tags?: string[];
}

interface GitHubRepo {
    id: number;
    name: string;
    description: string | null;
    html_url: string;
    stargazers_count: number;
    fork: number;
    languages_json: string;
}

interface RepoLanguage {
    name: string;
    pct: number;
}

interface HNStory {
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

interface RepoRow {
    id: number;
    name: string;
    description: string | null;
    html_url: string;
    stargazers_count: number;
    fork: number;
    language: string | null;
    languages_json: string;
}

async function readReposAndLanguages(limit = 5) {
    try {
        const db = getDB();
        const rows = await db
            .prepare(
                "SELECT id, name, description, html_url, stargazers_count, fork, language, languages_json FROM github_repos WHERE fork = 0 ORDER BY stargazers_count DESC",
            )
            .all();
        const all = (rows.results ?? []) as unknown as RepoRow[];

        // Top 6 repos for display
        const repos: GitHubRepo[] = all.slice(0, 6);

        // Language stats from ALL repos
        const counts: Record<string, number> = {};
        for (const r of all) {
            if (!r.language) continue;
            counts[r.language] = (counts[r.language] || 0) + 1;
        }
        const total = Object.values(counts).reduce((s, c) => s + c, 0);
        const languages: Language[] = Object.entries(counts)
            .map(([name, count]) => ({
                name,
                count,
                percentage: Math.round((count / total) * 100),
                color: getLanguageColor(name),
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);

        return { repos, languages };
    } catch {
        return { repos: [] as GitHubRepo[], languages: [] as Language[] };
    }
}

async function readContributions(): Promise<ContributionsCache | null> {
    try {
        const data = await r2Get(r2Paths.githubContributionsCache);
        return JSON.parse(data) as ContributionsCache;
    } catch {
        return null;
    }
}

const LANG_ABBR: Record<string, string> = {
    TypeScript: "TS",
    JavaScript: "JS",
    Python: "PY",
    Go: "GO",
    Rust: "RS",
    Java: "JV",
    "C++": "C++",
    C: "C",
    "C#": "C#",
    Ruby: "RB",
    PHP: "PHP",
    Swift: "SW",
    Kotlin: "KT",
    HTML: "HTML",
    CSS: "CSS",
    Shell: "SH",
    Lua: "LUA",
    Elixir: "EX",
    Haskell: "HS",
    Dart: "DR",
    Vue: "VUE",
    Svelte: "SVT",
    Nix: "NIX",
    Zig: "ZIG",
    Solid: "SOL",
    Dockerfile: "DKR",
    Procfile: "PROC",
    Makefile: "MKE",
};

function langAbbr(name: string): string {
    return LANG_ABBR[name] || name.slice(0, 3).toUpperCase();
}

function LanguageBadge({ languagesJson }: { languagesJson: string }) {
    let langs: RepoLanguage[] = [];
    try {
        langs = JSON.parse(languagesJson);
    } catch {
        /* ignore */
    }
    if (langs.length === 0) return null;

    return (
        <span className="text-xs text-text-muted shrink-0 flex items-center gap-2.5">
            {langs.map((l) => (
                <span key={l.name} className="flex items-center gap-1">
                    <span
                        className="w-2 h-2 rounded-sm"
                        style={{ backgroundColor: getLanguageColor(l.name) }}
                    />
                    <span className="font-medium">{langAbbr(l.name)}</span>
                    {l.pct}%
                </span>
            ))}
        </span>
    );
}

function FeaturedPost({ post, delayMs }: { post: Post; delayMs: number }) {
    const excerpt = post.description?.slice(0, 20) || "";
    const tags = Array.isArray(post.tags) ? post.tags : [];
    return (
        <Link
            href={`/blog/${post.slug}`}
            className="block animate-fade-up-sm"
            style={{ animationDelay: `${delayMs}ms` }}
        >
            <Card className="h-full group">
                <div className="p-3 flex flex-col justify-between h-full">
                    <div>
                        <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors line-clamp-1">
                            {post.title}
                        </h3>
                        {excerpt && (
                            <p className="text-xs text-text-muted mt-0.5 line-clamp-1 max-w-full sm:max-w-[70%]">
                                {excerpt}...
                            </p>
                        )}
                    </div>
                    <div className="flex items-end justify-between gap-2 mt-1">
                        <div className="flex flex-wrap gap-1.5 min-w-0">
                            {tags.slice(0, 2).map((tag) => (
                                <span
                                    key={tag}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-bg-card border border-border text-text-muted"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                        <span className="text-xs text-text-muted shrink-0">
                            {formatDate(post.date)}
                        </span>
                    </div>
                </div>
            </Card>
        </Link>
    );
}

export default async function HomePage() {
    const db = getDB();

    const [{ repos, languages }, contributions, newsRows, postRows] =
        await Promise.all([
            readReposAndLanguages(5),
            readContributions(),
            db
                .prepare(
                    `SELECT * FROM news_items
                     ORDER BY time DESC LIMIT 5`,
                )
                .all()
                .then((r) => (r.results ?? []) as unknown as HNStory[])
                .catch(() => [] as HNStory[]),
            db
                .prepare(
                    `SELECT slug, title, excerpt as description,
                        published_at as date, tags, cover_image
                     FROM posts
                     WHERE status = 'published'
                     ORDER BY published_at DESC
                     LIMIT 5`,
                )
                .all()
                .then((r) =>
                    ((r.results ?? []) as unknown as Post[]).map((p) => ({
                        ...p,
                        tags:
                            typeof p.tags === "string"
                                ? JSON.parse(p.tags as string)
                                : p.tags,
                    })),
                )
                .catch(() => [] as Post[]),
        ]);

    // Visitor geolocation is fetched client-side from /api/visitor-info
    // after the page loads (see HeroHeader). Doing it here in SSR used to
    // block the first byte on a third-party API (ip-api.com, 3 s timeout)
    // and force the whole page into dynamic rendering.

    return (
        <div className="max-w-4xl mx-auto px-4 py-6 md:py-12">
            {/* Hero section */}
            <section className="mb-8 md:mb-12">
                <div className="text-center mb-6 md:mb-8">
                    <HeroHeader title="Inside the Mind of Kurashizu" />
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <div className="flex-1">
                        <VisitorTerminal />
                    </div>
                    {languages.length > 0 && (
                        <div
                            className="shrink-0 mx-auto md:mx-0 animate-fade-up"
                            style={{ animationDelay: "0ms" }}
                        >
                            <DonutChart languages={languages} />
                        </div>
                    )}
                </div>

                {contributions && (
                    <div
                        className="mt-8 animate-fade-up"
                        style={{ animationDelay: "0ms" }}
                    >
                        <ContributionsRibbon data={contributions} />
                    </div>
                )}
            </section>

            {/* 4-section grid layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {/* News - left top */}
                {newsRows.length > 0 && (
                    <div className="h-full">
                        <NewsSection stories={newsRows} />
                    </div>
                )}

                {/* Recent Posts - right top */}
                <section className="flex flex-col h-full">
                    <div
                        className="flex items-center justify-between mb-3 animate-fade-up"
                        style={{ animationDelay: "0ms" }}
                    >
                        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-0">
                            Recent Posts
                        </h2>
                        <Link
                            href="/blog"
                            className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-accent hover:gap-3 transition-all"
                        >
                            All posts
                        </Link>
                    </div>

                    {postRows.length === 0 ? (
                        <Card className="flex-1">
                            <CardContent className="text-center p-4">
                                <p className="text-text-muted mb-2 text-sm">
                                    No posts yet.
                                </p>
                                <Link
                                    href="/admin/editor/new"
                                    prefetch={false}
                                    className="text-accent hover:text-accent-hover transition-colors text-sm"
                                >
                                    Write the first post
                                </Link>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {postRows.map((post, i) => (
                                <FeaturedPost
                                    key={post.slug}
                                    post={post}
                                    delayMs={60 + i * 40}
                                />
                            ))}
                        </div>
                    )}
                </section>

                {/* Gadgets — left bottom */}
                <section className="flex flex-col h-full">
                    <div
                        className="flex items-center justify-between mb-3 animate-fade-up"
                        style={{ animationDelay: "0ms" }}
                    >
                        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-0">
                            Gadgets
                        </h2>
                    </div>
                    <Card
                        className="flex-1 p-4 h-full animate-fade-up"
                        style={{ animationDelay: "60ms" }}
                    >
                        <GadgetsPanel />
                    </Card>
                </section>

                {/* GitHub Projects - right bottom */}
                <section className="flex flex-col h-full">
                    <div
                        className="flex items-center justify-between mb-3 animate-fade-up"
                        style={{ animationDelay: "0ms" }}
                    >
                        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-0">
                            GitHub Projects
                        </h2>
                        <a
                            href="https://github.com/kurashizu"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-accent hover:gap-3 transition-all"
                        >
                            View all on GitHub
                        </a>
                    </div>
                    <div className="space-y-3">
                        {repos.slice(0, 6).map((repo, i) => (
                            <a
                                key={repo.name}
                                href={repo.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                            >
                                <MiniCard className="group">
                                    <div className="flex items-center justify-between gap-2">
                                        <code className="text-sm text-accent font-mono group-hover:text-accent-hover transition-colors truncate">
                                            {repo.name}
                                        </code>
                                        <LanguageBadge
                                            languagesJson={repo.languages_json}
                                        />
                                    </div>
                                    <div className="flex items-end justify-between gap-2 mt-0.5">
                                        {repo.description ? (
                                            <p className="text-xs text-text-muted line-clamp-1 min-w-0">
                                                {repo.description}
                                            </p>
                                        ) : (
                                            <span />
                                        )}
                                        <span className="text-xs text-text-muted shrink-0 flex items-center gap-1">
                                            <svg
                                                className="w-3 h-3"
                                                fill="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                            </svg>
                                            {repo.stargazers_count}
                                        </span>
                                    </div>
                                </MiniCard>
                            </a>
                        ))}
                    </div>
                </section>
            </div>

            {/* Guestbook section */}
            <section className="mt-8 md:mt-12">
                <div
                    className="flex items-center gap-4 mb-4 animate-fade-up"
                    style={{ animationDelay: "0ms" }}
                >
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                    <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-0 shrink-0 px-2">
                        Guestbook
                    </h2>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                </div>
                <div
                    className="animate-fade-up"
                    style={{ animationDelay: "60ms" }}
                >
                    <GuestbookMessages />
                </div>
            </section>
        </div>
    );
}
