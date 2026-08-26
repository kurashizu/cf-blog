"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Chip-style tag entry, replacing the raw comma-separated string field.
 *
 * Commits a tag on Enter or comma; Backspace on an empty input removes the
 * last chip. Duplicates and blanks are rejected silently.
 */
export function TagInput({
    id,
    value,
    onChange,
    placeholder = "Add a tag…",
    suggestions = [],
}: {
    id?: string;
    value: string[];
    onChange: (tags: string[]) => void;
    placeholder?: string;
    suggestions?: string[];
}) {
    const [draft, setDraft] = useState("");

    const commit = (raw: string) => {
        const tag = raw.trim().replace(/,+$/, "");
        if (!tag) return;
        if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
            setDraft("");
            return;
        }
        onChange([...value, tag]);
        setDraft("");
    };

    const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

    const unused = suggestions.filter(
        (s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()),
    );

    return (
        <div>
            <div
                className={cn(
                    "flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-2 py-1.5",
                    "transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20",
                )}
            >
                {value.map((tag) => (
                    <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 text-xs text-accent"
                    >
                        {tag}
                        <button
                            type="button"
                            onClick={() => remove(tag)}
                            aria-label={`Remove ${tag}`}
                            className="opacity-70 transition-opacity hover:opacity-100"
                        >
                            ✕
                        </button>
                    </span>
                ))}
                <input
                    id={id}
                    type="text"
                    value={draft}
                    placeholder={value.length === 0 ? placeholder : ""}
                    onChange={(e) => {
                        // Typing a comma commits, so pasted "a, b, c" works.
                        if (e.target.value.includes(",")) {
                            e.target.value
                                .split(",")
                                .forEach((part) => commit(part));
                        } else {
                            setDraft(e.target.value);
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            commit(draft);
                        } else if (
                            e.key === "Backspace" &&
                            draft === "" &&
                            value.length > 0
                        ) {
                            remove(value[value.length - 1]);
                        }
                    }}
                    onBlur={() => commit(draft)}
                    className="min-w-[6rem] flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
                />
            </div>
            {unused.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                    {unused.slice(0, 12).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => commit(s)}
                            className="rounded border border-border px-1.5 py-0.5 text-[0.6875rem] text-text-muted transition-colors hover:border-accent hover:text-accent"
                        >
                            + {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
