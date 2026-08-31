/**
 * A disk image QEMU can open, without downloading it first.
 *
 * QEMU treats its drive as an ordinary file: it opens a path in Emscripten's
 * filesystem and reads offsets out of it. The upstream demos satisfy that with
 * file_packager, which preloads the whole image — fine for the 40 MB busybox
 * example, not for a gigabyte of Alpine when a boot touches sixty megabytes.
 *
 * So the image is a filesystem node of our own. Reads are served from a chunk
 * cache, and a miss fetches exactly one aligned chunk over HTTP Range — the
 * same route and the same alignment the other two machines stream from, so the
 * edge cache and the browser's own cache are already holding these bytes.
 * Writes never leave the page: they go into an overlay keyed by chunk, which is
 * what makes the read-only image writable without a megabyte of upload.
 *
 * The one thing this cannot do is block. Emscripten's `read` is synchronous and
 * fetch is not, so the bytes have to be in hand by the time QEMU asks — which
 * leaves synchronous XMLHttpRequest, the same thing Emscripten's own LazyFile
 * falls back to. See fetchChunk for why it is written the awkward way it is.
 */

/** One request, one cache entry — the same size the routes chunk at. */
export const CHUNK = 1024 * 1024;

/** Chunk index → the bytes the guest has written into it. */
export type OverlayBlocks = Map<number, Uint8Array>;

interface EmscriptenFS {
	FS: {
		/** Creates the file but returns nothing -- look the node up afterwards. */
		createDataFile(
			parent: string,
			name: string,
			data: Uint8Array | null,
			canRead: boolean,
			canWrite: boolean,
			canOwn: boolean
		): void;
		lookupPath(path: string): { node: FSNode };
	};
}

interface FSNode {
	contents?: Uint8Array;
	usedBytes?: number;
	stream_ops: Record<string, unknown>;
	node_ops?: Record<string, unknown>;
}

export interface LazyImageOptions {
	/** Where in the guest's filesystem the image should appear. */
	path: string;
	/** A URL that answers HTTP Range requests for the image. */
	url: string;
	size: number;
	overlay: OverlayBlocks;
}

/**
 * Fetches one aligned chunk, synchronously.
 *
 * This is the part with no elegant version. Emscripten's read path returns
 * bytes rather than a promise, so by the time QEMU asks, the data has to be
 * here. XMLHttpRequest in synchronous mode is the one API in a worker that can
 * do that, and it is exactly what Emscripten's own LazyFile uses for the same
 * reason.
 */
