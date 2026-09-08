import { describe, it, expect } from 'vitest';
import { CHUNK, parseImages, parseRange, parseR2Source, sourceVersion } from '../../src/lib/vm-storage';

/* parseRange reads an attacker-controlled HTTP header and turns it into byte
   offsets, so the out-of-bounds cases below are the point of this file. */

describe('parseRange', () => {
	const SIZE = 1000;

	it('reads a closed range', () => {
		expect(parseRange('bytes=0-99', SIZE)).toEqual({ start: 0, end: 99 });
		expect(parseRange('bytes=100-199', SIZE)).toEqual({ start: 100, end: 199 });
	});

	it('reads an open-ended range as running to the last byte', () => {
		expect(parseRange('bytes=500-', SIZE)).toEqual({ start: 500, end: 999 });
	});

	it('reads a suffix range as the last N bytes', () => {
		expect(parseRange('bytes=-100', SIZE)).toEqual({ start: 900, end: 999 });
	});

	it('clamps a suffix longer than the file to the whole file', () => {
		expect(parseRange('bytes=-5000', SIZE)).toEqual({ start: 0, end: 999 });
	});

	it('clamps an end past the last byte', () => {
		expect(parseRange('bytes=0-5000', SIZE)).toEqual({ start: 0, end: 999 });
	});

	it('accepts the first and last single byte', () => {
		expect(parseRange('bytes=0-0', SIZE)).toEqual({ start: 0, end: 0 });
		expect(parseRange('bytes=999-999', SIZE)).toEqual({ start: 999, end: 999 });
	});

	it('tolerates surrounding whitespace', () => {
		expect(parseRange('  bytes=0-99  ', SIZE)).toEqual({ start: 0, end: 99 });
	});

	it('refuses a start at or past the end of the file', () => {
		expect(parseRange('bytes=1000-1100', SIZE)).toBeNull();
		expect(parseRange('bytes=1000-', SIZE)).toBeNull();
		expect(parseRange('bytes=99999-', SIZE)).toBeNull();
	});

	it('refuses a backwards range', () => {
		expect(parseRange('bytes=500-100', SIZE)).toBeNull();
	});

	it('refuses a zero or negative suffix', () => {
		expect(parseRange('bytes=-0', SIZE)).toBeNull();
	});

	it.each([
		['no unit', '0-99'],
		['wrong unit', 'items=0-99'],
		['multiple ranges', 'bytes=0-99,200-299'],
		['negative start', 'bytes=-10-20'],
		['non-numeric', 'bytes=abc-def'],
		['empty', ''],
		['unit only', 'bytes='],
		['missing dash', 'bytes=100'],
		['float offsets', 'bytes=1.5-9.5'],
		['hex offsets', 'bytes=0x10-0x20'],
		['plus sign', 'bytes=+10-+20'],
		['whitespace inside', 'bytes=0 - 99']
	])('refuses a malformed header (%s)', (_label, header) => {
		expect(parseRange(header, SIZE)).toBeNull();
	});

	it('never returns an offset outside the file, for any input', () => {
		const headers = [
			'bytes=0-',
			'bytes=-1',
			'bytes=-999999',
			'bytes=0-999999',
			'bytes=999-',
			'bytes=0-0'
		];
		for (const h of headers) {
			const r = parseRange(h, SIZE);
			if (!r) continue;
			expect(r.start).toBeGreaterThanOrEqual(0);
			expect(r.end).toBeLessThan(SIZE);
			expect(r.start).toBeLessThanOrEqual(r.end);
		}
	});

	it('handles a one-byte file', () => {
		expect(parseRange('bytes=0-0', 1)).toEqual({ start: 0, end: 0 });
		expect(parseRange('bytes=1-1', 1)).toBeNull();
		expect(parseRange('bytes=-1', 1)).toEqual({ start: 0, end: 0 });
	});
});

