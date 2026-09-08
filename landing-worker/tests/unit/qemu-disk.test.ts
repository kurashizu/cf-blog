import { describe, it, expect, vi, afterEach } from 'vitest';
import { CHUNK, BLOCK_BYTES, createLazyImage, type OverlayBlocks } from '../../src/lib/components/krsz-vm/qemu-disk';

/**
 * QEMU's lazy disk: reads fault a megabyte in over HTTP, writes copy that
 * chunk first and record which 256-byte blocks changed. A mistake here either
 * hands the guest the wrong bytes or loses what it wrote, so the crossing
 * cases — a read or write spanning two chunks, a write at the very end — are
 * the ones worth pinning.
 */

/** A stand-in for the bits of Emscripten's FS this touches. */
function fakeModule() {
	const node: Record<string, unknown> = { stream_ops: { existing: true } };
	const created: { parent: string; name: string }[] = [];
	return {
		node,
		created,
		module: {
			FS: {
				createDataFile: (parent: string, name: string) => void created.push({ parent, name }),
				lookupPath: () => ({ node: node as never })
			}
		}
	};
}

/**
 * A synchronous XHR that answers ranges out of a byte array.
 *
 * The real code reads `responseText` under an x-user-defined override rather
 * than an arraybuffer, because a document forbids responseType on a
 * synchronous request — so the stub has to answer the same way: one character
 * per byte, in the 0xF700 page the encoding assigns.
 */
function stubXhr(image: Uint8Array, opts: { status?: number; failTimes?: number } = {}) {
	const requests: string[] = [];
	let failsLeft = opts.failTimes ?? 0;
	class FakeXhr {
		status = opts.status ?? 206;
		responseText = '';
		private range = '';
		open() {}
		setRequestHeader(name: string, value: string) {
			if (name.toLowerCase() === 'range') this.range = value;
		}
		overrideMimeType() {}
		send() {
			requests.push(this.range);
			if (failsLeft > 0) {
				failsLeft--;
				this.status = 500;
				this.responseText = '';
				return;
			}
			this.status = opts.status ?? 206;
			const m = /bytes=(\d+)-(\d+)/.exec(this.range)!;
			const slice = image.subarray(Number(m[1]), Number(m[2]) + 1);
			// x-user-defined: each byte becomes one character in the 0xF700 page
			this.responseText = Array.from(slice, (b) => String.fromCharCode(0xf700 | b)).join('');
		}
	}
	vi.stubGlobal('XMLHttpRequest', FakeXhr);
	return requests;
}

/** An image whose every byte encodes its own offset, so a misread is visible. */
const imageOf = (size: number) => Uint8Array.from({ length: size }, (_, i) => i & 0xff);

type Ops = {
	read(s: unknown, b: Uint8Array, o: number, l: number, p: number): number;
	write(s: unknown, b: Uint8Array, o: number, l: number, p: number): number;
	llseek(s: { position: number }, o: number, w: number): number;
};

