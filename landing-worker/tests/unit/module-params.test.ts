import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { MODULE_SPECS } from '../../src/lib/stores/synth-modules';
import { SOUND_PRESETS, BUILTIN_KITS } from '../../src/lib/stores/synth-presets';
import { roleOf, rolesCompatible } from '../../src/lib/stores/graph-model';
import { isPureNode, PURE_NODES } from '../../src/lib/stores/node-graph';
import { modularSynth } from '../../src/lib/synth';
import { FakeCtx } from './stubs/audio-context';

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

/**
 * The keys the engine binds to an AudioParam for one module.
 *
 * Built against the recording context rather than read out of the catalogue,
 * so a module cannot earn an exemption by claiming one -- the answer is
 * whatever the engine actually registered. Null when the module builds no
 * audio node at all.
 */
function modTargets(type: string): Set<string> | null {
	const S = modularSynth as unknown as {
		noiseBuffer: unknown;
		buildGraphNode(...a: unknown[]): { mod: Map<string, unknown> } | null;
	};
	const ctx = new FakeCtx();
	S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
	const made = S.buildGraphNode(
		ctx,
		type,
		(_k: string, d: number) => d,
		220,
		0,
		0.5,
		[],
		'n1',
		{},
		(_n: string, _port: string, f: number) => f,
		{ velocity: 0.8, noteIndex: 48, tuning: 440 },
		0.5
	);
	return made ? new Set(made.mod.keys()) : null;
}

