/**
 * HTTP handler — accepts:
 *  `POST /__refresh`         full refresh (all caches)
 *  `POST /__heartbeat`       process one pending news item rewrite
 *  `POST /__search-index`    force one search indexing tick
 *  anything else             health check
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`
 */
import { refreshCache } from "../lib/refresh";
import { handleHeartbeat } from "../lib/heartbeat";
import { handleSearchIndexing } from "./search-index";
import type { Env } from "../types";

const REFRESH_PATH = "/__refresh";
const HEARTBEAT_PATH = "/__heartbeat";
const SEARCH_INDEX_PATH = "/__search-index";

export async function handleFetch(
    request: Request,
    env: Env,
): Promise<Response> {
    const url = new URL(request.url);

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

    // ── Search index (process one item, or cleanup if nothing pending) ──
    if (request.method === "POST" && url.pathname === SEARCH_INDEX_PATH) {
        const auth = request.headers.get("Authorization");
        if (env.CRON_SECRET && auth !== `Bearer ${env.CRON_SECRET}`) {
            return new Response("Unauthorized", { status: 401 });
        }

        const result = await handleSearchIndexing(env);
        return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    // ── Heartbeat (process one pending rewrite) ──
    if (request.method === "POST" && url.pathname === HEARTBEAT_PATH) {
        const auth = request.headers.get("Authorization");
        if (env.CRON_SECRET && auth !== `Bearer ${env.CRON_SECRET}`) {
            return new Response("Unauthorized", { status: 401 });
        }

        const result = await handleHeartbeat(env);
        return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    // ── Health check ──
    return new Response("cf-blog-cache worker", { status: 200 });
}
