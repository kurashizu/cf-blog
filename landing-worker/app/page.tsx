import { BLOG_URL } from "../../shared/site-config";

export default function HomePage() {
    return (
        <>
            <div className="aurora" aria-hidden />
            <main
                style={{
                    position: "fixed",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "2rem",
                    zIndex: 1,
                }}
            >
                <h1 className="hero-title">KURASHIZU</h1>
                <p className="hero-subtitle">where ideas flow</p>
                <a
                    href={BLOG_URL}
                    className="enter-btn"
                    style={{ textDecoration: "none" }}
                >
                    Enter
                </a>
            </main>
        </>
    );
}