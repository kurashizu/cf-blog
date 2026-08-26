/**
 * Admin API — operational health of the D1-backed pipelines.
 *
 * GET  /admin/api/ops   → `OpsSnapshot`: cache-entry freshness, search-index
 *                         backlog, the exact head of each cron queue, and
 *                         cron liveness derived from `audit_log`.
 * POST /admin/api/ops   body { action: "reset-stalled-news" |
 *                              "reset-news-retries" } → { action, changed }
 *
 * There is deliberately no "run the cron now" endpoint: cf-blog cannot reach
 * `cf-blog-cache` (cron-only worker, no route, no service binding, no
 * CRON_SECRET in this worker's env). The POST actions here are D1 writes
 * that change what the NEXT scheduled tick will pick up. See `lib/ops.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { getOpsSnapshot, isOpsAction, runOpsAction } from "@/lib/ops";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const snapshot = await getOpsSnapshot();
        return NextResponse.json(snapshot);
    } catch (e) {
        console.error("Admin ops GET error:", e);
        return NextResponse.json(
            { error: "Failed to load ops snapshot" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => null)) as {
            action?: unknown;
        } | null;

        if (!isOpsAction(body?.action)) {
            return NextResponse.json(
                { error: "Unknown maintenance action" },
                { status: 400 },
            );
        }

        const changed = await runOpsAction(body.action);
        return NextResponse.json({ action: body.action, changed });
    } catch (e) {
        console.error("Admin ops POST error:", e);
        return NextResponse.json(
            { error: "Maintenance action failed" },
            { status: 500 },
        );
    }
}
