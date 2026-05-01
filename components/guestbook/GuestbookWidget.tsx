"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";

interface GuestbookMessage {
    id: string;
    name: string;
    content: string;
    timestamp: string;
    avatar?: string;
    avatarIndex?: number;
}

const AVATAR_COUNT = 9;

function getAvatarSrc(message: GuestbookMessage): string {
    if (message.avatar) return message.avatar;
    const index = message.avatarIndex ?? 0;
    return `/images/avatar/avatar_${index % AVATAR_COUNT}.png`;
}

export function GuestbookWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<GuestbookMessage[]>([]);
    const [name, setName] = useState("");
    const [content, setContent] = useState("");
    const [avatar, setAvatar] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchLoading, setFetchLoading] = useState(true);
    const honeypotRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchMessages();
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const fetchMessages = async () => {
        try {
            const res = await fetch("/api/guestbook");
            const data = await res.json() as { messages?: GuestbookMessage[] };
            if (data.messages) setMessages(data.messages);
        } catch (e) {
            console.error("Failed to fetch messages:", e);
        } finally {
            setFetchLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!name.trim() || name.trim().length > 100) {
            setError("Name must be 1-100 characters");
            return;
        }
        if (!content.trim() || content.trim().length > 2000) {
            setError("Content must be 1-2000 characters");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/guestbook", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    content: content.trim(),
                    avatar: avatar.trim() || undefined,
                    website: honeypotRef.current?.value,
                }),
            });

            const data = await res.json() as { error?: string; message?: GuestbookMessage };

            if (!res.ok) {
                setError(data.error || "Failed to post message");
                return;
            }

            if (data.message) {
                setMessages((prev) => [data.message!, ...prev]);
            }
            setName("");
            setContent("");
            setAvatar("");
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* Floating button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 left-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-50 overflow-hidden"
                style={{ padding: 0 }}
                aria-label="Guestbook"
            >
                {isOpen ? (
                    <div className="w-full h-full bg-bg-card flex items-center justify-center">
                        <svg
                            className="w-6 h-6 text-accent"
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
                    </div>
                ) : (
                    <div className="w-full h-full bg-bg-card border border-border flex items-center justify-center">
                        <svg
                            className="w-6 h-6 text-accent"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                            />
                        </svg>
                    </div>
                )}
            </button>

            {/* Guestbook panel */}
            {isOpen && (
                <div className="fixed bottom-24 left-6 w-80 sm:w-96 h-[28rem] bg-bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50 animate-slideUp">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-bg-secondary">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-accent/20 rounded-full flex items-center justify-center">
                                <svg
                                    className="w-4 h-4 text-accent"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-text-primary">
                                    Guestbook
                                </h3>
                                <p className="text-xs text-text-muted">
                                    Leave a message
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-elevated transition-colors"
                        >
                            <svg
                                className="w-5 h-5 text-text-muted"
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

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {fetchLoading ? (
                            <div className="text-center py-8 text-text-muted text-sm">
                                Loading...
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-sm text-text-secondary">
                                    No messages yet.
                                </p>
                                <p className="text-xs text-text-muted mt-1">
                                    Be the first to leave a message!
                                </p>
                            </div>
                        ) : (
                            messages.slice(0, 10).map((msg) => (
                                <Card key={msg.id}>
                                    <CardContent className="p-3">
                                        <div className="flex items-start gap-2">
                                            <img
                                                src={getAvatarSrc(msg)}
                                                alt={msg.name}
                                                className="w-8 h-8 rounded-full object-cover shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="font-medium text-text-primary text-xs">
                                                        {msg.name}
                                                    </span>
                                                    <span className="text-xs text-text-muted">
                                                        {formatDate(msg.timestamp)}
                                                    </span>
                                                </div>
                                                <p className="text-text-secondary text-xs whitespace-pre-wrap break-words">
                                                    {msg.content}
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Form */}
                    <div className="p-4 border-t border-border bg-bg-secondary">
                        <form onSubmit={handleSubmit} className="space-y-2">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={100}
                                placeholder="Your name"
                                required
                                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                            />
                            <div className="flex gap-2">
                                <input
                                    type="url"
                                    value={avatar}
                                    onChange={(e) => setAvatar(e.target.value)}
                                    placeholder="Avatar URL (optional)"
                                    className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                                />
                                {/* Honeypot */}
                                <input
                                    ref={honeypotRef}
                                    type="text"
                                    name="website"
                                    tabIndex={-1}
                                    autoComplete="off"
                                    className="hidden"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    maxLength={2000}
                                    placeholder="Leave a message..."
                                    required
                                    rows={2}
                                    className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
                                />
                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="shrink-0"
                                >
                                    {loading ? "..." : "Post"}
                                </Button>
                            </div>
                            {error && (
                                <p className="text-xs text-red-500">{error}</p>
                            )}
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}