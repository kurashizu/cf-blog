import Link from "next/link";

function formatVersion(): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = String(now.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
}

const VERSION = process.env.NEXT_PUBLIC_VERSION || formatVersion();

export function Footer() {
    return (
        <footer className="site-footer mt-auto">
            <div className="max-w-4xl mx-auto px-6 py-8">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex flex-col items-center sm:items-start gap-1">
                        <p className="text-sm text-text-muted">
                            &copy; {new Date().getFullYear()} Kurashizu. All
                            rights reserved.
                        </p>
                        <div className="flex items-center gap-4 text-xs text-text-muted">
                            <Link
                                href="/admin"
                                prefetch={false}
                                className="hover:text-accent transition-colors"
                            >
                                Admin
                            </Link>
                            <span>·</span>
                            <Link
                                href="/admin/editor/new"
                                prefetch={false}
                                className="hover:text-accent transition-colors"
                            >
                                New Post
                            </Link>
                            <span>·</span>
                            <a
                                href="https://stats.uptimerobot.com/niOvUS14zB"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-accent transition-colors"
                            >
                                Service Status
                            </a>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                        <span className="text-xs text-text-muted">
                            Powered by Cloudflare
                        </span>
                        <span className="text-xs text-text-muted/50">·</span>
                        <span className="text-xs text-text-muted">
                            {VERSION}
                        </span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
