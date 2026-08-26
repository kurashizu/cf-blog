"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
    { href: "/admin", label: "Posts" },
    { href: "/admin/guestbook", label: "Messages" },
    { href: "/admin/audit", label: "Audit" },
];

/**
 * Admin nav. Uses `next/link` (the old raw <a> tags forced a full page
 * reload on every click) and marks the current section.
 */
export function AdminNav() {
    const pathname = usePathname() ?? "";

    return (
        <nav className="flex gap-1" aria-label="Admin sections">
            {LINKS.map((link) => {
                // "/admin" would otherwise match every subsection.
                const active =
                    link.href === "/admin"
                        ? pathname === "/admin" ||
                          pathname.startsWith("/admin/editor")
                        : pathname.startsWith(link.href);
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "rounded-lg px-3 py-1.5 text-sm transition-colors",
                            active
                                ? "bg-accent/10 font-medium text-accent"
                                : "text-text-muted hover:bg-bg-elevated hover:text-text-primary",
                        )}
                    >
                        {link.label}
                    </Link>
                );
            })}
        </nav>
    );
}
