import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { playPatch, knobValueOf, type PatchSpec } from './harness';
import { createResolver } from '../../../src/lib/stores/node-graph';
import { graphOf } from '../../../src/lib/stores/graph-model';

/**
 * Whole patches, played.
 *
 * Every other unit test in this directory asks about one module: does this
 * socket reach a param, does this knob carry its own units, is this node pure.
 * That is what finds a module that is wrong on its own, and it is not what
 * finds a patch that is wrong while every module in it is right.
 *
 * The first case here is exactly that. Each of its six modules behaved as its
 * own tests said, and the patch still could not reach silence.
 *
 * Cases are JSON beside this file, in the shape the editor exports, so adding
 * one is exporting a patch rather than writing a graph out by hand.
 */

const note = { pitch: 0, velocity: 0.8, noteIndex: 48, gate: 0.5, lanes: {} };

function load(file: string): PatchSpec & { name: string } {
	const f = JSON.parse(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'));
	return { name: f.name, graph: f.graph, params: f.params ?? {}, waves: f.waves ?? {} };
}

/** The resolver the engine builds for this patch, for asking about cables. */
function resolverFor(spec: PatchSpec) {
	return createResolver(
		graphOf({ rackGraph: spec.graph } as never) as never,
		spec.params ?? {},
		note
	);
}

describe('TREMOLO GATE: a 1 Hz square gating the level', () => {
	/* OSC(1 Hz) -> TO-CV -> MAP(GATE, -1..1 into 0..1) -> GAIN.level, with a
	   second OSC playing the note through that GAIN. The patch says: switch the
	   sound fully on and fully off, twice a second.

	   It is the case this whole file exists for. Every module was behaving as
	   its own tests said and the sound never reached silence. */
	const patch = load('tremolo-gate.json');

	it('builds the whole chain: two oscillators and MAP’s shaper', () => {
		const built = playPatch(patch);
		// The note's oscillator and the 1 Hz one driving the gate.
		expect(built.oscFreqs).toContain(1);
		expect(built.oscFreqs.filter((f) => f > 100).length).toBeGreaterThan(0);
		// MAP is a WaveShaperNode now, which is what makes it per-sample.
		expect(built.shapers).toBeGreaterThan(0);
		expect(built.sounds).toBe(true);
	});

	it('carries a signal to the level, not a value', () => {
		/* The cable runs OSC -> TO-CV -> MAP -> level, and MAP is the dual kind:
		   a value node that also builds audio. What leaves it is a signal exactly
		   when what entered it was one, so the answer needs the whole chain
		   rather than MAP's own type. */
		const r = resolverFor(patch);
		const gainId = patch.graph.nodes.find((n) => n.type === 'gain')!.id;
		expect(r.isWired(gainId, 'level')).toBe(true);
		expect(r.isDrivenBySignal(gainId, 'level')).toBe(true);
	});

	it('lets the cable reach zero, which is the whole point of the patch', () => {
		/* The bug. A signal on an AudioParam *sums* with the knob, and GAIN's LVL
		   defaults to 1 -- so MAP swinging 0..1 gave a level moving between 1 and
		   2. The gate switched between loud and louder and never turned the sound
		   off, and no setting of the knob fixed it because the knob was the thing
		   in the way.

		   A knob a signal has claimed reads as zero now, so the cable alone
		   decides. Asked of the built voice rather than of the catalogue: the
		   default is still 1, and what matters is what the engine used. */
		const gainId = patch.graph.nodes.find((n) => n.type === 'gain')!.id;
		expect(knobValueOf(patch, gainId, 'level')).toBe(null);
		const built = playPatch(patch);
		// Every modulated gain sits at zero, so its cable is the entire level.
		expect(built.modulated.length).toBeGreaterThan(0);
		for (const g of built.modulated) expect(g.value).toBe(0);
	});

	it('still honours the knob when nothing is patched to it', () => {
		/* The other half, and the reason this is not "GAIN's knob does nothing":
		   with the cable cut, the knob is the level again. */
		const gainId = patch.graph.nodes.find((n) => n.type === 'gain')!.id;
		const unpatched: PatchSpec = {
			...patch,
			graph: {
				...patch.graph,
				cables: patch.graph.cables.filter(
					(c) => !(c.to === gainId && c.toPort === 'level')
				)
			},
			params: { ...patch.params, [`${gainId}.level`]: 0.75 }
		};
		expect(knobValueOf(unpatched, gainId, 'level')).toBe(0.75);
	});
});
