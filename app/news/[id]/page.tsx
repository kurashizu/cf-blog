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
    const row = await db
        .prepare("SELECT * FROM news_items WHERE id = ?")
        .bind(parseInt(id, 10))
        .first();

    if (!row) notFound();

    const story = row as unknown as HNStory;
    const externalUrl =
        story.url || `https://news.ycombinator.com/item?id=${story.id}`;

    return (
        <div className="max-w-4xl mx-auto px-4 pb-12 pt-8 md:pt-12">
            <article className="article-content">
                <Link href="/news" className="back-link">
                    ← Back to news
                </Link>

                <header className="article-header">
                    <h1 className="text-2xl font-bold">{story.title}</h1>

                    <div className="flex items-center gap-3 mt-3">
                        <a
                            href={externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                        >
                            <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                            </svg>
                            {story.url ? "Original article" : "View on HN"}
                        </a>
                    </div>

                    <div className="article-meta mb-3 mt-2">
                        {story.domain && (
                            <>
                                <span>{story.domain}</span>
                                <span className="article-meta-separator">
                                    |
                                </span>
                            </>
                        )}
                        <span>{story.score} points</span>
                        <span className="article-meta-separator">|</span>
                        <span>{story.descendants} comments</span>
                        <span className="article-meta-separator">|</span>
                        <span>by {story.by}</span>
                        <span className="article-meta-separator">|</span>
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
            </article>
        </div>
    );
}
