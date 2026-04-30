import { r2Paths } from './r2-paths';

export interface R2Client {
  get(key: string): Promise<string>;
  list(prefix?: string): Promise<string[]>;
  put(key: string, content: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface R2Bucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{ objects: { key: string }[]; truncated?: boolean; cursor?: string }>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export interface Env {
  BUCKET: R2Bucket;
}

export function createR2Client(env: Env): R2Client {
  const bucket = env.BUCKET;

  return {
    async get(key: string): Promise<string> {
      const object = await bucket.get(key);
      if (!object) throw new Error(`Not found: ${key}`);
      return await object.text();
    },

    async list(prefix: string = r2Paths.articlesPrefix): Promise<string[]> {
      let cursor: string | undefined;
      const keys: string[] = [];

      do {
        const result = await bucket.list({ prefix, cursor });
        keys.push(...result.objects.map((o) => o.key));
        cursor = result.truncated ? result.cursor : undefined;
      } while (cursor);

      return keys;
    },

    async put(key: string, content: string): Promise<void> {
      await bucket.put(key, content, {
        httpMetadata: {
          contentType: 'text/markdown',
        },
      });
    },

    async delete(key: string): Promise<void> {
      await bucket.delete(key);
    },
  };
}
