import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getDB(): D1Database {
    const { env } = getCloudflareContext();
    return (env as unknown as { DB: D1Database }).DB;
}
