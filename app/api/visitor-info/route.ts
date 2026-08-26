import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getVisitorInfo, type VisitorGeo } from "@/lib/visitor";
import { withApiAudit } from "@/lib/api-audit";

/**
 * Returns geolocation and device info for the calling visitor.
 *
 * Called from the client (VisitorTerminal's useEffect) AFTER the home page
 * has finished loading. This is intentionally NOT called during SSR — it
 * would force the page into dynamic rendering.
 *
 * Geo data comes from Cloudflare's `request.cf` properties, resolved at the
 * edge — no third-party lookup, no visitor IP leaves our infrastructure.
 * In local dev `cf` is undefined and geo fields come back empty.
 *
 * Browser cache: 1 hour, private — each visitor caches only their own info.
 */
const BROWSER_CACHE_SECONDS = 3600;

export async function GET(request: NextRequest) {
    // Audited like every other route. Note this one fires once per visitor
    // per hour (browser-cached), so its rows double as the site's visit log
    // — the highest-volume writer into api_access_log.
    return withApiAudit(request, "/api/visitor-info", async () => {
        const ip =
            request.headers.get("cf-connecting-ip") ??
            request.headers.get("x-real-ip") ??
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            "";

        const ua = request.headers.get("user-agent") ?? "";
        const { cf } = getCloudflareContext();
        const visitorInfo = getVisitorInfo(ip, ua, cf as VisitorGeo | undefined);

        return NextResponse.json(
            { visitorInfo },
            {
                headers: {
                    "Cache-Control": `private, max-age=${BROWSER_CACHE_SECONDS}`,
                },
            },
        );
    });
}
