"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface AuditRow {
    id: number;
    ts: string;
    category: string;
    operation: string;
    target: string;
    status: string;
    http_status: number | null;
    latency_ms: number | null;
    request_count: number | null;
    input_tokens: number | null;
    error_code: string | null;
    error_message: string | null;
}

interface AuditSummary {
    today_embedding_chunks: number;
    today_embedding_failed: number;
    failed_24h: number;
    rows_24h: number;
}

interface AuditResponse {
    rows: AuditRow[];
    total: number;
    summary: AuditSummary;
}

const CATEGORIES = [
    "",
    "embedding",
    "vectorize",
    "gemini_generate",
    "github",
    "aa",
    "hn",
    "refresh",
];
const STATUSES = ["", "ok", "failed", "skipped"];
const DAYS_OPTIONS = [
    { value: "1", label: "Last 24h" },
    { value: "7", label: "Last 7d" },
    { value: "30", label: "Last 30d" },
    { value: "90", label: "Last 90d" },
];

function statusColor(s: string): string {
    if (s === "ok") return "bg-emerald-500/10 text-emerald-400";
    if (s === "failed") return "bg-red-500/10 text-red-400";
    return "bg-accent/10 text-accent";
}

function fmtTs(ts: string): string {
    // D1 gives "YYYY-MM-DD HH:MM:SS" in UTC. Render short local-ish form.
    return ts.replace("T", " ").slice(0, 19);
}

