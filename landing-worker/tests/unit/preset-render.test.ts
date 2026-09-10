import { describe, it, expect } from 'vitest';
import { modularSynth } from '../../src/lib/synth';
import { SOUND_PRESETS } from '../../src/lib/stores/synth-presets';
import { FakeCtx, FakeParam } from './stubs/audio-context';

/**
 * Every shipped preset builds a voice, and builds a sane one.
 *
 * Rendering these in a browser is what proves they sound right, and that stays
 * a manual step. This asks the cheaper question the suite can ask on every run:
 * does each preset actually produce a source node, and is every number it
 * writes to an AudioParam finite. A non-finite value is not a subtle defect --
 * AudioParam methods throw a RangeError on one, which kills the note outright
 * and yields silence with nothing logged.
 *
 * It found one immediately. The ADV mod-cable loop tested `param instanceof
 * AudioParam` purely to select a TypeScript overload, with both arms doing the
 * same thing; `AudioParam` is a browser global, so on any runtime without one
 * the loop threw and took the note with it. The two presets carrying mod
 * cables, VIBRAPHONE and BOWED STRINGS, hit it.
 */

type Timbre = Record<string, unknown>;
const S = modularSynth as unknown as {
	renderCtx: unknown;
	masterFXCtx: unknown;
	delayNode: unknown;
	noiseBuffer: unknown;
	activeVoices: Map<string, unknown>;
	tracks: Timbre[];
	triggerTrackVoice(...a: unknown[]): string | undefined;
};

describe('the shipped presets', () => {
	it('each build a voice, with every scheduled value finite', () => {
		const bad: string[] = [];
		for (const entry of SOUND_PRESETS as unknown as { name: string; preset?: Timbre }[]) {
			const timbre = (entry.preset ?? entry) as Timbre;
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
				// A graph preset only reaches the patch bay when ADV owns the voice.
				if ((timbre.rackGraph as { nodes?: unknown[] })?.nodes?.length) track.advanced = true;
				S.triggerTrackVoice(0, 40, 0, 0, 0.4, 100, 100);

				const sources = ctx.nodes.filter((n) => n.kind === 'osc' || n.kind === 'bufsrc');
				if (!sources.length) bad.push(`${entry.name}: builds no source`);

				for (const node of ctx.nodes) {
					for (const key of Object.keys(node)) {
						const p = (node as unknown as Record<string, unknown>)[key];
						if (!(p instanceof FakeParam)) continue;
						if (!Number.isFinite(p.value))
							bad.push(`${entry.name}: ${node.kind}.${key} is ${p.value}`);
						for (const ev of p.events) {
							if (!Number.isFinite(ev[1]))
								bad.push(`${entry.name}: ${node.kind}.${key} ${ev[0]} ${ev[1]}`);
						}
					}
				}
			} catch (e) {
				bad.push(`${entry.name}: threw ${String(e).slice(0, 70)}`);
			} finally {
				Object.assign(track, saved);
				S.renderCtx = null;
			}
		}
		expect(bad).toEqual([]);
	});

	it('are actually there, so the loop above cannot pass on an empty list', () => {
		expect((SOUND_PRESETS as unknown as unknown[]).length).toBeGreaterThan(30);
	});
});
