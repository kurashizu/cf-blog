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

function PostCard({ post }: { post: Post }) {
  return (
    <Link href={`/blog/${post.slug}`} className="block">
      <Card>
        <CardHeader className="pb-2">
          <span className="article-meta">{formatDate(post.date)}</span>
        </CardHeader>
        <CardContent className="pt-0">
          <h3 className="article-title">{post.title}</h3>
          {post.description && <p className="article-desc">{post.description}</p>}
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
    recentPosts = await repo.getRecent(5);
  } catch (e) {
    error = "Unable to load posts at this time.";
    console.error("Failed to load recent posts:", e);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <section className="hero">
        <h1 className="hero-title">Kurashizu Blog</h1>
        <p className="hero-subtitle">Software Engineer & Technical Writer</p>
        <p className="hero-bio">
          A personal space where I share what I learn — from cloud infrastructure
          and serverless architectures to developer tools and productivity hacks.
          Sometimes I write about the weird bugs I encounter, sometimes about
          elegant solutions. Welcome to my corner of the internet.
        </p>
      </section>

      <section className="mt-12">
        <div className="section-title">Recent Posts</div>

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
            <Link href="/blog" className="view-all-link">
              View all posts →
            </Link>
          </div>
        )}
      </section>

      <section className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="text-center">
          <CardContent>
            <div className="text-3xl mb-2">☁️</div>
            <h3 className="font-semibold text-text-primary mb-1">Cloud Native</h3>
            <p className="text-sm text-text-muted">Built on Cloudflare Pages with R2 storage</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent>
            <div className="text-3xl mb-2">⚡</div>
            <h3 className="font-semibold text-text-primary mb-1">Fast & Light</h3>
            <p className="text-sm text-text-muted">Minimal JavaScript, optimized for edge</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent>
            <div className="text-3xl mb-2">✍️</div>
            <h3 className="font-semibold text-text-primary mb-1">Markdown</h3>
            <p className="text-sm text-text-muted">Write in MD, powered by Next.js</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
