import { describe, it, expect } from 'vitest';
import { modularSynth } from '../../src/lib/synth';
import { FakeCtx, FakeParam, type FakeNode } from './stubs/audio-context';

/**
 * How the two oscillators are combined, checked on the graph that gets built.
 *
 * FM is the one with a wiring rule that is easy to get wrong and impossible to
 * hear as a mistake: OSC2 is the modulator and OSC1 the carrier, so OSC2's
 * output belongs on OSC1's frequency and nowhere else. The list of companion
 * oscillators held *both* stacks by the time FM was wired, and the guard there
 * excluded only the OSC2 primary -- so SUPERSAW on OSC2 patched that stack's
 * four companions to the summed output they themselves produce.
 *
 * It does not throw and it is not silent. It is a self-oscillating loop that
 * makes the timbre unrelated to the FM index MORPH is setting, which is the
 * kind of thing that gets mistaken for the sound of the synth.
 */

const S = modularSynth as unknown as {
	renderCtx: unknown;
	masterFXCtx: unknown;
	delayNode: unknown;
	noiseBuffer: unknown;
	activeVoices: Map<string, unknown>;
	tracks: Record<string, unknown>[];
	triggerTrackVoice(...a: unknown[]): string | undefined;
};

/** Can a signal leaving `from` arrive at `to`, however many hops it takes? */
function reaches(from: FakeNode, to: FakeNode): boolean {
	const seen = new Set<FakeNode>();
	const queue: FakeNode[] = [from];
	while (queue.length) {
		const at = queue.shift()!;
		if (seen.has(at)) continue;
		seen.add(at);
		for (const edge of at.outgoing) {
			if (edge.to === to) return true;
			if (!(edge.to instanceof FakeParam)) queue.push(edge.to);
		}
	}
	return false;
}

/** Build one note and count oscillators being modulated by their own output. */
function selfModulatingOscillators(timbre: Record<string, unknown>): number {
	const ctx = new FakeCtx();
	S.renderCtx = ctx;
	S.masterFXCtx = null;
	S.delayNode = null;
	S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
	S.activeVoices.clear();
	const track = S.tracks[0];
	const saved = JSON.parse(JSON.stringify(track));
	try {
		Object.assign(track, timbre);
		track.muted = false;
		track.advanced = false;
		track.rackGraph = undefined;
		// No LFO, so the only thing on a frequency param is the FM leg.
		track.lfoRate = 0;
		track.pitchModAmount = 0;
		S.triggerTrackVoice(0, 40, 0, 0, 0.4, 100, 100);

		let loops = 0;
		for (const node of ctx.nodes) {
			const toFreq = node.outgoing.filter(
				(e) => e.to instanceof FakeParam && e.to.name === 'frequency'
			);
			if (!toFreq.length) continue;
			const feeders = ctx.nodes.filter((n) => n.outgoing.some((e) => e.to === node));
			for (const edge of toFreq) {
				const modulated = (edge.to as FakeParam).owner;
				if (feeders.some((f) => f === modulated || reaches(modulated, f))) loops++;
			}
		}
		return loops;
	} finally {
		Object.assign(track, saved);
		S.renderCtx = null;
	}
}

describe('FM modulates the carrier and only the carrier', () => {
	it('does not feed OSC2 back into its own supersaw companions', () => {
		expect(
			selfModulatingOscillators({
				blendMode: 'fm',
				osc1Waveform: 'sawtooth',
				osc2Waveform: 'supersaw',
				morphAmount: 50,
				osc1Gain: 1,
				osc2Gain: 1
			})
		).toBe(0);
	});

	it('is clean with a supersaw carrier too, which is the legitimate case', () => {
		// OSC1's companions *should* be modulated: they are the carrier's tone.
		expect(
			selfModulatingOscillators({
				blendMode: 'fm',
				osc1Waveform: 'supersaw',
				osc2Waveform: 'sawtooth',
				morphAmount: 50,
				osc1Gain: 1,
				osc2Gain: 1
			})
		).toBe(0);
	});

	it.each(['layer', 'ring', 'sync'])('%s builds no frequency feedback either', (mode) => {
		expect(
			selfModulatingOscillators({
				blendMode: mode,
				osc1Waveform: 'supersaw',
				osc2Waveform: 'supersaw',
				morphAmount: 50,
				osc1Gain: 1,
				osc2Gain: 1
			})
		).toBe(0);
	});
});
