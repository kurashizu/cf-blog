import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * QEMU's own binaries, served out of R2.
 *
 * They do not go in static/ for a blunt reason: the wasm is 66 MB and Workers
 * refuse a single static asset over 25 MiB. So they live where the disk images
 * live, and this route exists to give them the two things a bucket does not:
 * the right content types, and the headers that let the page use threads.
 *
 * The content type is not a formality. A wasm served as anything else is
 * refused by streaming compilation, and the glue is an ES module.
 */
const TYPES: Record<string, string> = {
	'.wasm': 'application/wasm',
	'.js': 'text/javascript'
};

export const GET: RequestHandler = async ({ params, platform }) => {
	const file = params.file;
	// Names only, from the set the build produces: this reads a bucket, and a
	// path is not something a caller gets to compose.
	const isBinary = /^qemu-system-(aarch64|riscv64|x86_64)(\.wasm|\.worker\.js|\.js)$/.test(file);
	// The ROMs x86 reads at runtime, which QEMU opens by name out of whatever -L
	// points at. Spelled with a prefix rather than a slash because this route
	// takes one path segment.
	const isRom = /^pc-bios-[A-Za-z0-9_.-]+$/.test(file) && !file.includes('..');
	if (!isBinary && !isRom) {
		error(404, 'No such file.');
	}

	const bucket = (platform?.env as { VM_BUCKET?: R2Bucket } | undefined)?.VM_BUCKET;
	if (!bucket) error(503, 'No bucket is bound.');

	const key = isRom ? `qemu/pc-bios/${file.slice('pc-bios-'.length)}` : `qemu/${file}`;
	const object = await bucket.get(key);
	if (!object) error(404, 'That file has not been built yet.');

	const contentType = isRom
		? 'application/octet-stream'
		: TYPES[file.endsWith('.wasm') ? '.wasm' : '.js'];
	return new Response(object.body, {
		headers: {
			'content-type': contentType,
			'content-length': String(object.size),
			// Built artifacts, rebuilt in place — the version lives in the URL the
			// page asks for, the same as every other image here.
			'cache-control': 'public, max-age=31536000, immutable',
			// QEMU runs its CPU on a worker and shares memory with it, which the
			// browser only allows on a cross-origin isolated page. Both halves are
			// needed: the document opts in, and every subresource says it is
			// willing to be embedded by one.
			'cross-origin-resource-policy': 'same-origin',
			'cross-origin-embedder-policy': 'require-corp'
		}
	});
};
