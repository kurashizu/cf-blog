"use client";

import { useMemo, useState, type ReactNode } from "react";
import type {
    CacheHealthRow,
    CronActivityRow,
    CronJob,
    OpsAction,
    OpsSnapshot,
    QueueHead,
} from "@/lib/ops";
import { OPS_ACTIONS, fmtAge, fmtBytes } from "@/lib/ops";
import { useAdminQuery } from "../useAdminQuery";
import {
    Column,
    DataTable,
    EmptyState,
    MicroLabel,
    Notice,
    StatGrid,
    StatTile,
    StatusBadge,
    fmtNum,
    fmtTs,
} from "../ui";
import { Button } from "@/components/ui/Button";

export function OpsView() {
    const url = useMemo(() => "/admin/api/ops", []);
    const { data, error, loading, initialLoading, refetch } =
        useAdminQuery<OpsSnapshot>(url);

    const [busy, setBusy] = useState<OpsAction | null>(null);
    const [notice, setNotice] = useState<{
        tone: "success" | "error";
        text: string;
    } | null>(null);

    async function runAction(action: OpsAction, confirmText: string) {
        if (!window.confirm(confirmText)) return;
        setBusy(action);
        setNotice(null);
        try {
            const res = await fetch("/admin/api/ops", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const body = (await res.json().catch(() => null)) as {
                changed?: number;
                error?: string;
            } | null;
            if (!res.ok || body?.changed == null) {
                throw new Error(body?.error ?? `HTTP ${res.status}`);
            }
            setNotice({
                tone: "success",
                text:
                    body.changed === 0
                        ? "Nothing to do — no rows matched."
                        : `${body.changed} item${body.changed === 1 ? "" : "s"} updated. The next cron tick will pick them up.`,
            });
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

    const index = data?.index;
    const staleCount = (data?.cache ?? []).filter(
        (c) => c.stale || c.missing,
    ).length;
    const searchBacklog =
        (index?.posts_pending ?? 0) + (index?.news_pending_index ?? 0);

    return (
        <div>
            {notice && (
                <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
                    {notice.text}
                </Notice>
            )}
            {error && (
                <Notice tone="error">
                    Couldn&apos;t load the ops snapshot: {error}{" "}
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
                    label="Stale caches"
                    value={fmtNum(staleCount)}
                    hint={`of ${fmtNum(data?.cache.length ?? 0)} tracked`}
                    tone={staleCount > 0 ? "warn" : "default"}
                />
                <StatTile
                    label="Search backlog"
                    value={fmtNum(searchBacklog)}
                    hint={`${fmtNum(index?.posts_pending)} posts · ${fmtNum(index?.news_pending_index)} news`}
                />
                <StatTile
                    label="Awaiting rewrite"
                    value={fmtNum(index?.news_awaiting_rewrite)}
                    hint={`≈${fmtNum(index?.backlog_minutes)} min to drain at 1 / 3 min`}
                    tone={
                        (index?.news_awaiting_rewrite ?? 0) > 0
                            ? "warn"
                            : "default"
                    }
                />
                <StatTile
                    label="Stalled news"
                    value={fmtNum(index?.news_stalled)}
                    hint={`${fmtNum(index?.news_with_retries)} have failed at least once`}
                    tone={(index?.news_stalled ?? 0) > 0 ? "danger" : "default"}
                />
            </StatGrid>

            <div className="mb-6 flex items-center justify-between gap-3">
                <span className="text-xs text-text-muted">
                    {data
                        ? `Snapshot taken ${fmtTs(data.generated_at)}`
                        : "Loading…"}
                </span>
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={loading}
                    onClick={refetch}
                >
                    {loading ? "Refreshing…" : "Refresh"}
                </Button>
            </div>

            {initialLoading ? (
                <EmptyState>Loading ops snapshot…</EmptyState>
            ) : data ? (
                <div className="space-y-8">
                    <Section
                        title="Cache freshness"
                        hint="Written by the 30-min refresh cron. `github-repos` lives in its own table rather than in cache_entries."
                    >
                        <CacheTable rows={data.cache} />
                    </Section>

                    <Section
                        title="Queue heads"
                        hint="Each cron processes exactly one item per tick, in a fixed order. The same head across refreshes means that item is blocking everything behind it."
                    >
                        <QueueHeads heads={data.queues} />
                    </Section>

                    <Section
                        title="Cron liveness"
                        hint="Derived from audit_log, which the cache worker writes on every upstream call — cf-blog can't ask the worker directly. Rows older than 30 days are pruned."
                    >
                        <ActivityTable rows={data.activity} />
                    </Section>

                    <Section
                        title="Maintenance"
                        hint="D1 writes that change what the next scheduled tick picks up."
                    >
                        <div className="grid gap-3 md:grid-cols-2">
                            {OPS_ACTIONS.map((a) => (
                                <div
                                    key={a.action}
                                    className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-bg-card p-4"
                                >
                                    <div>
                                        <MicroLabel className="block">
                                            {a.label}
                                        </MicroLabel>
                                        <p className="mt-1 text-xs text-text-muted">
                                            {a.description}
                                        </p>
                                    </div>
                                    <div>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={busy !== null}
                                            onClick={() =>
                                                void runAction(
                                                    a.action,
                                                    `${a.label}\n\n${a.description}\n\nProceed?`,
                                                )
                                            }
                                        >
                                            {busy === a.action
                                                ? "Working…"
                                                : "Run"}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section
                        title="Cron-only — not triggerable from here"
                        hint={data.cacheWorker.reason}
                    >
                        <CronJobsTable jobs={data.cacheWorker.jobs} />
                    </Section>
                </div>
            ) : null}
        </div>
    );
}

function Section({
    title,
    hint,
    children,
}: {
    title: string;
    hint: string;
    children: ReactNode;
}) {
    return (
        <section>
            <MicroLabel className="block">{title}</MicroLabel>
            <p className="mb-2 mt-0.5 text-xs text-text-muted">{hint}</p>
            {children}
        </section>
    );
}

function CacheTable({ rows }: { rows: CacheHealthRow[] }) {
    const columns: Column<CacheHealthRow>[] = [
        {
            key: "key",
            header: "Key",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-primary",
            render: (r) => r.key,
            title: (r) =>
                r.source === "table"
                    ? "Stored in the github_repos table"
                    : "Stored in cache_entries",
        },
        {
            key: "status",
            header: "Status",
            nowrap: true,
            render: (r) => (
                <StatusBadge
                    status={r.missing ? "failed" : r.stale ? "stale" : "ok"}
                    suffix={r.missing ? "never written" : null}
                />
            ),
            title: (r) =>
                `Expected to refresh within ${fmtAge(r.expected_max_age_seconds)}`,
        },
        {
            key: "age",
            header: "Age",
            align: "right",
            nowrap: true,
            cellClassName: "font-mono text-xs",
            render: (r) => fmtAge(r.age_seconds),
        },
        {
            key: "fetched",
            header: "Last write",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) => (r.fetched_at ? fmtTs(r.fetched_at) : "—"),
        },
        {
            key: "size",
            header: "Size",
            align: "right",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) =>
                r.source === "table"
                    ? `${fmtNum(r.row_count)} rows`
                    : fmtBytes(r.bytes),
        },
    ];

    return (
        <DataTable
            caption="Cache entry freshness"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.key}
        />
    );
}

function QueueHeads({ heads }: { heads: QueueHead[] }) {
    if (heads.length === 0) {
        return <EmptyState>Both queues are empty — nothing pending.</EmptyState>;
    }
    return (
        <div className="grid gap-3 md:grid-cols-2">
            {heads.map((h) => (
                <div
                    key={`${h.queue}-${h.kind}-${h.id}`}
                    className="rounded-xl border border-border bg-bg-card p-4"
                >
                    <div className="flex items-center gap-2">
                        <MicroLabel>
                            {h.queue === "rewrite"
                                ? "Next AI rewrite"
                                : "Next search index"}
                        </MicroLabel>
                        <StatusBadge status={h.kind} />
                        {h.retry_count != null && h.retry_count > 0 && (
                            <StatusBadge
                                status="failed"
                                suffix={`${h.retry_count} retries`}
                            />
                        )}
                    </div>
                    <p className="mt-1.5 truncate text-sm font-medium text-text-primary">
                        {h.title}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-text-muted">
                        {h.id} · {h.detail}
                        {h.last_failed_at
                            ? ` · last failed ${fmtTs(h.last_failed_at)}`
                            : ""}
                    </p>
                </div>
            ))}
        </div>
    );
}

function ActivityTable({ rows }: { rows: CronActivityRow[] }) {
    if (rows.length === 0) {
        return (
            <EmptyState>
                No audit rows — either the cache worker hasn&apos;t run in 30
                days, or audit logging is off.
            </EmptyState>
        );
    }

    const columns: Column<CronActivityRow>[] = [
        {
            key: "op",
            header: "Operation",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-primary",
            render: (r) => `${r.category}/${r.operation}`,
        },
        {
            key: "status",
            header: "Last",
            nowrap: true,
            render: (r) => <StatusBadge status={r.last_status ?? "unknown"} />,
        },
        {
            key: "last",
            header: "Last run",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (r) => (r.last_ts ? fmtTs(r.last_ts) : "—"),
        },
        {
            key: "runs",
            header: "Runs 24h",
            align: "right",
            nowrap: true,
            cellClassName: "font-mono text-xs",
            render: (r) => fmtNum(r.runs_24h),
        },
        {
            key: "failed",
            header: "Failed 24h",
            align: "right",
            nowrap: true,
            cellClassName: "font-mono text-xs",
            render: (r) => (
                <span className={r.failed_24h > 0 ? "text-red-400" : undefined}>
                    {fmtNum(r.failed_24h)}
                </span>
            ),
        },
    ];

    return (
        <DataTable
            caption="Cache worker activity from the outbound audit log"
            columns={columns}
            rows={rows}
            rowKey={(r) => `${r.category}/${r.operation}`}
        />
    );
}

function CronJobsTable({ jobs }: { jobs: CronJob[] }) {
    const columns: Column<CronJob>[] = [
        {
            key: "schedule",
            header: "Schedule",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-primary",
            render: (j) => j.schedule,
        },
        {
            key: "endpoint",
            header: "Endpoint",
            nowrap: true,
            cellClassName: "font-mono text-xs text-text-muted",
            render: (j) => j.endpoint,
        },
        {
            key: "what",
            header: "Does",
            cellClassName: "text-xs",
            render: (j) => j.what,
        },
    ];

    return (
        <DataTable
            caption="cf-blog-cache scheduled jobs"
            columns={columns}
            rows={jobs}
            rowKey={(j) => j.endpoint}
            footer={
                <>
                    Run one by hand from a shell that has the secret:{" "}
                    <code className="font-mono text-text-secondary">
                        curl -X POST https://&lt;cf-blog-cache
                        host&gt;/__refresh -H &quot;Authorization: Bearer
                        $CRON_SECRET&quot;
                    </code>
                </>
            }
        />
    );
}
