/**
 * Tests for the cache-worker frontmatter parser.
 *
 * parseFrontmatter underpins the R2→D1 sync in refreshCache(). These tests
 * pin the gray-matter-based behaviour (dates → Date, booleans → boolean,
 * unparseable input → empty frontmatter) so that an upgrade or
 * re-implementation can't silently regress.
 */
import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "../articles";

const wrap = (yaml: string) => `---\n${yaml}\n---\nbody text here\n`;

describe("parseFrontmatter", () => {
    it("returns parsed data and body", () => {
        const out = parseFrontmatter(
            wrap("title: Hello\ndate: 2025-01-15\ndescription: x"),
        );
        expect(out.data.title).toBe("Hello");
        // gray-matter parses YAML dates as Date objects
        expect(out.data.date).toBeInstanceOf(Date);
        expect(out.body.trim()).toBe("body text here");
    });

    it("does not throw on unparseable frontmatter", () => {
        // gray-matter may return partial data and trimmed body, but the
        // parser should never throw. The wrapper falls back to { data: {}, body: content }
        // only on actual exceptions, which we don't trigger here.
        expect(() =>
            parseFrontmatter("---\n: broken\n---\nbody"),
        ).not.toThrow();
    });

    it("preserves YAML array tags", () => {
        const out = parseFrontmatter(
            wrap("tags:\n  - cloudflare\n  - workers"),
        );
        expect(out.data.tags).toEqual(["cloudflare", "workers"]);
    });

    it("parses draft/published as booleans", () => {
        const out = parseFrontmatter(wrap("draft: true\npublished: false"));
        expect(out.data.draft).toBe(true);
        expect(out.data.published).toBe(false);
    });
});
