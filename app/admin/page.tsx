import Link from "next/link";
import { createArticlesRepo } from "@/lib/articles";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
    const repo = createArticlesRepo();
    const posts = await repo.getAll();

    return (
        <div>
            <div>
                <h1>All Posts</h1>
                <p>Manage your blog articles</p>
            </div>

            {posts.length === 0 ? (
                <p className="p-6 text-text-muted">
                    No posts yet. Create your first post!
                </p>
            ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full border-collapse bg-bg-card rounded-xl overflow-hidden">
                        <thead>
                            <tr>
                                <th className="text-left px-4 py-3.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted bg-bg-secondary border-b border-border">
                                    Title
                                </th>
                                <th className="text-left px-4 py-3.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted bg-bg-secondary border-b border-border">
                                    Date
                                </th>
                                <th className="text-left px-4 py-3.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted bg-bg-secondary border-b border-border">
                                    Status
                                </th>
                                <th className="text-left px-4 py-3.5 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-text-muted bg-bg-secondary border-b border-border">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-bg-card [&>tr:last-child>td]:border-b-0">
                            {posts.map((post) => (
                                <tr key={post.slug}>
                                    <td className="px-4 py-4 border-b border-border">
                                        <span className="font-semibold text-[0.9375rem] text-text-primary">
                                            {post.title}
                                        </span>
                                        <span className="block text-xs text-text-muted mt-1">
                                            /{post.slug}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 border-b border-border">
                                        <span className="text-[0.8125rem] text-text-muted">
                                            {formatDate(post.date)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 border-b border-border">
                                        <span
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${post.published ? "bg-emerald-500/10 text-emerald-400" : "bg-accent/10 text-accent"}`}
                                        >
                                            {post.published
                                                ? "Published"
                                                : "Draft"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 border-b border-border">
                                        <Link
                                            href={`/admin/editor/${post.slug}`}
                                        >
                                            <Button variant="secondary">
                                                Edit
                                            </Button>
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="mt-6 flex justify-end">
                <Link href="/admin/editor/new" prefetch={false}>
                    <Button>New Post</Button>
                </Link>
            </div>
        </div>
    );
}
