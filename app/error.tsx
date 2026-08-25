"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary — catches render/data errors from any page so
 * a bad D1 row or transient failure degrades to a styled recovery screen
 * instead of Next's default error page (server) or a blank body (client).
 */
export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Route error:", error);
    }, [error]);

    return (
        <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center px-4">
            <div className="w-full max-w-xl animate-fade-up">
                <div className="rounded-xl border border-border bg-black/40 p-6 font-mono text-sm leading-relaxed">
                    <div className="text-text-secondary">
                        <span className="text-accent">$</span> render --page
                    </div>

                    <div className="my-3 border-t border-border" />

                    <p className="text-text-secondary">
                        <span className="text-red-400">error:</span> something
                        broke while rendering this page.
                    </p>
                    {error.digest && (
                        <p className="mt-1 text-xs text-text-muted">
                            digest: {error.digest}
                        </p>
                    )}

                    <div className="mt-6 flex flex-wrap gap-3">
                        <button
                            onClick={reset}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                        >
                            Try again
                        </button>
                        <Link
                            href="/"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                        >
                            Home
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
