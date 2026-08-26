import Link from "next/link";
import { createArticlesRepo } from "@/lib/articles";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { PostsTable } from "@/components/admin/PostsTable";
import { EmptyState, PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminPostsPage() {
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
                <PostsTable
                    rows={posts.map((p) => ({
                        slug: p.slug,
                        title: p.title,
                        date: formatDate(p.date),
                        category: p.category,
                        tags: p.tags,
                        published: p.published,
                    }))}
                />
            )}
        </div>
    );
}
