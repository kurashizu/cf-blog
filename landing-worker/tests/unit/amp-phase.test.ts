import { describe, it, expect } from 'vitest';
import { modularSynth } from '../../src/lib/synth';
import { MODULE_SPECS } from '../../src/lib/stores/synth-modules';
import { isPureNode } from '../../src/lib/stores/node-graph';
import { roleOf, rolesCompatible } from '../../src/lib/stores/graph-model';
import { FakeCtx } from './stubs/audio-context';

/**
 * The two things you do to a waveform: change how big it is, and change where
 * it starts.
 *
 * They are not the same kind of problem. Amplitude is multiplication and the
 * catalogue already had multiplication -- but only the pure kind, which cannot
 * touch sound. Phase has no existing expression at all, because Web Audio's
 * oscillator has no phase parameter, and it turns out to be reachable only
 * through the harmonic coefficients.
 */

const S = modularSynth as unknown as {
	noiseBuffer: unknown;
	buildGraphNode(...a: unknown[]): {
		in: unknown;
		out: { gain?: { value: number } };
		mod: Map<string, unknown>;
	} | null;
};

function build(type: string, params: Record<string, number> = {}, wave?: string) {
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
		{ velocity: 0.8, noteIndex: 48, tuning: 440 },
		0.5,
		wave
	);
	return { ctx, made, sources };
}

const spec = (id: string) => MODULE_SPECS.find((m) => m.id === id)!;

describe('GAIN, the audio half of multiplication', () => {
	it('exists because MUL cannot reach a sound', () => {
		/* The measurement the module is justified by. MUL's inlet is `cv` and an
		   oscillator's outlet is `signal`, and the two families do not meet --
		   so "just use MUL" is not an option that was passed over, it is a cable
		   the editor will not draw. */
		const oscOut = roleOf(spec('osc').outputs[0]);
		const mulIn = roleOf(spec('mul').inputs[0]);
		expect(rolesCompatible(oscOut, mulIn)).toBe(false);
		// And GAIN is the one that does take it.
		expect(rolesCompatible(oscOut, roleOf(spec('gain').inputs[0]))).toBe(true);
	});

	it('is an audio node, where MUL is a pure one', () => {
		/* The reason they are two modules rather than one card with an extra
		   socket: a pure node's whole output is a number pulled once per note,
		   and an audio node's is a signal carried sample by sample. One card
		   doing both would be two modules wearing one name. */
		expect(isPureNode('mul')).toBe(true);
		expect(isPureNode('gain')).toBe(false);
	});

	it('passes the signal through the gain it was set to', () => {
		const { made } = build('gain', { level: 0.25 });
		expect(made!.out.gain!.value).toBe(0.25);
		// The inlet and the outlet are the same node: sound goes in and comes out.
		expect(made!.in).toBe(made!.out);
	});

	it('takes a cable on its level, because that is what a VCA is', () => {
		/* Unlike PW and PHS, LVL is a knob *and* a modulation target. A signal
		   arriving at an AudioParam adds to it, and an envelope adding to a
		   level is exactly the behaviour wanted -- that is a VCA. The trap PW
		   was pulled out of was a knob duplicating a *socket*; here the knob is
		   the inlet. */
		const { made } = build('gain');
		expect(made!.mod.has('level')).toBe(true);
	});

	it('goes negative, which is what makes a separate INV unnecessary', () => {
		/* -1 is the same signal upside down. An invert module would be this one
		   with its knob welded to a single value, which is a module that asks no
		   question. */
		const lvl = spec('gain').params.find((q) => q.key === 'level')!;
		expect(lvl.min).toBeLessThan(0);
		expect(lvl.max).toBeGreaterThan(1);
		const { made } = build('gain', { level: -1 });
		expect(made!.out.gain!.value).toBe(-1);
	});
});

/** The harmonics an oscillator was actually built with. */
function harmonics(sources: unknown[]) {
	const osc = sources.find((s) => (s as { periodic?: unknown }).periodic !== undefined) as {
		periodic: { real: Float32Array; imag: Float32Array } | null;
		type: string;
	};
	return osc;
}

