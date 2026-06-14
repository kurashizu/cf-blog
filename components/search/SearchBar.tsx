"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface SearchBarProps {
    /** If true, render as a full input; otherwise as an icon that expands. */
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
        setOpen(false);
    }

    if (variant === "inline") {
        return (
            <form onSubmit={handleSubmit} className="relative">
                <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search..."
                    className="w-40 md:w-56 h-8 rounded-lg bg-bg-card border border-border
                               px-3 pl-8 text-xs text-text-primary
                               placeholder:text-text-muted
                               focus:outline-none focus:ring-1 focus:ring-accent
                               transition-all duration-200"
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
            </form>
        );
    }

    // Icon variant
    return (
        <div className="relative flex items-center">
            {open ? (
                <form onSubmit={handleSubmit} className="flex items-center gap-1">
                    <input
                        ref={inputRef}
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onBlur={() => {
                            if (!query) setOpen(false);
                        }}
                        placeholder="Search..."
                        className="w-32 md:w-48 h-8 rounded-lg bg-bg-card border border-border
                                   px-3 text-xs text-text-primary
                                   placeholder:text-text-muted
                                   focus:outline-none focus:ring-1 focus:ring-accent
                                   transition-all duration-200"
                    />
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-text-primary"
                        tabIndex={-1}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </form>
            ) : (
                <button
                    onClick={() => setOpen(true)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg
                               bg-bg-card border border-border
                               hover:border-accent transition-all duration-200"
                    title="Search"
                >
                    <svg
                        className="w-4 h-4 text-text-secondary"
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
