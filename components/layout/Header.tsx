"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="hidden md:block sticky top-0 z-40 bg-bg-primary/80 backdrop-blur-md border-b border-border">
      <nav className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="text-xl font-bold text-accent hover:text-accent-light transition-colors"
        >
          Kurashizu
        </Link>

        <ul className="flex items-center gap-6">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={clsx(
                    "text-sm font-medium transition-colors relative group",
                    isActive
                      ? "text-accent"
                      : "text-text-secondary hover:text-accent"
                  )}
                >
                  {link.label}
                  <span
                    className={clsx(
                      "absolute -bottom-1 left-0 h-0.5 bg-accent transition-all duration-200",
                      isActive ? "w-full" : "w-0 group-hover:w-full"
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
