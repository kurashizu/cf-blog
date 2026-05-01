"use client";

import { useState, useEffect } from "react";
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
const PAGE_SIZE = 20;

function getAvatarSrc(message: GuestbookMessage): string {
    if (message.avatar) return message.avatar;
    const index = message.avatarIndex ?? 0;
    return `/images/avatar/avatar_${index % AVATAR_COUNT}.png`;
}

interface GuestbookMessagesProps {
    initialRefreshKey?: number;
}

export function GuestbookMessages({ initialRefreshKey }: GuestbookMessagesProps) {
    const [messages, setMessages] = useState<GuestbookMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);
    const [refreshKey, setRefreshKey] = useState(initialRefreshKey ?? 0);
    const [page, setPage] = useState(1);

    useEffect(() => {
        const handlePosted = () => setRefreshKey((k) => k + 1);
        window.addEventListener('guestbook-posted', handlePosted);
        return () => window.removeEventListener('guestbook-posted', handlePosted);
    }, []);

    useEffect(() => {
        fetch("/api/guestbook")
            .then((res) => res.json() as Promise<{ messages?: GuestbookMessage[] }>)
            .then((data) => {
                if (data.messages) setMessages(data.messages);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [refreshKey]);

    if (loading) {
        return (
            <div className="text-center py-6 text-text-muted text-sm">
                Loading messages...
            </div>
        );
    }

    if (messages.length === 0) {
        return (
            <Card>
                <CardContent className="text-center py-6 text-text-muted text-sm">
                    No messages yet. Click the chat button to leave one!
                </CardContent>
            </Card>
        );
    }

    const totalPages = Math.ceil(messages.length / PAGE_SIZE);
    const paginatedMessages = messages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <>
            <div className="max-w-xl mx-auto space-y-3">
                {messages.slice(0, 5).map((msg) => (
                    <Card key={msg.id}>
                        <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                                <img
                                    src={getAvatarSrc(msg)}
                                    alt={msg.name}
                                    className="w-10 h-10 rounded-full object-cover shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-text-primary text-sm">
                                            {msg.name}
                                        </span>
                                        <span className="text-xs text-text-muted">
                                            {formatDate(msg.timestamp)}
                                        </span>
                                    </div>
                                    <p className="text-text-secondary text-sm whitespace-pre-wrap break-words">
                                        {msg.content}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {messages.length > 5 && (
                    <div className="text-center">
                        <Button variant="secondary" onClick={() => { setShowAll(true); setPage(1); }}>
                            View all ({messages.length})
                        </Button>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showAll && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setShowAll(false)}
                    />
                    <div className="relative w-full max-w-2xl max-h-[80vh] bg-bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-bg-secondary">
                            <h3 className="text-sm font-semibold text-text-primary">
                                All Messages ({messages.length})
                            </h3>
                            <button
                                onClick={() => setShowAll(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-elevated transition-colors"
                            >
                                <svg className="w-5 h-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {paginatedMessages.map((msg) => (
                                <Card key={msg.id}>
                                    <CardContent className="p-4">
                                        <div className="flex items-start gap-3">
                                            <img
                                                src={getAvatarSrc(msg)}
                                                alt={msg.name}
                                                className="w-10 h-10 rounded-full object-cover shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-text-primary text-sm">
                                                        {msg.name}
                                                    </span>
                                                    <span className="text-xs text-text-muted">
                                                        {formatDate(msg.timestamp)}
                                                    </span>
                                                </div>
                                                <p className="text-text-secondary text-sm whitespace-pre-wrap break-words">
                                                    {msg.content}
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-border bg-bg-secondary">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={page === 1}
                                    onClick={() => setPage((p) => p - 1)}
                                >
                                    Prev
                                </Button>
                                <span className="text-xs text-text-muted px-2">
                                    {page} / {totalPages}
                                </span>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={page === totalPages}
                                    onClick={() => setPage((p) => p + 1)}
                                >
                                    Next
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}