import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { playSound } from '../sound';
import { tr } from '../i18n';
import { KEY_TIMBRE_KEYS, BLANK_TRACK_TIMBRE, type TrackData } from '../track-data';
import { MODULE_SPECS } from './synth-modules';

/* Every type the catalogue can build, asked rather than restated: a second copy
   of the roster is the thing that goes stale. */
const MODULE_IDS = new Set(MODULE_SPECS.map((m) => m.id));

/* Types these patches were written against, and what absorbed each.
 *
 * The catalogue was emptied and rebuilt from primitives, so a preset written
 * before that names modules which no longer exist. Where the replacement is
 * exact, the rename belongs here rather than in thirteen preset literals: one
 * table is one place to be wrong, and it keeps each preset readable as the
 * instrument it describes.
 *
 * Only exact absorptions. VCA is GAIN -- an amplifier whose level may go
 * negative is a VCA and an inverter at once, which is why GAIN took it. MIX is
 * SUM, since every audio inlet already sums and MIX's two level knobs are two
 * GAINs the patch can see. Anything needing more than a rename (BODY, BOW,
 * REED, COMB, DRIVE, EQ, LFO) is deliberately absent: those want a patch, and a
 * table that silently substituted an approximation would be worse than a
 * preset that says it is waiting. */
const MIGRATED: Record<string, string> = { vca: 'gain', mix: 'sum' };

/* And the params that moved with them, with the conversion each needs.
 *
 * VCA's GAIN was a percentage and GAIN's LVL is a multiplier. A rename alone
 * would be a hundredfold error that type-checks perfectly. */
const MIGRATED_PARAMS: Record<string, [string, (v: number) => number]> = {
	'vca.gain': ['level', (v) => v / 100]
};
import { SMB1_NOISE_KEYS } from '../songs/mario1';
import {
	activeKey,
	activeTrackRow,
	currentTrack,
	noteNameOf,
	updateActiveTrack,
	applyKitToActiveTrack,
	setTrackEditedHook
} from './synth-tracks';
import { showSaveStatus, askConfirm } from './synth-confirm';
import { ENTRY_ID, OUTPUT_ID, startingGraph, type GraphNode, type GraphCable } from './graph-model';
import type { MacroDef } from './macros';
import { grandPiano } from './grand-piano';
import { jazzKit, kit808 } from './drum-kits';

const STORAGE_KEY = 'krsz-synth-presets-v1';
const KIT_STORAGE_KEY = 'krsz-synth-kits-v1';
const FILE_FORMAT = 'krsz-synth-preset';
const KIT_FILE_FORMAT = 'krsz-synth-kit';

/* Eleven families, each of which can hold both kinds of sound: an electric one
   built by subtraction on racks 1-7, and an acoustic one built as a signal path
   in the patch bay. The pair is the point -- a LEAD is a lead whether it is a
   saw through a filter or a bowed string -- so they share a heading and `kind`
   separates them within it. */
export type PresetCategory =
	| 'LEAD'
	| 'PAD'
	| 'BASS'
	| 'PLUCK'
	| 'KEYBOARD'
	| 'ORGAN'
	| 'STRING'
	| 'WIND'
	| 'MALLET'
	| 'FX'
	| 'DRUM';

/** E = electric, built by subtraction. AC = acoustic, built as a signal path. */
export type PresetKind = 'E' | 'AC';

export interface SoundPreset {
	name: string;
	/** Built-ins carry one; user presets are listed under MY PRESETS regardless. */
	category?: PresetCategory;
	/** Which half of its family this is. Absent means electric. */
	kind?: PresetKind;
	preset: Partial<TrackData>;
}

/* Every built-in starts from a full, neutral timbre and overrides what it
   needs. A preset that only set the fields it cared about left the rest --
   an LFO, a noise mix, a sub, a pulse width -- over from whatever the track
   was before, so the same preset sounded different on every track. Now a
   preset is the whole sound. */
export const BASE: Partial<TrackData> = {
	/* Every preset carries its own level. Measured across all 37, onset energy
	   spanned 18.8 dB -- a CLAV arrived 10 dB under an ORGAN -- so switching
	   patches meant riding the fader. 1 is unchanged, and the two patches that
	   are meant to be faint (RISER's swell, STATIC's bed) keep it. */
	presetGain: 1,
	osc1Waveform: 'square',
	osc1Gain: 0.9,
	osc2Waveform: 'sawtooth',
	osc2Gain: 0.5,
	osc2Ratio: 1,
	detuneCents: 0,
	phaseOffset: 0,
	osc2Semitone: 0,
	pulseWidth: 50,
	subOscGain: 0,
	noiseGain: 0,
	noiseRetrig: 1,
	noiseRetrigGap: 12,
	blendMode: 'layer',
	morphAmount: 0,
	glideTime: 0,
	xfade: 0.5,
	filterType: 'lowpass',
	cutoff: 12000,
	resonance: 0.2,
	envFilterMod: 0,
	keyTracking: 0,
	attack: 0.005,
	decay: 0.15,
	sustain: 0.7,
	release: 0.1,
	ampAttack: 0.005,
	ampDecay: 0.15,
	ampSustain: 0.7,
	ampRelease: 0.1,
	filterAttack: 0.005,
	filterDecay: 0.15,
	filterSustain: 0.3,
	filterRelease: 0.1,
	filterEnvAmount: 0,
	pitchAttack: 0.001,
	pitchDecay: 0.03,
	pitchEnvAmount: 0,
	lfoWaveform: 'sine',
	lfoRate: 5,
	lfoPitchAmt: 0,
	lfoCutoffAmt: 0,
	lfoPanAmt: 0,
	lfoAmpAmt: 0,
	lfoFadeTime: 0,
	eqOn: false,
	eqGains: [0, 0, 0, 0, 0, 0],
	airGain: 0
};

function synth(extra: Partial<TrackData>): Partial<TrackData> {
	const p = { ...BASE, ...extra };
	// keep the legacy aliases in step
	p.attack = p.ampAttack;
	p.decay = p.ampDecay;
	p.sustain = p.ampSustain;
	p.release = p.ampRelease;
	return p;
}

/**
 * An acoustic patch with a topology of its own.
 *
 * Every AC preset is a graph rather than a chain, because an instrument's
 * character usually comes from two things happening at once -- a piano's
 * detuned string pair, a marimba's resonator tube under the bar, a flute's
 * breath heard beside the note. A straight line of modules cannot express any
 * of those; branches into a MIX, a modulated pan, or a resonator fed in
 * parallel can.
 *
 * Nodes are given as [id, type, params], cables as 'a>b' or 'a>b:port', and
 * ENTRY and OUTPUT are added around them -- every patch has both, and writing
 * them out 9 times invites the one typo that drops an end. A node with no
 * incoming cable is left for the engine to feed from the voice, which is how a
 * source with no inlet gets struck.
 */
/**
 * The last five composites, written out as the primitives they always were.
 *
 * None of these is irreducible, which is why none came back to the catalogue:
 *
 *   EQ    three biquads in series, and FILTER carries all three of its types
 *   DRIVE a waveshaper into a lowpass -- SHAPE and FILTER
 *   LFO   an oscillator into a gain, crossing to control -- OSC, TO-CV, GAIN
 *   BOW   a sawtooth and filtered noise summed, then a tone filter
 *   REED  a waveshaper and a trim gain
 *
 * The arithmetic is the old engine's, kept so the instruments sound as they
 * were voiced. Where a composite's curve has no equivalent among SHAPE's three
 * -- REED's asymmetric clip, DRIVE's biased tanh -- the nearest shape is used
 * and the difference is stated on the node rather than hidden: a reed that
 * clips slightly differently is still a reed, and the alternative is a card
 * that cannot be taken apart.
 */
function expandComposites(
	nodes: [string, string, Record<string, number>?][],
	cables: string[]
): { nodes: [string, string, Record<string, number>?][]; cables: string[] } {
	const COMPOSITE = new Set(['drive', 'lfo', 'reed']);
	if (!nodes.some(([, type]) => COMPOSITE.has(type))) return { nodes, cables };
	const out: [string, string, Record<string, number>?][] = [];
	const extra: string[] = [];
	/* What a cable leaving this id should leave from instead. The input keeps
	   the original name so cables already written into it still land. */
	const exit = new Map<string, string>();
	for (const [id, type, q] of nodes) {
		const p = q ?? {};
		switch (type) {
			case 'drive': {
				/* SOFT is SHAPE's tanh, which is DRIVE's curve without the bias
				   term. The bias made the harmonics even-order -- warmth rather
				   than fuzz -- and SHAPE has no bias, so that colour is the one
				   thing this expansion does not reproduce. */
				out.push(
					[id, 'shape', { shapeKind: 0, shapeDrive: p.driveAmt ?? 25 }],
					[`${id}_t`, 'filter', { type: 0, cutoff: p.driveTone ?? 9000, q: 0.7 }]
				);
				extra.push(`${id}>${id}_t`);
				exit.set(id, `${id}_t`);
				break;
			}
			case 'lfo': {
				/* An oscillator, crossed to control and scaled. TO-CV is the door;
				   the GAIN is AMT. There is no LFO card for exactly this reason --
				   it would be OSC's wave list and FREQ knob written twice. */
				out.push(
					/* RATE is a socket on OSC, not a knob, so it arrives as a CONST
					   rather than a param -- an oscillator holds its own frequency
					   only when something says what it is. */
					[`${id}_r`, 'const', { kind: 7, value: p.lfoRate ?? 5 }],
					[id, 'osc', { wave: p.lfoWave ?? 0 }],
					[`${id}_c`, 'tocv'],
					/* AMT scales the value *after* the crossing, so it is arithmetic
					   on a control rather than a gain on a signal -- MUL against a
					   constant. A GAIN here would be an audio module fed a value,
					   which the role lattice refuses and should. */
					[`${id}_k`, 'const', { kind: 6, value: (p.lfoAmt ?? 50) / 100 }],
					[`${id}_a`, 'mul']
				);
				extra.push(
					`${id}_r>${id}:pitch`,
					`${id}>${id}_c`,
					`${id}_c>${id}_a:a`,
					`${id}_k>${id}_a:b`
				);
				exit.set(id, `${id}_a`);
				break;
			}
			case 'reed': {
				/* The reed beating against the mouthpiece: a hard clip whose
				   threshold is the stiffness, trimmed so a stiffer reed is not
				   louder. HARD is SHAPE's nearest curve -- the old one was
				   asymmetric, biased open, which SHAPE cannot say. */
				const stiff = (p.reedStiff ?? 50) / 100;
				out.push(
					[id, 'shape', { shapeKind: 1, shapeDrive: 40 + stiff * 55 }],
					[`${id}_g`, 'gain', { level: 1 / (1 + stiff) }]
				);
				extra.push(`${id}>${id}_g`);
				exit.set(id, `${id}_g`);
				break;
			}
			default:
				out.push([id, type, q]);
		}
	}
	const moved = cables.map((c) => {
		const [lhs, rest] = c.split('>');
		const from = lhs.split('.')[0];
		const swapped = exit.get(from);
		/* The source port name is dropped, not carried across. LFO published its
		   value from an outlet it named `cv`, and every one of these expansions
		   ends on a module whose single outlet is `out` -- so keeping the old
		   name would address a port that does not exist on the node that
		   replaced it. */
		return swapped ? `${swapped}>${rest}` : c;
	});
	return { nodes: out, cables: [...moved, ...extra] };
}

/**
 * MIX, written out as the two gains and the sum it always was.
 *
 * A rename to SUM was not enough: MIX carried a level per leg, and SUM is a
 * bare adder because every audio inlet already sums. Dropping the levels made
 * four presets set `mixA`/`mixB` on a module that declares neither -- numbers a
 * module does not declare are silently absent, so the balance each instrument
 * was voiced with was simply gone.
 *
 * `<id>` keeps the original name and becomes the A leg's gain, so a cable
 * already written into it still lands; `<id>_b` is the B leg, `<id>_o` the sum.
 * Cables written `x>mx:b` are rewritten to the B gain, which is also why the
 * `:b` port suffix disappears -- SUM has one inlet, and two cables into it is
 * how addition is said here.
 */
function expandMix(
	nodes: [string, string, Record<string, number>?][],
	cables: string[]
): { nodes: [string, string, Record<string, number>?][]; cables: string[] } {
	if (!nodes.some(([, type]) => type === 'mix')) return { nodes, cables };
	const out: [string, string, Record<string, number>?][] = [];
	const extra: string[] = [];
	const mixed = new Set<string>();
	for (const [id, type, params] of nodes) {
		if (type !== 'mix') {
			out.push([id, type, params]);
			continue;
		}
		out.push(
			[id, 'gain', { level: (params?.mixA ?? 100) / 100 }],
			[`${id}_b`, 'gain', { level: (params?.mixB ?? 100) / 100 }],
			[`${id}_o`, 'sum']
		);
		extra.push(`${id}>${id}_o`, `${id}_b>${id}_o`);
		mixed.add(id);
	}
	const moved = cables.map((c) => {
		const [lhs, rest] = c.split('>');
		const from = lhs.split('.')[0];
		const to = rest.split(':')[0];
		const port = rest.split(':')[1];
		const src = mixed.has(from) ? `${from}_o` : lhs;
		const dst = mixed.has(to) ? (port === 'b' ? `${to}_b` : to) : rest;
		return `${src}>${dst}`;
	});
	return { nodes: out, cables: [...moved, ...extra] };
}

/**
 * BODY, written out as the primitives it always was.
 *
 * A soundboard is not irreducible: the old module was two `peaking` biquads in
 * parallel with a dry path, and FILTER carries `peaking` with a Q and a dB
 * gain, while SUM and GAIN do the mixing. It came out of the catalogue for
 * exactly that reason -- "a composite that could not be taken apart, because
 * each carried its own welded envelope, its own welded crossfade, its own
 * welded filter".
 *
 * Expanded here rather than in ten preset literals. The arithmetic is the old
 * engine's, kept verbatim so the instruments sound as they were voiced:
 *
 *   f1 = 400 - size * 310   (a big body resonates low: 400 Hz down to 90)
 *   f2 = f1 * 2.7           (the second formant)
 *   gain = depth * 14 dB    (how far each peak lifts)
 *   dry = 1 - mix, wet = mix / 2 per peak
 *
 * Doing it in one function rather than ten is the same argument the VCA and MIX
 * migration table makes: one place to be wrong, and each preset stays readable
 * as the instrument it describes rather than as five nodes of plumbing.
 */
