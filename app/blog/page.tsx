import Link from 'next/link';
import { getAllPosts, Post } from '@/lib/posts';
import { formatDate } from '@/lib/utils';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';

interface BlogPostCardProps {
  post: Post;
}

function BlogPostCard({ post }: BlogPostCardProps) {
  return (
    <Link href={`/blog/${post.slug}`}>
      <Card className="transition-all hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold text-text-primary">
              {post.title}
            </h2>
            <span className="whitespace-nowrap text-sm text-text-muted">
              {formatDate(post.date)}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-text-secondary line-clamp-2">{post.description}</p>
          {post.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function BlogPage() {
  const posts = await getAllPosts();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-text-primary">Blog</h1>
      {posts.length === 0 ? (
        <p className="text-text-muted">No posts yet.</p>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <BlogPostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}