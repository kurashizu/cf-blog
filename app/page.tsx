import Link from "next/link";
import { createArticlesRepo } from "@/lib/articles";
import { formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { MiniCard } from "@/components/ui/MiniCard";

export const dynamic = "force-dynamic";

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
}

async function getGitHubRepos(): Promise<GitHubRepo[]> {
  try {
    const res = await fetch(
      "https://api.github.com/users/kurashizu/repos?sort=stars&per_page=6&type=public",
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const repos = await res.json() as GitHubRepo[];
    return repos.filter((r) => !r.fork).slice(0, 6);
  } catch {
    return [];
  }
}

function FeaturedPost({ post }: { post: Post }) {
  return (
    <Link href={`/blog/${post.slug}`} className="block">
      <Card className="h-full group">
        <div className="p-3 pb-1.5 shrink-0">
          <span className="text-xs text-text-muted">{formatDate(post.date)}</span>
        </div>
        <CardContent className="flex-1 p-3 pt-1.5">
          <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors line-clamp-1">{post.title}</h3>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function HomePage() {
  let recentPosts: Post[] = [];
  let error: string | null = null;

  try {
    const repo = createArticlesRepo();
    recentPosts = await repo.getRecent(3);
  } catch (e) {
    error = "Unable to load posts at this time.";
  }

  const repos = await getGitHubRepos();

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Hero section */}
      <section className="text-center mb-12">
        <h1 className="hero-title mb-3">Hello, I&apos;m kurashizu</h1>
        <p className="hero-subtitle mb-4">Vibe Coding & AI Agent</p>
        <p className="hero-bio max-w-xl mx-auto">
          Building tools that amplify human creativity. Exploring agentic workflows,
          LLM orchestration, and the future of human-AI collaboration. Ships code that matters.
        </p>
        <div className="flex justify-center gap-3 mt-6">
          <Link href="/blog" className="inline-flex items-center px-5 py-2.5 bg-accent/80 text-white rounded-lg font-medium hover:bg-accent-hover transition-all hover:-translate-y-0.5">
            Explore Posts
          </Link>
          <Link href="/about" className="inline-flex items-center px-5 py-2.5 bg-bg-card border border-border text-text-primary rounded-lg font-medium hover:border-accent hover:text-accent transition-all">
            About Me
          </Link>
        </div>
      </section>

      {/* Bottom two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* GitHub repos - left column */}
        <section>
          <h2 className="section-title mb-3">GitHub Projects</h2>
          <div className="space-y-3">
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
                    <span className="text-xs text-text-muted shrink-0 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                      {repo.stargazers_count}
                    </span>
                  </div>
                  {repo.description && (
                    <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{repo.description}</p>
                  )}
                </MiniCard>
              </a>
            ))}
          </div>
          <a
            href="https://github.com/kurashizu"
            target="_blank"
            rel="noopener noreferrer"
            className="view-all-link mt-3 inline-block"
          >
            View all on GitHub
          </a>
        </section>

        {/* Recent posts - right column */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title mb-0">Recent Posts</h2>
            <Link href="/blog" className="view-all-link">
              All posts
            </Link>
          </div>

          {error ? (
            <Card>
              <CardContent className="text-center text-text-muted p-4">{error}</CardContent>
            </Card>
          ) : recentPosts.length === 0 ? (
            <Card>
              <CardContent className="text-center p-4">
                <p className="text-text-muted mb-2 text-sm">No posts yet.</p>
                <Link href="/admin/editor/new" className="text-accent hover:text-accent-hover transition-colors text-sm">
                  Write the first post
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentPosts.map((post) => (
                <FeaturedPost key={post.slug} post={post} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}