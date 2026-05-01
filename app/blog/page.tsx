import Link from "next/link";
import { createArticlesRepo } from "@/lib/articles";
import { formatDate } from "@/lib/utils";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";

export const dynamic = "force-dynamic";

interface Post {
  slug: string;
  title: string;
  date: string;
  description?: string;
  tags?: string[];
}

function PostCard({ post }: { post: Post }) {
  return (
    <Link href={`/blog/${post.slug}`} className="block">
      <Card>
        <CardHeader>
          <span className="article-meta">{formatDate(post.date)}</span>
        </CardHeader>
        <CardContent>
          <h2 className="article-title">{post.title}</h2>
          {post.description && <p className="article-desc mt-1">{post.description}</p>}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {post.tags.map((tag) => (
                <Tag key={tag} variant="default">{tag}</Tag>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function BlogPage() {
  const repo = createArticlesRepo();
  const posts = await repo.getAll();

  return (
    <div className="max-w-4xl mx-auto px-4 pb-12">
      <div className="page-title">
        <h1>Blog</h1>
        <p className="text-sm text-text-secondary">A collection of thoughts and tutorials</p>
      </div>

      {posts.length === 0 ? (
        <p className="text-text-muted">No posts yet.</p>
      ) : (
        <div className="article-list">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
