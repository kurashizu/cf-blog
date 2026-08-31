import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * The chatbot's weights and runtime, served from this origin.
 *
 * They live in the same R2 bucket as everything else and were fetched straight
 * from bucket.krsz.in, which worked until the site became cross-origin
 * isolated. Isolation is all-or-nothing for a document: it requires every
 * cross-origin subresource to say it consents to being embedded, and an R2
 * custom domain serves objects with no cross-origin-resource-policy header and
 * no way to add one. So a 1.2 GB download that was fine yesterday fails.
 *
 * Proxying it through here removes the question rather than answering it: a
 * same-origin request needs no consent from anybody. The body is streamed, so
 * the worker holds a few chunks rather than a gigabyte.
 */
const TYPES: Record<string, string> = {
	'.gguf': 'application/octet-stream',
	'.wasm': 'application/wasm',
	'.js': 'text/javascript'
};

export const GET: RequestHandler = async ({ params, platform, request }) => {
	const file = params.file;
	// A fixed shape, not a path: this reads a bucket, and a caller does not get
	// to compose keys.
	const isModel = /^[A-Za-z0-9._-]+\.gguf$/.test(file) && !file.includes('..');
	const isRuntime = /^wllama\.wasm$/.test(file);
	if (!isModel && !isRuntime) error(404, 'No such file.');

	const bucket = (platform?.env as { VM_BUCKET?: R2Bucket } | undefined)?.VM_BUCKET;
	if (!bucket) error(503, 'No bucket is bound.');

	const key = isRuntime ? 'wllama/wllama.wasm' : `gguf/${file}`;

	// Range is honoured because a 1.2 GB download that drops should resume
	// rather than start again, and because the browser asks for one when it
	// replays a partial response out of its own cache.
	const range = request.headers.get('range');
	const match = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
	const object = match
		? await bucket.get(key, {
				range: match[1]
					? { offset: Number(match[1]), length: match[2] ? Number(match[2]) - Number(match[1]) + 1 : undefined }
					: { suffix: Number(match[2]) }
			})
		: await bucket.get(key);
	if (!object) error(404, 'That file is not published.');

	const ext = file.slice(file.lastIndexOf('.'));
	const headers: Record<string, string> = {
		'content-type': TYPES[ext] ?? 'application/octet-stream',
		'content-length': String(object.size),
		// Weights are rebuilt under a new name rather than in place.
		'cache-control': 'public, max-age=31536000, immutable',
		'accept-ranges': 'bytes',
		// The half that matters: an isolated document will not load a subresource
		// that has not said it is willing to be embedded.
		'cross-origin-resource-policy': 'same-origin'
	};
	if (object.range && 'offset' in object.range) {
		const start = object.range.offset ?? 0;
		const end = start + object.size - 1;
		// R2 reports the size of the slice it returned, so the total comes from
		// the object's own metadata rather than from arithmetic on the request.
		const total = (await bucket.head(key))?.size ?? end + 1;
		headers['content-range'] = `bytes ${start}-${end}/${total}`;
		return new Response(object.body, { status: 206, headers });
	}
	return new Response(object.body, { headers });
};
