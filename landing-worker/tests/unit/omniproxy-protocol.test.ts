import { describe, it, expect } from 'vitest';
import {
	HEADER_BYTES,
	TYPE_TCP_CONNECT,
	TYPE_TCP_DATA,
	TYPE_UDP_DATA,
	encodeFrame,
	decodeFrame,
	encodeText,
	encodeUdpPayload,
	parseIcmpTarget,
	splitHostPort
} from '../../src/lib/omniproxy-protocol';

/* decodeFrame reads bytes off a WebSocket, and splitHostPort decides what the
   allowlist entries mean — a wrong split there is an access-control bug, not a
   formatting one. Both are exercised against hostile input below. */

describe('encodeFrame / decodeFrame', () => {
	it('round-trips a frame with a payload', () => {
		const payload = new Uint8Array([1, 2, 3, 4]);
		const frame = encodeFrame(7, TYPE_TCP_DATA, payload);
		const decoded = decodeFrame(frame);
		expect(decoded).not.toBeNull();
		expect(decoded!.streamId).toBe(7);
		expect(decoded!.type).toBe(TYPE_TCP_DATA);
		expect([...decoded!.payload]).toEqual([1, 2, 3, 4]);
	});

	it('round-trips a frame with no payload', () => {
		const decoded = decodeFrame(encodeFrame(1, TYPE_TCP_CONNECT));
		expect(decoded!.payload.length).toBe(0);
		expect(decoded!.streamId).toBe(1);
	});

	it('writes the stream id big-endian', () => {
		const frame = encodeFrame(0x01020304, TYPE_TCP_DATA);
		expect([...frame.slice(0, 4)]).toEqual([0x01, 0x02, 0x03, 0x04]);
	});

	it('carries the whole 32-bit stream id range', () => {
		for (const id of [0, 1, 255, 256, 65535, 0x7fffffff, 0xfffffffe, 0xffffffff]) {
			expect(decodeFrame(encodeFrame(id, TYPE_TCP_DATA))!.streamId).toBe(id);
		}
	});

	it('coerces a negative stream id to its unsigned form', () => {
		// `streamId >>> 0` in the encoder: -1 is the same 32 bits as 0xffffffff
		expect(decodeFrame(encodeFrame(-1, TYPE_TCP_DATA))!.streamId).toBe(0xffffffff);
	});

	it('rejects a frame shorter than the header', () => {
		for (let n = 0; n < HEADER_BYTES; n++) {
			expect(decodeFrame(new Uint8Array(n))).toBeNull();
		}
	});

	it('accepts a frame that is exactly the header', () => {
		const decoded = decodeFrame(new Uint8Array(HEADER_BYTES));
		expect(decoded).not.toBeNull();
		expect(decoded!.payload.length).toBe(0);
	});

	it('reads the right bytes from a view into a larger buffer', () => {
		// a WebSocket implementation may hand over a subarray rather than a
		// buffer of its own; the DataView has to respect byteOffset
		const backing = new Uint8Array(64).fill(0xaa);
		const frame = encodeFrame(0x11223344, TYPE_UDP_DATA, new Uint8Array([9, 8, 7]));
		backing.set(frame, 20);
		const view = backing.subarray(20, 20 + frame.length);
		const decoded = decodeFrame(view);
		expect(decoded!.streamId).toBe(0x11223344);
		expect(decoded!.type).toBe(TYPE_UDP_DATA);
		expect([...decoded!.payload]).toEqual([9, 8, 7]);
	});

	it('returns a payload that views the same bytes, not a copy', () => {
		const frame = encodeFrame(1, TYPE_TCP_DATA, new Uint8Array([1, 2, 3]));
		const decoded = decodeFrame(frame)!;
		frame[HEADER_BYTES] = 99;
		expect(decoded.payload[0]).toBe(99);
	});

	it('never throws on arbitrary bytes', () => {
		let seed = 987;
		const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
		for (let i = 0; i < 300; i++) {
			const len = rand() % 40;
			const msg = new Uint8Array(len);
			for (let j = 0; j < len; j++) msg[j] = rand();
			expect(() => decodeFrame(msg)).not.toThrow();
		}
	});
});

