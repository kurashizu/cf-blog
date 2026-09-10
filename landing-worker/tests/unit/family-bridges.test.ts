import { describe, it, expect } from 'vitest';
import { modularSynth } from '../../src/lib/synth';
import { MODULE_SPECS } from '../../src/lib/stores/synth-modules';
import { roleOf, rolesCompatible } from '../../src/lib/stores/graph-model';
import { FakeCtx } from './stubs/audio-context';

/**
 * The doors between sound and value.
 *
 * `rolesCompatible` seals the audio family off from the control family, which
 * is what keeps a waveform from landing on a knob by accident. That wall needs
 * doors, or nothing a patch hears can steer what it does and nothing it
 * computes can be heard. There are three, and which one to use is a question
 * about what you want to know rather than which direction you are going.
 */

const S = modularSynth as unknown as {
	noiseBuffer: unknown;
	buildGraphNode(...a: unknown[]): { in: unknown; out: unknown; mod: Map<string, unknown> } | null;
};

function build(type: string, params: Record<string, number> = {}) {
	const ctx = new FakeCtx();
	S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
	const sources: unknown[] = [];
	const made = S.buildGraphNode(
		ctx,
		type,
		(k: string, d: number) => params[k] ?? d,
		220,
		0,
		0.5,
		sources,
		'n1',
		{},
		(_n: string, port: string, f: number) => params[port] ?? f,
		{ velocity: 0.8, noteIndex: 48, tuning: 440 },
		0.5
	);
	return { ctx, made, sources };
}

const spec = (id: string) => MODULE_SPECS.find((m) => m.id === id)!;
const outRole = (id: string) => roleOf(spec(id).outputs[0]);
const inRole = (id: string, port?: string) =>
	roleOf(port ? spec(id).inputs.find((q) => q.id === port)! : spec(id).inputs[0]);

/** One cycle of a sine through a rectifier and a one-pole, as FOLLOW builds it. */
function follows(hz: number, resp: number, sens: number) {
	const sr = 4800;
	const dt = 1 / sr;
	const rc = 1 / (2 * Math.PI * resp);
	const a = dt / (rc + dt);
	let y = 0;
	const sampled: number[] = [];
	for (let i = 0; i < sr * 2; i++) {
		y += a * (Math.abs(Math.sin((2 * Math.PI * hz * i) / sr)) - y);
		if (i >= sr && i % (sr / 8) === 0) sampled.push(+(y * sens).toFixed(2));
	}
	return sampled;
}

describe('the wall the doors are in', () => {
	it('refuses a waveform on a knob and a value in a signal path', () => {
		expect(rolesCompatible(outRole('osc'), inRole('gain', 'level'))).toBe(false);
		expect(rolesCompatible(outRole('const'), inRole('gain', 'in'))).toBe(false);
	});
});

describe('TO-CV: sound read as a value, sign and all', () => {
	it('carries a signal to any knob', () => {
		expect(rolesCompatible(outRole('osc'), inRole('tocv'))).toBe(true);
		expect(rolesCompatible(outRole('tocv'), inRole('gain', 'level'))).toBe(true);
		expect(rolesCompatible(outRole('tocv'), inRole('filter', 'cutoff'))).toBe(true);
	});

	it('is `cv` rather than `unit`, because a signal swings both ways', () => {
		/* FOLLOW hands back a `unit` -- 0..1 -- which is honest about a loudness
		   and would be a lie about a waveform. */
		expect(outRole('tocv')).toBe('cv');
		expect(outRole('follow')).toBe('unit');
	});

	it('passes the signal through untouched', () => {
		/* The whole module: a gain of 1. A node connected to an AudioParam is
		   already a control voltage -- the wall is ours, so the door is too, and
		   it does not need to convert anything to open. */
		const { made } = build('tocv');
		expect((made!.out as { gain: { value: number } }).gain.value).toBe(1);
		expect(made!.in).toBe(made!.out);
	});

	it('has no knob, because scaling already has two homes', () => {
		// GAIN attenuates the signal before it, MUL scales the value after it.
		expect(spec('tocv').params).toEqual([]);
	});
});

