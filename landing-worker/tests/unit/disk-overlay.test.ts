import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import {
	BLOCK_BYTES,
	OVERLAY_LIMIT,
	bufferStore,
	chunkStore,
	findDiskBuffer,
	overlayStats,
	replayOverlay,
	type DiskBuffer
} from '../../src/lib/components/krsz-vm/disk-overlay';

/**
 * These decide what gets written back onto someone's emulated disk, so the
 * rejection cases matter: replaying a file that does not match the image is
 * how an overlay corrupts the machine it was meant to restore.
 */

/* findDiskBuffer skips DOM nodes while walking the emulator, so it needs a
   `Node` to test `instanceof` against. These tests run in Node, where there is
   none — a stand-in class is enough and far cheaper than pulling in jsdom for
   one identity check. Nothing under test constructs one. */
let addedNode = false;
beforeAll(() => {
	if (!('Node' in globalThis)) {
		(globalThis as { Node?: unknown }).Node = class Node {};
		addedNode = true;
	}
});
afterAll(() => {
	if (addedNode) delete (globalThis as { Node?: unknown }).Node;
});

// Must match MAGIC in the module under test.
const MAGIC = 'KRSZVM01';
const HEADER_BYTES = 8 + 4 + 4 + 4;

/** An overlay file, built the way saveOverlay lays one out. */
function overlayFile(
	blocks: [number, Uint8Array][],
	opts: { magic?: string; blockSize?: number; version?: string; count?: number } = {}
): Uint8Array {
	const version = opts.version ?? 'v1';
	const versionBytes = new TextEncoder().encode(version);
	const body = blocks.length * (4 + BLOCK_BYTES);
	const out = new Uint8Array(HEADER_BYTES + versionBytes.length + body);
	const view = new DataView(out.buffer);
	out.set(new TextEncoder().encode(opts.magic ?? MAGIC), 0);
	view.setUint32(8, opts.blockSize ?? BLOCK_BYTES, true);
	view.setUint32(12, opts.count ?? blocks.length, true);
	view.setUint32(16, versionBytes.length, true);
	out.set(versionBytes, HEADER_BYTES);
	let offset = HEADER_BYTES + versionBytes.length;
	for (const [num, data] of blocks) {
		view.setUint32(offset, num, true);
		out.set(data, offset + 4);
		offset += 4 + BLOCK_BYTES;
	}
	return out;
}

const blockOf = (fill: number) => new Uint8Array(BLOCK_BYTES).fill(fill);

function emptyBuffer(): DiskBuffer {
	return { block_cache: new Map(), block_cache_is_write: new Set() };
}

describe('bufferStore', () => {
	it('reports only blocks that are both written and cached', () => {
		const buffer = emptyBuffer();
		buffer.block_cache.set(1, blockOf(1));
		buffer.block_cache.set(2, blockOf(2));
		buffer.block_cache_is_write.add(1);
		// marked written but evicted from the cache: nothing to save
		buffer.block_cache_is_write.add(9);
		expect(bufferStore(buffer).dirtyBlocks()).toEqual([1]);
	});

	it('reads a cached block and nothing else', () => {
		const buffer = emptyBuffer();
		buffer.block_cache.set(4, blockOf(7));
		const store = bufferStore(buffer);
		expect(store.readBlock(4)?.[0]).toBe(7);
		expect(store.readBlock(5)).toBeUndefined();
	});

	it('marks a written block dirty', () => {
		const buffer = emptyBuffer();
		bufferStore(buffer).writeBlock(3, blockOf(9));
		expect(buffer.block_cache.get(3)?.[0]).toBe(9);
		expect(buffer.block_cache_is_write.has(3)).toBe(true);
	});

	it('has nothing to save on an untouched disk', () => {
		expect(bufferStore(emptyBuffer()).dirtyBlocks()).toEqual([]);
	});
});

