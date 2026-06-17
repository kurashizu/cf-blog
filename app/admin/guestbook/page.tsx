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
    approved: boolean;
}

const AVATAR_COUNT = 9;

function getAvatarSrc(message: GuestbookMessage): string {
    if (message.avatar) return message.avatar;
    const index = message.avatarIndex ?? 0;
    return `/images/avatar/avatar_${index % AVATAR_COUNT}.png`;
}

export default function AdminGuestbook() {
    const [messages, setMessages] = useState<GuestbookMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const fetchMessages = async () => {
        try {
            const res = await fetch("/admin/api/guestbook");
            const data = (await res.json()) as {
                messages?: GuestbookMessage[];
            };
            if (data.messages) setMessages(data.messages);
        } catch (e) {
            console.error("Failed to fetch messages:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMessages();
    }, []);

    const handleApprove = async (id: string) => {
        setActionLoading(id);
        try {
            const res = await fetch(`/admin/api/guestbook/${id}`, {
                method: "POST",
            });
            if (res.ok) {
                setMessages((msgs) =>
                    msgs.map((m) =>
                        m.id === id ? { ...m, approved: true } : m,
                    ),
                );
            }
        } catch (e) {
            console.error("Failed to approve:", e);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this message?")) return;
        setActionLoading(id);
        try {
            const res = await fetch(`/admin/api/guestbook/${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setMessages((msgs) => msgs.filter((m) => m.id !== id));
            }
        } catch (e) {
            console.error("Failed to delete:", e);
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) {
        return <p className="text-text-muted p-6">Loading messages...</p>;
    }

    const pending = messages.filter((m) => !m.approved);
    const approved = messages.filter((m) => m.approved);

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-text-primary">
                    Messages
                </h1>
                <p className="text-sm text-text-muted mt-1">
                    Manage guestbook messages
                </p>
            </div>

            {messages.length === 0 ? (
                <p className="text-text-muted p-6">No messages yet.</p>
            ) : (
                <>
                    {pending.length > 0 && (
                        <div className="mb-8">
                            <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-3">
                                Pending Approval ({pending.length})
                            </h2>
                            <div className="space-y-3">
                                {pending.map((msg) => (
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
                                                            {formatDate(
                                                                msg.timestamp,
                                                            )}
                                                        </span>
                                                    </div>
                                                    <p className="text-text-secondary text-sm whitespace-pre-wrap break-words">
                                                        {msg.content}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2 shrink-0">
                                                    <Button
                                                        size="sm"
                                                        onClick={() =>
                                                            handleApprove(
                                                                msg.id,
                                                            )
                                                        }
                                                        disabled={
                                                            actionLoading ===
                                                            msg.id
                                                        }
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="danger"
                                                        onClick={() =>
                                                            handleDelete(msg.id)
                                                        }
                                                        disabled={
                                                            actionLoading ===
                                                            msg.id
                                                        }
                                                    >
                                                        Delete
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-text-muted mb-3">
                        All Messages ({messages.length})
                    </h2>
                    <div className="space-y-3">
                        {approved.map((msg) => (
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
                                        <div className="flex gap-2 shrink-0">
                                            <Button
                                                size="sm"
                                                variant="danger"
                                                onClick={() =>
                                                    handleDelete(msg.id)
                                                }
                                                disabled={
                                                    actionLoading === msg.id
                                                }
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
