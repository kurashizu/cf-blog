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
 *   OMNIPROXY_URL    upstream base, e.g. https://op-au.example.xyz/
 *   OMNIPROXY_TOKEN  secret, sent as x-proxy-token
 *   OMNIPROXY_ALLOW  comma-separated host suffixes; "*" disables the allowlist
 */
export const GET: RequestHandler = async ({ request, platform, url }) => {
	if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
		error(426, 'This endpoint speaks WebSocket only.');
	}

	const env = platform?.env as Record<string, string | undefined> | undefined;
	const upstreamUrl = env?.OMNIPROXY_URL;
	const token = env?.OMNIPROXY_TOKEN;
	if (!upstreamUrl) {
		error(503, 'Network relay is not configured on this deployment.');
	}

	// Only this site may open the relay. Origin is set by the browser and cannot
	// be forged from a page, which is the property we want here.
	const origin = request.headers.get('origin');
	if (origin && new URL(origin).host !== url.host) {
		error(403, 'Cross-origin relay use is not allowed.');
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
			if (!isAllowed(target.host, allow)) {
				// Answer the way the upstream reports a failed connect — a
				// TCP_CONNECTED frame with a non-empty body is an error string —
				// so the guest sees a clean refusal instead of a hang.
				server.send(
					encodeFrame(frame.streamId, TYPE_TCP_CONNECTED, encodeText(`blocked by relay policy: ${target.host}`))
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

function parseAllowlist(raw: string | undefined): string[] | null {
	if (!raw) return [];
	const entries = raw
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	// "*" is an explicit, deliberate opt-out — an unset variable blocks everything.
	return entries.includes('*') ? null : entries;
}

/** Suffix match on the host label boundary, so "evil-krsz.in" cannot pass as "krsz.in". */
function isAllowed(host: string, allow: string[] | null): boolean {
	if (allow === null) return true;
	const h = host.toLowerCase().replace(/\.$/, '');
	return allow.some((entry) => h === entry || h.endsWith(`.${entry}`));
}
