import { getDB } from "./d1";

export interface AboutLink {
    id: string;
    name: string;
    url: string;
    icon: string;
    description: string;
    groupName: string;
    sortOrder: number;
    visible: boolean;
}

/**
 * Icon names the public /about page can actually draw.
 *
 * Must stay in sync with `ICON_MAP` in `app/about/page.tsx`: that map is the
 * renderer, and any name missing from it silently degrades to the generic
 * link glyph. The admin UI offers exactly this list so an editor can't pick
 * an icon that won't show up.
 */
export const ABOUT_LINK_ICONS = [
    "link",
    "globe",
    "home",
    "newspaper",
    "book",
    "github",
    "code",
    "bot",
    "mail",
    "twitter",
    "mastodon",
    "message-square",
    "tv",
    "film",
    "rss",
    "rss-feed",
    "share-2",
] as const;

export type AboutLinkIcon = (typeof ABOUT_LINK_ICONS)[number];

/**
 * Known groups. Only the `rendered` ones have a section on /about — the
 * schema default (`products`) is stored but nothing draws it, so the admin
 * marks it as such instead of letting an editor wonder why a link vanished.
 */
export const ABOUT_LINK_GROUPS: {
    value: string;
    label: string;
    rendered: boolean;
}[] = [
    { value: "quick-links", label: "Quick Links", rendered: true },
    { value: "friends", label: "Friends", rendered: true },
    { value: "products", label: "Products", rendered: false },
];

export function isRenderedGroup(groupName: string): boolean {
    return ABOUT_LINK_GROUPS.some(
        (g) => g.value === groupName && g.rendered,
    );
}

/* ── Validation ───────────────────────────────────────────────────────── */

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ID_LEN = 64;
const MAX_NAME_LEN = 120;
const MAX_URL_LEN = 2048;
const MAX_DESCRIPTION_LEN = 300;

export function isValidLinkId(id: string): boolean {
    return (
        typeof id === "string" &&
        id.length >= 1 &&
        id.length <= MAX_ID_LEN &&
        SLUG_REGEX.test(id)
    );
}

