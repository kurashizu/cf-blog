"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Phase = "enter" | "idle" | "exit";

/**
 * Must match the CSS animation durations in global.css.
 * Keep these in sync if you tweak the @keyframes.
 */
const EXIT_MS = 200;
const ENTER_MS = 500;

/**
 * PageTransition
 *
 * Wraps page content and orchestrates a two-phase animation on every route
 * change: exit (shrink + fade out) → swap content → enter (fade up).
 *
 * Usage: place once in the root layout around `<main>{children}</main>`.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [phase, setPhase] = useState<Phase>("enter");
    const [displayChildren, setDisplayChildren] = useState(children);
    const prevPathname = useRef(pathname);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    // First mount: play enter animation, then settle to idle
    useEffect(() => {
        const t = setTimeout(() => setPhase("idle"), ENTER_MS);
        return () => clearTimeout(t);
    }, []);

    // Route changes: exit → swap → enter → idle
    useEffect(() => {
        // Clear any in-flight timers from a previous transition so rapid
        // successive navigations don't let stale timers overwrite state.
        timers.current.forEach(clearTimeout);
        timers.current = [];

        if (pathname === prevPathname.current) return;

        // Route changed
        prevPathname.current = pathname;
        setPhase("exit");

        const exitTimer = setTimeout(() => {
            // Swap to the new page content
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