export default function AdminAuditPage() {
    const [data, setData] = useState<AuditResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const [category, setCategory] = useState("");
    const [status, setStatus] = useState("");
    const [days, setDays] = useState("7");

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const sp = new URLSearchParams();
            if (category) sp.set("category", category);
            if (status) sp.set("status", status);
            sp.set("days", days);
            sp.set("limit", "200");
            const res = await fetch(`/admin/api/audit?${sp.toString()}`);
            const json = (await res.json()) as AuditResponse;
            setData(json);
        } catch (e) {
            console.error("Failed to fetch audit rows:", e);
        } finally {
            setLoading(false);
        }
    }, [category, status, days]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    const handleCleanup = async (olderThanDays: number) => {
        if (
            !confirm(
                `Delete audit rows older than ${olderThanDays} day(s)? This cannot be undone.`,
            )
        ) {
            return;
        }
        setActionLoading(true);
        try {
            const res = await fetch("/admin/api/audit/cleanup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ days: olderThanDays }),
            });
            const json = (await res.json()) as { deleted?: number };
            if (res.ok) {
                alert(`Deleted ${json.deleted ?? 0} rows.`);
                await fetchRows();
            } else {
                alert("Cleanup failed.");
            }
        } catch (e) {
            console.error("Cleanup failed:", e);
            alert("Cleanup failed.");
        } finally {
            setActionLoading(false);
        }
    };

    const summary = data?.summary;

    return (
        <div>
            <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">
                        Audit Log
                    </h1>
                    <p className="text-sm text-text-muted mt-1">
                        External API calls recorded by cache-worker and
                        cf-blog.
                    </p>
                </div>
                <div className="flex gap-2 shrink-0">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={fetchRows}
                        disabled={loading}
                    >
                        {loading ? "Refreshing…" : "Refresh"}
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleCleanup(7)}
                        disabled={actionLoading}
                    >
                        Purge &gt; 7d
                    </Button>
                </div>
            </div>

            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-1">
                                Today · Embedding chunks
                            </div>
                            <div className="text-2xl font-bold text-text-primary">
                                {summary.today_embedding_chunks}
                            </div>
                            <div className="text-xs text-text-muted mt-1">
                                {summary.today_embedding_failed} failed
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-1">
                                Failed · 24h
                            </div>
                            <div className="text-2xl font-bold text-text-primary">
                                {summary.failed_24h}
                            </div>
                            <div className="text-xs text-text-muted mt-1">
                                of {summary.rows_24h} rows
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-1">
                                Matching rows
                            </div>
                            <div className="text-2xl font-bold text-text-primary">
                                {data?.total ?? 0}
                            </div>
                            <div className="text-xs text-text-muted mt-1">
                                in {days}d window
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-1">
                                Quota
                            </div>
                            <div className="text-2xl font-bold text-text-primary">
                                {summary.today_embedding_chunks}/1000
                            </div>
                            <div className="text-xs text-text-muted mt-1">
                                Gemini Embedding 2 free tier
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="mb-4 flex flex-wrap gap-3 items-end">
                <div>
                    <label
                        htmlFor="filter-category"
                        className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-1.5"
                    >
                        Category
                    </label>
                    <select
                        id="filter-category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="px-3 py-1.5 bg-bg-secondary border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-accent"
                    >
                        {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                                {c || "all"}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label
                        htmlFor="filter-status"
                        className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-1.5"
                    >
                        Status
                    </label>
                    <select
                        id="filter-status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="px-3 py-1.5 bg-bg-secondary border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-accent"
                    >
                        {STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {s || "all"}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label
                        htmlFor="filter-days"
                        className="block text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted mb-1.5"
                    >
                        Range
                    </label>
                    <select
                        id="filter-days"
                        value={days}
                        onChange={(e) => setDays(e.target.value)}
                        className="px-3 py-1.5 bg-bg-secondary border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-accent"
                    >
                        {DAYS_OPTIONS.map((d) => (
                            <option key={d.value} value={d.value}>
                                {d.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {loading && !data ? (
                <p className="text-text-muted p-6">Loading audit rows…</p>
            ) : data && data.rows.length === 0 ? (
                <p className="text-text-muted p-6">
                    No audit rows match the current filters.
                </p>
            ) : data ? (
                <div className="overflow-hidden rounded-lg border border-border">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse bg-bg-card text-sm">
                            <thead>
                                <tr>
                                    <th className="text-left px-3 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted bg-bg-secondary border-b border-border whitespace-nowrap">
                                        Time
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted bg-bg-secondary border-b border-border">
                                        Cat
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted bg-bg-secondary border-b border-border">
                                        Op
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted bg-bg-secondary border-b border-border">
                                        Target
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted bg-bg-secondary border-b border-border">
                                        Status
                                    </th>
                                    <th className="text-right px-3 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted bg-bg-secondary border-b border-border">
                                        ms
                                    </th>
                                    <th className="text-right px-3 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted bg-bg-secondary border-b border-border">
                                        n
                                    </th>
                                    <th className="text-left px-3 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted bg-bg-secondary border-b border-border">
                                        Error
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="[&>tr:last-child>td]:border-b-0">
                                {data.rows.map((r) => (
                                    <tr
                                        key={r.id}
                                        className="hover:bg-bg-secondary/40 transition-colors"
                                    >
                                        <td className="px-3 py-2 border-b border-border font-mono text-xs text-text-muted whitespace-nowrap">
                                            {fmtTs(r.ts)}
                                        </td>
                                        <td className="px-3 py-2 border-b border-border font-mono text-xs text-text-secondary whitespace-nowrap">
                                            {r.category}
                                        </td>
                                        <td className="px-3 py-2 border-b border-border font-mono text-xs text-text-secondary whitespace-nowrap">
                                            {r.operation}
                                        </td>
                                        <td className="px-3 py-2 border-b border-border text-text-secondary max-w-xs truncate" title={r.target}>
                                            {r.target || "—"}
                                        </td>
                                        <td className="px-3 py-2 border-b border-border">
                                            <span
                                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.status)}`}
                                            >
                                                {r.status}
                                                {r.http_status != null &&
                                                    ` · ${r.http_status}`}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 border-b border-border text-right text-text-muted font-mono text-xs">
                                            {r.latency_ms ?? "—"}
                                        </td>
                                        <td className="px-3 py-2 border-b border-border text-right text-text-muted font-mono text-xs">
                                            {r.request_count ?? "—"}
                                        </td>
                                        <td className="px-3 py-2 border-b border-border text-xs text-red-400 max-w-md truncate" title={r.error_message ?? undefined}>
                                            {r.error_code
                                                ? `${r.error_code}: ${r.error_message ?? ""}`
                                                : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-4 py-2 bg-bg-secondary border-t border-border text-xs text-text-muted">
                        Showing {data.rows.length} of {data.total} matching
                        rows (newest first).
                    </div>
                </div>
            ) : null}
        </div>
    );
}
