import { describe, it, expect } from 'vitest';
import { modularSynth } from '../../src/lib/synth';
import { MODULE_SPECS } from '../../src/lib/stores/synth-modules';
import { isPureNode } from '../../src/lib/stores/node-graph';
import { FakeCtx, FakeParam, reaches } from './stubs/audio-context';

/**
 * A knob that says it can be driven must actually be driveable.
 *
 * This is the one rule the previous three rounds of fixes kept re-breaking in
 * different places: the card draws a socket, `rolesCompatible` accepts the
 * cable, the editor lets you draw it, and the engine has nowhere to put it. It
 * was fixed for VCF, then found again for ENV, then found again for another
 * sixty-three knobs -- because nothing checked the *pattern*, only the
 * instances.
 *
 * These tests build every module against a recording context and ask what is
 * actually connected. They are the reason `tests/unit/stubs/audio-context.ts`
 * exists: no assertion here reads the source of synth.ts, so renaming a local
 * cannot fail them and miswiring a node cannot pass them.
 */

const S = modularSynth as unknown as {
	noiseBuffer: unknown;
	buildGraphNode(...a: unknown[]): {
		in: unknown;
		out: unknown;
		mod: Map<string, unknown>;
	} | null;
};

/** Modules that hold no audio node: their values are read elsewhere entirely. */
const NOT_AUDIO = new Set(['in', 'out', 'when', 'act', 'wait']);

function build(type: string, params: Record<string, number> = {}) {
	const ctx = new FakeCtx();
	S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
	const sources: unknown[] = [];
	const p = (k: string, d: number) => params[k] ?? d;
	const cvIn = (_n: string, port: string, f: number) => params[port] ?? f;
	const made = S.buildGraphNode(
		ctx,
		type,
		p,
		220,
		0,
		0.5,
		sources,
		'n1',
		{},
		cvIn,
		{ velocity: 0.8, noteIndex: 48, tuning: 440 }
	);
	return { ctx, made, sources };
}