describe('parseImages', () => {
	it('reads one name|source|size triple', () => {
		expect(parseImages('alpine|https://cdn/alpine.iso|1024')).toEqual({
			alpine: { url: 'https://cdn/alpine.iso', size: 1024 }
		});
	});

	it('reads several, comma separated', () => {
		const out = parseImages('a|https://x/a|10,b|r2:vm/b|20');
		expect(Object.keys(out)).toEqual(['a', 'b']);
		expect(out.b).toEqual({ url: 'r2:vm/b', size: 20 });
	});

	it('trims whitespace around each field', () => {
		expect(parseImages(' a | https://x/a | 10 ')).toEqual({
			a: { url: 'https://x/a', size: 10 }
		});
	});

	it('returns nothing for undefined or empty input', () => {
		expect(parseImages(undefined)).toEqual({});
		expect(parseImages('')).toEqual({});
	});

	it.each([
		['missing size', 'a|https://x/a'],
		['missing url', 'a||10'],
		['missing name', '|https://x/a|10'],
		['zero size', 'a|https://x/a|0'],
		['negative size', 'a|https://x/a|-5'],
		['non-numeric size', 'a|https://x/a|big']
	])('skips a malformed entry (%s)', (_label, entry) => {
		expect(parseImages(entry)).toEqual({});
	});

	it('keeps the good entries and drops only the bad ones', () => {
		const out = parseImages('good|https://x/g|10,bad|https://x/b|nope,also|r2:k|20');
		expect(Object.keys(out)).toEqual(['good', 'also']);
	});
});

describe('parseR2Source', () => {
	it('reads a plain key', () => {
		expect(parseR2Source('r2:vm/vmlinuz')).toEqual({ key: 'vm/vmlinuz', partBytes: null });
	});

	it('reads a key with a part size', () => {
		expect(parseR2Source('r2:vm/rootfs@1048576')).toEqual({
			key: 'vm/rootfs',
			partBytes: 1048576
		});
	});

	it('drops a build marker after #', () => {
		expect(parseR2Source('r2:vm/vmlinuz#b19')).toEqual({ key: 'vm/vmlinuz', partBytes: null });
		expect(parseR2Source('r2:vm/rootfs@100#b19')).toEqual({ key: 'vm/rootfs', partBytes: 100 });
	});

	it('ignores a non-numeric or zero part size', () => {
		expect(parseR2Source('r2:vm/k@abc')).toEqual({ key: 'vm/k@abc', partBytes: null });
		expect(parseR2Source('r2:vm/k@0')).toEqual({ key: 'vm/k@0', partBytes: null });
	});

	it('splits on the last @, so a key may contain one', () => {
		expect(parseR2Source('r2:vm/a@b/c@100')).toEqual({ key: 'vm/a@b/c', partBytes: 100 });
	});

	it('treats a leading @ as part of the key, not a separator', () => {
		expect(parseR2Source('r2:@100')).toEqual({ key: '@100', partBytes: null });
	});
});

describe('sourceVersion', () => {
	it('is stable for the same source', () => {
		const image = { url: 'r2:vm/a', size: 10 };
		expect(sourceVersion(image)).toBe(sourceVersion({ ...image }));
	});

	it('changes when the url changes', () => {
		expect(sourceVersion({ url: 'r2:vm/a', size: 10 })).not.toBe(
			sourceVersion({ url: 'r2:vm/b', size: 10 })
		);
	});

	it('changes when the size changes', () => {
		// a rebuilt image is often the same size, which is why the url carries a
		// build marker too -- but size alone must still move the version
		expect(sourceVersion({ url: 'r2:vm/a', size: 10 })).not.toBe(
			sourceVersion({ url: 'r2:vm/a', size: 11 })
		);
	});

	it('changes when only the build marker changes', () => {
		expect(sourceVersion({ url: 'r2:vm/a#b1', size: 10 })).not.toBe(
			sourceVersion({ url: 'r2:vm/a#b2', size: 10 })
		);
	});

	it('is a short printable token', () => {
		expect(sourceVersion({ url: 'r2:vm/a', size: 10 })).toMatch(/^[0-9a-z]+$/);
	});
});

describe('CHUNK', () => {
	it('is a power of two, so ranges align on cache entries', () => {
		expect(CHUNK).toBe(1024 * 1024);
		expect(CHUNK & (CHUNK - 1)).toBe(0);
	});
});
