import { describe, it, expect } from 'vitest';
import {
	migratePatch,
	trackResetDefaults,
	blankTrack,
	isPatchFile,
	STEPS_PER_BEAT,
	type SynthPatchFile
} from '../../src/lib/stores/patch-format';

/**
 * Saving and loading a project.
 *
 * The synth has grown fields since the format was written -- automation lanes,
 * a per-preset level, a patch graph, per-key drum timbres -- and each one is a
 * chance for a saved file to come back wrong in a way nothing announces. Two
 * failures matter: an older project that no longer loads, and a project that
 * loads but leaves part of the previous song underneath it.
 */

const file = (over: Partial<SynthPatchFile> = {}): SynthPatchFile => ({
	tracks: [],
	bpm: 120,
	meter: '4/4',
	totalSteps: 64,
	stepsPerBeat: STEPS_PER_BEAT,
	...over
});

describe('reading a project file', () => {
	it('accepts a file with a tracks array', () => {
		expect(isPatchFile(file())).toBe(true);
	});

	it.each([
		['null', null],
		['a string', 'nope'],
		['an object with no tracks', { bpm: 120 }],
		['tracks that are not an array', { tracks: 'x' }]
	])('rejects %s', (_label, value) => {
		expect(isPatchFile(value)).toBe(false);
	});
});

describe('older projects still load', () => {
	it('expands a legacy 1/8-beat grid onto the 1/24-beat one', () => {
		// Each step becomes three, so a note keeps its length in time rather
		// than in steps -- a bar written before the finer grid must not play
		// three times too fast.
		const legacy = file({
			stepsPerBeat: undefined,
			totalSteps: 32,
			tracks: [{ id: 0, grid: [[60], []], accents: [2, 0] } as never]
		});
		const out = migratePatch(legacy);
		expect(out.stepsPerBeat).toBe(STEPS_PER_BEAT);
		expect(out.totalSteps).toBe(96);
		expect(out.tracks[0].grid).toEqual([[60], [60], [60], [], [], []]);
	});

	it('carries an accent on the strike, not across the whole note', () => {
		const out = migratePatch(
			file({ stepsPerBeat: undefined, tracks: [{ id: 0, accents: [3, 1] } as never] })
		);
		expect(out.tracks[0].accents).toEqual([3, 0, 0, 1, 0, 0]);
	});

	it('leaves a current-format patch untouched', () => {
		const cur = file({ tracks: [{ id: 0, grid: [[60]] } as never] });
		expect(migratePatch(cur)).toBe(cur);
	});

	it('survives a patch with no tracks key at all', () => {
		const out = migratePatch({ stepsPerBeat: undefined } as never);
		expect(out.tracks).toEqual([]);
	});

	it('does not invent a step count for a patch that has none', () => {
		const out = migratePatch(file({ stepsPerBeat: undefined, totalSteps: 0 }));
		expect(out.totalSteps).toBe(0);
	});
});

describe('nothing of the previous song survives a load', () => {
	/* Every field here has leaked between songs at some point, or would if it
	   were not reset: the newest two, noteLanes and presetGain, were added to
	   the track after the format was written and a project saved before them
	   carries neither. */
	it('clears the fields a project may not mention', () => {
		const d = trackResetDefaults();
		expect(d.percussion).toBe(false);
		expect(d.keyTimbres).toEqual({});
		expect(d.eqOn).toBe(false);
		expect(d.duckSource).toBe(-1);
		expect(d.noteLanes).toBeUndefined();
		expect(d.presetGain).toBe(1);
	});

	it('lets the incoming track win over the reset', () => {
		// The reset is spread first precisely so this is true.
		const incoming = { id: 0, percussion: true, presetGain: 0.5 };
		const merged = { ...trackResetDefaults(), ...incoming };
		expect(merged.percussion).toBe(true);
		expect(merged.presetGain).toBe(0.5);
	});

	it('gives a project that predates lanes the default rather than the live ones', () => {
		const live = { id: 0, noteLanes: [{ id: 'vel' }] };
		const incoming = { id: 0, grid: [[60]] };
		const merged = { ...live, ...trackResetDefaults(), ...incoming };
		expect(merged.noteLanes).toBeUndefined();
	});

	it('empties a track the project does not mention rather than leaving it playing', () => {
		const t = blankTrack(2, 4);
		expect(t.grid).toEqual([[], [], [], []]);
		expect(t.accents).toEqual([0, 0, 0, 0]);
		expect(t.name).toBe('TRK 3');
		expect(t.muted).toBe(false);
	});

	it('gives a blanked track the same resets as a replaced one', () => {
		const blank = blankTrack(0, 1);
		for (const [k, v] of Object.entries(trackResetDefaults())) {
			expect(blank[k as keyof typeof blank]).toEqual(v);
		}
	});

	it('does not share grid arrays between two blanked tracks', () => {
		// A shared array would make editing one track write into another.
		const a = blankTrack(0, 2);
		const b = blankTrack(1, 2);
		(a.grid as number[][])[0].push(60);
		expect(b.grid).toEqual([[], []]);
	});
});

