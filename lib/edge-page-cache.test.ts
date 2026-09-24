import { describe, it, expect, vi } from "vitest";
import { routeFor, isScannerPath, serveWithEdgeCache, type EdgeCacheDeps, type StoredPage } from "./edge-page-cache";

const ORIGIN = "https://blog.krsz.in";

/** A Cache API stand-in that honours only what the worker relies on. */
function memoryCache() {
    const store = new Map<string, Response>();
    return {
        store,
        async match(req: RequestInfo | URL) {
            return store.get(new Request(req as RequestInfo).url)?.clone();
        },
        async put(req: RequestInfo | URL, res: Response) {
            store.set(new Request(req as RequestInfo).url, res.clone());
        },
    };
}

/** One site, possibly seen from several colos: each colo has its own Cache
 *  API, all of them share the global store and the content version. */
function site() {
    const global = new Map<string, StoredPage>();
    let version: string | null = "v1";
    let clock = 1_000_000;
    let renders = 0;
    const render = vi.fn(async () => {
        renders++;
        return new Response(`<html>render ${renders}</html>`, {
            headers: {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
            },
        });
    });
    const readVersion = vi.fn(async () => version);

    function colo() {
        const cache = memoryCache();
        const pending: Promise<unknown>[] = [];
        const deps: EdgeCacheDeps = {
            cache,
            store: {
                get: async (k) => global.get(k) ?? null,
                put: async (k, p) => void global.set(k, p),
            },
            readVersion,
            waitUntil: (p) => pending.push(p),
            now: () => clock,
        };
        const get = async (
            path: string,
            headers: Record<string, string> = {},
            r: () => Promise<Response> = render,
        ) => {
            const res = await serveWithEdgeCache(new Request(ORIGIN + path, { headers }), deps, r);
            await Promise.all(pending.splice(0));
            return res;
        };
        return { cache, deps, get };
    }

    return {
        global,
        render,
        readVersion,
        colo,
        advance: (s: number) => (clock += s * 1000),
        setVersion: (v: string) => (version = v),
    };
}

describe("edge page cache", () => {
    it("renders a public page once and serves the next request from the colo", async () => {
        const s = site();
        const sydney = s.colo();
        const first = await sydney.get("/blog/some-post");
        const second = await sydney.get("/blog/some-post");
        expect(s.render).toHaveBeenCalledTimes(1);
        expect(first.headers.get("x-edge-cache")).toBe("MISS");
        expect(second.headers.get("x-edge-cache")).toBe("HIT");
        expect(await second.text()).toBe("<html>render 1</html>");
    });

    it("serves another colo's render from the global store instead of rendering again", async () => {
        const s = site();
        await s.colo().get("/");
        const res = await s.colo().get("/");
        expect(s.render).toHaveBeenCalledTimes(1);
        expect(res.headers.get("x-edge-cache")).toBe("HIT-GLOBAL");
        expect(await res.text()).toBe("<html>render 1</html>");
    });

    it("keeps visitors' browsers from caching, while the colo copy lasts what is left of the TTL", async () => {
        const s = site();
        const a = s.colo();
        expect((await a.get("/")).headers.get("cache-control")).toMatch(/no-store/);
        expect((await a.get("/")).headers.get("cache-control")).toMatch(/no-store/);
        const [inColo] = [...a.cache.store.values()];
        expect(inColo.headers.get("cache-control")).toBe("public, max-age=1800");

        s.advance(600);
        const b = s.colo();
        await b.get("/");
        const [inB] = [...b.cache.store.values()];
        expect(inB.headers.get("cache-control")).toBe("public, max-age=1200");
    });

    it("serves an expired page at once and re-renders it after the response", async () => {
        const s = site();
        await s.colo().get("/news/123");
        s.advance(1801);
        const res = await s.colo().get("/news/123");
        expect(res.headers.get("x-edge-cache")).toBe("STALE");
        expect(await res.text()).toBe("<html>render 1</html>");
        expect(s.render).toHaveBeenCalledTimes(2);
        const next = await s.colo().get("/news/123");
        expect(await next.text()).toBe("<html>render 2</html>");
    });

    it("renders in front of the visitor once a copy is older than the stale window", async () => {
        const s = site();
        await s.colo().get("/about");
        s.advance(86400 + 7 * 86400 + 1);
        const res = await s.colo().get("/about");
        expect(res.headers.get("x-edge-cache")).toBe("MISS");
        expect(await res.text()).toBe("<html>render 2</html>");
    });

    it("renders again once the content version moves, even in a colo that has the old page", async () => {
        const s = site();
        const a = s.colo();
        await a.get("/about");
        s.setVersion("v2");
        const res = await a.get("/about");
        expect(s.render).toHaveBeenCalledTimes(2);
        expect(await res.text()).toBe("<html>render 2</html>");
    });

    it("keeps pagination apart and ignores any other query string", async () => {
        const s = site();
        const a = s.colo();
        await a.get("/news?page=2");
        await a.get("/news?page=2&utm_source=x");
        await a.get("/news?page=3");
        expect(s.render).toHaveBeenCalledTimes(2);
        expect([...s.global.keys()]).toEqual(["v1/news?page=2", "v1/news?page=3"]);
    });

    it("never caches RSC payloads, search, APIs or admin, nor looks up the version for them", async () => {
        const s = site();
        const a = s.colo();
        await a.get("/blog", { rsc: "1" });
        await a.get("/blog", { rsc: "1" });
        await a.get("/blog?_rsc=abc");
        await a.get("/search?q=x");
        await a.get("/api/llm-leaderboard");
        await a.get("/admin");
        expect(s.render).toHaveBeenCalledTimes(6);
        expect(s.readVersion).not.toHaveBeenCalled();
    });

    it("passes through, without keeping, an error, a redirect or a response that sets a cookie", async () => {
        const s = site();
        const a = s.colo();
        const responses = [
            new Response("nope", { status: 404, headers: { "content-type": "text/html" } }),
            new Response(null, { status: 307, headers: { location: "https://example.com" } }),
            new Response("x", { headers: { "content-type": "text/html", "set-cookie": "a=b" } }),
        ];
        for (const r of responses) {
            const res = await a.get("/blog/x", {}, async () => r);
            expect(res).toBe(r);
        }
        expect(a.cache.store.size).toBe(0);
        expect(s.global.size).toBe(0);
    });

    it("does not keep Next's not-found page, which arrives as a 200", async () => {
        const s = site();
        const a = s.colo();
        const notFound = async () =>
            new Response('<html><head><meta name="robots" content="noindex"/></head>404</html>', {
                headers: { "content-type": "text/html; charset=utf-8" },
            });
        const res = await a.get("/blog/guessed-slug", {}, notFound);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain("404");
        expect(a.cache.store.size).toBe(0);
        expect(s.global.size).toBe(0);
    });

    it("answers scanner paths without rendering", async () => {
        const s = site();
        const a = s.colo();
        for (const p of ["/wp-login.php", "/.env", "/.git/config", "/admin/config.yml", "/xmlrpc.php"]) {
            expect((await a.get(p)).status).toBe(404);
        }
        expect(s.render).not.toHaveBeenCalled();
        expect(isScannerPath("/blog/php-tips")).toBe(false);
        expect(isScannerPath("/sitemap.xml")).toBe(false);
    });

    it("does not cache a non-GET request", () => {
        expect(routeFor(new Request(ORIGIN + "/", { method: "POST" }))).toBeNull();
    });
});
