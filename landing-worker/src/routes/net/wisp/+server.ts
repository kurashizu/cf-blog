import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	decodeFrame,
	encodeFrame,
	encodeUdpPayload,
	splitHostPort,
	TYPE_TCP_CONNECT,
	TYPE_TCP_CONNECTED,
	TYPE_TCP_DATA,
	TYPE_TCP_FIN,
	TYPE_UDP_DATA
} from '$lib/omniproxy-protocol';

export const prerender = false;

/**
 * Speaks WISP to the emulator and OmniProxy upstream.
 *
 * v86's WISP backend already implements the whole guest-side gateway — ARP,
 * DHCP, DNS over HTTPS, ping, and a TCP peer that terminates the guest's
 * connections — and hands out plain byte streams. Translating those streams to
 * OmniProxy here means none of that has to be rewritten in the page, and the
 * relay stays the single place where destinations are policed.
 *
 * Both protocols are stream multiplexers over one WebSocket, so the mapping is
 * close to mechanical. The differences that matter: WISP is little-endian and
 * puts the type first, OmniProxy is big-endian and puts the stream id first;
 * WISP names the destination as (host, port) fields while OmniProxy takes a
 * "host:port" string; and WISP has per-stream flow control that OmniProxy does
 * not, so the windows are granted here rather than tracked.
 */

// WISP packet types.
const W_CONNECT = 0x01;
const W_DATA = 0x02;
const W_CONTINUE = 0x03;
const W_CLOSE = 0x04;

// WISP close reasons.
const W_CLOSE_VOLUNTARY = 0x02;
const W_CLOSE_REFUSED = 0x03;
const W_CLOSE_BLOCKED = 0x48;

/** Frames the client may have in flight per stream before waiting for a window. */
const WINDOW = 512;

interface StreamInfo {
	/** 0x01 TCP, 0x02 UDP. */
	kind: number;
	host: string;
	port: number;
}

