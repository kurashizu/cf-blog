import { BlogArticle } from "@/components/blog/BlogArticle";
import { createArticlesRepo } from "@/lib/articles";
import { notFound } from "next/navigation";

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

  return <BlogArticle post={post} />;
}