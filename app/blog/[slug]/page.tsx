import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createArticlesRepo, markdownToHtml } from '@/lib/articles';
import { formatDate } from '@/lib/utils';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return [];
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const { env } = getCloudflareContext();
  const repo = createArticlesRepo(env);
  const post = await repo.getBySlug(slug);

  if (!post) {
    notFound();
  }

  const content = markdownToHtml(post.content);

  return (
    <article className="article-content">
      <Link href="/blog" className="back-link">
        ← Back to blog
      </Link>

      <header className="article-header">
        {post.coverImage && (
          <div className="mb-8 aspect-video w-full overflow-hidden rounded-lg">
            <img
              src={post.coverImage}
              alt={post.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <h1>{post.title}</h1>

        <div className="article-meta-row mb-3">
          <span>{formatDate(post.date)}</span>
          <span>·</span>
          <span>{post.author}</span>
        </div>

        {post.tags.length > 0 && (
          <div className="article-tags">
            {post.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      <div
        className="article-body"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </article>
  );
}
