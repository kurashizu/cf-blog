import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { TOOLS, FUNCTION_DECLARATIONS, executeTool } from "@/lib/tools";
import { checkBurst, checkDailyKV, getIP } from "@/lib/ratelimiter";
import type { AgentEnv } from "../../../../lib/types/env";

export const dynamic = "force-dynamic";

const BURST_LIMIT = 10;
const BURST_PERIOD = 10;
const DAILY_LIMIT = 200;

/**
 * GET /api/tool — list all tools
 */
export async function GET() {
    return NextResponse.json(
        {
            tools: TOOLS,
            functionDeclarations: FUNCTION_DECLARATIONS,
        },
        {
            headers: {
                "Access-Control-Allow-Origin": "*",
            },
        },
    );
}

/**
 * POST /api/tool — execute a tool directly
 */
export async function POST(request: NextRequest) {
    try {
        const ctx = getCloudflareContext();
        const env = ctx.env as unknown as AgentEnv;

        const ip = getIP(request);

        // 1. CF Rate Limiter burst check (10/10s)
        const burstResp = await checkBurst(
            env.TOOL_RATE_LIMIT,
            ip,
            BURST_LIMIT,
            BURST_PERIOD,
        );
        if (burstResp) return burstResp;

        // 2. KV daily check (200/IP)
        const dailyResp = await checkDailyKV(
            env.SESSION_KV,
            "tool",
            ip,
            DAILY_LIMIT,
        );
        if (dailyResp) return dailyResp;

        const body = (await request.json()) as {
            name?: string;
            args?: Record<string, unknown>;
        };
        const { name, args = {} } = body;

        if (typeof name !== "string") {
            return NextResponse.json(
                { success: false, error: "name is required" },
                { status: 400 },
            );
        }

        const result = await executeTool(name, args);

        return NextResponse.json({
            success: true,
            tool: name,
            result,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
        );
    }
}
