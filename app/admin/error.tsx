"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

/**
 * Admin-scoped error boundary. Keeps a failed admin screen inside the
 * admin shell (nav still usable) instead of replacing the whole page with
 * the site-wide boundary.
 */
export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Admin error:", error);
    }, [error]);

    return (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
            <h2 className="text-lg font-semibold text-text-primary">
                This admin screen failed to load
            </h2>
            <p className="mt-1 text-sm text-text-muted">
                {error.message || "Unknown error"}
                {error.digest && (
                    <span className="ml-2 font-mono text-xs">
                        digest: {error.digest}
                    </span>
                )}
            </p>
            <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={reset}>
                    Try again
                </Button>
                <Link href="/admin">
                    <Button variant="secondary" size="sm">
                        Back to overview
                    </Button>
                </Link>
            </div>
        </div>
    );
}