function setup(
	size: number,
	opts: { dirty?: Set<number>; overlay?: OverlayBlocks; status?: number; failTimes?: number } = {}
) {
	const image = imageOf(size);
	const requests = stubXhr(image, { status: opts.status, failTimes: opts.failTimes });
	const fs = fakeModule();
	const overlay: OverlayBlocks = opts.overlay ?? new Map();
	const handle = createLazyImage(fs.module as never, {
		path: '/disk/hda.img',
		url: 'https://example.invalid/img',
		size,
		overlay,
		dirty: opts.dirty
	});
	return { image, requests, fs, overlay, handle, ops: fs.node.stream_ops as Ops };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('the file it creates', () => {
	it('creates the file under its parent directory', () => {
		const { fs } = setup(CHUNK);
		expect(fs.created).toEqual([{ parent: '/disk', name: 'hda.img' }]);
	});

	it('reports the image size without holding its contents', () => {
		const { fs } = setup(CHUNK * 3);
		expect(fs.node.usedBytes).toBe(CHUNK * 3);
		expect(fs.node.contents).toBeUndefined();
	});

	it('keeps the stream ops it did not replace', () => {
		const { fs } = setup(CHUNK);
		expect((fs.node.stream_ops as Record<string, unknown>).existing).toBe(true);
	});
});

describe('reading', () => {
	it('returns the bytes at the position asked for', () => {
		const { ops, image } = setup(CHUNK * 2);
		const buf = new Uint8Array(16);
		expect(ops.read(null, buf, 0, 16, 100)).toBe(16);
		expect([...buf]).toEqual([...image.subarray(100, 116)]);
	});

	it('writes into the buffer at the offset given', () => {
		const { ops, image } = setup(CHUNK);
		const buf = new Uint8Array(20).fill(0xee);
		ops.read(null, buf, 4, 8, 0);
		expect([...buf.subarray(0, 4)]).toEqual([0xee, 0xee, 0xee, 0xee]);
		expect([...buf.subarray(4, 12)]).toEqual([...image.subarray(0, 8)]);
	});

	it('reads across a chunk boundary in one call', () => {
		const { ops, image, requests } = setup(CHUNK * 2);
		const buf = new Uint8Array(16);
		ops.read(null, buf, 0, 16, CHUNK - 8);
		expect([...buf]).toEqual([...image.subarray(CHUNK - 8, CHUNK + 8)]);
		expect(requests).toHaveLength(2);
	});

	it('fetches each chunk once and then serves it from memory', () => {
		const { ops, requests } = setup(CHUNK * 2);
		const buf = new Uint8Array(8);
		ops.read(null, buf, 0, 8, 0);
		ops.read(null, buf, 0, 8, 16);
		ops.read(null, buf, 0, 8, 32);
		expect(requests).toHaveLength(1);
	});

	it('asks for the range that covers the chunk', () => {
		const { ops, requests } = setup(CHUNK * 3);
		ops.read(null, new Uint8Array(4), 0, 4, CHUNK);
		expect(requests[0]).toBe(`bytes=${CHUNK}-${CHUNK * 2 - 1}`);
	});

	it('stops the last range at the end of the image', () => {
		const size = CHUNK + 500;
		const { ops, requests } = setup(size);
		ops.read(null, new Uint8Array(4), 0, 4, CHUNK + 10);
		expect(requests[0]).toBe(`bytes=${CHUNK}-${size - 1}`);
	});

	it('reads nothing at or past the end of the image', () => {
		const { ops } = setup(CHUNK);
		expect(ops.read(null, new Uint8Array(8), 0, 8, CHUNK)).toBe(0);
		expect(ops.read(null, new Uint8Array(8), 0, 8, CHUNK + 99)).toBe(0);
	});

	it('shortens a read that runs off the end', () => {
		const size = CHUNK + 10;
		const { ops } = setup(size);
		expect(ops.read(null, new Uint8Array(64), 0, 64, size - 4)).toBe(4);
	});
});

describe('writing', () => {
	it('records what the guest wrote and reads it back', () => {
		const { ops } = setup(CHUNK * 2);
		ops.write(null, Uint8Array.from([1, 2, 3, 4]), 0, 4, 50);
		const buf = new Uint8Array(4);
		ops.read(null, buf, 0, 4, 50);
		expect([...buf]).toEqual([1, 2, 3, 4]);
	});

	it('copies the chunk on first write rather than editing the cache', () => {
		const { ops, overlay } = setup(CHUNK);
		expect(overlay.size).toBe(0);
		ops.write(null, Uint8Array.from([9]), 0, 1, 0);
		expect(overlay.size).toBe(1);
		expect(overlay.get(0)!.length).toBe(CHUNK);
	});

	it('holds a full-length chunk even at the tail of the image', () => {
		// QEMU writes whole sectors; a short chunk would truncate the last one
		const { ops, overlay } = setup(CHUNK + 100);
		ops.write(null, Uint8Array.from([7]), 0, 1, CHUNK + 10);
		expect(overlay.get(1)!.length).toBe(CHUNK);
	});

	it('leaves the rest of the chunk as it was', () => {
		const { ops, image } = setup(CHUNK);
		ops.write(null, Uint8Array.from([0xff]), 0, 1, 10);
		const buf = new Uint8Array(4);
		ops.read(null, buf, 0, 4, 12);
		expect([...buf]).toEqual([...image.subarray(12, 16)]);
	});

	it('writes across a chunk boundary in one call', () => {
		const { ops, overlay } = setup(CHUNK * 2);
		ops.write(null, Uint8Array.from([1, 2, 3, 4]), 0, 4, CHUNK - 2);
		expect(overlay.size).toBe(2);
		const buf = new Uint8Array(4);
		ops.read(null, buf, 0, 4, CHUNK - 2);
		expect([...buf]).toEqual([1, 2, 3, 4]);
	});

	it('returns the length it was given', () => {
		const { ops } = setup(CHUNK);
		expect(ops.write(null, new Uint8Array(32), 0, 32, 0)).toBe(32);
	});

	it('reads from the buffer at the offset given', () => {
		const { ops } = setup(CHUNK);
		const src = Uint8Array.from([0, 0, 5, 6]);
		ops.write(null, src, 2, 2, 0);
		const buf = new Uint8Array(2);
		ops.read(null, buf, 0, 2, 0);
		expect([...buf]).toEqual([5, 6]);
	});
});

describe('dirty block accounting', () => {
	it('records the block a write landed in', () => {
		const dirty = new Set<number>();
		const { ops } = setup(CHUNK, { dirty });
		ops.write(null, Uint8Array.from([1]), 0, 1, 0);
		expect([...dirty]).toEqual([0]);
	});

	it('records a whole block even when only part of it was written', () => {
		// the overlay file stores blocks; half a block replayed is worse than none
		const dirty = new Set<number>();
		const { ops } = setup(CHUNK, { dirty });
		ops.write(null, Uint8Array.from([1]), 0, 1, BLOCK_BYTES + 5);
		expect([...dirty]).toEqual([1]);
	});

	it('records every block a long write touched', () => {
		const dirty = new Set<number>();
		const { ops } = setup(CHUNK, { dirty });
		ops.write(null, new Uint8Array(BLOCK_BYTES * 3), 0, BLOCK_BYTES * 3, 0);
		expect([...dirty].sort((a, b) => a - b)).toEqual([0, 1, 2]);
	});

	it('records both blocks when a write straddles a boundary', () => {
		const dirty = new Set<number>();
		const { ops } = setup(CHUNK, { dirty });
		ops.write(null, new Uint8Array(4), 0, 4, BLOCK_BYTES - 2);
		expect([...dirty].sort((a, b) => a - b)).toEqual([0, 1]);
	});

	it('numbers blocks across the whole image, not within a chunk', () => {
		const dirty = new Set<number>();
		const { ops } = setup(CHUNK * 2, { dirty });
		ops.write(null, Uint8Array.from([1]), 0, 1, CHUNK);
		expect([...dirty]).toEqual([CHUNK / BLOCK_BYTES]);
	});

	it('works without a dirty set at all', () => {
		const { ops } = setup(CHUNK);
		expect(() => ops.write(null, Uint8Array.from([1]), 0, 1, 0)).not.toThrow();
	});
});

describe('llseek', () => {
	it('takes an absolute offset', () => {
		const { ops } = setup(CHUNK);
		expect(ops.llseek({ position: 100 }, 42, 0)).toBe(42);
	});

	it('adds to the current position', () => {
		const { ops } = setup(CHUNK);
		expect(ops.llseek({ position: 100 }, 42, 1)).toBe(142);
	});

	it('counts back from the end of the image', () => {
		const { ops } = setup(CHUNK);
		expect(ops.llseek({ position: 0 }, -10, 2)).toBe(CHUNK - 10);
		expect(ops.llseek({ position: 0 }, 0, 2)).toBe(CHUNK);
	});

	it('refuses to seek before the start', () => {
		const { ops } = setup(CHUNK);
		expect(() => ops.llseek({ position: 0 }, -1, 0)).toThrow();
		expect(() => ops.llseek({ position: 5 }, -10, 1)).toThrow();
	});

	it('allows a seek past the end, which is how a file grows', () => {
		const { ops } = setup(CHUNK);
		expect(ops.llseek({ position: 0 }, CHUNK * 4, 0)).toBe(CHUNK * 4);
	});
});

describe('a fetch that fails', () => {
	/* These are the slow tests in the suite — about a second each. The retry
	   waits by spinning, because the whole path is synchronous and there is no
	   timer to await, so the test has to wait it out too. */

	it('retries rather than wedging the machine', () => {
		// this runs inside QEMU's read path, where a throw has no handler: the
		// panel still says RUNNING and the guest is stuck. A blip is far more
		// likely than a genuinely missing chunk.
		const { ops, requests } = setup(CHUNK, { failTimes: 2 });
		const buf = new Uint8Array(4);
		expect(() => ops.read(null, buf, 0, 4, 0)).not.toThrow();
		expect(requests.length).toBe(3);
	});

	it('gives up after three tries', () => {
		const { ops } = setup(CHUNK, { failTimes: 99 });
		expect(() => ops.read(null, new Uint8Array(4), 0, 4, 0)).toThrow();
	});

	it('accepts a 200 as well as a 206', () => {
		// a whole-file answer is wrong but usable when it is the only chunk
		const { ops, image } = setup(CHUNK, { status: 200 });
		const buf = new Uint8Array(4);
		ops.read(null, buf, 0, 4, 0);
		expect([...buf]).toEqual([...image.subarray(0, 4)]);
	});
});

describe('the numbers the panel shows', () => {
	it('counts nothing before anything is touched', () => {
		const { handle } = setup(CHUNK * 4);
		expect(handle.overlayBytes()).toBe(0);
		expect(handle.fetchedBytes()).toBe(0);
	});

	it('counts a chunk per read and a chunk per written chunk', () => {
		const { ops, handle } = setup(CHUNK * 4);
		ops.read(null, new Uint8Array(4), 0, 4, 0);
		ops.read(null, new Uint8Array(4), 0, 4, CHUNK);
		expect(handle.fetchedBytes()).toBe(CHUNK * 2);
		ops.write(null, Uint8Array.from([1]), 0, 1, 0);
		expect(handle.overlayBytes()).toBe(CHUNK);
	});
});

describe('writableChunk', () => {
	it('hands out a full chunk for one nothing has read', () => {
		// replaying a saved overlay needs this: its blocks belong to chunks the
		// guest has not touched yet
		const { handle, overlay } = setup(CHUNK * 3);
		const chunk = handle.writableChunk(2);
		expect(chunk.length).toBe(CHUNK);
		expect(overlay.get(2)).toBe(chunk);
	});

	it('returns the same array on a second call', () => {
		const { handle } = setup(CHUNK * 2);
		expect(handle.writableChunk(1)).toBe(handle.writableChunk(1));
	});

	it('is visible to a later read', () => {
		const { handle, ops } = setup(CHUNK * 2);
		handle.writableChunk(1)[0] = 0xab;
		const buf = new Uint8Array(1);
		ops.read(null, buf, 0, 1, CHUNK);
		expect(buf[0]).toBe(0xab);
	});
});

describe('an overlay handed in at the start', () => {
	it('is read in preference to the network', () => {
		const overlay: OverlayBlocks = new Map([[0, new Uint8Array(CHUNK).fill(0x5a)]]);
		const { ops, requests } = setup(CHUNK * 2, { overlay });
		const buf = new Uint8Array(4);
		ops.read(null, buf, 0, 4, 0);
		expect([...buf]).toEqual([0x5a, 0x5a, 0x5a, 0x5a]);
		expect(requests).toHaveLength(0);
	});
});