export function isValidHttpUrl(url: string): boolean {
    if (typeof url !== "string" || url.length > MAX_URL_LEN) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

/** Fields accepted from the admin API. All optional so PUT can patch. */
export interface AboutLinkInput {
    id?: unknown;
    name?: unknown;
    url?: unknown;
    icon?: unknown;
    description?: unknown;
    groupName?: unknown;
    sortOrder?: unknown;
    visible?: unknown;
}

/** A validated, normalised patch — only the keys the caller actually sent. */
export interface AboutLinkPatch {
    name?: string;
    url?: string;
    icon?: string;
    description?: string;
    groupName?: string;
    sortOrder?: number;
    visible?: boolean;
}

/**
 * Validates and normalises a request body. Returns either an `error` message
 * suitable for a 400, or the cleaned patch. `requireAll` is set on create,
 * where name/url are mandatory rather than optional.
 */
export function parseAboutLinkInput(
    input: AboutLinkInput,
    requireAll: boolean,
): { error: string } | { patch: AboutLinkPatch } {
    const patch: AboutLinkPatch = {};

    if (input.name !== undefined || requireAll) {
        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (!name) return { error: "Name is required." };
        if (name.length > MAX_NAME_LEN) {
            return { error: `Name must be ${MAX_NAME_LEN} characters or fewer.` };
        }
        patch.name = name;
    }

    if (input.url !== undefined || requireAll) {
        const url = typeof input.url === "string" ? input.url.trim() : "";
        if (!url) return { error: "URL is required." };
        if (!isValidHttpUrl(url)) {
            return {
                error: "URL must be an absolute http:// or https:// address.",
            };
        }
        patch.url = url;
    }

    if (input.icon !== undefined) {
        const icon = typeof input.icon === "string" ? input.icon.trim() : "";
        if (!(ABOUT_LINK_ICONS as readonly string[]).includes(icon)) {
            return {
                error: `Unknown icon "${icon}". Allowed: ${ABOUT_LINK_ICONS.join(", ")}.`,
            };
        }
        patch.icon = icon;
    }

    if (input.description !== undefined) {
        const description =
            typeof input.description === "string"
                ? input.description.trim()
                : "";
        if (description.length > MAX_DESCRIPTION_LEN) {
            return {
                error: `Description must be ${MAX_DESCRIPTION_LEN} characters or fewer.`,
            };
        }
        patch.description = description;
    }

    if (input.groupName !== undefined) {
        const groupName =
            typeof input.groupName === "string" ? input.groupName.trim() : "";
        // Deliberately a slug check, not a whitelist: a new group only needs
        // a section on /about, and blocking it here would be a second edit.
        if (!groupName || !SLUG_REGEX.test(groupName)) {
            return {
                error: "Group must be a lowercase slug (letters, numbers, hyphens).",
            };
        }
        patch.groupName = groupName;
    }

    if (input.sortOrder !== undefined) {
        const sortOrder = Number(input.sortOrder);
        if (!Number.isInteger(sortOrder)) {
            return { error: "Sort order must be an integer." };
        }
        patch.sortOrder = sortOrder;
    }

    if (input.visible !== undefined) {
        patch.visible = Boolean(input.visible);
    }

    return { patch };
}

/* ── Repo ─────────────────────────────────────────────────────────────── */

const SELECT_COLUMNS = `id, name, url, icon, description,
                        group_name, sort_order, visible`;

/** Gap between adjacent sort_order values, so a manual nudge has room. */
const SORT_STEP = 10;

function rowToLink(row: Record<string, unknown>): AboutLink {
    return {
        id: row.id as string,
        name: row.name as string,
        url: row.url as string,
        icon: (row.icon as string) || "link",
        description: (row.description as string) ?? "",
        groupName: (row.group_name as string) ?? "products",
        sortOrder: (row.sort_order as number) ?? 0,
        visible: Boolean(row.visible),
    };
}

export function createAboutLinksRepo() {
    const db = getDB();

    async function getById(id: string): Promise<AboutLink | null> {
        const row = await db
            .prepare(
                `SELECT ${SELECT_COLUMNS}
                 FROM about_links
                 WHERE id = ?`,
            )
            .bind(id)
            .first<Record<string, unknown>>();
        return row ? rowToLink(row) : null;
    }

    /** Ids of one group in display order — the basis for every reorder. */
    async function groupIds(groupName: string): Promise<string[]> {
        const rows = await db
            .prepare(
                `SELECT id
                 FROM about_links
                 WHERE group_name = ?
                 ORDER BY sort_order ASC, id ASC`,
            )
            .bind(groupName)
            .all<{ id: string }>();
        return (rows.results ?? []).map((r) => r.id);
    }

    /**
     * Rewrites sort_order for a whole group from an ordered id list. Renumbering
     * rather than swapping two rows is what makes reordering survive the
     * duplicate/zero sort_order values the table starts out with.
     */
    async function renumber(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        await db.batch(
            ids.map((id, index) =>
                db
                    .prepare(
                        `UPDATE about_links
                         SET sort_order = ?, updated_at = datetime('now')
                         WHERE id = ?`,
                    )
                    .bind((index + 1) * SORT_STEP, id),
            ),
        );
    }

    return {
        async getVisible(): Promise<AboutLink[]> {
            try {
                const rows = await db
                    .prepare(
                        `SELECT id, name, url, icon, description,
                                group_name, sort_order, visible
                         FROM about_links
                         WHERE visible = 1
                         ORDER BY sort_order ASC, id ASC`,
                    )
                    .all<Record<string, unknown>>();
                return (rows.results ?? []).map(rowToLink);
            } catch {
                return [];
            }
        },
        async getVisibleByGroup(
            groupName: string,
        ): Promise<AboutLink[]> {
            try {
                const rows = await db
                    .prepare(
                        `SELECT id, name, url, icon, description,
                                group_name, sort_order, visible
                         FROM about_links
                         WHERE visible = 1
                           AND group_name = ?
                         ORDER BY sort_order ASC, id ASC`,
                    )
                    .bind(groupName)
                    .all<Record<string, unknown>>();
                return (rows.results ?? []).map(rowToLink);
            } catch {
                return [];
            }
        },

        /**
         * Every link, hidden ones included. Unlike the two public readers this
         * does NOT swallow errors: the admin must see a failed query as an
         * error, not as an empty list it might then "fix" by re-creating rows.
         */
        async getAllForAdmin(): Promise<AboutLink[]> {
            const rows = await db
                .prepare(
                    `SELECT ${SELECT_COLUMNS}
                     FROM about_links
                     ORDER BY group_name ASC, sort_order ASC, id ASC`,
                )
                .all<Record<string, unknown>>();
            return (rows.results ?? []).map(rowToLink);
        },

        getById,

        async create(
            id: string,
            patch: AboutLinkPatch,
        ): Promise<AboutLink | null> {
            if (await getById(id)) return null;

            const groupName = patch.groupName ?? "products";
            // Append to the end of the group unless an explicit order is given.
            let sortOrder = patch.sortOrder;
            if (sortOrder === undefined) {
                const max = await db
                    .prepare(
                        `SELECT MAX(sort_order) AS max_sort
                         FROM about_links
                         WHERE group_name = ?`,
                    )
                    .bind(groupName)
                    .first<{ max_sort: number | null }>();
                sortOrder = (max?.max_sort ?? 0) + SORT_STEP;
            }

            await db
                .prepare(
                    `INSERT INTO about_links
                         (id, name, url, icon, description,
                          group_name, sort_order, visible)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                )
                .bind(
                    id,
                    patch.name ?? "",
                    patch.url ?? "",
                    patch.icon ?? "link",
                    patch.description ?? "",
                    groupName,
                    sortOrder,
                    patch.visible === false ? 0 : 1,
                )
                .run();

            return getById(id);
        },

        /** Returns null when the id doesn't exist. An empty patch is a no-op. */
        async update(
            id: string,
            patch: AboutLinkPatch,
        ): Promise<AboutLink | null> {
            const existing = await getById(id);
            if (!existing) return null;

            const sets: string[] = [];
            const values: (string | number)[] = [];
            const push = (column: string, value: string | number) => {
                sets.push(`${column} = ?`);
                values.push(value);
            };

            if (patch.name !== undefined) push("name", patch.name);
            if (patch.url !== undefined) push("url", patch.url);
            if (patch.icon !== undefined) push("icon", patch.icon);
            if (patch.description !== undefined) {
                push("description", patch.description);
            }
            if (patch.groupName !== undefined) {
                push("group_name", patch.groupName);
            }
            if (patch.sortOrder !== undefined) {
                push("sort_order", patch.sortOrder);
            }
            if (patch.visible !== undefined) {
                push("visible", patch.visible ? 1 : 0);
            }

            if (sets.length === 0) return existing;

            sets.push(`updated_at = datetime('now')`);
            values.push(id);

            await db
                .prepare(
                    `UPDATE about_links
                     SET ${sets.join(", ")}
                     WHERE id = ?`,
                )
                .bind(...values)
                .run();

            // Moving a link into another group would otherwise land on whatever
            // sort_order it had in the old one; put it at the end instead.
            if (
                patch.groupName !== undefined &&
                patch.groupName !== existing.groupName &&
                patch.sortOrder === undefined
            ) {
                const ids = await groupIds(patch.groupName);
                await renumber([...ids.filter((x) => x !== id), id]);
            }

            return getById(id);
        },

        async delete(id: string): Promise<boolean> {
            const result = await db
                .prepare(`DELETE FROM about_links WHERE id = ?`)
                .bind(id)
                .run();
            return (result.meta?.changes ?? 0) > 0;
        },

        /**
         * Moves a link one slot within its group. Returns false when the id is
         * unknown or it's already at the end it was asked to move toward.
         */
        async move(id: string, direction: "up" | "down"): Promise<boolean> {
            const link = await getById(id);
            if (!link) return false;

            const ids = await groupIds(link.groupName);
            const from = ids.indexOf(id);
            const to = direction === "up" ? from - 1 : from + 1;
            if (from < 0 || to < 0 || to >= ids.length) return false;

            [ids[from], ids[to]] = [ids[to], ids[from]];
            await renumber(ids);
            return true;
        },
    };
}
