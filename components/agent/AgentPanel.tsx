"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "model";
  parts: { text: string }[];
}

interface SessionMeta {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  title: string;
}

const AGENT_API = "https://agent.022025.xyz/api/chat";
const LLM_API = "/api/llm";
const SESSIONS_KEY = "agent_sessions";
const ACTIVE_KEY = "agent_active_session";
const MAX_SESSIONS = 10;

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

export function AgentPanel() {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [showDropdown, setShowDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

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

  const deleteSession = useCallback((id: string) => {
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
        } else {
          createNewSession();
        }
      } else {
        createNewSession();
      }
    }
  }, [activeSessionId, sessions, createNewSession]);

  const switchSession = useCallback((id: string) => {
    setActiveSessionId(id);
    localStorage.setItem(ACTIVE_KEY, id);
    setMessages([]);
    setShowDropdown(false);
  }, []);

  const updateSessionActivity = useCallback((title?: string) => {
    setSessions((prev) => {
      const updated = prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              lastActiveAt: Date.now(),
              title: title || (s.title === "New conversation" ? "" : s.title),
            }
          : s
      );
      saveSessions(updated);
      return updated;
    });
  }, [activeSessionId]);

  const generateTitle = useCallback(async (userMessage: string) => {
    try {
      const response = await fetch(LLM_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", parts: [{ text: `Based on this conversation start, generate a short title (max 10 Chinese characters or 5 English words) for this chat session. Respond with ONLY the title, no explanation:\n\n${userMessage}` }] }
          ],
          options: { maxTokens: 50, temperature: 0.9 },
        }),
      });
      if (!response.ok) return;
      const data = await response.json() as { text?: string };
      if (data.text) {
        const generatedTitle = data.text.slice(0, 20).trim();
        if (generatedTitle) {
          updateSessionActivity(generatedTitle);
        }
      }
    } catch {
      // Silently fail - title generation is not critical
    }
  }, [updateSessionActivity]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = createNewSession();
    }

    const userMessage: Message = { role: "user", parts: [{ text: input }] };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);

    // Generate title on first message if session title is still "New conversation"
    const isFirstMessage = sessions.find(s => s.id === sessionId)?.title === "New conversation";
    const titleToGenerate = isFirstMessage ? currentInput : undefined;

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

      const modelMessage: Message = { role: "model", parts: [{ text: "" }] };
      setMessages((prev) => [...prev, modelMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const raw = line.slice(6);
          try {
            const data = JSON.parse(raw);
            if (data.text !== undefined) {
              fullText += data.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "model",
                  parts: [{ text: fullText }],
                };
                return updated;
              });
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "model", parts: [{ text: "Sorry, something went wrong." }] },
      ]);
    } finally {
      setIsLoading(false);
      updateSessionActivity();
      if (titleToGenerate) {
        generateTitle(titleToGenerate);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleExpand = () => {
    setExpanded(true);
  };

  const handleCollapse = () => {
    setExpanded(false);
  };

  return (
    <>
      {/* Compact view — inside Agent section Card */}
      {!expanded && (
        <button
          onClick={handleExpand}
          className="w-full h-full flex flex-col items-center justify-center gap-3 py-8 px-4 transition-all duration-300 hover:scale-[1.02] cursor-pointer group"
        >
          {/* Brain icon */}
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:bg-accent/15 group-hover:border-accent/30 transition-all duration-300">
              <svg
                className="w-7 h-7 text-accent"
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
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold text-text-primary">KurAgent</p>
            <p className="text-xs text-text-muted mt-0.5">kurashizu makes thinking act</p>
          </div>

          <div className="flex items-center gap-1 text-text-muted">
            <span className="text-[10px] uppercase tracking-widest">Click to chat</span>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
            </svg>
          </div>
        </button>
      )}

      {/* Full-screen overlay — portal to body, outside Card overflow */}
      {expanded && typeof document !== "undefined" && createPortal(
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
          onClick={(e) => {
            if (e.target === overlayRef.current) handleCollapse();
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
              boxShadow: "0 25px 80px rgba(0,0,0,0.6), 0 0 60px var(--accent-subtle, rgba(255,107,53,0.1))",
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
                  <h3 className="text-sm font-semibold text-text-primary">KurAgent</h3>
                  <p className="text-xs text-text-muted">kurashizu makes thinking act</p>
                </div>
              </div>

              {/* Session title - centered */}
              <div className="flex-1 flex justify-center px-4">
                <span className="text-sm text-text-secondary truncate max-w-[300px]" title={sessions.find(s => s.id === activeSessionId)?.title}>
                  {sessions.find(s => s.id === activeSessionId)?.title || "New conversation"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Session dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowDropdown((v) => !v)}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors text-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12M8 12h8M8 17h5" />
                    </svg>
                    <span className="hidden sm:inline">Sessions</span>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          New session
                        </button>
                      </div>
                      <div className="py-1 max-h-64 overflow-y-auto">
                        {sessions.length === 0 && (
                          <p className="px-3 py-2 text-xs text-text-muted">No sessions yet</p>
                        )}
                        {sessions.map((session) => (
                          <div
                            key={session.id}
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 hover:bg-bg-elevated transition-colors cursor-pointer",
                              session.id === activeSessionId && "bg-accent/10"
                            )}
                            onClick={() => switchSession(session.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-text-primary truncate">{session.title}</p>
                              <p className="text-xs text-text-muted">{formatRelativeTime(session.lastActiveAt)}</p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSession(session.id);
                              }}
                              className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                              title="Delete session"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
                    onClick={() => deleteSession(activeSessionId)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                    title="Clear conversation"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}

                {/* Close button */}
                <button
                  onClick={handleCollapse}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
                    <p className="text-sm font-medium text-text-primary">KurAgent ready</p>
                    <p className="text-xs text-text-muted mt-1 max-w-[240px]">
                      Try asking about time, web content, or calculations
                    </p>
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-accent text-white rounded-br-md"
                        : "bg-bg-secondary text-text-secondary rounded-bl-md"
                    )}
                  >
                    {msg.parts[0].text}
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
                          style={{ animationDelay: `${delay}ms` }}
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
              <div className="flex items-center gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
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
        document.body
      )}
    </>
  );
}