import Link from 'next/link';

// TODO: Implement Cloudflare Access auth check
// For now, this is a placeholder that would redirect to login
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: Implement Cloudflare Access auth check
  // In production, use getUserInfo() from Workers SDK or check session token

  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="border-b border-border bg-bg-secondary">
        <div className="container mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-text-primary">
              Admin Dashboard
            </h1>
            <nav className="flex gap-4">
              <Link
                href="/admin"
                className="text-sm text-text-secondary hover:text-accent transition-colors focus:outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1"
              >
                Posts
              </Link>
              <Link
                href="/admin/editor/new"
                className="text-sm text-text-secondary hover:text-accent transition-colors focus:outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1"
              >
                New Post
              </Link>
              <Link
                href="/"
                className="text-sm text-text-muted hover:text-text-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1"
              >
                ← Back to Site
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}