describe('chunkStore', () => {
	const CHUNK_BYTES = BLOCK_BYTES * 4; // four blocks per chunk, for legibility

	function setup() {
		const chunks = new Map<number, Uint8Array>();
		const dirty = new Set<number>();
		const ensureChunk = vi.fn((index: number) => {
			let chunk = chunks.get(index);
			if (!chunk) {
				chunk = new Uint8Array(CHUNK_BYTES);
				chunks.set(index, chunk);
			}
			return chunk;
		});
		return { chunks, dirty, ensureChunk, store: chunkStore(chunks, dirty, CHUNK_BYTES, ensureChunk) };
	}

	it('writes a block into the chunk that contains it', () => {
		const { chunks, store, ensureChunk } = setup();
		store.writeBlock(5, blockOf(0xab));
		// block 5 is the second block of chunk 1
		expect(ensureChunk).toHaveBeenCalledWith(1);
		expect(chunks.get(1)![BLOCK_BYTES]).toBe(0xab);
		expect(chunks.get(1)![0]).toBe(0);
	});

	it('reads a block back out of its chunk', () => {
		const { store } = setup();
		store.writeBlock(6, blockOf(0xcd));
		const read = store.readBlock(6);
		expect(read?.length).toBe(BLOCK_BYTES);
		expect(read?.[0]).toBe(0xcd);
	});

	it('returns undefined for a block whose chunk is not resident', () => {
		const { store } = setup();
		expect(store.readBlock(99)).toBeUndefined();
	});

	it('brings in a chunk that was never touched, so a load can lay bytes over it', () => {
		const { chunks, store, ensureChunk } = setup();
		expect(chunks.size).toBe(0);
		store.writeBlock(9, blockOf(1));
		expect(ensureChunk).toHaveBeenCalledWith(2);
		expect(chunks.size).toBe(1);
	});

	it('tracks dirty blocks by block number, not chunk', () => {
		const { store, dirty } = setup();
		store.writeBlock(0, blockOf(1));
		store.writeBlock(1, blockOf(2));
		store.writeBlock(4, blockOf(3));
		expect([...dirty].sort((a, b) => a - b)).toEqual([0, 1, 4]);
		expect(store.dirtyBlocks().length).toBe(3);
	});

	it('places the last block of a chunk at its far end', () => {
		const { chunks, store } = setup();
		store.writeBlock(3, blockOf(0xff));
		expect(chunks.get(0)![CHUNK_BYTES - BLOCK_BYTES]).toBe(0xff);
		expect(chunks.get(0)![CHUNK_BYTES - 1]).toBe(0xff);
	});
});

describe('the two stores interoperate', () => {
	it('replays a v86 overlay into a QEMU chunk store', () => {
		// the file format is shared on purpose: either machine reads the other's
		const source = emptyBuffer();
		bufferStore(source).writeBlock(5, blockOf(0x42));
		const file = overlayFile([[5, blockOf(0x42)]]);

		const chunks = new Map<number, Uint8Array>();
		const dirty = new Set<number>();
		const chunkBytes = BLOCK_BYTES * 4;
		const target = chunkStore(chunks, dirty, chunkBytes, (i) => {
			const chunk = chunks.get(i) ?? new Uint8Array(chunkBytes);
			chunks.set(i, chunk);
			return chunk;
		});

		expect(replayOverlay(file, 'v1', target)).toEqual({ blocks: 1, bytes: BLOCK_BYTES });
		expect(target.readBlock(5)?.[0]).toBe(0x42);
	});
});

describe('overlayStats', () => {
	it('counts written blocks and their bytes', () => {
		const buffer = emptyBuffer();
		buffer.block_cache_is_write.add(1);
		buffer.block_cache_is_write.add(2);
		expect(overlayStats(buffer)).toEqual({ blocks: 2, bytes: 2 * BLOCK_BYTES });
	});

	it('is zero for an untouched disk', () => {
		expect(overlayStats(emptyBuffer())).toEqual({ blocks: 0, bytes: 0 });
	});

	it('is zero when there is no buffer at all', () => {
		expect(overlayStats(null)).toEqual({ blocks: 0, bytes: 0 });
	});
});

