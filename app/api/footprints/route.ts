import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createFootprintsRepo, deriveFootprint } from "@/lib/footprints";
import { checkBurst, checkDailyKV, getIP } from "@/shared/ratelimiter";
import type { BlogEnv } from "@/lib/types/env";
import { withApiAudit, type ApiAuditContext } from "@/lib/api-audit";

const BURST_LIMIT = 2;
const BURST_PERIOD = 10;
const DAILY_LIMIT = 1;

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
    return withApiAudit(request, "/api/footprints", async (audit) => {
        try {
            const repo = createFootprintsRepo();
            const summary = await repo.getSummary();
            audit.set({ metadata: { total: summary.total } });
            return NextResponse.json(summary, {
                headers: {
                    ...CORS_HEADERS,
                    "Cache-Control": "public, max-age=30",
                },
            });
        } catch (error) {
            console.error("Footprints GET error:", error);
            audit.set({
                errorMessage:
                    error instanceof Error ? error.message : String(error),
            });
            return NextResponse.json(
                { error: "Failed to fetch footprints" },
                { status: 500, headers: CORS_HEADERS },
            );
        }
    });
}

export async function POST(request: NextRequest) {
    return withApiAudit(request, "/api/footprints", (audit) =>
        handleFootprintPost(request, audit),
    );
}

async function handleFootprintPost(
    request: NextRequest,
    audit: ApiAuditContext,
): Promise<Response> {
    try {
        const ctx = getCloudflareContext();
        const env = ctx.env as unknown as BlogEnv;

        const ip = getIP(request);

        // 1. CF Rate Limiter burst check.
        const burstResp = await checkBurst(
            env.GUESTBOOK_RATE_LIMIT,
            ip,
            BURST_LIMIT,
            BURST_PERIOD,
        );
        if (burstResp) {
            audit.set({ metadata: { limit: "burst" } });
            return burstResp;
        }

        // 2. One stamp per IP per day.
        const dailyResp = await checkDailyKV(
            env.SESSION_KV,
            "footprint",
            ip,
            DAILY_LIMIT,
        );
        if (dailyResp) {
            audit.set({ metadata: { limit: "daily" } });
            return NextResponse.json(
                { error: "already" },
                { status: 429, headers: CORS_HEADERS },
            );
        }

        // Everything comes from the edge — the request body (if any) is
        // never read for field values.
        const cf = ctx.cf as
            | { country?: string; timezone?: string; colo?: string }
            | undefined;
        const ua = request.headers.get("user-agent") ?? "";

        const derived = deriveFootprint(cf, ua);
        if (!derived) {
            audit.set({ metadata: { rejected: "no-edge" } });
            return NextResponse.json(
                { error: "no-edge" },
                { status: 503, headers: CORS_HEADERS },
            );
        }

        const repo = createFootprintsRepo();
        const footprint = await repo.add(derived);

        audit.set({
            metadata: { posted: true, country: footprint.country },
        });

        return NextResponse.json(
            { footprint },
            { status: 201, headers: CORS_HEADERS },
        );
    } catch (error) {
        console.error("Footprints POST error:", error);
        return NextResponse.json(
            { error: "Failed to record footprint" },
            { status: 500, headers: CORS_HEADERS },
        );
    }
}
