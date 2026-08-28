import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const prerender = false;

/**
 * A same-origin DNS-over-HTTPS endpoint for the emulator.
 *
 * v86's WISP backend resolves names itself with a `fetch` to a DoH server, and
 * expands the configured host to `https://<host>/dns-query` — so the path is
 * fixed by that contract rather than chosen here. Pointing it at a public
 * resolver directly means a cross-origin request that the browser will not
 * make, which is why the guest could bring up its network and still fail every
 * lookup with "DNS: transient error".
 *
 * Only the wire format (RFC 8484) is passed through, in both the GET and POST
 * shapes, and only to the configured upstream.
 */
const UPSTREAM = 'https://cloudflare-dns.com/dns-query';
const DNS_MESSAGE = 'application/dns-message';

/** Wire-format queries are small; anything larger is not a DNS message. */
const MAX_QUERY_BYTES = 512;

function guard(request: Request, url: URL): void {
	// Same rule as the relay: a page on this site, not somebody else's.
	const origin = request.headers.get('origin');
	if (origin) {
		let originHostname: string;
		try {
			originHostname = new URL(origin).hostname.toLowerCase();
		} catch {
			error(403, 'Malformed Origin.');
		}
		const hostHostname = (request.headers.get('host') ?? '').replace(/:\d+$/, '').toLowerCase();
		if (originHostname !== url.hostname.toLowerCase() && originHostname !== hostHostname) {
			error(403, 'Cross-origin DNS use is not allowed.');
		}
	}
}

export const GET: RequestHandler = async ({ request, url }) => {
	guard(request, url);
	const dns = url.searchParams.get('dns');
	if (!dns) error(400, 'Expected a base64url `dns` parameter.');
	if (dns.length > MAX_QUERY_BYTES * 2) error(413, 'Query too large to be a DNS message.');

	const upstream = new URL(UPSTREAM);
	upstream.searchParams.set('dns', dns);
	return relay(await fetch(upstream, { headers: { accept: DNS_MESSAGE } }));
};

export const POST: RequestHandler = async ({ request, url }) => {
	guard(request, url);
	const body = await request.arrayBuffer();
	if (body.byteLength === 0 || body.byteLength > MAX_QUERY_BYTES) {
		error(413, 'Body is not a DNS message.');
	}
	return relay(
		await fetch(UPSTREAM, {
			method: 'POST',
			headers: { 'content-type': DNS_MESSAGE, accept: DNS_MESSAGE },
			body
		})
	);
};

function relay(res: Response): Response {
	return new Response(res.body, {
		status: res.status,
		headers: {
			'content-type': res.headers.get('content-type') ?? DNS_MESSAGE,
			// Answers carry their own TTL; letting the edge hold them briefly keeps
			// a boot's worth of lookups from each becoming a round trip.
			'cache-control': 'public, max-age=60'
		}
	});
}