describe('replayOverlay', () => {
	it('writes every block in the file', () => {
		const written = new Map<number, Uint8Array>();
		const store = {
			dirtyBlocks: () => [],
			readBlock: () => undefined,
			writeBlock: (block: number, data: Uint8Array) => written.set(block, data)
		};
		const file = overlayFile([
			[0, blockOf(1)],
			[7, blockOf(2)],
			[1000, blockOf(3)]
		]);
		expect(replayOverlay(file, 'v1', store)).toEqual({ blocks: 3, bytes: 3 * BLOCK_BYTES });
		expect([...written.keys()].sort((a, b) => a - b)).toEqual([0, 7, 1000]);
		expect(written.get(7)![0]).toBe(2);
	});

	it('copies the bytes rather than viewing the file', () => {
		// the guest writes into these arrays in place; a view would have the
		// whole overlay file sitting behind it
		const written = new Map<number, Uint8Array>();
		const store = {
			dirtyBlocks: () => [],
			readBlock: () => undefined,
			writeBlock: (block: number, data: Uint8Array) => written.set(block, data)
		};
		const file = overlayFile([[0, blockOf(5)]]);
		replayOverlay(file, 'v1', store);
		const block = written.get(0)!;
		expect(block.byteLength).toBe(BLOCK_BYTES);
		expect(block.buffer.byteLength).toBe(BLOCK_BYTES);
		block[0] = 99;
		// mutating the replayed block must not reach back into the file
		expect(file[HEADER_BYTES + 2 + 4]).toBe(5);
	});

	it('replays an empty overlay as no blocks', () => {
		const store = { dirtyBlocks: () => [], readBlock: () => undefined, writeBlock: vi.fn() };
		expect(replayOverlay(overlayFile([]), 'v1', store)).toEqual({ blocks: 0, bytes: 0 });
		expect(store.writeBlock).not.toHaveBeenCalled();
	});

	const rejectingStore = () => ({
		dirtyBlocks: () => [],
		readBlock: () => undefined,
		writeBlock: vi.fn()
	});

	it('refuses a file that is too short to hold a header', () => {
		const store = rejectingStore();
		for (const n of [0, 1, HEADER_BYTES - 1]) {
			expect(replayOverlay(new Uint8Array(n), 'v1', store)).toBeNull();
		}
		expect(store.writeBlock).not.toHaveBeenCalled();
	});

	it('refuses a file without the magic', () => {
		const store = rejectingStore();
		expect(replayOverlay(overlayFile([[0, blockOf(1)]], { magic: 'NOTMINE1' }), 'v1', store)).toBeNull();
		expect(store.writeBlock).not.toHaveBeenCalled();
	});

	it('refuses a different block size', () => {
		const store = rejectingStore();
		expect(replayOverlay(overlayFile([[0, blockOf(1)]], { blockSize: 512 }), 'v1', store)).toBeNull();
		expect(store.writeBlock).not.toHaveBeenCalled();
	});

	it('refuses an overlay saved against another image version', () => {
		// the whole point: replaying someone's changes onto a different image is
		// how a restore corrupts a disk
		const store = rejectingStore();
		expect(replayOverlay(overlayFile([[0, blockOf(1)]], { version: 'v1' }), 'v2', store)).toBeNull();
		expect(store.writeBlock).not.toHaveBeenCalled();
	});

	it('refuses a file whose version string is cut short', () => {
		const file = overlayFile([[0, blockOf(1)]], { version: 'longversion' });
		const store = rejectingStore();
		expect(replayOverlay(file.subarray(0, HEADER_BYTES + 4), 'longversion', store)).toBeNull();
		expect(store.writeBlock).not.toHaveBeenCalled();
	});

	it('refuses a file that promises more blocks than it carries', () => {
		const store = rejectingStore();
		const file = overlayFile([[0, blockOf(1)]], { count: 5 });
		expect(replayOverlay(file, 'v1', store)).toBeNull();
		expect(store.writeBlock).not.toHaveBeenCalled();
	});

	it('refuses a file truncated mid-block', () => {
		const store = rejectingStore();
		const file = overlayFile([
			[0, blockOf(1)],
			[1, blockOf(2)]
		]);
		expect(replayOverlay(file.subarray(0, file.length - 10), 'v1', store)).toBeNull();
		expect(store.writeBlock).not.toHaveBeenCalled();
	});

	it('never throws, whatever the bytes are', () => {
		const store = rejectingStore();
		let seed = 31337;
		const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
		for (let i = 0; i < 300; i++) {
			const len = rand() % 96;
			const msg = new Uint8Array(len);
			for (let j = 0; j < len; j++) msg[j] = rand();
			expect(() => replayOverlay(msg, 'v1', store)).not.toThrow();
		}
	});

	it('reads a file that sits inside a larger buffer', () => {
		const file = overlayFile([[2, blockOf(6)]]);
		const backing = new Uint8Array(file.length + 32).fill(0xee);
		backing.set(file, 16);
		const written = new Map<number, Uint8Array>();
		const store = {
			dirtyBlocks: () => [],
			readBlock: () => undefined,
			writeBlock: (b: number, d: Uint8Array) => written.set(b, d)
		};
		expect(replayOverlay(backing.subarray(16, 16 + file.length), 'v1', store)).not.toBeNull();
		expect(written.get(2)?.[0]).toBe(6);
	});
});

