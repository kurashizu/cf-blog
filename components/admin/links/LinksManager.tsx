"use client";

import { useState } from "react";
import {
    ABOUT_LINK_GROUPS,
    isRenderedGroup,
    type AboutLink,
} from "@/lib/about-links";
import { useAdminQuery } from "@/components/admin/useAdminQuery";
import {
    Column,
    DataTable,
    EmptyState,
    MicroLabel,
    Notice,
    PageHeader,
    StatGrid,
    StatTile,
} from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Tag";
import { EMPTY_LINK, LinkForm, type LinkFormValues } from "./LinkForm";

interface LinksResponse {
    links: AboutLink[];
}

type Editing =
    | { mode: "create" }
    | { mode: "edit"; link: AboutLink }
    | null;

const API = "/admin/api/links";

function groupLabel(groupName: string): string {
    return (
        ABOUT_LINK_GROUPS.find((g) => g.value === groupName)?.label ??
        groupName
    );
}

/** Known groups keep their curated order; anything else sorts after them. */
function groupRank(groupName: string): number {
    const index = ABOUT_LINK_GROUPS.findIndex((g) => g.value === groupName);
    return index === -1 ? ABOUT_LINK_GROUPS.length : index;
}

function toFormValues(link: AboutLink): LinkFormValues {
    return {
        id: link.id,
        name: link.name,
        url: link.url,
        icon: link.icon,
        description: link.description,
        groupName: link.groupName,
        visible: link.visible,
    };
}

