import Link from "next/link";

export default function NotFound() {
    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2rem",
                padding: "2rem",
                textAlign: "center",
            }}
        >
            <h1
                style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: "6rem",
                    fontWeight: 900,
                    fontStyle: "italic",
                    background:
                        "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 50%, var(--text-primary) 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                }}
            >
                404
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem" }}>
                This page wandered off into the void.
            </p>
            <Link
                href="https://blog.022025.xyz"
                className="enter-btn"
                style={{ textDecoration: "none" }}
            >
                back to the blog
            </Link>
        </div>
    );
}