"use client";

import { useState } from "react";
import { MiniCard } from "@/components/ui/MiniCard";
import { NewsPanel } from "./NewsPanel";

interface HNStory {
    id: number;
    title: string;
    url: string | null;
    score: number;
    by: string;
    descendants: number;
    domain: string | null;
    summary: string;
}

export function NewsSection({ stories }: { stories: HNStory[] }) {
    const [selectedStory, setSelectedStory] = useState<HNStory | null>(null);

    return (
        <>
            <section className="flex flex-col">
                <div
                    className="flex items-center justify-between mb-3 animate-fade-up"
                    style={{ animationDelay: "360ms" }}
                >
                    <h2 className="section-title mb-0">News</h2>
                    <a
                        href="https://news.ycombinator.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="view-all-link"
                    >
                        View on HN
                    </a>
                </div>
                <div className="space-y-3">
                    {stories.map((story, i) => (
                        <button
                            key={story.id}
                            onClick={() => setSelectedStory(story)}
                            className="block w-full text-left animate-fade-up-sm"
                            style={{ animationDelay: `${420 + i * 50}ms` }}
                        >
                            <MiniCard className="group cursor-pointer">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm text-accent font-mono group-hover:text-accent-hover transition-colors truncate">
                                        {story.title}
                                    </span>
                                </div>
                                {story.domain && (
                                    <p className="text-xs text-text-muted mt-0.5">
                                        {story.domain}
                                    </p>
                                )}
                            </MiniCard>
                        </button>
                    ))}
                </div>
            </section>

            <NewsPanel
                story={selectedStory}
                onClose={() => setSelectedStory(null)}
            />
        </>
    );
}
