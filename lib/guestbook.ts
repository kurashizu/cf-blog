/**
 * Guestbook repository — stores each message as an individual R2 object to
 * eliminate the read-modify-write race that the previous single-file design had.
 *
 * Key layout:   guestbook/messages/{id}.json
 * The previous `guestbook/messages.json` is ignored; if any legacy data exists
 * there, it can be deleted manually.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { r2Get, r2List, r2Put, r2Delete } from "./r2";

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
const GUESTBOOK_MSG_PREFIX = "guestbook/messages/";

function msgKey(id: string): string {
    return `${GUESTBOOK_MSG_PREFIX}${id}.json`;
}

async function fetchAllMessages(): Promise<GuestbookMessage[]> {
    const keys = await r2List(GUESTBOOK_MSG_PREFIX);
    const results = await Promise.all(
        keys.map(async (key) => {
            try {
                const text = await r2Get(key);
                return JSON.parse(text) as GuestbookMessage;
            } catch {
                return null;
            }
        }),
    );
    return results.filter((m): m is GuestbookMessage => m !== null);
}

export function createGuestbookRepo() {
    return {
        async getAll(): Promise<GuestbookMessage[]> {
            const messages = await fetchAllMessages();
            return messages
                .filter((m) => m.approved)
                .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        },

        async getAllForAdmin(): Promise<GuestbookMessage[]> {
            const messages = await fetchAllMessages();
            return messages.sort((a, b) =>
                b.timestamp.localeCompare(a.timestamp),
            );
        },

        async add(
            data: Pick<
                GuestbookMessage,
                "name" | "content" | "email" | "avatar"
            >,
        ): Promise<GuestbookMessage> {
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
            // Single-object write — atomic, no read-modify-write race.
            await r2Put(msgKey(newMessage.id), JSON.stringify(newMessage));
            return newMessage;
        },

        async approve(id: string): Promise<boolean> {
            const key = msgKey(id);
            let msg: GuestbookMessage;
            try {
                msg = JSON.parse(await r2Get(key)) as GuestbookMessage;
            } catch {
                return false;
            }
            msg.approved = true;
            await r2Put(key, JSON.stringify(msg));
            return true;
        },

        async delete(id: string): Promise<boolean> {
            const key = msgKey(id);
            // Verify existence before deleting so we return a meaningful false.
            try {
                await r2Get(key);
            } catch {
                return false;
            }
            await r2Delete(key);
            return true;
        },
    };
}

// Suppress unused-import lint for getCloudflareContext — kept available for
// future migrations that may need to call admin APIs or other bindings.
void getCloudflareContext;
