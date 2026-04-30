import Link from 'next/link';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createArticlesRepo } from '@/lib/articles';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const { env } = getCloudflareContext();
  const repo = createArticlesRepo(env);
  const posts = await repo.getAll();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="admin-title">
        <h1>All Posts</h1>
        <p>Manage your blog articles</p>
      </div>

      {posts.length === 0 ? (
        <p className="p-6 text-text-muted">No posts yet. Create your first post!</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-bg-card">
              {posts.map((post) => (
                <tr key={post.slug}>
                  <td>
                    <span className="post-title-cell">{post.title}</span>
                    <span className="post-slug">/{post.slug}</span>
                  </td>
                  <td>
                    <span className="post-date-cell">{formatDate(post.date)}</span>
                  </td>
                  <td>
                    <span className={`status ${post.published ? 'published' : 'draft'}`}>
                      {post.published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td>
                    <Link href={`/admin/editor/${post.slug}`}>
                      <Button variant="secondary">Edit</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Link href="/admin/editor/new">
          <Button>New Post</Button>
        </Link>
      </div>
    </div>
  );
}
