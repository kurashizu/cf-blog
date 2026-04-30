import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostBySlug, markdownToHtml, getAllPosts } from '@/lib/posts';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const content = markdownToHtml(post.content);

  return (
    <article className="container mx-auto max-w-4xl px-4 py-12">
      <Link href="/blog" className="mb-8 inline-block">
        <Button variant="secondary" className="mb-8">
          ← Back to Blog
        </Button>
      </Link>

      <header className="mb-12">
        {post.coverImage && (
          <div className="mb-8 aspect-video w-full overflow-hidden rounded-lg">
            <img
              src={post.coverImage}
              alt={post.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <h1 className="mb-4 text-4xl font-bold text-text-primary">
          {post.title}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-text-secondary">
          <span>{formatDate(post.date)}</span>
          <span>•</span>
          <span>{post.author}</span>
          {post.tags.length > 0 && (
            <>
              <span>•</span>
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Content rendered from trusted markdown authored by site owner */}
      {/* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */}
      <div
        className="prose prose-invert max-w-none prose-headings:text-text-primary prose-p:text-text-secondary prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-code:text-accent prose-code:bg-bg-secondary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-bg-secondary"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </article>
  );
}