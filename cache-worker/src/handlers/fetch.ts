/**
 * HTTP handler — accepts:
 *  `POST /__refresh`             full refresh (all caches)
 *  `POST /__refresh-articles`    article-index only (fast, no external API)
 *  anything else                 health check
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`
 */
import { buildArticleIndex } from "../lib/articles";
import { refreshCache } from "../lib/refresh";
import type { Env } from "../types";

const REFRESH_PATH = "/__refresh";
const ARTICLES_ONLY_PATH = "/__refresh-articles";

export async function handleFetch(
    request: Request,
    env: Env,
): Promise<Response> {
    const url = new URL(request.url);

    // ── Articles-only rebuild (fast, no external calls) ──
    if (request.method === "POST" && url.pathname === ARTICLES_ONLY_PATH) {
        const auth = request.headers.get("Authorization");
        if (env.CRON_SECRET && auth !== `Bearer ${env.CRON_SECRET}`) {
            return new Response("Unauthorized", { status: 401 });
        }
        try {
            const posts = await buildArticleIndex(env.BUCKET);
            await env.BUCKET.put(
                "cache/articles-index.json",
                JSON.stringify(posts),
            );
            return new Response(
                JSON.stringify({
                    success: true,
                    count: posts.length,
                    message: "Articles index rebuilt",
                }),
                { headers: { "Content-Type": "application/json" } },
            );
        } catch (e) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: e instanceof Error ? e.message : String(e),
                }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                },
            );
        }
    }

    // ── Full refresh ──
    if (request.method === "POST" && url.pathname === REFRESH_PATH) {
        const auth = request.headers.get("Authorization");
        if (env.CRON_SECRET && auth !== `Bearer ${env.CRON_SECRET}`) {
            return new Response("Unauthorized", { status: 401 });
        }

        const logs: string[] = [];
        const origLog = console.log;
        console.log = (...args: unknown[]) => {
            logs.push(
                args
                    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
                    .join(" "),
            );
        };

        let success = true;
        try {
            const results = await refreshCache(env);
            logs.push("Cache refresh:", results.map((r) => r.line).join(" | "));
        } catch (e) {
            success = false;
            logs.push(`FATAL: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            console.log = origLog;
        }

        return new Response(
            JSON.stringify({ success, logs: logs.join("\n") }, null, 2),
            { headers: { "Content-Type": "application/json" } },
        );
    }

    // ── Health check ──
    return new Response("cf-blog-cache worker", { status: 200 });
}
