import { notFound } from 'next/navigation';
import { getPostBySlug } from '@/lib/posts';
import PostEditor from '../PostEditor';

interface PageProps {
  params: {
    slug: string;
  };
}

export default async function EditPostPage({ params }: PageProps) {
  const post = await getPostBySlug(params.slug);

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