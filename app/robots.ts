import type { MetadataRoute } from "next";
import { BLOG_URL } from "@/shared/site-config";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
        },
        sitemap: `${BLOG_URL}/sitemap.xml`,
    };
}