function expandBody(
	nodes: [string, string, Record<string, number>?][],
	cables: string[]
): { nodes: [string, string, Record<string, number>?][]; cables: string[] } {
	if (!nodes.some(([, type]) => type === 'body')) return { nodes, cables };
	const out: [string, string, Record<string, number>?][] = [];
	const extra: string[] = [];
	const rewritten = new Set<string>();
	for (const [id, type, params] of nodes) {
		if (type !== 'body') {
			out.push([id, type, params]);
			continue;
		}
		const size = (params?.bodySize ?? 50) / 100;
		const depth = (params?.bodyDepth ?? 45) / 100;
		const mix = (params?.bodyMix ?? 60) / 100;
		const f1 = Math.max(40, 400 - size * 310);
		const f2 = Math.max(40, f1 * 2.7);
		const dB = depth * 14;
		/* `<id>` keeps the original name so every cable already written to the
		   BODY still lands: it becomes the input fan-out, and `<id>_o` the sum
		   everything leaves by. Cables out of the module are rewritten below. */
		out.push(
			[id, 'sum'],
			[`${id}_d`, 'gain', { level: 1 - mix }],
			// type 6 is `peaking`. Q is the old engine's, per peak.
			[`${id}_p1`, 'filter', { type: 6, cutoff: f1, q: 1.4, filterGain: dB }],
			[`${id}_p2`, 'filter', { type: 6, cutoff: f2, q: 2.2, filterGain: dB }],
			[`${id}_g1`, 'gain', { level: mix / 2 }],
			[`${id}_g2`, 'gain', { level: mix / 2 }],
			[`${id}_o`, 'sum']
		);
		extra.push(
			`${id}>${id}_d`,
			`${id}_d>${id}_o`,
			`${id}>${id}_p1`,
			`${id}>${id}_p2`,
			`${id}_p1>${id}_g1`,
			`${id}_p2>${id}_g2`,
			`${id}_g1>${id}_o`,
			`${id}_g2>${id}_o`
		);
		rewritten.add(id);
	}
	/* A cable *out of* a BODY now leaves its output sum instead. One written
	   `bod>out` becomes `bod_o>out`; one written *into* it is untouched, which
	   is why the input keeps the original id. */
	const moved = cables.map((c) => {
		const [lhs, rest] = c.split('>');
		const from = lhs.split('.')[0];
		return rewritten.has(from) ? `${from}_o>${rest}` : c;
	});
	return { nodes: out, cables: [...moved, ...extra] };
}

/** What each composite is called on its card: four characters, like every label. */
const COMPOSITE_NAMES: Record<string, string> = {
	body: 'BODY',
	mix: 'MIX',
	drive: 'DRV',
	lfo: 'LFO',
	reed: 'REED'
};

/** Composites whose output is a value rather than sound. */
const VALUE_COMPOSITES = new Set(['lfo']);

/**
 * Every composite in a preset as a macro: one card on the canvas, its
 * primitives inside.
 *
 * The expanders above wrote BODY, MIX and the rest out as loose primitives,
 * which was right for the engine and wrong for anyone opening the patch --
 * KOTO drew as twenty cards where it is five things. A macro is the shape
 * those always were: a named piece with sockets, built from primitives that
 * are still there to see with a double-click.
 *
 * Each composite's definition comes from running the very same expander on
 * that composite alone, between terminals named for the ports its cables
 * use, so the arithmetic -- and the sound -- is what it was to the bit. One
 * definition per instance: each carries its own voicing baked into its knobs,
 * and a preset is a sound, not a library.
 */
function wrapComposites(
	nodes: [string, string, Record<string, number>?][],
	cables: string[]
): {
	nodes: [string, string, Record<string, number>?][];
	cables: string[];
	macros: Record<string, MacroDef>;
	instances: Map<string, string>;
} {
	const macros: Record<string, MacroDef> = {};
	const instances = new Map<string, string>();
	const parse = (c: string) => {
		const [lhs, rest] = c.split('>');
		const [from, fromPort] = lhs.split('.');
		const [to, toPort] = rest.split(':');
		return { from, fromPort, to, toPort };
	};
	const composites = nodes.filter(([, type]) => COMPOSITE_NAMES[type]);
	for (const [id, type, params] of composites) {
		// Inlets: one terminal per port a cable lands on. Outlet: one, named OUT.
		const ports = [
			...new Set(
				cables
					.map(parse)
					.filter((c) => c.to === id)
					.map((c) => c.toPort || 'in')
			)
		];
		const isValue = VALUE_COMPOSITES.has(type);
		let inner: [string, string, Record<string, number>?][] = [
			/* Every inlet is sound but PITCH -- BOW's, which lands on the OSC inside
			   and is a control, so only a CV terminal carries it. */
			...ports.map((q) => [`i_${q}`, q === 'pitch' ? 'nodecv' : 'nodept'] as [string, string]),
			[id, type, params],
			['o', isValue ? 'nodecv' : 'nodept']
		];
		let innerCables = [
			...ports.map((q) => `i_${q}>${id}${q === 'in' ? '' : `:${q}`}`),
			`${id}>o${isValue ? ':a' : ''}`
		];
		({ nodes: inner, cables: innerCables } = expandBody(inner, innerCables));
		({ nodes: inner, cables: innerCables } = expandMix(inner, innerCables));
		({ nodes: inner, cables: innerCables } = expandComposites(inner, innerCables));
		const def = graphOfTuples(inner, innerCables);
		const defId = `${type}-${id}`;
		macros[defId] = {
			name: COMPOSITE_NAMES[type],
			nodes: def.nodes,
			cables: def.cables,
			params: def.params,
			...(Object.keys(def.waves).length ? { waves: def.waves } : {}),
			labels: {
				...Object.fromEntries(ports.map((q) => [`i_${q}`, q.toUpperCase()])),
				o: isValue ? 'CV' : 'OUT'
			}
		};
		instances.set(id, defId);
	}
	if (!instances.size) return { nodes, cables, macros, instances };
	// The outer patch: each composite is its instance, cables on its sockets.
	const outerNodes = nodes.map(
		([id, type, params]) =>
			(instances.has(id) ? [id, 'macro'] : [id, type, params]) as [
				string,
				string,
				Record<string, number>?
			]
	);
	const outerCables = cables.map((c) => {
		const { from, fromPort, to, toPort } = parse(c);
		const src = instances.has(from) ? `${from}.o` : fromPort ? `${from}.${fromPort}` : from;
		const dst = instances.has(to) ? `${to}:i_${toPort || 'in'}` : toPort ? `${to}:${toPort}` : to;
		return `${src}>${dst}`;
	});
	return { nodes: outerNodes, cables: outerCables, macros, instances };
}

/**
 * Nodes and cables in the preset shorthand as a laid-out graph with its knobs.
 *
 * Each node sits one column right of the furthest node feeding it, so a cable
 * runs left to right; peers in a column stack about the middle. Shared by a
 * preset's own patch and by the macro definitions inside it.
 */
function graphOfTuples(
	nodes: [string, string, Record<string, number>?][],
	cables: string[],
	fixed: Record<string, { x: number; y: number }> = {}
): {
	nodes: GraphNode[];
	cables: GraphCable[];
	params: Record<string, number>;
	waves: Record<string, string>;
	lastCol: number;
} {
	const COL = 300;
	const ROW = 124;
	const feeders = new Map<string, string[]>();
	for (const c of cables) {
		const [lhs, rest] = c.split('>');
		const from = lhs.split('.')[0];
		const to = rest.split(':')[0];
		feeders.set(to, [...(feeders.get(to) ?? []), from]);
	}
	const col = new Map<string, number>([[ENTRY_ID, 0]]);
	const depth = (id: string, seen = new Set<string>()): number => {
		if (col.has(id)) return col.get(id)!;
		if (seen.has(id)) return 1;
		seen.add(id);
		const ins = feeders.get(id) ?? [];
		const d = ins.length ? Math.max(...ins.map((f) => depth(f, seen))) + 1 : 1;
		col.set(id, d);
		return d;
	};
	for (const [id] of nodes) depth(id);
	const inColumn = new Map<number, string[]>();
	for (const [id] of nodes) {
		const c = col.get(id) ?? 1;
		inColumn.set(c, [...(inColumn.get(c) ?? []), id]);
	}
	const lastCol = Math.max(1, ...[...inColumn.keys()]);
	const posOf = (id: string) => {
		if (fixed[id]) return fixed[id];
		const c = col.get(id) ?? 1;
		const peers = inColumn.get(c) ?? [id];
		const row = peers.indexOf(id);
		return { x: 48 + c * COL, y: 168 + (row - (peers.length - 1) / 2) * ROW };
	};
	const params: Record<string, number> = {};
	const waves: Record<string, string> = {};
	for (const [id, type, q] of nodes) {
		for (const [k, v] of Object.entries(q ?? {})) {
			/* An OSC's shape is a name in `graphWaves`, not a number in the
			   params: a `wave` written as a knob was never read, and every
			   oscillator in these patches played a sine -- BOW's sawtooth
			   included. 0 sine, 1 square, 2 sawtooth, 3 triangle. */
			if (type === 'osc' && k === 'wave') {
				waves[`${id}.wave`] = OSC_WAVE_NAMES[v] ?? 'sine';
				continue;
			}
			const moved = MIGRATED_PARAMS[`${type}.${k}`];
			if (moved) params[`${id}.${moved[0]}`] = moved[1](v);
			else params[`${id}.${k}`] = v;
		}
	}
	return {
		nodes: nodes.map(([id, type]) => ({ id, type: MIGRATED[type] ?? type, ...posOf(id) })),
		cables: cables.map((c) => {
			const [lhs, rest] = c.split('>');
			const [from, fromPort] = lhs.split('.');
			const [to, toPort] = rest.split(':');
			return { from, fromPort: fromPort || 'out', to, toPort: toPort || 'in' };
		}),
		params,
		waves,
		lastCol
	};
}

/* The players of a bowed section: id, vibrato rate (Hz), tuning (+8, -4 and
   +8 cents about the first) and seat. */
const SECTION: [number, number, number, number][] = [
	[1, 5.2, 1, -0.6],
	[2, 5.7, 1.0047, 0.6],
	[3, 6.1, 0.9977, -0.2],
	[4, 5.5, 1.00463, 0.2]
];

/* The drawbars, as tuned by ear against Hammond recordings: 16' 8' 5 1/3'
   and 2 2/3' (roughly 86 7 0 2 4 on the bars; the 4' came out at nothing).
   id, footage as a multiple of the key (16' is half), level. */
const DRAWBARS: [string, number, number][] = [
	['16', 0.5, 0.65],
	['8', 1, 0.57],
	['5', 1.5, 0.17],
	['3', 3, 0.33]
];

/* A section plucking together, which it never quite does: id, tuning
   (cents apart), how late the pluck lands (s), seat. */
const PIZZ_PLAYERS: [number, number, number, number][] = [
	[1, 1, 0, -0.5],
	[2, 1.0029, 0.012, 0.5],
	[3, 0.9977, 0.023, -0.15],
	[4, 1.0012, 0.031, 0.2]
];

const OSC_WAVE_NAMES = ['sine', 'square', 'sawtooth', 'triangle'];

function patch(
	nodes: [string, string, Record<string, number>?][],
	cables: string[],
	/* Output trim, so the set is level.
	
	   These patches differ in how much of the signal survives to the end: a
	   struck string with a parallel pair behind it arrives far hotter than a
	   bowed one through a reverb, and measured across the nine the spread was
	   14 dB. That is loud enough that auditioning patches means riding the
	   volume, which is not a judgement about the sound but a defect. Trimmed
	   here rather than by re-voicing, since the voicing is the instrument. */
	outLevel = 100
): Partial<TrackData> {
	/* Laid out along the signal path rather than wrapped into rows.
	
	   Each node sits one column right of the furthest node feeding it, so a
	   cable always runs left to right and a branch (a hammer into two strings,
	   both into a MIX) reads as a fork that rejoins. Wrapping by index instead
	   put a late node above an early one and drew its cable backwards across
	   the canvas, which is unreadable however correct the audio is. */
	/* Wide enough for the cards as they actually draw.
	
	   A card is its controls plus the gutters its port labels need, so it is no
	   longer a flat 176: a module with a four-character label on both sides is
	   half again as wide. At 200 apart those overlapped their neighbours. */
	const wrapped = wrapComposites(nodes, cables);
	/* The trim is a VCA in front of OUT, not a knob on it.
	
	   OUT sends the patch to the master and does nothing else, so the one place
	   a patch's own level belongs is a gain stage on the canvas -- where it can
	   be seen, moved, and driven by a cable like any other. */
	const TRIM_ID = 'trim';
	/* The trim is injected, so a preset that also names a node `trim` would end
	   up with two -- and a duplicate id makes the topological sort fail, which
	   silences the whole patch rather than pointing at the clash. Caught here,
	   where the name is chosen, rather than left to be heard. */
	if (nodes.some(([id]) => id === TRIM_ID)) {
		throw new Error(`preset node id "${TRIM_ID}" collides with the injected trim`);
	}
	/* Anything a patch sends to OUT goes through the trim on its way, which is
	   what makes the gain stage part of the signal path rather than a setting
	   hidden on the endpoint. */
	const toTrim = wrapped.cables.map((c) => {
		const [lhs, rest] = c.split('>');
		const [to, port] = rest.split(':');
		return to === OUTPUT_ID ? `${lhs}>${TRIM_ID}${port ? `:${port}` : ''}` : c;
	});
	const laid = graphOfTuples(wrapped.nodes, toTrim);
	const graphNodes: GraphNode[] = [
		{ id: ENTRY_ID, type: 'in', x: 48, y: 168 },
		...laid.nodes.map((n) =>
			wrapped.instances.has(n.id) ? { ...n, macro: wrapped.instances.get(n.id) } : n
		),
		{ id: TRIM_ID, type: 'gain', x: 48 + (laid.lastCol + 1) * 300, y: 168 },
		{ id: OUTPUT_ID, type: 'out', x: 48 + (laid.lastCol + 2) * 300, y: 168 }
	];
	/* The trim, in GAIN's units.
	
	   `outLevel` is a percentage because the old VCA's was, and GAIN's LVL is a
	   plain multiplier -- so the number carries across divided rather than
	   renamed. Copying it straight over would have made every one of these
	   patches a hundred times too loud, which is the kind of migration that
	   passes a type check and fails an ear. */
	const graphParams: Record<string, number> = {
		[`${TRIM_ID}.level`]: outLevel / 100,
		...laid.params
	};
	const graphCables: GraphCable[] = [
		...laid.cables,
		{ from: TRIM_ID, fromPort: 'out', to: OUTPUT_ID, toPort: 'in' },
		// OUT runs when the note does; without this the patch builds and stays mute.
		{ from: ENTRY_ID, fromPort: 'then', to: OUTPUT_ID, toPort: 'exec' }
	];
	/* Emitted only if every type in it exists.

	   These patches predate the rebuild, and each is wired out of some modules
	   the catalogue no longer carries. A node whose type is unknown builds
	   nothing, and a cable through it is a broken chain rather than a missing
	   trim -- measured, an OSC through an unknown node renders exact silence
	   where the same chain through GAIN reads 0.1203. So emitting a graph with
	   one in it ships a preset that loads, draws, and plays nothing, which is
	   worse than not offering it: the patch looks intact.

	   This used to be an unconditional `return {}` with the reason in a comment.
	   That was right about the risk and wrong about the mechanism: it held back
	   the ones that were already fine along with the ones that were not, and
	   nothing anywhere said when it could come off. A migration would have had
	   to be finished by someone remembering this comment existed.

	   Asking the catalogue instead means each preset is emitted the moment its
	   last missing primitive lands, one at a time and without anyone editing
	   this function. `missingTypes` is what the build test reports, so a module
	   deleted tomorrow names the presets it breaks rather than silently
	   emptying them. */
	const missing = missingTypes([
		...graphNodes.filter((n) => n.type !== 'macro'),
		...Object.values(wrapped.macros).flatMap((d) => d.nodes)
	]);
	if (missing.length) {
		/* Keyed by the patch's own nodes rather than by a name, because `patch`
		   is called from inside a preset literal and does not know which one it
		   is building. The signal path is what identifies it anyway. */
		HELD_BACK.set(
			graphNodes
				.map((n) => n.type)
				.filter((t) => t !== 'in' && t !== 'out')
				.join('>'),
			missing
		);
		return {};
	}
	const macros = Object.keys(wrapped.macros).length ? { macros: wrapped.macros } : {};
	return {
		rackGraph: { nodes: graphNodes, cables: graphCables, ...macros },
		graphParams,
		...(Object.keys(laid.waves).length ? { graphWaves: laid.waves } : {})
	};
}

