import { describe, it, expect, vi, afterEach } from 'vitest';
import { CHUNK, loadChunk, readAll } from '../../src/lib/vm-storage';

/**
 * loadChunk decides which R2 object and which byte offset a chunk comes from,
 * and the part arithmetic is the kind that is silently wrong for one image
 * size and right for every other. These use hand-written doubles rather than a
 * Workers runtime: everything under test is arithmetic and control flow.
 */

/** Records what it was asked for, and answers with recognisable bytes. */
function fakeBucket(opts: { missing?: boolean } = {}) {
	const calls: { key: string; offset?: number; length?: number }[] = [];
	return {
		calls,
		get: vi.fn(async (key: string, options?: { range?: { offset: number; length: number } }) => {
			calls.push({ key, offset: options?.range?.offset, length: options?.range?.length });
			if (opts.missing) return null;
			const length = options?.range?.length ?? 8;
			// first byte marks the offset so a wrong read is visible
			const body = new Uint8Array(length).fill(0);
			body[0] = (options?.range?.offset ?? 0) & 0xff;
			return {
				size: length,
				arrayBuffer: async () => body.buffer.slice(0, length)
			};
		})
	};
}

/** A cache that starts empty and remembers what was put in it. */
function fakeCache() {
	// Pinned to ArrayBuffer, not ArrayBufferLike, so the bytes stay a valid
	// BodyInit — the same reason loadChunk pins its own local.
	const store = new Map<string, Uint8Array<ArrayBuffer>>();
	return {
		store,
		match: vi.fn(async (req: Request) => {
			const hit = store.get(req.url);
			return hit ? new Response(hit) : undefined;
		}),
		put: vi.fn(async (req: Request, res: Response) => {
			store.set(req.url, new Uint8Array(await res.arrayBuffer()));
		})
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('loadChunk from R2', () => {
	it('reads an unsplit object at the chunk offset', async () => {
		const bucket = fakeBucket();
		const image = { url: 'r2:vm/rootfs', size: CHUNK * 4 };
		await loadChunk(image, 2, undefined, undefined, bucket as never);
		expect(bucket.calls[0].key).toBe('vm/rootfs');
		expect(bucket.calls[0].offset).toBe(CHUNK * 2);
		expect(bucket.calls[0].length).toBe(CHUNK);
	});

	it('shortens the last chunk to what is left of the file', async () => {
		const bucket = fakeBucket();
		// three and a half chunks
		const image = { url: 'r2:vm/rootfs', size: CHUNK * 3 + 512 };
		await loadChunk(image, 3, undefined, undefined, bucket as never);
		expect(bucket.calls[0].offset).toBe(CHUNK * 3);
		expect(bucket.calls[0].length).toBe(512);
	});

	it('picks the numbered part a chunk falls in', async () => {
		const bucket = fakeBucket();
		const partBytes = CHUNK * 4;
		const image = { url: `r2:vm/rootfs@${partBytes}`, size: CHUNK * 12 };

		// chunk 0 -> part 000, offset 0
		await loadChunk(image, 0, undefined, undefined, bucket as never);
		expect(bucket.calls[0].key).toBe('vm/rootfs.000');
		expect(bucket.calls[0].offset).toBe(0);

		// chunk 4 is the first of part 001, offset back at 0 within it
		await loadChunk(image, 4, undefined, undefined, bucket as never);
		expect(bucket.calls[1].key).toBe('vm/rootfs.001');
		expect(bucket.calls[1].offset).toBe(0);

		// chunk 5 sits one chunk into part 001
		await loadChunk(image, 5, undefined, undefined, bucket as never);
		expect(bucket.calls[2].key).toBe('vm/rootfs.001');
		expect(bucket.calls[2].offset).toBe(CHUNK);

		// the last chunk of part 001 is still part 001, at its far end
		await loadChunk(image, 7, undefined, undefined, bucket as never);
		expect(bucket.calls[3].key).toBe('vm/rootfs.001');
		expect(bucket.calls[3].offset).toBe(CHUNK * 3);

		// and the next one crosses into part 002
		await loadChunk(image, 8, undefined, undefined, bucket as never);
		expect(bucket.calls[4].key).toBe('vm/rootfs.002');
		expect(bucket.calls[4].offset).toBe(0);
	});

	it('pads the part number to three digits', async () => {
		const bucket = fakeBucket();
		const partBytes = CHUNK;
		const image = { url: `r2:vm/rootfs@${partBytes}`, size: CHUNK * 200 };
		await loadChunk(image, 7, undefined, undefined, bucket as never);
		expect(bucket.calls[0].key).toBe('vm/rootfs.007');
		await loadChunk(image, 123, undefined, undefined, bucket as never);
		expect(bucket.calls[1].key).toBe('vm/rootfs.123');
	});

	it('strips a build marker before building the object key', async () => {
		const bucket = fakeBucket();
		const image = { url: 'r2:vm/rootfs#b19', size: CHUNK * 2 };
		await loadChunk(image, 0, undefined, undefined, bucket as never);
		expect(bucket.calls[0].key).toBe('vm/rootfs');
	});

	it('returns null when no bucket is bound', async () => {
		const image = { url: 'r2:vm/rootfs', size: CHUNK };
		expect(await loadChunk(image, 0, undefined, undefined, undefined)).toBeNull();
	});

	it('returns null when the object is missing', async () => {
		const bucket = fakeBucket({ missing: true });
		const image = { url: 'r2:vm/rootfs', size: CHUNK };
		expect(await loadChunk(image, 0, undefined, undefined, bucket as never)).toBeNull();
	});
});

describe('loadChunk over http', () => {
	it('asks upstream for the chunk as a byte range', async () => {
		const fetchMock = vi.fn(async () => new Response(new Uint8Array(4), { status: 206 }));
		vi.stubGlobal('fetch', fetchMock);
		const image = { url: 'https://cdn.example/alpine.iso', size: CHUNK * 3 };
		await loadChunk(image, 1, undefined, undefined, undefined);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://cdn.example/alpine.iso');
		expect((init.headers as Record<string, string>).Range).toBe(
			`bytes=${CHUNK}-${CHUNK * 2 - 1}`
		);
	});

	it('asks for an identity encoding, so the range means bytes', async () => {
		const fetchMock = vi.fn(async () => new Response(new Uint8Array(4), { status: 206 }));
		vi.stubGlobal('fetch', fetchMock);
		await loadChunk({ url: 'https://cdn.example/a', size: CHUNK }, 0, undefined, undefined, undefined);
		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect((init.headers as Record<string, string>)['Accept-Encoding']).toBe('identity');
	});

	it('accepts a 200 as well as a 206', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2]), { status: 200 })));
		const out = await loadChunk({ url: 'https://cdn.example/a', size: CHUNK }, 0, undefined, undefined, undefined);
		expect(out).not.toBeNull();
	});

	it('returns null when upstream refuses', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
		const out = await loadChunk({ url: 'https://cdn.example/a', size: CHUNK }, 0, undefined, undefined, undefined);
		expect(out).toBeNull();
	});
});

