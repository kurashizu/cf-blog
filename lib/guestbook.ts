import { r2Paths } from './r2-paths';
import { r2Get, r2Put } from './r2';

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

interface GuestbookStore {
  messages: GuestbookMessage[];
  version: number;
}

const GUESTBOOK_AVATAR_COUNT = 9;

export function createGuestbookRepo() {
  const key = r2Paths.guestbookMessages;

  async function loadStore(): Promise<GuestbookStore> {
    try {
      const content = await r2Get(key);
      return JSON.parse(content) as GuestbookStore;
    } catch {
      return { messages: [], version: 1 };
    }
  }

  async function saveStore(store: GuestbookStore): Promise<void> {
    await r2Put(key, JSON.stringify(store, null, 2));
  }

  return {
    async getAll(): Promise<GuestbookMessage[]> {
      const store = await loadStore();
      return store.messages
        .filter((m) => m.approved)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },

    async getAllForAdmin(): Promise<GuestbookMessage[]> {
      const store = await loadStore();
      return store.messages.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    },

    async add(
      data: Pick<GuestbookMessage, 'name' | 'content' | 'email' | 'avatar'>
    ): Promise<GuestbookMessage> {
      const store = await loadStore();
      const newMessage: GuestbookMessage = {
        id: crypto.randomUUID(),
        name: data.name,
        content: data.content,
        timestamp: new Date().toISOString(),
        email: data.email,
        avatar: data.avatar,
        avatarIndex: data.avatar ? undefined : Math.floor(Math.random() * GUESTBOOK_AVATAR_COUNT),
        approved: true,
      };
      store.messages.push(newMessage);
      await saveStore(store);
      return newMessage;
    },

    async approve(id: string): Promise<boolean> {
      const store = await loadStore();
      const msg = store.messages.find((m) => m.id === id);
      if (!msg) return false;
      msg.approved = true;
      await saveStore(store);
      return true;
    },

    async delete(id: string): Promise<boolean> {
      const store = await loadStore();
      const idx = store.messages.findIndex((m) => m.id === id);
      if (idx === -1) return false;
      store.messages.splice(idx, 1);
      await saveStore(store);
      return true;
    },
  };
}