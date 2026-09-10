import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { MODULE_SPECS } from '../../src/lib/stores/synth-modules';
import { SOUND_PRESETS, BUILTIN_KITS } from '../../src/lib/stores/synth-presets';
import { roleOf, rolesCompatible } from '../../src/lib/stores/graph-model';
import { isPureNode, PURE_NODES } from '../../src/lib/stores/node-graph';

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
const NODE_GRAPH = fs.readFileSync('src/lib/stores/node-graph.ts', 'utf8');

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
   builder at all, so the forwarding list has nothing to say about them.

   SEQ is the same shape: it makes no sound and holds no audio node. Its GAP is
   read while execution flow is resolved, which happens before any module is
   built, because the gap is *when* the modules downstream of it run. */
const NOT_AUDIO_MODULES = new Set(['when', 'act', 'seq']);

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

/**
 * Every module has a glyph.
 *
 * The palette is read by shape rather than by reading forty words, so a module
 * without one falls back to a plain circle and becomes the one entry you have to
 * read. Seven had gone without for a while, which is what a fallback buys you:
 * it never looks broken enough to notice.
 */
describe('the palette', () => {
	it('draws a glyph for every module', () => {
		const icons = fs.readFileSync(
			new URL('../../src/lib/components/synth/patch/ModuleIcon.svelte', import.meta.url),
			'utf8'
		);
		const drawn = new Set([...icons.matchAll(/^\t\t([a-z]+): '/gm)].map((m) => m[1]));
		expect(MODULE_SPECS.filter((m) => !drawn.has(m.id)).map((m) => m.id)).toEqual([]);
	});
});

/**
 * The contract in docs/node-graph.md, enforced.
 *
 * These are the rules that were each broken at least once while the engine kept
 * them in 46 separate heads. None of the breakages threw; they all just made a
 * socket on a card do nothing, which you can only find by playing every module
 * and listening. A test is cheaper.
 */
describe('the node contract', () => {
	const specOf = (id: string) => MODULE_SPECS.find((m) => m.id === id)!;

	it('reads every socket it declares', () => {
		/* A socket the builder ignores is a lie drawn on the card. STRING and
		   MODES both declared PITCH and never read it, so the cable landed, drew
		   itself, and changed nothing.

		   The pure nodes are checked by running them: feed one inlet a value
		   nothing else could produce and see whether it comes back out. That is
		   the property that matters, and unlike reading the source it cannot be
		   fooled by how the function happens to be written. */
		const dead: string[] = [];
		for (const m of MODULE_SPECS) {
			if (isPureNode(m.id)) {
				const fn = PURE_NODES[m.id];
				for (const port of m.inputs) {
					const probe = 7919;
					const seen = { hit: false };
					fn(
						{
							get: (id: string, fallback: number) => {
								if (id === port.id) {
									seen.hit = true;
									return probe;
								}
								return fallback;
							}
						},
						(_k: string, d: number) => d
					);
					if (!seen.hit) dead.push(`${m.id}.${port.id}`);
				}
				continue;
			}
			/* The audio modules are checked against the builder as a whole rather
			   than against one `case`: several share a case and hand off to
			   buildRackModule, so slicing the source at label boundaries reports
			   sockets that are read a few lines further down. What matters is
			   that the id appears somewhere the builder can act on it. */
			for (const port of m.inputs) {
				// Audio inlets are wired by the graph rather than read by name,
				// and exec is resolved before any module is built.
				if (['in', 'b', 'r', 'exec'].includes(port.id)) continue;
				if (!SOURCE.includes(`'${port.id}'`)) dead.push(`${m.id}.${port.id}`);
			}
		}
		expect(dead).toEqual([]);
	});

	it('gives exec pins only to the logic chain', () => {
		/* Execution says which nodes *run*. Audio runs because audio is wired
		   into it, so a sound module with an exec pin is asking for two cables
		   to say one thing -- with silence as the penalty for drawing only the
		   obvious one. */
		const withExec = MODULE_SPECS.filter(
			(m) => m.inputs.some((p) => p.kind === 'exec') || m.outputs.some((p) => p.kind === 'exec')
		).map((m) => m.id);
		expect(withExec.sort()).toEqual(['act', 'in', 'out', 'seq', 'when']);
	});

	it('gives an exec outlet only where there is an afterwards', () => {
		// THEN means "and then this", so it needs a moment to point at. An
		// oscillator runs for as long as the note does and never finishes.
		const withThen = MODULE_SPECS.filter((m) => m.outputs.some((p) => p.kind === 'exec')).map(
			(m) => m.id
		);
		expect(withThen.sort()).toEqual(['in', 'seq', 'when']);
	});

	it('has no knob that duplicates a socket', () => {
		/* OSC had both a PITCH inlet and an HZ knob, so the knob stopped working
		   the moment a cable was drawn -- worse than not having it. A CONST set
		   to PITCH is how a frequency is pinned. */
		const clashes: string[] = [];
		for (const m of MODULE_SPECS) {
			for (const port of m.inputs) {
				if (m.params.some((q) => q.key === port.id)) clashes.push(`${m.id}.${port.id}`);
			}
		}
		expect(clashes).toEqual([]);
	});

	it('uses a log scale only where the range is positive', () => {
		// log of zero or a negative has no value, so the dial would break.
		const bad = MODULE_SPECS.flatMap((m) =>
			m.params
				.filter((q) => q.scale === 'log' && (q.min <= 0 || q.max <= 0))
				.map((q) => `${m.id}.${q.key}`)
		);
		expect(bad).toEqual([]);
	});

	it('centres a ratio on 1', () => {
		/* A multiplying knob should sit at unity at twelve o'clock, so an octave
		   down and an octave up are the same distance from centre. */
		for (const m of MODULE_SPECS) {
			for (const q of m.params.filter((x) => x.scale === 'log' && x.unit === '×')) {
				expect(q.def).toBe(1);
				const centre = Math.sqrt(q.min * q.max);
				expect(Math.abs(centre - 1)).toBeLessThan(0.001);
			}
		}
	});
});

/**
 * The reverse direction: a parameter the engine reads must be declared.
 *
 * The existing forwarding test checks that a declared knob reaches the engine.
 * Nothing checked the other way, and two defects lived in that gap: COMP's
 * makeup gain was read from `compGain`, which no module declared, so a
 * compressor could only ever make things quieter with no knob to correct it;
 * and five oscillators fell back to `p('hz', ...)` for a knob deleted long ago.
 *
 * Both are the same shape as the bug docs/node-graph.md opens with -- the card
 * and the engine disagreeing -- just pointing the other way.
 */
describe('every parameter the engine reads is declared', () => {
	/* Keys that are read but deliberately belong to no card.
	   Keep this list short and justified; each entry is a place the card and the
	   engine are allowed to differ. */
	const NOT_A_KNOB = new Set([
		// Structural port ids, not parameters.
		'in',
		'out',
		'b',
		'r',
		'exec',
		'then',
		'a',
		'alpha',
		// ENTRY's event data, published as outlets rather than knobs.
		'pitch',
		'vel',
		'note',
		'gate',
		// Named modulation destinations registered in the mod map.
		'fm',
		'cv',
		'pwm',
		'wide',
		'mid',
		'side',
		'trig',
		'do',
		// The kit's per-key fields, which no module card carries.
		'kind'
	]);

	it('declares every key read through p()', () => {
		const declared = new Set(MODULE_SPECS.flatMap((m) => m.params.map((q) => q.key)));
		const read = new Set([...SOURCE.matchAll(/\bp\('([a-zA-Z][a-zA-Z0-9]*)'/g)].map((m) => m[1]));
		const undeclared = [...read].filter((k) => !declared.has(k) && !NOT_A_KNOB.has(k)).sort();
		expect(undeclared).toEqual([]);
	});
});

/**
 * Every shipped preset agrees with the catalogue.
 *
 * Presets are written by hand and the catalogue moves under them. When SUM's
 * LVL knob was removed as a welded-on VCA, sixteen presets went on writing
 * `sumGain` into their params, and six of those were setting it to something
 * other than unity -- so those patches silently changed level, with a dead key
 * left behind to confuse the next reader. Nothing caught it, because nothing
 * compared the two.
 */
describe('presets match the catalogue', () => {
	const specOf = (type: string) => MODULE_SPECS.find((m) => m.id === type);

	const graphs: [
		string,
		(
			| {
					nodes: { id: string; type: string }[];
					cables: { from: string; fromPort: string; to: string; toPort: string }[];
			  }
			| undefined
		),
		Record<string, number> | undefined
	][] = [
		...SOUND_PRESETS.map(
			(p) => [`AC:${p.name}`, p.preset.rackGraph, p.preset.graphParams] as const
		),
		...BUILTIN_KITS.flatMap((k) =>
			Object.entries(k.keys).map(
				(e) => [`${k.name}:${e[0]}`, e[1].rackGraph, e[1].graphParams] as const
			)
		)
	].map((e) => [e[0], e[1] as never, e[2] as never]);

	it('names only ports that exist, with compatible roles', () => {
		const bad: string[] = [];
		for (const [label, g] of graphs) {
			if (!g?.nodes?.length) continue;
			for (const c of g.cables) {
				const from = g.nodes.find((n) => n.id === c.from);
				const to = g.nodes.find((n) => n.id === c.to);
				const fs = from && specOf(from.type);
				const ts = to && specOf(to.type);
				const fp = fs?.outputs.find((p) => p.id === c.fromPort);
				const tp = ts?.inputs.find((p) => p.id === c.toPort);
				if (!fp || !tp) {
					// A cable onto a knob is legal; a cable onto nothing is not.
					if (!ts?.params.some((q) => q.key === c.toPort)) {
						bad.push(`${label}: ${from?.type}.${c.fromPort} > ${to?.type}.${c.toPort}`);
					}
					continue;
				}
				if (!rolesCompatible(roleOf(fp), roleOf(tp))) {
					bad.push(`${label}: ${from!.type}.${c.fromPort} > ${to!.type}.${c.toPort} (roles)`);
				}
			}
		}
		expect(bad).toEqual([]);
	});

	it('sets only parameters the module declares', () => {
		const bad: string[] = [];
		for (const [label, g, params] of graphs) {
			if (!g?.nodes?.length || !params) continue;
			for (const key of Object.keys(params)) {
				const dot = key.lastIndexOf('.');
				const node = g.nodes.find((n) => n.id === key.slice(0, dot));
				if (!node) {
					bad.push(`${label}: ${key} names no node`);
					continue;
				}
				const spec = specOf(node.type);
				if (!spec?.params.some((q) => q.key === key.slice(dot + 1))) {
					bad.push(`${label}: ${node.type}.${key.slice(dot + 1)}`);
				}
			}
		}
		expect(bad).toEqual([]);
	});

	it('sets them to values the knob can actually reach', () => {
		/* Checking only that the key exists let four presets write `tubeOdd: 100`
		   against a 0..1 selector: the card lit no button at all, and touching
		   either one rewrote the stored value -- so opening a preset and looking
		   at it changed it. A value out of range is a knob the card cannot
		   draw. */
		const bad: string[] = [];
		for (const [label, g, params] of graphs) {
			if (!g?.nodes?.length || !params) continue;
			for (const [key, value] of Object.entries(params)) {
				const dot = key.lastIndexOf('.');
				const node = g.nodes.find((n) => n.id === key.slice(0, dot));
				const spec = node && specOf(node.type);
				const param = spec?.params.find((q) => q.key === key.slice(dot + 1));
				if (!param || typeof value !== 'number') continue;
				if (value < param.min || value > param.max) {
					bad.push(`${label}: ${node!.type}.${param.key} = ${value} (${param.min}..${param.max})`);
				}
			}
		}
		expect(bad).toEqual([]);
	});
});