/**
 * The types a graph names that the catalogue does not carry.
 *
 * ENTRY and OUT are excluded because they are the graph's two ends rather than
 * modules -- `isFixedNode` refuses to delete either and they are in no palette,
 * so they will never be in `MODULE_SPECS`.
 */
function missingTypes(nodes: { type: string }[]): string[] {
	return [...new Set(nodes.map((n) => n.type))]
		.filter((t) => t !== 'in' && t !== 'out' && !MODULE_IDS.has(t))
		.sort();
}

/**
 * Which presets are still waiting on a primitive, and on which.
 *
 * Filled as the presets are built, and read by the test that asserts a held-back
 * preset is held back *for a reason that is still true*. Without it the holding
 * is invisible: a preset that silently emits nothing looks exactly like one that
 * has no graph to emit.
 */
export const HELD_BACK = new Map<string, string[]>();

export const SOUND_PRESETS: SoundPreset[] = [
	/* BASS */
	{
		name: '8-BIT BASS',
		category: 'BASS',
		kind: 'E',
		preset: synth({
			presetGain: 1.22,
			osc1Waveform: 'square',
			osc2Waveform: 'triangle',
			cutoff: 1200,
			resonance: 4.2,
			ampAttack: 0.003,
			ampDecay: 0.12,
			ampSustain: 0.45,
			ampRelease: 0.08,
			filterAttack: 0.005,
			filterDecay: 0.15,
			filterSustain: 0.3,
			filterRelease: 0.08,
			filterEnvAmount: 0.6
		})
	},
	{
		// One sine and the SUB under it, nothing above 800 Hz: weight, no edge.
		name: 'SUB BASS',
		category: 'BASS',
		kind: 'E',
		preset: synth({
			presetGain: 0.65,
			osc1Waveform: 'sine',
			osc1Gain: 1,
			osc2Gain: 0,
			subOscGain: 0.7,
			cutoff: 800,
			resonance: 0.2,
			ampAttack: 0.005,
			ampDecay: 0.2,
			ampSustain: 0.9,
			ampRelease: 0.15
		})
	},
	{
		// A saw into a high-Q low-pass that the envelope sweeps, with glide: the 303 recipe.
		name: 'ACID BASS',
		category: 'BASS',
		kind: 'E',
		preset: synth({
			presetGain: 1.4,
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			glideTime: 60,
			cutoff: 400,
			resonance: 8,
			filterEnvAmount: 0.7,
			filterAttack: 0.003,
			filterDecay: 0.2,
			filterSustain: 0,
			filterRelease: 0.1,
			ampAttack: 0.003,
			ampDecay: 0.25,
			ampSustain: 0.6,
			ampRelease: 0.12
		})
	},
	{
		// Sine modulated by a sine an octave up; the envelope on the filter stands in for an FM index envelope.
		name: 'FM BASS',
		category: 'BASS',
		kind: 'E',
		preset: synth({
			presetGain: 1.04,
			osc1Waveform: 'sine',
			osc1Gain: 1,
			osc2Waveform: 'sine',
			osc2Gain: 0.8,
			osc2Ratio: 2,
			blendMode: 'fm',
			morphAmount: 0.5,
			cutoff: 3000,
			resonance: 0.5,
			filterEnvAmount: 0.4,
			filterDecay: 0.25,
			filterSustain: 0.2,
			ampAttack: 0.003,
			ampDecay: 0.3,
			ampSustain: 0.5,
			ampRelease: 0.15
		})
	},

	/* LEAD */
	{
		// Was osc1Waveform 'pulse', which is not a Web Audio oscillator type:
		// every note threw on osc.type and the preset was silent. A pulse is a
		// square with PW off 50%, which the engine now actually builds.
		name: 'LEAD',
		category: 'LEAD',
		kind: 'E',
		preset: synth({
			presetGain: 1.49,
			osc1Waveform: 'square',
			pulseWidth: 25,
			osc2Waveform: 'sawtooth',
			detuneCents: 8,
			cutoff: 6500,
			resonance: 2.8,
			ampAttack: 0.005,
			ampDecay: 0.2,
			ampSustain: 0.8,
			ampRelease: 0.18,
			filterAttack: 0.005,
			filterDecay: 0.25,
			filterSustain: 0.6,
			filterRelease: 0.12,
			filterEnvAmount: 0.4
		})
	},
	{
		// Two saws 14 cents apart with a delayed vibrato.
		name: 'SAW LEAD',
		category: 'LEAD',
		kind: 'E',
		preset: synth({
			presetGain: 1.46,
			osc1Waveform: 'sawtooth',
			osc1Gain: 0.9,
			osc2Waveform: 'sawtooth',
			osc2Gain: 0.8,
			detuneCents: 14,
			cutoff: 5000,
			resonance: 1,
			ampAttack: 0.01,
			ampDecay: 0.2,
			ampSustain: 0.8,
			ampRelease: 0.2,
			lfoWaveform: 'sine',
			lfoRate: 5.5,
			lfoPitchAmt: 0.1,
			lfoFadeTime: 300
		})
	},
	{
		// SYNC mode with the second oscillator at a fifth; the filter envelope gives it the rip.
		name: 'SYNC LEAD',
		category: 'LEAD',
		kind: 'E',
		preset: synth({
			presetGain: 1.21,
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Waveform: 'square',
			osc2Gain: 0.9,
			osc2Ratio: 1.5,
			blendMode: 'sync',
			morphAmount: 0.7,
			cutoff: 7000,
			resonance: 2,
			filterEnvAmount: 0.5,
			filterDecay: 0.3,
			filterSustain: 0.3,
			ampAttack: 0.005,
			ampDecay: 0.3,
			ampSustain: 0.7,
			ampRelease: 0.2
		})
	},
	{
		// A 15% pulse, no filter, a fast vibrato: the NES lead voice.
		name: 'CHIP LEAD',
		category: 'LEAD',
		kind: 'E',
		preset: synth({
			presetGain: 1.94,
			osc1Waveform: 'square',
			osc1Gain: 1,
			pulseWidth: 15,
			osc2Gain: 0,
			cutoff: 12000,
			resonance: 0.2,
			ampAttack: 0,
			ampDecay: 0.1,
			ampSustain: 0.8,
			ampRelease: 0.05,
			lfoWaveform: 'triangle',
			lfoRate: 6,
			lfoPitchAmt: 0.08,
			lfoFadeTime: 150
		})
	},
	{
		name: 'BRASS',
		category: 'LEAD',
		kind: 'E',
		preset: synth({
			presetGain: 1.52,
			osc1Waveform: 'sawtooth',
			osc2Waveform: 'sawtooth',
			detuneCents: 12,
			cutoff: 2400,
			resonance: 2.0,
			ampAttack: 0.04,
			ampDecay: 0.25,
			ampSustain: 0.8,
			ampRelease: 0.2,
			filterAttack: 0.06,
			filterDecay: 0.2,
			filterSustain: 0.5,
			filterRelease: 0.15,
			filterEnvAmount: 0.55
		})
	},

	/* PLUCK */
	{
		name: 'PLUCK',
		category: 'PLUCK',
		kind: 'E',
		preset: synth({
			presetGain: 0.78,
			osc1Waveform: 'square',
			osc2Waveform: 'sawtooth',
			cutoff: 1800,
			resonance: 3.5,
			ampAttack: 0.003,
			ampDecay: 0.35,
			ampSustain: 0.7,
			ampRelease: 0.2,
			filterAttack: 0.003,
			filterDecay: 0.08,
			filterSustain: 0.0,
			filterRelease: 0.06,
			filterEnvAmount: 0.85
		})
	},
	{
		// Triangle with a sine an octave up, a filter that snaps shut, no sustain: a plucked string.
		name: 'KOTO',
		category: 'PLUCK',
		kind: 'AC',
		preset: synth({
			presetGain: 1.16,
			osc1Waveform: 'triangle',
			osc1Gain: 1,
			osc2Waveform: 'sine',
			osc2Gain: 0.4,
			osc2Ratio: 2,
			cutoff: 4000,
			resonance: 1,
			keyTracking: 0.5,
			filterEnvAmount: 0.6,
			filterAttack: 0,
			filterDecay: 0.08,
			filterSustain: 0,
			ampAttack: 0.002,
			ampDecay: 0.4,
			ampSustain: 0,
			ampRelease: 0.3,
			/* Pluck -> string -> the bridge -> the paulownia box. The comb is the
			   koto's signature: a short delay at the bridge gives the nasal buzz
			   that a plain string-into-body cannot make. */
			...patch(
				[
					['pk', 'excite', { hardness: 72, exLength: 3, exTone: 5200 }],
					['ex', 'sum'],
					['str', 'string', { decayTime: 1.8, damping: 26, stiffness: 55 }],
					/* The bridge, as the comb it always was: a short delay fed back on
					   itself. COMB was one card with a position and a depth; this is
					   the same thing said in primitives, and the amount going round
					   is a GAIN the patch can see. 1.7 ms is the 14% position on a
					   12 ms scale, which is what COMBPOS meant. */
					['bsum', 'sum'],
					['bdly', 'delay', { delayTime: 0.0017 }],
					['bsnd', 'fbsend', { bus: 0 }],
					['brtn', 'fbrtn', { bus: 0 }],
					['bfb', 'gain', { level: 0.45 }],
					['bod', 'body', { bodySize: 40, bodyDepth: 45, bodyMix: 50 }]
				],
				[
					'pk>ex',
					'ex>str',
					'str>bsum',
					'bsum>bdly',
					'bdly>bsnd',
					'brtn>bfb',
					'bfb>bsum',
					'bdly>bod',
					'bod>output'
				],
				33
			)
		})
	},
	{
		// Sine body and a quieter triangle an octave up, decaying together.
		name: 'MARIMBA',
		category: 'MALLET',
		kind: 'AC',
		preset: synth({
			presetGain: 0.81,
			osc1Waveform: 'sine',
			osc1Gain: 1,
			osc2Waveform: 'triangle',
			osc2Gain: 0.6,
			osc2Ratio: 2,
			cutoff: 8000,
			resonance: 0.3,
			ampAttack: 0,
			ampDecay: 0.35,
			ampSustain: 0,
			ampRelease: 0.25,
			/* A rosewood bar is struck, and a tuned tube hangs under it. The bar's
			   modes (1 : 3.9 : 9.2 -- the arch cut into its underside) and the
			   tube run in parallel into a MIX, because the tube resonates the
			   fundamental rather than colouring everything the bar does. */
			...patch(
				[
					['mal', 'excite', { hardness: 30, exLength: 11, exTone: 2200 }],
					['ex', 'sum'],
					/* R3 was 9.2, which the old composite allowed and MODES does not --
					   its ratios stop at 8. Clamped to the top of the range rather
					   than re-voiced: 8 is still an inharmonic partial well clear of
					   the 3.9 below it, which is what a struck bar wants. */
					['bar', 'modes', { mode1: 1, mode2: 3.9, mode3: 8, modeQ: 22 }],
					['tub', 'tube', { tubeDecay: 0.5, tubeDamp: 55, tubeOdd: 1 }],
					['mx', 'mix', { mixA: 100, mixB: 38 }],
					['bod', 'body', { bodySize: 45, bodyDepth: 50, bodyMix: 40 }]
				],
				['mal>ex', 'ex>bar', 'bar>mx', 'ex>tub', 'tub>mx:b', 'mx>bod', 'bod>output'],
				26
			)
		})
	},
	{
		// Two sines ring-modulated at a 3.5 ratio: inharmonic partials, long tail, air.
		name: 'BELL',
		category: 'MALLET',
		kind: 'E',
		preset: synth({
			presetGain: 1.22,
			osc1Waveform: 'sine',
			osc1Gain: 1,
			osc2Waveform: 'sine',
			osc2Gain: 1,
			osc2Ratio: 3.5,
			blendMode: 'ring',
			cutoff: 12000,
			resonance: 0.2,
			ampAttack: 0.002,
			ampDecay: 0.8,
			ampSustain: 0.2,
			ampRelease: 1.2,
			airGain: 0.3
		})
	},

	/* KEYS */
	{
		// Sine carrier, sine modulator four octaves up at a light index: the tine.
		name: 'E-PIANO',
		category: 'KEYBOARD',
		kind: 'E',
		preset: synth({
			presetGain: 0.68,
			osc1Waveform: 'sine',
			osc1Gain: 1,
			osc2Waveform: 'sine',
			osc2Gain: 0.5,
			osc2Ratio: 4,
			blendMode: 'fm',
			morphAmount: 0.2,
			cutoff: 6000,
			resonance: 0.3,
			filterEnvAmount: 0.3,
			filterDecay: 0.4,
			filterSustain: 0.2,
			ampAttack: 0.002,
			ampDecay: 0.6,
			ampSustain: 0.35,
			ampRelease: 0.3
		})
	},
	{
		// Drawbars: fundamental, octave, and the SUB below; no envelope to speak of; a slow tremolo.
		name: 'ORGAN',
		category: 'ORGAN',
		kind: 'E',
		preset: synth({
			presetGain: 0.6,
			osc1Waveform: 'sine',
			osc1Gain: 0.8,
			osc2Waveform: 'sine',
			osc2Gain: 0.5,
			osc2Ratio: 2,
			subOscGain: 0.5,
			cutoff: 12000,
			resonance: 0.2,
			ampAttack: 0.005,
			ampDecay: 0.05,
			ampSustain: 1,
			ampRelease: 0.05,
			lfoWaveform: 'sine',
			lfoRate: 6,
			lfoAmpAmt: 0.15
		})
	},
	{
		/* A tonewheel organ through a rotating speaker, which is what the
		   sound is: four drawbars (DRAWBARS), the third harmonic's percussion
		   ringing out over the first tenth of a second, the key contacts'
		   click, and the Leslie -- a horn above 800 Hz and a drum below, each
		   spinning (6.7 and 5.9 Hz) so the sound swings in level and pitch and
		   across the room.

		   The four sines this replaces were heard as a dial tone; everything
		   a listener knows a Hammond by -- the click, the percussion, the
		   rotor -- was missing. Tuned by ear (tools/ear) on held chords under
		   a melody: Hammond organ 0.75, where Hammond recordings read 0.8. */
		name: 'DRAWBAR ORGAN',
		category: 'ORGAN',
		kind: 'AC',
		preset: synth({
			presetGain: 0.73,
			osc1Gain: 0,
			osc2Gain: 0,
			subOscGain: 0,
			noiseGain: 0,
			ampAttack: 0.006,
			ampDecay: 0.04,
			ampSustain: 1,
			ampRelease: 0.08,
			...patch(
				[
					['pf', 'tofreq'],
					...DRAWBARS.flatMap(
						([id, ratio, level]) =>
							[
								[`r${id}`, 'const', { kind: 6, value: ratio }],
								[`x${id}`, 'mul'],
								[`w${id}`, 'osc', { wave: 0 }],
								[`g${id}`, 'gain', { level }]
							] as [string, string, Record<string, number>?][]
					),
					['bars', 'sum'],
					// Percussion: the third harmonic, struck and let go in a quarter second.
					['rp', 'const', { kind: 6, value: 3 }],
					['xp', 'mul'],
					['wp', 'osc', { wave: 0 }],
					['pe', 'env', { envA: 0.001, envD: 0.11, envS: 0, envR: 0.05, envCurve: 1 }],
					['pv', 'vca', { gain: 100 }],
					['pg', 'gain', { level: 0.65 }],
					// The key contacts closing: a few milliseconds of bright noise.
					['ck', 'noise'],
					['ce', 'env', { envA: 0.0005, envD: 0.006, envS: 0, envR: 0.004, envCurve: 1 }],
					['cv', 'vca', { gain: 100 }],
					['cf', 'filter', { type: 2, cutoff: 2500, q: 0.7 }],
					['cg', 'gain', { level: 0.08 }],
					['tone', 'sum'],
					['ke', 'env', { envA: 0.004, envD: 0.01, envS: 100, envR: 0.03 }],
					['key', 'vca', { gain: 100 }],
					// The Leslie: horn and drum, each a moving delay (pitch) and a moving level.
					['hp', 'filter', { type: 1, cutoff: 800, q: 0.7 }],
					['lp', 'filter', { type: 0, cutoff: 800, q: 0.7 }],
					['hr', 'lfo', { lfoWave: 0, lfoRate: 6.7, lfoAmt: 0.024 }],
					['dr', 'lfo', { lfoWave: 0, lfoRate: 5.9, lfoAmt: 0.08 }],
					['hd', 'delay', { delayTime: 0.001 }],
					['dd', 'delay', { delayTime: 0.0015 }],
					['ha', 'lfo', { lfoWave: 0, lfoRate: 6.7, lfoAmt: 22 }],
					['da', 'lfo', { lfoWave: 0, lfoRate: 5.9, lfoAmt: 9 }],
					['one', 'const', { kind: 6, value: 1 }],
					['hal', 'add'],
					['dal', 'add'],
					['hg', 'gain', { level: 1 }],
					['dg', 'gain', { level: 1 }],
					['hpn', 'pan', { panPos: 0.4 }],
					['dpn', 'pan', { panPos: -0.25 }],
					['les', 'sum'],
					['lvl', 'gain', { level: 0.5 }],
					['cab', 'space', { spaceSize: 22, spaceDecay: 40, spaceMix: 24 }]
				],
				[
					'entry.pitch>pf:a',
					...DRAWBARS.flatMap(([id]) => [
						`pf>x${id}:a`,
						`r${id}>x${id}:b`,
						`x${id}>w${id}:pitch`,
						`w${id}>g${id}`,
						`g${id}>bars`
					]),
					'pf>xp:a',
					'rp>xp:b',
					'xp>wp:pitch',
					'wp>pv',
					'pe>pv:level',
					'pv>pg',
					'ck>cv',
					'ce>cv:level',
					'cv>cf',
					'cf>cg',
					'bars>tone',
					'pg>tone',
					'tone>key',
					'ke>key:level',
					'key>hp',
					'key>lp',
					'cg>hp',
					'cg>lp',
					'hp>hd',
					'lp>dd',
					'hr.cv>hd:delayTime',
					'dr.cv>dd:delayTime',
					'ha.cv>hal:a',
					'one>hal:b',
					'da.cv>dal:a',
					'one>dal:b',
					'hd>hg',
					'hal>hg:level',
					'dd>dg',
					'dal>dg:level',
					'hg>hpn',
					'dg>dpn',
					'hpn>les',
					'dpn>les',
					'les>lvl',
					'lvl>cab',
					'cab>output'
				],
				54
			)
		})
	},
	{
		/* Aluminium bars under a hard mallet: a long, pure fundamental, overtones
		   tuned to two and three octaves that flash at the strike and die, the
		   tick of the mallet, and the motor's tremolo. It had a TUBE as its
		   resonator, which holds while the key is down and has only odd partials
		   -- a sustained hollow tone that read as an organ and a flute, not a
		   struck bar. */
		name: 'VIBRAPHONE',
		category: 'MALLET',
		kind: 'AC',
		preset: synth({
			presetGain: 0.51,
			osc1Gain: 0,
			osc2Gain: 0,
			subOscGain: 0,
			noiseGain: 0,
			ampAttack: 0.001,
			ampDecay: 3.2,
			ampSustain: 0,
			ampRelease: 1.4,
			...patch(
				[
					['mal', 'excite', { hardness: 45, exLength: 3, exTone: 6000 }],
					['ex', 'sum'],
					/* A tuned bar: its overtones are filed to two octaves and a
					   little over three above the note (1 : 3.98 : 9.13), which is
					   what makes it sound pitched where a free bar clangs. */
					['bar', 'modes', { mode1: 1, mode2: 3.98, mode3: 9.13, modeQ: 150, modeMix: 100 }],
					/* The mallet's brightness: the same overtones struck again
					   with a low Q, so they flash and are gone in a third of a
					   second -- harder the blow, more of it. */
					['shn', 'modes', { mode1: 3.98, mode2: 9.13, mode3: 13.4, modeQ: 10, modeMix: 100 }],
					['sv', 'map', { shape: 1, inLo: 0, inHi: 1, outLo: 0.1, outHi: 0.9 }],
					['sg', 'gain', { level: 0 }],
					// The tick of the mallet itself.
					['tk', 'filter', { type: 1, cutoff: 2500, q: 0.7 }],
					['tg', 'gain', { level: 0.12 }],
					['sum', 'sum'],
					/* The motor: fans over the resonator tubes swing the level
					   between 0.65 and 1.35, five times a second. It was the LFO
					   straight into the level, which swung it through zero -- a
					   ring modulator, not a tremolo. */
					['fan', 'lfo', { lfoWave: 0, lfoRate: 5, lfoAmt: 35 }],
					['one', 'const', { kind: 6, value: 1 }],
					['fa', 'add'],
					['trm', 'gain', { level: 1 }],
					// The damper bar, on the key: the bars ring while it is held.
					['dmp', 'env', { envA: 0.001, envD: 0.001, envS: 100, envR: 0.5 }],
					['dv', 'vca', { gain: 100 }],
					['rm', 'space', { spaceSize: 45, spaceDecay: 45, spaceMix: 20 }]
				],
				[
					'mal>ex',
					'ex>bar',
					'ex>shn',
					'entry.vel>sv:a',
					'shn>sg',
					'sv>sg:level',
					'ex>tk',
					'tk>tg',
					'bar>sum',
					'sg>sum',
					'tg>sum',
					'fan.cv>fa:a',
					'one>fa:b',
					'sum>trm',
					'fa>trm:level',
					'trm>dv',
					'dmp>dv:level',
					'dv>rm',
					'rm>output'
				],
				42
			)
		})
	},
	{
		/* Two strings a fifth apart struck as one, the way a hammered dulcimer
		   is strung in courses. RING multiplies them rather than adding, which
		   makes the sum and difference tones a struck metal course actually
		   has -- adding them would just be two notes. Blended back against the
		   plain pair so it reads as an instrument, not an effect. */
		name: 'DULCIMER',
		category: 'PLUCK',
		kind: 'AC',
		preset: synth({
			presetGain: 1.42,
			osc1Gain: 0,
			osc2Gain: 0,
			subOscGain: 0,
			noiseGain: 0,
			ampAttack: 0.001,
			ampDecay: 1.6,
			ampSustain: 0,
			ampRelease: 0.9,
			...patch(
				[
					['ham', 'excite', { hardness: 78, exLength: 3, exTone: 6400 }],
					['ex', 'sum'],
					['c1', 'string', { decayTime: 2.4, damping: 18, stiffness: 40 }],
					['c2', 'string', { decayTime: 2.1, damping: 22, stiffness: 46 }],
					/* DPTH was 110 on a knob that now stops at 100. The old composite
					   had no ceiling; full depth is what it meant. */
					['rg', 'ring', { ringDepth: 100 }],
					['sm', 'sum'],
					['smg', 'vca', { gain: 130 }],
					['bod', 'body', { bodySize: 52, bodyDepth: 55, bodyMix: 58 }]
				],
				[
					'ham>ex',
					'ex>c1',
					'ex>c2',
					'c1>rg',
					'c2>rg:b',
					/* Two cables into SUM's one inlet, which is how addition is said
					   here -- the `:b` this used to name was MIX's second leg and
					   SUM has no such port. */
					'c1>sm',
					'rg>sm',
					'sm>smg',
					'smg>bod',
					'bod>output'
				],
				14
			)
		})
	},
	{
		// A 25% pulse through a resonant low-pass that closes fast.
		name: 'CLAV',
		category: 'KEYBOARD',
		kind: 'E',
		preset: synth({
			presetGain: 2.14,
			osc1Waveform: 'square',
			osc1Gain: 1,
			pulseWidth: 25,
			osc2Waveform: 'sawtooth',
			osc2Gain: 0.4,
			cutoff: 3500,
			resonance: 4,
			filterEnvAmount: 0.7,
			filterAttack: 0,
			filterDecay: 0.12,
			filterSustain: 0.1,
			ampAttack: 0,
			ampDecay: 0.3,
			ampSustain: 0.15,
			ampRelease: 0.08
		})
	},
	{
		// Quill-plucked strings, two 8' choirs and a 4', on a wooden board.
		name: 'HARPSICHORD',
		category: 'KEYBOARD',
		kind: 'AC',
		preset: synth({
			presetGain: 0.75,
			osc1Waveform: 'sawtooth',
			osc1Gain: 0.9,
			osc2Waveform: 'square',
			osc2Gain: 0.4,
			osc2Ratio: 2,
			cutoff: 9000,
			resonance: 1,
			filterEnvAmount: 0.3,
			filterDecay: 0.2,
			filterSustain: 0,
			ampAttack: 0,
			ampDecay: 0.5,
			ampSustain: 0,
			ampRelease: 0.2,
			/* A quill plucks the string near its end and the jack falls back.
			   Two 8' choirs a cent apart and a 4' an octave up, quieter -- the
			   registration a harpsichord is heard in; a pluck with no dynamics,
			   short and hard, so the string starts with every harmonic it has;
			   long strings in the bass, 6 s to 1.5 s; a damper that stops the
			   note at once, and the jack's click as it drops (REL). The
			   soundboard is the measured piano board (IR: PNO) -- a board is a
			   board; a violin family body, tried first, radiates nothing under
			   250 Hz, and the harpsichord's weight is all down there. The room
			   is small.

			   The string-and-drive it replaces was heard as a cowbell. Voiced
			   (tools/ear) against the VCSL Flemish harpsichord (CC0): its notes
			   band by band, then its notes playing the very passage this plays
			   -- Harpsichord 0.38 to an AudioSet model, where the recording
			   reads 0.87. */
			...patch(
				[
					['fq', 'tofreq'],
					['dk', 'const', { kind: 6, value: 1.00058 }],
					['f2', 'mul'],
					['ok', 'const', { kind: 6, value: 2 }],
					['f4', 'mul'],
					/* The pluck: the string pushed aside and let go -- a step,
					   rising over 3 ms and let go over 85, so the harmonics fall
					   as 1/n from a strong fundamental. A click alone (EXCITE) carried none of the low
					   end, the strings sounded only their top, and it was heard as
					   a ringtone. The click stays, quieter: the quill's own tick. */
					['one', 'const', { kind: 6, value: 1 }],
					['dc', 'tosig'],
					['pe', 'env', { envA: 0.0032, envD: 0.085, envS: 0, envR: 0.001, envCurve: 0 }],
					['pls', 'gain', { level: 0 }],
					['qul', 'excite', { hardness: 95, exLength: 1.2, exTone: 9800 }],
					['qg', 'gain', { level: 0.83 }],
					['pluck', 'sum'],
					['dec', 'map', { shape: 9, inLo: 72, inHi: 12, outLo: 19.6, outHi: 0.5 }],
					['d4k', 'const', { kind: 6, value: 0.6 }],
					['dec4', 'mul'],
					['s1', 'wire', { wireDecay: 4, wireDamp: 1.1, wireStiff: 27, wirePos: 16 }],
					['s2', 'wire', { wireDecay: 4, wireDamp: 1.1, wireStiff: 27, wirePos: 16 }],
					['s4', 'wire', { wireDecay: 2, wireDamp: 3, wireStiff: 8, wirePos: 11 }],
					['g4', 'gain', { level: 0.4 }],
					['strs', 'sum'],
					['dmp', 'env', { envA: 0.001, envD: 0.001, envS: 100, envR: 0.21 }],
					['dv', 'vca', { gain: 100 }],
					['board', 'ir', { irBody: 8, irMix: 24 }],
					['jack', 'excite', { hardness: 60, exLength: 6, exTone: 1800 }],
					['jg', 'gain', { level: 0.063 }],
					['outRel', 'out'],
					['rm', 'space', { spaceSize: 35, spaceDecay: 35, spaceMix: 40 }]
				],
				[
					'entry.pitch>fq:a',
					'fq>f2:a',
					'dk>f2:b',
					'fq>f4:a',
					'ok>f4:b',
					'entry.note>dec:a',
					'dec>dec4:a',
					'd4k>dec4:b',
					'fq>s1:pitch',
					'f2>s2:pitch',
					'f4>s4:pitch',
					'dec>s1:wireDecay',
					'dec>s2:wireDecay',
					'dec4>s4:wireDecay',
					'one>dc:level',
					'dc>pls',
					'pe>pls:level',
					'qul>qg',
					'pls>pluck',
					'qg>pluck',
					'pluck>s1',
					'pluck>s2',
					'pluck>s4',
					's1>strs',
					's2>strs',
					's4>g4',
					'g4>strs',
					'strs>dv',
					'dmp>dv:level',
					'dv>board',
					'board>rm',
					'rm>output',
					'entry.rel>outRel:exec',
					'jack>jg',
					'jg>outRel'
				],
				25
			)
		})
	},

	/* PAD */
	{
		// Detuned saws behind a low filter that breathes with a slow LFO.
		name: 'WARM PAD',
		category: 'PAD',
		kind: 'E',
		preset: synth({
			presetGain: 1.34,
			osc1Waveform: 'sawtooth',
			osc1Gain: 0.9,
			osc2Waveform: 'sawtooth',
			osc2Gain: 0.9,
			detuneCents: 10,
			cutoff: 1800,
			resonance: 0.8,
			filterEnvAmount: 0.1,
			filterAttack: 0.6,
			filterDecay: 0.5,
			filterSustain: 0.8,
			ampAttack: 0.6,
			ampDecay: 0.5,
			ampSustain: 0.9,
			ampRelease: 1.2,
			lfoWaveform: 'sine',
			lfoRate: 0.3,
			lfoCutoffAmt: 0.15
		})
	},
	{
		// Wider detune, brighter filter, a vibrato that fades in.
		name: 'STRINGS',
		category: 'PAD',
		kind: 'E',
		preset: synth({
			presetGain: 1.55,
			osc1Waveform: 'sawtooth',
			osc1Gain: 0.9,
			osc2Waveform: 'sawtooth',
			osc2Gain: 0.9,
			detuneCents: 18,
			cutoff: 4000,
			resonance: 0.5,
			ampAttack: 0.4,
			ampDecay: 0.3,
			ampSustain: 1,
			ampRelease: 0.9,
			lfoWaveform: 'sine',
			lfoRate: 5,
			lfoPitchAmt: 0.06,
			lfoFadeTime: 600
		})
	},
	{
		// Triangle and a sine an octave up, open filter, air on top, drifting in the stereo field.
		name: 'GLASS PAD',
		category: 'PAD',
		kind: 'E',
		preset: synth({
			presetGain: 1.89,
			osc1Waveform: 'triangle',
			osc1Gain: 0.9,
			osc2Waveform: 'sine',
			osc2Gain: 0.7,
			osc2Ratio: 2,
			detuneCents: 6,
			cutoff: 12000,
			resonance: 0.2,
			ampAttack: 0.5,
			ampDecay: 0.3,
			ampSustain: 1,
			ampRelease: 1.5,
			airGain: 0.5,
			lfoWaveform: 'sine',
			lfoRate: 0.4,
			lfoPanAmt: 0.3
		})
	},
	{
		// Square with a square an octave below, a low filter the LFO opens and closes.
		name: 'HOLLOW PAD',
		category: 'PAD',
		kind: 'E',
		preset: synth({
			presetGain: 0.94,
			osc1Waveform: 'square',
			osc1Gain: 0.8,
			osc2Waveform: 'square',
			osc2Gain: 0.6,
			osc2Ratio: 0.5,
			cutoff: 2500,
			resonance: 1.5,
			ampAttack: 0.7,
			ampDecay: 0.4,
			ampSustain: 0.9,
			ampRelease: 1.4,
			lfoWaveform: 'triangle',
			lfoRate: 0.2,
			lfoCutoffAmt: 0.25
		})
	},

	/* ACOUSTIC. These are not subtractive patches with a filter doing the work:
	   each one is an excitation shaped by the amp envelope, driven into a
	   resonator and a body from the patch bay (ADV -> RACK). That chain is what
	   a real instrument is, and what the racks alone cannot reach -- a plucked
	   string needs partials that decay at different rates, which no single
	   filter produces.

	   Measured at C4, key held 1.5s (peak / spectral centroid / length):
	     PIANO    -12.2 dB   596 Hz  1.81 s
	     GUITAR   -12.4 dB   475 Hz  1.00 s
	     BASS     -14.2 dB   467 Hz  1.37 s
	     STRINGS  -16.1 dB  1287 Hz  1.62 s
	     CLARINET -17.9 dB  2281 Hz  1.66 s
	     FLUTE    -15.6 dB  2384 Hz  1.66 s

	   The plucked three ignore how long the key is held, as a struck string
	   does; the blown three sound for as long as they are blown. */
	{
		/* A grand piano: a felt hammer, three detuned waveguide strings, the case,
		   a damper, and one soundboard the whole track shares, which the pedal
		   opens. See grand-piano.ts. Twelve voices: a key is three strings, and
		   at twenty-four a pedalled passage cost more than real time on the
		   audio thread -- which silences every track at once until notes die
		   away. Released notes are stolen first, so a dozen held is still a
		   full pedalled chord. */
		name: 'PIANO',
		category: 'KEYBOARD',
		kind: 'AC',
		preset: synth({
			presetGain: 0.4,
			polyphony: 12,
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			cutoff: 9000,
			ampAttack: 0.001,
			ampDecay: 0.06,
			ampSustain: 0,
			ampRelease: 0.03,
			...grandPiano()
		})
	},
	{
		name: 'GUITAR',
		category: 'PLUCK',
		kind: 'AC',
		preset: synth({
			presetGain: 0.88,
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			cutoff: 9000,
			ampAttack: 0.001,
			ampDecay: 0.06,
			ampSustain: 0,
			ampRelease: 0.03,
			/* A steel-string acoustic, voiced against the Iowa MIS recordings
			   (mf, E2 to E4). What made the old one a pluck lead is what a
			   guitar is not: harmonics gone in a second, a note dead in
			   one and a half, a fundamental that led, and no box. Here:

			     the pick     short and bright, brighter and louder the harder
			     the strings  two waveguides a cent apart -- the string's two
			                  planes of motion -- lightly damped so the upper
			                  harmonics last, 7 s in the bass to 2 s at the top
			     the hand     a damper on the key, a tenth of a second
			     the box      it cannot radiate the low E's fundamental, so a
			                  highpass under the air resonance (100 Hz, the
			                  soundhole), the top at 200, the back and sides
			                  above, a scoop at 700 and presence at 2.5 k -- and
			                  the box itself knocked by the pick, three fixed
			                  modes that ring for a moment whatever the note. */
			...patch(
				[
					['fq', 'tofreq'],
					['dk', 'const', { kind: 6, value: 1.0007 }],
					['f2', 'mul'],
					['pic', 'excite', { hardness: 40, exLength: 4, exTone: 3000 }],
					['pt', 'map', { shape: 1, inLo: 0, inHi: 1, outLo: 900, outHi: 4000 }],
					['pv', 'map', { shape: 1, inLo: 0, inHi: 1, outLo: 0.25, outHi: 1 }],
					['pg', 'gain', { level: 1 }],
					/* The flesh of the finger: a pluck's spectrum falls fast above
					   the first few harmonics, and a harder pluck lets more through.
					   In harmonics, not hertz: the wound bass strings lose their
					   top where the plain treble ones ring bright, so a fixed
					   corner left E2 fizzy and E4 dull at once. */
					['plk', 'map', { shape: 1, inLo: 0, inHi: 1, outLo: 3, outHi: 10 }],
					['plc', 'mul'],
					['pl1', 'filter', { type: 0, cutoff: 1500, q: 0.6 }],
					['pl2', 'filter', { type: 0, cutoff: 1500, q: 0.6 }],
					['dec', 'map', { shape: 9, inLo: 68, inHi: 32, outLo: 12, outHi: 5 }],
					['d2k', 'const', { kind: 6, value: 0.6 }],
					['dec2', 'mul'],
					['w1', 'wire', { wireDecay: 4, wireDamp: 30, wireStiff: 3, wirePos: 14 }],
					['w2', 'wire', { wireDecay: 2.4, wireDamp: 36, wireStiff: 3, wirePos: 14 }],
					['w2g', 'gain', { level: 0.5 }],
					['strs', 'sum'],
					['dmp', 'env', { envA: 0.001, envD: 0.001, envS: 100, envR: 0.15 }],
					['dv', 'vca', { gain: 100 }],
					['rad', 'filter', { type: 1, cutoff: 110, q: 0.9 }],
					['air', 'filter', { type: 6, cutoff: 100, q: 2.5, filterGain: 5 }],
					['top', 'filter', { type: 6, cutoff: 200, q: 2, filterGain: 5 }],
					['back', 'filter', { type: 6, cutoff: 400, q: 1.5, filterGain: 3 }],
					['scoop', 'filter', { type: 6, cutoff: 700, q: 1, filterGain: -3 }],
					['pres', 'filter', { type: 6, cutoff: 2500, q: 0.8, filterGain: 4 }],
					['roll', 'filter', { type: 5, cutoff: 3000, q: 0.7, filterGain: -6 }],
					[
						'knock',
						'modes',
						{ modeHz: 100, mode1: 1, mode2: 2.05, mode3: 4.1, modeQ: 12, modeMix: 100 }
					],
					['kg', 'gain', { level: 0.02 }],
					['mix', 'sum'],
					['rm', 'space', { spaceSize: 30, spaceDecay: 30, spaceMix: 15 }]
				],
				[
					'entry.pitch>fq:a',
					'fq>f2:a',
					'dk>f2:b',
					'entry.vel>pt:a',
					'pt>pic:exTone',
					'entry.vel>pv:a',
					'pic>pg',
					'pv>pg:level',
					'entry.note>dec:a',
					'dec>dec2:a',
					'd2k>dec2:b',
					'fq>w1:pitch',
					'f2>w2:pitch',
					'dec>w1:wireDecay',
					'dec2>w2:wireDecay',
					'entry.vel>plk:a',
					'fq>plc:a',
					'plk>plc:b',
					'plc>pl1:cutoff',
					'plc>pl2:cutoff',
					'pg>pl1',
					'pl1>pl2',
					'pl2>w1',
					'pl2>w2',
					'w1>strs',
					'w2>w2g',
					'w2g>strs',
					'strs>dv',
					'dmp>dv:level',
					'dv>rad',
					'rad>air',
					'air>top',
					'top>back',
					'back>scoop',
					'scoop>pres',
					'pres>roll',
					'pg>knock',
					'knock>kg',
					'roll>mix',
					'kg>mix',
					'mix>rm',
					'rm>output'
				],
				36
			)
		})
	},
	{
		// Heavily damped, in the largest body: an upright rather than a synth bass.
		name: 'UPRIGHT BASS',
		category: 'BASS',
		kind: 'AC',
		preset: synth({
			presetGain: 0.53,
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			cutoff: 9000,
			ampAttack: 0.001,
			ampDecay: 0.06,
			ampSustain: 0,
			ampRelease: 0.03,
			/* Pulled with the side of a finger: a soft, slow pluck, so the
			   attack is round; the finger leaving the string is a short snap
			   of noise; one string, heavily damped above its first partials,
			   ringing a few seconds in the low register. The body is measured
			   from the VSCO double bass's own pizzicato (IR: BPZ) -- the wood a
			   string-and-EQ model could not draw, which is what had it heard as
			   a synth bass. The hand comes down at the key's release; the COMP
			   is the one an upright always goes through on a record. */
			...patch(
				[
					['fq', 'tofreq'],
					/* The finger pushing the string aside and letting go: a
					   displacement, a step rather than a tap -- rising over 26 ms
					   and let go over 130 -- which is where the note's low
					   fundamental comes from (a step falls as 1/n, a tap is flat). EXCITE's click alone has
					   no low end -- the string sounded only its top, 30 dB short
					   at the fundamental, and read as a guitar. */
					['one', 'const', { kind: 6, value: 1 }],
					['dc', 'tosig'],
					['fe', 'env', { envA: 0.026, envD: 0.127, envS: 0, envR: 0.004, envCurve: 0 }],
					['fin', 'gain', { level: 0 }],
					['flp', 'filter', { type: 0, cutoff: 930, q: 0.5 }],
					['pv', 'map', { shape: 1, inLo: 0, inHi: 1, outLo: 0.5, outHi: 1.6 }],
					['pg', 'gain', { level: 1 }],
					['snp', 'noise'],
					['sne', 'env', { envA: 0.0005, envD: 0.03, envS: 0, envR: 0.01, envCurve: 1 }],
					['snv', 'vca', { gain: 100 }],
					['sng', 'gain', { level: 0.07 }],
					['dec', 'map', { shape: 9, inLo: 84, inHi: 48, outLo: 0.63, outHi: 4.9 }],
					['str', 'wire', { wireDecay: 3, wireDamp: 90, wireStiff: 20, wirePos: 42 }],
					['ex', 'sum'],
					['dmp', 'env', { envA: 0.001, envD: 0.001, envS: 100, envR: 0.25 }],
					['dv', 'vca', { gain: 100 }],
					['bod', 'ir', { irBody: 7, irMix: 68 }],
					['cmp', 'comp', { compThresh: -22, compRatio: 4, compAttack: 12 }],
					['rm', 'space', { spaceSize: 30, spaceDecay: 30, spaceMix: 10 }]
				],
				[
					'entry.pitch>fq:a',
					'entry.vel>pv:a',
					'one>dc:level',
					'dc>fin',
					'fe>fin:level',
					'fin>flp',
					'flp>pg',
					'pv>pg:level',
					'pg>str',
					'fq>str:pitch',
					'entry.note>dec:a',
					'dec>str:wireDecay',
					'snp>snv',
					'sne>snv:level',
					'snv>sng',
					'str>ex',
					'sng>ex',
					'ex>dv',
					'dmp>dv:level',
					'dv>bod',
					'bod>cmp',
					'cmp>rm',
					'rm>output'
				],
				48
			)
		})
	},
	{
		/* A string section, bowed. What the old one lacked is what separates
		   strings from a pad built out of sawtooths:

		     the players  four, each on its own vibrato (5.2 to 6.1 Hz, arriving
		                  after the note) and a few cents from the others, so
		                  the section shimmers rather than sweeps -- one chorus
		                  LFO moving everyone together is the pad's sound
		     the bow      a quick start, a tenth of a second, not a swell; a
		                  little rosin under it; brighter as it digs in
		     the bodies   the formants every violin-family instrument has
		                  whatever the note: the air and wood modes low, a
		                  nasal dip at 1.3 k, the bridge hill at 2.6 k and a
		                  steep fall above -- a pad is the saw's spectrum,
		                  shaped only by a lowpass following the key
		     the hall     seats spread across the stage, and a hall behind */
		name: 'FULL STRING',
		category: 'STRING',
		kind: 'AC',
		preset: synth({
			presetGain: 1,
			osc1Waveform: 'sawtooth',
			osc1Gain: 0.9,
			osc2Gain: 0,
			cutoff: 6000,
			ampAttack: 0.12,
			ampDecay: 0.3,
			ampSustain: 0.85,
			ampRelease: 0.35,
			...patch(
				[
					['fq', 'tofreq'],
					['vf', 'env', { envA: 0.1, envD: 0.01, envS: 100, envR: 0.5 }],
					['vk', 'const', { kind: 6, value: 0.01 }],
					['one', 'const', { kind: 6, value: 1 }],
					...SECTION.flatMap(
						([i, rate, ratio, pan]) =>
							[
								[`v${i}`, 'lfo', { lfoWave: 0, lfoRate: rate, lfoAmt: 100 }],
								[`vm${i}`, 'mul'],
								[`vd${i}`, 'mul'],
								[`vr${i}`, 'add'],
								[`r${i}`, 'const', { kind: 6, value: ratio }],
								[`fr${i}`, 'mul'],
								[`fv${i}`, 'mul'],
								[`o${i}`, 'osc', { wave: 2 }],
								[`p${i}`, 'pan', { panPos: pan }]
							] as [string, string, Record<string, number>?][]
					),
					['sec', 'sum'],
					/* The bodies, measured (IR): violins above G3, cellos below, a
					   fifth's crossfade between. */
					['vln', 'ir', { irBody: 0, irMix: 55 }],
					['cel', 'ir', { irBody: 2 }],
					['mv', 'map', { shape: 9, inLo: 55, inHi: 48, outLo: 0, outHi: 1 }],
					['mc', 'map', { shape: 9, inLo: 55, inHi: 48, outLo: 1, outHi: 0 }],
					['gv', 'gain', { level: 0 }],
					['gc', 'gain', { level: 0 }],
					['bod', 'sum'],
					['ae', 'env', { envA: 0.2, envD: 0.2, envS: 68, envR: 0.12 }],
					['amp', 'vca', { gain: 100 }],
					['vel', 'map', { shape: 1, inLo: 0, inHi: 1, outLo: 0.35, outHi: 1 }],
					['vg', 'gain', { level: 1 }],
					['hall', 'space', { spaceSize: 85, spaceDecay: 64, spaceMix: 19 }]
				],
				[
					'entry.pitch>fq:a',
					...SECTION.flatMap(([i]) => [
						`v${i}.cv>vm${i}:a`,
						`vf>vm${i}:b`,
						`vm${i}>vd${i}:a`,
						`vk>vd${i}:b`,
						`vd${i}>vr${i}:a`,
						`one>vr${i}:b`,
						`fq>fr${i}:a`,
						`r${i}>fr${i}:b`,
						`fr${i}>fv${i}:a`,
						`vr${i}>fv${i}:b`,
						`fv${i}>o${i}:pitch`,
						`o${i}>p${i}`,
						`p${i}>sec`
					]),
					'sec>vln',
					'sec>cel',
					'entry.note>mv:a',
					'entry.note>mc:a',
					'vln>gv',
					'mv>gv:level',
					'cel>gc',
					'mc>gc:level',
					'gv>bod',
					'gc>bod',
					'bod>amp',
					'ae>amp:level',
					'entry.vel>vel:a',
					'amp>vg',
					'vel>vg:level',
					'vg>hall',
					'hall>output'
				],
				8
			)
		})
	},
	{
		/* Pizzicato: a section plucking together, which it never quite does
		   -- four players a few cents apart, each pluck landing up to 30 ms
		   after the first. A fingertip pulls the string at its middle, the
		   finger's snap is a few tens of milliseconds of noise, and the rest
		   is the wood: bodies measured from the VSCO section's own pizzicato
		   (IR: VPZ above G3, CPZ below), since a plucked note excites the box
		   differently from a bowed one. Dead in two seconds in the bass, one
		   at the top; the hand comes down on it at the key's release.

		   Tuned by ear (tools/ear) against the VSCO violins' pizz: the
		   two-string, heavily damped version before it was heard as a piano
		   (Pizzicato 0.04); this one reads 0.20 where the recordings read
		   0.46, and nothing else comes close. */
		name: 'PIZZ',
		category: 'STRING',
		kind: 'AC',
		preset: synth({
			presetGain: 0.8,
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			cutoff: 9000,
			ampAttack: 0.001,
			ampDecay: 0.06,
			ampSustain: 0,
			ampRelease: 0.03,
			...patch(
				[
					['fq', 'tofreq'],
					['fin', 'excite', { hardness: 52, exLength: 4, exTone: 1660 }],
					// The finger leaving the string: a snap of noise, into the body with the note.
					['snp', 'noise'],
					['sne', 'env', { envA: 0.0005, envD: 0.043, envS: 0, envR: 0.01, envCurve: 1 }],
					['snv', 'vca', { gain: 100 }],
					['sng', 'gain', { level: 0.038 }],
					['pv', 'map', { shape: 1, inLo: 0, inHi: 1, outLo: 0.6, outHi: 2 }],
					['pg', 'gain', { level: 1 }],
					// The fingertip, in harmonics: a harder pull lets more of the top through.
					['plk', 'map', { shape: 1, inLo: 0, inHi: 1, outLo: 4, outHi: 11.3 }],
					['plc', 'mul'],
					['pl1', 'filter', { type: 0, cutoff: 1500, q: 0.6 }],
					['pl2', 'filter', { type: 0, cutoff: 1500, q: 0.6 }],
					['dec', 'map', { shape: 9, inLo: 72, inHi: 24, outLo: 2.4, outHi: 1 }],
					...PIZZ_PLAYERS.flatMap(
						([i, ratio, late, pan]) =>
							[
								[`r${i}`, 'const', { kind: 6, value: ratio }],
								[`f${i}`, 'mul'],
								[`t${i}`, 'delay', { delayTime: late }],
								[`w${i}`, 'wire', { wireDecay: 1, wireDamp: 23, wireStiff: 2, wirePos: 40 }],
								[`p${i}`, 'pan', { panPos: pan }]
							] as [string, string, Record<string, number>?][]
					),
					['strs', 'sum'],
					['dmp', 'env', { envA: 0.001, envD: 0.001, envS: 100, envR: 0.035 }],
					['dv', 'vca', { gain: 100 }],
					['vln', 'ir', { irBody: 5, irMix: 59 }],
					['cel', 'ir', { irBody: 6, irMix: 59 }],
					['mv', 'map', { shape: 9, inLo: 55, inHi: 48, outLo: 0, outHi: 1 }],
					['mc', 'map', { shape: 9, inLo: 55, inHi: 48, outLo: 1, outHi: 0 }],
					['gv', 'gain', { level: 0 }],
					['gc', 'gain', { level: 0 }],
					['bod', 'sum'],
					['hall', 'space', { spaceSize: 80, spaceDecay: 55, spaceMix: 3 }]
				],
				[
					'entry.pitch>fq:a',
					'entry.vel>pv:a',
					'fin>pg',
					'pv>pg:level',
					'entry.vel>plk:a',
					'fq>plc:a',
					'plk>plc:b',
					'plc>pl1:cutoff',
					'plc>pl2:cutoff',
					'pg>pl1',
					'pl1>pl2',
					'entry.note>dec:a',
					...PIZZ_PLAYERS.flatMap(([i]) => [
						`fq>f${i}:a`,
						`r${i}>f${i}:b`,
						`f${i}>w${i}:pitch`,
						`dec>w${i}:wireDecay`,
						`pl2>t${i}`,
						`t${i}>w${i}`,
						`w${i}>p${i}`,
						`p${i}>strs`
					]),
					'snp>snv',
					'sne>snv:level',
					'snv>sng',
					'sng>strs',
					'strs>dv',
					'dmp>dv:level',
					'dv>vln',
					'dv>cel',
					'entry.note>mv:a',
					'entry.note>mc:a',
					'vln>gv',
					'mv>gv:level',
					'cel>gc',
					'mc>gc:level',
					'gv>bod',
					'gc>bod',
					'bod>hall',
					'hall>output'
				],
				150
			)
		})
	},
	{
		// A reed and a bore closed at one end: odd harmonics, through a measured tube.
		name: 'CLARINET',
		category: 'WIND',
		kind: 'AC',
		preset: synth({
			presetGain: 0.34,
			/* With ADV off: a square is odd harmonics, which is the clarinet's
			   hollowness, darkened -- rather than the NOISE oscillator this
			   half used to be, which had no pitch. */
			osc1Waveform: 'square',
			osc1Gain: 0.7,
			osc2Gain: 0,
			noiseGain: 0.01,
			cutoff: 1800,
			resonance: 0.5,
			ampAttack: 0.05,
			ampDecay: 0.2,
			ampSustain: 0.85,
			ampRelease: 0.15,
			/* A reed's pulse into the bore, and the bore measured. The source is
			   a square -- odd harmonics only, which is the clarinet's hollowness
			   -- and everything else a clarinet is, the register's formants and
			   the bell's lift, is the response of the tube and bell taken from
			   the VSCO clarinet's odd harmonics (IR: CLAR). The tube-and-reed
			   model this replaces was heard as a sine wave: a physical bore
			   with none of the real one's resonances.

			   Breath under the tone, band-passed around the note's third
			   harmonic; each note a few cents from true, as a player's never
			   quite repeat; no vibrato -- a clarinet in a section plays none. */
			...patch(
				[
					['fq', 'tofreq'],
					['dr', 'rand', { lo: -1, hi: 1 }],
					['dk', 'const', { kind: 6, value: 0.0005 }],
					['dm', 'mul'],
					['one', 'const', { kind: 6, value: 1 }],
					['da', 'add'],
					['fv', 'mul'],
					['reed', 'osc', { wave: 1 }],
					['bore', 'ir', { irBody: 3, irMix: 79 }],
					['air', 'noise'],
					['k3', 'const', { kind: 6, value: 4.3 }],
					['f3', 'mul'],
					['abp', 'filter', { type: 2, cutoff: 1000, q: 1.6 }],
					['ag', 'gain', { level: 0.046 }],
					['ae', 'env', { envA: 0.06, envD: 0.33, envS: 85, envR: 0.1 }],
					['amp', 'vca', { gain: 100 }],
					['mix', 'sum'],
					['rm', 'space', { spaceSize: 45, spaceDecay: 40, spaceMix: 16 }]
				],
				[
					'entry.pitch>fq:a',
					'dr>dm:a',
					'dk>dm:b',
					'dm>da:a',
					'one>da:b',
					'fq>fv:a',
					'da>fv:b',
					'fv>reed:pitch',
					'reed>bore',
					'bore>mix',
					'air>abp',
					'fq>f3:a',
					'k3>f3:b',
					'f3>abp:cutoff',
					'abp>ag',
					'ag>mix',
					'mix>amp',
					'ae>amp:level',
					'amp>rm',
					'rm>output'
				],
				30
			)
		})
	},
	{
		// Open at both ends, so all the harmonics are there.
		name: 'FLUTE',
		category: 'WIND',
		kind: 'AC',
		preset: synth({
			presetGain: 0.36,
			/* The racks 1-7 half, which is what plays with ADV off. It was a
			   NOISE oscillator -- so a flute with ADV off was a hiss with no
			   pitch at all. A sine with a quiet octave, a little air, and the
			   same delayed vibrato. */
			osc1Waveform: 'sine',
			osc1Gain: 0.8,
			osc2Waveform: 'triangle',
			osc2Gain: 0.2,
			osc2Ratio: 2,
			noiseGain: 0.02,
			cutoff: 3500,
			lfoWaveform: 'sine',
			lfoRate: 5.2,
			lfoPitchAmt: 0.03,
			lfoFadeTime: 450,
			ampAttack: 0.05,
			ampDecay: 0.2,
			ampSustain: 0.85,
			ampRelease: 0.15,
			/* Built from the recordings (Iowa MIS flute, mf, vibrato), not from a
			   tube: eight sine partials whose balance moves with the register --
			   at C4 the second is louder than the fundamental, by C5 the
			   fundamental leads and the fifth and sixth are nearly gone -- which
			   is what a flute sounds like and a dark tube did not. A flute's
			   vibrato is mostly breath pressure, so it moves the level (+-30%)
			   far more than the pitch (+-13 cents), at 4.8 Hz, arriving after the
			   note. The tone speaks in 60 ms, the air a little ahead of it: the
			   recordings take a fifth of a second, and played from a key that
			   read as lag -- worse, ENV releases only once its attack and decay
			   are through, so a tapped note swelled on for half a second after
			   the key was up. The air is
			   noise centred an octave over the key, following it, plenty of it in
			   the low register and less above -- as the recordings have it, 20 to
			   27 dB under the note. */
			...patch(
				[
					['fq', 'tofreq'],
					['vib', 'lfo', { lfoWave: 0, lfoRate: 4.8, lfoAmt: 100 }],
					['vf', 'env', { envA: 0.45, envD: 0.01, envS: 100, envR: 0.1 }],
					['vm', 'mul'],
					['pdk', 'const', { kind: 6, value: 0.0075 }],
					['pd', 'mul'],
					['one', 'const', { kind: 6, value: 1 }],
					['pr', 'add'],
					['fv', 'mul'],
					['h1', 'osc', { wave: 0 }],
					['l1', 'map', { shape: 9, inLo: 48, inHi: 36, outLo: 0.562, outHi: 1.0 }],
					['g1', 'gain', { level: 0 }],
					['k2', 'const', { kind: 6, value: 2 }],
					['f2', 'mul'],
					['h2', 'osc', { wave: 0 }],
					['l2', 'map', { shape: 9, inLo: 48, inHi: 36, outLo: 1.0, outHi: 0.355 }],
					['g2', 'gain', { level: 0 }],
					['k3', 'const', { kind: 6, value: 3 }],
					['f3', 'mul'],
					['h3', 'osc', { wave: 0 }],
					['l3', 'map', { shape: 9, inLo: 48, inHi: 36, outLo: 0.178, outHi: 0.224 }],
					['g3', 'gain', { level: 0 }],
					['k4', 'const', { kind: 6, value: 4 }],
					['f4', 'mul'],
					['h4', 'osc', { wave: 0 }],
					['l4', 'map', { shape: 9, inLo: 48, inHi: 36, outLo: 0.089, outHi: 0.126 }],
					['g4', 'gain', { level: 0 }],
					['k5', 'const', { kind: 6, value: 5 }],
					['f5', 'mul'],
					['h5', 'osc', { wave: 0 }],
					['l5', 'map', { shape: 9, inLo: 48, inHi: 36, outLo: 0.251, outHi: 0.028 }],
					['g5', 'gain', { level: 0 }],
					['k6', 'const', { kind: 6, value: 6 }],
					['f6', 'mul'],
					['h6', 'osc', { wave: 0 }],
					['l6', 'map', { shape: 9, inLo: 48, inHi: 36, outLo: 0.2, outHi: 0.004 }],
					['g6', 'gain', { level: 0 }],
					['k7', 'const', { kind: 6, value: 7 }],
					['f7', 'mul'],
					['h7', 'osc', { wave: 0 }],
					['l7', 'map', { shape: 9, inLo: 48, inHi: 36, outLo: 0.0178, outHi: 0.0032 }],
					['g7', 'gain', { level: 0 }],
					['k8', 'const', { kind: 6, value: 8 }],
					['f8', 'mul'],
					['h8', 'osc', { wave: 0 }],
					['l8', 'map', { shape: 9, inLo: 48, inHi: 36, outLo: 0.0501, outHi: 0.0009 }],
					['g8', 'gain', { level: 0 }],
					['tone', 'sum'],
					['tl', 'vca', { gain: 30 }],
					['ae', 'env', { envA: 0.06, envD: 0.08, envS: 90, envR: 0.1 }],
					['amp', 'vca', { gain: 100 }],
					['adk', 'const', { kind: 6, value: 0.3 }],
					['ad', 'mul'],
					['ar', 'add'],
					['trem', 'gain', { level: 1 }],
					['air', 'noise'],
					['be', 'env', { envA: 0.02, envD: 0.15, envS: 55, envR: 0.06 }],
					['bl', 'map', { shape: 9, inLo: 48, inHi: 24, outLo: 0.22, outHi: 0.02 }],
					['bv', 'mul'],
					['bg', 'gain', { level: 0 }],
					['fk', 'const', { kind: 6, value: 2 }],
					['fc', 'mul'],
					['bp', 'filter', { type: 2, cutoff: 1000, q: 1 }],
					['mix', 'sum'],
					['rm', 'space', { spaceSize: 45, spaceDecay: 40, spaceMix: 12 }]
				],
				[
					'entry.pitch>fq:a',
					'vib.cv>vm:a',
					'vf>vm:b',
					'vm>pd:a',
					'pdk>pd:b',
					'pd>pr:a',
					'one>pr:b',
					'fq>fv:a',
					'pr>fv:b',
					'fv>h1:pitch',
					'entry.note>l1:a',
					'h1>g1',
					'l1>g1:level',
					'g1>tone',
					'fv>f2:a',
					'k2>f2:b',
					'f2>h2:pitch',
					'entry.note>l2:a',
					'h2>g2',
					'l2>g2:level',
					'g2>tone',
					'fv>f3:a',
					'k3>f3:b',
					'f3>h3:pitch',
					'entry.note>l3:a',
					'h3>g3',
					'l3>g3:level',
					'g3>tone',
					'fv>f4:a',
					'k4>f4:b',
					'f4>h4:pitch',
					'entry.note>l4:a',
					'h4>g4',
					'l4>g4:level',
					'g4>tone',
					'fv>f5:a',
					'k5>f5:b',
					'f5>h5:pitch',
					'entry.note>l5:a',
					'h5>g5',
					'l5>g5:level',
					'g5>tone',
					'fv>f6:a',
					'k6>f6:b',
					'f6>h6:pitch',
					'entry.note>l6:a',
					'h6>g6',
					'l6>g6:level',
					'g6>tone',
					'fv>f7:a',
					'k7>f7:b',
					'f7>h7:pitch',
					'entry.note>l7:a',
					'h7>g7',
					'l7>g7:level',
					'g7>tone',
					'fv>f8:a',
					'k8>f8:b',
					'f8>h8:pitch',
					'entry.note>l8:a',
					'h8>g8',
					'l8>g8:level',
					'g8>tone',
					'tone>tl',
					'tl>amp',
					'ae>amp:level',
					'vm>ad:a',
					'adk>ad:b',
					'ad>ar:a',
					'one>ar:b',
					'amp>trem',
					'ar>trem:level',
					'air>bp',
					'fq>fc:a',
					'fk>fc:b',
					'fc>bp:cutoff',
					'be>bv:a',
					'entry.note>bl:a',
					'bl>bv:b',
					'bp>bg',
					'bv>bg:level',
					'trem>mix',
					'bg>mix',
					'mix>rm',
					'rm>output'
				],
				60
			)
		})
	},

	/* FX -- the sounds that are not an instrument.
	   Everything here is a noise, a sweep or a texture rather than something you
	   would play a melody on, which is why they share a heading instead of being
	   filed under whichever family they happen to resemble. These are E: they are
	   made from the oscillators, the filter and the LFO, none of which needs the
	   patch bay to do what it does here. */
	{
		// White noise through a filter the envelope drags down from wide open:
		// the shape of a wave falling back, hence the long release.
		name: 'SEA WASH',
		category: 'FX',
		kind: 'E',
		preset: synth({
			presetGain: 1.26,
			osc1Waveform: 'noise',
			osc1Gain: 1,
			osc2Gain: 0,
			noiseGain: 0.5,
			filterType: 'lowpass',
			cutoff: 900,
			resonance: 2.5,
			ampAttack: 0.9,
			ampDecay: 1.2,
			ampSustain: 0.55,
			ampRelease: 1.8,
			filterAttack: 1.1,
			filterDecay: 1.6,
			filterSustain: 0.2,
			filterRelease: 2,
			filterEnvAmount: 0.85,
			lfoWaveform: 'sine',
			lfoRate: 0.35,
			lfoCutoffAmt: 0.4
		})
	},
	{
		/* A pitch envelope that falls into a resonant filter. The drop is the
		   sound; the note only says where it starts.

		   The drop costs level -- the fundamental walks down out of the band
		   the filter passes -- and the first version paid for it twice: -24
		   semitones took it to around 16 Hz, and an amp decay of 0.28 into
		   zero sustain had the voice nearly gone before the step released it.
		   Measured 0.005 peak against 0.05-0.13 for the rest of the presets,
		   which is inaudible next to any of them. Shorter drop, a sustain to
		   hold it, and a sub and a square under the saw to carry the weight
		   the falling fundamental gives up: 0.052. */
		name: 'LASER ZAP',
		category: 'FX',
		kind: 'E',
		preset: synth({
			presetGain: 1.09,
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Waveform: 'square',
			osc2Gain: 0.7,
			subOscGain: 0.5,
			filterType: 'lowpass',
			cutoff: 6000,
			resonance: 9,
			ampAttack: 0.001,
			ampDecay: 0.5,
			ampSustain: 0.6,
			ampRelease: 0.3,
			pitchAttack: 0.001,
			pitchDecay: 0.3,
			pitchEnvAmount: -18
		})
	},
	{
		// Two saws a long way apart, swept slowly: the beating is the texture,
		// so the detune is deliberately past what would be called in tune.
		name: 'DRONE',
		category: 'FX',
		kind: 'E',
		preset: synth({
			presetGain: 0.95,
			osc1Waveform: 'sawtooth',
			osc1Gain: 0.8,
			osc2Waveform: 'sawtooth',
			osc2Gain: 0.8,
			detuneCents: 34,
			subOscGain: 0.5,
			filterType: 'lowpass',
			cutoff: 1400,
			resonance: 5,
			ampAttack: 1.4,
			ampDecay: 1,
			ampSustain: 0.9,
			ampRelease: 2.2,
			lfoWaveform: 'triangle',
			lfoRate: 0.18,
			lfoCutoffAmt: 0.55,
			lfoPitchAmt: 0.05
		})
	},
	{
		// Noise retriggered fast enough to have a pitch of its own, which is what
		// makes it read as a machine rather than as wind.
		name: 'STATIC',
		category: 'FX',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'noise',
			osc1Gain: 1,
			osc2Gain: 0,
			noiseGain: 0.85,
			noiseRetrig: 1,
			noiseRetrigGap: 3,
			/* A wide bandpass, held. A bandpass is what makes this read as a
			   machine rather than as wind, so it stays -- but a narrow one
			   throws away most of what a noise source has to offer: at Q=7 this
			   measured 0.029 peak against a 0.056 median, the quietest preset in
			   the library. Wider, lower and sustaining brings it to 0.053
			   without turning it into a wash. */
			filterType: 'bandpass',
			cutoff: 1800,
			resonance: 1,
			ampAttack: 0.004,
			ampDecay: 0.12,
			ampSustain: 0.9,
			ampRelease: 0.2,
			lfoWaveform: 'square',
			lfoRate: 11,
			lfoCutoffAmt: 0.6
		})
	},
	{
		// A square gated by the LFO faster than the ear separates: one note
		// arrives as a run of them.
		name: 'STUTTER',
		category: 'FX',
		kind: 'E',
		preset: synth({
			presetGain: 0.3,
			osc1Waveform: 'square',
			osc1Gain: 1,
			osc2Waveform: 'square',
			osc2Gain: 0.5,
			osc2Semitone: 12,
			filterType: 'lowpass',
			cutoff: 3200,
			resonance: 3,
			ampAttack: 0.002,
			ampDecay: 0.3,
			ampSustain: 0.7,
			ampRelease: 0.08,
			lfoWaveform: 'square',
			lfoRate: 16,
			lfoAmpAmt: 0.95
		})
	},
	{
		// The filter opening slowly under a bright saw: a riser, which is only
		// interesting held.
		name: 'RISER',
		category: 'FX',
		kind: 'E',
		preset: synth({
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Waveform: 'sawtooth',
			osc2Gain: 0.6,
			detuneCents: 12,
			filterType: 'lowpass',
			cutoff: 300,
			resonance: 8,
			ampAttack: 0.6,
			ampDecay: 1,
			ampSustain: 0.95,
			ampRelease: 0.5,
			filterAttack: 2.6,
			filterDecay: 1,
			filterSustain: 1,
			filterRelease: 0.4,
			filterEnvAmount: 0.95,
			lfoWaveform: 'sine',
			lfoRate: 5.5,
			lfoPitchAmt: 0.12
		})
	}
];

