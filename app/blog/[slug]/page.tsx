import "katex/dist/katex.min.css";
import { BlogArticle } from "@/components/blog/BlogArticle";
import { createArticlesRepo } from "@/lib/articles";
import { notFound, redirect } from "next/navigation";

interface PageProps {
    params: Promise<{
        slug: string;
    }>;
}

export default async function ArticlePage({ params }: PageProps) {
    const { slug } = await params;
    const repo = createArticlesRepo();
    const post = await repo.getBySlug(slug);

    if (!post) {
        notFound();
    }

    // If the post is configured as a direct link, redirect (307) to the
    // external URL. Only allow http(s) to avoid open-redirect via crafted values.
    if (post.externalUrl && /^https?:\/\//.test(post.externalUrl)) {
        redirect(post.externalUrl);
    }

    return <BlogArticle post={post} />;
}
