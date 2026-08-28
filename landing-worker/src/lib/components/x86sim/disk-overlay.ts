/**
 * Persistence for the guest's disk writes, in the browser's origin-private
 * filesystem.
 *
 * The image itself is read-only and streamed from R2, so v86 keeps every block
 * the guest writes in memory and drops it when the tab does. What is saved here
 * is exactly that set — the difference between the image and what the guest has
 * made of it — which is small enough to write often: a package install is a few
 * MB of blocks against a gigabyte of image.
 *
 * Nothing here caches the read-only side. The chunks are served immutable with a
 * year's max-age, so the browser's own HTTP cache already holds them and a
 * second copy in OPFS would cost the same bytes for the same effect.
 *
 * Blocks are 256 bytes, which is v86's own granularity, and the file records
 * only their number and contents:
 *
 *   magic "KRSZVM01" | u32 blockSize | u32 count | u32 versionLen | version
 *   then count × (u32 blockNumber | blockSize bytes)
 *
 * The version is the disk image's, and a mismatch throws the file away: blocks
 * are offsets into one particular filesystem, and replaying them onto a
 * different build would corrupt it in a way the guest could not explain.
 */

const MAGIC = 'KRSZVM01';
const BLOCK_BYTES = 256;
const HEADER_BYTES = 8 + 4 + 4 + 4;

/** Past this the overlay is doing the image's job, and the browser will start refusing writes. */
export const OVERLAY_LIMIT = 192 * 1024 * 1024;

/** The shape v86's async buffers expose, whatever the build calls the class. */
export interface DiskBuffer {
	block_cache: Map<number, Uint8Array>;
	block_cache_is_write: Set<number>;
}

export interface OverlayStats {
	blocks: number;
	bytes: number;
}

function isDiskBuffer(value: unknown): value is DiskBuffer {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<DiskBuffer>;
	return candidate.block_cache instanceof Map && candidate.block_cache_is_write instanceof Set;
}

/**
 * Finds the disk buffer inside the emulator by shape rather than by name: the
 * distributed v86 is minified and exposes no accessor for it, so the property
 * path is not something to hard-code and expect to survive an upgrade.
 */
export function findDiskBuffer(root: unknown, maxDepth = 8): DiskBuffer | null {
	const seen = new Set<unknown>();
	// The graph runs through the emulator's memory, and enumerating a view over
	// 256 MB of it would build a quarter-billion-element array. Nothing that can
	// hold a disk buffer is one of these.
	const traversable = (value: unknown): boolean =>
		!!value &&
		typeof value === 'object' &&
		!ArrayBuffer.isView(value) &&
		!(value instanceof ArrayBuffer) &&
		!(value instanceof Node) &&
		!(value instanceof Map) &&
		!(value instanceof Set) &&
		!seen.has(value);

	let frontier: unknown[] = [root];
	let visited = 0;
	for (let depth = 0; depth <= maxDepth && frontier.length; depth++) {
		const next: unknown[] = [];
		for (const node of frontier) {
			if (!traversable(node) || visited++ > 50000) continue;
			seen.add(node);
			if (isDiskBuffer(node)) return node;
			let values: unknown[];
			try {
				values = Object.values(node as Record<string, unknown>);
			} catch {
				// Getters that throw when read out of context — skip the whole node.
				continue;
			}
			for (const value of values) if (traversable(value)) next.push(value);
		}
		frontier = next;
	}
	return null;
}

export function overlayStats(buffer: DiskBuffer | null): OverlayStats {
	const blocks = buffer ? buffer.block_cache_is_write.size : 0;
	return { blocks, bytes: blocks * BLOCK_BYTES };
}

async function overlayFile(name: string, create: boolean): Promise<FileSystemFileHandle | null> {
	if (!navigator.storage?.getDirectory) return null;
	try {
		const dir = await navigator.storage.getDirectory();
		return await dir.getFileHandle(`x86sim-${name}.overlay`, { create });
	} catch {
		// A missing file when create is false, or a browser that has OPFS behind a
		// setting. Either way there is nothing to restore and nowhere to save.
		return null;
	}
}

