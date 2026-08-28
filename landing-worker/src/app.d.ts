/// <reference types="@cloudflare/workers-types" />

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
				/** `name|url|size` triples for the VM disk proxy. */
				VM_IMAGES?: string;
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
