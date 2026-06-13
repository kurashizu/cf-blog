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
}

function PostCard({ post, delayMs }: { post: Post; delayMs: number }) {
    return (
        <Link
            href={`/blog/${post.slug}`}
            className="block animate-fade-up-sm"
            style={{ animationDelay: `${delayMs}ms` }}
        >
            <Card>
                <CardHeader>
                    <span className="article-meta">{formatDate(post.date)}</span>
                </CardHeader>
                <CardContent>
                    <h2 className="article-title">{post.title}</h2>
                    {post.description && (
                        <p className="article-desc mt-1">{post.description}</p>
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
        db.prepare(
            `SELECT slug, title, excerpt as description,
                    published_at as date, tags, cover_image
             FROM posts
             WHERE status = 'published'
             ORDER BY published_at DESC
             LIMIT ? OFFSET ?`,
        ).bind(LIMIT, offset).all(),
        db.prepare(
            "SELECT COUNT(*) as total FROM posts WHERE status = 'published'",
        ).first(),
    ]);

    const posts = ((rows.results ?? []) as unknown as Post[]).map((p) => ({
        ...p,
        tags: typeof p.tags === "string" ? JSON.parse(p.tags as string) : p.tags,
    }));
    const total = (countRow?.total as number) ?? 0;
    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div className="max-w-4xl mx-auto px-4 pb-12">
            <div
                className="page-title animate-fade-up"
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
                <div className="article-list">
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
        </div>
    );
}
