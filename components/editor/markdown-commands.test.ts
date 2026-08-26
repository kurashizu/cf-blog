import { describe, expect, it } from "vitest";
import {
    indent,
    insertImage,
    insertLink,
    slugify,
    textStats,
    toggleCode,
    toggleLinePrefix,
    toggleOrderedList,
    toggleWrap,
} from "./markdown-commands";

/** Build a state from a string with the selection marked as [sel]. */
function sel(text: string, start: number, end = start) {
    return { text, start, end };
}

describe("toggleWrap", () => {
    it("wraps the selection", () => {
        expect(toggleWrap(sel("hello world", 0, 5), "**")).toEqual({
            text: "**hello** world",
            start: 2,
            end: 7,
        });
    });

    it("unwraps when the markers sit just outside the selection", () => {
        // "**hello** world" with "hello" selected
        expect(toggleWrap(sel("**hello** world", 2, 7), "**")).toEqual({
            text: "hello world",
            start: 0,
            end: 5,
        });
    });

    it("unwraps when the markers are inside the selection", () => {
        expect(toggleWrap(sel("**hello** world", 0, 9), "**")).toEqual({
            text: "hello world",
            start: 0,
            end: 5,
        });
    });

    it("inserts an empty pair when nothing is selected", () => {
        const r = toggleWrap(sel("ab", 1), "*");
        expect(r.text).toBe("a**b");
        expect(r.start).toBe(2);
        expect(r.end).toBe(2);
    });
});

describe("toggleLinePrefix", () => {
    it("adds the prefix to every touched line", () => {
        const r = toggleLinePrefix(sel("one\ntwo", 0, 7), "- ");
        expect(r.text).toBe("- one\n- two");
    });

    it("removes the prefix when every line already has it", () => {
        const r = toggleLinePrefix(sel("- one\n- two", 0, 11), "- ");
        expect(r.text).toBe("one\ntwo");
    });

    it("expands a caret-only selection to the whole line", () => {
        const r = toggleLinePrefix(sel("hello", 2), "## ");
        expect(r.text).toBe("## hello");
    });

    it("adds the prefix when only some lines have it", () => {
        const r = toggleLinePrefix(sel("- one\ntwo", 0, 9), "- ");
        expect(r.text).toBe("- - one\n- two");
    });
});

describe("toggleOrderedList", () => {
    it("numbers the selected lines", () => {
        const r = toggleOrderedList(sel("a\nb\nc", 0, 5));
        expect(r.text).toBe("1. a\n2. b\n3. c");
    });

    it("strips numbering when all lines are numbered", () => {
        const r = toggleOrderedList(sel("1. a\n2. b", 0, 9));
        expect(r.text).toBe("a\nb");
    });
});

describe("insertLink", () => {
    it("uses the selection as the label and puts the caret in the url", () => {
        const r = insertLink(sel("see docs", 4, 8));
        expect(r.text).toBe("see [docs]()");
        expect(r.start).toBe(11); // inside the parens
        expect(r.end).toBe(11);
    });

    it("selects a placeholder label when nothing is selected", () => {
        const r = insertLink(sel("", 0));
        expect(r.text).toBe("[link text]()");
        expect(r.text.slice(r.start, r.end)).toBe("link text");
    });

    it("fills in a provided url", () => {
        const r = insertLink(sel("x", 1), "https://a.test");
        expect(r.text).toBe("x[link text](https://a.test)");
    });
});

describe("insertImage", () => {
    it("inserts at the caret and leaves the caret after it", () => {
        const r = insertImage(sel("a\n", 2), "https://img.test/x.png", "shot");
        expect(r.text).toBe("a\n![shot](https://img.test/x.png)");
        expect(r.start).toBe(r.text.length);
    });
});

describe("toggleCode", () => {
    it("uses inline backticks for a single-line selection", () => {
        const r = toggleCode(sel("run npm test", 4, 12));
        expect(r.text).toBe("run `npm test`");
    });

    it("uses a fence for a multi-line selection", () => {
        const r = toggleCode(sel("a\nb", 0, 3));
        expect(r.text).toBe("```\na\nb\n```");
    });

    it("uses a fence when nothing is selected", () => {
        const r = toggleCode(sel("", 0));
        expect(r.text).toBe("```\n\n```");
    });
});

describe("indent", () => {
    it("indents every touched line", () => {
        expect(indent(sel("a\nb", 0, 3)).text).toBe("  a\n  b");
    });

    it("outdents", () => {
        expect(indent(sel("  a\n  b", 0, 7), true).text).toBe("a\nb");
    });
});

describe("slugify", () => {
    it.each([
        ["Hello World", "hello-world"],
        ["  Trim  Me  ", "trim-me"],
        ["C++ & Rust!", "c-rust"],
        ["--already--slugged--", "already-slugged"],
        ["", ""],
    ])("%s → %s", (input, expected) => {
        expect(slugify(input)).toBe(expected);
    });

    it("caps the length at the DB limit", () => {
        expect(slugify("a".repeat(300)).length).toBeLessThanOrEqual(200);
    });
});

describe("textStats", () => {
    it("counts words and characters", () => {
        expect(textStats("one two three")).toEqual({
            words: 3,
            chars: 13,
            minutes: 1,
        });
    });

    it("reports zero words for empty input", () => {
        expect(textStats("   ").words).toBe(0);
    });

    it("estimates read time at ~200 wpm", () => {
        expect(textStats("word ".repeat(600)).minutes).toBe(3);
    });
});
