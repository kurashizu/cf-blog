"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/providers/ThemeProvider";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

export function Header() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-bg-primary/80 border-b border-border/50">
      <nav className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="group flex flex-col items-center">
          <span
            className="text-xl font-bold italic tracking-wide"
            style={{
              fontFamily: "'Playfair Display', 'Georgia', serif",
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 50%, var(--text-primary) 100%)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'gradient-flow 4s ease infinite',
            }}
          >
            Kurashizu Blog
          </span>
          <span className="text-[10px] font-medium text-text-muted tracking-widest uppercase -mt-1">
            where ideas flow
          </span>
          <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent transition-all duration-500 group-hover:w-full" />
        </Link>

        <div className="flex items-center gap-4">
          <ul className="flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`
                      relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200
                      ${isActive
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

          <button
            onClick={toggleTheme}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-card border border-border hover:border-accent transition-all duration-200"
            title={`Switch to ${theme === "dark" ? "deep blue" : "dark"} theme`}
          >
            {theme === "dark" ? (
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </nav>
    </header>
  );
}
