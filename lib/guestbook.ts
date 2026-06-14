import { getDB } from "./d1";

export interface GuestbookMessage {
    id: string;
    name: string;
    content: string;
    timestamp: string;
    email?: string;
    avatar?: string;
    avatarIndex?: number;
    approved: boolean;
}

const GUESTBOOK_AVATAR_COUNT = 9;

function rowToMessage(row: {
    id: string;
    name: string;
    content: string;
    email: string | null;
    timestamp: string;
    avatar: string | null;
    avatarIndex: number | null;
    approved: number;
}): GuestbookMessage {
    return {
        id: row.id,
        name: row.name,
        content: row.content,
        timestamp: row.timestamp,
        email: row.email || undefined,
        avatar: row.avatar || undefined,
        avatarIndex: row.avatarIndex ?? undefined,
        approved: row.approved === 1,
    };
}

export function createGuestbookRepo() {
    return {
        async getAll(): Promise<GuestbookMessage[]> {
            const db = getDB();
            const result = await db
                .prepare(
                    `SELECT id, name, content, email, timestamp, avatar,
                            avatar_index AS avatarIndex, approved
                     FROM guestbook_messages
                     WHERE approved = 1
                     ORDER BY timestamp DESC`,
                )
                .all();
            const rows = (result.results ?? []) as unknown as {
                id: string;
                name: string;
                content: string;
                email: string | null;
                timestamp: string;
                avatar: string | null;
                avatarIndex: number | null;
                approved: number;
            }[];
            return rows.map(rowToMessage);
        },

        async getAllForAdmin(): Promise<GuestbookMessage[]> {
            const db = getDB();
            const result = await db
                .prepare(
                    `SELECT id, name, content, email, timestamp, avatar,
                            avatar_index AS avatarIndex, approved
                     FROM guestbook_messages
                     ORDER BY timestamp DESC`,
                )
                .all();
            const rows = (result.results ?? []) as unknown as {
                id: string;
                name: string;
                content: string;
                email: string | null;
                timestamp: string;
                avatar: string | null;
                avatarIndex: number | null;
                approved: number;
            }[];
            return rows.map(rowToMessage);
        },

        async add(
            data: Pick<
                GuestbookMessage,
                "name" | "content" | "email" | "avatar"
            >,
        ): Promise<GuestbookMessage> {
            const db = getDB();
            const newMessage: GuestbookMessage = {
                id: crypto.randomUUID(),
                name: data.name,
                content: data.content,
                timestamp: new Date().toISOString(),
                email: data.email,
                avatar: data.avatar,
                avatarIndex: data.avatar
                    ? undefined
                    : Math.floor(Math.random() * GUESTBOOK_AVATAR_COUNT),
                approved: true,
            };
            await db
                .prepare(
                    `INSERT INTO guestbook_messages
                     (id, name, content, email, timestamp, avatar, avatar_index, approved)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                )
                .bind(
                    newMessage.id,
                    newMessage.name,
                    newMessage.content,
                    newMessage.email ?? null,
                    newMessage.timestamp,
                    newMessage.avatar ?? null,
                    newMessage.avatarIndex ?? null,
                    newMessage.approved ? 1 : 0,
                )
                .run();
            return newMessage;
        },

        async approve(id: string): Promise<boolean> {
            const db = getDB();
            const result = await db
                .prepare(
                    "UPDATE guestbook_messages SET approved = 1 WHERE id = ?",
                )
                .bind(id)
                .run();
            return (result.meta.changes ?? 0) > 0;
        },

        async delete(id: string): Promise<boolean> {
            const db = getDB();
            const result = await db
                .prepare("DELETE FROM guestbook_messages WHERE id = ?")
                .bind(id)
                .run();
            return (result.meta.changes ?? 0) > 0;
        },
    };
}
