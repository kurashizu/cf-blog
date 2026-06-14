/**
 * Article content API — returns full Markdown for a blog post by slug.
 *
 * GET /api/articles/{slug}?offset=0&maxLength=16000
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
        const cfEnv = env as unknown as { BUCKET: R2Bucket };

        const obj = await cfEnv.BUCKET.get(`articles/${slug}.md`);
        if (!obj) {
            return NextResponse.json(
                { error: "Article not found" },
                { status: 404 },
            );
        }

        const fullContent = await obj.text();

        // Parse frontmatter (title, date, etc.)
        const frontmatterMatch = fullContent.match(
            /^---\n([\s\S]*?)\n---\n([\s\S]*)$/,
        );
        let frontmatter: Record<string, string> = {};
        let body = fullContent;

        if (frontmatterMatch) {
            const raw = frontmatterMatch[1];
            body = frontmatterMatch[2];
            for (const line of raw.split("\n")) {
                const sep = line.indexOf(":");
                if (sep > 0) {
                    const key = line.slice(0, sep).trim();
                    const val = line
                        .slice(sep + 1)
                        .trim()
                        .replace(/^["']|["']$/g, "");
                    frontmatter[key] = val;
                }
            }
        }

        const slice = body.slice(offset, offset + maxLength);
        const has_more = offset + maxLength < body.length;

        return NextResponse.json({
            slug,
            title: frontmatter.title || slug,
            description: frontmatter.description || "",
            tags: frontmatter.tags
                ? frontmatter.tags.split(",").map((t: string) => t.trim())
                : [],
            published_at: frontmatter.date || frontmatter.published_at || "",
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
