import { getCloudflareContext } from "@opennextjs/cloudflare";

function getBucket() {
    const { env } = getCloudflareContext();
    return env.BUCKET;
}

export async function r2Get(key: string): Promise<string> {
    const bucket = getBucket();
    const object = await bucket.get(key);
    if (!object) throw new Error(`Not found: ${key}`);
    return await object.text();
}
