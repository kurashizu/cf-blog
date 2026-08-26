/**
 * Shared validation for the admin post APIs.
 *
 * `SLUG_REGEX`/`isValidSlug` and the size limits were copy-pasted between
 * `/admin/api/posts` and `/admin/api/posts/[slug]`; they live here now so
 * the two routes can't diverge.
 */

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const MAX_CONTENT_BYTES = 500_000;
export const MAX_TITLE_LEN = 300;
export const MAX_SLUG_LEN = 200;

export function isValidSlug(slug: string): boolean {
    return (
        SLUG_REGEX.test(slug) &&
        slug.length >= 1 &&
        slug.length <= MAX_SLUG_LEN
    );
}

export interface PostInput {
    title?: string;
    slug?: string;
    content?: string;
    date?: string;
    description?: string;
    tags?: string[];
    category?: string;
    coverImage?: string;
    externalUrl?: string;
    author?: string;
    draft?: boolean;
    published?: boolean;
}

/** Returns an error message, or null when the payload is acceptable. */
export function validatePostInput(body: PostInput): string | null {
    if (body.content && body.content.length > MAX_CONTENT_BYTES) {
        return `Content too large (max ${MAX_CONTENT_BYTES / 1000}KB)`;
    }
    if (body.title && body.title.length > MAX_TITLE_LEN) {
        return `Title too long (max ${MAX_TITLE_LEN} characters)`;
    }
    return null;
}

/**
 * Pick `next` when the client sent the field at all, else keep `current`.
 *
 * The update route used `next || current`, which made every optional field
 * write-once: clearing "External URL" sent `""`, which is falsy, so the old
 * value was restored and the field could never be emptied.
 */
export function coalesce<T>(next: T | undefined, current: T): T {
    return next === undefined ? current : next;
}
