/**
 * Saved conversations, in IndexedDB.
 *
 * localStorage would have been simpler, but it only holds strings and is capped
 * around a few megabytes — one screenshot would exhaust it. IndexedDB stores
 * Blobs natively, so a turn keeps the picture or recording that went with it and
 * a restored conversation is the whole exchange rather than its text.
 *
 * Everything here degrades to a no-op when the database cannot be opened
 * (private windows block it in some browsers). The chat still works; it just
 * does not persist.
 */

const DB_NAME = 'krsz-chatbot';
/**
 * Bumped to 2 because a build shipped a version-1 database whose object store
 * was never created; opening that one succeeds and then every transaction
 * throws NotFoundError. The upgrade path below creates the store whenever it is
 * missing, so both a fresh browser and one holding the empty database converge.
 */
const DB_VERSION = 2;
const STORE = 'sessions';

/** One attachment, kept as bytes rather than an object URL. */
export interface StoredAttachment {
	kind: 'image' | 'audio';
	name: string;
	blob: Blob;
}

export interface StoredTurn {
	role: 'user' | 'assistant';
	content: string;
	notice?: boolean;
	attachments?: StoredAttachment[];
}

export interface Session {
	id: string;
	title: string;
	/** Epoch ms of the last change, for ordering the list. */
	updated: number;
	/**
	 * Whether this conversation runs with reasoning on. Fixed for the session:
	 * the chat template injects `<|think|>` into the first system turn, so it
	 * governs the whole exchange rather than one message, and flipping it
	 * mid-conversation rewrites the prefix every earlier turn was written under.
	 */
	think: boolean;
	turns: StoredTurn[];
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve) => {
		try {
			const req = indexedDB.open(DB_NAME, DB_VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(STORE)) {
					const store = db.createObjectStore(STORE, { keyPath: 'id' });
					// The list is always shown newest first.
					store.createIndex('updated', 'updated');
				}
			};
			req.onsuccess = () => {
				const db = req.result;
				// Defensive: an older database can exist at this version without the
				// store, and a transaction against it would throw on every call.
				if (!db.objectStoreNames.contains(STORE)) {
					db.close();
					resolve(null);
					return;
				}
				resolve(db);
			};
			req.onerror = () => resolve(null);
			// Safari can leave a request hanging when storage is denied.
			req.onblocked = () => resolve(null);
		} catch {
			resolve(null);
		}
	});
	return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
	return openDb().then(
		(db) =>
			new Promise<T | null>((resolve) => {
				if (!db) return resolve(null);
				try {
					const t = db.transaction(STORE, mode);
					const req = run(t.objectStore(STORE));
					req.onsuccess = () => resolve(req.result);
					req.onerror = () => resolve(null);
				} catch {
					resolve(null);
				}
			})
	);
}

/** Every saved conversation, most recently touched first. */
export async function loadSessions(): Promise<Session[]> {
	const all = await tx<Session[]>('readonly', (s) => s.getAll() as IDBRequest<Session[]>);
	if (!all) return [];
	return all.sort((a, b) => b.updated - a.updated);
}

export async function putSession(sess: Session): Promise<void> {
	await tx('readwrite', (s) => s.put(sess) as IDBRequest<IDBValidKey>);
}

export async function deleteSession(id: string): Promise<void> {
	await tx('readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>);
}

export async function clearSessions(): Promise<void> {
	await tx('readwrite', (s) => s.clear() as unknown as IDBRequest<undefined>);
}

/**
 * Roughly how much space the saved conversations occupy, for the storage panel.
 * Blob sizes are exact; the text is counted as UTF-16, which is what the engine
 * stores.
 */
export async function sessionsSize(): Promise<{ count: number; bytes: number }> {
	const all = await loadSessions();
	let bytes = 0;
	for (const s of all) {
		bytes += s.title.length * 2;
		for (const t of s.turns) {
			bytes += t.content.length * 2;
			for (const a of t.attachments ?? []) bytes += a.blob.size + a.name.length * 2;
		}
	}
	return { count: all.length, bytes };
}

/** A short name for the list, taken from the first thing the visitor said. */
export function titleFor(turns: { role: string; content: string; notice?: boolean }[]): string {
	const first = turns.find((t) => t.role === 'user' && !t.notice && t.content.trim());
	if (!first) return 'new conversation';
	const line = first.content.trim().split('\n')[0];
	return line.length > 40 ? line.slice(0, 40) + '…' : line;
}

export function newSessionId(): string {
	return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
