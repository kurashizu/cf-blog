"use client";

import { useEffect, useState } from "react";
import { type VisitorInfo as VisitorInfoType } from "@/lib/visitor";
import { VisitorInfo } from "./VisitorInfo";

interface HeroHeaderProps {
    title: string;
    subtitle?: string;
    bio?: string;
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

/**
 * Plain typewriter: types `target` char by char after a delay.
 *
 * @deprecated The character-by-character setState approach can trigger
 * layout shifts in narrow viewports (a long line wraps partway through
 * typing). HeroHeader no longer calls this — it uses CSS-driven reveal
 * animations instead so the DOM is stable from SSR onward.
 */
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
export function HeroHeader({ title, subtitle, bio }: HeroHeaderProps) {
    // Visitor info is fetched lazily after the page has loaded, so the SSR
    // critical path is never blocked by the third-party ip-api.com call.
    // Initial paint shows the static bio; once the request resolves the
    // bio is replaced with the visitor block. The /api/visitor-info route
    // sets Cache-Control: private, max-age=3600, so a returning visitor
    // triggers no external API call at all.
    const [visitorInfo, setVisitorInfo] = useState<VisitorInfoType | null>(
        null,
    );
    useEffect(() => {
        // Defer the request until the browser is idle (or after a short
        // timeout), so it never competes with the hydration or the
        // scramble/typewriter animations for the main thread.
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
                    // Silent failure — the static bio is a perfectly fine
                    // fallback and we don't want to spam the console for
                    // every visitor on a transient ip-api.com error.
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
            {subtitle && (
                // The full subtitle text is in the DOM from SSR. The
                // typewriter effect is purely visual, done by sliding an
                // opaque-to-transparent mask over the text. This keeps
                // the element height stable across viewports so it
                // never reflows when the character count passes a
                // wrap boundary mid-animation.
                <p
                    className="hero-subtitle hero-reveal mb-3 animate-fade-up"
                    style={
                        {
                            animationDelay: "80ms",
                            "--reveal-delay": "700ms",
                            "--reveal-duration": "660ms",
                        } as React.CSSProperties
                    }
                    aria-label={subtitle}
                >
                    {subtitle}
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
            ) : bio ? (
                <p
                    className="hero-bio animate-fade-up whitespace-pre-line"
                    style={{ animationDelay: "160ms", minHeight: "4.5rem" }}
                    aria-label={bio}
                >
                    {bio}
                </p>
            ) : (
                // Placeholder mirrors VisitorInfo's DOM exactly so the
                // reserved height matches the real block on every screen
                // width — a fixed min-height would shift content on mobile
                // where a long IPv6 wraps to a second line. `invisible`
                // keeps the layout space but hides the text; aria-hidden
                // skips it for screen readers.
                <div
                    className="hero-bio space-y-1 invisible"
                    aria-hidden="true"
                >
                    <div>&nbsp;</div>
                    <div>&nbsp;</div>
                    <div className="flex items-center gap-2">
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="inline-block shrink-0"
                            aria-hidden="true"
                        >
                            <line x1="4" y1="9" x2="20" y2="9"></line>
                            <line x1="4" y1="15" x2="20" y2="15"></line>
                            <line x1="10" y1="3" x2="8" y2="21"></line>
                            <line x1="16" y1="3" x2="14" y2="21"></line>
                        </svg>
                        <span className="font-mono">
                            0000:0000:0000:0000:0000:0000:0000:0000
                        </span>
                    </div>
                </div>
            )}
        </>
    );
}
