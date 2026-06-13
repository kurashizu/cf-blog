"use client";

import { useEffect, useState } from "react";

interface HeroHeaderProps {
    title: string;
}

const SCRAMBLE_CHARSET = "!<>-_/[]{}—=+*^?#01";

interface UseScrambleOptions {
    durationMs: number;
    startDelayMs: number;
    charset?: string;
    flipIntervalMs?: number;
    settleMs?: number;
}

/**
 * Scramble-decode: each character flips through random chars from
 * `charset` until it settles on the real character. A left-to-right
 * "decryption" wave propagates across the text. `settleMs` controls
 * how long each char spends flipping; `durationMs` is the total time
 * (last char settles at `durationMs`).
 */
function useScramble(
    target: string,
    {
        durationMs,
        startDelayMs,
        charset = SCRAMBLE_CHARSET,
        flipIntervalMs = 50,
        settleMs = 150,
    }: UseScrambleOptions,
): string {
    const [display, setDisplay] = useState("");

    useEffect(() => {
        if (typeof window === "undefined") return;

        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (mq.matches) {
            setDisplay(target);
            return;
        }

        const n = target.length;
        if (n === 0) {
            setDisplay(target);
            return;
        }

        const waveSpan = Math.max(0, durationMs - settleMs);
        const startTime = performance.now() + startDelayMs;
        let rafId = 0;
        let cancelled = false;

        const tick = (now: number) => {
            if (cancelled) return;
            if (now < startTime) {
                setDisplay("");
                rafId = requestAnimationFrame(tick);
                return;
            }
            const elapsed = now - startTime;
            let result = "";
            for (let i = 0; i < n; i++) {
                const charStart = (i / Math.max(1, n - 1)) * waveSpan;
                const charEnd = charStart + settleMs;
                if (elapsed >= charEnd) {
                    result += target[i];
                } else {
                    const flipIndex =
                        Math.floor(elapsed / flipIntervalMs) + i * 13;
                    result += charset[Math.abs(flipIndex) % charset.length];
                }
            }
            setDisplay(result);

            if (elapsed >= durationMs) {
                setDisplay(target);
                return;
            }
            rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
        return () => {
            cancelled = true;
            cancelAnimationFrame(rafId);
        };
    }, [target, durationMs, startDelayMs, charset, flipIntervalMs, settleMs]);

    return display;
}

/**
 * Hero header with scramble-decode animation on the title.
 * Respects `prefers-reduced-motion`.
 */
export function HeroHeader({ title }: HeroHeaderProps) {
    const displayTitle = useScramble(title, {
        durationMs: 1100,
        startDelayMs: 0,
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
        </>
    );
}