/** The names the default branch forwards. */
function forwardedParams(): Set<string> {
	/* Located by a declaration whose exact text has to hold. If it ever does
	   not, `indexOf` returns -1 and every check downstream would pass against an
	   empty set -- so it is asserted here rather than left to fail quietly, and
	   the caller checks the size it got as well. */
	const start = SOURCE.indexOf('const asParams: Record<string, number> = {};');
	expect(start, 'the forwarding list moved; update this locator').toBeGreaterThan(-1);
	const listStart = SOURCE.indexOf('[', start);
	const listEnd = SOURCE.indexOf(']', listStart);
	expect(listEnd).toBeGreaterThan(listStart);
	const body = SOURCE.slice(listStart, listEnd);
	const names = new Set([...body.matchAll(/'([a-zA-Z0-9]+)'/g)].map((m) => m[1]));
	expect(names.size, 'forwarding list scraped empty').toBeGreaterThan(10);
	return names;
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
		/* A pure node reads its knobs through the resolver's own `p`, not through
		   the forwarding list -- it never reaches `buildRackModule` at all. Asked
		   from `PURE_NODES` rather than named here, so adding a value module does
		   not mean remembering to add it to a second list. That is the exact
		   failure this file exists to catch, and it would be embarrassing for the
		   test to have it too. */
		if (isPureNode(m.id)) return false;
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
		/* Indentation-independent: this matched `/^\t\t([a-z]+): '/`, exactly two
		   tabs, so re-indenting the file -- or running a formatter over it --
		   would have emptied `drawn` and passed every module silently. */
		const drawn = new Set([...icons.matchAll(/(?:^|[\s{,])([a-z]+):\s*'/gm)].map((m) => m[1]));
		// And it has to have found something, or the comparison below is vacuous.
		expect(drawn.size).toBeGreaterThan(Math.max(4, MODULE_SPECS.length / 2));
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
		/* Asked as a rule rather than as a roster. The list used to be spelled
		   out here, which meant every module added to the catalogue had to be
		   added to a second place -- and while the catalogue is being rebuilt
		   from primitives the roster would be wrong on every commit. */
		const LOGIC = new Set(['act', 'in', 'out', 'seq', 'when']);
		const withExec = MODULE_SPECS.filter(
			(m) => m.inputs.some((p) => p.kind === 'exec') || m.outputs.some((p) => p.kind === 'exec')
		).map((m) => m.id);
		expect(withExec.filter((id) => !LOGIC.has(id))).toEqual([]);
	});

	it('gives an exec outlet only where there is an afterwards', () => {
		// THEN means "and then this", so it needs a moment to point at. An
		// oscillator runs for as long as the note does and never finishes.
		const HAS_AFTERWARDS = new Set(['in', 'seq', 'when']);
		const withThen = MODULE_SPECS.filter((m) => m.outputs.some((p) => p.kind === 'exec')).map(
			(m) => m.id
		);
		expect(withThen.filter((id) => !HAS_AFTERWARDS.has(id))).toEqual([]);
	});

	it('has no knob that duplicates a socket', () => {
		/* OSC had both a PITCH inlet and an HZ knob, so the knob stopped working
		   the moment a cable was drawn -- worse than not having it. A CONST set
		   to PITCH is how a frequency is pinned. */
		/* Pure nodes are the exception, and it is a real one rather than a
		   loophole. For them a cable *replaces* the stored number -- `read()`
		   takes the cable if there is one and the field if there is not -- so a
		   field beside a socket is where the value sits when nothing drives it,
		   which is exactly what CLAMP's bounds want. On an audio module a signal
		   *adds* to the knob instead, so the same pairing would double: that is
		   the trap PWM's PW was pulled out of.

		   The audio half of the rule is about *where the pairing lands*, not
		   about the pairing existing. A knob whose key the engine registers as a
		   modulation target is an AudioParam, and a signal summing onto an
		   AudioParam is the definition of a VCA: GAIN's knob is the resting
		   level and an envelope opens it from there. What the rule forbids is
		   the pairing with nowhere coherent to sum -- PW and PHS feed a wave
		   table rather than a param, so a knob beside them would be a second
		   opinion that quietly added, and OSC's old HZ knob simply stopped
		   working the moment a cable arrived.

		   So: a knob may share a name with a socket exactly when the engine
		   binds that key to an AudioParam. That is checked against the built
		   node rather than asserted, so a module cannot claim the exemption by
		   declaring it. */
		const clashes: string[] = [];
		for (const m of MODULE_SPECS) {
			if (isPureNode(m.id)) continue;
			const bound = modTargets(m.id);
			for (const port of m.inputs) {
				if (!m.params.some((q) => q.key === port.id)) continue;
				if (bound?.has(port.id)) continue;
				clashes.push(`${m.id}.${port.id}`);
			}
		}
		expect(clashes).toEqual([]);
	});

	it('turns a knob only where a number would not do', () => {
		/* A dial answers "how much" by feel. That is the right control when the
		   range is awkward or the response is not linear -- TUNING sweeps 400..480
		   around a reference of 440, where the useful moves are a few hertz and
		   nobody knows the number they want in advance. It is the wrong control
		   for a value you already know: GAIN's level is 1, or 0.5, or -1, and on
		   a linear dial those are positions to hunt for rather than numbers to
		   write.
		
		   So a plain linear knob over an ordinary range has to justify itself, and
		   the justification is one of: a non-linear response, or a range that does
		   not start where its units do. Anything else is typed. */
		const ORDINARY = (q: { min: number; max: number; scale?: string }) =>
			q.scale !== 'log' && (q.min === 0 || q.min === -q.max);
		const turned: string[] = [];
		for (const m of MODULE_SPECS) {
			for (const q of m.params) {
				if (q.choices || q.field || q.wave) continue;
				if (!ORDINARY(q)) continue;
				turned.push(`${m.id}.${q.key}`);
			}
		}
		expect(turned).toEqual([]);
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
		/* The other direction of the same contract, and the one that has to be
		   suspended while the catalogue is rebuilt.

		   The engine keeps its `case` blocks so each primitive can be wired back
		   and heard one at a time, which means `p('bowBite')` and ninety-odd
		   others are still read by code no catalogue entry reaches. Asking "is
		   every key read also declared" would fail on all of them for as long as
		   the rebuild takes, and a test that is expected to be red teaches
		   nobody anything.

		   Inverted instead: every key a *live* module declares must be read by
		   the engine. That is the half that catches a knob wired to nothing,
		   which is the failure this file exists for, and it gets stricter rather
		   than weaker as modules come back. */
		/* `p('key')` is one of two ways the engine reads a knob. The other is
		   `knob(param, 'key', def)`, which reads it *and* registers the
		   AudioParam so a cable can land on it -- scraping only the first
		   reported GAIN's LVL as dead when it is the one knob the module has.
		   Both forms count, along with the two scaled variants. */
		const read = new Set([
			...[...SOURCE.matchAll(/\bp\('([a-zA-Z][a-zA-Z0-9]*)'/g)].map((m) => m[1]),
			...[...SOURCE.matchAll(/\bknob(?:At|Pct)?\([^,]+,\s*'([a-zA-Z][a-zA-Z0-9]*)'/g)].map(
				(m) => m[1]
			)
		]);
		const pureRead = new Set(
			[...NODE_GRAPH.matchAll(/\bp\('([a-zA-Z][a-zA-Z0-9]*)'/g)].map((m) => m[1])
		);
		expect(read.size, 'engine keys scraped empty').toBeGreaterThan(10);
		/* Two kinds of setting are not read through `p()` and are not dead.
		
		   A wave picker holds a name, so it arrives beside the numeric map and
		   goes to `applyWaveform` whole. CONST's `kind` is read by the canvas
		   (PatchCanvas, where the outlet is retyped) rather than by the engine:
		   it decides what the socket *is*, which is a question answered before
		   any note is built. */
		const CANVAS_READ = new Set(['const.kind']);
		const dead = MODULE_SPECS.flatMap((m) =>
			m.params
				.filter(
					(q) =>
						!q.wave &&
						!CANVAS_READ.has(`${m.id}.${q.key}`) &&
						!read.has(q.key) &&
						!pureRead.has(q.key)
				)
				.map((q) => `${m.id}.${q.key}`)
		);
		expect(dead).toEqual([]);
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
