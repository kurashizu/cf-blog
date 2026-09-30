/**
 * Pure helpers for the VRChat world endpoint (app/api/vrchat/route.ts).
 *
 * A VRChat world cannot build a request at runtime: the only URL it can
 * load besides ones fixed at upload is a VRCUrl the player typed into a
 * VRCUrlInputField. The world prefills that field with a template and the
 * player types after it:
 *
 *   https://blog.krsz.in/api/vrchat?msg=<padding>Your message (Optional): <message>
 *
 * A message on an intact template is a guestbook post. Anything else — a
 * blank message, a deleted or edited part of the template, no query at all
 * — is just a footprint.
 */
import { sanitizeGuestbookText } from "./guestbook";

/**
 * Name on every guestbook post from the world. The channel records no
 * player name — the template has no name part and the world sends none.
 */
export const VRCHAT_POSTER_NAME = "VRChat Player";

/** Same bound the website form enforces (app/api/guestbook/route.ts). */
export const CONTENT_MAX = 2000;

/** What the template's query starts with; the text follows the "=". */
const QUERY_PREFIX = "?msg=";

/** Label the template ends with; the player's message follows it. */
export const TEMPLATE_LABEL = "Your message (Optional):";

export type VrchatInput =
    | {
          kind: "footprint";
          /**
           * Why it was not a message — the query is never logged, so this
           * is what tells a template the client mangled apart from a
           * player who left the message blank.
           */
          reason: "no-query" | "template" | "blank";
      }
    | { kind: "message"; content: string }
    | { kind: "too-long" };

/**
 * True for a User-Agent that starts like a real browser ("Mozilla/5.0 …").
 * The endpoint writes on GET, so it refuses these — a web page embedding
 * the URL, or a link prefetcher, must not post or stamp on a visitor's
 * behalf. A soft filter only: the UA is trivially spoofable.
 */
export function isBrowserUserAgent(userAgent: string): boolean {
    return /^Mozilla\//i.test(userAgent);
}

/**
 * Percent-decode each run of valid `%XX` escapes on its own. A "%" the
 * player typed ("100%") stays literal and does not stop the escapes around
 * it decoding — `decodeURIComponent` on the whole string would throw and
 * leave every `%20` in the stored message.
 */
function decodeQuery(raw: string): string {
    return raw.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
        try {
            return decodeURIComponent(run);
        } catch {
            return run;
        }
    });
}

/**
 * Read the request's query string (`URL.search`) as the template.
 *
 * Everything after `?msg=` is the text — it is NOT split on "&" or "=", so
 * players can type those freely; "+" stays a plus, not a space. Only "#"
 * cannot be typed: everything after it never reaches the server. The text
 * must start with the label exactly (case and wording); how much padding
 * precedes it is not checked, so the world can restyle the field without
 * touching the server. The message is sanitized before the blank and
 * length checks, so markup that strips to nothing counts as blank.
 */
export function parseVrchatInput(search: string): VrchatInput {
    if (!search.startsWith(QUERY_PREFIX)) {
        return { kind: "footprint", reason: "no-query" };
    }

    const text = decodeQuery(search.slice(QUERY_PREFIX.length)).trimStart();
    if (!text.startsWith(TEMPLATE_LABEL)) {
        return { kind: "footprint", reason: "template" };
    }

    const content = sanitizeGuestbookText(text.slice(TEMPLATE_LABEL.length));
    if (!content) return { kind: "footprint", reason: "blank" };
    if (content.length > CONTENT_MAX) return { kind: "too-long" };
    return { kind: "message", content };
}