export const GET: RequestHandler = async ({ request, platform, url }) => {
	if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
		error(426, 'This endpoint speaks WebSocket only.');
	}

	const env = platform?.env as
		| {
				OMNIPROXY_URL?: string;
				OMNIPROXY_TOKEN?: string;
				OMNIPROXY_ALLOW?: string;
				NET_RATE_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };
		  }
		| undefined;

	if (!env?.OMNIPROXY_URL) {
		error(503, 'Network relay is not configured on this deployment.');
	}

	// Same rules as /net: a page on this origin, within a per-IP budget.
	const origin = request.headers.get('origin');
	if (!origin) error(403, 'Relay requires a browser Origin.');
	let originHost: string;
	try {
		originHost = new URL(origin).host;
	} catch {
		error(403, 'Malformed Origin.');
	}
	if (originHost !== url.host) error(403, 'Cross-origin relay use is not allowed.');

	if (env.NET_RATE_LIMIT) {
		const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
		const { success } = await env.NET_RATE_LIMIT.limit({ key: ip });
		if (!success) error(429, 'Too many relay connections — try again shortly.');
	}

	const allow = parseAllowlist(env.OMNIPROXY_ALLOW);

	let upstream: WebSocket;
	try {
		const res = await fetch(env.OMNIPROXY_URL, {
			headers: {
				Upgrade: 'websocket',
				Connection: 'Upgrade',
				...(env.OMNIPROXY_TOKEN ? { 'x-proxy-token': env.OMNIPROXY_TOKEN } : {})
			}
		});
		if (!res.webSocket) error(502, `Relay upstream refused the upgrade (${res.status}).`);
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

	const streams = new Map<number, StreamInfo>();

	// A WISP client starts congested until the server grants a window on stream 0.
	server.send(wispContinue(0, WINDOW));

	server.addEventListener('message', (event) => {
		const data = toBytes(event.data);
		if (!data || data.length < 5) return;
		const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
		const type = view.getUint8(0);
		const streamId = view.getUint32(1, true);

		if (type === W_CONNECT) {
			if (data.length < 8) return;
			const kind = view.getUint8(5);
			const port = view.getUint16(6, true);
			const host = new TextDecoder().decode(data.subarray(8));
			if (!isAllowed(host, port, allow)) {
				server.send(wispClose(streamId, W_CLOSE_BLOCKED));
				return;
			}
			streams.set(streamId, { kind, host, port });
			// UDP has no connect step upstream — the target rides on every datagram.
			if (kind !== 0x02) {
				upstream.send(encodeFrame(streamId, TYPE_TCP_CONNECT, new TextEncoder().encode(`${host}:${port}`)));
			}
			return;
		}

		if (type === W_DATA) {
			const payload = data.subarray(5);
			const info = streams.get(streamId);
			if (!info) return;
			if (info.kind === 0x02) {
				upstream.send(encodeFrame(streamId, TYPE_UDP_DATA, encodeUdpPayload(info.host, info.port, payload)));
			} else {
				upstream.send(encodeFrame(streamId, TYPE_TCP_DATA, payload));
			}
			// OmniProxy applies its own backpressure, so keep the client's window open.
			server.send(wispContinue(streamId, WINDOW));
			return;
		}

		if (type === W_CLOSE) {
			streams.delete(streamId);
			upstream.send(encodeFrame(streamId, TYPE_TCP_FIN));
		}
	});

	upstream.addEventListener('message', (event) => {
		const data = toBytes(event.data);
		if (!data) return;
		const frame = decodeFrame(data);
		if (!frame) return;

		switch (frame.type) {
			case TYPE_TCP_CONNECTED:
				// An empty body is success; anything else is the upstream's error text.
				if (frame.payload.length > 0) {
					streams.delete(frame.streamId);
					server.send(wispClose(frame.streamId, W_CLOSE_REFUSED));
				}
				break;
			case TYPE_TCP_DATA:
				server.send(wispData(frame.streamId, frame.payload));
				break;
			case TYPE_UDP_DATA: {
				// Strip the [len][host][port] header — WISP carries the datagram alone.
				const p = frame.payload;
				if (p.length < 4) break;
				const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
				const hostLen = v.getUint16(0, false);
				if (p.length < 4 + hostLen) break;
				server.send(wispData(frame.streamId, p.subarray(4 + hostLen)));
				break;
			}
			case TYPE_TCP_FIN:
				streams.delete(frame.streamId);
				server.send(wispClose(frame.streamId, W_CLOSE_VOLUNTARY));
				break;
		}
	});

	const closeBoth = (code?: number, reason?: string) => {
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

// ── WISP frame builders (little-endian, type first) ─────────────────────────

function wispData(streamId: number, payload: Uint8Array): Uint8Array {
	const out = new Uint8Array(5 + payload.length);
	const view = new DataView(out.buffer);
	view.setUint8(0, W_DATA);
	view.setUint32(1, streamId, true);
	out.set(payload, 5);
	return out;
}

function wispContinue(streamId: number, buffer: number): Uint8Array {
	const out = new Uint8Array(9);
	const view = new DataView(out.buffer);
	view.setUint8(0, W_CONTINUE);
	view.setUint32(1, streamId, true);
	view.setUint32(5, buffer, true);
	return out;
}

function wispClose(streamId: number, reason: number): Uint8Array {
	const out = new Uint8Array(6);
	const view = new DataView(out.buffer);
	view.setUint8(0, W_CLOSE);
	view.setUint32(1, streamId, true);
	view.setUint8(5, reason);
	return out;
}

function toBytes(data: unknown): Uint8Array | null {
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	return null;
}

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
	if (parts.includes('*')) return null;
	return parts.map((part) => {
		const { host, port } = splitHostPort(part);
		return { host: host.replace(/\.$/, ''), port };
	});
}

function isAllowed(host: string, port: number, allow: AllowEntry[] | null): boolean {
	if (allow === null) return true;
	const h = host.toLowerCase().replace(/\.$/, '');
	return allow.some((entry) => {
		if (h !== entry.host && !h.endsWith(`.${entry.host}`)) return false;
		return entry.port === null || port === entry.port;
	});
}
