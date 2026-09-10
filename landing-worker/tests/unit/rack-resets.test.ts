import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	RACK1_NEUTRAL,
	RACK2_NEUTRAL,
	RACK3_NEUTRAL,
	RACK4_NEUTRAL,
	RACK5_NEUTRAL,
	RACK6_EQ_NEUTRAL,
	RACK6_DUCK_NEUTRAL,
	RACK7_NEUTRAL
} from '../../src/lib/stores/synth-reset';
import type { TrackData } from '../../src/lib/synth';

/**
 * RESET on a rack and right-click on one of its knobs must agree.
 *
 * synth-reset.ts states this as a promise -- "the same numbers are what
 * right-clicking a single control snaps to, so RESET on a rack and right-click
 * on each of its knobs agree" -- and then nothing enforced it. The rack values
 * live in RACK*_NEUTRAL; the knob values are 42 numbers hand-typed into
 * `reset={...}` across seven panels, and no panel imports the constants. The
 * two agreed when checked, but only by hand, and the same shape of promise has
 * already gone stale elsewhere in this codebase: trackResetDefaults() had
 * fallen sixty fields behind before it was derived from BLANK_TRACK_TIMBRE.
 *
 * Reading the panels as text is the awkward part, and it is deliberate: the
 * alternative is rewriting 42 call sites where the knob's unit and the stored
 * unit often differ (a gain shown 0-100 and stored 0-1), which is a bigger
 * change than the risk warrants. The parse below fails loudly rather than
 * silently matching nothing.
 */

const PANELS: { file: string; neutral: Partial<TrackData> }[] = [
	{ file: 'Module1Oscillators', neutral: RACK1_NEUTRAL },
	{ file: 'Module2TimbreFusion', neutral: RACK2_NEUTRAL },
	{ file: 'Module3Filter', neutral: RACK3_NEUTRAL },
	{ file: 'Module4Envelopes', neutral: RACK4_NEUTRAL },
	{ file: 'Module5Lfo', neutral: RACK5_NEUTRAL },
	/* Rack 6 has no single neutral: its EQ and DUCK tabs reset separately, and
	   the delay/reverb/drive knobs on the same panel are master-bus state held
	   in synth-fx rather than fields on the track. Both track-side halves are
	   checked; the FX knobs fall out of the `field in neutral` filter below. */
	{ file: 'Module6FxEq', neutral: { ...RACK6_EQ_NEUTRAL, ...RACK6_DUCK_NEUTRAL } },
	{ file: 'Module7Out', neutral: RACK7_NEUTRAL }
];

/**
 * Every knob in a panel that declares both a reset and the field it writes.
 *
 * `onChange={(v) => updateActiveTrack({ someField: v / 100 })}` also states the
 * conversion between what the knob shows and what the track stores, so the
 * divisor is read from the same string rather than guessed at.
 */
function knobsOf(file: string): { field: string; reset: number; divisor: number }[] {
	const src = readFileSync(`src/lib/components/synth/modules/${file}.svelte`, 'utf8');
	const out: { field: string; reset: number; divisor: number }[] = [];
	for (const line of src.split('\n')) {
		const reset = line.match(/reset=\{(-?[\d.]+)\}/);
		const write = line.match(/updateActiveTrack\(\{\s*([A-Za-z0-9_]+):\s*v(?:\s*\/\s*(\d+))?\s*\}\)/);
		if (!reset || !write) continue;
		out.push({ field: write[1], reset: Number(reset[1]), divisor: write[2] ? Number(write[2]) : 1 });
	}
	return out;
}

describe('a rack RESET and its knobs snap to the same place', () => {
	it('finds the knobs at all, so a rename cannot empty this file', () => {
		const total = PANELS.reduce((n, p) => n + knobsOf(p.file).length, 0);
		expect(total).toBeGreaterThan(20);
	});

	it.each(PANELS)('$file', ({ file, neutral }) => {
		const disagree: string[] = [];
		for (const k of knobsOf(file)) {
			if (!(k.field in neutral)) continue;
			const rackValue = (neutral as Record<string, unknown>)[k.field];
			if (typeof rackValue !== 'number') continue;
			const knobValue = k.reset / k.divisor;
			if (Math.abs(knobValue - rackValue) > 1e-9) {
				disagree.push(`${k.field}: knob resets to ${knobValue}, rack to ${rackValue}`);
			}
		}
		expect(disagree).toEqual([]);
	});
});
