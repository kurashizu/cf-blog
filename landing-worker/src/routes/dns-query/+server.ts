import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isNameAllowed, parseAllowlist } from '$lib/relay-allowlist';
import { fromBase64Url, parseQuestion } from '$lib/dns-message';

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
 *
 * This is also where the destination allowlist is applied to names. The guest
 * resolves for itself and then connects to an address, so by the time a stream
 * reaches /net/wisp there is no name left to check — refusing the lookup is what
 * keeps the list meaningful. See $lib/relay-allowlist.
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

export const GET: RequestHandler = async ({ request, url, platform }) => {
	guard(request, url);
	const dns = url.searchParams.get('dns');
	if (!dns) error(400, 'Expected a base64url `dns` parameter.');
	if (dns.length > MAX_QUERY_BYTES * 2) error(413, 'Query too large to be a DNS message.');

	const query = fromBase64Url(dns);
	if (!query) error(400, '`dns` is not base64url.');
	const refusal = policy(query, platform);
	if (refusal) return refusal;

	const upstream = new URL(UPSTREAM);
	upstream.searchParams.set('dns', dns);
	return relay(await fetch(upstream, { headers: { accept: DNS_MESSAGE } }));
};

export const POST: RequestHandler = async ({ request, url, platform }) => {
	guard(request, url);
	const body = await request.arrayBuffer();
	if (body.byteLength === 0 || body.byteLength > MAX_QUERY_BYTES) {
		error(413, 'Body is not a DNS message.');
	}
	const refusal = policy(new Uint8Array(body), platform);
	if (refusal) return refusal;
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

// ── name policy ────────────────────────────────────────────────────────────

/** Returns a REFUSED response if the query asks for a name outside the list. */
function policy(query: Uint8Array, platform: App.Platform | undefined): Response | null {
	const allow = parseAllowlist((platform?.env as { OMNIPROXY_ALLOW?: string } | undefined)?.OMNIPROXY_ALLOW);
	const question = parseQuestion(query);
	// An unparseable query is not this endpoint's to interpret; the upstream will
	// reject it in the terms its own protocol uses.
	if (!question) return null;
	if (isNameAllowed(question.name, allow)) return null;
	console.log(`dns: refused ${question.name}`);
	return refused(query, question.end);
}

/**
 * The query echoed back with RCODE=REFUSED and every section after the question
 * dropped — a resolver reads that as "this name is not answerable here" and
 * stops, rather than retrying the way it would after a timeout.
 */
function refused(query: Uint8Array, end: number): Response {
	const out = query.slice(0, end);
	out[2] = 0x81; // QR=1, opcode 0, RD copied on
	out[3] = 0x85; // RA=1, RCODE=5 (REFUSED)
	out[6] = out[7] = 0; // ANCOUNT
	out[8] = out[9] = 0; // NSCOUNT
	out[10] = out[11] = 0; // ARCOUNT
	return new Response(out, { status: 200, headers: { 'content-type': DNS_MESSAGE } });
}
