"use client";

import { useEffect, useState } from "react";

interface HeroHeaderProps {
    title: string;
}

interface UseTypewriterOptions {
    startDelayMs: number;
    charDelayMs: number;
}

/** Plain typewriter: types `target` char by char after a delay. */
function useTypewriter(
    target: string,
    { startDelayMs, charDelayMs }: UseTypewriterOptions,
): string {
    const [display, setDisplay] = useState("");

    useEffect(() => {
        if (typeof window === "undefined") return;

        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (mq.matches) {
            setDisplay(target);
            return;
        }

        let interval: ReturnType<typeof setInterval> | null = null;
        const startTimer = setTimeout(() => {
            let i = 0;
            interval = setInterval(() => {
                i += 1;
                setDisplay(target.slice(0, i));
                if (i >= target.length && interval) {
                    clearInterval(interval);
                    interval = null;
                }
            }, charDelayMs);
        }, startDelayMs);
        return () => {
            clearTimeout(startTimer);
            if (interval) clearInterval(interval);
        };
    }, [target, startDelayMs, charDelayMs]);

    return display;
}

/**
 * Hero header with typewriter animation on the title.
 * Respects `prefers-reduced-motion`.
 */
export function HeroHeader({ title }: HeroHeaderProps) {
    const displayTitle = useTypewriter(title, {
        startDelayMs: 0,
        charDelayMs: 60,
    });

    return (
        <h1 className="hero-title" aria-label={title}>
            {displayTitle}
        </h1>
    );
}
