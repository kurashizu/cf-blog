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

interface ImageSpec {
	url: string;
	size: number;
}

/** `name|url|size` triples, comma separated, from the VM_IMAGES var. */
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
	const env = platform?.env as { VM_IMAGES?: string } | undefined;
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
		// Streaming 49 MiB through the worker is never what the caller wants.
		return new Response('Use a Range request, or ?info for metadata.', {
			status: 416,
			headers: { 'content-range': `bytes */${image.size}`, 'accept-ranges': 'bytes' }
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
		const chunk = await loadChunk(image, index, cache, platform?.ctx);
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
	ctx: ExecutionContext | undefined
): Promise<Uint8Array | null> {
	// A synthetic key so entries are addressed by chunk, not by whatever range
	// the client happened to ask for.
	const key = new Request(`https://vm-image-cache.invalid/${encodeURIComponent(image.url)}/${CHUNK}/${index}`);

	const hit = await cache?.match(key);
	if (hit) return new Uint8Array(await hit.arrayBuffer());

	const start = index * CHUNK;
	const end = Math.min(start + CHUNK, image.size) - 1;
	const upstream = await fetch(image.url, {
		headers: { Range: `bytes=${start}-${end}`, 'Accept-Encoding': 'identity' }
	});
	if (!upstream.ok && upstream.status !== 206) return null;

	const bytes = new Uint8Array(await upstream.arrayBuffer());

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
