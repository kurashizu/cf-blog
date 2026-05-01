import Link from "next/link";
import { createArticlesRepo } from "@/lib/articles";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";

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
    <Link href={`/blog/${post.slug}`}>
      <Card className="article-card transition-all hover:border-accent hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(255,107,0,0.12)]">
        <CardHeader className="pb-2">
          <span className="article-meta">{formatDate(post.date)}</span>
        </CardHeader>
        <CardContent className="pt-0">
          <h3 className="article-title mb-1">{post.title}</h3>
          {post.description && <p className="article-desc">{post.description}</p>}
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
    <div className="mx-auto max-w-4xl px-4 py-12">
      <section className="hero-section">
        <h1 className="hero-title">Kurashizu</h1>
        <p className="hero-subtitle">Software Engineer / Writer</p>
        <p className="hero-bio">
          Building things with code. Writing about things I have learned.
        </p>
      </section>

      <section className="mt-10">
        <div className="section-title">Recent Posts</div>

        {error ? (
          <Card>
            <CardContent>{error}</CardContent>
          </Card>
        ) : recentPosts.length === 0 ? (
          <Card>
            <CardContent>
              <p className="mb-4">No posts yet. Check back soon!</p>
              <Link href="/admin/editor/new" className="text-accent hover:text-accent-light transition-colors">
                Write the first post
              </Link>
            </CardContent>
          </Card>
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
    </div>
  );
}
