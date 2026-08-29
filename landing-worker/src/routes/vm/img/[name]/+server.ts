import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	CHUNK,
	loadChunk,
	parseImages,
	parseRange,
	readAll,
	sourceVersion,
	type ImageSpec
} from '$lib/vm-storage';

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
 * the client and this route agree on the chunk size in $lib/vm-storage: every
 * request lands exactly on one cache entry instead of slicing across two. The
 * images are immutable release artifacts, so entries never need revalidating.
 */

/** Above this, a plain GET is refused and the caller must range. */
const WHOLE_FILE_LIMIT = 48 * 1024 * 1024;

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
		// The version is derived from the whole source string, so adding a build
		// marker to VM_IMAGES is enough to retire every cached chunk. Size alone
		// was not: a rebuilt image is usually the same size as the one before it.
		return new Response(JSON.stringify({ name: params.name, size: image.size, chunk: CHUNK, version: sourceVersion(image) }), {
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
