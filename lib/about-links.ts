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
    };
}
