/**
 * HTTP handler — accepts a `POST /__refresh` with `Authorization: Bearer
 * <CRON_SECRET>` and returns a JSON summary of each cache step. Any other
 * path returns a tiny health-check response.
 */
import { refreshCache } from "../lib/refresh";
import type { Env } from "../types";

const REFRESH_PATH = "/__refresh";

export async function handleFetch(
    request: Request,
    env: Env,
): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== REFRESH_PATH) {
        return new Response("cf-blog-cache worker", { status: 200 });
    }

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