export const PRESET_CATEGORIES: PresetCategory[] = [
	'LEAD',
	'PAD',
	'BASS',
	'PLUCK',
	'KEYBOARD',
	'ORGAN',
	'STRING',
	'WIND',
	'MALLET',
	'FX',
	'DRUM'
];

const CATEGORY_HINT_KEYS: Record<PresetCategory, string> = {
	LEAD: 'synthPanels.presets.hintLead',
	PAD: 'synthPanels.presets.hintPad',
	BASS: 'synthPanels.presets.hintBass',
	PLUCK: 'synthPanels.presets.hintPluck',
	KEYBOARD: 'synthPanels.presets.hintKeyboard',
	ORGAN: 'synthPanels.presets.hintOrgan',
	STRING: 'synthPanels.presets.hintString',
	WIND: 'synthPanels.presets.hintWind',
	MALLET: 'synthPanels.presets.hintMallet',
	FX: 'synthPanels.presets.hintFx',
	DRUM: 'synthPanels.presets.hintDrums'
};

/* A sibling component (PresetMenu.svelte) indexes this by category as a plain
   Record; the Proxy resolves each hint through `tr()` at access time (never
   at import time), so it always reads in the current locale without either
   side needing to change shape. */
export const CATEGORY_HINTS: Record<PresetCategory, string> = new Proxy(
	{} as Record<PresetCategory, string>,
	{
		get: (_target, prop: string) => tr(CATEGORY_HINT_KEYS[prop as PresetCategory])
	}
);

