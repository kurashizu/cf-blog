"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
    const [closing, setClosing] = useState(false);
    const [refreshKey, setRefreshKey] = useState(initialRefreshKey ?? 0);
    const [page, setPage] = useState(1);

    const handleClose = () => {
        setClosing(true);
        setTimeout(() => {
            setShowAll(false);
            setClosing(false);
        }, 200);
    };

    useEffect(() => {
        if (showAll) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => { document.body.style.overflow = ""; };
    }, [showAll]);

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
            {/* Flow layout - tags style */}
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-wrap gap-2 justify-center">
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className="flex items-center gap-2 px-3 py-1 bg-bg-card/80 backdrop-blur-sm border border-border rounded-full overflow-hidden hover:border-accent/70 hover:bg-bg-card hover:shadow-[0_0_20px_var(--accent-glow)] transition-all cursor-pointer"
                            onClick={() => { setShowAll(true); setPage(1); }}
                        >
                            <img
                                src={getAvatarSrc(msg)}
                                alt={msg.name}
                                className="w-9 h-9 rounded-full object-cover shrink-0"
                            />
                            <span className="text-xs text-text-primary font-medium shrink-0">
                                {msg.name}
                            </span>
                            <span className="text-xs text-text-secondary max-w-[100px] truncate">
                                {msg.content}
                            </span>
                        </div>
                    ))}
                </div>
                {messages.length >= 3 && (
                    <div className="text-center mt-3">
                        <Button variant="secondary" size="sm" onClick={() => { setShowAll(true); setPage(1); }}>
                            View all ({messages.length})
                        </Button>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showAll && typeof document !== "undefined" && createPortal(
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-md"
                        onClick={handleClose}
                    />
                    <div className={`relative w-full max-w-2xl max-h-[80vh] bg-bg-card/80 backdrop-blur-xl border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden ${closing ? 'animate-slideDown' : 'animate-slideUp'}`}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-bg-secondary">
                            <h3 className="text-sm font-semibold text-text-primary">
                                All Messages ({messages.length})
                            </h3>
                            <button
                                onClick={handleClose}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-elevated transition-colors"
                            >
                                <svg className="w-5 h-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                            {paginatedMessages.map((msg) => (
                                <div key={msg.id} className="w-full p-4 bg-bg-card/60 backdrop-blur-sm border border-border rounded-xl">
                                    <div className="flex items-start gap-3 overflow-hidden">
                                        <img
                                            src={getAvatarSrc(msg)}
                                            alt={msg.name}
                                            className="w-14 h-14 rounded-full object-cover shrink-0"
                                        />
                                        <div className="flex-1 min-w-0 flex flex-col items-end">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium text-text-primary text-sm">
                                                    {msg.name}
                                                </span>
                                                <span className="text-xs text-text-muted">
                                                    {formatDate(msg.timestamp)}
                                                </span>
                                            </div>
                                            <p className="text-text-secondary text-sm whitespace-pre-wrap break-words text-right">
                                                {msg.content}
                                            </p>
                                        </div>
                                    </div>
                                </div>
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
                </div>,
                document.body
            )}
        </>
    );
}