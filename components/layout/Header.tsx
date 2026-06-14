"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/providers/ThemeProvider";
import { SearchBar } from "@/components/search/SearchBar";
import icon2 from "@/public/icons/icon2_128.png";

const navLinks = [
    { href: "/", label: "Home" },
    { href: "/news", label: "News" },
    { href: "/blog", label: "Blog" },
    { href: "/about", label: "About" },
];

export function Header() {
    const pathname = usePathname();
    const { theme, toggleTheme } = useTheme();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const onResize = () => {
            if (window.innerWidth >= 768) setMobileMenuOpen(false);
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    return (
        <header className="site-header sticky top-0 z-50 backdrop-blur-xl bg-bg-primary/80">
            <nav className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
                <Link
                    href="/"
                    className="group flex items-center gap-2 shrink-0"
                >
                    <div className="w-8 h-8 rounded-full overflow-hidden border border-accent/50 shrink-0">
                        <Image
                            src={icon2}
                            alt="logo"
                            width={32}
                            height={32}
                            className="object-cover"
                        />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span
                            className="text-lg md:text-xl font-bold italic tracking-wide truncate"
                            style={{
                                fontFamily:
                                    "'Playfair Display', 'Georgia', serif",
                                background:
                                    "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 50%, var(--text-primary) 100%)",
                                backgroundSize: "200% 200%",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text",
                                animation: "gradient-flow 4s ease infinite",
                            }}
                        >
                            Kurashizu Blog
                        </span>
                        <span className="text-[10px] font-medium text-text-muted tracking-widest uppercase -mt-1 hidden sm:block">
                            where ideas flow
                        </span>
                    </div>
                </Link>

                <div className="flex items-center gap-1 md:gap-2">
                    <div className="hidden md:block">
                        <SearchBar variant="icon" />
                    </div>
                    <ul className="hidden md:flex items-center gap-1">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <li key={link.href}>
                                    <Link
                                        href={link.href}
                                        className={`
                      relative px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200
                      ${
                          isActive
                              ? "text-accent"
                              : "text-text-secondary hover:text-accent hover:bg-accent-subtle"
                      }
                    `}
                                    >
                                        {link.label}
                                        {isActive && (
                                            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-accent rounded-full" />
                                        )}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="md:hidden">
                        <SearchBar variant="icon" />
                    </div>

                    <button
                        onClick={toggleTheme}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-card border border-border hover:border-accent transition-all duration-200 shrink-0"
                        title={`Switch theme (current: ${theme})`}
                    >
                        {theme === "dark" ? (
                            <svg
                                className="w-4 h-4 text-accent"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                                />
                            </svg>
                        ) : theme === "deep-blue" ? (
                            <svg
                                className="w-4 h-4 text-accent"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                                />
                            </svg>
                        ) : (
                            <svg
                                className="w-4 h-4 text-accent"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        )}
                    </button>

                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-bg-card border border-border hover:border-accent transition-all duration-200 shrink-0"
                        aria-label="Toggle menu"
                    >
                        {mobileMenuOpen ? (
                            <svg
                                className="w-4 h-4 text-accent"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        ) : (
                            <svg
                                className="w-4 h-4 text-accent"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 6h16M4 12h16M4 18h16"
                                />
                            </svg>
                        )}
                    </button>
                </div>
            </nav>

            {mobileMenuOpen && (
                <div className="md:hidden border-t border-border bg-bg-primary/95 backdrop-blur-xl">
                    <ul className="flex flex-col px-4 py-2">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <li key={link.href}>
                                    <Link
                                        href={link.href}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={`block px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                                            isActive
                                                ? "text-accent"
                                                : "text-text-secondary hover:text-accent"
                                        }`}
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </header>
    );
}
