import Link from 'next/link';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="admin-header">
        <div className="flex items-center gap-4">
          <h1 className="admin-header-title">Admin Panel</h1>
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