/* What a preset is: the sound of a track, and nothing about where it sits in
   the mix or what it plays -- the engine's KEY_TIMBRE_KEYS, plus the per-track
   EQ, which a preset carries but a percussion key cannot. An allow-list rather
   than a deny-list so an imported file can only ever set fields the synth has. */
const TIMBRE_KEYS = [
	...KEY_TIMBRE_KEYS,
	'eqOn',
	'eqGains',
	'modRoutes'
] as const satisfies readonly (keyof TrackData)[];

interface PresetFile {
	format: typeof FILE_FORMAT;
	version: 1;
	name: string;
	timbre: Partial<TrackData>;
}

/* The keys whose value is a plain object rather than a scalar or an array.
   Everything else is copied by value; these are cloned, so a saved preset does
   not share a graph with the track it was saved from. */
const OBJECT_TIMBRE_KEYS = new Set<string>([
	'rackGraph',
	'rackParams',
	'graphParams',
	'graphWaves',
	'graphLabels',
	'waveParams',
	'modRoutes'
]);

export function pickTimbre(src: Record<string, unknown>): Partial<TrackData> {
	const out: Record<string, unknown> = {};
	for (const k of TIMBRE_KEYS) {
		const v = src[k];
		if (v === undefined || v === null) continue;
		const t = typeof v;
		if (t === 'number' || t === 'string' || t === 'boolean') out[k] = v;
		/* Arrays are cloned, not referenced. An array of scalars (keyEqGains,
		   eqGains) survived either way, but noteLanes is an array of objects --
		   a saved patch shared its lanes with the track it came from, so drawing
		   on the track afterwards silently rewrote the patch that was already
		   saved. */
		else if (Array.isArray(v)) out[k] = JSON.parse(JSON.stringify(v));
		/* Objects were dropped here, which is why a patch bay never survived a
		   save: rackGraph and graphParams are plain objects, so every preset came
		   back with an empty rack however it was built. Deep-copied rather than
		   referenced, or editing the track afterwards would rewrite the preset. */
		else if (t === 'object' && OBJECT_TIMBRE_KEYS.has(k)) out[k] = JSON.parse(JSON.stringify(v));
	}
	return out as Partial<TrackData>;
}

