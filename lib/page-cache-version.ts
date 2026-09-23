import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { BlogEnv } from "@/lib/types/env";
import { VERSION_KEY } from "@/lib/edge-page-cache";

/**
 * Invalidate every cached page (see worker.ts). Called after an admin write
 * that changes public content. A failure only leaves pages stale until their
 * TTL, so it is logged rather than failing the save that already succeeded.
 */
export async function bumpPageCacheVersion(): Promise<void> {
    try {
        const env = getCloudflareContext().env as unknown as BlogEnv;
        await env.SESSION_KV.put(VERSION_KEY, Date.now().toString(36));
    } catch (e) {
        console.error("page cache version bump failed", e);
    }
}
