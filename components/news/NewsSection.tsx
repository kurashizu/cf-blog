import Link from "next/link";
import { MiniCard } from "@/components/ui/MiniCard";

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

export function NewsSection({ stories }: { stories: HNStory[] }) {
    return (
        <section className="flex flex-col">
            <div
                className="flex items-center justify-between mb-3 animate-fade-up"
                style={{ animationDelay: "0ms" }}
            >
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-0">News</h2>
                <Link href="/news" className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-accent hover:gap-3 transition-all">
                    All news
                </Link>
            </div>
            <div className="space-y-3">
                {stories.map((story, i) => (
                    <Link
                        key={story.id}
                        href={`/news/${story.id}`}
                        className="block animate-fade-up-sm"
                        style={{ animationDelay: `${i * 40}ms` }}
                    >
                        <MiniCard className="group">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm text-accent font-mono group-hover:text-accent-hover transition-colors truncate">
                                    {story.title}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-1">
                                {story.domain ? (
                                    <span className="text-xs text-text-muted truncate">
                                        {story.domain}
                                    </span>
                                ) : (
                                    <span />
                                )}
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] text-text-muted">
                                        {new Date(
                                            story.time * 1000,
                                        ).toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                        })}
                                    </span>
                                    <span className="text-[10px] text-text-muted">
                                        by {story.by}
                                    </span>
                                </div>
                            </div>
                        </MiniCard>
                    </Link>
                ))}
            </div>
        </section>
    );
}
