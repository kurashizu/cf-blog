import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * Which modules are allowed to know about the Web Audio engine.
 *
 * synth.ts holds a 4,000-line class and reaches for a live AudioContext, so
 * anything importing it inherits both. That was true of all six song files --
 * 1.5 MB of note data that wanted one type, `TrackData`, and dragged the whole
 * engine in behind it -- and of the pure store modules that vitest measures
 * coverage on, which had to pull in Web Audio for two constants.
 *
 * The vocabulary now lives in track-data.ts, which imports nothing but a type.
 * These tests keep it that way: the split is only worth anything for as long
 * as nobody quietly reintroduces the edge.
 */

const read = (p: string) => readFileSync(p, 'utf8');
const importsSynth = (src: string) => /from '(\.\.\/)+synth'/.test(src);

describe('the note data does not depend on the engine', () => {
	it.each(readdirSync('src/lib/songs').filter((f) => f.endsWith('.ts')))('%s', (file) => {
		expect(importsSynth(read(`src/lib/songs/${file}`))).toBe(false);
	});
});

describe('the modules coverage is measured on stay testable without Web Audio', () => {
	/* Exactly the list in vitest.config.ts, which exists because these are the
	   ones that can be unit-tested at all. A synth.ts import here does not fail
	   the suite loudly -- it makes the module untestable, which shows up much
	   later as a coverage row that quietly went to zero. */
	it.each([
		'patch-format.ts',
		'note-lanes.ts',
		'graph-model.ts',
		'node-graph.ts',
		'graph-history.ts'
	])('%s', (file) => {
		expect(importsSynth(read(`src/lib/stores/${file}`))).toBe(false);
	});
});

describe('the vocabulary itself stays free of the engine', () => {
	it('imports nothing that could reach an AudioContext', () => {
		const src = read('src/lib/track-data.ts');
		/* Real import statements only. Matching every quoted path also caught the
		   file's own docblock, which explains the split by quoting the import it
		   replaced -- a test that reads source has to be told where the code is. */
		const imports = [...src.matchAll(/^import[^;]*?from '([^']+)';/gm)].map((m) => m[1]);
		expect(imports).toEqual(['./stores/note-lanes']);
	});

	it('says nothing about Web Audio at all', () => {
		const src = read('src/lib/track-data.ts');
		for (const banned of ['AudioContext', 'AudioNode', 'AudioParam', 'soundEngine']) {
			expect(src.includes(banned), `track-data.ts mentions ${banned}`).toBe(false);
		}
	});
});
