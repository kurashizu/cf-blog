"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

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
    const [open, setOpen] = useState(variant === "inline");
    const [query, setQuery] = useState(initialQuery);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
        }
    }, [open]);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = query.trim();
        if (!trimmed) return;
        onSearch?.(trimmed);
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
        if (variant === "icon") setOpen(false);
    }

    // ── Inline (always-open input, used on /search page) ──
    if (variant === "inline") {
        return (
            <form onSubmit={handleSubmit} className="relative group">
                <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search articles & news..."
                    className="w-full max-w-md h-10 rounded-xl bg-bg-card border border-border
                               px-4 pl-10 text-sm text-text-primary
                               placeholder:text-text-muted
                               focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent
                               transition-all duration-300"
                />
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
            </form>
        );
    }

    // ── Icon (expandable, used in Header) ──
    return (
        <div className="relative flex items-center">
            {open ? (
                <form
                    onSubmit={handleSubmit}
                    className="flex items-center gap-1.5 animate-fadeIn"
                >
                    <div className="relative">
                        <input
                            ref={inputRef}
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onBlur={() => {
                                if (!query)
                                    setTimeout(() => setOpen(false), 200);
                            }}
                            placeholder="Search..."
                            className="w-36 md:w-44 h-8 rounded-lg bg-bg-card border border-border
                                       pl-8 pr-3 text-xs text-text-primary
                                       placeholder:text-text-muted
                                       focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent
                                       transition-all duration-300 animate-scaleIn
                                       origin-right"
                        />
                        <svg
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted"
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
                    </div>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="w-6 h-6 flex items-center justify-center
                                   text-text-muted hover:text-text-primary
                                   hover:bg-bg-card rounded-md transition-all duration-200"
                        tabIndex={-1}
                    >
                        <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </form>
            ) : (
                <button
                    onClick={() => setOpen(true)}
                    className="group/search-btn w-9 h-9 flex items-center justify-center rounded-xl
                               bg-bg-card border border-border
                               hover:border-accent hover:bg-accent/5
                               active:scale-90
                               transition-all duration-200 ease-out"
                    title="Search"
                >
                    <svg
                        className="w-4 h-4 text-text-secondary
                                   group-hover/search-btn:text-accent
                                   group-hover/search-btn:scale-110
                                   transition-all duration-200"
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
                </button>
            )}
        </div>
    );
}
