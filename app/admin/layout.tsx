import Link from 'next/link';

// TODO: Implement Cloudflare Access auth check
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <header
        style={{
          padding: "18px 24px",
          background: "linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-card) 100%)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
        }}
        className="admin-header"
      >
        <h1
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "var(--accent)",
            letterSpacing: "-0.5px",
            margin: 0,
          }}
        >
          Admin Panel
        </h1>
        <nav className="admin-nav" style={{ display: "flex", gap: "20px" }}>
          <Link
            href="/admin"
            style={{
              color: "var(--text-muted)",
              textDecoration: "none",
              fontSize: "14px",
              transition: "color 0.2s",
            }}
            className="active"
          >
            Posts
          </Link>
          <Link
            href="/admin/editor/new"
            style={{
              color: "var(--text-muted)",
              textDecoration: "none",
              fontSize: "14px",
              transition: "color 0.2s",
            }}
          >
            New Post
          </Link>
          <Link
            href="/"
            style={{
              color: "var(--text-muted)",
              textDecoration: "none",
              fontSize: "14px",
              transition: "color 0.2s",
            }}
          >
            ← Back to Site
          </Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}