describe('loadChunk caching', () => {
	it('serves a hit without touching the bucket', async () => {
		const cache = fakeCache();
		const bucket = fakeBucket();
		const image = { url: 'r2:vm/rootfs', size: CHUNK * 2 };
		await loadChunk(image, 0, cache as never, undefined, bucket as never);
		expect(bucket.get).toHaveBeenCalledTimes(1);
		await loadChunk(image, 0, cache as never, undefined, bucket as never);
		expect(bucket.get).toHaveBeenCalledTimes(1);
	});

	it('keys entries by chunk index', async () => {
		const cache = fakeCache();
		const bucket = fakeBucket();
		const image = { url: 'r2:vm/rootfs', size: CHUNK * 4 };
		await loadChunk(image, 0, cache as never, undefined, bucket as never);
		await loadChunk(image, 1, cache as never, undefined, bucket as never);
		expect(cache.store.size).toBe(2);
		expect(bucket.get).toHaveBeenCalledTimes(2);
	});

	it('keys entries by image size, so a republished build is not served stale', async () => {
		const cache = fakeCache();
		const bucket = fakeBucket();
		// the R2 object name stays the same across a rebuild; the size is what
		// moves, and it is in the key for exactly that reason
		await loadChunk({ url: 'r2:vm/rootfs', size: CHUNK * 2 }, 0, cache as never, undefined, bucket as never);
		await loadChunk({ url: 'r2:vm/rootfs', size: CHUNK * 3 }, 0, cache as never, undefined, bucket as never);
		expect(cache.store.size).toBe(2);
		expect(bucket.get).toHaveBeenCalledTimes(2);
	});

	it('keys entries by url, including its build marker', async () => {
		const cache = fakeCache();
		const bucket = fakeBucket();
		await loadChunk({ url: 'r2:vm/rootfs#b1', size: CHUNK }, 0, cache as never, undefined, bucket as never);
		await loadChunk({ url: 'r2:vm/rootfs#b2', size: CHUNK }, 0, cache as never, undefined, bucket as never);
		expect(cache.store.size).toBe(2);
	});

	it('hands the cache write to waitUntil when there is a context', async () => {
		const cache = fakeCache();
		const bucket = fakeBucket();
		const waitUntil = vi.fn();
		await loadChunk(
			{ url: 'r2:vm/rootfs', size: CHUNK },
			0,
			cache as never,
			{ waitUntil } as never,
			bucket as never
		);
		expect(waitUntil).toHaveBeenCalledTimes(1);
	});

	it('still works with no cache at all', async () => {
		const bucket = fakeBucket();
		const out = await loadChunk({ url: 'r2:vm/rootfs', size: CHUNK }, 0, undefined, undefined, bucket as never);
		expect(out).not.toBeNull();
	});
});

describe('readAll', () => {
	it('reads a whole R2 object', async () => {
		const bucket = {
			get: vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }))
		};
		const out = await readAll({ url: 'r2:vm/vmlinuz', size: 3 }, bucket as never);
		expect([...out!]).toEqual([1, 2, 3]);
		expect(bucket.get).toHaveBeenCalledWith('vm/vmlinuz');
	});

	it('strips a build marker from the key', async () => {
		const bucket = {
			get: vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([1]).buffer }))
		};
		await readAll({ url: 'r2:vm/vmlinuz#b19', size: 1 }, bucket as never);
		expect(bucket.get).toHaveBeenCalledWith('vm/vmlinuz');
	});

	it('returns null for an r2 source with no bucket', async () => {
		expect(await readAll({ url: 'r2:vm/vmlinuz', size: 1 }, undefined)).toBeNull();
	});

	it('returns null when the object is missing', async () => {
		const bucket = { get: vi.fn(async () => null) };
		expect(await readAll({ url: 'r2:vm/vmlinuz', size: 1 }, bucket as never)).toBeNull();
	});

	it('fetches an http source whole', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([7, 7]))));
		const out = await readAll({ url: 'https://cdn.example/vmlinuz', size: 2 }, undefined);
		expect([...out!]).toEqual([7, 7]);
	});

	it('returns null when an http source refuses', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 500 })));
		expect(await readAll({ url: 'https://cdn.example/vmlinuz', size: 2 }, undefined)).toBeNull();
	});
});