describe('findDiskBuffer', () => {
	const buffer = () => ({ block_cache: new Map(), block_cache_is_write: new Set() });

	it('finds the buffer at the known v86 path', () => {
		const target = buffer();
		const root = { v86: { cpu: { devices: { ide: { primary: { master: { buffer: target } } } } } } };
		expect(findDiskBuffer(root)).toBe(target);
	});

	it('finds the secondary drive and the cdrom', () => {
		const secondary = buffer();
		expect(
			findDiskBuffer({ v86: { cpu: { devices: { ide: { secondary: { master: { buffer: secondary } } } } } } })
		).toBe(secondary);
		const cdrom = buffer();
		expect(findDiskBuffer({ v86: { cpu: { devices: { cdrom: { buffer: cdrom } } } } })).toBe(cdrom);
	});

	it('finds a buffer by shape when it has moved', () => {
		// the known path is a guess about a minified build, not a contract
		const target = buffer();
		expect(findDiskBuffer({ some: { unexpected: { place: target } } })).toBe(target);
	});

	it('returns null when there is no buffer anywhere', () => {
		expect(findDiskBuffer({ a: { b: { c: 1 } } })).toBeNull();
		expect(findDiskBuffer(null)).toBeNull();
		expect(findDiskBuffer(undefined)).toBeNull();
		expect(findDiskBuffer(42)).toBeNull();
	});

	it('rejects an object that only half looks like a buffer', () => {
		expect(findDiskBuffer({ x: { block_cache: new Map() } })).toBeNull();
		expect(findDiskBuffer({ x: { block_cache_is_write: new Set() } })).toBeNull();
		// right names, wrong types
		expect(findDiskBuffer({ x: { block_cache: {}, block_cache_is_write: {} } })).toBeNull();
	});

	it('does not walk into a typed array', () => {
		// the graph runs through emulated memory; enumerating a view over it
		// would build a quarter-billion-element array
		const big = new Uint8Array(1024);
		const spy = vi.spyOn(Object, 'getOwnPropertyNames');
		findDiskBuffer({ memory: big });
		expect(spy.mock.calls.some(([arg]) => ArrayBuffer.isView(arg))).toBe(false);
		spy.mockRestore();
	});

	it('does not walk into a Map or Set', () => {
		const hidden = buffer();
		const map = new Map([['k', hidden]]);
		expect(findDiskBuffer({ map })).toBeNull();
	});

	it('stops at the depth limit', () => {
		// nest a buffer deeper than the search is allowed to go
		let node: Record<string, unknown> = buffer() as unknown as Record<string, unknown>;
		for (let i = 0; i < 12; i++) node = { child: node };
		expect(findDiskBuffer(node, 3)).toBeNull();
		expect(findDiskBuffer(node, 20)).not.toBeNull();
	});

	it('survives a property that throws when read', () => {
		const target = buffer();
		const root = { safe: target };
		Object.defineProperty(root, 'landmine', {
			enumerable: true,
			get() {
				throw new Error('bound to emulator memory');
			}
		});
		expect(findDiskBuffer(root)).toBe(target);
	});

	it('terminates on a cyclic graph', () => {
		const a: Record<string, unknown> = {};
		const b: Record<string, unknown> = { a };
		a.b = b;
		expect(findDiskBuffer(a)).toBeNull();
	});
});

describe('OVERLAY_LIMIT', () => {
	it('is the documented 192 MiB', () => {
		expect(OVERLAY_LIMIT).toBe(192 * 1024 * 1024);
	});

	it('is a whole number of blocks', () => {
		expect(OVERLAY_LIMIT % BLOCK_BYTES).toBe(0);
	});
});
