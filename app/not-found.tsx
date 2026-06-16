import Link from "next/link";

export default function NotFound() {
    return (
        <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center px-4">
            <div className="w-full max-w-xl animate-fade-up">
                <div className="rounded-xl border border-border bg-black/40 p-6 font-mono text-sm leading-relaxed">
                    <div className="text-text-secondary">
                        <span className="text-accent">$</span> curl -s{" "}
                        <span className="text-text-muted">https://blog.022025.xyz/</span>
                        <span className="animate-glow-text text-accent">lost-path</span>
                    </div>

                    <div className="my-3 border-t border-border" />

                    <div className="space-y-1 text-text-secondary">
                        <p>
                            <span className="text-accent">HTTP/1.1</span>{" "}
                            <span className="text-red-400">404 Not Found</span>
                        </p>
                        <p>
                            <span className="text-text-muted">Content-Type:</span> text/html
                        </p>
                    </div>

                    <div className="my-6 flex justify-center">
                        <svg
                            viewBox="0 0 120 60"
                            className="h-20 w-40 text-text-muted"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="60" cy="26" r="20" className="text-border" stroke="currentColor" />
                            <text
                                x="60"
                                y="32"
                                textAnchor="middle"
                                className="text-xs"
                                fill="currentColor"
                                stroke="none"
                            >
                                404
                            </text>
                            <path d="M8 54 Q 20 44 32 54 Q 44 44 56 54 Q 68 44 80 54 Q 92 44 104 54 Q 112 49 116 54" />
                        </svg>
                    </div>

                    <p className="text-text-secondary">
                        The page you&apos;re looking for has wandered into
                        <br />
                        the wrong dimension.
                    </p>

                    <p className="mt-1 text-text-muted">
                        (It&apos;s probably chasing butterflies in the &lt;div&gt; tree.)
                    </p>

                    <div className="mt-6 border-t border-border pt-4">
                        <p className="mb-3 text-xs uppercase tracking-wider text-text-muted">
                            you could try
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <Link
                                href="/"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                            >
                                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                                    <path d="M8 1L1 7.5V15h5.5v-4.5h3V15H15V7.5L8 1z" />
                                </svg>
                                Home
                            </Link>
                            <Link
                                href="/blog"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                            >
                                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                                    <path d="M2 2h12v2H2V2zm0 4h12v2H2V6zm0 4h8v2H2v-2z" />
                                </svg>
                                Blog
                            </Link>
                            <Link
                                href="/news"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                            >
                                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <circle cx="8" cy="5" r="3" />
                                    <path d="M3 14c0-3 2.2-5 5-5s5 2 5 5" />
                                </svg>
                                News
                            </Link>
                            <Link
                                href="/about"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                            >
                                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                                    <circle cx="8" cy="5" r="2.5" />
                                    <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
                                </svg>
                                About
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
