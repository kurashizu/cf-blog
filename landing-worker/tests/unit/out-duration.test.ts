import { describe, it, expect } from 'vitest';
import { modularSynth } from '../../src/lib/synth';

/**
 * OUT's DUR caps a voice's whole lifetime, measured from the note's start.
 *
 * Three fields, not one number overloading a sentinel: `dur` picks the mode
 * (0 FOLLOW, 1 TIME, 2 STEP), `durSec` is TIME's length in seconds, `durStep`
 * is STEP's length as an index into the same nine beat divisions the piano
 * roll's SNAP row offers. FOLLOW (or an OUT that has never carried the field
 * at all, `dur` reading `undefined`) means what it always did: the voice is
 * reaped when its own ring-out ends, whatever `rackTailSeconds` decides that
 * takes.
 *
 * `rackTailSeconds` measures a different clock -- a rack module's own ring-out
 * past the note's *release* -- and DUR used to be a single field folded into
 * that same number as a ceiling, so "DUR 1s" and "ring for 1s after release"
 * read as the same value even though they answer different questions.
 * `advGraphDurCap` is the fix: its own function, its own clock, replacing
 * `uncappedExtrasStop` outright at the call site rather than folded into
 * `rackTailSeconds`'s `Math.min`.
 */
const durCapOf = (track: Record<string, unknown>) =>
	(
		modularSynth as unknown as { advGraphDurCap(t: never): number | undefined }
	).advGraphDurCap(track as never);

describe("OUT's DUR reports a whole-lifetime cap, independent of any ring-out", () => {
	it('is undefined with no OUT on the canvas', () => {
		expect(
			durCapOf({
				advanced: true,
				rackGraph: { nodes: [{ id: 's', type: 'string' }], cables: [] },
				graphParams: { 's.decayTime': 2 }
			})
		).toBeUndefined();
	});

	it('is undefined at the FOLLOW (0) default', () => {
		expect(
			durCapOf({
				advanced: true,
				rackGraph: {
					nodes: [
						{ id: 's', type: 'string' },
						{ id: 'o', type: 'out' }
					],
					cables: []
				},
				graphParams: { 's.decayTime': 2, 'o.dur': 0 }
			})
		).toBeUndefined();
	});

	it('is undefined when DUR has never been set on an OUT at all', () => {
		// The field's absence, not just its default -- an OUT saved before
		// DUR existed, or one placed and never touched.
		expect(
			durCapOf({
				advanced: true,
				rackGraph: {
					nodes: [
						{ id: 's', type: 'string' },
						{ id: 'o', type: 'out' }
					],
					cables: []
				},
				graphParams: { 's.decayTime': 2 }
			})
		).toBeUndefined();
	});

	it('reports TIME (mode 1) in seconds off durSec, regardless of the ring-out', () => {
		expect(
			durCapOf({
				advanced: true,
				rackGraph: {
					nodes: [
						{ id: 's', type: 'string' },
						{ id: 'o', type: 'out' }
					],
					cables: []
				},
				graphParams: { 's.decayTime': 8, 'o.dur': 1, 'o.durSec': 1.5 }
			})
		).toBe(1.5);
	});

	it('reports STEP (mode 2) as seconds at the song tempo', () => {
		// `bpm` is the engine's own current tempo, not a field on the track --
		// a STEP length is musical, so it has to be read from wherever the
		// engine keeps the tempo it is actually playing at, the same clock
		// every other beat-relative duration in the engine uses.
		const savedBpm = modularSynth.getBpm();
		try {
			modularSynth.setBpm(120);
			// durStep index 2 is '1' (one beat) in DUR_STEP_CHOICES; at 120
			// BPM a beat is 0.5s.
			expect(
				durCapOf({
					advanced: true,
					rackGraph: {
						nodes: [
							{ id: 's', type: 'string' },
							{ id: 'o', type: 'out' }
						],
						cables: []
					},
					graphParams: { 's.decayTime': 8, 'o.dur': 2, 'o.durStep': 2 }
				})
			).toBeCloseTo(0.5, 5);
		} finally {
			modularSynth.setBpm(savedBpm);
		}
	});

	it('takes the tightest cap when more than one OUT is on the canvas', () => {
		expect(
			durCapOf({
				advanced: true,
				rackGraph: {
					nodes: [
						{ id: 's', type: 'string' },
						{ id: 'o1', type: 'out' },
						{ id: 'o2', type: 'out' }
					],
					cables: []
				},
				graphParams: { 's.decayTime': 8, 'o1.dur': 1, 'o1.durSec': 3, 'o2.dur': 1, 'o2.durSec': 1 }
			})
		).toBe(1);
	});

	it('ignores a non-advanced track', () => {
		expect(
			durCapOf({
				advanced: false,
				rackGraph: {
					nodes: [{ id: 'o', type: 'out' }],
					cables: []
				},
				graphParams: { 'o.dur': 1, 'o.durSec': 1 }
			})
		).toBeUndefined();
	});
});

/**
 * `rackTailSeconds` must answer for whichever of the chain or the graph is
 * actually the voice's sound, never both.
 *
 * `triggerTrackVoice` picks one -- the graph if `advOwnsVoice &&
 * track.rackGraph?.nodes?.length`, the chain otherwise -- and whichever loses
 * plays nothing. `rackTailSeconds` used to walk `rackChain` unconditionally
 * regardless of which one the note-on code would actually build, so a track
 * carrying a stale `rackChain` from before it switched to ADV (or a preset
 * saving both) had its silent chain's modules still setting the tail: a
 * plain OSC-only graph measured a 2s ring-out because `rackChain` still named
 * a STRING nothing was playing. Reaped two seconds later than the graph's own
 * sound justified, and a DUR left at its -1 default read as "keep the voice
 * two seconds longer anyway" -- the report that found this: DUR -1 was
 * supposed to change nothing, and instead the voice would not let go.
 */
const tailOf = (track: Record<string, unknown>) =>
	(modularSynth as unknown as { rackTailSeconds(t: never): number }).rackTailSeconds(
		track as never
	);

describe('rackTailSeconds answers for the graph when the graph is what plays', () => {
	it('is zero for a graph with no resonant module, however the chain reads', () => {
		expect(
			tailOf({
				advanced: true,
				rackChain: ['string'],
				rackParams: {},
				rackGraph: {
					nodes: [
						{ id: 'entry', type: 'in' },
						{ id: 'osc', type: 'osc' },
						{ id: 'output', type: 'out' }
					],
					cables: []
				},
				graphParams: {}
			})
		).toBe(0);
	});

	it('still answers for a resonant module actually on the graph', () => {
		expect(
			tailOf({
				advanced: true,
				rackChain: ['string'],
				rackParams: {},
				rackGraph: {
					nodes: [
						{ id: 'entry', type: 'in' },
						{ id: 's', type: 'string' },
						{ id: 'output', type: 'out' }
					],
					cables: []
				},
				graphParams: { 's.decayTime': 4 }
			})
		).toBe(4);
	});

	it('falls back to the chain only when the graph is empty', () => {
		expect(
			tailOf({
				advanced: true,
				rackChain: ['string'],
				rackParams: { decayTime: 5 },
				rackGraph: { nodes: [], cables: [] }
			})
		).toBe(5);
	});

	it('falls back to the chain when there is no graph at all', () => {
		expect(
			tailOf({
				advanced: true,
				rackChain: ['tube'],
				rackParams: { tubeDecay: 6 }
			})
		).toBe(6);
	});
});
