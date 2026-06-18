import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getDB(): D1Database {
    const { env } = getCloudflareContext();
    return (env as unknown as { DB: D1Database }).DB;
}

/** Read a JSON value from the cache_entries table by key. */
export async function getCacheEntry<T>(key: string): Promise<T | null> {
    try {
        const db = getDB();
        const row = await db
            .prepare(`SELECT value FROM cache_entries WHERE key = ?`)
            .bind(key)
            .first<{ value: string }>();
        if (!row) return null;
        return JSON.parse(row.value) as T;
    } catch {
        return null;
    }
}
