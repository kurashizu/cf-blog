import { describe, it, expect } from 'vitest';
import {
	migratePatch,
	trackResetDefaults,
	blankTrack,
	isPatchFile,
	STEPS_PER_BEAT,
	PATCH_VERSION,
	type SynthPatchFile
} from '../../src/lib/stores/patch-format';
import { pickTimbre } from '../../src/lib/stores/synth-presets';

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
	version: PATCH_VERSION,
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

	it('treats a file with no version as one that predates every rule', () => {
		/* `stepsPerBeat` answers one question -- how fine is the grid -- and the
		   migration used to key off it alone, so a file already on the 24-step
		   grid was returned verbatim and no later change reached it. SPACE's
		   DECAY was inverted under exactly those files. */
		const old = file({
			version: undefined,
			tracks: [{ id: 0, graphParams: { 'sp.spaceDecay': 90, 'tb.tubeOdd': 100 } } as never]
		});
		const out = migratePatch(old);
		expect(out.version).toBe(PATCH_VERSION);
		expect(out.tracks[0].graphParams?.['sp.spaceDecay']).toBe(10);
		expect(out.tracks[0].graphParams?.['tb.tubeOdd']).toBe(1);
	});

	it('does not migrate the same file twice', () => {
		const once = migratePatch(
			file({ version: undefined, tracks: [{ id: 0, graphParams: { 'sp.spaceDecay': 90 } } as never] })
		);
		expect(migratePatch(once)).toBe(once);
	});

	it('stretches lanes with the grid they are drawn against', () => {
		// Left alone, a legacy lane covered the first third of the song.
		const legacy = file({
			stepsPerBeat: undefined,
			version: undefined,
			tracks: [{ id: 0, grid: [[60], []], noteLanes: [{ id: 'vel', def: 0.8, points: [0.2, 0.9] }] } as never]
		});
		const out = migratePatch(legacy);
		expect(out.tracks[0].grid).toHaveLength(6);
		expect(out.tracks[0].noteLanes?.[0].points).toEqual([0.2, 0.2, 0.2, 0.9, 0.9, 0.9]);
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
 *
 * These called a `pick()` written in this file that reimplemented `pickTimbre`,
 * and then tested the reimplementation -- the product could have stopped deep
 * cloning entirely and they would all still have passed. The justification was
 * that pickTimbre "lives beside the Web Audio engine and cannot be imported",
 * which was not true: it is in a plain store module that another test in this
 * suite already imports.
 */
describe('a saved patch is a copy, not a view', () => {
	it('keeps the graph, which is an object and was once dropped', () => {
		const track = { rackGraph: { nodes: [{ id: 'a' }], cables: [] }, presetGain: 1.3 };
		const saved = pickTimbre(track);
		expect(saved.rackGraph).toEqual(track.rackGraph);
		expect(saved.presetGain).toBe(1.3);
	});

	it('does not let a later edit to the track reach the saved graph', () => {
		const track = { rackGraph: { nodes: [{ id: 'a' }], cables: [] } };
		const saved = pickTimbre(track);
		track.rackGraph.nodes.push({ id: 'b' });
		expect((saved.rackGraph as unknown as { nodes: unknown[] }).nodes).toHaveLength(1);
	});

	it('does not let a later edit to an array reach the saved patch', () => {
		/* Copying the reference is the bug this catches. `modRoutes` is the
		   array of objects a preset does carry -- the local reimplementation
		   this file used to test asserted the same thing about `noteLanes`,
		   which a preset deliberately does not save at all: a preset is a sound,
		   not what the track plays. Testing the real function is what surfaced
		   the difference. */
		const track = { modRoutes: [{ enabled: true, source: 'velocity', dest: 'cutoff', amount: 1 }] };
		const saved = pickTimbre(track);
		track.modRoutes[0].amount = 0.2;
		expect((saved.modRoutes as unknown as { amount: number }[])[0].amount).toBe(1);
	});

	it('does not save what the track plays, only how it sounds', () => {
		const saved = pickTimbre({ noteLanes: [{ id: 'vel', points: [0.5] }], cutoff: 900 });
		expect(saved.noteLanes).toBeUndefined();
		expect(saved.cutoff).toBe(900);
	});

	it('skips a field the track does not have rather than writing null', () => {
		const saved = pickTimbre({ presetGain: 1, rackGraph: undefined, graphParams: null });
		expect(Object.keys(saved)).toEqual(['presetGain']);
	});

	it('copies an array of plain numbers too', () => {
		const track = { eqGains: [1, 2, 3] };
		const saved = pickTimbre(track);
		track.eqGains[0] = 9;
		expect(saved.eqGains).toEqual([1, 2, 3]);
	});

	it('carries every field a saved patch is supposed to hold', () => {
		/* The list itself, which the local reimplementation could not check: a
		   key dropped from TIMBRE_KEYS silently stops being saved, and the only
		   symptom is a preset that comes back missing part of its sound. */
		const saved = pickTimbre({
			cutoff: 3000,
			rackGraph: { nodes: [], cables: [] },
			graphParams: { 'a.b': 1 },
			eqGains: [0, 0, 0, 0, 0, 0],
			eqOn: true
		});
		expect(saved.cutoff).toBe(3000);
		expect(saved.graphParams).toEqual({ 'a.b': 1 });
		expect(saved.eqOn).toBe(true);
	});
});
