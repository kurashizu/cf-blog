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
				/** Comma-separated host suffixes the relay may reach; "*" disables the check. */
				OMNIPROXY_ALLOW?: string;
			};
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}
	}
}

export {};
