/**
 * Reading the VM images out of R2, in aligned chunks the edge can cache.
 *
 * Shared by the two disk routes: /vm/img speaks HTTP Range, because that is
 * what v86 asks for, and /vm/rv serves numbered block files, because that is
 * what TinyEMU asks for. Underneath they are the same bytes fetched the same
 * way, so the chunking, the cache keys and the R2 part arithmetic live here.
 */

/** Both routes and the client agree on this: one request, one cache entry. */
export const CHUNK = 1024 * 1024;

export interface ImageSpec {
	url: string;
	size: number;
}

/**
 * `name|source|size` triples, comma separated. A source is either an https URL
 * (proxied and cached) or `r2:<key>`, read straight out of the bound bucket.
 */
export function parseImages(raw: string | undefined): Record<string, ImageSpec> {
	const out: Record<string, ImageSpec> = {};
	for (const entry of (raw ?? '').split(',')) {
		const [name, url, size] = entry.split('|').map((s) => s.trim());
		if (!name || !url || !size) continue;
		const bytes = Number(size);
		if (Number.isFinite(bytes) && bytes > 0) out[name] = { url, size: bytes };
	}
	return out;
}

/** One aligned chunk, from the edge cache when possible. */
export async function loadChunk(
	image: ImageSpec,
	index: number,
	cache: Cache | undefined,
	ctx: ExecutionContext | undefined,
	bucket: R2Bucket | undefined
): Promise<Uint8Array | null> {
	// A synthetic key so entries are addressed by chunk, not by whatever range
	// the client happened to ask for.
	// The size is part of the key on purpose: the R2 object name stays the same
	// when CI republishes, so an immutable entry keyed only by name would serve
	// the previous build forever.
	const key = new Request(
		`https://vm-image-cache.invalid/${encodeURIComponent(image.url)}/${image.size}/${CHUNK}/${index}`
	);

	const hit = await cache?.match(key);
	if (hit) return new Uint8Array(await hit.arrayBuffer());

	const start = index * CHUNK;
	const length = Math.min(CHUNK, image.size - start);

	// Pinned to ArrayBuffer (not ArrayBufferLike) so it stays a valid BodyInit.
	let bytes: Uint8Array<ArrayBuffer>;
	if (image.url.startsWith('r2:')) {
		// R2 ranges are served by the binding itself — no upstream request, no
		// egress charge, and the object is ours so it cannot disappear or rate-limit.
		if (!bucket) return null;
		const { key, partBytes } = parseR2Source(image.url);
		// Large images are stored as parts because the uploader refuses objects
		// over 300 MiB. CHUNK divides the part size, so a read never straddles two.
		const objectKey = partBytes
			? `${key}.${String(Math.floor(start / partBytes)).padStart(3, '0')}`
			: key;
		const offset = partBytes ? start % partBytes : start;
		const object = await bucket.get(objectKey, { range: { offset, length } });
		if (!object) return null;
		bytes = new Uint8Array(await object.arrayBuffer());
	} else {
		const upstream = await fetch(image.url, {
			headers: { Range: `bytes=${start}-${start + length - 1}`, 'Accept-Encoding': 'identity' }
		});
		if (!upstream.ok && upstream.status !== 206) return null;
		bytes = new Uint8Array(await upstream.arrayBuffer());
	}

	// Stored as a plain 200 so it is cacheable; the 206 is rebuilt per request.
	const store = new Response(bytes, {
		headers: {
			'content-type': 'application/octet-stream',
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
	if (cache) {
		const put = cache.put(key, store);
		if (ctx) ctx.waitUntil(put);
		else await put;
	}
	return bytes;
}

/** A short stable digest of the source string, used to version cached bytes. */
export function sourceVersion(image: ImageSpec): string {
	let h = 2166136261;
	for (const ch of `${image.url}|${image.size}`) {
		h ^= ch.charCodeAt(0);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(36);
}

/** `r2:<key>` or `r2:<key>@<partBytes>` for an image stored in numbered parts. */
export function parseR2Source(url: string): { key: string; partBytes: number | null } {
	// Anything after # is a build marker for cache-busting, not part of the key.
	const rest = url.slice(3).split('#')[0];
	const at = rest.lastIndexOf('@');
	if (at <= 0) return { key: rest, partBytes: null };
	const size = Number(rest.slice(at + 1));
	return Number.isFinite(size) && size > 0
		? { key: rest.slice(0, at), partBytes: size }
		: { key: rest, partBytes: null };
}

/** Whole small image, for the kernel and initrd that v86 loads in one piece. */
export async function readAll(image: ImageSpec, bucket: R2Bucket | undefined): Promise<Uint8Array<ArrayBuffer> | null> {
	if (image.url.startsWith('r2:')) {
		if (!bucket) return null;
		// Only unsplit objects are served whole; anything large must be ranged.
		const object = await bucket.get(parseR2Source(image.url).key);
		return object ? new Uint8Array(await object.arrayBuffer()) : null;
	}
	const res = await fetch(image.url);
	return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
}

/** Single-range `bytes=start-end` only — v86 never asks for more. */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;
	const [, rawStart, rawEnd] = match;

	let start: number;
	let end: number;
	if (rawStart === '') {
		// Suffix form: the last N bytes.
		const suffix = Number(rawEnd);
		if (!Number.isFinite(suffix) || suffix <= 0) return null;
		start = Math.max(0, size - suffix);
		end = size - 1;
	} else {
		start = Number(rawStart);
		end = rawEnd === '' ? size - 1 : Number(rawEnd);
	}

	if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
	if (start < 0 || start >= size || end < start) return null;
	return { start, end: Math.min(end, size - 1) };
}