export function isPresetFile(parsed: unknown): parsed is PresetFile {
	return (
		typeof parsed === 'object' &&
		parsed !== null &&
		(parsed as PresetFile).format === FILE_FORMAT &&
		typeof (parsed as PresetFile).timbre === 'object' &&
		(parsed as PresetFile).timbre !== null
	);
}

function loadUserPresets(): SoundPreset[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const list = JSON.parse(raw);
		if (!Array.isArray(list)) return [];
		return list
			.filter((p) => p && typeof p.name === 'string' && p.preset && typeof p.preset === 'object')
			.map((p) => ({ name: String(p.name), preset: pickTimbre(p.preset) }));
	} catch {
		return [];
	}
}

/** Presets the user saved or imported — persist across visits, listed after the built-ins. */
export const userPresets = writable<SoundPreset[]>(loadUserPresets());
if (browser) {
	userPresets.subscribe((list) => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
		} catch {
			/* quota / private mode — the list still works for this session */
		}
	});
}

export const allPresets = derived(userPresets, ($user) => [...SOUND_PRESETS, ...$user]);
/** Index into allPresets of the last preset applied (or picked) — what the menu trigger names. */
export const soundPresetIdx = writable<number>(0);

/* True once the track has been edited away from the preset it was loaded from.
   The trigger then reads MODIFIED rather than naming a preset the sound is no
   longer -- which is what tells the player there is something worth saving, and
   stops a name from vouching for a sound it does not describe.

   Hooked into updateActiveTrack, which every edit passes through, so no knob
   has to remember to report itself. Applying a preset goes through the same
   function and clears the flag again afterwards. */
