"use client";

import { useEffect, useRef, useState } from "react";
import { TOOL_LIST_API } from "../config";
import type { ToolListItem } from "../types";

interface ToolPickerProps {
    /** Insert this string into the textarea at the cursor. */
    onSelect: (insertion: string) => void;
    /** Ref to the textarea — used to refocus after selection. */
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * The "Available Tools" button + popover. Fetches the tool list lazily on
 * first open and inserts `@tool_name ` into the input on click.
 */
export function ToolPicker({ onSelect, textareaRef }: ToolPickerProps) {
    const [open, setOpen] = useState(false);
    const [tools, setTools] = useState<ToolListItem[]>([]);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open || tools.length > 0) return;
        fetch(TOOL_LIST_API)
            .then((r) => r.json())
            .then((data) => {
                const list = (data as { tools?: ToolListItem[] })?.tools;
                if (Array.isArray(list)) setTools(list);
            })
            .catch(() => {
                /* best-effort — empty list is fine */
            });
    }, [open, tools.length]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-10 h-10 bg-bg-secondary hover:bg-bg-elevated border border-border hover:border-accent/60 rounded-xl flex items-center justify-center transition-all shrink-0"
                title="Available tools"
            >
                <svg
                    className="w-4 h-4 text-text-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                </svg>
            </button>
            {open && tools.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50">
                    <div className="px-3 py-2 border-b border-border text-xs text-text-muted font-medium">
                        Available Tools
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        {tools.map((tool) => (
                            <button
                                key={tool.name}
                                onClick={() => {
                                    onSelect(`@${tool.name} `);
                                    setOpen(false);
                                    textareaRef.current?.focus();
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-bg-secondary transition-colors"
                            >
                                <div className="text-sm text-text-primary font-medium">
                                    @{tool.name}
                                </div>
                                <div className="text-xs text-text-muted truncate">
                                    {tool.description}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
