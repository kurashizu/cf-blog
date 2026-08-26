"use client";

import { cn } from "@/lib/utils";

export interface ToolbarAction {
    id: string;
    label: string;
    /** Rendered glyph — kept textual so the toolbar needs no icon set. */
    glyph: string;
    hint: string;
    run: () => void;
}

/**
 * Markdown editing toolbar. Buttons are `type="button"` so they never
 * submit the surrounding form, and `onMouseDown` is prevented so clicking
 * one doesn't blur the textarea (which would lose the selection the
 * command operates on).
 */
export function MarkdownToolbar({
    actions,
    trailing,
}: {
    actions: ToolbarAction[];
    trailing?: React.ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-bg-secondary px-2 py-1.5">
            {actions.map((a) => (
                <button
                    key={a.id}
                    type="button"
                    title={a.hint}
                    aria-label={a.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={a.run}
                    className={cn(
                        "min-w-[1.9rem] rounded px-2 py-1 font-mono text-xs text-text-muted transition-colors",
                        "hover:bg-bg-elevated hover:text-accent",
                    )}
                >
                    {a.glyph}
                </button>
            ))}
            {trailing && (
                <div className="ml-auto flex items-center gap-2 pr-1">
                    {trailing}
                </div>
            )}
        </div>
    );
}