describe('FOLLOW: sound read as a loudness', () => {
	it('destroys the sign, which is what rectifying means', () => {
		/* The measurement that says FOLLOW is the wrong bridge for an LFO. A sine
		   is symmetric about zero, so its second half is the negative of its
		   first -- and it follows out identical, because loudness has no negative
		   half. A 1 Hz sine arrives as a 2 Hz run of humps. */
		const out = follows(1, 20, Math.PI / 2);
		const firstHalf = out.slice(0, 4);
		const secondHalf = out.slice(4, 8);
		expect(secondHalf).toEqual(firstHalf);
		// Never negative, whatever went in.
		expect(Math.min(...out)).toBeGreaterThanOrEqual(0);
	});

	it('settles at the peak it was given, once SENS has undone the 2/pi', () => {
		/* Averaged rather than tracked: with RESP well below the signal, the
		   rectified mean of a sine is 2/pi of its peak, and SENS puts the scale
		   back so a full-scale input follows out at 1. */
		const slow = follows(220, 20, Math.PI / 2);
		expect(slow[slow.length - 1]).toBeCloseTo(1, 1);
		const unlifted = follows(220, 20, 1);
		expect(unlifted[unlifted.length - 1]).toBeCloseTo(2 / Math.PI, 1);
	});
});

describe('TO-SIG: a value made into sound', () => {
	it('carries a value into a signal path', () => {
		expect(rolesCompatible(outRole('const'), inRole('tosig'))).toBe(true);
		expect(rolesCompatible(outRole('tosig'), inRole('gain', 'in'))).toBe(true);
	});

	it('is a source, holding no audio inlet', () => {
		const { made } = build('tosig');
		expect(made!.in).toBe(null);
		expect(made!.mod.has('level')).toBe(true);
	});
});

describe('the three doors, and no fourth', () => {
	it('names every crossing in each direction', () => {
		const toControl = MODULE_SPECS.filter(
			(m) => m.inputs.some((i) => i.kind === 'audio') && m.outputs.some((o) => o.kind === 'mod')
		).map((m) => m.id);
		/* A bridge *carries* a value across; a generator merely takes one. OSC and
		   PWM read a frequency and invent a waveform from nothing, so their
		   control inlet is a setting rather than the thing being converted --
		   what leaves is not what arrived. TO-SIG's outlet is its inlet, which is
		   what makes it the crossing. Told apart by the port ids matching. */
		const toAudio = MODULE_SPECS.filter(
			(m) =>
				m.outputs.some((o) => o.kind === 'audio') &&
				m.inputs.length > 0 &&
				m.inputs.every((i) => i.kind === 'mod') &&
				m.inputs.some((i) => m.params.some((q) => q.key === i.id))
		).map((m) => m.id);
		/* Two ways to read a sound, because "how loud" and "what value" are
		   different questions, and one way back. Kept as a list so a fourth
		   cannot appear without someone deciding what question it answers. */
		expect(toControl.sort()).toEqual(['follow', 'tocv']);
		expect(toAudio).toEqual(['tosig']);
	});

	it('makes an oscillator a usable LFO, which is why there is no LFO module', () => {
		/* A low-frequency oscillator is an oscillator at a low frequency. With
		   the door open, OSC -> TO-CV -> any knob is a tremolo, a vibrato or a
		   filter sweep depending on where it lands -- so an LFO card would be the
		   same primitive a second time, carrying its own smaller wave list and a
		   rate knob duplicating FREQ. */
		expect(MODULE_SPECS.some((m) => m.id === 'lfo')).toBe(false);
		expect(rolesCompatible(outRole('osc'), inRole('tocv'))).toBe(true);
		for (const target of [
			['gain', 'level'],
			['filter', 'cutoff'],
			['osc', 'pitch']
		] as [string, string][]) {
			expect(rolesCompatible(outRole('tocv'), inRole(...target)), target.join('.')).toBe(true);
		}
	});
});
