import { notFound } from 'next/navigation';
import { getPostBySlug } from '@/lib/posts';
import PostEditor from '@/components/editor/PostEditor';

// Force dynamic rendering - R2 client uses module-level state that can't be serialized
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function EditPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  // Convert tags array to comma-separated string for the form
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
