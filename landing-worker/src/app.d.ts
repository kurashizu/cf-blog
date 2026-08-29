/// <reference types="@cloudflare/workers-types" />
/// <reference types="@webgpu/types" />

declare global {
	namespace App {
		interface Platform {
			env: {
				ASSETS: Fetcher;
				/** Upstream OmniProxy base URL — set per deployment, never hardcoded. */
				OMNIPROXY_URL?: string;
				/** Secret, sent upstream as x-proxy-token; never reaches the browser. */
				OMNIPROXY_TOKEN?: string;
				/** Comma-separated `host` / `host:port` entries the relay may reach; "*" disables the check. */
				OMNIPROXY_ALLOW?: string;
				/** `name|source|size` triples for the VM disk proxy; source is a URL or `r2:<key>`. */
				VM_IMAGES?: string;
				/** Bucket holding the r2:-sourced VM images. */
				VM_BUCKET?: R2Bucket;
				/** Per-IP budget on relay connections. */
				NET_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
			};
			ctx: ExecutionContext;
			/** Workers exposes a default cache alongside the standard API. */
			caches: CacheStorage & { default: Cache };
			cf?: IncomingRequestCfProperties;
		}
	}
}

export {};
