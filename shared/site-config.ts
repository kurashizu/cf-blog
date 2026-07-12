/**
 * Site-wide URL configuration for cf-blog, agent-worker, and landing-worker.
 *
 * Changing the apex domain only requires updating `APEX_DOMAIN` here — every
 * worker's runtime URLs (sitemap, robots.txt, R2 public bucket, cross-worker
 * links, etc.) recompute from it automatically.
 *
 * Subdomain mapping:
 *   - `blog.APEX_DOMAIN`   — main blog (cf-blog)
 *   - `bucket.APEX_DOMAIN` — R2 public-files custom domain
 *   - `agent.APEX_DOMAIN`  — AI agent (cf-agent)
 *   - `share.APEX_DOMAIN`  — share worker (separate repo, referenced from D1)
 *   - `APEX_DOMAIN` / `www.APEX_DOMAIN` — landing (cf-landing)
 *
 * Override per environment via the `APEX_DOMAIN` env var (build-time
 * replacement is enough for Cloudflare Workers / Next.js — no runtime indirection).
 */

const FALLBACK_APEX = "krsz.in";

/** Apex domain without protocol, e.g. `krsz.in` or `022025.xyz`. */
export const APEX_DOMAIN: string =
    (typeof process !== "undefined" && process.env?.APEX_DOMAIN) ||
    FALLBACK_APEX;

export const BLOG_URL = `https://blog.${APEX_DOMAIN}`;
export const BUCKET_URL = `https://bucket.${APEX_DOMAIN}`;
export const AGENT_URL = `https://agent.${APEX_DOMAIN}`;
export const SHARE_URL = `https://share.${APEX_DOMAIN}`;

/** Landing (cf-landing) — apex + www. */
export const LANDING_URL = `https://${APEX_DOMAIN}`;
export const LANDING_WWW_URL = `https://www.${APEX_DOMAIN}`;
