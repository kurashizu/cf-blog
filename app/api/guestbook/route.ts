import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createGuestbookRepo } from "@/lib/guestbook";
import { checkBurst, checkDailyKV, getIP } from "@/shared/ratelimiter";
import type { BlogEnv } from "@/lib/types/env";
import { withApiAudit, type ApiAuditContext } from "@/lib/api-audit";

const BURST_LIMIT = 2;
const BURST_PERIOD = 10;
const DAILY_LIMIT = 5;

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function sanitize(str: string): string {
    return str
        .replace(/<[^>]*>/g, "")
        .replace(/javascript:/gi, "")
        .replace(/on\w+=/gi, "")
        .trim();
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
    return withApiAudit(request, "/api/guestbook", async (audit) => {
        try {
            const repo = createGuestbookRepo();
            const messages = await repo.getAll();
            audit.set({ metadata: { returned: messages.length } });
            return NextResponse.json({ messages }, { headers: CORS_HEADERS });
        } catch (error) {
            console.error("Guestbook GET error:", error);
            audit.set({
                errorMessage:
                    error instanceof Error ? error.message : String(error),
            });
            return NextResponse.json(
                { error: "Failed to fetch messages" },
                { status: 500, headers: CORS_HEADERS },
            );
        }
    });
}

export async function POST(request: NextRequest) {
    return withApiAudit(request, "/api/guestbook", (audit) =>
        handleGuestbookPost(request, audit),
    );
}

async function handleGuestbookPost(
    request: NextRequest,
    audit: ApiAuditContext,
): Promise<Response> {
    try {
        const ctx = getCloudflareContext();
        const env = ctx.env as unknown as BlogEnv;

        const ip = getIP(request);

        // 1. CF Rate Limiter burst check (2/10s)
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

        // 2. KV daily check (5/IP)
        const dailyResp = await checkDailyKV(
            env.SESSION_KV,
            "guestbook",
            ip,
            DAILY_LIMIT,
        );
        if (dailyResp) {
            audit.set({ metadata: { limit: "daily" } });
            return dailyResp;
        }

        const body = (await request.json()) as {
            name?: string;
            content?: string;
            email?: string;
            website?: string;
        };
        const { name, content, email, website } = body;

        // Honeypot check
        if (website) {
            // Worth flagging explicitly: a filled honeypot is a bot, and
            // the access row is how you spot a campaign from one ASN.
            audit.set({ metadata: { rejected: "honeypot" } });
            return NextResponse.json(
                { error: "Invalid submission" },
                { status: 400, headers: CORS_HEADERS },
            );
        }

        // Validation
        if (!name || name.trim().length < 1 || name.trim().length > 100) {
            return NextResponse.json(
                { error: "Name must be 1-100 characters" },
                { status: 400, headers: CORS_HEADERS },
            );
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json(
                { error: "Valid email is required" },
                { status: 400, headers: CORS_HEADERS },
            );
        }
        if (
            !content ||
            content.trim().length < 1 ||
            content.trim().length > 2000
        ) {
            return NextResponse.json(
                { error: "Content must be 1-2000 characters" },
                { status: 400, headers: CORS_HEADERS },
            );
        }

        const repo = createGuestbookRepo();
        const message = await repo.add({
            name: sanitize(name),
            content: sanitize(content),
            email: email?.trim(),
        });

        audit.set({ metadata: { posted: true, name_len: name.trim().length } });

        // Never echo the email back — the public GET omits it too.
        const { email: _omitted, ...publicMessage } = message;
        return NextResponse.json(
            { message: publicMessage },
            { status: 201, headers: CORS_HEADERS },
        );
    } catch (error) {
        console.error("Guestbook POST error:", error);
        return NextResponse.json(
            { error: "Failed to post message" },
            { status: 500, headers: CORS_HEADERS },
        );
    }
}