/** Writes the guest's changed blocks. Returns what was written, or null if it could not be. */
export async function saveOverlay(
	name: string,
	version: string,
	buffer: DiskBuffer
): Promise<OverlayStats | null> {
	const dirty = [...buffer.block_cache_is_write].filter((n) => buffer.block_cache.has(n));
	const versionBytes = new TextEncoder().encode(version);
	const total = HEADER_BYTES + versionBytes.length + dirty.length * (4 + BLOCK_BYTES);
	if (total > OVERLAY_LIMIT) return null;

	const out = new Uint8Array(total);
	const view = new DataView(out.buffer);
	out.set(new TextEncoder().encode(MAGIC), 0);
	view.setUint32(8, BLOCK_BYTES, true);
	view.setUint32(12, dirty.length, true);
	view.setUint32(16, versionBytes.length, true);
	out.set(versionBytes, HEADER_BYTES);

	let offset = HEADER_BYTES + versionBytes.length;
	for (const block of dirty) {
		view.setUint32(offset, block, true);
		const data = buffer.block_cache.get(block);
		// A short block would silently shift everything after it, so pad rather
		// than trusting every entry to be exactly one block long.
		out.set(data && data.length === BLOCK_BYTES ? data : new Uint8Array(BLOCK_BYTES), offset + 4);
		offset += 4 + BLOCK_BYTES;
	}

	const handle = await overlayFile(name, true);
	if (!handle) return null;
	try {
		const writable = await handle.createWritable();
		await writable.write(out);
		await writable.close();
	} catch {
		return null;
	}
	return { blocks: dirty.length, bytes: dirty.length * BLOCK_BYTES };
}

/**
 * Replays a saved overlay into a freshly built buffer. Must run before the guest
 * executes anything: a block read before it is replaced would be the image's
 * version of a filesystem the rest of the overlay assumes has moved on.
 */
export async function loadOverlay(
	name: string,
	version: string,
	buffer: DiskBuffer
): Promise<OverlayStats | null> {
	const handle = await overlayFile(name, false);
	if (!handle) return null;

	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
	} catch {
		return null;
	}
	if (bytes.length < HEADER_BYTES) return null;

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const decoder = new TextDecoder();
	if (decoder.decode(bytes.subarray(0, 8)) !== MAGIC) return null;
	const blockSize = view.getUint32(8, true);
	const count = view.getUint32(12, true);
	const versionLen = view.getUint32(16, true);
	if (blockSize !== BLOCK_BYTES) return null;
	if (bytes.length < HEADER_BYTES + versionLen) return null;
	if (decoder.decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + versionLen)) !== version) return null;

	let offset = HEADER_BYTES + versionLen;
	if (bytes.length < offset + count * (4 + BLOCK_BYTES)) return null;
	for (let i = 0; i < count; i++) {
		const block = view.getUint32(offset, true);
		// Copied, not viewed: the guest writes into these arrays in place, and a
		// view would have the whole file behind it.
		buffer.block_cache.set(block, bytes.slice(offset + 4, offset + 4 + BLOCK_BYTES));
		buffer.block_cache_is_write.add(block);
		offset += 4 + BLOCK_BYTES;
	}
	return { blocks: count, bytes: count * BLOCK_BYTES };
}

export async function clearOverlay(name: string): Promise<void> {
	if (!navigator.storage?.getDirectory) return;
	try {
		const dir = await navigator.storage.getDirectory();
		await dir.removeEntry(`x86sim-${name}.overlay`);
	} catch {
		/* nothing saved */
	}
}

/** What a saved overlay occupies right now, without loading it. */
export async function storedOverlaySize(name: string): Promise<number> {
	const handle = await overlayFile(name, false);
	if (!handle) return 0;
	try {
		return (await handle.getFile()).size;
	} catch {
		return 0;
	}
}