/**
 * Saving a single PATCH (one sound), rather than a whole project.
 *
 * A saved timbre is built by copying a fixed list of fields off the track.
 * Two ways that has gone wrong here: objects were dropped entirely, so a patch
 * bay never survived a save; and arrays were copied by reference, so a saved
 * patch shared its automation lanes with the track it came from and drawing on
 * the track afterwards silently rewrote the file that was already on disk.
 */
describe('a saved patch is a copy, not a view', () => {
	/* The same shape pickTimbre produces: scalars by value, objects and arrays
	   deep-cloned. Reproduced here because pickTimbre lives beside the Web Audio
	   engine and cannot be imported into a unit test. */
	const OBJECT_KEYS = new Set(['rackGraph', 'rackParams', 'graphParams', 'waveParams', 'modRoutes']);
	function pick(src: Record<string, unknown>, keys: string[]): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		for (const k of keys) {
			const v = src[k];
			if (v === undefined || v === null) continue;
			const t = typeof v;
			if (t === 'number' || t === 'string' || t === 'boolean') out[k] = v;
			else if (Array.isArray(v)) out[k] = JSON.parse(JSON.stringify(v));
			else if (t === 'object' && OBJECT_KEYS.has(k)) out[k] = JSON.parse(JSON.stringify(v));
		}
		return out;
	}

	it('keeps the graph, which is an object and was once dropped', () => {
		const track = { rackGraph: { nodes: [{ id: 'a' }], cables: [] }, presetGain: 1.3 };
		const saved = pick(track, ['rackGraph', 'presetGain']);
		expect(saved.rackGraph).toEqual(track.rackGraph);
		expect(saved.presetGain).toBe(1.3);
	});

	it('does not let a later edit to the track reach the saved graph', () => {
		const track = { rackGraph: { nodes: [{ id: 'a' }], cables: [] } };
		const saved = pick(track, ['rackGraph']);
		track.rackGraph.nodes.push({ id: 'b' });
		expect((saved.rackGraph as { nodes: unknown[] }).nodes).toHaveLength(1);
	});

	it('does not let a later edit to a lane reach the saved patch', () => {
		// An array of objects: copying the reference is the bug this catches.
		const track = { noteLanes: [{ id: 'vel', points: [0.5] }] };
		const saved = pick(track, ['noteLanes']);
		track.noteLanes[0].points.push(0.9);
		expect((saved.noteLanes as { points: number[] }[])[0].points).toEqual([0.5]);
	});

	it('skips a field the track does not have rather than writing null', () => {
		const saved = pick({ presetGain: 1 }, ['presetGain', 'rackGraph', 'noteLanes']);
		expect(Object.keys(saved)).toEqual(['presetGain']);
	});

	it('copies an array of plain numbers too', () => {
		const track = { eqGains: [1, 2, 3] };
		const saved = pick(track, ['eqGains']);
		track.eqGains[0] = 9;
		expect(saved.eqGains).toEqual([1, 2, 3]);
	});
});