function fetchChunk(url: string, index: number, size: number): Uint8Array {
	// Retried, because this runs for as long as the machine does. The guest
	// faults in a block whenever it touches one it has not read yet -- an `apk
	// add` well into a session, a log rotation, anything -- and a request that
	// fails then throws inside QEMU's read path, where there is no handler and
	// no way back: the panel still says RUNNING and the machine is wedged. A
	// blip is far more likely than a genuinely missing chunk, so it is worth
	// asking again before giving up. Synchronous by necessity, so the wait
	// between tries is a spin rather than a timer.
	let lastError: unknown = null;
	for (let attempt = 0; attempt < 3; attempt++) {
		if (attempt > 0) {
			const until = Date.now() + attempt * 250;
			while (Date.now() < until) {
				/* nothing else can run here anyway */
			}
		}
		try {
			return fetchChunkOnce(url, index, size);
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError instanceof Error
		? lastError
		: new Error(`Chunk ${index} could not be read.`);
}

function fetchChunkOnce(url: string, index: number, size: number): Uint8Array {
	const start = index * CHUNK;
	const end = Math.min(start + CHUNK, size) - 1;
	const request = new XMLHttpRequest();
	request.open('GET', url, false);
	request.setRequestHeader('Range', `bytes=${start}-${end}`);
	// No responseType, which a document forbids on a synchronous request — and
	// this one does run on the document: Emscripten proxies the read there from
	// QEMU's thread. Asking for a binary arraybuffer throws InvalidAccessError.
	//
	// So the bytes come back as text through a character set that maps every
	// byte 0x00–0xFF to the code point of the same value, and are unpacked one
	// character at a time. This is what Emscripten's own LazyFile does, for
	// exactly this reason.
	request.overrideMimeType('text/plain; charset=x-user-defined');
	request.send(null);
	// 206 is the answer to a range request; a 200 means the whole file came back,
	// which is wrong but usable if it is the only chunk.
	if (request.status !== 206 && request.status !== 200) {
		throw new Error(`Chunk ${index} could not be read (${request.status}).`);
	}
	const text = request.responseText;
	if (text === null) throw new Error(`Chunk ${index} came back empty.`);
	const bytes = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) {
		// x-user-defined puts the byte in the low eight bits; the rest is the
		// 0xF700 page the encoding assigns, and masking it off gives the byte.
		bytes[i] = text.charCodeAt(i) & 0xff;
	}
	// A short chunk at the end of the image is expected; a short one anywhere
	// else means the range was not honoured, and silently zero-filling it would
	// corrupt the filesystem in a way the guest could not explain.
	const wanted = end - start + 1;
	if (bytes.length !== wanted && end + 1 !== size) {
		throw new Error(`Chunk ${index} was ${bytes.length} bytes, expected ${wanted}.`);
	}
	return bytes;
}

/**
 * Registers the image at `path`, replacing the node's read and write with ones
 * that go through the chunk cache.
 */
export function createLazyImage(module: EmscriptenFS, options: LazyImageOptions) {
	const { path, url, size, overlay } = options;
	const slash = path.lastIndexOf('/');
	const parent = path.slice(0, slash) || '/';
	const name = path.slice(slash + 1);

	// An empty file to hang the node off; nothing reads these contents. The node
	// has to be looked up rather than taken from the call -- createDataFile makes
	// the file and returns undefined.
	module.FS.createDataFile(parent, name, new Uint8Array(0), true, true, true);
	const node = module.FS.lookupPath(path).node;
	node.contents = undefined;
	node.usedBytes = size;

	/** Read-only chunks, as fetched. The overlay is consulted first. */
	const cache = new Map<number, Uint8Array>();

	const chunkFor = (index: number): Uint8Array => {
		const written = overlay.get(index);
		if (written) return written;
		let held = cache.get(index);
		if (!held) {
			held = fetchChunk(url, index, size);
			cache.set(index, held);
		}
		return held;
	};

	/** The copy the guest is allowed to modify — made on first write. */
	const writableChunkFor = (index: number): Uint8Array => {
		let written = overlay.get(index);
		if (!written) {
			const base = cache.get(index) ?? fetchChunk(url, index, size);
			// Full-length even at the end of the image: QEMU writes whole sectors
			// and a short chunk would truncate the last one.
			written = new Uint8Array(CHUNK);
			written.set(base.subarray(0, Math.min(base.length, CHUNK)));
			overlay.set(index, written);
		}
		return written;
	};

	// Emscripten calls these with (stream, buffer, offset, length, position),
	// where offset is into `buffer` and position into the file.
	node.stream_ops = {
		...node.stream_ops,
		read(
			_stream: unknown,
			buffer: Uint8Array,
			offset: number,
			length: number,
			position: number
		): number {
			if (position >= size) return 0;
			const total = Math.min(length, size - position);
			let done = 0;
			while (done < total) {
				const at = position + done;
				const index = Math.floor(at / CHUNK);
				const within = at % CHUNK;
				const take = Math.min(total - done, CHUNK - within);
				const chunk = chunkFor(index);
				// A chunk shorter than the read wants is the tail of the image.
				const slice = chunk.subarray(within, Math.min(within + take, chunk.length));
				buffer.set(slice, offset + done);
				done += take;
			}
			return total;
		},
		write(
			_stream: unknown,
			buffer: Uint8Array,
			offset: number,
			length: number,
			position: number
		): number {
			let done = 0;
			while (done < length) {
				const at = position + done;
				const index = Math.floor(at / CHUNK);
				const within = at % CHUNK;
				const take = Math.min(length - done, CHUNK - within);
				writableChunkFor(index).set(buffer.subarray(offset + done, offset + done + take), within);
				done += take;
			}
			return length;
		},
		llseek(stream: { position: number }, offset: number, whence: number): number {
			let next = offset;
			if (whence === 1) next += stream.position;
			else if (whence === 2) next += size;
			if (next < 0) throw new Error('A seek went before the start of the image.');
			return next;
		}
	};

	return {
		/** What the guest has written, in bytes — for the disk panel. */
		overlayBytes: () => overlay.size * CHUNK,
		/** What has been pulled from the network, in bytes. */
		fetchedBytes: () => cache.size * CHUNK
	};
}
