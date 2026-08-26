import Link from "next/link";
import { createArticlesRepo } from "@/lib/articles";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Tag";
import { EmptyState, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
    const repo = createArticlesRepo();
    const posts = await repo.getAll();
    const published = posts.filter((p) => p.published).length;

    return (
        <div>
            <PageHeader
                title="Posts"
                description={
                    posts.length === 0
                        ? "Manage your blog articles."
                        : `${posts.length} total · ${published} published · ${posts.length - published} draft`
                }
                actions={
                    <Link href="/admin/editor/new" prefetch={false}>
                        <Button size="sm">New Post</Button>
                    </Link>
                }
            />

            {posts.length === 0 ? (
                <EmptyState>
                    No posts yet.{" "}
                    <Link
                        href="/admin/editor/new"
                        prefetch={false}
                        className="text-accent underline underline-offset-2"
                    >
                        Create your first post
                    </Link>
                    .
                </EmptyState>
            ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse bg-bg-card text-sm">
                            <caption className="sr-only">All blog posts</caption>
                            <thead>
                                <tr>
                                    {["Title", "Date", "Status", ""].map(
                                        (h, i) => (
                                            <th
                                                key={h || `actions-${i}`}
                                                scope="col"
                                                className="border-b border-border bg-bg-secondary px-3 py-2.5 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted"
                                            >
                                                {h}
                                            </th>
                                        ),
                                    )}
                                </tr>
                            </thead>
                            <tbody className="[&>tr:last-child>td]:border-b-0">
                                {posts.map((post) => (
                                    <tr
                                        key={post.slug}
                                        className="transition-colors hover:bg-bg-secondary/40"
                                    >
                                        <td className="border-b border-border px-3 py-3">
                                            <span className="font-medium text-text-primary">
                                                {post.title || "(untitled)"}
                                            </span>
                                            <span className="mt-0.5 block font-mono text-xs text-text-muted">
                                                /{post.slug}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap border-b border-border px-3 py-3 text-text-muted">
                                            {formatDate(post.date) || "—"}
                                        </td>
                                        <td className="whitespace-nowrap border-b border-border px-3 py-3">
                                            <Badge
                                                variant={
                                                    post.published
                                                        ? "success"
                                                        : "warning"
                                                }
                                            >
                                                {post.published
                                                    ? "Published"
                                                    : "Draft"}
                                            </Badge>
                                        </td>
                                        <td className="whitespace-nowrap border-b border-border px-3 py-3 text-right">
                                            <Link
                                                href={`/admin/editor/${post.slug}`}
                                            >
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                >
                                                    Edit
                                                </Button>
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