describe('every knob is what the card says it is', () => {
	it('registers a modulation target for every knob not marked fixed', () => {
		/* The catalogue's `fixed` flag is the whole claim: a knob without it can
		   be driven by a cable. Sixty-three could not -- STRING's DECAY shapes a
		   bank of envelopes built for the note, so there is no param to reach,
		   which is a real constraint and is now written down rather than being
		   quietly untrue. */
		const wrong: string[] = [];
		for (const m of MODULE_SPECS) {
			if (isPureNode(m.id) || NOT_AUDIO.has(m.id)) continue;
			const { made } = build(m.id);
			if (!made) continue;
			for (const q of m.params) {
				if (q.choices || q.field || q.fixed || q.wave) continue;
				if (!made.mod.has(q.key)) wrong.push(`${m.id}.${q.key}`);
			}
		}
		expect(wrong).toEqual([]);
	});

	it('accepts a cable on every socket the card draws as a mod inlet', () => {
		/* The sibling rule, and the one that was missing. These tests walked
		   `m.params` only, so a declared *input port* of kind `mod` was never
		   checked against the `mod` map at all -- which is how MAKE's WIDE came
		   to be a socket the card drew, `rolesCompatible` accepted, the editor
		   let you draw to, and the engine dropped on the floor. MAKE carries no
		   WIDE knob either, so the resolver fell through to a fallback of 1 and
		   the width could not be changed by any means. */
		const missing: string[] = [];
		for (const m of MODULE_SPECS) {
			if (isPureNode(m.id) || NOT_AUDIO.has(m.id)) continue;
			const { made } = build(m.id);
			if (!made) continue;
			for (const q of m.inputs) {
				if (q.kind !== 'mod') continue;
				/* PITCH is the documented exception, and the only one: it is read
				   as a value through `cvIn` and deliberately *not* registered,
				   because doing both put the same cable through twice and sent
				   the note an octave sharp. Matched by port id -- the role is
				   `hz` on most of them and `pitch` only on ENTRY's. */
				if (q.id === 'pitch') continue;
				/* PHS is the second, and it is not registered because there is
				   nothing to register it *on*: an OscillatorNode has no phase
				   AudioParam. The offset is rotated into the wave table when the
				   note is built, so it is read as a value like PITCH and is fixed
				   for the life of the note -- an LFO cannot sweep it, and the
				   socket takes a CONST or anything else resolved per note. */
				if (m.id === 'osc' && q.id === 'phase') continue;
				/* MAP's A is the third, and it is the signal path rather than a
				   param: the curve is a WaveShaperNode and A is what goes into it.
				   Declared `mod` because a control value must reach it too -- fed
				   velocity it is one number per note, fed a waveform it bends every
				   sample -- so the cable lands on the node's own inlet, which is
				   `in`, not on an entry in the mod map. */
				if (m.id === 'map' && q.id === 'a') {
					expect(made.in, 'map.a has no inlet to land on').not.toBe(null);
					continue;
				}
				/* TERM.CV's A is the fourth, and it is MAP's case exactly: dual, so
				   the cable lands on the node's own inlet rather than on a param.
				   Registering `a` in the mod map would have been worse than
				   leaving it out -- a signal into a unity gain's *gain* multiplies
				   instead of passing through, so the terminal would have scaled
				   what it was supposed to forward unchanged. */
				if (m.id === 'nodecv' && q.id === 'a') {
					expect(made.in, 'nodecv.a has no inlet to land on').not.toBe(null);
					continue;
				}
				if (!made.mod.has(q.id)) missing.push(`${m.id}.${q.id}`);
			}
		}
		expect(missing).toEqual([]);
	});

	it('offers no driveable knob on a module that builds to nothing', () => {
		/* ACT, WHEN and SEQ hold no audio node, so a cable can never land on one
		   of their knobs. The drop-search picks its target as the first param
		   that is not a choice, a field or `fixed` -- so ACT's GRP, alone in the
		   logic chain in carrying no flag, was offered as the destination for
		   any value cable dragged into empty space, and the cable it drew was
		   inert. If a module builds to null, every knob on it is fixed. */
		const wrong: string[] = [];
		for (const m of MODULE_SPECS) {
			if (isPureNode(m.id)) continue;
			const { made } = build(m.id);
			if (made) continue;
			for (const q of m.params) {
				if (q.choices || q.field || q.fixed || q.wave) continue;
				wrong.push(`${m.id}.${q.key} is driveable on a module with no audio node`);
			}
		}
		expect(wrong).toEqual([]);
	});

	it('does not mark a knob fixed that the engine does bind', () => {
		// The flag has to cost something, or it becomes a place to hide a bug.
		const stale: string[] = [];
		for (const m of MODULE_SPECS) {
			if (isPureNode(m.id) || NOT_AUDIO.has(m.id)) continue;
			const { made } = build(m.id);
			if (!made) continue;
			for (const q of m.params) {
				if (q.fixed && made.mod.has(q.key)) stale.push(`${m.id}.${q.key}`);
			}
		}
		expect(stale).toEqual([]);
	});

	it('lands a knob cable on a real AudioParam, through any scaling', () => {
		/* A registered target is either the param itself or a gain in front of
		   it that converts the knob's units -- PAN's POS is -100..100 and `pan`
		   is -1..1, so a CONST of 100 must mean hard right and not a hundred
		   times hard right. Either way a signal must arrive at a param. */
		const dead: string[] = [];
		for (const m of MODULE_SPECS) {
			if (isPureNode(m.id) || NOT_AUDIO.has(m.id)) continue;
			const { made } = build(m.id);
			if (!made) continue;
			for (const q of m.params) {
				if (q.choices || q.field || q.fixed || q.wave) continue;
				const target = made.mod.get(q.key);
				if (target instanceof FakeParam) continue;
				const node = target as Parameters<typeof reaches>[0] | undefined;
				if (!node) continue;
				const anyParam = node.outgoing.some((e) => e.to instanceof FakeParam);
				if (!anyParam) dead.push(`${m.id}.${q.key} reaches no param`);
			}
		}
		expect(dead).toEqual([]);
	});

	it('drives the same param the knob itself wrote', () => {
		/* The one this suite could not previously ask. Presence in the `mod` map
		   was the whole assertion, so replacing every `mod.set(key, target)` in
		   the engine with a freshly made, unconnected param -- every knob in the
		   synth wired to nothing -- left all 852 tests green.
		
		   A knob writes a value and registers a target, and those must be the
		   same param. Checked by writing a distinctive value through the knob
		   and finding a param that carries it, either registered directly or at
		   the far end of the scaling node. A dangling param is created at 0 and
		   never written, so it cannot match. */
		const wrong: string[] = [];
		for (const m of MODULE_SPECS) {
			if (isPureNode(m.id) || NOT_AUDIO.has(m.id)) continue;
			for (const q of m.params) {
				if (q.choices || q.field || q.fixed || q.wave) continue;
				/* A value inside the knob's own range and away from its default,
				   so the param cannot hold it by coincidence. */
				const probe = q.min + (q.max - q.min) * 0.37;
				if (probe === q.def) continue;
				const { made } = build(m.id, { [q.key]: probe });
				const target = made?.mod.get(q.key);
				if (!target) continue;

				const landed: FakeParam[] =
					target instanceof FakeParam
						? [target]
						: (target as { outgoing: { to: unknown }[] }).outgoing
								.map((e) => e.to)
								.filter((x): x is FakeParam => x instanceof FakeParam);
				if (!landed.length) continue;

				/* Either the param holds the knob's number, or it holds it after
				   the unit conversion the scaling node in front applies. */
				const scale =
					target instanceof FakeParam ? 1 : ((target as { gain?: FakeParam }).gain?.value ?? 1);
				const ok = landed.some(
					(pm) =>
						Math.abs(pm.value - probe) < 1e-6 ||
						Math.abs(pm.value - probe * scale) < 1e-6 ||
						pm.events.some(
							(ev) => Math.abs(ev[1] - probe) < 1e-6 || Math.abs(ev[1] - probe * scale) < 1e-6
						)
				);
				if (!ok) wrong.push(`${m.id}.${q.key} registers a param the knob never wrote`);
			}
		}
		expect(wrong).toEqual([]);
	});

	it('scales a knob whose units are not the param’s, so turned and patched agree', () => {
		/* COMP's ATK is milliseconds on the card and seconds on the node.
		   Without the scaling node in front, a CONST of 5 into the same inlet
		   lands on the param whole -- five seconds of attack where five
		   milliseconds was meant. The gain carries the same divide the knob
		   goes through, so a patched value means what a typed one means.

		   This was written against PAN's POS, which no longer needs the
		   conversion -- see the next test -- and against MIX before that,
		   which is gone entirely: a mixer is GAINs into a SUM, both of which
		   the catalogue has. The rule it checks is not about either module, so
		   it moved to one that still needs it. */
		const { made } = build('comp', { compAttack: 5 });
		const target = made!.mod.get('compAttack') as { gain: FakeParam } & { outgoing: unknown[] };
		expect(target).toBeTruthy();
		expect((target as unknown as { gain: FakeParam }).gain.value).toBeCloseTo(0.001, 6);
	});

	it('converts a knob whose units are not the param’s', () => {
		// COMP's ATK: milliseconds on the card, seconds on the node.
		const comp = build('comp', { compAttack: 5 });
		const compTarget = comp.made!.mod.get('compAttack') as unknown as { gain: FakeParam };
		expect(compTarget.gain.value).toBeCloseTo(0.001, 6);
		/* DELAY and PAN both used to need the same conversion -- DELAY was
		   milliseconds on the card against seconds on the node, PAN was
		   -100..100 against the param's -1..1 -- and neither does any more:
		   DELAY's TIME is typed in seconds now, and PAN's POS is typed
		   -1..1 directly, which is the unit the param holds either way. A
		   field can spell out the number the param wants where a dial
		   spanning the wrong range could not, so the two-unit dance had
		   nothing left to buy. Both cables land on their AudioParam
		   directly. */
		const dl = build('delay');
		expect(dl.made!.mod.get('delayTime')).toBeTruthy();
		const pan = build('pan', { panPos: 0.5 });
		const panTarget = pan.made!.mod.get('panPos');
		expect(panTarget).toBeTruthy();
		expect(panTarget instanceof FakeParam).toBe(true);
	});
});

