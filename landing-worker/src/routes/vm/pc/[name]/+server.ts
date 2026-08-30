import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  CHUNK,
  loadChunk,
  parseImages,
  parseRange,
  readAll,
  sourceVersion,
} from "$lib/vm-storage";

/** Range responses can't be prerendered. */
export const prerender = false;

/**
 * The x86-64 guest's kernel, initramfs and root filesystem, for QEMU.
 *
 * Nearly the same route as /vm/img, and deliberately so: QEMU reads its drive
 * by offset the way v86 does, so the same 1 MiB chunking and the same edge
 * cache apply. It is separate rather than a parameter because the images are a
 * different set in a different R2 prefix, and folding them into VM_IMAGES would
 * let a caller reach one machine's disk through the other's URL.
 *
 * The one addition is CORP. This route is only ever read from /krsz-vm, which
 * is cross-origin isolated, and an isolated document will not embed a
 * subresource that has not said it is willing.
 */

/** Above this, a plain GET is refused and the caller must range. */
const WHOLE_FILE_LIMIT = 48 * 1024 * 1024;

/** Isolation applies to every subresource, the binaries and the disk alike. */
const ISOLATION = {
  "cross-origin-resource-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
};

export const GET: RequestHandler = async ({
  params,
  request,
  platform,
  url,
}) => {
  const env = platform?.env as
    { PC_IMAGES?: string; VM_BUCKET?: R2Bucket } | undefined;
  const images = parseImages(env?.PC_IMAGES);
  const image = images[params.name];
  if (!image) {
    error(404, `No such x86-64 image: ${params.name}`);
  }

  // Metadata behind ?info, for the same reason as /vm/img: one URL serving
  // both a JSON body and ranged bytes gets sliced by whichever a cache saw
  // first.
  if (url.searchParams.has("info")) {
    return new Response(
      JSON.stringify({
        name: params.name,
        size: image.size,
        chunk: CHUNK,
        version: sourceVersion(image),
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          ...ISOLATION,
        },
      },
    );
  }

  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) {
    // The kernel is fetched whole -- QEMU wants it as a file before it starts
    // -- and the root filesystem never is.
    if (image.size > WHOLE_FILE_LIMIT) {
      return new Response(
        "Too large to serve whole — use a Range request, or ?info for metadata.",
        {
          status: 416,
          headers: {
            "content-range": `bytes */${image.size}`,
            "accept-ranges": "bytes",
            ...ISOLATION,
          },
        },
      );
    }
    const whole = await readAll(image, env?.VM_BUCKET);
    if (!whole) {
      error(502, "Upstream image is unreachable.");
    }
    return new Response(whole, {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(whole.length),
        "accept-ranges": "bytes",
        "cache-control": "public, max-age=31536000, immutable",
        ...ISOLATION,
      },
    });
  }

  const range = parseRange(rangeHeader, image.size);
  if (!range) {
    return new Response("Malformed or unsatisfiable Range", {
      status: 416,
      headers: { "content-range": `bytes */${image.size}`, ...ISOLATION },
    });
  }

  const cache = platform?.caches?.default;
  const first = Math.floor(range.start / CHUNK);
  const last = Math.floor(range.end / CHUNK);
  const parts: Uint8Array[] = [];

  for (let index = first; index <= last; index++) {
    const chunk = await loadChunk(
      image,
      index,
      cache,
      platform?.ctx,
      env?.VM_BUCKET,
    );
    if (!chunk) {
      error(502, "Upstream image is unreachable.");
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
      "content-type": "application/octet-stream",
      "content-range": `bytes ${range.start}-${range.start + total - 1}/${image.size}`,
      "content-length": String(total),
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=31536000, immutable",
      ...ISOLATION,
    },
  });
};
