/**
 * Centralized Cloudflare binding types.
 *
 * Use these instead of `as any` casts on `getCloudflareContext()`. Each worker
 * extends `BaseEnv` with the bindings it actually uses — keeps route handlers
 * honest about which KV / R2 / RateLimit they depend on.
 *
 * Example:
 *   const ctx = getCloudflareContext();
 *   const env: BlogEnv = ctx.env as BlogEnv;
 *   await env.SESSION_KV.get(...)
 */

export interface BaseEnv {
    /** Cloudflare KV binding used for daily rate limiting + sessions. */
    SESSION_KV?: KVNamespace;
}

/** cf-blog worker bindings. */
export interface BlogEnv extends BaseEnv {
    DB: D1Database;
    LLM_RATE_LIMIT?: RateLimit;
    GUESTBOOK_RATE_LIMIT?: RateLimit;
    SESSION_KV: KVNamespace;
    GEMINI_API_KEY: string;
    GEMINI_MODELS?: string;
}

/** agent-worker (cf-agent) bindings. */
export interface AgentEnv extends BaseEnv {
    CHAT_RATE_LIMIT?: RateLimit;
    TOOL_RATE_LIMIT?: RateLimit;
    SESSION_KV: KVNamespace;
    GEMINI_API_KEY: string;
    GEMINI_MODELS?: string;
    TOOL_TIMEOUT_MS?: string;
    BRAVE_SEARCH_API_KEY?: string;
    BRAVE_API_KEY?: string;
}
