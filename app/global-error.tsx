"use client";

/**
 * Last-resort boundary — catches errors thrown by the root layout itself.
 * Replaces the entire document, so it must render <html>/<body> and can't
 * rely on the layout's global CSS: styling is inline.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#0a0a0f",
                    color: "#d4d4d8",
                    fontFamily: "ui-monospace, monospace",
                }}
            >
                <div style={{ textAlign: "center", padding: "2rem" }}>
                    <p style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
                        Something went badly wrong.
                    </p>
                    {error.digest && (
                        <p
                            style={{
                                fontSize: "0.75rem",
                                color: "#71717a",
                                marginBottom: "1.5rem",
                            }}
                        >
                            digest: {error.digest}
                        </p>
                    )}
                    <button
                        onClick={reset}
                        style={{
                            padding: "0.5rem 1rem",
                            borderRadius: "0.5rem",
                            border: "1px solid #3f3f46",
                            background: "transparent",
                            color: "#d4d4d8",
                            cursor: "pointer",
                            font: "inherit",
                        }}
                    >
                        Reload
                    </button>
                </div>
            </body>
        </html>
    );
}
