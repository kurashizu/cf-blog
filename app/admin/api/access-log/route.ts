/**
 * Admin API — inbound API access log (who called us).
 *
 * GET /admin/api/access-log
 *   ?days=1|7|30|90     (default 7)
 *   &worker=cf-blog|cf-agent
 *   &route=/api/llm
 *   &outcome=ok|rate_limited|unauthorized|bad_request|error
 *   &ip=203.0.113.7
 *   &upstream=1         only requests that made an upstream model/API call
 *   &limit=100          (max 500)
 *   &offset=0
 *
 * Returns `AccessLogPage` — rows, total, summary, top callers, and the
 * route list for the filter dropdown. Query/validation/shape all live in
 * `lib/access-log.ts` so this route and the page can't drift apart.
 */
import { NextRequest, NextResponse } from "next/server";
import { parseAccessLogFilters, queryAccessLog } from "@/lib/access-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const filters = parseAccessLogFilters(request.nextUrl.searchParams);
        const page = await queryAccessLog(filters);
        return NextResponse.json(page);
    } catch (e) {
        console.error("Admin access-log GET error:", e);
        return NextResponse.json(
            { error: "Failed to load access log" },
            { status: 500 },
        );
    }
}