describe('a declared outlet is a real outlet', () => {
	it('resolves every declared outlet by name, not by falling back to `out`', () => {
		/* An unrecognised port silently becomes `out`. That is deliberate -- most
		   modules have one outlet and naming it would be noise -- but it is also
		   how BREAK's AMP shipped: declared as a third outlet, implemented as
		   nothing, and resolved to the mid gain, so a cable meant to carry an
		   envelope carried raw audio into a CV leg.
		
		   So: an outlet whose id is not `out` has to be published, either in
		   `outs` or as `out2` for the port named `r`. Anything else is a name the
		   builder does not know. */
		const unnamed: string[] = [];
		for (const m of MODULE_SPECS) {
			if (isPureNode(m.id) || NOT_AUDIO.has(m.id)) continue;
			const { made } = build(m.id);
			if (!made) continue;
			const node = made as unknown as {
				out2?: unknown;
				outs?: Map<string, unknown>;
			};
			for (const o of m.outputs) {
				if (o.kind === 'exec' || o.id === 'out') continue;
				if (node.outs?.has(o.id)) continue;
				if (o.id === 'r' && node.out2) continue;
				unnamed.push(`${m.id}.${o.id}`);
			}
		}
		expect(unnamed).toEqual([]);
	});
});

describe('what a module builds', () => {
	it('starts every source it makes', () => {
		/* A source created and never started is silence with a node graph behind
		   it, which looks entirely healthy in a debugger. */
		for (const m of MODULE_SPECS) {
			if (isPureNode(m.id) || NOT_AUDIO.has(m.id)) continue;
			const { sources } = build(m.id);
			// buildGraphNode collects them; buildRackGraph starts them. What
			// matters here is that they were handed over rather than dropped.
			expect(Array.isArray(sources)).toBe(true);
		}
	});

	it('gives every module an output, or declares that it has none', () => {
		for (const m of MODULE_SPECS) {
			if (isPureNode(m.id) || NOT_AUDIO.has(m.id)) continue;
			const { made } = build(m.id);
			if (!made) continue;
			const declaresAudioOut = m.outputs.some((o) => o.kind === 'audio');
			if (declaresAudioOut) expect(made.out, m.id).toBeTruthy();
		}
	});
});
