"use client";

import { cn } from "@/lib/utils";
import type { ToolStep } from "../types";

/** Compact, human-readable summary of a tool result. */
function formatToolResult(result: unknown): string {
    if (!result || typeof result !== "object") return String(result ?? "");
    const obj = result as Record<string, unknown>;
    if (obj.success === true && typeof obj.time === "string") return obj.time;
    if (obj.success === true && typeof obj.result === "string")
        return obj.result;
    if (obj.output !== undefined) return String(obj.output);
    return JSON.stringify(result).slice(0, 50);
}

interface ToolStepItemProps {
    step: ToolStep;
}

/** Renders one step in a model's "I used this tool" trail. */
export function ToolStepItem({ step }: ToolStepItemProps) {
    return (
        <div className="flex items-center gap-2 text-xs">
            {step.status === "in_progress" && (
                <>
                    <span className="w-3 h-3 border border-accent/40 border-t-accent rounded-full animate-spin" />
                    <span className="text-text-muted">
                        using {step.tool}...
                    </span>
                </>
            )}
            {step.status === "completed" && (
                <>
                    <span className="w-3 h-3 bg-accent/20 rounded-full flex items-center justify-center shrink-0">
                        <svg
                            className="w-2 h-2 text-accent"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                    </span>
                    <span className="text-text-secondary">
                        {step.tool}: {formatToolResult(step.result)}
                    </span>
                </>
            )}
            {step.status === "error" && (
                <>
                    <span className="w-3 h-3 bg-red-500/20 rounded-full flex items-center justify-center shrink-0">
                        <svg
                            className="w-2 h-2 text-red-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </span>
                    <span className="text-text-muted">
                        {step.tool}: failed
                    </span>
                </>
            )}
        </div>
    );
}

/** Renders the whole tool-call trail (collapsible aside above the bubble). */
export function ToolStepList({
    steps,
    className,
}: {
    steps: ToolStep[];
    className?: string;
}) {
    if (steps.length === 0) return null;
    return (
        <div
            className={cn(
                "flex flex-col gap-1 px-3 py-2 bg-bg-secondary/50 border border-border/50 rounded-xl",
                className,
            )}
        >
            {steps.map((step, idx) => (
                <ToolStepItem key={idx} step={step} />
            ))}
        </div>
    );
}
