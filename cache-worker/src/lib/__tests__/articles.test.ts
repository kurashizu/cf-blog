/**
 * Tests for the cache-worker frontmatter parser.
 *
 * The previous hand-rolled parser was the cause of a real bug ("tags: a, b"
 * silently became `["a", " b"]` because of the missing `.trim()`); tests
 * here pin the gray-matter-based behaviour so we don't regress.
 */
import { describe, it, expect } from "vitest";
import { parsePostMeta } from "../articles";

const wrap = (yaml: string) => `---\n${yaml}\n---\nbody text here\n`;

describe("parsePostMeta", () => {
    it("extracts the standard fields", () => {
        const post = parsePostMeta(
            wrap("title: Hello\ndate: 2025-01-15\ndescription: x"),
            "articles/hello.md",
        );
        expect(post).toEqual({
            slug: "hello",
            title: "Hello",
            date: "2025-01-15",
            description: "x",
            tags: [],
            published: true,
            author: "Kurashizu",
            draft: false,
        });
    });

    it("strips the .md extension and the prefix from the slug", () => {
        const post = parsePostMeta(
            wrap("title: T\ndate: 2025-01-01"),
            "articles/some-slug.md",
        );
        expect(post?.slug).toBe("some-slug");
    });

    it("parses YAML array tags", () => {
        const post = parsePostMeta(
            wrap("title: T\ndate: 2025-01-01\ntags:\n  - cloudflare\n  - workers"),
            "articles/a.md",
        );
        expect(post?.tags).toEqual(["cloudflare", "workers"]);
    });

    it("parses comma-separated string tags and trims whitespace", () => {
        const post = parsePostMeta(
            wrap('title: T\ndate: 2025-01-01\ntags: " cloudflare,  workers , ai "'),
            "articles/a.md",
        );
        expect(post?.tags).toEqual(["cloudflare", "workers", "ai"]);
    });

    it("hides draft posts", () => {
        const post = parsePostMeta(
            wrap("title: T\ndate: 2025-01-01\ndraft: true"),
            "articles/a.md",
        );
        expect(post).toBeNull();
    });

    it("hides unpublished posts (published: false)", () => {
        const post = parsePostMeta(
            wrap("title: T\ndate: 2025-01-01\npublished: false"),
            "articles/a.md",
        );
        expect(post).toBeNull();
    });

    it("uses the author field when provided", () => {
        const post = parsePostMeta(
            wrap("title: T\ndate: 2025-01-01\nauthor: alice"),
            "articles/a.md",
        );
        expect(post?.author).toBe("alice");
    });

    it("falls back to the default author when missing", () => {
        const post = parsePostMeta(
            wrap("title: T\ndate: 2025-01-01"),
            "articles/a.md",
        );
        expect(post?.author).toBe("Kurashizu");
    });

    it("treats unparseable frontmatter as an empty frontmatter (so the post is still indexed)", () => {
        const post = parsePostMeta(
            "---\n: broken\n---\nbody",
            "articles/a.md",
        );
        expect(post?.title).toBe("");
        expect(post?.date).toBe("");
    });
});
