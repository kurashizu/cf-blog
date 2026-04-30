import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export default async function AdminDashboard() {
  const posts = await getAllPosts();

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-text-primary">Posts</h2>
        <Link href="/admin/editor/new">
          <Button>New Post</Button>
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className="text-text-muted">No posts yet. Create your first post!</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <thead className="bg-bg-secondary">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-bg-card">
              {posts.map((post) => (
                <tr key={post.slug} className="hover:bg-bg-secondary/50">
                  <td className="px-4 py-4">
                    <span className="text-text-primary">{post.title}</span>
                    <span className="ml-2 text-xs text-text-muted">
                      /{post.slug}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs ${
                        post.published
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}
                    >
                      {post.published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-text-secondary">
                    {formatDate(post.date)}
                  </td>
                  <td className="px-4 py-4">
                    <Link href={`/admin/editor/${post.slug}`}>
                      <Button variant="secondary">
                        Edit
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}