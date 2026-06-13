"use client";

import { useEffect, useState } from "react";
import type { VisitorInfo as VisitorInfoType } from "@/lib/visitor";
import { VisitorTerminal } from "@/components/visitor/VisitorTerminal";

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
 * Hero header with typewriter title + terminal-style visitor info.
 * Respects `prefers-reduced-motion`.
 */
export function HeroHeader({ title }: HeroHeaderProps) {
    const [visitorInfo, setVisitorInfo] = useState<VisitorInfoType | null>(
        null,
    );

    useEffect(() => {
        const ctrl = new AbortController();
        const start = () => {
            fetch("/api/visitor-info", { signal: ctrl.signal })
                .then((r) =>
                    r.ok
                        ? (r.json() as Promise<{
                              visitorInfo?: VisitorInfoType | null;
                          }>)
                        : Promise.reject(new Error(`HTTP ${r.status}`)),
                )
                .then((data) => {
                    if (data.visitorInfo) setVisitorInfo(data.visitorInfo);
                })
                .catch((e) => {
                    if (e?.name === "AbortError") return;
                });
        };

        const idle = window as unknown as {
            requestIdleCallback?: (
                cb: () => void,
                opts?: { timeout: number },
            ) => number;
            cancelIdleCallback?: (id: number) => void;
        };
        if (idle.requestIdleCallback) {
            const id = idle.requestIdleCallback(start, { timeout: 2000 });
            return () => {
                idle.cancelIdleCallback?.(id);
                ctrl.abort();
            };
        }
        const timer = setTimeout(start, 1500);
        return () => {
            clearTimeout(timer);
            ctrl.abort();
        };
    }, []);

    const displayTitle = useTypewriter(title, {
        startDelayMs: 0,
        charDelayMs: 60,
    });

    return (
        <>
            <h1
                className="hero-title mb-3 animate-fade-up"
                style={{ animationDelay: "0ms", minHeight: "3.3rem" }}
                aria-label={title}
            >
                {displayTitle}
            </h1>
            {visitorInfo && (
                <div
                    className="animate-fade-up"
                    style={{ animationDelay: "400ms" }}
                >
                    <VisitorTerminal
                        info={visitorInfo}
                        startDelayMs={0}
                        charDelayMs={16}
                    />
                </div>
            )}
        </>
    );
}
