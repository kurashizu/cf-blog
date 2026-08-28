import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	decodeFrame,
	encodeFrame,
	encodeText,
	parseIcmpTarget,
	splitHostPort,
	TYPE_ICMP_DATA,
	TYPE_TCP_CONNECT,
	TYPE_TCP_CONNECTED,
	TYPE_UDP_DATA
} from '$lib/omniproxy-protocol';

/** A live WebSocket relay — nothing here can be prerendered. */
export const prerender = false;

/**
 * Same-origin front door for the OmniProxy relay.
 *
 * The browser cannot set `x-proxy-token` on a WebSocket, and a token shipped in
 * the page bundle would be readable by anyone, so the upstream endpoint and its
 * token stay here as Worker configuration and never reach the client. This is
 * also where destinations are policed: the wire format is simple enough to read
 * the CONNECT target out of each frame at the edge, so the allowlist is enforced
 * without the upstream server needing to know about it.
 *
 * Configuration (wrangler vars / secrets, never hardcoded):
 *   OMNIPROXY_URL    secret — upstream base, e.g. https://host.example/
 *   OMNIPROXY_TOKEN  secret — sent upstream as x-proxy-token
 *   OMNIPROXY_ALLOW  var    — comma-separated `host` or `host:port` entries;
 *                            "*" disables the check, unset blocks everything
 *   NET_RATE_LIMIT   ratelimit binding, keyed on the client IP
 */
export const GET: RequestHandler = async ({ request, platform, url }) => {
	if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
		error(426, 'This endpoint speaks WebSocket only.');
	}

	const env = platform?.env as RelayEnv | undefined;
	const upstreamUrl = env?.OMNIPROXY_URL;
	const token = env?.OMNIPROXY_TOKEN;
	if (!upstreamUrl) {
		error(503, 'Network relay is not configured on this deployment.');
	}

	// Only pages on this origin may open the relay. A missing Origin is rejected
	// too: every browser sends one on a WebSocket handshake, so its absence means
	// the caller is not a page. This stops other sites, not a determined script —
	// Origin is forgeable off-browser — so the allowlist below is the real bound.
	const origin = request.headers.get('origin');
	if (!origin) {
		error(403, 'Relay requires a browser Origin.');
	}
	let originHost: string;
	try {
		originHost = new URL(origin).host;
	} catch {
		error(403, 'Malformed Origin.');
	}
	// Hostnames, not full authorities: a dev proxy rewrites the port, and the port
	// carries none of the property being checked here — that the caller is a page
	// on this site rather than somebody else's.
	const hostHeader = request.headers.get('host') ?? '';
	const hostHostname = hostHeader.replace(/:\d+$/, '').toLowerCase();
	const originHostname = originHost.replace(/:\d+$/, '').toLowerCase();
	if (originHostname !== url.hostname.toLowerCase() && originHostname !== hostHostname) {
		error(403, `Cross-origin relay use is not allowed (${originHostname}).`);
	}

	// One VM opens one socket, so a per-IP connection budget costs real users
	// nothing while capping a reconnect loop or a scripted abuser.
	if (env?.NET_RATE_LIMIT) {
		const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
		const { success } = await env.NET_RATE_LIMIT.limit({ key: ip });
		if (!success) {
			error(429, 'Too many relay connections — try again shortly.');
		}
	}

	const allow = parseAllowlist(env?.OMNIPROXY_ALLOW);

	let upstream: WebSocket;
	try {
		const res = await fetch(upstreamUrl, {
			headers: {
				Upgrade: 'websocket',
				Connection: 'Upgrade',
				...(token ? { 'x-proxy-token': token } : {})
			}
		});
		if (!res.webSocket) {
			error(502, `Relay upstream refused the upgrade (${res.status}).`);
		}
		upstream = res.webSocket;
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		error(502, 'Relay upstream is unreachable.');
	}

	const pair = new WebSocketPair();
	const client = pair[0];
	const server = pair[1];

	server.accept();
	upstream.accept();

	/** Stream ids already opened, so ICMP data frames aren't mistaken for targets. */
	const openStreams = new Set<number>();

	server.addEventListener('message', (event) => {
		const data = toBytes(event.data);
		if (!data) return;

		const frame = decodeFrame(data);
		if (!frame) return;

		const target = destinationOf(frame.type, frame.payload, openStreams.has(frame.streamId));
		if (target) {
			openStreams.add(frame.streamId);
			if (!isAllowed(target.host, target.port, allow)) {
				// Answer the way the upstream reports a failed connect — a
				// TCP_CONNECTED frame with a non-empty body is an error string —
				// so the guest sees a clean refusal instead of a hang.
				const shown = target.port === null ? target.host : `${target.host}:${target.port}`;
				server.send(
					encodeFrame(frame.streamId, TYPE_TCP_CONNECTED, encodeText(`blocked by relay policy: ${shown}`))
				);
				return;
			}
		}
		upstream.send(data);
	});

	upstream.addEventListener('message', (event) => {
		server.send(event.data as ArrayBuffer | string);
	});

	const closeBoth = (code?: number, reason?: string) => {
		// 1005/1006 are "no status" codes that close() refuses to send back.
		const safe = code && code >= 1000 && code !== 1005 && code !== 1006 ? code : 1000;
		try {
			server.close(safe, reason);
		} catch {
			/* already closed */
		}
		try {
			upstream.close(safe, reason);
		} catch {
			/* already closed */
		}
	};

	server.addEventListener('close', (e) => closeBoth(e.code, e.reason));
	upstream.addEventListener('close', (e) => closeBoth(e.code, e.reason));
	server.addEventListener('error', () => closeBoth());
	upstream.addEventListener('error', () => closeBoth());

	return new Response(null, { status: 101, webSocket: client });
};

