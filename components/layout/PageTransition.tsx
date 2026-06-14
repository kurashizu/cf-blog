"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Phase = "enter" | "idle" | "exit";

const EXIT_MS = 180;
const ENTER_MS = 280;

/**
 * PageTransition
 *
 * Wraps page content and orchestrates page-level exit/enter animations.
 *
 * - **First load**: enter animation → idle
 * - **Route changes**: exit → swap → enter → idle
 * - **Rapid successive navigation**: in-flight timers are cancelled before
 *   starting the new transition.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [phase, setPhase] = useState<Phase>("enter");
    const [displayChildren, setDisplayChildren] = useState(children);
    const prevPathname = useRef(pathname);
    const pendingChildren = useRef(children);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    // Keep ref in sync with latest children without triggering effect re-run
    pendingChildren.current = children;

    // ── First mount: enter → idle ──
    useEffect(() => {
        const t = setTimeout(() => setPhase("idle"), ENTER_MS);
        return () => clearTimeout(t);
    }, []);

    // ── Route changes only (pathname-driven) ──
    useLayoutEffect(() => {
        if (pathname === prevPathname.current) return;

        // Cancel any in-flight transition timers
        timers.current.forEach(clearTimeout);
        timers.current = [];

        prevPathname.current = pathname;
        setPhase("exit");

        const exitTimer = setTimeout(() => {
            setDisplayChildren(pendingChildren.current);
            setPhase("enter");

            const enterTimer = setTimeout(() => {
                setPhase("idle");
            }, ENTER_MS);

            timers.current.push(enterTimer);
        }, EXIT_MS);

        timers.current.push(exitTimer);
    }, [pathname]);

    let className = "";
    if (phase === "exit") className = "animate-page-exit";
    else if (phase === "enter") className = "animate-page-enter";

    return <div className={className}>{displayChildren}</div>;
}
