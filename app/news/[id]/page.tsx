import Link from "next/link";
import { notFound } from "next/navigation";
import { getDB } from "@/lib/d1";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";

export const dynamic = "force-dynamic";

interface HNStory {
    id: number;
    title: string;
    url: string | null;
    score: number;
    by: string;
    time: number;
    descendants: number;
    domain: string | null;
    summary: string;
}

export default async function NewsDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const db = getDB();
    const row = await db.prepare(
        "SELECT * FROM news_items WHERE id = ?",
    ).bind(parseInt(id, 10)).first();

    if (!row) notFound();

    const story = row as unknown as HNStory;

    return (
        <div className="max-w-4xl mx-auto px-4 pb-12">
            <article className="article-content">
                <Link
                    href="/news"
                    className="back-link animate-fade-up"
                    style={{ animationDelay: "0ms" }}
                >
                    ← Back to news
                </Link>

                <header
                    className="article-header animate-fade-up"
                    style={{ animationDelay: "80ms" }}
                >
                    <h1 className="text-2xl font-bold">{story.title}</h1>

                    <div className="article-meta-row mb-3">
                        {story.domain && <span>{story.domain}</span>}
                        <span>·</span>
                        <span>{story.score} points</span>
                        <span>·</span>
                        <span>{story.descendants} comments</span>
                        <span>·</span>
                        <span>by {story.by}</span>
                        <span>·</span>
                        <span>
                            {new Date(story.time * 1000).toLocaleDateString(
                                "en-US",
                                {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                },
                            )}
                        </span>
                    </div>
                </header>

                <MarkdownRenderer className="article-body">
                    {story.summary}
                </MarkdownRenderer>

                <footer className="mt-8 pt-4 border-t border-border">
                    <a
                        href={
                            story.url ||
                            `https://news.ycombinator.com/item?id=${story.id}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:text-accent-hover transition-colors"
                    >
                        {story.url
                            ? "Original article →"
                            : "View on HN →"}
                    </a>
                </footer>
            </article>
        </div>
    );
}
