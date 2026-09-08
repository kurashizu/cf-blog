import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Patterns the visitor saved, which live in localStorage and are therefore
 * whatever is in localStorage — including nothing, and including junk written
 * by a different version or a different site on the same origin.
 *
 * `loadCustom` memoises into a module-level variable, so each test imports the
 * module fresh rather than trying to reset it from outside.
 */

/** A localStorage stand-in whose contents and behaviour the test picks. */
function fakeStorage(initial?: string | null, opts: { throwOnGet?: boolean; throwOnSet?: boolean } = {}) {
	const store = new Map<string, string>();
	if (typeof initial === 'string') store.set('lifelab.custom.v1', initial);
	return {
		store,
		getItem: (k: string) => {
			if (opts.throwOnGet) throw new Error('blocked');
			return store.get(k) ?? null;
		},
		setItem: (k: string, v: string) => {
			if (opts.throwOnSet) throw new Error('quota');
			store.set(k, v);
		},
		removeItem: (k: string) => void store.delete(k)
	};
}

/** Import patterns.js with a chosen localStorage in place. */
async function withStorage(storage: ReturnType<typeof fakeStorage>) {
	vi.stubGlobal('localStorage', storage);
	vi.resetModules();
	return await import('../../src/lib/components/lifelab/patterns.js');
}

