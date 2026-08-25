/**
 * HTTP handler — accepts:
 *  `POST /__refresh`         full refresh (add `?force=1` to bypass AA freshness)
 *  `POST /__heartbeat`       process one pending news item rewrite
 *  `POST /__search-index`    force one search indexing tick
 *  `POST /__hn-cron`         force one daily HN top-30 fetch
 *  anything else             health check
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Fail-closed: if CRON_SECRET
 * is not configured, every manual endpoint returns 401 (the cron triggers
 * don't go through this handler, so scheduled runs are unaffected).
 */
import { refreshCache } from "../lib/refresh";
import { handleHeartbeat } from "../lib/heartbeat";
import { handleSearchIndexing } from "./search-index";
import { handleHNCron } from "./hn-cron";
import type { Env } from "../types";

function isAuthorized(request: Request, env: Env): boolean {
    const auth = request.headers.get("Authorization");
    return Boolean(env.CRON_SECRET) && auth === `Bearer ${env.CRON_SECRET}`;
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
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
        const results = await refreshCache(env, {
            forceLLM: url.searchParams.get("force") === "1",
        });
        logs.push("Cache refresh:", results.map((r) => r.line).join(" | "));
    } catch (e) {
        success = false;
        logs.push(`FATAL: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        console.log = origLog;
    }

    return json({ success, logs: logs.join("\n") });
}

const ROUTES: Record<string, (request: Request, env: Env) => Promise<Response>> =
    {
        "/__refresh": handleRefresh,
        "/__search-index": async (_request, env) => {
            const result = await handleSearchIndexing(env);
            return json(result, result.ok ? 200 : 500);
        },
        "/__heartbeat": async (_request, env) => {
            const result = await handleHeartbeat(env);
            return json(result, result.ok ? 200 : 500);
        },
        "/__hn-cron": async (_request, env) => {
            try {
                await handleHNCron(env);
                return json({ success: true, message: "HN cron completed" });
            } catch (e) {
                return json(
                    {
                        success: false,
                        error: e instanceof Error ? e.message : String(e),
                    },
                    500,
                );
            }
        },
    };

export async function handleFetch(
    request: Request,
    env: Env,
): Promise<Response> {
    const url = new URL(request.url);
    const route = ROUTES[url.pathname];

    if (request.method === "POST" && route) {
        if (!isAuthorized(request, env)) {
            return new Response("Unauthorized", { status: 401 });
        }
        return route(request, env);
    }

    // ── Health check ──
    return new Response("cf-blog-cache worker", { status: 200 });
}
