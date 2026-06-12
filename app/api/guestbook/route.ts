import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createGuestbookRepo } from "@/lib/guestbook";
import { checkBurst, checkDailyKV, getIP } from "@/lib/ratelimiter";
import type { BlogEnv } from "@/lib/types/env";

const BURST_LIMIT = 2;
const BURST_PERIOD = 10;
const DAILY_LIMIT = 5;

function sanitize(str: string): string {
    return str
        .replace(/<[^>]*>/g, "")
        .replace(/javascript:/gi, "")
        .replace(/on\w+=/gi, "")
        .trim();
}

export async function GET() {
    try {
        const repo = createGuestbookRepo();
        const messages = await repo.getAll();
        return NextResponse.json({ messages });
    } catch (error) {
        console.error("Guestbook GET error:", error);
        return NextResponse.json(
            { error: "Failed to fetch messages" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
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
        if (burstResp) return burstResp;

        // 2. KV daily check (5/IP)
        const dailyResp = await checkDailyKV(
            env.SESSION_KV,
            "guestbook",
            ip,
            DAILY_LIMIT,
        );
        if (dailyResp) return dailyResp;

        const body = (await request.json()) as {
            name?: string;
            content?: string;
            email?: string;
            website?: string;
        };
        const { name, content, email, website } = body;

        // Honeypot check
        if (website) {
            return NextResponse.json(
                { error: "Invalid submission" },
                { status: 400 },
            );
        }

        // Validation
        if (!name || name.trim().length < 1 || name.trim().length > 100) {
            return NextResponse.json(
                { error: "Name must be 1-100 characters" },
                { status: 400 },
            );
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json(
                { error: "Valid email is required" },
                { status: 400 },
            );
        }
        if (
            !content ||
            content.trim().length < 1 ||
            content.trim().length > 2000
        ) {
            return NextResponse.json(
                { error: "Content must be 1-2000 characters" },
                { status: 400 },
            );
        }

        const repo = createGuestbookRepo();
        const message = await repo.add({
            name: sanitize(name),
            content: sanitize(content),
            email: email?.trim(),
        });

        return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
        console.error("Guestbook POST error:", error);
        return NextResponse.json(
            { error: "Failed to post message" },
            { status: 500 },
        );
    }
}
