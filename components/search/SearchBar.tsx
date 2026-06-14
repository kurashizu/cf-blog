"use client";

import { useRouter, usePathname } from "next/navigation";
import { useRef, useState, useEffect } from "react";

interface SearchBarProps {
    variant?: "icon" | "inline";
    initialQuery?: string;
    onSearch?: (q: string) => void;
}

export function SearchBar({
    variant = "icon",
    initialQuery = "",
    onSearch,
}: SearchBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const inputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);

    // Reset loading state on navigation
    useEffect(() => {
        setLoading(false);
    }, [pathname]);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = inputRef.current?.value.trim();
        if (!trimmed) return;
        setLoading(true);
        onSearch?.(trimmed);
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }

    // ── Navbar: always-expanded input ──
    if (variant === "icon") {
        return (
            <form
                onSubmit={handleSubmit}
                className="relative group w-full max-w-[200px]"
            >
                <input
                    ref={inputRef}
                    type="search"
                    defaultValue={initialQuery}
                    placeholder="Search..."
                    className="w-full h-8 rounded-lg bg-bg-card border border-border
                               pl-8 pr-3 text-xs text-text-primary
                               placeholder:text-text-muted
                               focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent
                               transition-all duration-300"
                />
                {loading ? (
                    <svg
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-accent animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                    </svg>
                ) : (
                    <svg
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted
                                   transition-colors duration-300 group-focus-within:text-accent"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                    </svg>
                )}
            </form>
        );
    }

    // ── Inline (full-width input on /search page) ──
    return (
        <form onSubmit={handleSubmit} className="relative group">
            <input
                ref={inputRef}
                type="search"
                defaultValue={initialQuery}
                placeholder="Search articles & news..."
                className="w-full max-w-md h-10 rounded-xl bg-bg-card border border-border
                           px-4 pl-10 text-sm text-text-primary
                           placeholder:text-text-muted
                           focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent
                           transition-all duration-300"
            />
            {loading ? (
                <svg
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-accent animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                </svg>
            ) : (
                <svg
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted
                               transition-colors duration-300 group-focus-within:text-accent"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                </svg>
            )}
        </form>
    );
}
