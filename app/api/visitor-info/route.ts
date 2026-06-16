import { NextRequest, NextResponse } from "next/server";
import { getVisitorInfo, getLogoFilename } from "@/lib/visitor";

/**
 * Returns geolocation and device info for the calling visitor.
 *
 * Called from the client (VisitorTerminal's useEffect) AFTER the home page has
 * finished loading. This is intentionally NOT called during SSR — it would
 * block the first byte behind a third-party API call (ip-api.com, 3 s
 * timeout) and would force the page into dynamic rendering.
 *
 * Browser cache: 1 hour. Each visitor triggers at most one ip-api.com call
 * per hour, regardless of how many times they reload the page. Different
 * visitors each get their own cache entry, so cache hits don't leak data.
 *
 * Response body is `{ visitorInfo }` with geo fields, device fields, and
 * the raw ASCII logo text (fastfetch small format with $N color markers).
 */
const BROWSER_CACHE_SECONDS = 3600;

/**
 * Fetch a small logo text file from the public directory.
 */
async function loadLogo(
    filename: string,
    request: NextRequest,
): Promise<string> {
    if (!filename) return "";
    try {
        const url = new URL(`/fastfetch-logos/${filename}`, request.url);
        const res = await fetch(url.toString());
        if (!res.ok) return "";
        return await res.text();
    } catch {
        return "";
    }
}

export async function GET(request: NextRequest) {
    const ip =
        request.headers.get("cf-connecting-ip") ??
        request.headers.get("x-real-ip") ??
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "";

    const ua = request.headers.get("user-agent") ?? "";

    const visitorInfo = await getVisitorInfo(ip, ua);

    // Load the matching small logo ASCII art
    const logoFilename = getLogoFilename(visitorInfo.os);
    visitorInfo.logo = await loadLogo(logoFilename, request);

    return NextResponse.json(
        { visitorInfo },
        {
            headers: {
                "Cache-Control": `private, max-age=${BROWSER_CACHE_SECONDS}`,
            },
        },
    );
}
