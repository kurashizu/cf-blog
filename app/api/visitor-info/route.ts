import { NextRequest, NextResponse } from "next/server";
import { getVisitorInfo } from "@/lib/visitor";

/**
 * Returns geolocation for the calling visitor.
 *
 * Called from the client (HeroHeader's useEffect) AFTER the home page has
 * finished loading. This is intentionally NOT called during SSR — it would
 * block the first byte behind a third-party API call (ip-api.com, 3 s
 * timeout) and would force the page into dynamic rendering.
 *
 * Browser cache: 1 hour. Each visitor triggers at most one ip-api.com call
 * per hour, regardless of how many times they reload the page. Different
 * visitors each get their own cache entry, so cache hits don't leak data.
 *
 * Response body is `{ visitorInfo }` (matches the prop name HeroHeader used
 * to receive from the server).
 */
const BROWSER_CACHE_SECONDS = 3600;

export async function GET(request: NextRequest) {
    const ip =
        request.headers.get("cf-connecting-ip") ??
        request.headers.get("x-real-ip") ??
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "";

    const visitorInfo = await getVisitorInfo(ip);

    return NextResponse.json(
        { visitorInfo },
        {
            headers: {
                "Cache-Control": `private, max-age=${BROWSER_CACHE_SECONDS}`,
            },
        },
    );
}
