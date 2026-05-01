import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/components/theme/styles.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Kurashizu's Blog",
    template: "%s | Kurashizu's Blog",
  },
  description: "Personal blog about technology, programming, and more.",
  authors: [{ name: "Kurashizu" }],
};

function Header() {
  return (
    <header className="border-b border-border bg-bg-secondary">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="text-xl font-bold text-accent hover:text-accent-light transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-sm"
        >
          Kurashizu
        </Link>
        <ul className="flex gap-6">
          <li>
            <Link
              href="/blog"
              className="text-text-secondary hover:text-accent transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-sm"
            >
              Blog
            </Link>
          </li>
          <li>
            <Link
              href="/about"
              className="text-text-secondary hover:text-accent transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded-sm"
            >
              About
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-bg-secondary py-6">
      <div className="mx-auto max-w-4xl px-4 text-center text-sm text-text-muted">
        &copy; {new Date().getFullYear()} Kurashizu. All rights reserved.
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="edge-glow">
      <body
        className={`${inter.className} flex min-h-screen flex-col bg-bg-primary text-text-primary`}
      >
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}