"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/ThemeProvider";

interface ToolStep {
    tool: string;
    args: Record<string, unknown>;
    status: "pending" | "in_progress" | "completed" | "error";
    result?: unknown;
    iteration: number;
}

interface Message {
    id: string; // unique client-generated ID
    role: "user" | "model";
    parts: { text: string }[];
    toolSteps?: ToolStep[];
    thinkContent?: string;
    isThinking?: boolean;
    error?: string;
}

interface SessionMeta {
    id: string;
    createdAt: number;
    lastActiveAt: number;
    title: string;
}

const AGENT_API = "https://cf-agent.kurashizu123.workers.dev/api/chat";
const SESSIONS_KEY = "agent_sessions";
const ACTIVE_KEY = "agent_active_session";
const MAX_SESSIONS = 10;

const themeMap = {
    dark: "r",
    "deep-blue": "b",
    "deep-green": "g",
} as const;

const ALL_PREFIXES = ["r", "g", "b"] as const;

let idCounter = 0;
function genId(): string {
    return `msg_${Date.now()}_${++idCounter}`;
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

function loadSessions(): SessionMeta[] {
    try {
        const raw = localStorage.getItem(SESSIONS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveSessions(sessions: SessionMeta[]): void {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function loadMessages(sessionId: string): Message[] {
    try {
        const raw = localStorage.getItem(`agent_messages:${sessionId}`);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveMessages(sessionId: string, messages: Message[]): void {
    localStorage.setItem(`agent_messages:${sessionId}`, JSON.stringify(messages));
}

function formatToolResult(result: unknown): string {
    if (!result || typeof result !== "object") return String(result ?? "");
    const obj = result as Record<string, unknown>;
    if (obj.success === true && typeof obj.time === "string") return obj.time;
    if (obj.success === true && typeof obj.result === "string")
        return obj.result;
    if (obj.output !== undefined) return String(obj.output);
    return JSON.stringify(result).slice(0, 50);
}

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
    const prefix = themeMap[theme] ?? "r";
    const [internalExpanded, setInternalExpanded] = useState(false);
    const expanded = externalExpanded ?? internalExpanded;
    const setExpanded = onCollapse ? () => {} : setInternalExpanded;
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [sessions, setSessions] = useState<SessionMeta[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string>("");
    const [showDropdown, setShowDropdown] = useState(false);
    const [showToolPicker, setShowToolPicker] = useState(false);
    const [availableTools, setAvailableTools] = useState<{name: string; description: string}[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Current model message ID being streamed — used to update the right message
    const modelIdRef = useRef<string>("");

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Load sessions on mount
    useEffect(() => {
        const loaded = loadSessions();
        setSessions(loaded);
        const active = localStorage.getItem(ACTIVE_KEY) || "";
        setActiveSessionId(active);
        if (active) {
            setMessages(loadMessages(active));
        }
    }, []);

    // Persist messages to localStorage whenever they change
    useEffect(() => {
        if (activeSessionId) {
            saveMessages(activeSessionId, messages);
        }
    }, [messages, activeSessionId]);

    // Close dropdown on outside click
    useEffect(() => {
        if (!showDropdown) return;
        const handler = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node)
            ) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showDropdown]);

    // Fetch available tools when panel expands
    useEffect(() => {
        if (expanded && availableTools.length === 0) {
            fetch(`${AGENT_API.replace('/chat', '/tool')}`)
                .then(r => r.json())
                .then((data) => {
                    const tools = (data as { tools?: {name: string; description: string}[] })?.tools;
                    if (tools && Array.isArray(tools)) {
                        setAvailableTools(tools);
                    }
                })
                .catch(() => {});
        }
    }, [expanded]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape" && expanded) setExpanded(false);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [expanded]);

    const createNewSession = useCallback(() => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const newSession: SessionMeta = {
            id,
            createdAt: now,
            lastActiveAt: now,
            title: "New conversation",
        };
        setSessions((prev) => {
            const updated = [newSession, ...prev].slice(0, MAX_SESSIONS);
            saveSessions(updated);
            return updated;
        });
        setActiveSessionId(id);
        localStorage.setItem(ACTIVE_KEY, id);
        setMessages([]);
        setShowDropdown(false);
        return id;
    }, []);

    const deleteSession = useCallback(
        (id: string) => {
            localStorage.removeItem(`agent_messages:${id}`);
            setSessions((prev) => {
                const updated = prev.filter((s) => s.id !== id);
                saveSessions(updated);
                return updated;
            });
            if (activeSessionId === id) {
                setMessages([]);
                if (sessions.length > 1) {
                    const next = sessions.find((s) => s.id !== id);
                    if (next) {
                        setActiveSessionId(next.id);
                        localStorage.setItem(ACTIVE_KEY, next.id);
                        setMessages(loadMessages(next.id));
                    } else {
                        createNewSession();
                    }
                } else {
                    createNewSession();
                }
            }
        },
        [activeSessionId, sessions, createNewSession],
    );

    const switchSession = useCallback((id: string) => {
        setActiveSessionId(id);
        localStorage.setItem(ACTIVE_KEY, id);
        setMessages(loadMessages(id));
        setShowDropdown(false);
    }, []);

    const updateSessionActivity = useCallback(
        (title?: string) => {
            setSessions((prev) => {
                const updated = prev.map((s) =>
                    s.id === activeSessionId
                        ? {
                              ...s,
                              lastActiveAt: Date.now(),
                              title:
                                  title ||
                                  (s.title === "New conversation"
                                      ? ""
                                      : s.title),
                          }
                        : s,
                );
                saveSessions(updated);
                return updated;
            });
        },
        [activeSessionId],
    );

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;
        let sessionId = activeSessionId;
        if (!sessionId) {
            sessionId = createNewSession();
        }

        const userMessage: Message = { id: genId(), role: "user", parts: [{ text: input }] };
        setMessages((prev) => [...prev, userMessage]);
        const currentInput = input;
        setInput("");
        setIsLoading(true);

        // Generate title on first message if session title is still "New conversation"
        const isFirstMessage =
            sessions.find((s) => s.id === sessionId)?.title ===
            "New conversation";
        const titleToGenerate = isFirstMessage ? currentInput : undefined;

        // Generate a unique ID for this model response — we'll update messages by this ID
        const thisModelId = genId();
        modelIdRef.current = thisModelId;

        // Create a placeholder model message immediately so it appears in DOM
        const modelPlaceholder: Message = {
            id: thisModelId,
            role: "model",
            parts: [{ text: "" }],
            toolSteps: [],
            thinkContent: undefined,
            isThinking: false,
            error: undefined,
        };
        setMessages((prev) => [...prev, modelPlaceholder]);

        try {
            const response = await fetch(AGENT_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: sessionId,
                    message: currentInput,
                    options: { stream: true },
                }),
            });

            if (!response.ok) throw new Error("Failed to get response");

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let fullText = "";
            let fullThinkText = "";
            let buffer = "";
            let currentToolSteps: ToolStep[] = [];
            let currentError: string | undefined;

            // Helper: update model message by ID
            const updateModelMsg = (updates: Partial<Message>) => {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === thisModelId ? { ...m, ...updates } : m,
                    ),
                );
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const raw = line.slice(6);
                    try {
                        const data = JSON.parse(raw);
                        switch (data.type) {
                            case "start_think": {
                                fullThinkText = data.content || "";
                                fullText = "";
                                updateModelMsg({
                                    thinkContent: fullThinkText,
                                    isThinking: true,
                                    parts: [{ text: "" }],
                                });
                                break;
                            }
                            case "think": {
                                fullThinkText += data.content || "";
                                updateModelMsg({ thinkContent: fullThinkText });
                                break;
                            }
                            case "end_think": {
                                updateModelMsg({ isThinking: false });
                                break;
                            }
                            case "start_text": {
                                fullText = data.content || "";
                                updateModelMsg({
                                    parts: [{ text: fullText }],
                                    isThinking: false,
                                });
                                break;
                            }
                            case "text": {
                                fullText += data.content || "";
                                updateModelMsg({
                                    parts: [{ text: fullText }],
                                    isThinking: false,
                                });
                                break;
                            }
                            case "start_tool":
                            case "tool_start": {
                                const step: ToolStep = {
                                    tool: data.tool,
                                    args: data.args || {},
                                    status: "in_progress",
                                    iteration: data.iteration ?? 0,
                                };
                                currentToolSteps = [...currentToolSteps, step];
                                updateModelMsg({ toolSteps: currentToolSteps });
                                await new Promise((r) => setTimeout(r, 50));
                                break;
                            }
                            case "tool_result": {
                                const idx = currentToolSteps.findIndex(
                                    (s) => s.status === "in_progress",
                                );
                                if (idx !== -1) {
                                    currentToolSteps = currentToolSteps.map(
                                        (s, i) =>
                                            i === idx
                                                ? {
                                                      ...s,
                                                      status:
                                                          data.success !== false
                                                              ? "completed"
                                                              : "error",
                                                      result: data.result,
                                                  }
                                                : s,
                                    );
                                }
                                updateModelMsg({ toolSteps: currentToolSteps });
                                break;
                            }
                            case "end_tool": {
                                // mark in_progress tool as completed
                                currentToolSteps = currentToolSteps.map((s) =>
                                    s.status === "in_progress"
                                        ? { ...s, status: "completed" as const }
                                        : s,
                                );
                                updateModelMsg({ toolSteps: currentToolSteps });
                                break;
                            }
                            case "end_process":
                            case "done": {
                                setIsLoading(false);
                                // Ensure any remaining in_progress tools are marked completed
                                if (currentToolSteps.some((s) => s.status === "in_progress")) {
                                    currentToolSteps = currentToolSteps.map((s) =>
                                        s.status === "in_progress"
                                            ? { ...s, status: "completed" as const }
                                            : s,
                                    );
                                    updateModelMsg({ toolSteps: currentToolSteps });
                                }
                                break;
                            }
                            case "error": {
                                currentError = data.content || data.message || "Unknown error";
                                updateModelMsg({ error: currentError });
                                setIsLoading(false);
                                break;
                            }
                        }
                    } catch {
                        // Skip malformed SSE lines
                    }
                }
            }

            // If no model message was created at all (e.g., empty response), create a fallback
            setMessages((prev) => {
                if (!prev.find((m) => m.id === thisModelId)) {
                    return [
                        ...prev,
                        {
                            id: thisModelId,
                            role: "model" as const,
                            parts: [{ text: fullText || "No response received." }],
                            toolSteps:
                                currentToolSteps.length > 0
                                    ? currentToolSteps
                                    : undefined,
                            thinkContent: fullThinkText || undefined,
                            isThinking: false,
                            error: currentError,
                        },
                    ];
                }
                return prev;
            });
        } catch {
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === thisModelId
                        ? {
                              ...m,
                              parts: [{ text: "Sorry, something went wrong." }],
                              error: "Network error",
                          }
                        : m,
                ),
            );
        } finally {
            setIsLoading(false);
            modelIdRef.current = "";
            updateSessionActivity(titleToGenerate);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleExpand = () => {
        if (onExpand) {
            onExpand();
        } else if (onCollapse) {
            onCollapse();
        } else {
            setInternalExpanded(true);
        }
    };

    const handleCollapse = () => {
        if (onCollapse) {
            // Controlled by parent — signal collapse (set showAgent=false)
            onCollapse();
        } else {
            setExpanded(false);
        }
    };

    return (
        <>
            {/* Compact view — inside Agent section Card */}
            {!expanded && (
                <button
                    onClick={handleExpand}
                    className="w-full h-full relative overflow-hidden rounded-xl group cursor-pointer"
                >
                    {/* Large title & slogan — top center */}
                    <div className="absolute left-0 right-0 top-0 flex flex-col items-center z-20 group-hover:opacity-0 group-hover:translate-y-[-8px] transition-all duration-300 pt-6">
                        <p className="text-3xl font-bold text-text-primary" style={{ fontFamily: "Pacifico, cursive" }}>KurAgent</p>
                        <p className="text-base text-text-muted mt-1">kurashizu makes thinking act</p>
                    </div>

                    {/* Images — 30% height → 75% on hover, centered */}
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                        {ALL_PREFIXES.map((p) => (
                            <div
                                key={p}
                                className="h-[30%] aspect-[264/235] flex items-center justify-center absolute overflow-hidden rounded-2xl group-hover:h-[75%] transition-all duration-300 ease-out"
                                style={{
                                    boxShadow: "0 0 8px 3px var(--accent)",
                                    opacity: p === prefix ? 1 : 0,
                                    pointerEvents: p === prefix ? "auto" : "none",
                                }}
                            >
                                <Image
                                    src={`/images/kuragent/${p}_0.png`}
                                    alt=""
                                    fill
                                    className="object-contain rounded-xl group-hover:opacity-0 transition-opacity duration-200"
                                />
                                <Image
                                    src={`/images/kuragent/${p}_1.png`}
                                    alt=""
                                    fill
                                    className="object-contain rounded-xl absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                />
                            </div>
                        ))}
                    </div>

                    {/* Click to chat — below image, only on hover */}
                    <div className="absolute left-0 right-0 flex flex-col items-center z-30 opacity-0 group-hover:opacity-100 transition-all duration-300" style={{ top: "78%" }}>
                        <div className="flex items-center gap-1 text-text-muted">
                            <span className="text-sm uppercase tracking-widest">Click to chat</span>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                            </svg>
                        </div>
                    </div>
                </button>
            )}

            {/* Full-screen overlay — portal to body, outside Card overflow */}
            {expanded &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        ref={overlayRef}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
                        onClick={(e) => {
                            if (e.target === overlayRef.current)
                                handleCollapse();
                        }}
                    >
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-bg-primary/95 backdrop-blur-md animate-fadeIn z-0"
                            onClick={handleCollapse}
                        />

                        {/* Panel */}
                        <div
                            className="relative w-full h-full max-w-[1100px] max-h-[800px] bg-bg-card/95 backdrop-blur-2xl border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scaleIn z-10"
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

                                {/* Session title - centered */}
                                <div className="flex-1 flex justify-center px-4">
                                    <span
                                        className="text-sm text-text-secondary truncate max-w-[300px]"
                                        title={
                                            sessions.find(
                                                (s) => s.id === activeSessionId,
                                            )?.title
                                        }
                                    >
                                        {sessions.find(
                                            (s) => s.id === activeSessionId,
                                        )?.title || "New conversation"}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Session dropdown */}
                                    <div className="relative" ref={dropdownRef}>
                                        <button
                                            onClick={() =>
                                                setShowDropdown((v) => !v)
                                            }
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
                                            <span className="hidden sm:inline">
                                                Sessions
                                            </span>
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

                                        {showDropdown && (
                                            <div className="absolute right-0 top-full mt-2 w-64 bg-bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-scaleIn">
                                                <div className="px-3 py-2 border-b border-border">
                                                    <button
                                                        onClick={() => {
                                                            createNewSession();
                                                        }}
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
                                                                session.id ===
                                                                    activeSessionId &&
                                                                    "bg-accent/10",
                                                            )}
                                                            onClick={() =>
                                                                switchSession(
                                                                    session.id,
                                                                )
                                                            }
                                                        >
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm text-text-primary truncate">
                                                                    {
                                                                        session.title
                                                                    }
                                                                </p>
                                                                <p className="text-xs text-text-muted">
                                                                    {formatRelativeTime(
                                                                        session.lastActiveAt,
                                                                    )}
                                                                </p>
                                                            </div>
                                                            <button
                                                                onClick={(
                                                                    e,
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    deleteSession(
                                                                        session.id,
                                                                    );
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
                                                                        strokeWidth={
                                                                            2
                                                                        }
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

                                    {/* Clear button */}
                                    {messages.length > 0 && (
                                        <button
                                            onClick={() =>
                                                deleteSession(activeSessionId)
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

                                    {/* Close button */}
                                    <button
                                        onClick={handleCollapse}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
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
                                {messages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                                        <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center">
                                            <svg
                                                className="w-6 h-6 text-accent"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={1.5}
                                                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                                />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-text-primary">
                                                KurAgent ready
                                            </p>
                                            <p className="text-xs text-text-muted mt-1 max-w-[240px]">
                                                Try asking about time, web
                                                content, or calculations
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={cn(
                                            "flex",
                                            msg.role === "user"
                                                ? "justify-end"
                                                : "justify-start",
                                        )}
                                    >
                                        <div className="flex flex-col gap-1.5 max-w-[80%]">
                                            {msg.toolSteps &&
                                                msg.toolSteps.length > 0 && (
                                                    <div className="flex flex-col gap-1 px-3 py-2 bg-bg-secondary/50 border border-border/50 rounded-xl">
                                                        {msg.toolSteps.map(
                                                            (step, sIdx) => (
                                                                <div
                                                                    key={sIdx}
                                                                    className="flex items-center gap-2 text-xs"
                                                                >
                                                                    {step.status ===
                                                                        "in_progress" && (
                                                                        <>
                                                                            <span className="w-3 h-3 border border-accent/40 border-t-accent rounded-full animate-spin" />
                                                                            <span className="text-text-muted">
                                                                                using{" "}
                                                                                {
                                                                                    step.tool
                                                                                }
                                                                                ...
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                    {step.status ===
                                                                        "completed" && (
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
                                                                                        strokeWidth={
                                                                                            3
                                                                                        }
                                                                                        d="M5 13l4 4L19 7"
                                                                                    />
                                                                                </svg>
                                                                            </span>
                                                                            <span className="text-text-secondary">
                                                                                {
                                                                                    step.tool
                                                                                }

                                                                                :{" "}
                                                                                {formatToolResult(
                                                                                    step.result,
                                                                                )}
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                    {step.status ===
                                                                        "error" && (
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
                                                                                        strokeWidth={
                                                                                            3
                                                                                        }
                                                                                        d="M6 18L18 6M6 6l12 12"
                                                                                    />
                                                                                </svg>
                                                                            </span>
                                                                            <span className="text-text-muted">
                                                                                {
                                                                                    step.tool
                                                                                }

                                                                                :
                                                                                failed
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            ),
                                                        )}
                                                    </div>
                                                )}
                                                {msg.thinkContent && (
                                                    <details className="mt-2 rounded-lg bg-bg-secondary/30 border-l-2 border-accent/40 overflow-hidden">
                                                        <summary className="px-3 py-2 text-xs text-text-muted cursor-pointer hover:text-text-primary select-none">
                                                            💭 Show reasoning
                                                        </summary>
                                                        <div className="px-3 py-2 font-mono text-xs text-text-muted whitespace-pre-wrap border-t border-border/30">
                                                            {msg.thinkContent}
                                                        </div>
                                                    </details>
                                                )}
                                                {msg.isThinking && !msg.thinkContent && (
                                                    <div className="mt-2 px-3 py-2 text-xs text-text-muted">
                                                        <span className="animate-pulse">💭 Thinking...</span>
                                                    </div>
                                                )}
                                                {msg.error && (
                                                    <div className="mt-2 px-3 py-2 text-xs text-red-400 bg-red-400/10 rounded-lg">
                                                        ⚠️ {msg.error}
                                                    </div>
                                                )}
                                            {msg.parts[0]?.text && (
                                                <div
                                                    className={cn(
                                                        "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                                                        msg.role === "user"
                                                            ? "bg-accent text-white rounded-br-md"
                                                            : "bg-bg-secondary text-text-secondary rounded-bl-md",
                                                    )}
                                                >
                                                    {msg.role === "model" ? (
                                                        <MarkdownRenderer className="markdown-content">
                                                                {msg.parts[0].text}
                                                            </MarkdownRenderer>
                                                    ) : (
                                                        msg.parts[0].text
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {/* Streaming indicator */}
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
                                    <button
                                        onClick={() => setShowToolPicker(v => !v)}
                                        className="w-10 h-10 bg-bg-secondary hover:bg-bg-elevated border border-border hover:border-accent/60 rounded-xl flex items-center justify-center transition-all shrink-0"
                                        title="Available tools"
                                    >
                                        <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </button>
                                    {showToolPicker && (
                                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50">
                                            <div className="px-3 py-2 border-b border-border text-xs text-text-muted font-medium">Available Tools</div>
                                            <div className="max-h-48 overflow-y-auto">
                                                {availableTools.map(tool => (
                                                    <button
                                                        key={tool.name}
                                                        onClick={() => {
                                                            setInput(prev => prev + `@${tool.name} `);
                                                            setShowToolPicker(false);
                                                            textareaRef.current?.focus();
                                                        }}
                                                        className="w-full px-3 py-2 text-left hover:bg-bg-secondary transition-colors"
                                                    >
                                                        <div className="text-sm text-text-primary font-medium">@{tool.name}</div>
                                                        <div className="text-xs text-text-muted truncate">{tool.description}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
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
                                        onClick={sendMessage}
                                        disabled={!input.trim() || isLoading}
                                        className="w-10 h-10 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-all shrink-0"
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