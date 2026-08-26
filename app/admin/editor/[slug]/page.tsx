import { notFound } from "next/navigation";
import { createArticlesRepo } from "@/lib/articles";
import { getKnownTaxonomy } from "@/lib/admin-stats";
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
    const [post, taxonomy] = await Promise.all([
        repo.getBySlug(slug),
        getKnownTaxonomy(),
    ]);

    if (!post) {
        notFound();
    }

    // `post` is already a plain object built field-by-field by the repo, so
    // the old JSON round-trip bought nothing except erasing its type.
    // `tags` is guaranteed to be an array by parseTagsColumn.
    return (
        <PostEditor
            knownTags={taxonomy.tags}
            knownCategories={taxonomy.categories}
            initialData={{
                title: post.title,
                slug: post.slug,
                date: post.date,
                description: post.description || "",
                tags: post.tags,
                category: post.category,
                published: post.published,
                coverImage: post.coverImage || "",
                externalUrl: post.externalUrl || "",
                content: post.content,
            }}
        />
    );
}
