import Link from "next/link";
import { getAdminStats } from "@/lib/admin-stats";
import { createArticlesRepo } from "@/lib/articles";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Tag";
import {
    EmptyState,
    MicroLabel,
    PageHeader,
    StatGrid,
    StatTile,
    fmtNum,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 5;

export default async function AdminOverview() {
    const [stats, recent] = await Promise.all([
        getAdminStats(),
        createArticlesRepo()
            .getAll()
            .then((posts) => posts.slice(0, RECENT_LIMIT))
            .catch(() => []),
    ]);

    // Things that need a human: surfaced as a to-do rather than buried in a
    // table the user would have to go looking for.
    const attention = [
        stats.messages.pending > 0 && {
            href: "/admin/guestbook",
            label: `${stats.messages.pending} message${stats.messages.pending === 1 ? "" : "s"} awaiting approval`,
        },
        stats.news.missingSummary > 0 && {
            href: "/admin/news",
            label: `${stats.news.missingSummary} news item${stats.news.missingSummary === 1 ? "" : "s"} without an AI summary`,
        },
        stats.audit24h.failed > 0 && {
            href: "/admin/audit",
            label: `${stats.audit24h.failed} failed upstream call${stats.audit24h.failed === 1 ? "" : "s"} in the last 24h`,
        },
        stats.traffic24h.rateLimited > 0 && {
            href: "/admin/audit",
            label: `${stats.traffic24h.rateLimited} rate-limited request${stats.traffic24h.rateLimited === 1 ? "" : "s"} in the last 24h`,
        },
        stats.indexing.postsPending + stats.indexing.newsPending > 0 && {
            href: "/admin/ops",
            label: `${stats.indexing.postsPending + stats.indexing.newsPending} item${stats.indexing.postsPending + stats.indexing.newsPending === 1 ? "" : "s"} pending search indexing`,
        },
    ].filter(Boolean) as { href: string; label: string }[];

    return (
        <div>
            <PageHeader
                title="Overview"
                description="Everything that needs attention, and the last 24 hours of traffic."
                actions={
                    <Link href="/admin/editor/new" prefetch={false}>
                        <Button size="sm">New Post</Button>
                    </Link>
                }
            />

            <StatGrid>
                <StatTile
                    label="Posts"
                    value={fmtNum(stats.posts.total)}
                    hint={`${stats.posts.published} published · ${stats.posts.drafts} draft`}
                />
                <StatTile
                    label="Requests · 24h"
                    value={fmtNum(stats.traffic24h.requests)}
                    hint={`${fmtNum(stats.traffic24h.uniqueIps)} unique IPs`}
                />
                <StatTile
                    label="Upstream calls · 24h"
                    value={fmtNum(stats.traffic24h.upstreamCalls)}
                    hint="model / external API"
                />
                <StatTile
                    label="Problems · 24h"
                    value={fmtNum(
                        stats.traffic24h.errors + stats.audit24h.failed,
                    )}
                    hint={`${stats.traffic24h.errors} request · ${stats.audit24h.failed} upstream`}
                    tone={
                        stats.traffic24h.errors + stats.audit24h.failed > 0
                            ? "danger"
                            : "default"
                    }
                />
            </StatGrid>

            <div className="grid gap-5 lg:grid-cols-2">
                <section>
                    <MicroLabel className="mb-2 block">
                        Needs attention
                    </MicroLabel>
                    {attention.length === 0 ? (
                        <EmptyState>
                            Nothing needs attention right now.
                        </EmptyState>
                    ) : (
                        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-card">
                            {attention.map((item) => (
                                <li key={item.label}>
                                    <Link
                                        href={item.href}
                                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-text-secondary transition-colors hover:bg-bg-secondary/40 hover:text-text-primary"
                                    >
                                        <span>{item.label}</span>
                                        <span className="text-text-muted">
                                            →
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section>
                    <MicroLabel className="mb-2 block">Recent posts</MicroLabel>
                    {recent.length === 0 ? (
                        <EmptyState>
                            No posts yet.{" "}
                            <Link
                                href="/admin/editor/new"
                                prefetch={false}
                                className="text-accent underline underline-offset-2"
                            >
                                Write the first one
                            </Link>
                            .
                        </EmptyState>
                    ) : (
                        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-card">
                            {recent.map((post) => (
                                <li key={post.slug}>
                                    <Link
                                        href={`/admin/editor/${post.slug}`}
                                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-bg-secondary/40"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm text-text-primary">
                                                {post.title || "(untitled)"}
                                            </span>
                                            <span className="text-xs text-text-muted">
                                                {formatDate(post.date) || "—"}
                                            </span>
                                        </span>
                                        <Badge
                                            variant={
                                                post.published
                                                    ? "success"
                                                    : "warning"
                                            }
                                        >
                                            {post.published
                                                ? "published"
                                                : "draft"}
                                        </Badge>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
}
