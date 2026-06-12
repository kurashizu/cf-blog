/**
 * Cron trigger — runs the full refresh and logs the result.
 * `wrangler.toml` schedules this every 30 minutes.
 */
import { refreshCache } from "../lib/refresh";
import type { Env } from "../types";

export async function handleScheduled(env: Env): Promise<void> {
    console.log("Cron trigger");
    const results = await refreshCache(env);
    console.log("Cache refresh:", results.map((r) => r.line).join(" | "));
}