describe('encodeUdpPayload', () => {
	it('lays out hostLen, host, port and data in order', () => {
		const out = encodeUdpPayload('a.b', 53, new Uint8Array([0xde, 0xad]));
		const view = new DataView(out.buffer);
		expect(view.getUint16(0, false)).toBe(3);
		expect(new TextDecoder().decode(out.subarray(2, 5))).toBe('a.b');
		expect(view.getUint16(5, false)).toBe(53);
		expect([...out.subarray(7)]).toEqual([0xde, 0xad]);
	});

	it('sizes the buffer exactly', () => {
		const out = encodeUdpPayload('host', 1, new Uint8Array(10));
		expect(out.length).toBe(4 + 4 + 10);
	});

	it('handles an empty payload', () => {
		expect(encodeUdpPayload('h', 1, new Uint8Array(0)).length).toBe(4 + 1);
	});

	it('counts a multi-byte host in bytes, not characters', () => {
		const host = 'ü.example';
		const out = encodeUdpPayload(host, 1, new Uint8Array(0));
		const byteLen = new TextEncoder().encode(host).length;
		expect(byteLen).toBeGreaterThan(host.length);
		expect(new DataView(out.buffer).getUint16(0, false)).toBe(byteLen);
	});

	it('writes the highest port big-endian', () => {
		const out = encodeUdpPayload('h', 65535, new Uint8Array(0));
		expect([...out.subarray(3, 5)]).toEqual([0xff, 0xff]);
	});
});

describe('encodeText', () => {
	it('encodes as UTF-8', () => {
		expect([...encodeText('ab')]).toEqual([97, 98]);
		expect(encodeText('ü').length).toBe(2);
	});

	it('encodes an empty string to no bytes', () => {
		expect(encodeText('').length).toBe(0);
	});
});

describe('parseIcmpTarget', () => {
	const bytes = (s: string) => new TextEncoder().encode(s);

	it('reads the host from a host:port target', () => {
		expect(parseIcmpTarget(bytes('1.1.1.1:0'))).toBe('1.1.1.1');
		expect(parseIcmpTarget(bytes('example.com:0'))).toBe('example.com');
	});

	it('takes the last colon, so IPv6 keeps its own', () => {
		expect(parseIcmpTarget(bytes('2001:db8::1:0'))).toBe('2001:db8::1');
	});

	it('ignores surrounding whitespace', () => {
		expect(parseIcmpTarget(bytes('  1.1.1.1:0  '))).toBe('1.1.1.1');
	});

	it('returns null when there is no port', () => {
		expect(parseIcmpTarget(bytes('1.1.1.1'))).toBeNull();
	});

	it('returns null when the port is not a number', () => {
		expect(parseIcmpTarget(bytes('1.1.1.1:http'))).toBeNull();
	});

	it('returns null for an empty or leading-colon target', () => {
		expect(parseIcmpTarget(bytes(''))).toBeNull();
		// a colon at index 0 leaves no host before it, which is not the same as
		// having no colon at all
		expect(parseIcmpTarget(bytes(':0'))).toBeNull();
		expect(parseIcmpTarget(bytes(':'))).toBeNull();
	});

	it('accepts a single-character host', () => {
		// the colon is at index 1 here, the first position that leaves a host
		expect(parseIcmpTarget(bytes('a:0'))).toBe('a');
	});

	it('rejects a host with characters a target may not contain', () => {
		expect(parseIcmpTarget(bytes('a/b:0'))).toBeNull();
		expect(parseIcmpTarget(bytes('a b:0'))).toBeNull();
		expect(parseIcmpTarget(bytes('a@b:0'))).toBeNull();
		expect(parseIcmpTarget(bytes('a\\b:0'))).toBeNull();
	});

	it('never throws on arbitrary bytes', () => {
		let seed = 4242;
		const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
		for (let i = 0; i < 300; i++) {
			const len = rand() % 32;
			const msg = new Uint8Array(len);
			for (let j = 0; j < len; j++) msg[j] = rand();
			expect(() => parseIcmpTarget(msg)).not.toThrow();
		}
	});
});

