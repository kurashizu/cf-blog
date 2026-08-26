import { AdminNav } from "@/components/admin/AdminNav";

/**
 * Admin shell. The public chrome is suppressed for `/admin/*` in the root
 * layout (see `components/layout/PublicChrome.tsx`), so this is the only
 * header on the page.
 */
export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-bg-primary">
            <header className="border-b border-border bg-bg-secondary">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <span className="text-lg font-bold text-accent">
                        Admin Panel
                    </span>
                    <AdminNav />
                </div>
            </header>
            <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
        </div>
    );
}
