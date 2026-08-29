import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	CHUNK,
	loadChunk,
	parseImages,
	parseR2Source,
	sourceVersion,
	type ImageSpec
} from '$lib/vm-storage';

export const prerender = false;

/**
 * The riscv64 machine's files, in the shapes TinyEMU asks for.
 *
 * Where v86 reads a disk with HTTP Range, TinyEMU reads it as numbered files:
 * a JSON index at blk.txt saying how big the blocks are and how many there
 * are, then blk000000000.bin and its siblings, whose URLs it builds by
 * replacing the last path segment. So the block layout is a URL scheme here
 * rather than a header — the bytes underneath are the same chunks, from the
 * same R2 objects, through the same edge cache as the x86 image.
 *
 * The machine configuration is served from here too, because TinyEMU takes a
 * URL to it and every path inside must be same-origin.
 */

/** How many digits TinyEMU's `BLK_FMT` writes: blk%09u.bin. */
const BLOCK_DIGITS = 9;

interface Env {
	RV_IMAGES?: string;
	RV_MEMORY_MB?: string;
	VM_BUCKET?: R2Bucket;
}

export const GET: RequestHandler = async ({ params, platform, url }) => {
	const env = platform?.env as Env | undefined;
	const images = parseImages(env?.RV_IMAGES);
	if (!Object.keys(images).length) error(503, 'No riscv64 machine is configured on this deployment.');

	// The last segment is the file; anything before it is the version, which is
	// there to be part of the URL and nothing else. TinyEMU builds a block's
	// address by replacing the last segment of the index's, so the version has
	// to live in the path — a query string would not survive that.
	const file = params.path.split('/').pop() ?? '';

	if (file === 'krsz-rv.cfg') return config(images, env, url);
	// ?probe boots a few hand-written instructions that say hello over HTIF and
	// stop. If those characters arrive, the console, the loader and the serving
	// path are all sound and the fault is in the firmware; if they do not, it is
	// the other way round. Nothing else can tell the two apart on a machine with
	// no output.
	if (file === 'probe.cfg') return probeConfig(url);
	if (file === 'blk.txt') return blockIndex(images.rootfs);

	const block = matchBlock(file);
	if (block !== null) return blockFile(images.rootfs, block, platform);

	// Firmware, kernel and initramfs are read whole, in one request each, so
	// they are streamed straight out of the bucket rather than chunked.
	const image = images[file];
	if (!image) error(404, 'No such file.');
	return whole(image, env?.VM_BUCKET);
};

/**
 * TinyEMU parses this with its own JSON reader, which accepts unquoted keys and
 * a trailing comma — the format `splitimg` writes. Kept identical to that so
 * anything that reads one reads the other.
 */
function blockIndex(rootfs: ImageSpec | undefined): Response {
	if (!rootfs) error(503, 'No root filesystem is configured.');
	const blocks = Math.ceil(rootfs.size / CHUNK);
	const body = `{\n  block_size: ${CHUNK / 1024},\n  n_block: ${blocks},\n}\n`;
	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			// Deliberately uncached: it is one small request per boot, and holding
			// it means a rebuilt machine boots the previous description of itself.
			'cache-control': 'no-store'
		}
	});
}

function matchBlock(file: string): number | null {
	const match = new RegExp(`^blk(\\d{${BLOCK_DIGITS}})\\.bin$`).exec(file);
	if (!match) return null;
	const index = Number(match[1]);
	return Number.isFinite(index) ? index : null;
}

