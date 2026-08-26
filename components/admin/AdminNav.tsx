"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Admin sections. `exact` marks a route that must match on its own rather
 * than by prefix (the dashboard, which would otherwise match everything).
 */
const LINKS: { href: string; label: string; exact?: boolean; also?: string[] }[] =
    [
        { href: "/admin", label: "Overview", exact: true },
        { href: "/admin/posts", label: "Posts", also: ["/admin/editor"] },
        { href: "/admin/media", label: "Media" },
        { href: "/admin/links", label: "Links" },
        { href: "/admin/news", label: "News" },
        { href: "/admin/guestbook", label: "Messages" },
        { href: "/admin/audit", label: "Audit" },
        { href: "/admin/ops", label: "Ops" },
    ];

export function AdminNav() {
    const pathname = usePathname() ?? "";

    return (
        <nav
            className="flex flex-wrap gap-1 overflow-x-auto"
            aria-label="Admin sections"
        >
            {LINKS.map((link) => {
                const active = link.exact
                    ? pathname === link.href
                    : pathname.startsWith(link.href) ||
                      (link.also?.some((p) => pathname.startsWith(p)) ?? false);
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors",
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
