import Link from "next/link";

const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toISOString().split("T")[0];

export function Footer() {
  return (
    <footer className="border-t border-border/50 mt-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <p className="text-sm text-text-muted">
              &copy; {new Date().getFullYear()} Kurashizu. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-xs text-text-muted">
              <Link href="/admin" className="hover:text-accent transition-colors">
                Admin
              </Link>
              <span>·</span>
              <Link href="/admin/editor/new" className="hover:text-accent transition-colors">
                New Post
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            <span className="text-xs text-text-muted">Powered by Cloudflare</span>
            <span className="text-xs text-text-muted/50">·</span>
            <span className="text-xs text-text-muted">{BUILD_DATE}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
