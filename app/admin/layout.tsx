import Link from 'next/link';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Dev mode: use mock user. Auth will be re-enabled when deployed with Cloudflare Access
  const user = { email: 'dev@local', name: 'Developer' };

  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="admin-header">
        <div className="flex items-center gap-4">
          <h1 className="admin-header-title">Admin Panel</h1>
          <span className="text-xs text-text-muted">{user.email}</span>
        </div>
        <nav className="admin-nav">
          <Link href="/admin" className="active">Posts</Link>
          <Link href="/admin/editor/new">New Post</Link>
          <Link href="/">← Back to Site</Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
