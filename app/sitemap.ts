import type { MetadataRoute } from "next";
import { getDB } from "@/lib/d1";
import { BLOG_URL } from "@/shared/site-config";

const SITE_URL = BLOG_URL;

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const staticPages: MetadataRoute.Sitemap = [
        { url: SITE_URL, changeFrequency: "daily", priority: 1.0 },
        { url: `${SITE_URL}/blog`, changeFrequency: "daily", priority: 0.8 },
        { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
        { url: `${SITE_URL}/news`, changeFrequency: "daily", priority: 0.6 },
        { url: `${SITE_URL}/search`, changeFrequency: "monthly", priority: 0.3 },
    ];

    let blogPages: MetadataRoute.Sitemap = [];
    let newsPages: MetadataRoute.Sitemap = [];

    try {
        const db = getDB();

        const postRows = await db
            .prepare(
                "SELECT slug, published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 50",
            )
            .all<{ slug: string; published_at: string }>();

        blogPages = (postRows.results ?? []).map((row) => ({
            url: `${SITE_URL}/blog/${row.slug}`,
            lastModified: row.published_at
                ? new Date(row.published_at)
                : undefined,
            changeFrequency: "weekly" as const,
            priority: 0.7,
        }));

        const newsRows = await db
            .prepare(
                "SELECT id, time FROM news_items ORDER BY time DESC LIMIT 50",
            )
            .all<{ id: number; time: number }>();

        newsPages = (newsRows.results ?? []).map((row) => ({
            url: `${SITE_URL}/news/${row.id}`,
            lastModified: row.time
                ? new Date(row.time * 1000)
                : undefined,
            changeFrequency: "daily" as const,
            priority: 0.4,
        }));
    } catch {
        // DB unavailable (local dev without D1 binding) — serve static pages only
    }

    return [...staticPages, ...blogPages, ...newsPages];
}
