/**
 * Article content API — returns full Markdown for a blog post by slug.
 *
 * GET /api/articles/{slug}?offset=0&maxLength=16000
 *
 * Reads content from D1 `posts.content` (frontmatter already stripped).
 * The agent's blog_read tool uses this endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug || slug.length === 0) {
        return NextResponse.json(
            { error: "Slug is required" },
            { status: 400 },
        );
    }

    const offset = Math.max(
        0,
        parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10),
    );
    const maxLength = Math.min(
        parseInt(request.nextUrl.searchParams.get("maxLength") ?? "16000", 10),
        64000,
    );

    try {
        const { env } = getCloudflareContext();
        const cfEnv = env as unknown as { DB: D1Database };

        const row = await cfEnv.DB.prepare(
            `SELECT slug, title, excerpt, content, tags, published_at
             FROM posts WHERE id = ?`,
        )
            .bind(slug)
            .first<{
                slug: string;
                title: string;
                excerpt: string;
                content: string;
                tags: string;
                published_at: string;
            }>();

        if (!row) {
            return NextResponse.json(
                { error: "Article not found" },
                { status: 404 },
            );
        }

        const body = row.content || "";
        const slice = body.slice(offset, offset + maxLength);
        const has_more = offset + maxLength < body.length;

        let tags: string[] = [];
        try {
            tags = JSON.parse(row.tags);
        } catch {
            tags = [];
        }

        return NextResponse.json({
            slug: row.slug,
            title: row.title || slug,
            description: row.excerpt || "",
            tags,
            published_at: row.published_at || "",
            content: slice,
            offset,
            max_length: maxLength,
            total_length: body.length,
            has_more,
            next_offset: has_more ? offset + maxLength : undefined,
        });
    } catch (e) {
        console.error("Article API error:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
        );
    }
}
