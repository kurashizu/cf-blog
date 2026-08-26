/**
 * Admin API — the HN news archive (`news_items`).
 *
 * GET /admin/api/news
 *   ?filter=all|has-summary|awaiting-rewrite|failed|stalled|never-indexed
 *   &q=substring          matched against title and domain
 *   &limit=50             (max 200)
 *   &offset=0
 *
 * Returns `NewsPage` — rows, total for the current filter, and the
 * table-wide pipeline counters. Query/validation/shape live in
 * `lib/news.ts` so this route and the page can't drift apart.
 */
import { NextRequest, NextResponse } from "next/server";
import { parseNewsFilters, queryNewsPage } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const filters = parseNewsFilters(request.nextUrl.searchParams);
        const page = await queryNewsPage(filters);
        return NextResponse.json(page);
    } catch (e) {
        console.error("Admin news GET error:", e);
        return NextResponse.json(
            { error: "Failed to load news items" },
            { status: 500 },
        );
    }
}
