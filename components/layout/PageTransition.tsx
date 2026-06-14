"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * PageTransition
 *
 * Plays a simple fade-up entrance on every route change.
 * No exit animation — App Router unmounts the previous page synchronously,
 * so attempting to hold onto old content for an exit is unreliable.
 *
 * Technique: on route change, hide instantly (opacity 0, no transition),
 * then fade in on the next frame via double requestAnimationFrame.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [visible, setVisible] = useState(true);
    const prevPathname = useRef<string | null>(null);

    useEffect(() => {
        if (prevPathname.current === pathname) return;
        prevPathname.current = pathname;

        // Hide instantly, then fade in on the next frame
        setVisible(false);
        const raf = requestAnimationFrame(() => {
            requestAnimationFrame(() => setVisible(true));
        });
        return () => cancelAnimationFrame(raf);
    }, [pathname]);

    return (
        <div
            style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(8px)",
                transition: visible
                    ? "opacity 0.28s ease-out, transform 0.28s ease-out"
                    : "none",
            }}
        >
            {children}
        </div>
    );
}
