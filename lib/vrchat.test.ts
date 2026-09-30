/**
 * Tests for the VRChat endpoint's pure logic: how the typed template URL's
 * query becomes a guestbook message or a plain footprint, and which
 * User-Agents are refused. The route only wires these to rate limits and D1.
 */
import { describe, it, expect } from "vitest";
import {
    CONTENT_MAX,
    TEMPLATE_LABEL,
    isBrowserUserAgent,
    parseVrchatInput,
} from "./vrchat";

// Unity-style User-Agent of the kind a VRChat world's web request sends —
// an assumed sample; the real one shows up in api_access_log.
const UNITY_UA = "UnityPlayer/2022.3.22f1-DWR (UnityWebRequest/1.0, libcurl/8.5.0-DEV)";

/** What the field holds, escaped the way a client escapes spaces in a URL. */
function typed(padding: number, label: string, message: string): string {
    return `?msg=${encodeURI(`${" ".repeat(padding)}${label} ${message}`)}`;
}

describe("parseVrchatInput — a message on an intact template", () => {
    it("is a message, however wide the padding", () => {
        for (const padding of [0, 1, 22, 80]) {
            expect(
                parseVrchatInput(typed(padding, TEMPLATE_LABEL, "hello world")),
            ).toEqual({ kind: "message", content: "hello world" });
        }
    });

    it("decodes percent-encoded CJK", () => {
        expect(
            parseVrchatInput(typed(22, TEMPLATE_LABEL, "你好，世界")),
        ).toEqual({ kind: "message", content: "你好，世界" });
    });

    it("keeps & and = as text instead of splitting them into params", () => {
        expect(
            parseVrchatInput(`?msg=${TEMPLATE_LABEL}a=1&b=2`),
        ).toEqual({ kind: "message", content: "a=1&b=2" });
    });

    it("keeps + as a plus", () => {
        expect(parseVrchatInput(`?msg=${TEMPLATE_LABEL}1+1`)).toEqual({
            kind: "message",
            content: "1+1",
        });
    });

    it("keeps a stray % literal and still decodes the escapes around it", () => {
        expect(parseVrchatInput(`?msg=${TEMPLATE_LABEL}100%`)).toMatchObject({
            content: "100%",
        });
        expect(
            parseVrchatInput(`?msg=${TEMPLATE_LABEL}100%%20off`),
        ).toMatchObject({ content: "100% off" });
    });

    it("leaves an invalid UTF-8 escape run as typed", () => {
        expect(
            parseVrchatInput(`?msg=${TEMPLATE_LABEL}x%E4%BDy`),
        ).toMatchObject({ content: "x%E4%BDy" });
    });

    it("strips markup like the website form does", () => {
        expect(
            parseVrchatInput(typed(22, TEMPLATE_LABEL, "<b>hi</b>")),
        ).toEqual({ kind: "message", content: "hi" });
    });

    it("keeps the label text if the player types it again", () => {
        expect(
            parseVrchatInput(
                typed(22, TEMPLATE_LABEL, `${TEMPLATE_LABEL} hi`),
            ),
        ).toEqual({ kind: "message", content: `${TEMPLATE_LABEL} hi` });
    });

    it("accepts the limit and rejects one past it", () => {
        expect(
            parseVrchatInput(typed(22, TEMPLATE_LABEL, "a".repeat(CONTENT_MAX))),
        ).toMatchObject({ kind: "message" });
        expect(
            parseVrchatInput(
                typed(22, TEMPLATE_LABEL, "a".repeat(CONTENT_MAX + 1)),
            ),
        ).toEqual({ kind: "too-long" });
    });
});

describe("parseVrchatInput — everything else is a footprint", () => {
    it("blank message", () => {
        for (const message of ["", "   ", "\t"]) {
            expect(
                parseVrchatInput(typed(22, TEMPLATE_LABEL, message)),
            ).toEqual({ kind: "footprint", reason: "blank" });
        }
        expect(parseVrchatInput(`?msg=${TEMPLATE_LABEL}`)).toEqual({
            kind: "footprint",
            reason: "blank",
        });
    });

    it("markup that strips to nothing", () => {
        expect(
            parseVrchatInput(typed(22, TEMPLATE_LABEL, "<b></b>")),
        ).toEqual({ kind: "footprint", reason: "blank" });
    });

    it("a deleted or edited label, even with a message typed", () => {
        for (const label of [
            "", // label deleted
            "Your message (Optional)", // colon gone
            "Your message:", // "(Optional)" gone
            "message (Optional):", // "Your" gone
            "your message (optional):", // case changed
            "Yourmessage (Optional):", // space gone
        ]) {
            expect(parseVrchatInput(typed(22, label, "hello"))).toEqual({
                kind: "footprint",
                reason: "template",
            });
        }
    });

    it("text typed in front of the label", () => {
        expect(
            parseVrchatInput(`?msg=hi ${TEMPLATE_LABEL} hello`),
        ).toEqual({ kind: "footprint", reason: "template" });
    });

    it("a missing or different query", () => {
        for (const search of [
            "",
            "?",
            "?m=Your%20message%20(Optional):%20hi",
            `?x=1&msg=${TEMPLATE_LABEL}hi`,
            `?MSG=${TEMPLATE_LABEL}hi`,
        ]) {
            expect(parseVrchatInput(search)).toEqual({
                kind: "footprint",
                reason: "no-query",
            });
        }
    });

    it("an empty msg value", () => {
        expect(parseVrchatInput("?msg=")).toEqual({
            kind: "footprint",
            reason: "template",
        });
    });
});

describe("isBrowserUserAgent", () => {
    it("flags real browser User-Agents", () => {
        expect(
            isBrowserUserAgent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            ),
        ).toBe(true);
    });

    it("passes a Unity web request and an empty UA", () => {
        expect(isBrowserUserAgent(UNITY_UA)).toBe(false);
        expect(isBrowserUserAgent("")).toBe(false);
    });
});
