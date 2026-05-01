import Link from "next/link";
import { createArticlesRepo } from "@/lib/articles";
import { formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";

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
        <div className="p-4 pb-2 shrink-0">
          <span className="article-meta">{formatDate(post.date)}</span>
        </div>
        <CardContent className="flex-1">
          <h3 className="article-title group-hover:text-accent transition-colors">{post.title}</h3>
          {post.description && (
            <p className="article-desc mt-1">{post.description}</p>
          )}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {post.tags.slice(0, 3).map((tag) => (
                <Tag key={tag} variant="default">{tag}</Tag>
              ))}
            </div>
          )}
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
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main content - left side */}
        <div className="flex-1">
          <section className="text-center mb-12">
            <h1 className="hero-title mb-3">Hello, I&apos;m kurashizu</h1>
            <p className="hero-subtitle mb-4">The AI &amp; Infrastructure</p>
            <p className="hero-bio max-w-xl mx-auto">
              An IT Master&apos;s student obsessed with automation, performance, and clean UI.
              Building agentic workflows, exploring HPC, and pushing the boundaries of human-computer interaction.
            </p>
            <div className="flex justify-center gap-3 mt-6">
              <Link href="/blog" className="inline-flex items-center px-5 py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-all hover:-translate-y-0.5">
                Explore Posts
              </Link>
              <Link href="/about" className="inline-flex items-center px-5 py-2.5 bg-bg-card border border-border text-text-primary rounded-lg font-medium hover:border-accent hover:text-accent transition-all">
                About Me
              </Link>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title mb-0">Recent Posts</h2>
              <Link href="/blog" className="view-all-link">
                All posts
              </Link>
            </div>

            {error ? (
              <Card>
                <CardContent className="text-center text-text-muted">{error}</CardContent>
              </Card>
            ) : recentPosts.length === 0 ? (
              <Card>
                <CardContent className="text-center">
                  <p className="text-text-muted mb-3">No posts yet.</p>
                  <Link href="/admin/editor/new" className="text-accent hover:text-accent-hover transition-colors text-sm">
                    Write the first post
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {recentPosts.map((post) => (
                  <FeaturedPost key={post.slug} post={post} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar - right side */}
        <div className="lg:w-80 shrink-0">
          <h2 className="section-title mb-4">GitHub Projects</h2>
          <div className="space-y-3">
            {repos.map((repo) => (
              <a
                key={repo.name}
                href={repo.html_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Card className="group hover:-translate-y-1">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <code className="text-sm text-accent font-mono group-hover:text-accent-hover transition-colors">
                        {repo.name}
                      </code>
                      <span className="text-xs text-text-muted shrink-0 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0l-1.45 1.45.85.85 1.6-1.6 1.6 1.6.85-.85L12 0zm0 4.8L8.8 7.6 10.4 9l-1.6 1.6 1.4 1.4 1.6-1.6 1.6 1.6.85-.85L12 4.8zm-2 5.7v1.5l-.7.7-.7-.7v-1.5l.7-.7.7.7zm-3 5.5l.5.8-.8.5-.8-.5.5-.8.8.5-.5.8.8.5-.8.5-.5-.8-.5.8.8.5-.8.5-.5-.8-.5.8.8.5-.8.5-.5-.8z"/>
                        </svg>
                        {repo.stargazers_count}
                      </span>
                    </div>
                    {repo.description && (
                      <p className="text-xs text-text-secondary mt-1 line-clamp-2">{repo.description}</p>
                    )}
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
          <a
            href="https://github.com/kurashizu"
            target="_blank"
            rel="noopener noreferrer"
            className="view-all-link mt-4 inline-block"
          >
            View all on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}