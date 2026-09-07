/**
 * Tests for footprint-wall pure logic: deriving a storable row from edge
 * data + UA, and aggregating country counts. No D1 access — those two
 * functions are what decide whether a stamp is even allowed to be
 * recorded, so they're worth pinning down independently of the route.
 */
import { describe, it, expect } from "vitest";
import { deriveFootprint, summarizeCountries } from "./footprints";

describe("deriveFootprint", () => {
    it("returns null when cf is missing (local dev, non-CF request)", () => {
        expect(deriveFootprint(undefined, "Mozilla/5.0")).toBeNull();
    });

    it("returns null when country is missing", () => {
        expect(
            deriveFootprint({ timezone: "Asia/Tokyo" }, "Mozilla/5.0"),
        ).toBeNull();
    });

    it("returns null when country is an empty string", () => {
        expect(
            deriveFootprint({ country: "" }, "Mozilla/5.0"),
        ).toBeNull();
    });

    it("derives country, timezone, colo from edge data", () => {
        const result = deriveFootprint(
            { country: "JP", timezone: "Asia/Tokyo", colo: "NRT" },
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        );
        expect(result).toEqual({
            country: "JP",
            timezone: "Asia/Tokyo",
            colo: "NRT",
            browser: "Chrome",
            os: "macOS",
        });
    });

    it("never includes a version in browser or os", () => {
        const result = deriveFootprint(
            { country: "US" },
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        );
        expect(result?.browser).not.toMatch(/\d/);
        expect(result?.os).not.toMatch(/\d/);
    });

    it("falls back to empty strings for missing timezone/colo/UA", () => {
        const result = deriveFootprint({ country: "DE" }, "");
        expect(result).toEqual({
            country: "DE",
            timezone: "",
            colo: "",
            browser: "",
            os: "",
        });
    });
});

describe("summarizeCountries", () => {
    it("counts and sorts descending", () => {
        const rows = [
            { country: "US" },
            { country: "JP" },
            { country: "US" },
            { country: "DE" },
            { country: "US" },
        ];
        expect(summarizeCountries(rows)).toEqual([
            { code: "US", count: 3 },
            { code: "JP", count: 1 },
            { code: "DE", count: 1 },
        ]);
    });

    it("skips rows with an empty country", () => {
        expect(summarizeCountries([{ country: "" }, { country: "FR" }])).toEqual([
            { code: "FR", count: 1 },
        ]);
    });

    it("returns an empty array for no rows", () => {
        expect(summarizeCountries([])).toEqual([]);
    });
});
