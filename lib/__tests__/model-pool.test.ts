/**
 * Tests for the model-pool quota detection.
 *
 * `isTPDLimit` decides whether a 429 is a daily quota exhaustion (rotate to
 * the next model) or a per-minute burst (retry same model). Misclassifying
 * these silently degrades the chat — either by burning the fallback budget
 * unnecessarily, or by retrying a model that's actually dead for the day.
 */
import { describe, it, expect } from "vitest";
import { isTPDLimit } from "../model-pool";

describe("isTPDLimit", () => {
    it("returns true for quota-exhausted errors", () => {
        expect(
            isTPDLimit({ error: { message: "Quota exceeded for today" } }),
        ).toBe(true);
    });

    it("returns true for daily / TPD keywords", () => {
        expect(isTPDLimit({ error: { message: "Daily limit hit" } })).toBe(true);
        expect(isTPDLimit({ error: { message: "TPD reached" } })).toBe(true);
    });

    it("is case-insensitive", () => {
        expect(
            isTPDLimit({ error: { message: "QUOTA EXHAUSTED" } }),
        ).toBe(true);
    });

    it("returns false for plain burst / rate-limit errors", () => {
        expect(
            isTPDLimit({ error: { message: "Too many requests" } }),
        ).toBe(false);
        expect(
            isTPDLimit({ error: { message: "Rate limit exceeded" } }),
        ).toBe(false);
    });

    it("handles string error body", () => {
        expect(isTPDLimit({ error: "quota exhausted" })).toBe(true);
    });

    it("returns false for null / undefined / non-objects", () => {
        expect(isTPDLimit(null)).toBe(false);
        expect(isTPDLimit(undefined)).toBe(false);
        expect(isTPDLimit("plain string")).toBe(false);
        expect(isTPDLimit(42)).toBe(false);
    });

    it("returns false for empty error message", () => {
        expect(isTPDLimit({ error: { message: "" } })).toBe(false);
        expect(isTPDLimit({ error: {} })).toBe(false);
        expect(isTPDLimit({})).toBe(false);
    });
});
