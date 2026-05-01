import Link from "next/link";
import { createArticlesRepo } from "@/lib/articles";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";

export const dynamic = "force-dynamic";

interface Post {
  slug: string;
  title: string;
  date: string;
  description?: string;
  tags?: string[];
}

function FeaturedPost({ post }: { post: Post }) {
  return (
    <Link href={`/blog/${post.slug}`} className="block">
      <Card className="h-full group">
        <CardHeader>
          <span className="article-meta">{formatDate(post.date)}</span>
        </CardHeader>
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

const projects = [
  {
    name: "llama-proxy",
    description: "High-performance cache proxy with cost-aware LRU for llama.cpp",
    url: "https://github.com/kurashizu/llama-proxy",
  },
  {
    name: "PodWeaver",
    description: "Autonomous AI Podcast Pipeline",
    url: "https://github.com/kurashizu/PodWeaver",
  },
  {
    name: "YoutubeStreamer",
    description: "HLS video streaming tool for VRChat",
    url: "https://github.com/kurashizu/YoutubeStreamer",
  },
];

export default async function HomePage() {
  let recentPosts: Post[] = [];
  let error: string | null = null;

  try {
    const repo = createArticlesRepo();
    recentPosts = await repo.getRecent(3);
  } catch (e) {
    error = "Unable to load posts at this time.";
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <section className="text-center mb-16">
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

      <section className="mb-16">
        <h2 className="section-title">Featured Projects</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {projects.map((project) => (
            <a key={project.name} href={project.url} target="_blank" rel="noopener noreferrer">
              <Card className="h-full group hover:-translate-y-1">
                <CardContent className="flex flex-col h-full">
                  <code className="text-sm text-accent mb-2 font-mono">{project.name}</code>
                  <p className="text-sm text-text-secondary flex-1">{project.description}</p>
                  <span className="text-xs text-text-muted mt-3 group-hover:text-accent transition-colors">
                    View on GitHub
                  </span>
                </CardContent>
              </Card>
            </a>
          ))}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {recentPosts.map((post) => (
              <FeaturedPost key={post.slug} post={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}