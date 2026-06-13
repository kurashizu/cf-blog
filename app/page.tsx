import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { MiniCard } from "@/components/ui/MiniCard";
import { HeroHeader } from "@/components/hero/HeroHeader";
import { r2Paths } from "@/lib/r2-paths";
import { r2Get } from "@/lib/r2";
import { getDB } from "@/lib/d1";
import { GuestbookMessages } from "@/components/guestbook/GuestbookMessages";
import { GadgetsPanel } from "@/components/gadgets/GadgetsPanel";
import { NewsSection } from "@/components/news/NewsSection";
import { type ContributionsCache } from "@/lib/contributions";
import { type Language, getTopLanguages } from "@/lib/languages";
import { ContributionsRibbon } from "@/components/activity/ContributionsRibbon";
import { DonutChart } from "@/components/activity/DonutChart";
import { VisitorTerminal } from "@/components/visitor/VisitorTerminal";

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
    name: string;
    description: string | null;
    html_url: string;
    stargazers_count: number;
    fork: boolean;
    owner: {
        login: string;
    };
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

async function readCache<T>(path: string): Promise<T[]> {
    try {
        const data = await r2Get(path);
        return JSON.parse(data) as T[];
    } catch {
        return [];
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
    const [repos, allPosts, contributions, topLanguages] = await Promise.all([
        readCache<GitHubRepo>(r2Paths.githubReposCache),
        readCache<Post>(r2Paths.articlesIndexCache),
        readContributions(),
        getTopLanguages(5),
    ]);

    const hnNews: HNStory[] = await (async () => {
        try {
            const db = getDB();
            const rows = await db
                .prepare("SELECT * FROM news_items ORDER BY time DESC LIMIT 5")
                .all();
            return (rows.results ?? []) as unknown as HNStory[];
        } catch {
            return [];
        }
    })();

    // Visitor geolocation is fetched client-side from /api/visitor-info
    // after the page loads (see HeroHeader). Doing it here in SSR used to
    // block the first byte on a third-party API (ip-api.com, 3 s timeout)
    // and force the whole page into dynamic rendering.

    const recentPosts = allPosts.slice(0, 5);

    return (
        <div className="max-w-4xl mx-auto px-4 py-6 md:py-12">
            {/* Hero section */}
            <section className="mb-8 md:mb-12">
                <div className="text-center mb-6 md:mb-8">
                    <HeroHeader title="Inside the Mind of Kurashizu" />
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-6">
                    <div
                        className="flex-1 animate-fade-up"
                        style={{ animationDelay: "200ms" }}
                    >
                        <VisitorTerminal />
                    </div>
                    {topLanguages.length > 0 && (
                        <div
                            className="shrink-0 mx-auto md:mx-0 animate-fade-zoom"
                            style={{ animationDelay: "200ms" }}
                        >
                            <DonutChart languages={topLanguages} />
                        </div>
                    )}
                </div>

                {contributions && (
                    <div
                        className="mt-8 animate-fade-up"
                        style={{ animationDelay: "280ms" }}
                    >
                        <ContributionsRibbon data={contributions} />
                    </div>
                )}
            </section>

            {/* 4-section grid layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {/* News - left top */}
                {hnNews.length > 0 && (
                    <div className="h-full">
                        <NewsSection stories={hnNews} />
                    </div>
                )}

                {/* Recent Posts - right top */}
                <section className="flex flex-col h-full">
                    <div
                        className="flex items-center justify-between mb-3 animate-fade-up"
                        style={{ animationDelay: "360ms" }}
                    >
                        <h2 className="section-title mb-0">Recent Posts</h2>
                        <Link href="/blog" className="view-all-link">
                            All posts
                        </Link>
                    </div>

                    {recentPosts.length === 0 ? (
                        <Card
                            className="flex-1 animate-fade-up-sm"
                            style={{ animationDelay: "420ms" }}
                        >
                            <CardContent className="text-center p-4">
                                <p className="text-text-muted mb-2 text-sm">
                                    No posts yet.
                                </p>
                                <Link
                                    href="/admin/editor/new"
                                    className="text-accent hover:text-accent-hover transition-colors text-sm"
                                >
                                    Write the first post
                                </Link>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {recentPosts.map((post, i) => (
                                <FeaturedPost
                                    key={post.slug}
                                    post={post}
                                    delayMs={420 + i * 50}
                                />
                            ))}
                        </div>
                    )}
                </section>

                {/* GitHub Projects - left bottom */}
                <section className="flex flex-col h-full">
                    <div
                        className="flex items-center justify-between mb-3 animate-fade-up"
                        style={{ animationDelay: "520ms" }}
                    >
                        <h2 className="section-title mb-0">GitHub Projects</h2>
                        <a
                            href="https://github.com/kurashizu"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="view-all-link"
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
                                className="block animate-fade-up-sm"
                                style={{ animationDelay: `${580 + i * 50}ms` }}
                            >
                                <MiniCard className="group">
                                    <div className="flex items-center justify-between gap-2">
                                        <code className="text-sm text-accent font-mono group-hover:text-accent-hover transition-colors truncate">
                                            {repo.name}
                                        </code>
                                        <span className="text-xs text-text-muted shrink-0 flex items-center gap-1.5">
                                            <svg
                                                className="w-3.5 h-3.5"
                                                fill="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                            </svg>
                                            {repo.stargazers_count}
                                        </span>
                                    </div>
                                    {repo.description && (
                                        <p className="text-xs text-text-muted mt-0.5 line-clamp-1 max-w-full sm:max-w-[70%]">
                                            {repo.description}
                                        </p>
                                    )}
                                </MiniCard>
                            </a>
                        ))}
                    </div>
                </section>

                {/* Gadgets — right bottom */}
                <section className="flex flex-col h-full">
                    <div
                        className="flex items-center justify-between mb-3 animate-fade-up"
                        style={{ animationDelay: "520ms" }}
                    >
                        <h2 className="section-title mb-0">Gadgets</h2>
                    </div>
                    <Card
                        className="flex-1 p-4 h-full animate-fade-zoom"
                        style={{ animationDelay: "600ms" }}
                    >
                        <GadgetsPanel />
                    </Card>
                </section>
            </div>

            {/* Guestbook section */}
            <section className="mt-8 md:mt-12">
                <div
                    className="flex items-center gap-4 mb-4 animate-fade-up"
                    style={{ animationDelay: "700ms" }}
                >
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                    <h2 className="section-title mb-0 shrink-0 px-2">
                        Guestbook
                    </h2>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                </div>
                <div
                    className="animate-fade-up"
                    style={{ animationDelay: "780ms" }}
                >
                    <GuestbookMessages />
                </div>
            </section>
        </div>
    );
}
