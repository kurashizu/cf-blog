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
 * Individual pages no longer need hardcoded `animate-fade-up` classes.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("enter");
  const [displayChildren, setDisplayChildren] = useState(children);
  const prevPathname = useRef(pathname);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Clear any in-flight timers from a previous transition
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (prevPathname.current === pathname) {
      // Same route – this is either the first render or a search-param-only
      // change.  If we're still in the "enter" phase (first load), schedule
      // the transition to idle so the enter animation plays exactly once.
      if (phase === "enter") {
        const t = setTimeout(() => setPhase("idle"), ENTER_MS);
        timers.current.push(t);
      }
      return;
    }

    // --- Route changed ---

    // Remember the new route immediately so rapid successive navigations
    // don't confuse the check above.
    prevPathname.current = pathname;

    // 1) Exit: current content plays shrink + fade-out
    setPhase("exit");

    const exitTimer = setTimeout(() => {
      // 2) Swap to the new page content
      setDisplayChildren(children);
      setPhase("enter");

      // 3) Enter: new content fades up
      const enterTimer = setTimeout(() => {
        setPhase("idle");
      }, ENTER_MS);

      timers.current.push(enterTimer);
    }, EXIT_MS);

    timers.current.push(exitTimer);
  }, [pathname, children, phase]);

  let className = "";
  if (phase === "exit") className = "animate-page-exit";
  else if (phase === "enter") className = "animate-page-enter";

  return <div className={className}>{displayChildren}</div>;
}
