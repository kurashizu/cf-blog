"use client";

import { usePathname } from "next/navigation";

/**
 * Renders the public site chrome everywhere except `/admin`.
 *
 * The root layout wraps every route, so the admin panel used to get the
 * public header, footer, chat/guestbook widgets and the animated canvases
 * on top of its own header — two headers, a nested <main>, and particle
 * rain repainting behind a data table.
 */
export function PublicChrome({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    if (pathname?.startsWith("/admin")) return null;
    return <>{children}</>;
}

/** True inside the admin panel — for layout tweaks the chrome can't express. */
export function useIsAdmin(): boolean {
    const pathname = usePathname();
    return Boolean(pathname?.startsWith("/admin"));
}
