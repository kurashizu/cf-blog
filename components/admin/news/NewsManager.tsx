"use client";

import { useEffect, useMemo, useState } from "react";
import type { NewsListRow, NewsPage } from "@/lib/news";
import {
    MAX_NEWS_RETRIES,
    MAX_REWRITE_RETRIES,
    NEWS_FILTER_OPTIONS,
    unixToUtc,
} from "@/lib/news";
import { useAdminQuery } from "../useAdminQuery";
import {
    Column,
    DataTable,
    EmptyState,
    Field,
    FilterBar,
    FilterSelect,
    Notice,
    Pagination,
    StatGrid,
    StatTile,
    StatusBadge,
    TextInput,
    fmtNum,
    fmtTs,
} from "../ui";
import { Button } from "@/components/ui/Button";
import { SummaryEditor } from "./SummaryEditor";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

type RowAction = "index" | "rewrite" | "delete";

/** Which row+action pair is mid-flight, so only that button shows pending. */
interface Busy {
    id: number;
    action: RowAction;
}

export function NewsManager() {
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [q, setQ] = useState("");
    const [offset, setOffset] = useState(0);
    const [editing, setEditing] = useState<number | null>(null);
    const [busy, setBusy] = useState<Busy | null>(null);
    const [notice, setNotice] = useState<{
        tone: "success" | "error";
        text: string;
    } | null>(null);

    // Typing shouldn't fire a query per keystroke against D1.
    useEffect(() => {
        const t = setTimeout(() => {
            setQ(search.trim());
            setOffset(0);
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [search]);

    const url = useMemo(() => {
        const sp = new URLSearchParams({
            filter,
            limit: String(PAGE_SIZE),
            offset: String(offset),
        });
        if (q) sp.set("q", q);
        return `/admin/api/news?${sp.toString()}`;
    }, [filter, q, offset]);

    const { data, error, loading, initialLoading, refetch } =
        useAdminQuery<NewsPage>(url);

    // Deleting the last row of the last page would otherwise strand the user
    // on an empty page with no way back.
    useEffect(() => {
        if (!data || offset === 0 || offset < data.total) return;
        const lastPage = Math.max(0, Math.ceil(data.total / PAGE_SIZE) - 1);
        setOffset(lastPage * PAGE_SIZE);
    }, [data, offset]);

    async function mutate(
        row: NewsListRow,
        action: RowAction,
        successText: string,
    ) {
        setBusy({ id: row.id, action });
        setNotice(null);
        try {
            const res = await fetch(`/admin/api/news/${row.id}`, {
                method: action === "delete" ? "DELETE" : "POST",
                ...(action === "delete"
                    ? {}
                    : {
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                              action:
                                  action === "rewrite"
                                      ? "requeue-rewrite"
                                      : "requeue-index",
                          }),
                      }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as {
                    error?: string;
                } | null;
                throw new Error(body?.error ?? `HTTP ${res.status}`);
            }
            setNotice({ tone: "success", text: successText });
            refetch();
        } catch (e) {
            setNotice({
                tone: "error",
                text: `Action failed: ${e instanceof Error ? e.message : String(e)}`,
            });
        } finally {
            setBusy(null);
        }
    }

    const onReindex = (row: NewsListRow) =>
        mutate(
            row,
            "index",
            `#${row.id} queued for re-indexing — the next 3-min tick will pick it up.`,
        );

    const onRewrite = (row: NewsListRow) => {
        // Only offered for items that HAVE a summary, so this always confirms.
        if (
            !window.confirm(
                `Discard the current summary of "${row.title}" and regenerate it?\n\nThe existing ${row.summary_length} characters are deleted immediately; the rewrite only happens once the 3-min heartbeat reaches this item (oldest empty summary first).`,
            )
        ) {
            return;
        }
        return mutate(
            row,
            "rewrite",
            `#${row.id} queued for AI rewrite — its summary is now empty until the heartbeat reaches it.`,
        );
    };

    const onDelete = (row: NewsListRow) => {
        if (
            !window.confirm(
                `Delete "${row.title}" from the news archive?\n\nThis cannot be undone. Vectors already written to the search index are not removed.`,
            )
        ) {
            return;
        }
        return mutate(row, "delete", `#${row.id} deleted.`);
    };

    const columns: Column<NewsListRow>[] = [
        {
            key: "item",
            header: "Item",
            cellClassName: "max-w-md",
            render: (r) => (
                <span className="flex flex-col">
                    <a
                        href={`/news/${r.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-medium text-text-primary transition-colors hover:text-accent"
                    >
                        {r.title}
                    </a>
                    <span className="truncate text-[0.6875rem] text-text-muted">
                        {r.domain ?? "news.ycombinator.com"} · {r.by} · #{r.id}
                    </span>
                </span>
            ),
            title: (r) => r.title,
        },
        {
            key: "score",
            header: "Score",
            align: "right",
            nowrap: true,
            cellClassName: "font-mono text-xs",
            render: (r) => fmtNum(r.score),
            title: (r) => `${r.descendants} comments`,
        },
        {
            key: "time",
            header: "Posted",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) => unixToUtc(r.time),
        },
        {
            key: "fetched",
            header: "Fetched",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) => fmtTs(r.fetched_at),
        },
        {
            key: "summary",
            header: "Summary",
            nowrap: true,
            // A missing summary is not one state but three: still queued,
            // failing but retrying, or parked. Parked is the one that used
            // to be invisible while it blocked the whole queue.
            render: (r) =>
                r.summary_length > 0 ? (
                    <StatusBadge
                        status="ok"
                        suffix={`${fmtNum(r.summary_length)} ch`}
                    />
                ) : r.rewrite_retry_count >= MAX_REWRITE_RETRIES ? (
                    <StatusBadge status="failed" suffix="parked" />
                ) : r.rewrite_retry_count > 0 ? (
                    <StatusBadge
                        status="rate_limited"
                        suffix={`retry ${r.rewrite_retry_count}/${MAX_REWRITE_RETRIES}`}
                    />
                ) : (
                    <StatusBadge status="awaiting rewrite" />
                ),
            title: (r) =>
                r.rewrite_error
                    ? `Last rewrite failure${r.rewrite_failed_at ? ` (${fmtTs(r.rewrite_failed_at)})` : ""}: ${r.rewrite_error}`
                    : r.summary_preview || undefined,
        },
        {
            key: "index",
            header: "Index",
            nowrap: true,
            render: (r) =>
                r.search_updated_at ? (
                    <StatusBadge status="ok" />
                ) : r.retry_count >= MAX_NEWS_RETRIES ? (
                    <StatusBadge status="failed" suffix="stalled" />
                ) : r.summary_length === 0 ? (
                    <StatusBadge status="blocked" />
                ) : (
                    <StatusBadge status="queued" />
                ),
            title: (r) =>
                r.search_updated_at
                    ? `Indexed ${fmtTs(r.search_updated_at)}`
                    : r.summary_length === 0
                      ? "Needs a summary before it can be indexed"
                      : "Waiting for the search-index tick",
        },
        {
            key: "retries",
            header: "Retries",
            align: "right",
            nowrap: true,
            cellClassName: "font-mono text-xs",
            render: (r) => (
                <span
                    className={
                        r.retry_count >= MAX_NEWS_RETRIES
                            ? "text-red-400"
                            : r.retry_count > 0
                              ? "text-amber-400"
                              : "text-text-muted"
                    }
                >
                    {r.retry_count}/{MAX_NEWS_RETRIES}
                </span>
            ),
            title: (r) =>
                r.last_failed_at
                    ? `Last failed ${fmtTs(r.last_failed_at)}`
                    : undefined,
        },
        {
            key: "actions",
            header: "",
            align: "right",
            nowrap: true,
            render: (r) => {
                const rowBusy = busy?.id === r.id;
                const label = (action: RowAction, text: string) =>
                    rowBusy && busy?.action === action ? "…" : text;
                return (
                    <span className="flex justify-end gap-1.5">
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={rowBusy}
                            onClick={() => setEditing(r.id)}
                        >
                            Edit
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={rowBusy || r.summary_length === 0}
                            title={
                                r.summary_length === 0
                                    ? "Nothing to index until this item has a summary"
                                    : "Clear the indexing state so the next tick re-embeds it"
                            }
                            onClick={() => void onReindex(r)}
                        >
                            {label("index", "Re-index")}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={rowBusy || r.summary_length === 0}
                            title={
                                r.summary_length === 0
                                    ? "Already queued — this item has no summary yet"
                                    : "Clear the summary so the rewrite heartbeat regenerates it"
                            }
                            onClick={() => void onRewrite(r)}
                        >
                            {label("rewrite", "Rewrite")}
                        </Button>
                        <Button
                            variant="danger"
                            size="sm"
                            disabled={rowBusy}
                            onClick={() => void onDelete(r)}
                        >
                            {label("delete", "Delete")}
                        </Button>
                    </span>
                );
            },
        },
    ];

    const stats = data?.stats;
    const hasFilters = filter !== "all" || Boolean(search);

    return (
        <div>
            {notice && (
                <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
                    {notice.text}
                </Notice>
            )}
            {error && (
                <Notice tone="error">
                    Couldn&apos;t load news items: {error}{" "}
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
                <StatTile
                    label="Archived items"
                    value={fmtNum(stats?.total)}
                    hint={`${fmtNum(stats?.with_summary)} with a summary`}
                />
                <StatTile
                    label="Awaiting rewrite"
                    value={fmtNum(stats?.awaiting_rewrite)}
                    hint="one per 3-min heartbeat"
                    tone={(stats?.awaiting_rewrite ?? 0) > 0 ? "warn" : "default"}
                />
                <StatTile
                    label="Awaiting index"
                    value={fmtNum(stats?.awaiting_index)}
                    hint={`${fmtNum(stats?.indexed)} indexed`}
                />
                <StatTile
                    label="Rewrite parked"
                    value={fmtNum(stats?.rewrite_stalled)}
                    hint={`${fmtNum(stats?.stalled)} index-stalled · requeue to retry`}
                    tone={
                        (stats?.rewrite_stalled ?? 0) > 0 ? "danger" : "default"
                    }
                />
            </StatGrid>

            <FilterBar>
                <FilterSelect
                    id="news-filter"
                    label="Show"
                    value={filter}
                    onChange={(v) => {
                        setFilter(v);
                        setOffset(0);
                    }}
                    options={NEWS_FILTER_OPTIONS}
                />
                <Field label="Search" htmlFor="news-search" className="w-60">
                    <TextInput
                        id="news-search"
                        type="search"
                        value={search}
                        placeholder="title or domain"
                        className="py-1.5"
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </Field>
                {hasFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setFilter("all");
                            setSearch("");
                            setOffset(0);
                        }}
                    >
                        Clear filters
                    </Button>
                )}
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={loading}
                    onClick={refetch}
                >
                    {loading ? "Refreshing…" : "Refresh"}
                </Button>
            </FilterBar>

            {initialLoading ? (
                <EmptyState>Loading news items…</EmptyState>
            ) : data && data.rows.length === 0 ? (
                <EmptyState>
                    No news items match the current filters.
                </EmptyState>
            ) : data ? (
                <DataTable
                    caption="Hacker News archive"
                    columns={columns}
                    rows={data.rows}
                    rowKey={(r) => r.id}
                    footer={
                        <Pagination
                            offset={offset}
                            limit={PAGE_SIZE}
                            total={data.total}
                            onOffsetChange={setOffset}
                            busy={loading}
                        />
                    }
                />
            ) : null}

            {editing != null && (
                <SummaryEditor
                    id={editing}
                    onClose={() => setEditing(null)}
                    onSaved={(text) => {
                        setNotice({ tone: "success", text });
                        refetch();
                    }}
                />
            )}
        </div>
    );
}
