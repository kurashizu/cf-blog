/**
 * Textarea markdown editing primitives.
 *
 * Every command is a pure transform of (text, selection) → (text, selection)
 * so the toolbar, keyboard shortcuts and tests all share one implementation
 * and the caller only has to apply the result to the DOM.
 */

export interface EditorState {
    text: string;
    start: number;
    end: number;
}

/** Wrap the selection in `marker`, or unwrap it if already wrapped. */
export function toggleWrap(s: EditorState, marker: string): EditorState {
    const { text, start, end } = s;
    const selected = text.slice(start, end);
    const before = text.slice(0, start);
    const after = text.slice(end);

    // Already wrapped just outside the selection → unwrap.
    if (before.endsWith(marker) && after.startsWith(marker)) {
        return {
            text:
                before.slice(0, -marker.length) +
                selected +
                after.slice(marker.length),
            start: start - marker.length,
            end: end - marker.length,
        };
    }
    // Selection itself contains the markers → unwrap.
    if (
        selected.length >= marker.length * 2 &&
        selected.startsWith(marker) &&
        selected.endsWith(marker)
    ) {
        const inner = selected.slice(marker.length, -marker.length);
        return {
            text: before + inner + after,
            start,
            end: start + inner.length,
        };
    }
    return {
        text: `${before}${marker}${selected}${marker}${after}`,
        start: start + marker.length,
        end: end + marker.length,
    };
}

/** Expand a selection to cover the full lines it touches. */
function lineSpan(text: string, start: number, end: number) {
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = text.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = text.length;
    return { lineStart, lineEnd };
}

/**
 * Toggle a line prefix (`## `, `> `, `- `) across every selected line.
 * If every line already has it, it's removed.
 */
export function toggleLinePrefix(
    s: EditorState,
    prefix: string,
): EditorState {
    const { text, start, end } = s;
    const { lineStart, lineEnd } = lineSpan(text, start, end);
    const block = text.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    const allHave = lines.every((l) => l.startsWith(prefix));

    const next = lines
        .map((l) => (allHave ? l.slice(prefix.length) : prefix + l))
        .join("\n");

    const delta = next.length - block.length;
    return {
        text: text.slice(0, lineStart) + next + text.slice(lineEnd),
        start: lineStart,
        end: end + delta,
    };
}

/** Ordered list: renumber the selected lines, or strip existing numbering. */
export function toggleOrderedList(s: EditorState): EditorState {
    const { text, start, end } = s;
    const { lineStart, lineEnd } = lineSpan(text, start, end);
    const block = text.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    const numbered = /^\d+\.\s/;
    const allHave = lines.every((l) => numbered.test(l));

    const next = lines
        .map((l, i) => (allHave ? l.replace(numbered, "") : `${i + 1}. ${l}`))
        .join("\n");

    const delta = next.length - block.length;
    return {
        text: text.slice(0, lineStart) + next + text.slice(lineEnd),
        start: lineStart,
        end: end + delta,
    };
}

/**
 * Insert a link. With a selection, the selected text becomes the label and
 * the caret lands in the empty url; otherwise a placeholder label is used
 * and left selected.
 */
export function insertLink(s: EditorState, url = ""): EditorState {
    const { text, start, end } = s;
    const selected = text.slice(start, end);
    const label = selected || "link text";
    const snippet = `[${label}](${url})`;
    const next = text.slice(0, start) + snippet + text.slice(end);

    if (selected) {
        // Caret inside the parens, ready to type/paste the URL.
        const urlStart = start + label.length + 3;
        return { text: next, start: urlStart + url.length, end: urlStart + url.length };
    }
    return { text: next, start: start + 1, end: start + 1 + label.length };
}

/** Insert an image reference at the caret. */
export function insertImage(
    s: EditorState,
    url: string,
    alt = "",
): EditorState {
    const { text, start, end } = s;
    const snippet = `![${alt}](${url})`;
    return {
        text: text.slice(0, start) + snippet + text.slice(end),
        start: start + snippet.length,
        end: start + snippet.length,
    };
}

/**
 * Code: wrap a single-line selection in backticks, but use a fenced block
 * when the selection spans lines (or nothing is selected).
 */
export function toggleCode(s: EditorState): EditorState {
    const selected = s.text.slice(s.start, s.end);
    if (selected && !selected.includes("\n")) return toggleWrap(s, "`");

    const { text, start, end } = s;
    const fence = "```";
    const body = selected || "";
    const snippet = `${fence}\n${body}\n${fence}`;
    const next = text.slice(0, start) + snippet + text.slice(end);
    // Caret on the language line, where you usually want to type next.
    return { text: next, start: start + fence.length, end: start + fence.length };
}

/** Insert `\t`-like indentation, or outdent with shift. */
export function indent(s: EditorState, outdent = false): EditorState {
    const unit = "  ";
    const { text, start, end } = s;
    const { lineStart, lineEnd } = lineSpan(text, start, end);
    const block = text.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    const next = lines
        .map((l) =>
            outdent
                ? l.startsWith(unit)
                    ? l.slice(unit.length)
                    : l.replace(/^\s+/, "")
                : unit + l,
        )
        .join("\n");
    const delta = next.length - block.length;
    return {
        text: text.slice(0, lineStart) + next + text.slice(lineEnd),
        start,
        end: end + delta,
    };
}

/** Derive a URL-safe slug from a title. */
export function slugify(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 200);
}

/** Words, characters, and an estimated read time in minutes. */
export function textStats(text: string): {
    words: number;
    chars: number;
    minutes: number;
} {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return {
        words,
        chars: text.length,
        minutes: Math.max(1, Math.round(words / 200)),
    };
}
