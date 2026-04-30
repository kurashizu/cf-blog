import Link from 'next/link';
import { headers } from 'next/headers';

/**
 * Cloudflare Access authentication check
 * Uses getUserInfo() API via headers for Zero Trust integration
 * Returns user email if authenticated, null otherwise
 */
async function getCurrentUser(): Promise<{ email: string; name: string } | null> {
  try {
    const headersList = await headers();
    const cfAccessAuthedUser = headersList.get('cf-access-authed-user');

    if (!cfAccessAuthedUser) {
      return null;
    }

    // Parse email from header (format: "email@example.com")
    return {
      email: cfAccessAuthedUser,
      name: cfAccessAuthedUser.split('@')[0],
    };
  } catch {
    return null;
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Redirect to Cloudflare Access login if not authenticated
  if (!user) {
    const unauthorizedHtml = `
      <!DOCTYPE html>
      <html>
        <body class="unauthorized-page">
          <div class="unauthorized-content">
            <h1>Authentication Required</h1>
            <p>Please sign in with Cloudflare Access to continue.</p>
            <a href="/__auth/signin" class="signin-button">Sign In</a>
          </div>
        </body>
      </html>
    `;
    return new Response(unauthorizedHtml, {
      status: 401,
      headers: { 'Content-Type': 'text/html' },
    });
  }

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