beforeEach(() => {
	vi.resetModules();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('reading saved patterns', () => {
	it('starts empty when nothing was saved', async () => {
		const { custom } = await withStorage(fakeStorage(null));
		expect(custom.list()).toEqual([]);
	});

	it('reads a saved entry', async () => {
		const saved = JSON.stringify([{ key: 'c_1', label: 'MINE', rle: 'o!', w: 1, h: 1 }]);
		const { custom } = await withStorage(fakeStorage(saved));
		expect(custom.list()).toHaveLength(1);
		expect(custom.list()[0].label).toBe('MINE');
	});

	it.each([
		['not JSON at all', 'not json{'],
		['a JSON scalar', '42'],
		['a JSON object rather than a list', '{"key":"c_1"}'],
		['null', 'null']
	])('treats %s as nothing saved', async (_label, raw) => {
		const { custom } = await withStorage(fakeStorage(raw));
		expect(custom.list()).toEqual([]);
	});

	it('drops entries that are missing a key or an rle', async () => {
		const saved = JSON.stringify([
			{ key: 'c_ok', rle: 'o!', label: 'KEEP' },
			{ key: 'c_nokey', label: 'NO RLE' },
			{ rle: 'o!', label: 'NO KEY' },
			{ key: 5, rle: 'o!' },
			null,
			'string'
		]);
		const { custom } = await withStorage(fakeStorage(saved));
		expect(custom.list().map((c: { key: string }) => c.key)).toEqual(['c_ok']);
	});

	it('survives a localStorage that refuses to be read', async () => {
		const { custom } = await withStorage(fakeStorage(null, { throwOnGet: true }));
		expect(custom.list()).toEqual([]);
	});

	it('hands out a copy, so a caller cannot edit the list in place', async () => {
		const saved = JSON.stringify([{ key: 'c_1', rle: 'o!', label: 'MINE' }]);
		const { custom } = await withStorage(fakeStorage(saved));
		custom.list().push({ key: 'c_2', rle: 'o!', label: 'SNUCK IN', w: 1, h: 1 });
		expect(custom.list()).toHaveLength(1);
	});
});

describe('adding a pattern', () => {
	it('saves it and reports it', async () => {
		const storage = fakeStorage(null);
		const { custom } = await withStorage(storage);
		const key = custom.add('my shape', [[0, 0], [1, 0]], 2, 1);
		expect(custom.has(key)).toBe(true);
		expect(custom.list()).toHaveLength(1);
		expect(storage.store.get('lifelab.custom.v1')).toContain(key);
	});

	it('upper-cases and trims the label', async () => {
		const { custom } = await withStorage(fakeStorage(null));
		const key = custom.add('  my shape  ', [[0, 0]], 1, 1);
		expect(custom.list().find((c: { key: string }) => c.key === key)?.label).toBe('MY SHAPE');
	});

	it('caps a very long label', async () => {
		const { custom } = await withStorage(fakeStorage(null));
		custom.add('x'.repeat(80), [[0, 0]], 1, 1);
		expect(custom.list()[0].label.length).toBeLessThanOrEqual(28);
	});

	it('falls back to a name when given none', async () => {
		const { custom } = await withStorage(fakeStorage(null));
		custom.add('', [[0, 0]], 1, 1);
		expect(custom.list()[0].label).toBeTruthy();
		custom.add('   ', [[0, 0]], 1, 1);
		expect(custom.list()[1].label).toBeTruthy();
	});

	it('stores the cells as single-line RLE', async () => {
		const { custom } = await withStorage(fakeStorage(null));
		custom.add('shape', [[0, 0], [2, 1]], 3, 2);
		const rle = custom.list()[0].rle;
		expect(rle).not.toContain('\n');
		expect(rle).toContain('!');
	});

	it('gives every pattern its own key', async () => {
		const { custom } = await withStorage(fakeStorage(null));
		const keys = new Set([
			custom.add('a', [[0, 0]], 1, 1),
			custom.add('b', [[0, 0]], 1, 1),
			custom.add('c', [[0, 0]], 1, 1)
		]);
		expect(keys.size).toBe(3);
	});

	it('keeps the pattern for this visit when the write is refused', async () => {
		// private mode: setItem throws, but the visitor's shape should not
		// vanish out from under them mid-session
		const { custom } = await withStorage(fakeStorage(null, { throwOnSet: true }));
		const key = custom.add('shape', [[0, 0]], 1, 1);
		expect(custom.has(key)).toBe(true);
	});
});

describe('removing a pattern', () => {
	it('removes it and persists the change', async () => {
		const storage = fakeStorage(null);
		const { custom } = await withStorage(storage);
		const key = custom.add('shape', [[0, 0]], 1, 1);
		custom.remove(key);
		expect(custom.has(key)).toBe(false);
		expect(custom.list()).toEqual([]);
		expect(storage.store.get('lifelab.custom.v1')).not.toContain(key);
	});

	it('leaves the others alone', async () => {
		const { custom } = await withStorage(fakeStorage(null));
		const a = custom.add('a', [[0, 0]], 1, 1);
		const b = custom.add('b', [[0, 0]], 1, 1);
		custom.remove(a);
		expect(custom.has(b)).toBe(true);
		expect(custom.list()).toHaveLength(1);
	});

	it('does nothing for a key that is not there', async () => {
		const { custom } = await withStorage(fakeStorage(null));
		custom.add('a', [[0, 0]], 1, 1);
		custom.remove('c_nothing');
		expect(custom.list()).toHaveLength(1);
	});
});

describe('patternMeta', () => {
	it('describes a built-in pattern', async () => {
		const { patternMeta } = await withStorage(fakeStorage(null));
		const meta = patternMeta('glider');
		expect(meta?.label).toBeTruthy();
		expect(meta?.custom).toBeUndefined();
	});

	it('describes a saved pattern and marks it custom', async () => {
		const { custom, patternMeta } = await withStorage(fakeStorage(null));
		const key = custom.add('mine', [[0, 0]], 1, 1);
		const meta = patternMeta(key);
		expect(meta?.label).toBe('MINE');
		expect(meta?.custom).toBe(true);
	});

	it('gives a saved pattern a note when it has none of its own', async () => {
		const { custom, patternMeta } = await withStorage(fakeStorage(null));
		const key = custom.add('mine', [[0, 0]], 1, 1);
		expect(patternMeta(key)?.note).toBeTruthy();
	});

	it('keeps a note the pattern was saved with', async () => {
		const { custom, patternMeta } = await withStorage(fakeStorage(null));
		const key = custom.add('mine', [[0, 0]], 1, 1, 'my own note');
		expect(patternMeta(key)?.note).toBe('my own note');
	});

	it('returns null for a name it does not know', async () => {
		const { patternMeta } = await withStorage(fakeStorage(null));
		expect(patternMeta('no-such-pattern')).toBeNull();
	});
});

describe('a saved pattern behaves like a built-in one', () => {
	it('can be decoded back to the cells it was saved from', async () => {
		const { custom, pattern } = await withStorage(fakeStorage(null));
		const cells = [
			[0, 0],
			[1, 0],
			[2, 0]
		];
		const key = custom.add('blinker of my own', cells, 3, 1);
		const p = pattern(key);
		expect(p.cells.length).toBe(3);
		expect(p.w).toBe(3);
	});

	it('is classified by the same code as a built-in', async () => {
		const { custom, kindOf } = await withStorage(fakeStorage(null));
		// a block, saved by hand, is still a still life
		const key = custom.add('my block', [[0, 0], [1, 0], [0, 1], [1, 1]], 2, 2);
		expect(kindOf(key)).toBe('still');
	});
});