function toBytes(data: unknown): Uint8Array | null {
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	return null;
}

/** The destination a frame wants to reach, or null when it carries none. */
function destinationOf(
	type: number,
	payload: Uint8Array,
	streamAlreadyOpen: boolean
): { host: string; port: number | null } | null {
	if (type === TYPE_TCP_CONNECT) {
		return splitHostPort(new TextDecoder().decode(payload));
	}
	if (type === TYPE_UDP_DATA) {
		// Every UDP frame names its own destination.
		if (payload.length < 4) return null;
		const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
		const hostLen = view.getUint16(0, false);
		if (payload.length < 2 + hostLen + 2) return null;
		return {
			host: new TextDecoder().decode(payload.subarray(2, 2 + hostLen)),
			port: view.getUint16(2 + hostLen, false)
		};
	}
	if (type === TYPE_ICMP_DATA && !streamAlreadyOpen) {
		const host = parseIcmpTarget(payload);
		return host ? { host, port: null } : null;
	}
	return null;
}

interface RelayEnv {
	OMNIPROXY_URL?: string;
	OMNIPROXY_TOKEN?: string;
	OMNIPROXY_ALLOW?: string;
	NET_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

/** An allowlist entry: a host suffix, optionally pinned to one port. */
interface AllowEntry {
	host: string;
	port: number | null;
}

function parseAllowlist(raw: string | undefined): AllowEntry[] | null {
	if (!raw) return [];
	const parts = raw
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	// "*" is an explicit, deliberate opt-out — an unset variable blocks everything.
	if (parts.includes('*')) return null;
	return parts.map((part) => {
		const { host, port } = splitHostPort(part);
		// A bare hostname has no colon, so splitHostPort hands it back whole.
		return { host: host.replace(/\.$/, ''), port };
	});
}

/**
 * Suffix match on the label boundary, so "evil-krsz.in" cannot pass as
 * "krsz.in". A port-pinned entry matches only that port; a frame carrying no
 * port at all (ICMP) matches only entries that pin no port, so allowing
 * "example.org:443" never silently grants ping.
 */
function isAllowed(host: string, port: number | null, allow: AllowEntry[] | null): boolean {
	if (allow === null) return true;
	const h = host.toLowerCase().replace(/\.$/, '');
	return allow.some((entry) => {
		if (h !== entry.host && !h.endsWith(`.${entry.host}`)) return false;
		if (entry.port === null) return true;
		return port === entry.port;
	});
}
