/**
 * Admin API — manually purge old audit_log rows.
 *
 * POST /admin/api/audit/cleanup
 *   body: { days: number }   // delete rows with ts older than `days`
 *
 * The 30-min refresh cron already auto-prunes to 30 days. This endpoint
 * exists for ad-hoc cleanup (e.g. reset after quota exhaustion).
 * Requires days >= 1.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json().catch(() => ({}))) as {
            days?: number;
        };
        const days = Math.floor(Number(body.days));

        if (!Number.isFinite(days) || days < 1) {
            return NextResponse.json(
                { error: "days must be a positive integer" },
                { status: 400 },
            );
        }

        const { env } = getCloudflareContext();
        const cfEnv = env as unknown as { DB: D1Database };

        const before = await cfEnv.DB.prepare(
            "SELECT COUNT(*) AS n FROM audit_log WHERE ts < datetime('now', ?)",
        )
            .bind(`-${days} days`)
            .first<{ n: number }>();

        await cfEnv.DB.prepare(
            "DELETE FROM audit_log WHERE ts < datetime('now', ?)",
        )
            .bind(`-${days} days`)
            .run();

        return NextResponse.json({
            deleted: before?.n ?? 0,
            older_than_days: days,
        });
    } catch (e) {
        console.error("Admin audit cleanup error:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }
}
