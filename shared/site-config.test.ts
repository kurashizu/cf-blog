/**
 * Tests for the shared site-config.
 *
 * Site URLs fan out from a single apex — these tests pin the derived URLs
 * so a refactor (or a typo in the constants) cannot silently break
 * production cross-worker links.
 */

import { describe, it, expect } from "vitest";
import {
    APEX_DOMAIN,
    BLOG_URL,
    BUCKET_URL,
    AGENT_URL,
    SHARE_URL,
    LANDING_URL,
    LANDING_WWW_URL,
} from "./site-config";

describe("site-config", () => {
    it("uses the default apex when no env override is set", () => {
        expect(APEX_DOMAIN).toBe("krsz.in");
    });

    it("exposes the canonical subdomains for each worker", () => {
        expect(BLOG_URL).toBe("https://blog.krsz.in");
        expect(BUCKET_URL).toBe("https://bucket.krsz.in");
        expect(AGENT_URL).toBe("https://agent.krsz.in");
        expect(SHARE_URL).toBe("https://share.krsz.in");
    });

    it("exposes the landing apex + www apex", () => {
        expect(LANDING_URL).toBe("https://krsz.in");
        expect(LANDING_WWW_URL).toBe("https://www.krsz.in");
    });

    it("every URL uses https and the configured apex", () => {
        const all = [BLOG_URL, BUCKET_URL, AGENT_URL, SHARE_URL, LANDING_URL, LANDING_WWW_URL];
        for (const url of all) {
            expect(url.startsWith("https://")).toBe(true);
            expect(url.endsWith(".krsz.in") || url === "https://krsz.in").toBe(true);
        }
    });
});