export function LinksManager() {
    const { data, error, loading, initialLoading, refetch } =
        useAdminQuery<LinksResponse>(API);

    const [editing, setEditing] = useState<Editing>(null);
    const [notice, setNotice] = useState<{
        tone: "success" | "error";
        text: string;
    } | null>(null);
    // One key at a time: a row id, or "form" while the editor saves. Every
    // mutation button reads it, so two writes can't race the same list.
    const [pending, setPending] = useState<string | null>(null);

    const links = data?.links ?? [];
    const busy = pending !== null;

    async function mutate(
        key: string,
        path: string,
        init: RequestInit,
        successText: string,
    ): Promise<boolean> {
        setPending(key);
        setNotice(null);
        try {
            const res = await fetch(path, {
                ...init,
                headers: init.body
                    ? { "Content-Type": "application/json" }
                    : undefined,
            });
            const body = (await res.json().catch(() => null)) as {
                error?: string;
            } | null;
            if (!res.ok) {
                throw new Error(body?.error ?? `Request failed (${res.status})`);
            }
            setNotice({ tone: "success", text: successText });
            refetch();
            return true;
        } catch (e) {
            setNotice({
                tone: "error",
                text: e instanceof Error ? e.message : String(e),
            });
            return false;
        } finally {
            setPending(null);
        }
    }

    async function handleSubmit(values: LinkFormValues) {
        const payload = {
            name: values.name,
            url: values.url,
            icon: values.icon,
            description: values.description,
            groupName: values.groupName,
            visible: values.visible,
        };
        const creating = editing?.mode === "create";
        const ok = await mutate(
            "form",
            creating ? API : `${API}/${encodeURIComponent(values.id)}`,
            {
                method: creating ? "POST" : "PUT",
                body: JSON.stringify(
                    creating ? { id: values.id, ...payload } : payload,
                ),
            },
            creating
                ? `Created "${values.name}".`
                : `Saved "${values.name}".`,
        );
        if (ok) setEditing(null);
    }

    const toggleVisible = (link: AboutLink) =>
        void mutate(
            link.id,
            `${API}/${encodeURIComponent(link.id)}`,
            {
                method: "PUT",
                body: JSON.stringify({ visible: !link.visible }),
            },
            link.visible
                ? `Hid "${link.name}".`
                : `"${link.name}" is now visible.`,
        );

    const move = (link: AboutLink, direction: "up" | "down") =>
        void mutate(
            link.id,
            `${API}/${encodeURIComponent(link.id)}`,
            { method: "PUT", body: JSON.stringify({ move: direction }) },
            `Moved "${link.name}" ${direction}.`,
        );

    const remove = (link: AboutLink) => {
        if (
            !window.confirm(
                `Delete "${link.name}" (${link.id})? This cannot be undone.`,
            )
        ) {
            return;
        }
        void mutate(
            link.id,
            `${API}/${encodeURIComponent(link.id)}`,
            { method: "DELETE" },
            `Deleted "${link.name}".`,
        );
    };

    const groups = Array.from(new Set(links.map((l) => l.groupName))).sort(
        (a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b),
    );
    const visibleCount = links.filter((l) => l.visible).length;

    function columnsFor(rows: AboutLink[]): Column<AboutLink>[] {
        return [
            {
                key: "order",
                header: "Order",
                nowrap: true,
                render: (link) => {
                    const index = rows.indexOf(link);
                    return (
                        <span className="flex items-center gap-1">
                            <Button
                                variant="secondary"
                                size="sm"
                                aria-label={`Move ${link.name} up`}
                                disabled={busy || index === 0}
                                onClick={() => move(link, "up")}
                            >
                                ↑
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                aria-label={`Move ${link.name} down`}
                                disabled={busy || index === rows.length - 1}
                                onClick={() => move(link, "down")}
                            >
                                ↓
                            </Button>
                            <span className="ml-1 font-mono text-xs text-text-muted">
                                {link.sortOrder}
                            </span>
                        </span>
                    );
                },
            },
            {
                key: "link",
                header: "Link",
                render: (link) => (
                    <span className="flex flex-col">
                        <span className="font-medium text-text-primary">
                            {link.name}
                        </span>
                        <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="max-w-[22rem] truncate font-mono text-xs text-text-muted transition-colors hover:text-accent"
                        >
                            {link.url}
                        </a>
                        {link.description && (
                            <span className="mt-0.5 max-w-[22rem] truncate text-xs text-text-secondary">
                                {link.description}
                            </span>
                        )}
                    </span>
                ),
                title: (link) => link.description || link.url,
            },
            {
                key: "id",
                header: "Id",
                nowrap: true,
                cellClassName: "font-mono text-xs text-text-muted",
                render: (link) => link.id,
            },
            {
                key: "icon",
                header: "Icon",
                nowrap: true,
                cellClassName: "font-mono text-xs text-text-muted",
                render: (link) => link.icon,
            },
            {
                key: "status",
                header: "Status",
                nowrap: true,
                render: (link) => (
                    <Badge variant={link.visible ? "success" : "warning"}>
                        {link.visible ? "Visible" : "Hidden"}
                    </Badge>
                ),
            },
            {
                key: "actions",
                header: "",
                align: "right",
                nowrap: true,
                render: (link) => (
                    <span className="flex justify-end gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => toggleVisible(link)}
                        >
                            {pending === link.id
                                ? "…"
                                : link.visible
                                  ? "Hide"
                                  : "Show"}
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                                setNotice(null);
                                setEditing({ mode: "edit", link });
                            }}
                        >
                            Edit
                        </Button>
                        <Button
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            onClick={() => remove(link)}
                        >
                            Delete
                        </Button>
                    </span>
                ),
            },
        ];
    }

    return (
        <div>
            <PageHeader
                title="Links"
                description={
                    links.length === 0
                        ? "Links rendered on the /about page."
                        : `${links.length} total · ${visibleCount} visible · ${links.length - visibleCount} hidden`
                }
                actions={
                    <>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={loading || busy}
                            onClick={refetch}
                        >
                            {loading ? "Refreshing…" : "Refresh"}
                        </Button>
                        <Button
                            size="sm"
                            disabled={busy || editing?.mode === "create"}
                            onClick={() => {
                                setNotice(null);
                                setEditing({ mode: "create" });
                            }}
                        >
                            New link
                        </Button>
                    </>
                }
            />

            {notice && (
                <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
                    {notice.text}
                </Notice>
            )}
            {error && (
                <Notice tone="error">
                    Couldn&apos;t load links: {error}{" "}
                    <button
                        type="button"
                        onClick={refetch}
                        className="underline underline-offset-2"
                    >
                        Retry
                    </button>
                </Notice>
            )}

            <StatGrid>
                <StatTile label="Links" value={links.length} />
                <StatTile
                    label="Visible"
                    value={visibleCount}
                    hint="rendered on /about"
                />
                <StatTile
                    label="Hidden"
                    value={links.length - visibleCount}
                    tone={links.length - visibleCount > 0 ? "warn" : "default"}
                />
                <StatTile label="Groups" value={groups.length} />
            </StatGrid>

            {editing && (
                <LinkForm
                    key={editing.mode === "edit" ? editing.link.id : "new"}
                    mode={editing.mode}
                    initial={
                        editing.mode === "edit"
                            ? toFormValues(editing.link)
                            : EMPTY_LINK
                    }
                    saving={pending === "form"}
                    onSubmit={(values) => void handleSubmit(values)}
                    onCancel={() => setEditing(null)}
                />
            )}

            {initialLoading ? (
                <EmptyState>Loading links…</EmptyState>
            ) : links.length === 0 && !error ? (
                <EmptyState>
                    No links yet. Use “New link” to add the first one.
                </EmptyState>
            ) : (
                <div className="space-y-8">
                    {groups.map((group) => {
                        const rows = links
                            .filter((l) => l.groupName === group)
                            .sort(
                                (a, b) =>
                                    a.sortOrder - b.sortOrder ||
                                    a.id.localeCompare(b.id),
                            );
                        return (
                            <section key={group}>
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <MicroLabel>
                                        {groupLabel(group)} ({rows.length})
                                    </MicroLabel>
                                    <code className="font-mono text-xs text-text-muted">
                                        {group}
                                    </code>
                                    {!isRenderedGroup(group) && (
                                        <Badge variant="info">
                                            no section on /about
                                        </Badge>
                                    )}
                                </div>
                                <DataTable
                                    caption={`Links in ${groupLabel(group)}`}
                                    columns={columnsFor(rows)}
                                    rows={rows}
                                    rowKey={(link) => link.id}
                                />
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
