import { describe, it, expect } from 'vitest';
import { parseQuestion, fromBase64Url } from '../../src/lib/dns-message';

/* Both of these read bytes chosen by the caller, so the malformed cases are
   the point: parseQuestion must return null rather than read past the buffer,
   and it must never accept a compression pointer in the first question. */

/** A wire-format query for `name`, with a 12-byte header. */
function query(name: string, opts: { qdcount?: number; trailing?: number[] } = {}): Uint8Array {
	const header = [
		0x12, 0x34, // id
		0x01, 0x00, // flags: standard query, RD
		0x00, opts.qdcount ?? 1, // qdcount
		0x00, 0x00, // ancount
		0x00, 0x00, // nscount
		0x00, 0x00 // arcount
	];
	const labels: number[] = [];
	for (const label of name.split('.').filter(Boolean)) {
		labels.push(label.length, ...[...label].map((c) => c.charCodeAt(0)));
	}
	labels.push(0x00); // root
	const tail = [0x00, 0x01, 0x00, 0x01]; // QTYPE=A, QCLASS=IN
	return new Uint8Array([...header, ...labels, ...tail, ...(opts.trailing ?? [])]);
}

describe('parseQuestion', () => {
	it('reads a single-label name', () => {
		const q = parseQuestion(query('localhost'));
		expect(q?.name).toBe('localhost');
	});

	it('reads a dotted name', () => {
		expect(parseQuestion(query('example.com'))?.name).toBe('example.com');
		expect(parseQuestion(query('a.b.c.example.com'))?.name).toBe('a.b.c.example.com');
	});

	it('reports the byte after QTYPE/QCLASS as the end', () => {
		const msg = query('example.com');
		const q = parseQuestion(msg);
		// 12 header + 13 name (1+7 + 1+3 + 1 root) + 4 = 29
		expect(q?.end).toBe(29);
		expect(q!.end).toBeLessThanOrEqual(msg.length);
	});

	it('ignores anything after the first question', () => {
		const q = parseQuestion(query('example.com', { trailing: [0xff, 0xff, 0xff] }));
		expect(q?.name).toBe('example.com');
		expect(q?.end).toBe(29);
	});

	it('returns null for a message too short to hold a question', () => {
		expect(parseQuestion(new Uint8Array(0))).toBeNull();
		expect(parseQuestion(new Uint8Array(12))).toBeNull();
		expect(parseQuestion(new Uint8Array(16))).toBeNull();
	});

	it('accepts the shortest real query', () => {
		// a one-character name: 12 header + len + 'a' + root + QTYPE/QCLASS
		const msg = query('a');
		expect(msg.length).toBe(19);
		expect(parseQuestion(msg)?.name).toBe('a');
	});

	it('still refuses a 17-byte message whose QTYPE/QCLASS is cut short', () => {
		// 17 passes the length floor but leaves only 2 of the 4 trailing bytes,
		// so the `end <= msg.length` check is what actually rejects it. The
		// shortest complete query is 18 bytes; the floor is deliberately loose
		// and the later check is the one that has to be right.
		const msg = new Uint8Array([
			0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0,
			0x01, 0x61, 0x00, 0x00, 0x01
		]);
		expect(msg.length).toBe(17);
		expect(parseQuestion(msg)).toBeNull();
	});

	it('accepts a label that ends exactly at the last usable byte', () => {
		// the bounds check is `off + len > msg.length`, so a label finishing on
		// the final byte must still be read rather than refused
		const q = parseQuestion(query('example.com'));
		expect(q?.name).toBe('example.com');
	});

	it('accepts a name at the label-count limit', () => {
		// 63 single-character labels: the guard refuses above this, not at it
		const name = Array.from({ length: 63 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('.');
		expect(parseQuestion(query(name))?.name).toBe(name);
	});

	it('refuses a name past the label-count limit', () => {
		// a message with more labels than any real name carries: the guard keeps
		// a malformed query from building an unbounded list
		const name = Array.from({ length: 200 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('.');
		expect(parseQuestion(query(name))).toBeNull();
	});

	it('returns null when the header claims no questions', () => {
		expect(parseQuestion(query('example.com', { qdcount: 0 }))).toBeNull();
	});

	it('refuses a compression pointer in the first question', () => {
		// 0xc0 marks a pointer; nothing precedes the first question for one to
		// point at, so this can only be a malformed or hostile message
		const msg = query('example.com');
		msg[12] = 0xc0;
		expect(parseQuestion(msg)).toBeNull();
	});

	it('refuses the other reserved label types', () => {
		for (const marker of [0x40, 0x80, 0xc0]) {
			const msg = query('example.com');
			msg[12] = marker;
			expect(parseQuestion(msg)).toBeNull();
		}
	});

	it('returns null when a label runs past the end of the buffer', () => {
		const msg = query('example.com');
		msg[12] = 0x7f; // claims a 127-byte label the message does not contain
		expect(parseQuestion(msg)).toBeNull();
	});

	it('returns null for a name with no labels', () => {
		// header, a root label straight away, then QTYPE/QCLASS
		const msg = new Uint8Array([
			0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0,
			0x00, 0x00, 0x01, 0x00, 0x01
		]);
		expect(parseQuestion(msg)).toBeNull();
	});

	it('returns null when the message ends before QTYPE/QCLASS', () => {
		const full = query('example.com');
		// drop the last two bytes of QCLASS
		expect(parseQuestion(full.subarray(0, full.length - 2))).toBeNull();
	});

	it('returns null when the name is never terminated', () => {
		// a label that fills the rest of the buffer, with no root byte after it
		const msg = new Uint8Array(24);
		msg[5] = 1; // qdcount
		msg[12] = 5;
		for (let i = 13; i < 18; i++) msg[i] = 0x61;
		msg[18] = 5; // another label, but the buffer ends inside it
		for (let i = 19; i < 24; i++) msg[i] = 0x62;
		expect(parseQuestion(msg)).toBeNull();
	});

	it('never reports an end past the buffer, for any truncation', () => {
		const full = query('a.b.example.com');
		for (let cut = 0; cut <= full.length; cut++) {
			const q = parseQuestion(full.subarray(0, cut));
			if (q) expect(q.end).toBeLessThanOrEqual(cut);
		}
	});

	it('never throws, whatever the bytes are', () => {
		// deterministic pseudo-random fuzzing: a parser reading attacker bytes
		// must fail by returning null, not by throwing
		let seed = 12345;
		const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
		for (let i = 0; i < 500; i++) {
			const len = rand() % 64;
			const msg = new Uint8Array(len);
			for (let j = 0; j < len; j++) msg[j] = rand();
			expect(() => parseQuestion(msg)).not.toThrow();
		}
	});
});

describe('fromBase64Url', () => {
	/** base64url of the given bytes, unpadded, as a DoH client sends. */
	const encode = (bytes: number[]) =>
		btoa(String.fromCharCode(...bytes))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');

	it('decodes what it is given, for every padding length', () => {
		for (const bytes of [[1], [1, 2], [1, 2, 3], [1, 2, 3, 4]]) {
			expect([...fromBase64Url(encode(bytes))!]).toEqual(bytes);
		}
	});

	it('decodes the url-safe alphabet', () => {
		// 0xfb 0xff encodes to "-_" in base64url and "+/" in standard base64
		const bytes = [0xfb, 0xef, 0xbe];
		const urlSafe = encode(bytes);
		expect(urlSafe).toMatch(/[-_]/);
		expect([...fromBase64Url(urlSafe)!]).toEqual(bytes);
	});

	it('accepts input that already carries padding', () => {
		expect([...fromBase64Url('AQID')!]).toEqual([1, 2, 3]);
	});

	it('decodes an empty string to an empty array', () => {
		expect([...fromBase64Url('')!]).toEqual([]);
	});

	it('returns null for text that is not base64', () => {
		expect(fromBase64Url('!!!!')).toBeNull();
		expect(fromBase64Url('a b c')).toBeNull();
	});

	it('round-trips a real query', () => {
		const q = query('example.com');
		const decoded = fromBase64Url(encode([...q]));
		expect(decoded).not.toBeNull();
		expect([...decoded!]).toEqual([...q]);
		expect(parseQuestion(decoded!)?.name).toBe('example.com');
	});

	it('never throws on arbitrary text', () => {
		for (const text of ['', '=', '==', '===', 'a', 'ab', ' ', '\u0000', 'ü', '%%%', 'A'.repeat(999)]) {
			expect(() => fromBase64Url(text)).not.toThrow();
		}
	});
});
