import Link from "next/link";
import { getRecentPosts } from "@/lib/posts";

// Force dynamic rendering since posts come from R2 at runtime
export const dynamic = "force-dynamic";

export default async function HomePage() {
  let recentPosts: Array<{
    slug: string;
    title: string;
    date: string;
    description?: string;
    tags?: string[];
  }> = [];
  let error: string | null = null;

  try {
    recentPosts = await getRecentPosts(5);
  } catch (e) {
    error = "Unable to load posts at this time.";
    console.error("Failed to load recent posts:", e);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Hero Section */}
      <section className="hero-section">
        <h1 className="hero-title">Kurashizu</h1>
        <p className="hero-subtitle">Software Engineer / Writer</p>
        <p className="hero-bio">
          Building things with code. Writing about things I have learned.
        </p>
      </section>

      {/* Recent Posts Section */}
      <section className="mt-10">
        <div className="section-title">Recent Posts</div>

        {error ? (
          <div className="empty-state">
            {error}
          </div>
        ) : recentPosts.length === 0 ? (
          <div className="empty-state">
            <p className="mb-4">No posts yet. Check back soon!</p>
            <Link href="/admin/editor/new" className="text-accent hover:text-accent-light transition-colors">
              Write the first post
            </Link>
          </div>
        ) : (
          <div>
            {recentPosts.map((post) => (
              <article key={post.slug} className="post-item">
                <div className="post-date">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </div>
                <h3 className="post-title">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="post-title-link"
                  >
                    {post.title}
                  </Link>
                </h3>
              </article>
            ))}
            <div className="mt-4">
              <Link href="/blog" className="view-all-link">
                View all posts →
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