describe('PHS, which lives in the coefficients', () => {
	it('costs nothing when it is not asked for', () => {
		/* The named shapes reach `osc.type` directly, which is cheaper than a
		   wave table and is what nearly every note wants. A phase of zero has to
		   stay on that path. */
		const { sources } = build('osc', { phase: 0 }, 'sawtooth');
		const osc = harmonics(sources);
		expect(osc.periodic).toBe(null);
		expect(osc.type).toBe('sawtooth');
	});

	it('becomes a wave table once an offset is asked for', () => {
		const { sources } = build('osc', { phase: 0.25 }, 'sawtooth');
		expect(harmonics(sources).periodic).not.toBe(null);
	});

	it('rotates the nth harmonic n times as far', () => {
		/* This is the whole of what a phase offset is, and the thing that would
		   silently be wrong otherwise: rotating every harmonic by the *same*
		   angle smears the shape into a different waveform, while rotating the
		   nth by n times the angle slides the same waveform along. Checked
		   against the magnitude and the angle rather than against the sound. */
		const turns = 0.25;
		const { sources } = build('osc', { phase: turns }, 'sawtooth');
		const rotated = harmonics(sources).periodic!;
		const { sources: s0 } = build('osc', { phase: 0.5 }, 'sawtooth');
		const other = harmonics(s0).periodic!;

		for (const n of [1, 2, 3, 5]) {
			// The magnitude is untouched: a rotation moves a harmonic, it does not
			// resize it. That is what separates a phase shift from a filter.
			const mag = (w: { real: Float32Array; imag: Float32Array }) =>
				Math.hypot(w.real[n], w.imag[n]);
			expect(mag(rotated)).toBeCloseTo(mag(other), 6);

			// And the angle moved by n * phi.
			const ang = Math.atan2(rotated.imag[n], rotated.real[n]);
			const base = Math.atan2(other.imag[n], other.real[n]);
			const moved = ang - base - n * 2 * Math.PI * (turns - 0.5);
			const wrapped = Math.atan2(Math.sin(moved), Math.cos(moved));
			expect(wrapped).toBeCloseTo(0, 5);
		}
	});

	it('wraps, so a turn and a half is half a turn', () => {
		const a = harmonics(build('osc', { phase: 1.5 }, 'square').sources).periodic!;
		const b = harmonics(build('osc', { phase: 0.5 }, 'square').sources).periodic!;
		for (const n of [1, 3, 5]) {
			expect(a.real[n]).toBeCloseTo(b.real[n], 6);
			expect(a.imag[n]).toBeCloseTo(b.imag[n], 6);
		}
	});

	it('handles a negative offset as the turn it is', () => {
		const a = harmonics(build('osc', { phase: -0.25 }, 'sawtooth').sources).periodic!;
		const b = harmonics(build('osc', { phase: 0.75 }, 'sawtooth').sources).periodic!;
		for (const n of [1, 2, 3]) {
			expect(a.real[n]).toBeCloseTo(b.real[n], 6);
			expect(a.imag[n]).toBeCloseTo(b.imag[n], 6);
		}
	});

	it('is a socket and not a knob, so a cable cannot sum with a setting', () => {
		/* The trap PW was pulled out of: a signal arriving at a knob adds to it,
		   so a knob at 0 and a CONST of 0.25 would be two opinions about one
		   value. PHS has no knob at all -- what it is unpatched is zero. */
		const osc = spec('osc');
		expect(osc.inputs.some((q) => q.id === 'phase')).toBe(true);
		expect(osc.params.some((q) => q.key === 'phase')).toBe(false);
	});

	it('is typed as a plain 0..1, so the values that mean that can reach it', () => {
		/* A new role is worth it when a value cannot convert to its neighbours by
		   arithmetic -- which is why `pitch` and `bool` are separate. A phase is a
		   fraction of a turn, and that is the same 0..1 a duty cycle and a
		   velocity are: 0.25 of a turn and 0.25 of a pulse width are one number
		   meaning one proportion. A role of its own would cut those cables for a
		   safety that is not real. */
		const phs = spec('osc').inputs.find((q) => q.id === 'phase')!;
		expect(roleOf(phs)).toBe('unit');
		const pw = spec('pwm').inputs.find((q) => q.id === 'pw')!;
		expect(rolesCompatible(roleOf(pw), roleOf(phs))).toBe(true);
		const vel = spec('in').outputs.find((q) => q.id === 'vel')!;
		expect(rolesCompatible(roleOf(vel), roleOf(phs))).toBe(true);
	});
});
