"use client";

import { useMemo, useState } from "react";
import type { AccessLogPage, AccessLogRow, TopCaller } from "@/lib/access-log";
import { VALID_OUTCOMES, VALID_WORKERS } from "@/lib/access-log";
import { useAdminQuery } from "./useAdminQuery";
import {
    Column,
    DataTable,
    EmptyState,
    FilterBar,
    FilterSelect,
    MicroLabel,
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

const DAY_OPTIONS = [
    { value: "1", label: "Last 24h" },
    { value: "7", label: "Last 7d" },
    { value: "30", label: "Last 30d" },
    { value: "90", label: "Last 90d" },
];

/** Parse the JSON metadata column defensively — it's free-form. */
function metaSummary(raw: string | null): string {
    if (!raw || raw === "{}") return "";
    try {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        return Object.entries(obj)
            .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("/") : String(v)}`)
            .join(" ");
    } catch {
        return "";
    }
}

function callerLabel(row: AccessLogRow): string {
    const place = [row.city, row.country].filter(Boolean).join(", ");
    return place || row.as_org || "—";
}

export function AccessLogView() {
    const [days, setDays] = useState("7");
    const [worker, setWorker] = useState("");
    const [route, setRoute] = useState("");
    const [outcome, setOutcome] = useState("");
    const [upstreamOnly, setUpstreamOnly] = useState("");
    const [ip, setIp] = useState("");
    const [offset, setOffset] = useState(0);

    const url = useMemo(() => {
        const sp = new URLSearchParams({
            days,
            limit: String(PAGE_SIZE),
            offset: String(offset),
        });
        if (worker) sp.set("worker", worker);
        if (route) sp.set("route", route);
        if (outcome) sp.set("outcome", outcome);
        if (upstreamOnly) sp.set("upstream", "1");
        if (ip) sp.set("ip", ip);
        return `/admin/api/access-log?${sp.toString()}`;
    }, [days, worker, route, outcome, upstreamOnly, ip, offset]);

    const { data, error, loading, initialLoading, refetch } =
        useAdminQuery<AccessLogPage>(url);

    // Any filter change invalidates the current offset.
    const onFilter = (setter: (v: string) => void) => (value: string) => {
        setter(value);
        setOffset(0);
    };

    const columns: Column<AccessLogRow>[] = [
        {
            key: "ts",
            header: "Time",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) => fmtTs(r.ts),
        },
        {
            key: "caller",
            header: "Caller",
            nowrap: true,
            render: (r) => (
                <span className="flex flex-col">
                    <button
                        type="button"
                        className="text-left font-mono text-xs text-text-primary transition-colors hover:text-accent"
                        title="Filter to this IP"
                        onClick={() => {
                            setIp(r.ip ?? "");
                            setOffset(0);
                        }}
                    >
                        {r.ip ?? "—"}
                    </button>
                    <span className="text-[0.6875rem] text-text-muted">
                        {callerLabel(r)}
                    </span>
                </span>
            ),
            title: (r) => r.as_org ?? undefined,
        },
        {
            key: "route",
            header: "Route",
            nowrap: true,
            render: (r) => (
                <span className="flex flex-col">
                    <span className="font-mono text-xs text-text-secondary">
                        {r.method} {r.route}
                    </span>
                    <span className="text-[0.6875rem] text-text-muted">
                        {r.worker}
                    </span>
                </span>
            ),
        },
        {
            key: "outcome",
            header: "Outcome",
            nowrap: true,
            render: (r) => (
                <StatusBadge status={r.outcome} suffix={r.http_status} />
            ),
        },
        {
            key: "model",
            header: "Model",
            nowrap: true,
            cellClassName: "font-mono text-xs",
            render: (r) => r.model ?? "—",
        },
        {
            key: "tokens",
            header: "Tokens",
            align: "right",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) =>
                r.input_tokens == null && r.output_tokens == null
                    ? "—"
                    : `${fmtNum(r.input_tokens ?? 0)}/${fmtNum(r.output_tokens ?? 0)}`,
            title: () => "input / output",
        },
        {
            key: "n",
            header: "Calls",
            align: "right",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) => fmtNum(r.request_count),
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
            key: "detail",
            header: "Detail",
            cellClassName: "max-w-xs truncate text-xs",
            render: (r) =>
                r.error_message ? (
                    <span className="text-red-400">
                        {r.error_code ? `${r.error_code}: ` : ""}
                        {r.error_message}
                    </span>
                ) : (
                    <span className="text-text-muted">
                        {metaSummary(r.metadata) || "—"}
                    </span>
                ),
            title: (r) =>
                r.error_message ?? metaSummary(r.metadata) ?? undefined,
        },
        {
            key: "ua",
            header: "User agent",
            cellClassName: "max-w-[14rem] truncate text-xs text-text-muted",
            render: (r) => r.user_agent ?? "—",
            title: (r) => r.user_agent ?? undefined,
        },
    ];

    const summary = data?.summary;
    const hasFilters = Boolean(
        worker || route || outcome || upstreamOnly || ip,
    );

    return (
        <div>
            {error && (
                <Notice tone="error">
                    Couldn&apos;t load the access log: {error}{" "}
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
                    label="Requests"
                    value={fmtNum(summary?.requests)}
                    hint={`${fmtNum(summary?.unique_ips)} unique IPs`}
                />
                <StatTile
                    label="Upstream calls"
                    value={fmtNum(summary?.upstream_calls)}
                    hint="model / external API"
                />
                <StatTile
                    label="Tokens"
                    value={fmtNum(summary?.total_tokens)}
                    hint="in + out, attributed"
                />
                <StatTile
                    label="Rejected"
                    value={fmtNum(
                        (summary?.rate_limited ?? 0) + (summary?.errors ?? 0),
                    )}
                    hint={`${fmtNum(summary?.rate_limited)} limited · ${fmtNum(summary?.errors)} errors`}
                    tone={
                        (summary?.errors ?? 0) > 0
                            ? "danger"
                            : (summary?.rate_limited ?? 0) > 0
                              ? "warn"
                              : "default"
                    }
                />
            </StatGrid>

            <FilterBar>
                <FilterSelect
                    id="access-days"
                    label="Range"
                    value={days}
                    onChange={onFilter(setDays)}
                    options={DAY_OPTIONS}
                />
                <FilterSelect
                    id="access-worker"
                    label="Worker"
                    value={worker}
                    onChange={onFilter(setWorker)}
                    options={[
                        { value: "", label: "all" },
                        ...VALID_WORKERS.map((w) => ({ value: w, label: w })),
                    ]}
                />
                <FilterSelect
                    id="access-route"
                    label="Route"
                    value={route}
                    onChange={onFilter(setRoute)}
                    options={[
                        { value: "", label: "all" },
                        ...(data?.routes ?? []).map((r) => ({
                            value: r,
                            label: r,
                        })),
                    ]}
                />
                <FilterSelect
                    id="access-outcome"
                    label="Outcome"
                    value={outcome}
                    onChange={onFilter(setOutcome)}
                    options={[
                        { value: "", label: "all" },
                        ...VALID_OUTCOMES.map((o) => ({ value: o, label: o })),
                    ]}
                />
                <FilterSelect
                    id="access-upstream"
                    label="Spend"
                    value={upstreamOnly}
                    onChange={onFilter(setUpstreamOnly)}
                    options={[
                        { value: "", label: "all requests" },
                        { value: "1", label: "upstream only" },
                    ]}
                />
                {hasFilters && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setWorker("");
                            setRoute("");
                            setOutcome("");
                            setUpstreamOnly("");
                            setIp("");
                            setOffset(0);
                        }}
                    >
                        Clear filters
                    </Button>
                )}
            </FilterBar>

            {ip && (
                <div className="mb-4 flex items-center gap-2 text-sm">
                    <MicroLabel>Caller</MicroLabel>
                    <code className="rounded bg-bg-secondary px-2 py-0.5 font-mono text-xs text-accent">
                        {ip}
                    </code>
                    <button
                        type="button"
                        className="text-xs text-text-muted underline underline-offset-2 hover:text-accent"
                        onClick={() => {
                            setIp("");
                            setOffset(0);
                        }}
                    >
                        clear
                    </button>
                </div>
            )}

            {!ip && (data?.topCallers?.length ?? 0) > 0 && (
                <TopCallers
                    callers={data!.topCallers}
                    onSelect={(nextIp) => {
                        setIp(nextIp);
                        setOffset(0);
                    }}
                />
            )}

            {initialLoading ? (
                <EmptyState>Loading access log…</EmptyState>
            ) : data && data.rows.length === 0 ? (
                <EmptyState>
                    No API requests match the current filters.
                </EmptyState>
            ) : data ? (
                <DataTable
                    caption="Inbound API requests"
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

function TopCallers({
    callers,
    onSelect,
}: {
    callers: TopCaller[];
    onSelect: (ip: string) => void;
}) {
    return (
        <div className="mb-4 rounded-lg border border-border bg-bg-card p-4">
            <MicroLabel className="mb-2 block">
                Top callers in window
            </MicroLabel>
            <div className="flex flex-wrap gap-2">
                {callers.map((c) => (
                    <button
                        key={c.ip}
                        type="button"
                        onClick={() => onSelect(c.ip)}
                        title={c.as_org ?? undefined}
                        className="flex items-center gap-2 rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs transition-colors hover:border-accent hover:text-accent"
                    >
                        <span className="font-mono">{c.ip}</span>
                        {c.country && (
                            <span className="text-text-muted">{c.country}</span>
                        )}
                        <span className="tabular-nums text-text-muted">
                            {fmtNum(c.requests)} req
                        </span>
                        {c.upstream_calls > 0 && (
                            <span className="tabular-nums text-accent">
                                {fmtNum(c.upstream_calls)} up
                            </span>
                        )}
                        {c.rate_limited > 0 && (
                            <span className="tabular-nums text-amber-400">
                                {fmtNum(c.rate_limited)} limited
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