describe('splitHostPort', () => {
	/* This feeds the relay allowlist, so a wrong split is an access-control
	   result, not a cosmetic one. */

	it('splits a plain host:port', () => {
		expect(splitHostPort('example.com:443')).toEqual({ host: 'example.com', port: 443 });
	});

	it('returns a null port when there is none', () => {
		expect(splitHostPort('example.com')).toEqual({ host: 'example.com', port: null });
	});

	it('splits on the last colon, so bare IPv6 keeps its own', () => {
		expect(splitHostPort('2001:db8::1:443')).toEqual({ host: '2001:db8::1', port: 443 });
	});

	it('unwraps a bracketed IPv6 address', () => {
		expect(splitHostPort('[2001:db8::1]:443')).toEqual({ host: '2001:db8::1', port: 443 });
		expect(splitHostPort('[::1]:80')).toEqual({ host: '::1', port: 80 });
	});

	it('returns a null port for a bracketed address with none', () => {
		const out = splitHostPort('[2001:db8::1]');
		expect(out.host).toBe('2001:db8::1');
		expect(out.port).toBeNull();
	});

	it('trims surrounding whitespace', () => {
		expect(splitHostPort('  example.com:443  ')).toEqual({ host: 'example.com', port: 443 });
	});

	it('returns a null port when the port is not a number', () => {
		expect(splitHostPort('example.com:https')).toEqual({ host: 'example.com', port: null });
	});

	it('returns a null port for a trailing colon with nothing after it', () => {
		// Number('') is 0, so an empty port must be rejected explicitly rather
		// than read as port 0 -- an allowlist entry written this way would
		// otherwise match nothing at all
		expect(splitHostPort('example.com:')).toEqual({ host: 'example.com', port: null });
		expect(splitHostPort('[2001:db8::1]:')).toEqual({ host: '2001:db8::1', port: null });
	});

	it('accepts port 0 when it is actually written', () => {
		expect(splitHostPort('example.com:0')).toEqual({ host: 'example.com', port: 0 });
	});

	it('yields an empty host for an empty bracket pair', () => {
		// "]" sits at index 1, so the bracket branch takes it and unwraps
		// nothing. Harmless — an empty host matches no allowlist entry, and no
		// real config contains this — but pinned so the behaviour is known.
		expect(splitHostPort('[]:443')).toEqual({ host: '', port: 443 });
	});

	it('misreads an unclosed bracket, which is why brackets must be closed', () => {
		// with no "]" the bracket branch is skipped and the last colon wins, so
		// the final group of the address is taken for a port. This is the whole
		// reason a bare IPv6 address has to be written "[...]" to be unambiguous.
		expect(splitHostPort('[2001:db8::1')).toEqual({ host: '[2001:db8:', port: 1 });
	});

	it('unwraps a single-character bracketed host', () => {
		expect(splitHostPort('[a]:443')).toEqual({ host: 'a', port: 443 });
	});

	it('keeps a leading colon out of the host position', () => {
		// lastIndexOf(':') <= 0 means "no host before the colon" -- the whole
		// string stays the host rather than becoming an empty one
		expect(splitHostPort(':443')).toEqual({ host: ':443', port: null });
	});

	it('handles an empty string', () => {
		expect(splitHostPort('')).toEqual({ host: '', port: null });
	});

	it('keeps the star used by the allowlist', () => {
		expect(splitHostPort('*')).toEqual({ host: '*', port: null });
		expect(splitHostPort('*:443')).toEqual({ host: '*', port: 443 });
	});
});
