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

    const safePost = JSON.parse(JSON.stringify(post));
    const tagsString = safePost.tags.join(", ");

    return (
        <div className="container mx-auto max-w-6xl px-4 py-8">
            <PostEditor
                initialData={{
                    title: safePost.title,
                    slug: safePost.slug,
                    date: safePost.date,
                    tags: tagsString,
                    published: safePost.published,
                    coverImage: safePost.coverImage || "",
                    content: safePost.content,
                }}
            />
        </div>
    );
}
