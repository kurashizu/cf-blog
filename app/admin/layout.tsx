export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-bg-primary">
            <header className="px-6 py-5 bg-bg-secondary border-b border-border">
                <div className="mx-auto max-w-6xl px-4 flex items-center justify-between">
                    <h1 className="text-lg font-bold text-accent">
                        Admin Panel
                    </h1>
                    <nav className="flex gap-4">
                        <a
                            href="/admin"
                            className="text-sm text-text-muted hover:text-accent transition-colors"
                        >
                            Posts
                        </a>
                        <a
                            href="/admin/guestbook"
                            className="text-sm text-text-muted hover:text-accent transition-colors"
                        >
                            Messages
                        </a>
                    </nav>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </div>
    );
}
