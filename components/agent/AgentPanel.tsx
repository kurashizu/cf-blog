"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/components/providers/ThemeProvider";
import { ALL_THEME_PREFIXES, THEME_PREFIX } from "./config";
import { useAgentSession } from "./hooks/useAgentSession";
import { useAgentStream } from "./hooks/useAgentStream";
import { AgentEmptyState } from "./components/AgentEmptyState";
import { MessageBubble } from "./components/MessageBubble";
import { SessionDropdown } from "./components/SessionDropdown";
import { ToolPicker } from "./components/ToolPicker";

/** Closing animation duration — must match `animate-fadeOut`/`animate-slideDown` in CSS. */
const CLOSE_ANIM_MS = 200;

export function AgentPanel({
    expanded: externalExpanded,
    onCollapse,
    onExpand,
}: {
    expanded?: boolean;
    onCollapse?: () => void;
    onExpand?: () => void;
}) {
    const { theme } = useTheme();
    const prefix = THEME_PREFIX[theme] ?? "r";

    // Controlled or uncontrolled expanded state.
    const [internalExpanded, setInternalExpanded] = useState(false);
    const expanded = externalExpanded ?? internalExpanded;
    const isControlled = externalExpanded !== undefined;

    const [closing, setClosing] = useState(false);

    const handleCollapse = () => {
        if (closing) return;
        setClosing(true);
        setTimeout(() => {
            setClosing(false);
            if (onCollapse) onCollapse();
            else setInternalExpanded(false);
        }, CLOSE_ANIM_MS);
    };

    const handleExpand = () => {
        if (onExpand) onExpand();
        else if (isControlled) onCollapse?.();
        else setInternalExpanded(true);
    };

    // Esc closes the panel.
    useEffect(() => {
        if (!expanded) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleCollapse();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expanded]);

    // Session + message state.
    const session = useAgentSession();
    const { sessions, activeId, activeMessages, setActiveMessages } = session;

    const [isLoading, setIsLoading] = useState(false);
    const [input, setInput] = useState("");

    // Streaming hook: it mutates `activeMessages` via setActiveMessages and
    // surfaces the first user input via onFirstMessage so we can update the
    // session title.
    const { send, resetFirstFlag } = useAgentStream({
        getMessages: () => activeMessages,
        setMessages: (updater) => setActiveMessages((prev) => updater(prev)),
        setIsLoading: setIsLoading,
        onFirstMessage: (userInput) => {
            // Promote the first user input into the session title.
            session.touchActive(userInput);
        },
    });
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to the latest message.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activeMessages, isLoading]);

    // Reset the "first message" tracker whenever the user switches sessions.
    useEffect(() => {
        resetFirstFlag();
    }, [activeId, resetFirstFlag]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;
        const text = input;
        setInput("");
        const id = activeId || session.createNew();
        await send(text, id);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ---------- render ----------
    return (
        <>
            {/* Compact view is disabled in the GadgetsPanel context — the 2x2
                grid is the entry point. Kept here for future use. */}
            {false && (
                <button
                    onClick={handleExpand}
                    className="w-full h-full relative overflow-hidden rounded-xl group cursor-pointer"
                >
                    <div className="absolute left-0 right-0 top-0 flex flex-col items-center z-20 group-hover:opacity-0 group-hover:translate-y-[-8px] transition-all duration-300 pt-6">
                        <p
                            className="text-3xl font-bold text-text-primary"
                            style={{ fontFamily: "Pacifico, cursive" }}
                        >
                            KurAgent
                        </p>
                        <p className="text-base text-text-muted mt-1">
                            kurashizu makes thinking act
                        </p>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        {ALL_THEME_PREFIXES.map((p) => (
                            <div
                                key={p}
                                className="h-[30%] aspect-[264/235] flex items-center justify-center absolute overflow-hidden rounded-2xl group-hover:h-[75%] transition-all duration-300 ease-out"
                                style={{
                                    boxShadow: "0 0 8px 3px var(--accent)",
                                    opacity: p === prefix ? 1 : 0,
                                    pointerEvents:
                                        p === prefix ? "auto" : "none",
                                }}
                            />
                        ))}
                    </div>
                </button>
            )}

            {(expanded || closing) &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        ref={overlayRef}
                        className={`fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 ${
                            closing ? "animate-fadeOut" : ""
                        }`}
                        onClick={(e) => {
                            if (e.target === overlayRef.current)
                                handleCollapse();
                        }}
                    >
                        <div
                            className={`absolute inset-0 bg-bg-primary/95 backdrop-blur-md z-0 ${
                                closing ? "animate-fadeOut" : "animate-fadeIn"
                            }`}
                            onClick={handleCollapse}
                        />

                        <div
                            className={`relative w-full h-full max-w-[1100px] max-h-[800px] bg-bg-card/95 backdrop-blur-2xl border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10 ${
                                closing
                                    ? "animate-slideDown"
                                    : "animate-scaleIn"
                            }`}
                            style={{
                                boxShadow:
                                    "0 25px 80px rgba(0,0,0,0.6), 0 0 60px var(--accent-subtle, rgba(255,107,53,0.1))",
                            }}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-accent/15 rounded-xl flex items-center justify-center">
                                        <svg
                                            className="w-4 h-4 text-accent"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={1.5}
                                                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                                            />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-text-primary">
                                            KurAgent
                                        </h3>
                                        <p className="text-xs text-text-muted">
                                            kurashizu makes thinking act
                                        </p>
                                    </div>
                                </div>

                                <div className="flex-1 flex justify-center px-4">
                                    <span
                                        className="text-sm text-text-secondary truncate max-w-[300px]"
                                        title={
                                            sessions.find(
                                                (s) => s.id === activeId,
                                            )?.title
                                        }
                                    >
                                        {sessions.find((s) => s.id === activeId)
                                            ?.title || "New conversation"}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <SessionDropdown
                                        sessions={sessions}
                                        activeId={activeId}
                                        onCreate={() => session.createNew()}
                                        onSwitch={(id) => session.switchTo(id)}
                                        onDelete={(id) => session.remove(id)}
                                    />
                                    {activeMessages.length > 0 && (
                                        <button
                                            onClick={() =>
                                                session.remove(activeId)
                                            }
                                            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                                            title="Clear conversation"
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
                                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                />
                                            </svg>
                                        </button>
                                    )}
                                    <button
                                        onClick={handleCollapse}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                                        title="Close"
                                    >
                                        <svg
                                            className="w-5 h-5"
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
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                                {activeMessages.length === 0 ? (
                                    <AgentEmptyState />
                                ) : (
                                    activeMessages.map((msg) => (
                                        <MessageBubble
                                            key={msg.id}
                                            message={msg}
                                        />
                                    ))
                                )}

                                {isLoading && (
                                    <div className="flex justify-start">
                                        <div className="bg-bg-secondary text-text-secondary rounded-2xl rounded-bl-md px-4 py-3">
                                            <div className="flex gap-1">
                                                {[0, 150, 300].map((delay) => (
                                                    <span
                                                        key={delay}
                                                        className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce"
                                                        style={{
                                                            animationDelay: `${delay}ms`,
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="px-5 py-4 border-t border-border shrink-0">
                                <div className="relative flex items-center gap-2">
                                    <ToolPicker
                                        onSelect={(text) =>
                                            setInput((prev) => prev + text)
                                        }
                                        textareaRef={textareaRef}
                                    />
                                    <textarea
                                        ref={textareaRef}
                                        value={input}
                                        onChange={(e) =>
                                            setInput(e.target.value)
                                        }
                                        onKeyDown={handleKeyDown}
                                        placeholder="Ask KurAgent..."
                                        className="flex-1 bg-bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent/60 transition-colors"
                                        rows={1}
                                        disabled={isLoading}
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!input.trim() || isLoading}
                                        className="w-10 h-10 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-all shrink-0"
                                        title="Send"
                                    >
                                        <svg
                                            className="w-4 h-4 text-white"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}
