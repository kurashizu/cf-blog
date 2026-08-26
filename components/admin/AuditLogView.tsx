"use client";

import { useMemo, useState } from "react";
import type { AuditPage, AuditRow } from "@/lib/audit-log";
import { AUDIT_STATUSES } from "@/lib/audit-log";
import { useAdminQuery } from "./useAdminQuery";
import {
    Column,
    DataTable,
    EmptyState,
    FilterBar,
    FilterSelect,
    Notice,
    Pagination,
    StatGrid,
    StatTile,
    StatusBadge,
    fmtNum,
    fmtTs,
} from "./ui";
import { Button } from "@/components/ui/Button";

const PAGE_SIZE = 100;

/** Gemini embedding free tier, requests/day. Shown as quota context. */
const EMBEDDING_DAILY_QUOTA = 1000;

const DAY_OPTIONS = [
    { value: "1", label: "Last 24h" },
    { value: "7", label: "Last 7d" },
    { value: "30", label: "Last 30d" },
    { value: "90", label: "Last 90d" },
];

export function AuditLogView() {
    const [days, setDays] = useState("7");
    const [category, setCategory] = useState("");
    const [status, setStatus] = useState("");
    const [offset, setOffset] = useState(0);
    const [notice, setNotice] = useState<{
        tone: "success" | "error";
        text: string;
    } | null>(null);
    const [purging, setPurging] = useState(false);

    const url = useMemo(() => {
        const sp = new URLSearchParams({
            days,
            limit: String(PAGE_SIZE),
            offset: String(offset),
        });
        if (category) sp.set("category", category);
        if (status) sp.set("status", status);
        return `/admin/api/audit?${sp.toString()}`;
    }, [days, category, status, offset]);

    const { data, error, loading, initialLoading, refetch } =
        useAdminQuery<AuditPage>(url);

    const onFilter = (setter: (v: string) => void) => (value: string) => {
        setter(value);
        setOffset(0);
    };

    async function handlePurge(olderThanDays: number) {
        if (
            !window.confirm(
                `Delete audit rows older than ${olderThanDays} days? This cannot be undone.`,
            )
        ) {
            return;
        }
        setPurging(true);
        setNotice(null);
        try {
            const res = await fetch("/admin/api/audit/cleanup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ days: olderThanDays }),
            });
            const json = (await res.json().catch(() => null)) as {
                deleted?: number;
                error?: string;
            } | null;
            if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
            setNotice({
                tone: "success",
                text: `Deleted ${json?.deleted ?? 0} rows.`,
            });
            refetch();
        } catch (e) {
            setNotice({
                tone: "error",
                text: `Cleanup failed: ${e instanceof Error ? e.message : String(e)}`,
            });
        } finally {
            setPurging(false);
        }
    }

    const columns: Column<AuditRow>[] = [
        {
            key: "ts",
            header: "Time",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) => fmtTs(r.ts),
        },
        {
            key: "category",
            header: "Category",
            nowrap: true,
            cellClassName: "font-mono text-xs",
            render: (r) => r.category,
        },
        {
            key: "operation",
            header: "Operation",
            nowrap: true,
            cellClassName: "font-mono text-xs",
            render: (r) => r.operation,
        },
        {
            key: "target",
            header: "Target",
            cellClassName: "max-w-xs truncate",
            render: (r) => r.target || "—",
            title: (r) => r.target || undefined,
        },
        {
            key: "status",
            header: "Status",
            nowrap: true,
            render: (r) => (
                <StatusBadge status={r.status} suffix={r.http_status} />
            ),
        },
        {
            key: "ms",
            header: "ms",
            align: "right",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) => fmtNum(r.latency_ms),
        },
        {
            key: "n",
            header: "n",
            align: "right",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) => fmtNum(r.request_count),
        },
        {
            key: "tokens",
            header: "Tokens",
            align: "right",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) => fmtNum(r.input_tokens),
        },
        {
            key: "error",
            header: "Error",
            cellClassName: "max-w-md truncate text-xs text-red-400",
            render: (r) =>
                r.error_code || r.error_message
                    ? `${r.error_code ?? ""}${r.error_code ? ": " : ""}${r.error_message ?? ""}`
                    : "—",
            title: (r) => r.error_message ?? undefined,
        },
    ];

    const summary = data?.summary;

    return (
        <div>
            {notice && (
                <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
                    {notice.text}
                </Notice>
            )}
            {error && (
                <Notice tone="error">
                    Couldn&apos;t load the audit log: {error}{" "}
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
                    label="Calls in window"
                    value={fmtNum(summary?.rows)}
                    hint={`${fmtNum(summary?.upstream_calls)} upstream requests`}
                />
                <StatTile
                    label="Failed"
                    value={fmtNum(summary?.failed)}
                    hint="in the same window"
                    tone={(summary?.failed ?? 0) > 0 ? "danger" : "default"}
                />
                <StatTile
                    label="Embedding chunks"
                    value={fmtNum(summary?.embedding_chunks)}
                    hint={`quota ${EMBEDDING_DAILY_QUOTA.toLocaleString("en-US")}/day`}
                />
                <StatTile
                    label="Matching rows"
                    value={fmtNum(data?.total)}
                    hint={`${days}d window`}
                />
            </StatGrid>

            <FilterBar>
                <FilterSelect
                    id="audit-days"
                    label="Range"
                    value={days}
                    onChange={onFilter(setDays)}
                    options={DAY_OPTIONS}
                />
                <FilterSelect
                    id="audit-category"
                    label="Category"
                    value={category}
                    onChange={onFilter(setCategory)}
                    options={[
                        { value: "", label: "all" },
                        ...(data?.categories ?? []).map((c) => ({
                            value: c,
                            label: c,
                        })),
                    ]}
                />
                <FilterSelect
                    id="audit-status"
                    label="Status"
                    value={status}
                    onChange={onFilter(setStatus)}
                    options={[
                        { value: "", label: "all" },
                        ...AUDIT_STATUSES.map((s) => ({ value: s, label: s })),
                    ]}
                />
                <Button
                    variant="danger"
                    size="sm"
                    disabled={purging || loading}
                    onClick={() => handlePurge(7)}
                >
                    {purging ? "Purging…" : "Purge > 7d"}
                </Button>
            </FilterBar>

            {initialLoading ? (
                <EmptyState>Loading audit rows…</EmptyState>
            ) : data && data.rows.length === 0 ? (
                <EmptyState>No audit rows match the current filters.</EmptyState>
            ) : data ? (
                <DataTable
                    caption="Outbound API calls"
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
        </div>
    );
}
