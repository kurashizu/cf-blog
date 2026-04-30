import Link from 'next/link';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createArticlesRepo } from '@/lib/articles';
import { formatDate } from '@/lib/utils';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';

export const dynamic = "force-dynamic";

interface BlogPostCardProps {
  post: Awaited<ReturnType<ReturnType<typeof createArticlesRepo>['getAll']>>[number];
}

function BlogPostCard({ post }: BlogPostCardProps) {
  return (
    <Link href={`/blog/${post.slug}`}>
      <Card className="article-card transition-all hover:border-accent hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(255,107,0,0.12)]">
        <CardHeader className="pb-2">
          <span className="article-meta">{formatDate(post.date)}</span>
        </CardHeader>
        <CardContent className="pt-0">
          <h2 className="article-title mb-1">{post.title}</h2>
          <p className="article-desc mb-3">{post.description}</p>
          {post.tags.length > 0 && (
            <div className="article-tags">
              {post.tags.map((tag) => (
                <span key={tag} className="tag">
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
  const { env } = getCloudflareContext();
  const repo = createArticlesRepo(env);
  const posts = await repo.getAll();

  return (
    <div className="container mx-auto max-w-4xl px-4 pb-[60px]">
      <div className="page-title">
        <h1 className="mb-1 text-[28px] font-bold text-text-primary">Blog</h1>
        <p className="text-text-secondary text-sm">A collection of thoughts and tutorials</p>
      </div>
      {posts.length === 0 ? (
        <p className="text-text-muted mt-6">No posts yet.</p>
      ) : (
        <div className="article-list mt-6">
          {posts.map((post) => (
            <BlogPostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
