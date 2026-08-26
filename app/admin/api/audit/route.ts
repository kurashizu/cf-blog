/**
 * Admin API — outbound API call audit (`audit_log`).
 *
 * GET /admin/api/audit
 *   ?category=embedding|vectorize|gemini_generate|github|aa|hn|refresh|other
 *   &status=ok|failed|skipped
 *   &days=1|7|30|90   (default 7)
 *   &limit=100        (max 500)
 *   &offset=0
 *
 * Returns `AuditPage`. Query, validation and row shape live in
 * `lib/audit-log.ts` and are shared with the admin page.
 *
 * Audit writes from cache-worker flow into the same table, so this view
 * shows every worker's outbound calls. For INBOUND requests (who called
 * us) see `/admin/api/access-log`.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseAuditFilters, queryAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const filters = parseAuditFilters(request.nextUrl.searchParams);
        const page = await queryAuditLog(filters);
        return NextResponse.json(page);
    } catch (e) {
        console.error("Admin audit GET error:", e);
        return NextResponse.json(
            { error: "Failed to load audit log" },
            { status: 500 },
        );
    }
}
