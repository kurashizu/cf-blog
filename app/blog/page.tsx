import Link from "next/link";
import { getDB } from "@/lib/d1";
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
    externalUrl?: string;
}

function PostCard({ post, delayMs }: { post: Post; delayMs: number }) {
    const isExternal = !!post.externalUrl && /^https?:\/\//.test(post.externalUrl);
    const href = isExternal ? (post.externalUrl as string) : `/blog/${post.slug}`;

    return (
        <Link
            href={href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="block animate-fade-up-sm"
            style={{ animationDelay: `${delayMs}ms` }}
        >
            <Card>
                <CardHeader>
                    <span className="text-xs text-text-muted">
                        {formatDate(post.date)}
                    </span>
                </CardHeader>
                <CardContent>
                    <div className="flex items-start justify-between gap-2 mt-2">
                        <h2 className="text-xl font-semibold text-text-primary leading-tight">
                            {post.title}
                        </h2>
                        {isExternal && (
                            <svg
                                className="w-4 h-4 text-accent shrink-0 mt-1"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                viewBox="0 0 24 24"
                                aria-label="Opens in new tab"
                            >
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                        )}
                    </div>
                    {post.description && (
                        <p className="text-sm text-text-secondary leading-relaxed mt-1">
                            {post.description}
                        </p>
                    )}
                    {post.tags && post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                            {post.tags.map((tag) => (
                                <Tag key={tag} variant="default">
                                    {tag}
                                </Tag>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </Link>
    );
}

const LIMIT = 10;

export default async function BlogPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string }>;
}) {
    const { page: pageStr } = await searchParams;
    const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);

    const db = getDB();
    const offset = (page - 1) * LIMIT;

    const [rows, countRow] = await Promise.all([
        db
            .prepare(
                `SELECT slug, title, excerpt as description,
                    published_at as date, tags, cover_image, external_url
             FROM posts
             WHERE status = 'published'
             ORDER BY published_at DESC
             LIMIT ? OFFSET ?`,
            )
            .bind(LIMIT, offset)
            .all(),
        db
            .prepare(
                "SELECT COUNT(*) as total FROM posts WHERE status = 'published'",
            )
            .first(),
    ]);

    const posts = ((rows.results ?? []) as unknown as Post[]).map((p) => ({
        ...p,
        tags:
            typeof p.tags === "string" ? JSON.parse(p.tags as string) : p.tags,
    }));
    const total = (countRow?.total as number) ?? 0;
    const totalPages = Math.ceil(total / LIMIT);

    return (
        <>
            <div
                className="text-[1.75rem] font-bold text-text-primary mb-8 animate-fade-up"
                style={{ animationDelay: "0ms" }}
            >
                <h1>Blog</h1>
                <p className="text-sm text-text-secondary">
                    A collection of thoughts and tutorials
                </p>
            </div>

            {posts.length === 0 ? (
                <p className="text-text-muted">No posts yet.</p>
            ) : (
                <div className="flex flex-col gap-4">
                    {posts.map((post, i) => (
                        <PostCard
                            key={post.slug}
                            post={post}
                            delayMs={80 + i * 50}
                        />
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <nav className="flex items-center justify-center gap-4 mt-10">
                    {page > 1 ? (
                        <Link
                            href={`/blog?page=${page - 1}`}
                            className="text-sm text-accent hover:text-accent-hover transition-colors"
                        >
                            ← Prev
                        </Link>
                    ) : (
                        <span className="text-sm text-text-muted">← Prev</span>
                    )}
                    <span className="text-sm text-text-muted">
                        Page {page} of {totalPages}
                    </span>
                    <form
                        action="/blog"
                        method="GET"
                        className="flex items-center gap-1"
                    >
                        <input
                            type="number"
                            name="page"
                            min={1}
                            max={totalPages}
                            placeholder="Go to"
                            className="w-16 rounded border border-border bg-bg-card px-1.5 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                        <button
                            type="submit"
                            className="rounded bg-accent px-2 py-1 text-xs text-white transition-colors hover:bg-accent-hover"
                        >
                            Go
                        </button>
                    </form>
                    {page < totalPages ? (
                        <Link
                            href={`/blog?page=${page + 1}`}
                            className="text-sm text-accent hover:text-accent-hover transition-colors"
                        >
                            Next →
                        </Link>
                    ) : (
                        <span className="text-sm text-text-muted">Next →</span>
                    )}
                </nav>
            )}
        </>
    );
}
