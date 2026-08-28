import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Range responses can't be prerendered. */
export const prerender = false;

/**
 * Serves the VM disk images to v86, which reads them with HTTP Range requests.
 *
 * The upstream (Alpine's CDN) sends no CORS headers, so it cannot be fetched
 * from the page directly; proxying also puts the bytes behind Cloudflare's
 * cache, which is what makes a 49 MiB ISO practical to boot repeatedly.
 *
 * v86 rounds its reads out to `fixed_chunk_size` when that option is set, so
 * the client and this route agree on CHUNK below: every request lands exactly
 * on one cache entry instead of slicing across two. The images are immutable
 * release artifacts, so entries never need revalidating.
 */
const CHUNK = 1024 * 1024;
/** Above this, a plain GET is refused and the caller must range. */
const WHOLE_FILE_LIMIT = 48 * 1024 * 1024;

interface ImageSpec {
	url: string;
	size: number;
}

/**
 * `name|source|size` triples, comma separated, from the VM_IMAGES var. A source
 * is either an https URL (proxied and cached) or `r2:<key>`, read straight out
 * of the bound bucket.
 */
function parseImages(raw: string | undefined): Record<string, ImageSpec> {
	const out: Record<string, ImageSpec> = {};
	for (const entry of (raw ?? '').split(',')) {
		const [name, url, size] = entry.split('|').map((s) => s.trim());
		if (!name || !url || !size) continue;
		const bytes = Number(size);
		if (Number.isFinite(bytes) && bytes > 0) out[name] = { url, size: bytes };
	}
	return out;
}

export const GET: RequestHandler = async ({ params, request, platform, url }) => {
	const env = platform?.env as { VM_IMAGES?: string; VM_BUCKET?: R2Bucket } | undefined;
	const images = parseImages(env?.VM_IMAGES);
	const image = images[params.name];
	if (!image) {
		error(404, `No such VM image: ${params.name}`);
	}

	// Metadata lives behind ?info rather than on the bare URL: one URL serving
	// both a small JSON body and ranged image bytes gets sliced by any cache that
	// stores the JSON first, which is exactly what happened the first time.
	if (url.searchParams.has('info')) {
		return new Response(JSON.stringify({ name: params.name, size: image.size, chunk: CHUNK }), {
			status: 200,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		});
	}

	const rangeHeader = request.headers.get('range');
	if (!rangeHeader) {
		// v86 loads a kernel and initrd whole rather than by range, so small
		// images are served in full. A root filesystem is not: streaming hundreds
		// of MB through the worker is never what the caller wants.
		if (image.size > WHOLE_FILE_LIMIT) {
			return new Response('Too large to serve whole — use a Range request, or ?info for metadata.', {
				status: 416,
				headers: { 'content-range': `bytes */${image.size}`, 'accept-ranges': 'bytes' }
			});
		}
		const whole = await readAll(image, env?.VM_BUCKET);
		if (!whole) {
			error(502, 'Upstream image is unreachable.');
		}
		return new Response(whole, {
			status: 200,
			headers: {
				'content-type': 'application/octet-stream',
				'content-length': String(whole.length),
				'accept-ranges': 'bytes',
				'cache-control': 'public, max-age=31536000, immutable'
			}
		});
	}

	const range = parseRange(rangeHeader, image.size);
	if (!range) {
		return new Response('Malformed or unsatisfiable Range', {
			status: 416,
			headers: { 'content-range': `bytes */${image.size}` }
		});
	}

	const cache = platform?.caches?.default;
	const first = Math.floor(range.start / CHUNK);
	const last = Math.floor(range.end / CHUNK);
	const parts: Uint8Array[] = [];

	for (let index = first; index <= last; index++) {
		const chunk = await loadChunk(image, index, cache, platform?.ctx, env?.VM_BUCKET);
		if (!chunk) {
			error(502, 'Upstream image is unreachable.');
		}
		const chunkStart = index * CHUNK;
		const from = Math.max(range.start, chunkStart) - chunkStart;
		const to = Math.min(range.end, chunkStart + chunk.length - 1) - chunkStart;
		parts.push(chunk.subarray(from, to + 1));
	}

	const total = parts.reduce((a, p) => a + p.length, 0);
	const body = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		body.set(part, offset);
		offset += part.length;
	}

	return new Response(body, {
		status: 206,
		headers: {
			'content-type': 'application/octet-stream',
			'content-range': `bytes ${range.start}-${range.start + total - 1}/${image.size}`,
			'content-length': String(total),
			'accept-ranges': 'bytes',
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
};

/** One aligned chunk, from the edge cache when possible. */
async function loadChunk(
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

/** `r2:<key>` or `r2:<key>@<partBytes>` for an image stored in numbered parts. */
function parseR2Source(url: string): { key: string; partBytes: number | null } {
	const rest = url.slice(3);
	const at = rest.lastIndexOf('@');
	if (at <= 0) return { key: rest, partBytes: null };
	const size = Number(rest.slice(at + 1));
	return Number.isFinite(size) && size > 0
		? { key: rest.slice(0, at), partBytes: size }
		: { key: rest, partBytes: null };
}

/** Whole small image, for the kernel and initrd that v86 loads in one piece. */
async function readAll(image: ImageSpec, bucket: R2Bucket | undefined): Promise<Uint8Array<ArrayBuffer> | null> {
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
function parseRange(header: string, size: number): { start: number; end: number } | null {
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
