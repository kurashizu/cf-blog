/**
 * Whole-page cache in front of the Next server.
 *
 * Every public page is `force-dynamic`, so without this each request renders
 * the page and queries D1 -- 20 to 280 ms of CPU, measured, on a plan that
 * allows 10. Content only changes when an admin saves (posts, links, news
 * edits) or a cron writes D1, so a rendered page is reused until it expires or
 * the content version moves.
 *
 * Two tiers, because the Cache API is per data centre and this site's traffic
 * is thin and spread out: most requests are the first one a given colo has
 * seen in a while. So a colo miss falls back to a copy in R2, which is global,
 * and only a miss there renders. A copy past its TTL is still served while a
 * fresh render runs after the response, so a visitor waits on a render only
 * for a page nobody has asked for since the last content change.
 *
 * Next's own ISR is not usable here: it prerenders static routes at build
 * time, where `getCloudflareContext` has no D1 (see app/about/page.tsx).
 */

/** Pages whose content comes from crons (news, GitHub) expire with the cron;
 *  pages only an admin changes live a day and are invalidated by version. */
const ROUTES: { match: RegExp; ttl: number; keepQuery?: string[] }[] = [
    { match: /^\/$/, ttl: 1800 },
    { match: /^\/news$/, ttl: 1800, keepQuery: ["page"] },
    { match: /^\/news\/\d+$/, ttl: 1800 },
    { match: /^\/blog$/, ttl: 86400, keepQuery: ["page"] },
    { match: /^\/blog\/[^/]+$/, ttl: 86400 },
    { match: /^\/about$/, ttl: 86400 },
    { match: /^\/sitemap\.xml$/, ttl: 3600 },
];

/** How long past its TTL a copy may still be served while it is re-rendered. */
const STALE_FOR_S = 7 * 86400;

/** Paths only vulnerability scanners ask for. Answered here without starting
 *  Next: its not-found page is a full render too. */
const SCANNER =
    /(^\/(wp-|wordpress|\.git|\.env|\.aws|\.ssh|cgi-bin|phpmyadmin|xmlrpc))|\.(php\d?|asp|aspx|jsp|cgi|env|sql|bak|old|ini|ya?ml|config|DS_Store)$/i;

export const VERSION_KEY = "page-cache-version";

const NOT_FOUND_MARK = /<meta name="robots" content="noindex"\/?>/;

const NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate";

export interface StoredPage {
    body: string;
    contentType: string;
    renderedAt: number;
}

export interface EdgeCacheDeps {
    /** Per-colo tier (the Cache API). */
    cache: Pick<Cache, "match" | "put">;
    /** Global tier (R2). */
    store: {
        get(key: string): Promise<StoredPage | null>;
        put(key: string, page: StoredPage): Promise<unknown>;
    };
    readVersion: () => Promise<string | null>;
    waitUntil: (p: Promise<unknown>) => void;
    now?: () => number;
}

interface Route {
    ttl: number;
    /** Path plus the query parameters the page actually reads. */
    path: string;
}

export function isScannerPath(pathname: string): boolean {
    return SCANNER.test(pathname);
}

/** The cacheable identity of a request, or null when it must not be cached. */
export function routeFor(request: Request): Route | null {
    if (request.method !== "GET") return null;
    // Client-side navigations and prefetches ask for an RSC payload at the
    // same URL; it depends on the router state the client sends, so it is
    // never interchangeable with the HTML document.
    if (request.headers.has("rsc") || request.headers.has("next-router-prefetch")) return null;
    const url = new URL(request.url);
    if (url.searchParams.has("_rsc")) return null;
    const route = ROUTES.find((r) => r.match.test(url.pathname));
    if (!route) return null;
    const kept = new URLSearchParams();
    for (const name of route.keepQuery ?? []) {
        const value = url.searchParams.get(name);
        if (value !== null) kept.set(name, value);
    }
    const query = kept.toString();
    return { ttl: route.ttl, path: url.pathname + (query ? `?${query}` : "") };
}

function toResponse(page: StoredPage, state: string): Response {
    return new Response(page.body, {
        headers: {
            "content-type": page.contentType,
            "cache-control": NO_STORE,
            "x-edge-cache": state,
        },
    });
}

export async function serveWithEdgeCache(
    request: Request,
    deps: EdgeCacheDeps,
    render: () => Promise<Response>,
): Promise<Response> {
    const { origin, pathname } = new URL(request.url);
    if (isScannerPath(pathname)) {
        return new Response("Not Found", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
        });
    }

    const route = routeFor(request);
    if (!route) return render();

    const now = deps.now ?? Date.now;
    const version = (await deps.readVersion()) ?? "0";
    const storeKey = `${version}${route.path}`;
    const coloKey = new Request(`${origin}/__page-cache/${encodeURIComponent(storeKey)}`);

    /** Keep a page in this colo for what is left of its TTL. */
    const keepInColo = (page: StoredPage) => {
        const left = Math.floor(route.ttl - (now() - page.renderedAt) / 1000);
        if (left <= 0) return;
        const res = toResponse(page, "HIT");
        res.headers.set("cache-control", `public, max-age=${left}`);
        deps.waitUntil(deps.cache.put(coloKey, res));
    };

    /** Render, and keep the result if it is a page worth reusing. */
    const renderAndKeep = async (): Promise<{ response: Response; page: StoredPage | null }> => {
        const response = await render();
        const contentType = response.headers.get("content-type") ?? "";
        const reusable =
            response.status === 200 &&
            !response.headers.has("set-cookie") &&
            /text\/html|xml/.test(contentType);
        if (!reusable) return { response, page: null };
        const page = { body: await response.text(), contentType, renderedAt: now() };
        // A missing post or news item renders Next's not-found page with a
        // 200 (the loading boundary has already streamed the status), told
        // apart only by this meta. Kept, every slug a scanner guesses would
        // become a stored page.
        if (NOT_FOUND_MARK.test(page.body)) {
            return { response: new Response(page.body, response), page: null };
        }
        deps.waitUntil(deps.store.put(storeKey, page));
        keepInColo(page);
        return { response, page };
    };

    const local = await deps.cache.match(coloKey);
    if (local) {
        const res = new Response(local.body, local);
        res.headers.set("cache-control", NO_STORE);
        res.headers.set("x-edge-cache", "HIT");
        return res;
    }

    const stored = await deps.store.get(storeKey);
    if (stored) {
        const age = (now() - stored.renderedAt) / 1000;
        if (age < route.ttl) {
            keepInColo(stored);
            return toResponse(stored, "HIT-GLOBAL");
        }
        if (age < route.ttl + STALE_FOR_S) {
            deps.waitUntil(renderAndKeep().catch(() => {}));
            return toResponse(stored, "STALE");
        }
    }

    const { response, page } = await renderAndKeep();
    if (!page) return response;
    return toResponse(page, "MISS");
}
