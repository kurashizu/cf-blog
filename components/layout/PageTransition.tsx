"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Phase = "enter" | "idle" | "exit";

const EXIT_MS = 180;
const ENTER_MS = 280;

/**
 * PageTransition
 *
 * Wraps page content and orchestrates page-level exit/enter animations.
 *
 * - **First load**: enter animation → idle
 * - **Route changes** (different pathname): exit → swap → enter → idle
 * - **Search-param only** (same pathname, different children): instant swap,
 *   then enter animation (no exit)
 * - **Rapid successive navigation**: in-flight timers are cancelled before
 *   starting the new transition.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [phase, setPhase] = useState<Phase>("enter");
    const [displayChildren, setDisplayChildren] = useState(children);
    const prevPathname = useRef(pathname);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    // ── First mount: enter → idle ──
    useEffect(() => {
        const t = setTimeout(() => setPhase("idle"), ENTER_MS);
        return () => clearTimeout(t);
    }, []);

    // ── Route / children changes ──
    useEffect(() => {
        // Cancel any in-flight transition timers
        timers.current.forEach(clearTimeout);
        timers.current = [];

        if (pathname === prevPathname.current) {
            // Same pathname — likely a search-param-only change.
            // Swap content instantly, then play enter animation.
            prevPathname.current = pathname;
            setDisplayChildren(children);
            setPhase("enter");

            const t = setTimeout(() => setPhase("idle"), ENTER_MS);
            timers.current.push(t);
            return;
        }

        // ── Route changed ──
        prevPathname.current = pathname;
        setPhase("exit");

        const exitTimer = setTimeout(() => {
            setDisplayChildren(children);
            setPhase("enter");

            const enterTimer = setTimeout(() => {
                setPhase("idle");
            }, ENTER_MS);

            timers.current.push(enterTimer);
        }, EXIT_MS);

        timers.current.push(exitTimer);
    }, [pathname, children]);

    let className = "";
    if (phase === "exit") className = "animate-page-exit";
    else if (phase === "enter") className = "animate-page-enter";

    return <div className={className}>{displayChildren}</div>;
}
