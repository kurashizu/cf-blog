"use client";

import { useEffect, useState } from "react";

interface HeroHeaderProps {
    title: string;
    subtitle: string;
    /** Delay (ms) after mount before the typing animation begins. */
    typingDelayMs?: number;
    /** Delay (ms) between each typed character. */
    charDelayMs?: number;
}

/**
 * Hacker-style hero header: title with a blinking block cursor,
 * subtitle that types out one character at a time.
 *
 * Respects `prefers-reduced-motion`: skips both typing and blinking,
 * and renders the full subtitle immediately.
 */
export function HeroHeader({
    title,
    subtitle,
    typingDelayMs = 600,
    charDelayMs = 50,
}: HeroHeaderProps) {
    const [typedLength, setTypedLength] = useState(0);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (mq.matches) {
            setTypedLength(subtitle.length);
            return;
        }

        let interval: ReturnType<typeof setInterval> | null = null;
        const startTimer = setTimeout(() => {
            let i = 0;
            interval = setInterval(() => {
                i += 1;
                setTypedLength(i);
                if (i >= subtitle.length && interval) {
                    clearInterval(interval);
                    interval = null;
                }
            }, charDelayMs);
        }, typingDelayMs);

        return () => {
            clearTimeout(startTimer);
            if (interval) clearInterval(interval);
        };
    }, [subtitle, typingDelayMs, charDelayMs]);

    const typed = subtitle.slice(0, typedLength);

    return (
        <>
            <h1
                className="hero-title mb-3 animate-fade-up"
                style={{ animationDelay: "0ms" }}
            >
                {title}
                <span className="terminal-cursor" aria-hidden="true">
                    {"\u2588"}
                </span>
            </h1>
            <p
                className="hero-subtitle mb-4 animate-fade-up"
                style={{ animationDelay: "80ms" }}
                aria-label={subtitle}
            >
                <span aria-hidden="true">{typed}</span>
                <span
                    className="terminal-cursor terminal-cursor--caret"
                    aria-hidden="true"
                >
                    {"\u258C"}
                </span>
            </p>
        </>
    );
}
