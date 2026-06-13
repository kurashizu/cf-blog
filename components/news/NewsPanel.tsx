"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";

const CLOSE_ANIM_MS = 200;

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

export function NewsPanel({
    story,
    onClose,
}: {
    story: HNStory | null;
    onClose: () => void;
}) {
    const [closing, setClosing] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);

    const handleClose = () => {
        if (closing) return;
        setClosing(true);
        setTimeout(() => {
            setClosing(false);
            onClose();
        }, CLOSE_ANIM_MS);
    };

    useEffect(() => {
        if (!story) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [story]);

    useEffect(() => {
        if (story) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [story]);

    if (!story) return null;

    return createPortal(
        <div
            ref={overlayRef}
            className={`fixed inset-0 z-[100] flex items-center justify-center ${
                closing ? "animate-fadeOut" : "animate-fadeIn"
            }`}
            onClick={(e) => {
                if (e.target === overlayRef.current) handleClose();
            }}
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
                className={`relative w-[90vw] max-w-2xl max-h-[85vh] bg-bg-card/95 border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden ${
                    closing ? "animate-slideDown" : "animate-scaleIn"
                }`}
            >
                <header className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold text-text-primary truncate pr-4">
                            {story.title}
                        </h2>
                        <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                            {story.domain && (
                                <span>{story.domain}</span>
                            )}
                            <span>{story.score} points</span>
                            <span>{story.descendants} comments</span>
                            <span>by {story.by}</span>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors"
                        aria-label="Close"
                    >
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-6 pb-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none text-text-primary">
                        <MarkdownRenderer>{story.summary}</MarkdownRenderer>
                    </div>
                </div>

                <footer className="px-6 py-3 border-t border-border shrink-0 flex items-center justify-between">
                    <a
                        href={
                            story.url ||
                            `https://news.ycombinator.com/item?id=${story.id}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent hover:text-accent-hover transition-colors"
                    >
                        {story.url ? "Original article →" : "View on HN →"}
                    </a>
                </footer>
            </div>
        </div>,
        document.body,
    );
}
