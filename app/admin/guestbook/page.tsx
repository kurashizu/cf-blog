"use client";

import { useCallback, useEffect, useState } from "react";
import type { GuestbookMessage } from "@/lib/guestbook";
import { guestbookAvatarSrc } from "@/lib/guestbook-avatar";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Tag";
import { EmptyState, MicroLabel, Notice, PageHeader } from "@/components/admin/ui";

export default function AdminGuestbookPage() {
    const [messages, setMessages] = useState<GuestbookMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<{
        tone: "success" | "error";
        text: string;
    } | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const fetchMessages = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/admin/api/guestbook");
            const body = (await res.json().catch(() => null)) as {
                messages?: GuestbookMessage[];
                error?: string;
            } | null;
            // The old page skipped this check, so a 500 rendered as
            // "No messages yet" — a server failure shown as empty success.
            if (!res.ok || !body?.messages) {
                throw new Error(body?.error ?? `HTTP ${res.status}`);
            }
            setMessages(body.messages);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchMessages();
    }, [fetchMessages]);

    async function mutate(
        id: string,
        method: "POST" | "DELETE",
        successText: string,
    ) {
        setBusyId(id);
        setNotice(null);
        try {
            const res = await fetch(`/admin/api/guestbook/${id}`, { method });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as {
                    error?: string;
                } | null;
                throw new Error(body?.error ?? `HTTP ${res.status}`);
            }
            setNotice({ tone: "success", text: successText });
            await fetchMessages();
        } catch (e) {
            // Failures used to be swallowed entirely — the row just stayed.
            setNotice({
                tone: "error",
                text: `Action failed: ${e instanceof Error ? e.message : String(e)}`,
            });
        } finally {
            setBusyId(null);
        }
    }

    const handleApprove = (id: string) =>
        mutate(id, "POST", "Message approved.");

    const handleDelete = (id: string) => {
        if (!window.confirm("Delete this message? This cannot be undone.")) {
            return;
        }
        return mutate(id, "DELETE", "Message deleted.");
    };

    const pending = messages.filter((m) => !m.approved);
    const approved = messages.filter((m) => m.approved);

    return (
        <div>
            <PageHeader
                title="Messages"
                description={`${messages.length} total · ${pending.length} awaiting approval`}
                actions={
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void fetchMessages()}
                        disabled={loading}
                    >
                        {loading ? "Refreshing…" : "Refresh"}
                    </Button>
                }
            />

            {notice && (
                <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
                    {notice.text}
                </Notice>
            )}
            {error && (
                <Notice tone="error">
                    Couldn&apos;t load messages: {error}{" "}
                    <button
                        type="button"
                        onClick={() => void fetchMessages()}
                        className="underline underline-offset-2"
                    >
                        Retry
                    </button>
                </Notice>
            )}

            {loading && messages.length === 0 ? (
                <EmptyState>Loading messages…</EmptyState>
            ) : messages.length === 0 && !error ? (
                <EmptyState>No messages yet.</EmptyState>
            ) : (
                <div className="space-y-8">
                    {pending.length > 0 && (
                        <section>
                            <MicroLabel className="mb-2 block">
                                Pending approval ({pending.length})
                            </MicroLabel>
                            <div className="space-y-3">
                                {pending.map((msg) => (
                                    <MessageRow
                                        key={msg.id}
                                        message={msg}
                                        busy={busyId === msg.id}
                                        onApprove={() => handleApprove(msg.id)}
                                        onDelete={() => handleDelete(msg.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    <section>
                        <MicroLabel className="mb-2 block">
                            Approved ({approved.length})
                        </MicroLabel>
                        {approved.length === 0 ? (
                            <EmptyState>No approved messages yet.</EmptyState>
                        ) : (
                            <div className="space-y-3">
                                {approved.map((msg) => (
                                    <MessageRow
                                        key={msg.id}
                                        message={msg}
                                        busy={busyId === msg.id}
                                        onDelete={() => handleDelete(msg.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}

function MessageRow({
    message,
    busy,
    onApprove,
    onDelete,
}: {
    message: GuestbookMessage;
    busy: boolean;
    onApprove?: () => void;
    onDelete: () => void;
}) {
    return (
        <div className="rounded-xl border border-border bg-bg-card p-4">
            <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={guestbookAvatarSrc(message)}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-text-primary">
                            {message.name}
                        </span>
                        {!message.approved && (
                            <Badge variant="warning">pending</Badge>
                        )}
                        <span
                            className="text-xs text-text-muted"
                            title={message.timestamp}
                        >
                            {formatDate(message.timestamp)}
                        </span>
                        {message.email && (
                            <span className="truncate font-mono text-xs text-text-muted">
                                {message.email}
                            </span>
                        )}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-text-secondary">
                        {message.content}
                    </p>
                </div>
                <div className="flex shrink-0 gap-2">
                    {onApprove && (
                        <Button size="sm" disabled={busy} onClick={onApprove}>
                            {busy ? "…" : "Approve"}
                        </Button>
                    )}
                    <Button
                        variant="danger"
                        size="sm"
                        disabled={busy}
                        onClick={onDelete}
                    >
                        {busy ? "…" : "Delete"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
