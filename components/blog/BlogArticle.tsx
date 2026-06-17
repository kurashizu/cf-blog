import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

interface Post {
    slug: string;
    title: string;
    content: string;
    date: string;
    author: string;
    tags: string[];
    coverImage?: string;
}

interface BlogArticleProps {
    post: Post;
}

export function BlogArticle({ post }: BlogArticleProps) {
    return (
        <article className="max-w-3xl mx-auto px-4 py-10 pb-16">
            <Link
                href="/blog"
                className="inline-flex items-center gap-2 text-sm text-text-muted mb-6 transition-colors hover:text-accent animate-fade-up"
                style={{ animationDelay: "0ms" }}
            >
                ← Back to blog
            </Link>

            <header
                className="mb-10 pb-6 border-b border-border animate-fade-up"
                style={{ animationDelay: "80ms" }}
            >
                {post.coverImage && (
                    <div className="mb-8 aspect-video w-full overflow-hidden rounded-lg">
                        <img
                            src={post.coverImage}
                            alt={post.title}
                            className="h-full w-full object-cover"
                        />
                    </div>
                )}

                <h1 className="text-[1.5rem] sm:text-[2rem] font-bold text-text-primary leading-tight mb-4">
                    {post.title}
                </h1>

                <div className="flex items-center flex-wrap gap-2 text-[0.8125rem] text-text-muted mb-3">
                    <span>{formatDate(post.date)}</span>
                    <span className="text-border">|</span>
                    <span>{post.author}</span>
                </div>

                {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {post.tags.map((tag) => (
                            <span key={tag} className="tag">
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </header>

            <MarkdownRenderer className="prose prose-invert prose-lg max-w-none">
                {post.content}
            </MarkdownRenderer>
        </article>
    );
}
