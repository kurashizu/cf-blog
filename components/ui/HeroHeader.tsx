"use client";

import { useEffect, useState } from "react";
import { type VisitorInfo as VisitorInfoType } from "@/lib/visitor";
import { VisitorInfo } from "./VisitorInfo";

interface HeroHeaderProps {
    title: string;
    subtitle?: string;
    bio?: string;
    /** When provided, replaces the subtitle+bio with a visitor info block. */
    visitorInfo?: VisitorInfoType | null;
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
 * Hero header with three different entrance animations:
 *  - Title: scramble-decode wave (~1.1s)
 *  - Subtitle: fast typewriter (~600ms)
 *  - Bio: slow typewriter (~2s)
 *
 * Each line is rendered with an invisible full-text placeholder so the
 * container reserves its final height from the very first paint. The
 * animated text is overlaid via absolute positioning, so it never causes
 * the hero to reflow. All animations respect `prefers-reduced-motion`.
 */
export function HeroHeader({
    title,
    subtitle,
    bio,
    visitorInfo,
}: HeroHeaderProps) {
    const displayTitle = useScramble(title, {
        durationMs: 1100,
        startDelayMs: 0,
    });

    const displaySubtitle = useTypewriter(subtitle ?? "", {
        startDelayMs: 700,
        charDelayMs: 30,
    });

    const displayBio = useTypewriter(bio ?? "", {
        startDelayMs: 1400,
        charDelayMs: 12,
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
            {subtitle && (
                <p
                    className="hero-subtitle mb-3 animate-fade-up"
                    style={{ animationDelay: "80ms", minHeight: "1.75rem" }}
                    aria-label={subtitle}
                >
                    {displaySubtitle}
                </p>
            )}
            {visitorInfo ? (
                <>
                    <div
                        className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent mb-3 animate-fade-up"
                        style={{ animationDelay: "1400ms" }}
                    />
                    <VisitorInfo info={visitorInfo} />
                </>
            ) : (
                bio && (
                    <p
                        className="hero-bio animate-fade-up whitespace-pre-line"
                        style={{ animationDelay: "160ms", minHeight: "4.5rem" }}
                        aria-label={bio}
                    >
                        {displayBio}
                    </p>
                )
            )}
        </>
    );
}
