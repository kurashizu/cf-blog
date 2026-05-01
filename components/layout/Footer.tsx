import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border mt-auto">
      <div className="max-w-4xl mx-auto px-6 py-6 text-center">
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-text-muted">
            &copy; {new Date().getFullYear()} Kurashizu. All rights reserved.
          </p>
          <nav className="flex justify-center gap-4 text-text-muted">
            <Link href="/admin" className="hover:text-accent transition-colors">Admin</Link>
            <Link href="/admin/editor/new" className="hover:text-accent transition-colors">New Post</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
