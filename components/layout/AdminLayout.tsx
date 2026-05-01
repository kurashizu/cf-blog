import Link from "next/link";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
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
