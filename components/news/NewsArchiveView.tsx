import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";

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

export function NewsArchiveView({
    stories,
    page,
    totalPages,
}: {
    stories: HNStory[];
    page: number;
    totalPages: number;
}) {
    return (
        <>
            {stories.length === 0 ? (
                <p className="text-text-muted">No news yet.</p>
            ) : (
                <div className="article-list">
                    {stories.map((story, i) => (
                        <Link
                            key={story.id}
                            href={`/news/${story.id}`}
                            className="block animate-fade-up-sm"
                            style={{ animationDelay: `${80 + i * 50}ms` }}
                        >
                            <Card className="group cursor-pointer">
                                <CardHeader>
                                    <span className="article-meta">
                                        {new Date(
                                            story.time * 1000,
                                        ).toLocaleDateString("en-US", {
                                            year: "numeric",
                                            month: "short",
                                            day: "numeric",
                                        })}
                                    </span>
                                </CardHeader>
                                <CardContent>
                                    <h2 className="article-title group-hover:text-accent transition-colors">
                                        {story.title}
                                    </h2>
                                    <p className="text-xs text-text-muted mt-1">
                                        {story.domain && (
                                            <span>{story.domain}</span>
                                        )}
                                        <span className="mx-1.5">•</span>
                                        <span>{story.score} points</span>
                                        <span className="mx-1.5">•</span>
                                        <span>
                                            {story.descendants} comments
                                        </span>
                                    </p>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <nav className="flex items-center justify-center gap-4 mt-10">
                    {page > 1 ? (
                        <Link
                            href={`/news?page=${page - 1}`}
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
                        action="/news"
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
                            href={`/news?page=${page + 1}`}
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
