import { notFound } from 'next/navigation';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createArticlesRepo } from '@/lib/articles';
import PostEditor from '@/components/editor/PostEditor';

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function EditPostPage({ params }: PageProps) {
  const { slug } = await params;
  const { env } = getCloudflareContext();
  const repo = createArticlesRepo(env);
  const post = await repo.getBySlug(slug);

  if (!post) {
    notFound();
  }

  const tagsString = post.tags.join(', ');

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <PostEditor
        initialData={{
          title: post.title,
          slug: post.slug,
          date: post.date,
          tags: tagsString,
          published: post.published,
          coverImage: post.coverImage || '',
          content: post.content,
        }}
      />
    </div>
  );
}
