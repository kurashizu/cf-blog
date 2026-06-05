import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { MiniCard } from "@/components/ui/MiniCard";
import { r2Paths } from "@/lib/r2-paths";
import { r2Get } from "@/lib/r2";
import { GuestbookMessages } from "@/components/guestbook/GuestbookMessages";
import { GadgetsPanel } from "@/components/ui/GadgetsPanel";
import { type LLMModel } from "@/components/llm/LLMLeaderboardPanel";

export const revalidate = 300;

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

async function readCache<T>(path: string): Promise<T[]> {
    try {
        const data = await r2Get(path);
        return JSON.parse(data) as T[];
    } catch {
        return [];
    }
}

function FeaturedPost({ post }: { post: Post }) {
    const excerpt = post.description?.slice(0, 20) || "";
    return (
        <Link href={`/blog/${post.slug}`} className="block">
            <Card className="h-full group">
                <div className="p-3 flex flex-col justify-between h-full">
                    <div>
                        <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors line-clamp-1">
                            {post.title}
                        </h3>
                        {excerpt && (
                            <p className="text-xs text-text-muted mt-0.5 line-clamp-1 max-w-[70%]">
                                {excerpt}...
                            </p>
                        )}
                    </div>
                    <div className="flex justify-end mt-1">
                        <span className="text-xs text-text-muted">
                            {formatDate(post.date)}
                        </span>
                    </div>
                </div>
            </Card>
        </Link>
    );
}

export default async function HomePage() {
    const [repos, starredRepos, allPosts, llmModels] = await Promise.all([
        readCache<GitHubRepo>(r2Paths.githubReposCache),
        readCache<GitHubRepo>(r2Paths.githubStarredCache),
        readCache<Post>(r2Paths.articlesIndexCache),
        readCache<LLMModel>(r2Paths.llmLeaderboardCache),
    ]);

    const recentPosts = allPosts.slice(0, 4);

    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            {/* Hero section */}
            <section className="text-center mb-12">
                <h1 className="hero-title mb-3">Hello, I&apos;m kurashizu</h1>
                <p className="hero-subtitle mb-4">Vibe Coding & AI Agent</p>
                <p className="hero-bio max-w-xl mx-auto">
                    Building tools that amplify human creativity. Exploring
                    agentic workflows, LLM orchestration, and the future of
                    human-AI collaboration. Ships code that matters.
                </p>
                <div className="flex justify-center gap-3 mt-6">
                    <Link
                        href="/blog"
                        className="inline-flex items-center px-5 py-2.5 bg-accent/80 text-white rounded-lg font-medium hover:bg-accent-hover transition-all hover:-translate-y-0.5"
                    >
                        Explore Posts
                    </Link>
                    <Link
                        href="/about"
                        className="inline-flex items-center px-5 py-2.5 bg-bg-card/60 backdrop-blur-sm border border-border text-text-primary rounded-lg font-medium hover:border-accent hover:text-accent transition-all"
                    >
                        About Me
                    </Link>
                </div>
            </section>

            {/* 4-section grid layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* GitHub Projects - left top */}
                <section className="flex flex-col">
                    <div className="flex items-center justify-between mb-3">
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
                    <div className="flex-1 space-y-3">
                        {repos.slice(0, 5).map((repo) => (
                            <a
                                key={repo.name}
                                href={repo.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
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
                                        <p className="text-xs text-text-muted mt-0.5 line-clamp-1 max-w-[70%]">
                                            {repo.description}
                                        </p>
                                    )}
                                </MiniCard>
                            </a>
                        ))}
                    </div>
                </section>

                {/* Recent Posts - right top */}
                <section className="flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="section-title mb-0">Recent Posts</h2>
                        <Link href="/blog" className="view-all-link">
                            All posts
                        </Link>
                    </div>

                    {recentPosts.length === 0 ? (
                        <Card className="flex-1">
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
                        <div className="flex-1 space-y-2">
                            {recentPosts.map((post) => (
                                <FeaturedPost key={post.slug} post={post} />
                            ))}
                        </div>
                    )}
                </section>

                {/* Fav Repos - left bottom */}
                <section className="flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="section-title mb-0">Fav Repos</h2>
                        <a
                            href="https://github.com/kurashizu?tab=stars"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="view-all-link"
                        >
                            View all on GitHub
                        </a>
                    </div>
                    <div className="flex-1 space-y-3">
                        {starredRepos.slice(0, 7).map((repo) => (
                            <a
                                key={`${repo.owner.login}/${repo.name}`}
                                href={repo.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <MiniCard className="group">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <code className="text-sm text-accent font-mono group-hover:text-accent-hover transition-colors truncate">
                                                {repo.name}
                                            </code>
                                            <span className="text-xs text-text-muted shrink-0">
                                                /
                                            </span>
                                            <span className="text-xs text-text-muted shrink-0 truncate">
                                                {repo.owner.login}
                                            </span>
                                        </div>
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
                                        <p className="text-xs text-text-muted mt-0.5 line-clamp-1 max-w-[70%]">
                                            {repo.description}
                                        </p>
                                    )}
                                </MiniCard>
                            </a>
                        ))}
                    </div>
                </section>

                {/* Gadgets — right bottom */}
                <section className="flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="section-title mb-0">Gadgets</h2>
                    </div>
                    <Card className="flex-1 p-4 h-full">
                        <GadgetsPanel llmModels={llmModels} />
                    </Card>
                </section>
            </div>

            {/* Guestbook section */}
            <section className="mt-12">
                <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                    <h2 className="section-title mb-0 shrink-0 px-2">
                        Guestbook
                    </h2>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                </div>
                <GuestbookMessages />
            </section>
        </div>
    );
}