async function blockFile(
	rootfs: ImageSpec | undefined,
	index: number,
	platform: App.Platform | undefined
): Promise<Response> {
	if (!rootfs) error(503, 'No root filesystem is configured.');
	if (index * CHUNK >= rootfs.size) error(416, 'Block is past the end of the image.');

	const env = platform?.env as Env | undefined;
	const cache = (caches as unknown as { default?: Cache }).default;
	const bytes = await loadChunk(rootfs, index, cache, platform?.ctx, env?.VM_BUCKET);
	if (!bytes) error(502, 'Could not read that block.');

	// Copied into a buffer of its own: a view over a larger buffer is not a body.
	const body = new Uint8Array(bytes.length);
	body.set(bytes);

	return new Response(body, {
		headers: {
			'content-type': 'application/octet-stream',
			'content-length': String(body.length),
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
}

/** Streamed rather than buffered: the kernel is tens of megabytes. */
async function whole(image: ImageSpec, bucket: R2Bucket | undefined): Promise<Response> {
	if (image.url.startsWith('r2:')) {
		if (!bucket) error(503, 'No bucket is bound.');
		const object = await bucket.get(parseR2Source(image.url).key);
		if (!object) error(404, 'That file is not in the bucket.');
		return new Response(object.body, {
			headers: {
				'content-type': 'application/octet-stream',
				'content-length': String(object.size),
				'cache-control': 'public, max-age=31536000, immutable'
			}
		});
	}
	const upstream = await fetch(image.url);
	if (!upstream.ok) error(502, 'Upstream refused that file.');
	return new Response(upstream.body, {
		headers: {
			'content-type': 'application/octet-stream',
			'cache-control': 'public, max-age=31536000, immutable'
		}
	});
}

function probeConfig(url: URL): Response {
	const body = JSON.stringify(
		{
			version: 1,
			machine: 'riscv64',
			memory_size: 256,
			bios: new URL('/vm/rv-probe.bin', url).href
		},
		null,
		2
	);
	return new Response(body, {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
}

/**
 * The machine, as TinyEMU wants to be told about it. Every path is relative to
 * this file's own URL, which is how its loader resolves them.
 *
 * There is no eth0 on purpose: TinyEMU's network is raw ethernet frames, and
 * the relay this site runs carries streams. Bridging them needs a TCP/IP stack
 * in the page, which the x86 machine gets from v86 and this one has nowhere to
 * borrow.
 */
function config(images: Record<string, ImageSpec>, env: Env | undefined, url: URL): Response {
	const memory = Number(env?.RV_MEMORY_MB ?? 256);
	// Absolute, all of them. TinyEMU resolves the firmware and kernel against
	// this file's own location but hands the drive's name straight to its HTTP
	// block device, which asked the origin root for /blk.txt and got the site's
	// 404 page — then tried to parse it as an index.
	const here = new URL('.', url).href;
	// Every file is served immutable, and the R2 keys are reused on every
	// rebuild, so each URL carries the version of what it points at. Without it a
	// browser that has booted this machine once keeps the firmware it cached for
	// a year — which looked, for one long afternoon, like a firmware that could
	// not be fixed.
	const version = (name: string) => (images[name] ? sourceVersion(images[name]) : 'x');
	const body = JSON.stringify(
		{
			version: 1,
			machine: 'riscv64',
			memory_size: Number.isFinite(memory) && memory >= 64 ? memory : 256,
			bios: `${here}bios.bin?v=${version('bios.bin')}`,
			kernel: `${here}kernel?v=${version('kernel')}`,
			initrd: `${here}initramfs?v=${version('initramfs')}`,
			// earlycon first: the virtio console only exists once its driver has
			// probed, so without it every message before that goes nowhere and a
			// machine that is merely slow is indistinguishable from one that is
			// dead. TinyEMU carries an HTIF console, which is what SBI prints on.
			// ?shell stops at a shell in the initramfs, before the root filesystem
			// is looked for, and ?cmdline replaces the line outright. Both exist
			// because this machine's only channel is a console, and the console is
			// the thing most often in question.
			cmdline:
				url.searchParams.get('cmdline') ??
				(url.searchParams.has('shell')
					? 'earlycon=sbi keep_bootcon console=hvc0 rdinit=/bin/sh'
					: 'earlycon=sbi keep_bootcon console=hvc0 root=/dev/vda rw rootwait'),
			drive0: { file: `${here}${version('rootfs')}/blk.txt` }
		},
		null,
		2
	);
	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
}
