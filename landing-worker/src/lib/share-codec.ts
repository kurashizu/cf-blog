/**
 * Patch <-> URL-fragment codec: JSON -> deflate (CompressionStream) -> base64url.
 * Sequencer grids are mostly empty arrays, so deflate typically shrinks a full
 * patch by 20-50x — small enough to live in a shareable #patch= fragment.
 */

function bytesToBase64Url(bytes: Uint8Array): string {
	let bin = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

export function codecSupported(): boolean {
	return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

export async function encodeToFragment(data: unknown): Promise<string> {
	const json = new TextEncoder().encode(JSON.stringify(data));
	const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
	return bytesToBase64Url(compressed);
}

export async function decodeFromFragment<T>(fragment: string): Promise<T> {
	const compressed = base64UrlToBytes(fragment);
	const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	const json = await new Response(stream).text();
	return JSON.parse(json) as T;
}
