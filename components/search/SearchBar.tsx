"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";

interface SearchBarProps {
    initialQuery?: string;
    onSearch?: (q: string) => void;
}

export function SearchBar({
    initialQuery = "",
    onSearch,
}: SearchBarProps) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isPending, startTransition] = useTransition();

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = inputRef.current?.value.trim();
        if (!trimmed) return;
        onSearch?.(trimmed);
        startTransition(() => {
            router.push(`/search?q=${encodeURIComponent(trimmed)}`);
        });
    }

    function Spinner({ className }: { className: string }) {
        return (
            <svg
                className={`${className} animate-spin`}
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
        );
    }

    function SearchIcon({ className }: { className: string }) {
        return (
            <svg
                className={className}
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
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="relative group w-full max-w-[200px]"
        >
            <input
                ref={inputRef}
                type="search"
                defaultValue={initialQuery}
                placeholder="Semantic Search..."
                className="w-full h-8 rounded-lg bg-bg-card border border-border
                           pl-8 pr-3 text-xs text-text-primary
                           placeholder:text-text-muted
                           focus:outline-none focus-visible:outline-none
                           focus:border-accent/60
                           transition-all duration-300"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 flex items-center justify-center">
                {isPending ? (
                    <Spinner className="w-3.5 h-3.5 text-accent" />
                ) : (
                    <SearchIcon className="w-3.5 h-3.5 text-text-muted transition-colors duration-300 group-focus-within:text-accent" />
                )}
            </span>
        </form>
    );
}
