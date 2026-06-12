"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { SessionMeta } from "../types";

interface SessionDropdownProps {
    sessions: SessionMeta[];
    activeId: string;
    onCreate: () => void;
    onSwitch: (id: string) => void;
    onDelete: (id: string) => void;
}

function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

/** Button + popover that lists saved sessions. Handles its own open/close
 *  state and outside-click dismissal. */
export function SessionDropdown({
    sessions,
    activeId,
    onCreate,
    onSwitch,
    onDelete,
}: SessionDropdownProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (
                ref.current &&
                !ref.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () =>
            document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors text-sm"
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
                        d="M8 7h12M8 12h8M8 17h5"
                    />
                </svg>
                <span className="hidden sm:inline">Sessions</span>
                <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-scaleIn">
                    <div className="px-3 py-2 border-b border-border">
                        <button
                            onClick={onCreate}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-accent hover:bg-accent/10 transition-colors"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 4v16m8-8H4"
                                />
                            </svg>
                            New session
                        </button>
                    </div>
                    <div className="py-1 max-h-64 overflow-y-auto">
                        {sessions.length === 0 && (
                            <p className="px-3 py-2 text-xs text-text-muted">
                                No sessions yet
                            </p>
                        )}
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 hover:bg-bg-elevated transition-colors cursor-pointer",
                                    session.id === activeId && "bg-accent/10",
                                )}
                                onClick={() => onSwitch(session.id)}
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-text-primary truncate">
                                        {session.title}
                                    </p>
                                    <p className="text-xs text-text-muted">
                                        {formatRelativeTime(
                                            session.lastActiveAt,
                                        )}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(session.id);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                                    title="Delete session"
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
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