export const presetModified = writable<boolean>(false);
setTrackEditedHook(() => presetModified.set(true));

/* The name of the kit on the active track, or null when a single preset is
   what was last applied. A kit replaces the whole key table rather than the
   track's one timbre, so soundPresetIdx cannot describe it -- it kept naming
   whichever preset happened to be selected before, which is a sound the track
   is no longer making. The menu trigger prefers this when it is set. */
export const activeKitName = writable<string | null>(null);

export function applyPresetAt(idx: number): void {
	const sel = get(allPresets)[idx];
	if (!sel) return;
	soundPresetIdx.set(idx);
	activeKitName.set(null);
	/* A patch is two sounds that share a track: the subtractive voice racks 1-7
	   edit, and the signal path the patch bay edits. Both travel with the preset
	   and only one is in force, so applying one has to set both sides -- the ADV
	   half explicitly, even when the preset has none.

	   Spreading the preset alone only writes the keys it happens to carry, so a
	   preset with no rack inherited whatever the last one left behind: loading
	   PIANO then SUB BASS and switching to ADV showed PIANO's string and body
	   under the bass. Every preset owns its own rack now, empty included. */
	const isChainPreset = Array.isArray(sel.preset.rackChain) && sel.preset.rackChain.length > 0;
	const hasGraph = !!sel.preset.rackGraph?.nodes?.length;
	updateActiveTrack({
		...sel.preset,
		rackChain: sel.preset.rackChain ?? [],
		rackParams: sel.preset.rackParams ?? {},
		rackGraph: sel.preset.rackGraph ?? { nodes: [], cables: [] },
		graphParams: sel.preset.graphParams ?? {},
		advanced: isChainPreset || hasGraph,
		...(isChainPreset || hasGraph ? { advancedView: 'rack' as const } : {})
	});
	presetModified.set(false);
	playSound('toggle');
}

/* Start from nothing rather than from whatever happened to be loaded.
 *
 * Two of them, because the synth has two instruments in it: the plain one is a
 * neutral subtractive voice edited on racks 1-7, and the advanced one is a
 * signal path with a string and a body already placed -- the shape most
 * acoustic instruments take -- so there is something to hear while the rest is
 * built up. Both count as modified from the start: there is no preset they came
 * from, and the point is to save what you make. */
function blankTimbre(): Partial<TrackData> {
	const blank = JSON.parse(JSON.stringify(BLANK_TRACK_TIMBRE)) as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const k of TIMBRE_KEYS) if (blank[k] !== undefined) out[k] = blank[k];
	return out as Partial<TrackData>;
}

export function newPreset(): void {
	askConfirm({
		title: tr('synth.confirm.newPatchTitle'),
		body: tr('synth.confirm.newPatchBody'),
		confirmLabel: tr('synth.confirm.discard'),
		onConfirm: doNewPreset
	});
}

function doNewPreset(): void {
	/* The graph goes too. A patch that kept the last one's wiring is not new,
	   and the modules would be invisible until ADV was switched back on. */
	updateActiveTrack({
		...blankTimbre(),
		rackChain: [],
		rackParams: {},
		rackGraph: startingGraph(),
		graphParams: {},
		advanced: false
	});
	presetModified.set(true);
	showSaveStatus(tr('synthPanels.toast.newPreset'));
	playSound('click');
}

export function newAdvancedPreset(): void {
	askConfirm({
		title: tr('synth.confirm.newAdvPatchTitle'),
		body: tr('synth.confirm.newAdvPatchBody'),
		confirmLabel: tr('synth.confirm.discard'),
		onConfirm: doNewAdvancedPreset
	});
}

function doNewAdvancedPreset(): void {
	updateActiveTrack({
		...blankTimbre(),
		// A short excitation: a resonator answers a strike, and a blank ADV patch
		// that droned would teach the wrong thing about what the chain is for.
		ampAttack: 0.002,
		ampDecay: 0.08,
		ampSustain: 0,
		ampRelease: 0.05,
		attack: 0.002,
		decay: 0.08,
		sustain: 0,
		release: 0.05,
		rackChain: ['string', 'body'],
		rackParams: {},
		// An empty canvas, so the seeded chain is what sounds: a leftover graph
		// takes precedence over the chain and would silently win.
		rackGraph: startingGraph(),
		graphParams: {},
		advanced: true,
		advancedView: 'rack'
	});
	presetModified.set(true);
	showSaveStatus(tr('synthPanels.toast.newAdvancedPreset'));
	playSound('click');
}

/** Arrow-key cycling from the transport hotkeys: wraps through built-ins and user presets alike. */
export function stepPreset(dir: number): void {
	const n = get(allPresets).length;
	if (!n) return;
	applyPresetAt((((get(soundPresetIdx) + dir) % n) + n) % n);
}

/** The sound the racks are showing: the active track, through the active key in percussion mode. */
function activeTrack(): TrackData | undefined {
	return get(currentTrack);
}

/** "TRK 3: STEEL DRUM / MARIMBA" -> "STEEL DRUM / MARIMBA"; the slot number is not part of the sound. In percussion mode the key is. */
function presetNameFor(track: TrackData): string {
	const base =
		track.name
			.replace(/^TRK\s*\d+\s*:\s*/i, '')
			.trim()
			.toUpperCase() || 'PRESET';
	return track.percussion ? `${base} ${noteNameOf(get(activeKey))}` : base;
}

function uniqueName(base: string, taken: string[]): string {
	if (!taken.includes(base)) return base;
	let n = 2;
	while (taken.includes(`${base} ${n}`)) n++;
	return `${base} ${n}`;
}

