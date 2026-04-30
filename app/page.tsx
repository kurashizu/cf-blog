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
      <section className="mb-16 text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-text-primary">
          Hi, I&apos;m <span className="text-accent">Kurashizu</span>
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-text-secondary">
          Software engineer, writer, and builder. This is where I share thoughts
          on technology, programming, and whatever else I&apos;m exploring.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/blog"
            className="inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            Read the Blog
          </Link>
          <Link
            href="/about"
            className="inline-flex items-center justify-center rounded-md border border-border bg-transparent px-6 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            About Me
          </Link>
        </div>
      </section>

      {/* Recent Posts Section */}
      <section>
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-text-primary">
            Recent Posts
          </h2>
          <Link
            href="/blog"
            className="text-sm text-accent hover:text-accent-light transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-sm"
          >
            View all &rarr;
          </Link>
        </div>

        {error ? (
          <div className="rounded-lg border border-border bg-bg-card p-8 text-center text-text-secondary">
            {error}
          </div>
        ) : recentPosts.length === 0 ? (
          <div className="rounded-lg border border-border bg-bg-card p-8 text-center text-text-secondary">
            <p className="mb-4">No posts yet. Check back soon!</p>
            <Link
              href="/admin/editor/new"
              className="text-accent hover:text-accent-light transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-sm"
            >
              Write the first post
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {recentPosts.map((post) => (
              <article
                key={post.slug}
                className="rounded-lg border border-border bg-bg-card p-6 transition-colors hover:border-accent/30"
              >
                <div className="mb-2 flex items-center gap-2 text-sm text-text-muted">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                  {post.tags && post.tags.length > 0 && (
                    <>
                      <span aria-hidden="true">&bull;</span>
                      <span className="flex gap-2">
                        {post.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-bg-secondary px-2 py-0.5 text-xs text-text-secondary"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                    </>
                  )}
                </div>
                <h3 className="mb-2 text-xl font-semibold text-text-primary">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="hover:text-accent transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-sm"
                  >
                    {post.title}
                  </Link>
                </h3>
                {post.description && (
                  <p className="text-text-secondary line-clamp-2">
                    {post.description}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}