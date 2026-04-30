import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export default async function AdminDashboard() {
  const posts = await getAllPosts();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div
        className="admin-title"
        style={{
          padding: "28px 24px 20px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            margin: "0 0 6px",
            color: "var(--text-primary)",
          }}
        >
          All Posts
        </h1>
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>
          Manage your blog articles
        </p>
      </div>

      {posts.length === 0 ? (
        <p className="p-6 text-text-muted">No posts yet. Create your first post!</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table
            className="admin-table"
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                  }}
                >
                  Title
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                  }}
                >
                  Date
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    borderBottom: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-bg-card">
              {posts.map((post) => (
                <tr
                  key={post.slug}
                  style={{ transition: "background 0.15s" }}
                  className="hover:bg-bg-secondary"
                >
                  <td
                    className="px-4 py-4"
                    style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}
                  >
                    <span
                      className="title"
                      style={{ fontWeight: 600, fontSize: "14px" }}
                    >
                      {post.title}
                    </span>
                    <span
                      className="ml-2 text-xs text-text-muted"
                      style={{ marginLeft: "8px", fontSize: "12px", color: "var(--text-muted)" }}
                    >
                      /{post.slug}
                    </span>
                  </td>
                  <td
                    className="px-4 py-4"
                    style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}
                  >
                    <span
                      className="date"
                      style={{ color: "var(--text-muted)", fontSize: "12px" }}
                    >
                      {formatDate(post.date)}
                    </span>
                  </td>
                  <td
                    className="px-4 py-4"
                    style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}
                  >
                    <span
                      className={`status ${post.published ? 'published' : 'draft'}`}
                      style={{
                        display: "inline-block",
                        padding: "3px 10px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 500,
                        ...(post.published
                          ? {
                              background: "rgba(34, 197, 94, 0.15)",
                              color: "#4ade80",
                            }
                          : {
                              background: "rgba(255, 107, 0, 0.15)",
                              color: "var(--accent)",
                            }),
                      }}
                    >
                      {post.published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td
                    className="px-4 py-4"
                    style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}
                  >
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