/** Store the current preset in the user list, replacing an existing user entry of the same name. */
function upsertUserPreset(p: SoundPreset): void {
	userPresets.update((list) => {
		const i = list.findIndex((u) => u.name === p.name);
		if (i >= 0) {
			const next = [...list];
			next[i] = p;
			return next;
		}
		return [...list, p];
	});
	soundPresetIdx.set(get(allPresets).findIndex((q) => q.name === p.name));
}

/**
 * Can the patch that is selected be written over?
 *
 * Only a user patch can. A built-in is shipped with the instrument and is
 * what every other patch was compared against while it was being built -- if
 * it could be overwritten, a preset the player had never deliberately edited
 * would quietly become something else, with no copy left to go back to.
 *
 * Derived rather than stored, so it cannot disagree with the selection.
 */
/**
 * Asks the patch menu to open its Save As row.
 *
 * A store rather than a call, because the row lives inside PresetMenu and the
 * shortcut is bound on the window: the two never meet directly. Incremented
 * rather than set true, so pressing the shortcut twice reopens it -- a boolean
 * would already be true the second time and nothing would happen.
 */
export const presetSaveAsRequest = writable(0);

/** Open the patch menu's Save As row, from wherever. */
export function openPresetSaveAs(): void {
	presetSaveAsRequest.update((n) => n + 1);
}

export const canOverwritePreset = derived(
	[soundPresetIdx, userPresets],
	([$idx, $user]) => $idx >= SOUND_PRESETS.length && $idx < SOUND_PRESETS.length + $user.length
);

/** The user patch currently selected, or null for a built-in. */
function selectedUserPreset(): { index: number; preset: SoundPreset } | null {
	const idx = get(soundPresetIdx) - SOUND_PRESETS.length;
	const list = get(userPresets);
	if (idx < 0 || idx >= list.length) return null;
	return { index: idx, preset: list[idx] };
}

/**
 * Write the live sound back over the patch it came from.
 *
 * The half that was missing: every save made a *new* patch, because the name
 * went through `uniqueName` whether or not you had one open. Editing a sound
 * you had already saved and saving again left you with SOUND and SOUND 2, and
 * no way to say "no, that one".
 *
 * Keeps the name it had rather than re-deriving one from the track, so a patch
 * called BELL stays BELL after its oscillator changes.
 */
export function saveActivePreset(): void {
	const trk = activeTrack();
	const target = selectedUserPreset();
	// A built-in has nothing to write over; the caller should offer Save As.
	if (!trk || !target) return;
	upsertUserPreset({
		name: target.preset.name,
		preset: pickTimbre(trk as unknown as Record<string, unknown>)
	});
	showSaveStatus(tr('synthPanels.toast.presetSaved', { name: target.preset.name }));
	playSound('click');
}

/**
 * Save the live sound as a new patch.
 *
 * `name` is what the player typed; left out, a name is derived from the track
 * the way it always was. Either way it goes through `uniqueName`, so saving
 * twice under one name gives two patches rather than silently merging them --
 * which is the whole difference between this and the function above.
 */
export function saveActiveAsPreset(name?: string): void {
	const trk = activeTrack();
	if (!trk) return;
	const wanted = (name ?? '').trim().toUpperCase().slice(0, 40) || presetNameFor(trk);
	const unique = uniqueName(
		wanted,
		get(allPresets).map((p) => p.name)
	);
	upsertUserPreset({ name: unique, preset: pickTimbre(trk as unknown as Record<string, unknown>) });
	showSaveStatus(tr('synthPanels.toast.presetSaved', { name: unique }));
	playSound('click');
}

export function deleteUserPreset(userIdx: number): void {
	const removedAbs = SOUND_PRESETS.length + userIdx;
	userPresets.update((list) => list.filter((_, i) => i !== userIdx));
	soundPresetIdx.update((i) => (i === removedAbs ? 0 : i > removedAbs ? i - 1 : i));
	playSound('click');
}

/**
 * Rename a user preset in place. Empty names are ignored; a name another
 * preset (built-in or user) already has gets a numeric suffix rather than
 * silently merging two sounds under one label. Returns the name actually used.
 */
export function renameUserPreset(userIdx: number, rawName: string): string | null {
	const name = rawName.trim().toUpperCase().slice(0, 40);
	if (!name) return null;
	const list = get(userPresets);
	const current = list[userIdx];
	if (!current) return null;
	if (name === current.name) return name;
	const taken = get(allPresets)
		.map((p) => p.name)
		.filter((n) => n !== current.name);
	const finalName = uniqueName(name, taken);
	userPresets.update((l) => l.map((p, i) => (i === userIdx ? { ...p, name: finalName } : p)));
	playSound('click');
	return finalName;
}

export function exportActivePreset(): void {
	const trk = activeTrack();
	if (!trk) return;
	/* The patch's own name, when one is loaded.
	
	   It was the *track's* -- `TRK 1: FLUTE` becomes FLUTE -- which is the right
	   guess for a sound that has never been saved and the wrong one the moment
	   it has. A patch saved as TEST and exported from track 1 came out as
	   `krsz-preset-flute.json` and called itself FLUTE inside, so the file said
	   nothing about what was in it and two different patches exported from one
	   track overwrote each other in the download folder.
	
	   Unmodified, because the selection is only honest while it holds: editing a
	   loaded patch and exporting it would otherwise ship the edits under the old
	   name. Modified, the track name is the better guess again -- it is at least
	   about the sound rather than about a patch this no longer is. */
	const sel = get(allPresets)[get(soundPresetIdx)];
	const name = sel && !get(presetModified) ? sel.name : presetNameFor(trk);
	const file: PresetFile = {
		format: FILE_FORMAT,
		version: 1,
		name,
		timbre: pickTimbre(trk as unknown as Record<string, unknown>)
	};
	const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `krsz-preset-${
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'preset'
	}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	playSound('click');
}

/** Apply a parsed preset file to the active track and keep it in the user list. */
export function applyPresetFile(file: PresetFile): void {
	const timbre = pickTimbre(file.timbre as Record<string, unknown>);
	if (Object.keys(timbre).length === 0) throw new Error('empty preset');
	const base = (typeof file.name === 'string' && file.name.trim().toUpperCase()) || 'IMPORTED';
	// A re-import of the user's own file overwrites its entry; only a clash with
	// a built-in name gets a suffix, since those cannot be replaced.
	const name = SOUND_PRESETS.some((p) => p.name === base)
		? uniqueName(
				base,
				get(allPresets).map((p) => p.name)
			)
		: base;
	upsertUserPreset({ name, preset: timbre });
	updateActiveTrack(timbre);
	showSaveStatus(tr('synthPanels.toast.presetSaved', { name }));
	playSound('toggle');
}

/** The menu's one IMPORT: a kit file lands as a kit, a patch file as a patch, whatever the track is in. */
export function handleImportFile(file: File): void {
	const reader = new FileReader();
	reader.onload = (ev) => {
		try {
			const parsed = JSON.parse(ev.target?.result as string);
			if (isKitFile(parsed)) applyKitFile(parsed);
			else if (isPresetFile(parsed)) applyPresetFile(parsed);
			else throw new Error('not a patch or kit');
		} catch {
			showSaveStatus(tr('synthPanels.toast.notAPreset'));
		}
	};
	reader.readAsText(file);
}

/* ── Kits: a whole key table for a percussion-mode track ───────────────── */

export interface DrumKit {
	name: string;
	keys: Record<number, Partial<TrackData>>;
}

interface KitFile {
	format: typeof KIT_FILE_FORMAT;
	version: 1;
	name: string;
	keys: Record<string, Partial<TrackData>>;
}

function keyOnly(p: Partial<TrackData>): Partial<TrackData> {
	const out: Record<string, unknown> = {};
	for (const k of KEY_TIMBRE_KEYS) if (p[k] !== undefined) out[k] = p[k];
	return out as Partial<TrackData>;
}

export const BUILTIN_KITS: DrumKit[] = [
	{
		name: '808 KIT',
		// The drum machine, in the patch bay: see drum-kits.ts.
		keys: kit808()
	},
	{
		/* JAZZ KIT -- an acoustic kit in the patch bay, on the General MIDI map
		   (notes 35-81) so a drum part written anywhere else plays correctly
		   here. Every drum is its own graph: see drum-kits.ts. */
		name: 'JAZZ KIT',
		keys: jazzKit()
	},
	{
		// The SMB1 noise channel's three beats on the keys the transcription uses; see songs/mario1.ts.
		name: 'SMB1 NES NOISE',
		keys: SMB1_NOISE_KEYS
	}
];

function sanitiseKeys(raw: Record<string, unknown>): Record<number, Partial<TrackData>> {
	const out: Record<number, Partial<TrackData>> = {};
	for (const [k, v] of Object.entries(raw)) {
		const idx = Number(k);
		if (!Number.isInteger(idx) || idx < 0 || idx > 127 || !v || typeof v !== 'object') continue;
		const t = keyOnly(pickTimbre(v as Record<string, unknown>));
		if (Object.keys(t).length) out[idx] = t;
	}
	return out;
}

export function isKitFile(parsed: unknown): parsed is KitFile {
	return (
		typeof parsed === 'object' &&
		parsed !== null &&
		(parsed as KitFile).format === KIT_FILE_FORMAT &&
		typeof (parsed as KitFile).keys === 'object' &&
		(parsed as KitFile).keys !== null
	);
}

function loadUserKits(): DrumKit[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(KIT_STORAGE_KEY);
		if (!raw) return [];
		const list = JSON.parse(raw);
		if (!Array.isArray(list)) return [];
		return list
			.filter((k) => k && typeof k.name === 'string' && k.keys && typeof k.keys === 'object')
			.map((k) => ({ name: String(k.name), keys: sanitiseKeys(k.keys) }));
	} catch {
		return [];
	}
}

export const userKits = writable<DrumKit[]>(loadUserKits());
if (browser) {
	userKits.subscribe((list) => {
		try {
			localStorage.setItem(KIT_STORAGE_KEY, JSON.stringify(list));
		} catch {
			/* quota / private mode */
		}
	});
}

export const allKits = derived(userKits, ($user) => [...BUILTIN_KITS, ...$user]);

function kitNames(): string[] {
	return get(allKits).map((k) => k.name);
}

/** Put a kit on the active track: percussion on, key table replaced. */
export function applyKit(kit: DrumKit): void {
	applyKitToActiveTrack(kit.keys);
	activeKitName.set(kit.name);
	presetModified.set(false);
	showSaveStatus(tr('synthPanels.toast.kitApplied', { name: kit.name }));
	playSound('toggle');
}

function upsertUserKit(kit: DrumKit): void {
	userKits.update((list) => {
		const i = list.findIndex((u) => u.name === kit.name);
		if (i >= 0) {
			const next = [...list];
			next[i] = kit;
			return next;
		}
		return [...list, kit];
	});
}

/** The active track's key table, or null (with the reason shown) when there is no kit to keep. */
function activeKitKeys(): Record<number, Partial<TrackData>> | null {
	const row = get(activeTrackRow);
	const keys = row?.percussion
		? sanitiseKeys((row.keyTimbres ?? {}) as Record<string, unknown>)
		: {};
	if (!Object.keys(keys).length) {
		showSaveStatus(tr('synthPanels.toast.noKitYet'));
		return null;
	}
	return keys;
}

/** The loaded kit is one of the player's own, so SAVE has something to write over. */
export const canOverwriteKit = derived(
	[activeKitName, userKits],
	([$name, $user]) => !!$name && $user.some((k) => k.name === $name)
);

/** Write the key table back over the user kit it was loaded from, keeping its name. */
export function saveActiveKit(): void {
	const name = get(activeKitName);
	if (!name || !get(canOverwriteKit)) return;
	const keys = activeKitKeys();
	if (!keys) return;
	upsertUserKit({ name, keys });
	presetModified.set(false);
	showSaveStatus(tr('synthPanels.toast.kitApplied', { name }));
	playSound('click');
}

/** Keep the active track's key table as a new kit. Needs percussion mode with at least one customised key. */
export function saveActiveAsKit(rawName?: string): void {
	const keys = activeKitKeys();
	if (!keys) return;
	const base =
		(rawName ?? '').trim().toUpperCase().slice(0, 40) ||
		`${
			get(activeTrackRow)!
				.name.replace(/^TRK\s*\d+\s*:\s*/i, '')
				.trim()
				.toUpperCase() || 'KIT'
		} KIT`;
	const name = uniqueName(base, kitNames());
	upsertUserKit({ name, keys });
	showSaveStatus(tr('synthPanels.toast.kitApplied', { name }));
	playSound('click');
}

/* ── One set of actions for both: a percussion track keeps a kit ─────────
   The menu's SAVE / SAVE AS / EXPORT and Ctrl+S act on whatever the active
   track is -- the whole key table when it is in percussion mode, its one
   sound otherwise -- so there is one row of buttons rather than a second set
   for kits that only ever worked on half the tracks. */
const percussionActive = () => !!get(activeTrackRow)?.percussion;

export const canOverwriteActive = derived(
	[activeTrackRow, canOverwritePreset, canOverwriteKit],
	([$row, $preset, $kit]) => ($row?.percussion ? $kit : $preset)
);

export function saveActive(): void {
	if (percussionActive()) saveActiveKit();
	else saveActivePreset();
}

export function saveActiveAs(name?: string): void {
	if (percussionActive()) saveActiveAsKit(name);
	else saveActiveAsPreset(name);
}

export function exportActive(): void {
	if (percussionActive()) exportActiveKit();
	else exportActivePreset();
}

export function deleteUserKit(userIdx: number): void {
	userKits.update((list) => list.filter((_, i) => i !== userIdx));
	playSound('click');
}

export function renameUserKit(userIdx: number, rawName: string): string | null {
	const name = rawName.trim().toUpperCase().slice(0, 40);
	if (!name) return null;
	const current = get(userKits)[userIdx];
	if (!current) return null;
	if (name === current.name) return name;
	const finalName = uniqueName(
		name,
		kitNames().filter((n) => n !== current.name)
	);
	userKits.update((l) => l.map((k, i) => (i === userIdx ? { ...k, name: finalName } : k)));
	playSound('click');
	return finalName;
}

export function exportActiveKit(): void {
	const row = get(activeTrackRow);
	const keys = activeKitKeys();
	if (!keys) return;
	/* The kit's own name when one is loaded, the track's otherwise -- the same
	   reasoning the preset export follows. `activeKitName` is cleared whenever a
	   patch is applied, so it is only set while a kit really is what is loaded. */
	const name =
		get(activeKitName) ||
		row!.name
			.replace(/^TRK\s*\d+\s*:\s*/i, '')
			.trim()
			.toUpperCase() ||
		'KIT';
	const file: KitFile = { format: KIT_FILE_FORMAT, version: 1, name, keys };
	const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `krsz-kit-${
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'kit'
	}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	playSound('click');
}

/** Apply a parsed kit file to the active track and keep it in the user list. */
export function applyKitFile(file: KitFile): void {
	const keys = sanitiseKeys(file.keys as Record<string, unknown>);
	if (!Object.keys(keys).length) throw new Error('empty kit');
	const base = (typeof file.name === 'string' && file.name.trim().toUpperCase()) || 'IMPORTED KIT';
	const name = BUILTIN_KITS.some((k) => k.name === base) ? uniqueName(base, kitNames()) : base;
	upsertUserKit({ name, keys });
	activeKitName.set(name);
	applyKitToActiveTrack(keys);
	showSaveStatus(tr('synthPanels.toast.kitApplied', { name }));
	playSound('toggle');
}
