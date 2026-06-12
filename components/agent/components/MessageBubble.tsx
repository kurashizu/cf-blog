"use client";

import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";
import type { Message } from "../types";
import { ToolStepList } from "./ToolStepItem";

interface MessageBubbleProps {
    message: Message;
}

/** Renders a single chat message — including thinking, tool steps, and text. */
export function MessageBubble({ message }: MessageBubbleProps) {
    const isUser = message.role === "user";
    const text = message.parts[0]?.text;

    return (
        <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
            <div className="flex flex-col gap-1.5 max-w-[80%]">
                {message.toolSteps && message.toolSteps.length > 0 && (
                    <ToolStepList steps={message.toolSteps} />
                )}

                {message.thinkContent && (
                    <details className="mt-2 rounded-lg bg-bg-secondary/30 border-l-2 border-accent/40 overflow-hidden">
                        <summary className="px-3 py-2 text-xs text-text-muted cursor-pointer hover:text-text-primary select-none">
                            💭 Show reasoning
                        </summary>
                        <div className="px-3 py-2 font-mono text-xs text-text-muted whitespace-pre-wrap border-t border-border/30">
                            {message.thinkContent}
                        </div>
                    </details>
                )}

                {message.isThinking && !message.thinkContent && (
                    <div className="mt-2 px-3 py-2 text-xs text-text-muted">
                        <span className="animate-pulse">💭 Thinking...</span>
                    </div>
                )}

                {message.error && (
                    <div className="mt-2 px-3 py-2 text-xs text-red-400 bg-red-400/10 rounded-lg">
                        ⚠️ {message.error}
                    </div>
                )}

                {text && (
                    <div
                        className={cn(
                            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                            isUser
                                ? "bg-accent text-white rounded-br-md"
                                : "bg-bg-secondary text-text-secondary rounded-bl-md",
                        )}
                    >
                        {isUser ? (
                            text
                        ) : (
                            <MarkdownRenderer className="markdown-content">
                                {text}
                            </MarkdownRenderer>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
