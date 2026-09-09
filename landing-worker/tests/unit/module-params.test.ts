import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { MODULE_SPECS } from '../../src/lib/stores/synth-modules';

/**
 * Every parameter a module declares must actually reach the engine.
 *
 * The graph builder handles most modules directly, but the acoustic ones fall
 * through to a default branch that copies a hand-written list of parameter
 * names across to buildRackModule. That list is a silent filter: a name missing
 * from it is dropped with no error and no clue, and the knob simply does
 * nothing.
 *
 * This is not hypothetical. `modeHz` was added to the catalogue, implemented in
 * MODES, and set by all 47 drum keys -- and did nothing, because it was not in
 * that list. Three separate attempts to fix the kick's brightness measured
 * byte-identical results before the cause was found. A test is cheaper than
 * finding it again.
 */

const SOURCE = fs.readFileSync('src/lib/synth.ts', 'utf8');

/** The names the default branch forwards. */
function forwardedParams(): Set<string> {
	const start = SOURCE.indexOf('const asParams: Record<string, number> = {};');
	expect(start).toBeGreaterThan(-1);
	const listStart = SOURCE.indexOf('[', start);
	const listEnd = SOURCE.indexOf(']', listStart);
	const body = SOURCE.slice(listStart, listEnd);
	return new Set([...body.matchAll(/'([a-zA-Z0-9]+)'/g)].map((m) => m[1]));
}

/* WHEN and ACT are read by noteActions, which walks the graph itself and pulls
   their values straight out of graphParams -- they never pass through the audio
   builder at all, so the forwarding list has nothing to say about them. */
const NOT_AUDIO_MODULES = new Set(['when', 'act']);

/** Modules the builder has no case for, so they take the default branch. */
function fallthroughModules(): string[] {
	return MODULE_SPECS.filter((m) => {
		if (NOT_AUDIO_MODULES.has(m.id)) return false;
		// A module with its own `case 'id':` is built directly and reads its
		// params through p(), so no list stands between it and its knobs.
		return !new RegExp(`case '${m.id}':`).test(SOURCE);
	}).map((m) => m.id);
}

describe('module parameters reach the engine', () => {
	it('forwards every parameter of every module that uses the default branch', () => {
		const forwarded = forwardedParams();
		const missing: string[] = [];
		for (const id of fallthroughModules()) {
			const spec = MODULE_SPECS.find((m) => m.id === id)!;
			for (const p of spec.params) {
				if (!forwarded.has(p.key)) missing.push(`${id}.${p.key}`);
			}
		}
		expect(missing).toEqual([]);
	});

	it('finds the forwarding list at all, so this test cannot pass vacuously', () => {
		expect(forwardedParams().size).toBeGreaterThan(10);
	});

	it('every module declares at least one port or parameter', () => {
		// A module with nothing at all is a palette entry that cannot do anything.
		for (const m of MODULE_SPECS) {
			expect(m.inputs.length + m.outputs.length + m.params.length).toBeGreaterThan(0);
		}
	});

	it('parameter defaults sit inside their own range', () => {
		// A default outside min..max is silently clamped, so the knob starts
		// somewhere other than where the preset author wrote it.
		for (const m of MODULE_SPECS) {
			for (const p of m.params) {
				expect(p.def, `${m.id}.${p.key}`).toBeGreaterThanOrEqual(p.min);
				expect(p.def, `${m.id}.${p.key}`).toBeLessThanOrEqual(p.max);
			}
		}
	});

	it('a parameter with choices spans exactly those choices', () => {
		for (const m of MODULE_SPECS) {
			for (const p of m.params) {
				if (!p.choices) continue;
				expect(p.min, `${m.id}.${p.key}`).toBe(0);
				expect(p.max, `${m.id}.${p.key}`).toBe(p.choices.length - 1);
			}
		}
	});
});
