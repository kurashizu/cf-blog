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
      <section className="mb-10 text-center" style={{ padding: "64px 0 0" }}>
        <h1
          className="mb-3"
          style={{
            fontSize: "42px",
            fontWeight: 700,
            letterSpacing: "-1px",
            margin: "0 0 12px",
            color: "var(--text-primary)",
          }}
        >
          Kurashizu
        </h1>
        <p
          style={{
            fontSize: "16px",
            color: "var(--text-secondary)",
            margin: "0 0 20px",
          }}
        >
          Software Engineer / Writer
        </p>
        <p
          style={{
            fontSize: "14px",
            color: "var(--text-muted)",
            maxWidth: "440px",
            margin: "0 auto 0",
            lineHeight: 1.6,
          }}
        >
          Building things with code. Writing about things I have learned.
        </p>
      </section>

      {/* Recent Posts Section */}
      <section className="mt-10">
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            margin: "0 0 16px",
          }}
        >
          Recent Posts
        </div>

        {error ? (
          <div className="rounded-lg border border-border bg-bg-card p-8 text-center text-text-muted text-sm">
            {error}
          </div>
        ) : recentPosts.length === 0 ? (
          <div className="rounded-lg border border-border bg-bg-card p-8 text-center text-text-muted text-sm">
            <p className="mb-4">No posts yet. Check back soon!</p>
            <Link
              href="/admin/editor/new"
              className="text-accent hover:text-accent-light transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-sm"
            >
              Write the first post
            </Link>
          </div>
        ) : (
          <div>
            {recentPosts.map((post) => (
              <article
                key={post.slug}
                className="border-b border-border last:border-b-0"
                style={{ padding: "12px 0" }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginBottom: "4px",
                  }}
                >
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </div>
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  <Link
                    href={`/blog/${post.slug}`}
                    className="hover:!text-accent transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-sm"
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {post.title}
                  </Link>
                </h3>
              </article>
            ))}
            <div style={{ marginTop: "16px" }}>
              <Link
                href="/blog"
                style={{
                  color: "var(--accent)",
                  textDecoration: "none",
                  fontSize: "13px",
                  fontWeight: 500,
                }}
                className="hover:!text-accent-light transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
              >
                View all posts →
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}