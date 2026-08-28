/**
 * OmniProxy wire format — `[u32 BE stream_id][u8 type][payload]` carried in
 * binary WebSocket frames. Mirrors `protocol/src/lib.rs` in kurashizu/OmniProxy.
 *
 * Shared by the browser client and the Worker relay: the relay only needs to
 * read the header and the CONNECT target, so keep the parse side allocation-free.
 */

export const TYPE_TCP_CONNECT = 0x01;
export const TYPE_TCP_CONNECTED = 0x02;
export const TYPE_TCP_DATA = 0x03;
export const TYPE_TCP_FIN = 0x04;
export const TYPE_UDP_DATA = 0x05;
export const TYPE_ICMP_DATA = 0x06;

export const HEADER_BYTES = 5;

export interface FrameHeader {
	streamId: number;
	type: number;
	/** Payload bytes, a view into the same buffer — do not retain past the callback. */
	payload: Uint8Array;
}

export function encodeFrame(streamId: number, type: number, payload?: Uint8Array): Uint8Array {
	const body = payload ?? new Uint8Array(0);
	const out = new Uint8Array(HEADER_BYTES + body.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, streamId >>> 0, false);
	view.setUint8(4, type);
	out.set(body, HEADER_BYTES);
	return out;
}

export function decodeFrame(data: Uint8Array): FrameHeader | null {
	if (data.length < HEADER_BYTES) return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	return {
		streamId: view.getUint32(0, false),
		type: view.getUint8(4),
		payload: data.subarray(HEADER_BYTES)
	};
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeText(text: string): Uint8Array {
	return encoder.encode(text);
}

export function decodeText(bytes: Uint8Array): string {
	return decoder.decode(bytes);
}

/** UDP payload: `[u16 hostLen][host][u16 port][data]`. */
export function encodeUdpPayload(host: string, port: number, data: Uint8Array): Uint8Array {
	const hb = encoder.encode(host);
	const out = new Uint8Array(4 + hb.length + data.length);
	const view = new DataView(out.buffer);
	view.setUint16(0, hb.length, false);
	out.set(hb, 2);
	view.setUint16(2 + hb.length, port, false);
	out.set(data, 4 + hb.length);
	return out;
}

export function decodeUdpPayload(payload: Uint8Array): { host: string; port: number; data: Uint8Array } | null {
	if (payload.length < 4) return null;
	const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
	const hostLen = view.getUint16(0, false);
	if (payload.length < 2 + hostLen + 2) return null;
	return {
		host: decoder.decode(payload.subarray(2, 2 + hostLen)),
		port: view.getUint16(2 + hostLen, false),
		data: payload.subarray(4 + hostLen)
	};
}

/**
 * ICMP framing is asymmetric, so the two directions need different parsers.
 *
 * client -> server (`session.rs`): the FIRST frame of an unseen stream id is a
 * `SocketAddr` string such as "1.1.1.1:0"; every later frame on that id is raw
 * echo data. Telling them apart needs stream context, which is why the relay
 * tracks open ids rather than this module.
 *
 * server -> client (`icmp/unix.rs` via `encode_icmp_payload`): replies are
 * `[u16 ipLen][sourceIp][icmpData]`.
 */
export function parseIcmpTarget(payload: Uint8Array): string | null {
	const text = decoder.decode(payload).trim();
	// Must parse as host:port for the server to accept it as a target.
	const colon = text.lastIndexOf(':');
	if (colon <= 0) return null;
	const host = text.slice(0, colon);
	return /^[0-9a-zA-Z.:_-]+$/.test(host) && Number.isFinite(Number(text.slice(colon + 1))) ? host : null;
}

/** Decode a server -> client ICMP reply: `[u16 ipLen][sourceIp][icmpData]`. */
export function decodeIcmpReply(payload: Uint8Array): { ip: string; data: Uint8Array } | null {
	if (payload.length < 2) return null;
	const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
	const ipLen = view.getUint16(0, false);
	if (payload.length < 2 + ipLen) return null;
	return { ip: decoder.decode(payload.subarray(2, 2 + ipLen)), data: payload.subarray(2 + ipLen) };
}

/** Split a "host:port" target, tolerating bracketed IPv6. */
export function splitHostPort(target: string): { host: string; port: number | null } {
	const trimmed = target.trim();
	if (trimmed.startsWith('[')) {
		const end = trimmed.indexOf(']');
		if (end > 0) {
			const port = Number(trimmed.slice(end + 2));
			return { host: trimmed.slice(1, end), port: Number.isFinite(port) ? port : null };
		}
	}
	const colon = trimmed.lastIndexOf(':');
	if (colon <= 0) return { host: trimmed, port: null };
	const port = Number(trimmed.slice(colon + 1));
	return { host: trimmed.slice(0, colon), port: Number.isFinite(port) ? port : null };
}
