import { notFound } from "next/navigation";
import { createArticlesRepo } from "@/lib/articles";
import { PostEditor } from "@/components/editor/PostEditor";

export const dynamic = "force-dynamic";

interface PageProps {
    params: Promise<{
        slug: string;
    }>;
}

export default async function EditPostPage({ params }: PageProps) {
    const { slug } = await params;
    const repo = createArticlesRepo();
    const post = await repo.getBySlug(slug);

    if (!post) {
        notFound();
    }

    // `post` is already a plain object built field-by-field by the repo, so
    // the old JSON round-trip bought nothing except erasing its type.
    // `tags` is guaranteed to be an array by parseTagsColumn.
    return (
        <PostEditor
            initialData={{
                title: post.title,
                slug: post.slug,
                date: post.date,
                description: post.description || "",
                tags: post.tags.join(", "),
                published: post.published,
                coverImage: post.coverImage || "",
                externalUrl: post.externalUrl || "",
                content: post.content,
            }}
        />
    );
}
