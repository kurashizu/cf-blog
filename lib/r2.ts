import { r2Paths } from './r2-paths';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export interface R2Bucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated?: boolean; cursor?: string }>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
}

function getBucket(): R2Bucket {
  const { env } = getCloudflareContext();
  return env.BUCKET;
}

export async function r2Get(key: string): Promise<string> {
  const bucket = getBucket();
  const object = await bucket.get(key);
  if (!object) throw new Error(`Not found: ${key}`);
  return await object.text();
}

export async function r2List(prefix: string = r2Paths.articlesPrefix): Promise<string[]> {
  const bucket = getBucket();
  let cursor: string | undefined;
  const keys: string[] = [];

  do {
    const result = await bucket.list({ prefix, cursor });
    keys.push(...result.objects.map((o) => o.key));
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  return keys;
}

export async function r2Put(key: string, content: string): Promise<void> {
  const bucket = getBucket();
  await bucket.put(key, content, {
    httpMetadata: {
      contentType: 'text/markdown',
    },
  });
}

export async function r2Delete(key: string): Promise<void> {
  const bucket = getBucket();
  await bucket.delete(key);
}
