/**
 * Admin API — one news item.
 *
 * GET    /admin/api/news/:id            → { item }  (full summary body)
 * PATCH  /admin/api/news/:id            body { summary: string }  → { item }
 * POST   /admin/api/news/:id            body { action: "requeue-rewrite" |
 *                                              "requeue-index" } → { item }
 * DELETE /admin/api/news/:id            → { success: true, id }
 *
 * Requeue is a D1 write, not an RPC: the cron handlers select their work
 * straight out of `news_items`, so clearing an item's summary / indexing
 * state IS the requeue. See the reachability note in `lib/ops.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import {
    deleteNewsItem,
    getNewsItem,
    requeueNewsItem,
    updateNewsSummary,
    type RequeueMode,
} from "@/lib/news";

export const dynamic = "force-dynamic";

/** `news_items.id` is an INTEGER PK — a non-numeric id would bind NaN. */
function parseId(raw: string): number | null {
    const id = Number.parseInt(raw, 10);
    return Number.isFinite(id) ? id : null;
}

const NOT_FOUND = { error: "News item not found" };
const BAD_ID = { error: "Invalid news id" };

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const id = parseId((await params).id);
        if (id === null) return NextResponse.json(BAD_ID, { status: 400 });

        const item = await getNewsItem(id);
        if (!item) return NextResponse.json(NOT_FOUND, { status: 404 });
        return NextResponse.json({ item });
    } catch (e) {
        console.error("Admin news GET error:", e);
        return NextResponse.json(
            { error: "Failed to load news item" },
            { status: 500 },
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const id = parseId((await params).id);
        if (id === null) return NextResponse.json(BAD_ID, { status: 400 });

        const body = (await request.json().catch(() => null)) as {
            summary?: unknown;
        } | null;
        if (typeof body?.summary !== "string") {
            return NextResponse.json(
                { error: "summary must be a string" },
                { status: 400 },
            );
        }

        const item = await updateNewsSummary(id, body.summary);
        if (!item) return NextResponse.json(NOT_FOUND, { status: 404 });
        return NextResponse.json({ item });
    } catch (e) {
        console.error("Admin news PATCH error:", e);
        return NextResponse.json(
            { error: "Failed to update summary" },
            { status: 500 },
        );
    }
}

const REQUEUE_MODES: Record<string, RequeueMode> = {
    "requeue-rewrite": "rewrite",
    "requeue-index": "index",
};

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const id = parseId((await params).id);
        if (id === null) return NextResponse.json(BAD_ID, { status: 400 });

        const body = (await request.json().catch(() => null)) as {
            action?: unknown;
        } | null;
        const mode =
            typeof body?.action === "string"
                ? REQUEUE_MODES[body.action]
                : undefined;
        if (!mode) {
            return NextResponse.json(
                {
                    error: `action must be one of: ${Object.keys(REQUEUE_MODES).join(", ")}`,
                },
                { status: 400 },
            );
        }

        const item = await requeueNewsItem(id, mode);
        if (!item) return NextResponse.json(NOT_FOUND, { status: 404 });
        return NextResponse.json({ item });
    } catch (e) {
        console.error("Admin news requeue error:", e);
        return NextResponse.json(
            { error: "Failed to requeue news item" },
            { status: 500 },
        );
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const id = parseId((await params).id);
        if (id === null) return NextResponse.json(BAD_ID, { status: 400 });

        const deleted = await deleteNewsItem(id);
        if (!deleted) return NextResponse.json(NOT_FOUND, { status: 404 });
        return NextResponse.json({ success: true, id });
    } catch (e) {
        console.error("Admin news DELETE error:", e);
        return NextResponse.json(
            { error: "Failed to delete news item" },
            { status: 500 },
        );
    }
}
