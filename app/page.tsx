import Link from "next/link";
import { createArticlesRepo } from "@/lib/articles";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";

export const dynamic = "force-dynamic";

interface Post {
  slug: string;
  title: string;
  date: string;
  description?: string;
  tags?: string[];
}

function PostCard({ post }: { post: Post }) {
  return (
    <Link href={`/blog/${post.slug}`} className="block">
      <Card className="h-full">
        <CardHeader className="pb-2">
          <span className="article-meta">{formatDate(post.date)}</span>
        </CardHeader>
        <CardContent className="pt-0">
          <h3 className="article-title">{post.title}</h3>
          {post.description && <p className="article-desc">{post.description}</p>}
        </CardContent>
        {post.tags && post.tags.length > 0 && (
          <CardFooter>
            <div className="flex flex-wrap gap-1.5">
              {post.tags.slice(0, 3).map((tag) => (
                <Tag key={tag} variant="default">{tag}</Tag>
              ))}
            </div>
          </CardFooter>
        )}
      </Card>
    </Link>
  );
}

const stack = [
  { category: "OS", items: ["NixOS", "Arch"] },
  { category: "Editor", items: ["Zed", "Neovim"] },
  { category: "Shell", items: ["Zsh", "Fish"] },
];

const projects = [
  {
    name: "llama-proxy",
    description: "High-performance cache proxy with cost-aware LRU for llama.cpp",
    link: "https://github.com/kurashizu/llama-proxy",
  },
  {
    name: "PodWeaver",
    description: "Autonomous AI Podcast Pipeline",
    link: "https://github.com/kurashizu/PodWeaver",
  },
  {
    name: "YoutubeStreamer",
    description: "HLS video streaming tool for VRChat video sharing",
    link: "https://github.com/kurashizu/YoutubeStreamer",
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
    console.error("Failed to load recent posts:", e);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Hero */}
      <section className="hero">
        <h1 className="hero-title">Hello, I&apos;m kurashizu</h1>
        <p className="hero-subtitle">The AI & Infrastructure</p>
        <p className="hero-bio">
          An IT Master&apos;s student obsessed with automation, performance, and clean UI.
          Building the future of agentic workflows, high-performance computing, and human-computer interaction.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-6">
          <Link href="/blog" className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-all hover:-translate-y-0.5 hover:shadow-[0_0_20px_var(--accent-glow)]">
            Explore Posts
          </Link>
          <Link href="/about" className="inline-flex items-center gap-2 px-5 py-2.5 bg-bg-card border border-border text-text-primary rounded-lg font-medium hover:border-accent hover:text-accent transition-all">
            About Me
          </Link>
        </div>
      </section>

      {/* Whoami */}
      <section className="mt-16">
        <h2 className="section-title">Who am I</h2>
        <Card>
          <CardContent>
            <p className="text-text-secondary leading-relaxed">
              Code. Configure. Create. I&apos;m a developer passionate about building clean, functional systems—from
              Home Labs to User-Centric Platforms. Currently diving deep into LLM infrastructure, agentic
              workflow automation, and the intersection of human-computer interaction.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Featured Projects */}
      <section className="mt-12">
        <h2 className="section-title">Featured Projects</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {projects.map((project) => (
            <a key={project.name} href={project.link} target="_blank" rel="noopener noreferrer">
              <Card className="h-full transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                <CardContent className="flex flex-col">
                  <code className="text-sm text-accent mb-2">{project.name}</code>
                  <p className="text-sm text-text-secondary flex-1">{project.description}</p>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </section>

      {/* Current Stack */}
      <section className="mt-12">
        <h2 className="section-title">Current Stack</h2>
        <Card>
          <CardContent>
            <div className="grid grid-cols-3 gap-6 text-center">
              {stack.map((item) => (
                <div key={item.category}>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    {item.category}
                  </p>
                  <div className="space-y-1">
                    {item.items.map((tech) => (
                      <p key={tech} className="text-sm text-text-primary font-mono">{tech}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Recent Posts */}
      <section className="mt-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title mb-0">Recent Posts</h2>
          <Link href="/blog" className="view-all-link">
            View all →
          </Link>
        </div>

        {error ? (
          <div className="empty-state">
            <p>{error}</p>
          </div>
        ) : recentPosts.length === 0 ? (
          <div className="empty-state">
            <p>No posts yet. Check back soon!</p>
            <Link href="/admin/editor/new" className="text-accent hover:text-accent-hover transition-colors">
              Write the first post
            </Link>
          </div>
        ) : (
          <div className="article-list">
            {recentPosts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
