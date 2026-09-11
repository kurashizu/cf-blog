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

const STORAGE_KEY = 'krsz-synth-presets-v1';
const KIT_STORAGE_KEY = 'krsz-synth-kits-v1';
const FILE_FORMAT = 'krsz-synth-preset';
const KIT_FILE_FORMAT = 'krsz-synth-kit';

/* Ten families, each of which can hold both kinds of sound: an electric one
   built by subtraction on racks 1-7, and an acoustic one built as a signal path
   in the patch bay. The pair is the point -- a LEAD is a lead whether it is a
   saw through a filter or a bowed string -- so they share a heading and `kind`
   separates them within it. */
export type PresetCategory =
	'LEAD' | 'PAD' | 'BASS' | 'PLUCK' | 'KEYBOARD' | 'ORGAN' | 'STRING' | 'MALLET' | 'FX' | 'DRUM';

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
const BASE: Partial<TrackData> = {
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

/* A one-shot: instant on, no sustain, and the legacy attack/decay/sustain/
   release aliases kept in step with the AMP envelope so an old reader of the
   patch agrees with a new one. */
function hit(ampDecay: number, ampRelease: number, extra: Partial<TrackData>): Partial<TrackData> {
	return {
		...BASE,
		osc2Gain: 0,
		ampAttack: 0,
		ampDecay,
		ampSustain: 0,
		ampRelease,
		attack: 0,
		decay: ampDecay,
		sustain: 0,
		release: ampRelease,
		...extra
	};
}

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
	// Nodes sharing a column stack vertically, centred on the ENTRY/OUTPUT line.
	const inColumn = new Map<number, string[]>();
	for (const [id] of nodes) {
		const c = col.get(id) ?? 1;
		inColumn.set(c, [...(inColumn.get(c) ?? []), id]);
	}
	const lastCol = Math.max(1, ...[...inColumn.keys()]);
	const posOf = (id: string) => {
		const c = col.get(id) ?? 1;
		const peers = inColumn.get(c) ?? [id];
		const row = peers.indexOf(id);
		return { x: 48 + c * COL, y: 168 + (row - (peers.length - 1) / 2) * ROW };
	};
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
	const graphNodes: GraphNode[] = [
		{ id: ENTRY_ID, type: 'in', x: 48, y: 168 },
		...nodes.map(([id, type]) => ({ id, type: MIGRATED[type] ?? type, ...posOf(id) })),
		{ id: TRIM_ID, type: 'gain', x: 48 + (lastCol + 1) * COL, y: 168 },
		{ id: OUTPUT_ID, type: 'out', x: 48 + (lastCol + 2) * COL, y: 168 }
	];
	/* The trim, in GAIN's units.
	
	   `outLevel` is a percentage because the old VCA's was, and GAIN's LVL is a
	   plain multiplier -- so the number carries across divided rather than
	   renamed. Copying it straight over would have made every one of these
	   patches a hundred times too loud, which is the kind of migration that
	   passes a type check and fails an ear. */
	const graphParams: Record<string, number> = { [`${TRIM_ID}.level`]: outLevel / 100 };
	for (const [id, type, params] of nodes) {
		for (const [k, v] of Object.entries(params ?? {})) {
			const moved = MIGRATED_PARAMS[`${type}.${k}`];
			if (moved) graphParams[`${id}.${moved[0]}`] = moved[1](v);
			else graphParams[`${id}.${k}`] = v;
		}
	}
	/* 'a>b' is the common case: the OUT socket into the IN socket. A source
	   port is named after a dot ('sp.r>x') for the modules with two outlets --
	   SPLIT's R, ENTRY's TRIG -- and a destination port after a colon
	   ('x>mx:b') for the ones with two inlets. */
	const graphCables: GraphCable[] = cables.map((c) => {
		const [lhs, rest] = c.split('>');
		const [from, fromPort] = lhs.split('.');
		const [to, toPort] = rest.split(':');
		/* Anything a patch sends to OUT goes through the trim on its way, which
		   is what makes the gain stage part of the signal path rather than a
		   setting hidden on the endpoint. */
		const dest = to === OUTPUT_ID ? TRIM_ID : to;
		return { from, fromPort: fromPort || 'out', to: dest, toPort: toPort || 'in' };
	});
	graphCables.push({ from: TRIM_ID, fromPort: 'out', to: OUTPUT_ID, toPort: 'in' });
	// OUT runs when the note does; without this the patch builds and stays mute.
	graphCables.push({ from: ENTRY_ID, fromPort: 'then', to: OUTPUT_ID, toPort: 'exec' });
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
	const missing = missingTypes(graphNodes);
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
	return { rackGraph: { nodes: graphNodes, cables: graphCables }, graphParams };
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
					['brg', 'comb', { combPos: 14, combDepth: 45 }],
					['bod', 'body', { bodySize: 40, bodyDepth: 45, bodyMix: 50 }]
				],
				['pk>ex', 'ex>str', 'str>brg', 'brg>bod', 'bod>output'],
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
					['bar', 'modes', { mode1: 1, mode2: 3.9, mode3: 9.2, modeQ: 22 }],
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
		/* Drawbars, as an organ actually is: separate pipes sounding together,
		   not one oscillator filtered. Four OSC nodes at 1 / 2 / 3 / 4 -- the
		   16', 8', 5 1/3' and 4' drawbars -- summed in pairs and rung through a
		   short SPACE for the Leslie cabinet's room. The odd 3rd is what gives
		   a Hammond its reedy edge; without it this is just a stack of sines. */
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
				/* Drawbars, built the way the instrument is: four oscillators at
				   whole-number multiples of the note, each with its own level,
				   summed. The multiples used to be a RATIO knob on the oscillator
				   and the levels a LVL knob; both were separate primitives inside
				   OSC, so they are a MUL on the frequency and a VCA on the output
				   now -- more modules, and each one says what it does. */
				[
					['pf', 'tofreq'],
					/* The drawbar ratios, as CONSTs into MUL's B.
					
					   These were written as `mul: { mulB: 2 }` -- a param MUL has
					   never had. MUL is two inlets and no knobs, so the ratio was
					   read as nothing and every drawbar ran at the fundamental: an
					   organ with four copies of one pitch. A number a module does
					   not declare is silently absent, which is why the preset test
					   asks the catalogue rather than trusting the literal. */
					['r2', 'const', { kind: 6, value: 2 }],
					['r3', 'const', { kind: 6, value: 3 }],
					['r4', 'const', { kind: 6, value: 4 }],
					['x2', 'mul'],
					['x3', 'mul'],
					['x4', 'mul'],
					['d16', 'osc', { wave: 0 }],
					['d8', 'osc', { wave: 0 }],
					['d5', 'osc', { wave: 0 }],
					['d4', 'osc', { wave: 0 }],
					['g16', 'vca', { gain: 62 }],
					['g8', 'vca', { gain: 40 }],
					['g5', 'vca', { gain: 24 }],
					['g4', 'vca', { gain: 16 }],
					['lo', 'sum'],
					['hi', 'sum'],
					['all', 'sum'],
					['lvl', 'vca', { gain: 54 }],
					['cab', 'space', { spaceSize: 22, spaceDecay: 66, spaceMix: 20 }]
				],
				[
					'entry.pitch>pf:a',
					'pf>d16:pitch',
					'pf>x2:a',
					'pf>x3:a',
					'pf>x4:a',
					'r2>x2:b',
					'r3>x3:b',
					'r4>x4:b',
					'x2>d8:pitch',
					'x3>d5:pitch',
					'x4>d4:pitch',
					'd16>g16',
					'd8>g8',
					'd5>g5',
					'd4>g4',
					'g16>lo',
					'g8>lo',
					'g5>hi',
					'g4>hi',
					'lo>all',
					'hi>all',
					'all>lvl',
					'lvl>cab',
					'cab>output'
				],
				68
			)
		})
	},
	{
		/* A struck bar with no body at all: steel, not wood, so the modes are
		   far apart (1 : 2.7 : 5.4) and ring long. The tremolo is the pair of
		   fans a real vibraphone spins over its resonator tubes -- an LFO into
		   PAN would move it across the stereo field, but a vibraphone's tremolo
		   is amplitude, so it goes into a VCA instead. */
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
					['mal', 'excite', { hardness: 26, exLength: 9, exTone: 2600 }],
					['ex', 'sum'],
					['bar', 'modes', { mode1: 1, mode2: 2.7, mode3: 5.4, modeQ: 44 }],
					['trm', 'vca', { gain: 100 }],
					/* AMT carries what the VCA's DEPTH used to: 60% through a
					   depth of 34 is the same 20% swing, now set in one place. */
					['fan', 'lfo', { lfoWave: 0, lfoRate: 5.5, lfoAmt: 20 }],
					['res', 'tube', { tubeDecay: 1.6, tubeDamp: 30, tubeOdd: 1 }],
					['mx', 'mix', { mixA: 100, mixB: 44 }]
				],
				[
					'mal>ex',
					'ex>bar',
					'bar>trm',
					'fan.cv>trm:cv',
					'trm>mx',
					'ex>res',
					'res>mx:b',
					'mx>output'
				],
				42
			)
		})
	},
	{
		/* A tube closed at one end, overblown: a pan flute is mostly breath.
		   The noise is split, one side delayed a few milliseconds against the
		   other and merged back -- that tiny decorrelation is what makes air
		   sound wide rather than centred, and it is the reason SPLIT and MERGE
		   exist. */
		name: 'PAN FLUTE',
		category: 'STRING',
		kind: 'AC',
		preset: synth({
			presetGain: 0.34,
			osc1Gain: 0,
			osc2Gain: 0,
			subOscGain: 0,
			noiseGain: 0,
			ampAttack: 0.05,
			ampDecay: 0.2,
			ampSustain: 0.8,
			ampRelease: 0.18,
			...patch(
				[
					/* NOISE is white and has no knobs now -- COL was a slope the old
					   composite carried, and a coloured noise is NOISE into FILTER
					   where the slope is a cable you can see. */
					['air', 'noise'],
					['ex', 'vca', { gain: 200 }],
					/* DEPTH was the old composite's welded envelope amount. A filter
					   that opens with the note is ENV into CUTOFF, which is a patch
					   rather than a knob. */
					['edge', 'filter', { type: 1, cutoff: 2200, q: 1.1 }],
					['pipe', 'tube', { tubeDecay: 0.7, tubeDamp: 34, tubeOdd: 1 }],
					['sp', 'split', {}],
					/* A bare delay line: TIME in seconds, and nothing else in the
					   box. FEEDBACK was the loop the graph refuses, TONE was a
					   FILTER after it, and MIX was the dry path the patch already
					   draws -- `air` reaches the output through `edge` as well. */
					['wid', 'delay', { delayTime: 0.007 }],
					['mg', 'merge', {}],
					['rm', 'space', { spaceSize: 44, spaceDecay: 50, spaceMix: 24 }]
				],
				[
					'air>ex',
					'ex>edge',
					'edge>pipe',
					'pipe>sp',
					'sp>mg',
					'sp.r>wid',
					'wid>mg:r',
					'mg>rm',
					'rm>output'
				],
				124
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
					['rg', 'ring', { ringDepth: 110 }],
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
					'c1>sm',
					'rg>sm:b',
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
		// Saw with a square an octave up, plucked and bright.
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
			/* A quill plucks the string and the jack falls back: bright, thin, and
			   entirely without dynamics. The DRIVE is the quill's edge, not
			   distortion -- a plectrum clips the string's first cycle. */
			...patch(
				[
					['qul', 'excite', { hardness: 92, exLength: 2, exTone: 8200 }],
					['ex', 'sum'],
					['str', 'string', { decayTime: 1.1, damping: 6, stiffness: 85 }],
					['edg', 'drive', { driveAmt: 16, driveBias: 20, driveTone: 11000 }],
					['bod', 'body', { bodySize: 25, bodyDepth: 35, bodyMix: 25 }]
				],
				['qul>ex', 'ex>str', 'str>edg', 'edg>bod', 'bod>output'],
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
		// A hammer, a stiff string and a soundboard. STIF is what stretches the
		// partials sharp of the harmonic series -- the reason a piano does not
		// sound like an organ.
		name: 'PIANO',
		category: 'KEYBOARD',
		kind: 'AC',
		preset: synth({
			presetGain: 1.13,
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			cutoff: 9000,
			ampAttack: 0.001,
			ampDecay: 0.06,
			ampSustain: 0,
			ampRelease: 0.03,
			/* Felt hammer, string, and the rest of the instrument ringing with it.
			   The second string is the una corda pair detuned a little against
			   the first -- that beating is most of what makes a piano sound like
			   a piano -- and SPACE stands in for the sympathetic resonance of
			   the undamped strings above. */
			...patch(
				[
					['ham', 'excite', { hardness: 44, exLength: 9, exTone: 3400 }],
					['ex', 'sum'],
					['s1', 'string', { decayTime: 4, damping: 22, stiffness: 45 }],
					['s2', 'string', { decayTime: 3.6, damping: 26, stiffness: 48 }],
					['mx', 'mix', { mixA: 100, mixB: 64 }],
					['bod', 'body', { bodySize: 35, bodyDepth: 55, bodyMix: 55 }],
					['symp', 'space', { spaceSize: 26, spaceDecay: 56, spaceMix: 16 }]
				],
				['ham>ex', 'ex>s1', 's1>mx', 'ex>s2', 's2>mx:b', 'mx>bod', 'bod>symp', 'symp>output'],
				13
			)
		})
	},
	{
		// The same pluck on a slack string in a bigger box.
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
			/* Pick, steel string, spruce top with a soundhole. The EQ scoops the
			   low mids the way a dreadnought's air resonance does, which is what
			   keeps it from sounding like a plain plucked string. */
			...patch(
				[
					['pic', 'excite', { hardness: 62, exLength: 4, exTone: 4600 }],
					['ex', 'sum'],
					['str', 'string', { decayTime: 2.2, damping: 34, stiffness: 6 }],
					['bod', 'body', { bodySize: 62, bodyDepth: 65, bodyMix: 70 }],
					['eq', 'eq', { lowGain: 2, midGain: -3, midFreq: 480, highGain: 2 }]
				],
				['pic>ex', 'ex>str', 'str>bod', 'bod>eq', 'eq>output'],
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
			/* Pulled with the side of a finger, not picked: soft and slow, so the
			   attack is long and dull. The COMP is the one an upright always goes
			   through on a record, and it is what makes the note bloom after the
			   pluck rather than just decay. */
			...patch(
				[
					['fin', 'excite', { hardness: 18, exLength: 22, exTone: 1100 }],
					['ex', 'sum'],
					['str', 'string', { decayTime: 3, damping: 52, stiffness: 3 }],
					['bod', 'body', { bodySize: 88, bodyDepth: 60, bodyMix: 60 }],
					['cmp', 'comp', { compThresh: -22, compRatio: 4, compAttack: 12 }]
				],
				['fin>ex', 'ex>str', 'str>bod', 'bod>cmp', 'cmp>output'],
				48
			)
		})
	},
	{
		// A bow, not a pluck: the excitation sustains, so the envelope holds.
		name: 'BOWED STRINGS',
		category: 'STRING',
		kind: 'AC',
		preset: synth({
			presetGain: 1.36,
			osc1Waveform: 'sawtooth',
			osc1Gain: 1,
			osc2Gain: 0,
			cutoff: 6000,
			ampAttack: 0.09,
			ampDecay: 0.3,
			ampSustain: 0.8,
			ampRelease: 0.25,
			/* A bow, not a strike: BOW drives the string continuously for as long
			   as the note is held, which is the whole difference between this and
			   every plucked patch above. The LFO into PAN is the section moving
			   rather than one player, and SPACE is the room they are in. */
			...patch(
				[
					['bw', 'bow', { bowPressure: 62, bowNoise: 30, bowBite: 42 }],
					['ex', 'sum'],
					['str', 'string', { decayTime: 1.4, damping: 40, stiffness: 2 }],
					['bod', 'body', { bodySize: 55, bodyDepth: 50, bodyMix: 60 }],
					['lfo', 'lfo', { lfoWave: 0, lfoRate: 0.4, lfoAmt: 22 }],
					['pn', 'pan', { panPos: 0 }],
					['rm', 'space', { spaceSize: 52, spaceDecay: 38, spaceMix: 26 }]
				],
				['bw>ex', 'ex>str', 'str>bod', 'bod>pn', 'lfo.cv>pn:cv', 'pn>rm', 'rm>output'],
				47
			)
		})
	},
	{
		// Breath into a tube closed at one end: odd harmonics only.
		name: 'CLARINET',
		category: 'STRING',
		kind: 'AC',
		preset: synth({
			presetGain: 0.34,
			osc1Waveform: 'noise',
			osc1Gain: 0.6,
			osc2Gain: 0,
			cutoff: 5000,
			ampAttack: 0.05,
			ampDecay: 0.2,
			ampSustain: 0.85,
			ampRelease: 0.15,
			/* Breath -> reed -> a cylindrical bore closed at one end, which is why
			   tubeOdd is ODD: a clarinet's even harmonics are nearly absent, and
			   that hollow quality is the instrument. REED is the nonlinearity
			   that makes the bore oscillate at all. */
			...patch(
				[
					['air', 'noise', { colour: 1 }],
					/* NOISE lost its LVL knob -- a level on a source is a VCA
					   welded to it -- so the 66% it used to carry is a VCA. */
					['ex', 'vca', { gain: 66 }],
					['rd', 'reed', { reedStiff: 54, reedBias: 42 }],
					['br', 'tube', { tubeDecay: 1.1, tubeDamp: 45, tubeOdd: 1 }],
					['bel', 'body', { bodySize: 45, bodyDepth: 40, bodyMix: 40 }]
				],
				['air>ex', 'ex>rd', 'rd>br', 'br>bel', 'bel>output'],
				66
			)
		})
	},
	{
		// Open at both ends, so all the harmonics are there.
		name: 'FLUTE',
		category: 'STRING',
		kind: 'AC',
		preset: synth({
			presetGain: 0.36,
			osc1Waveform: 'noise',
			osc1Gain: 0.6,
			osc2Gain: 0,
			cutoff: 5000,
			ampAttack: 0.05,
			ampDecay: 0.2,
			ampSustain: 0.85,
			ampRelease: 0.15,
			/* An edge tone, not a reed: breath split across the embouchure hole
			   drives an open tube, so all harmonics are present (tubeOdd ALL). The
			   breath is mixed in alongside rather than only through the tube --
			   an audible amount of a flute is air that never became a note. */
			...patch(
				[
					['air', 'noise', { colour: 2 }],
					['ex', 'vca', { gain: 200 }],
					['fl', 'filter', { type: 1, cutoff: 2600, q: 3, depth: 520 }],
					['br', 'tube', { tubeDecay: 0.9, tubeDamp: 60, tubeOdd: 0 }],
					['mx', 'mix', { mixA: 100, mixB: 12 }],
					['bel', 'body', { bodySize: 38, bodyDepth: 30, bodyMix: 35 }]
				],
				['air>ex', 'ex>fl', 'fl>br', 'br>mx', 'fl>mx:b', 'mx>bel', 'bel>output'],
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

export function handleImportPresetFile(file: File): void {
	const reader = new FileReader();
	reader.onload = (ev) => {
		try {
			const parsed = JSON.parse(ev.target?.result as string);
			if (!isPresetFile(parsed)) throw new Error('not a preset');
			applyPresetFile(parsed);
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

/* The single drums.
 *
 * Not presets: a player wants a kit, not a lone snare, so these never appear
 * in the menu. They exist because the kits below name them, and because each
 * one is a voice worth keeping the working for -- see BUILTIN_KITS for the
 * measured numbers behind the KRSZ kit.
 */
const DRUM_VOICES: Record<string, Partial<TrackData>> = {
	// Sine with a 2.5-octave pitch drop over 45 ms and a sub underneath it.
	'KICK 808': hit(0.32, 0.06, {
		osc1Waveform: 'sine',
		osc1Gain: 1,
		subOscGain: 0.6,
		pitchEnvAmount: 2.5,
		pitchAttack: 0.001,
		pitchDecay: 0.045,
		cutoff: 3000
	}),
	// Shorter, harder, a triangle for some edge and a burst of noise for the beater.
	'KICK PUNCH': hit(0.17, 0.04, {
		osc1Waveform: 'triangle',
		osc1Gain: 1,
		subOscGain: 0.4,
		noiseGain: 0.15,
		pitchEnvAmount: 3,
		pitchAttack: 0.001,
		pitchDecay: 0.03,
		cutoff: 5000,
		filterEnvAmount: -0.6,
		filterAttack: 0.001,
		filterDecay: 0.05,
		filterSustain: 0
	}),
	// Body from a triangle and a sine a fifth up, rattle from the NOISE mix,
	// a short pitch snap on the body.
	SNARE: hit(0.18, 0.05, {
		osc1Waveform: 'triangle',
		osc1Gain: 0.8,
		osc2Waveform: 'sine',
		osc2Gain: 0.5,
		osc2Semitone: 7,
		noiseGain: 0.9,
		pitchEnvAmount: 1,
		pitchAttack: 0.001,
		pitchDecay: 0.02,
		cutoff: 8000,
		resonance: 0.5,
		keyTracking: 0.5,
		filterEnvAmount: 0.3,
		filterAttack: 0.001,
		filterDecay: 0.08,
		filterSustain: 0,
		airGain: 0.2
	}),
	// Three noise bursts 11 ms apart, high-passed at 1 kHz with the top
	// shelved down -- a band-pass there was 10 dB quieter than the hats.
	CLAP: hit(0.25, 0.08, {
		osc1Waveform: 'noise',
		osc1Gain: 1,
		noiseRetrig: 3,
		noiseRetrigGap: 11,
		filterType: 'highpass',
		cutoff: 1000,
		resonance: 0.7,
		airGain: -0.4
	}),
	'CLOSED HAT': hit(0.045, 0.02, {
		osc1Waveform: 'noise',
		osc1Gain: 1,
		filterType: 'highpass',
		cutoff: 7000,
		resonance: 0.5,
		keyTracking: 0.8,
		airGain: 0.4
	}),
	'OPEN HAT': hit(0.35, 0.15, {
		osc1Waveform: 'noise',
		osc1Gain: 1,
		filterType: 'highpass',
		cutoff: 7000,
		resonance: 0.5,
		keyTracking: 0.8,
		airGain: 0.4
	}),
	// Like the kick but a shallower drop and longer body; play it across a few keys for a rack of toms.
	TOM: hit(0.35, 0.08, {
		osc1Waveform: 'sine',
		osc1Gain: 1,
		osc2Waveform: 'triangle',
		osc2Gain: 0.3,
		subOscGain: 0.3,
		noiseGain: 0.12,
		pitchEnvAmount: 1.2,
		pitchAttack: 0.001,
		pitchDecay: 0.08,
		cutoff: 2500
	}),
	// Two oscillators ring-modulated (sum and difference tones two octaves
	// apart), 40 ms, high-passed so the ping is what is left.
	RIMSHOT: hit(0.04, 0.02, {
		osc1Waveform: 'triangle',
		osc1Gain: 1,
		osc2Waveform: 'square',
		osc2Gain: 1,
		osc2Ratio: 4,
		blendMode: 'ring',
		filterType: 'highpass',
		cutoff: 600,
		resonance: 2,
		pitchEnvAmount: 0.5,
		pitchAttack: 0.001,
		pitchDecay: 0.01,
		airGain: 0.3
	}),
	// Two squares a fifth-ish apart (the 808 uses 540 and 800 Hz), band-passed.
	COWBELL: hit(0.3, 0.1, {
		osc1Waveform: 'square',
		osc1Gain: 1,
		osc2Waveform: 'square',
		osc2Gain: 1,
		osc2Ratio: 1.5,
		filterType: 'bandpass',
		cutoff: 1500,
		resonance: 1
	}),
	// Noise with a soft attack and a filter that opens and closes with it.
	SHAKER: hit(0.08, 0.05, {
		osc1Waveform: 'noise',
		osc1Gain: 1,
		ampAttack: 0.012,
		attack: 0.012,
		filterType: 'bandpass',
		cutoff: 6000,
		resonance: 2,
		keyTracking: 0.6,
		filterEnvAmount: 0.4,
		filterAttack: 0.01,
		filterDecay: 0.05,
		filterSustain: 0
	})
};

function drum(name: string): Partial<TrackData> {
	return keyOnly(DRUM_VOICES[name] ?? {});
}

/* Indices count down from C8 = 0; C4 = 48. The pitched drums were voiced at
   the key they sit on here (kicks at C2, the tom at C3, the rest around C4). */
/* A drum built the acoustic way: a strike into a set of modes into a body.
 *
 * The three modules and their wiring are the same for every drum in the kit --
 * what changes is the numbers, which is the point: a kick and a ride differ in
 * how hard they are hit, what they ring at and how long, not in what they are
 * made of. Written as one function so a drum reads as its physics rather than
 * as forty lines of graph.
 *
 * `tune` is the note the modes are built on, as a multiple of the key's own
 * pitch -- a drum map plays every key at a different frequency, and a kit needs
 * each drum to sound like itself wherever it sits. */
/* What kind of instrument a key is, which decides how its voice is built.
 *
 * Every key used to share one graph -- excite, modes, a parallel noise burst, a
 * body -- with only the knobs differing. That cannot work: a kick is a large
 * damped head, a cymbal is a dense metal plate with no pitch at all, a cowbell
 * is a stiff bar with a few strong partials, and a shaker is nothing but
 * rattling grains. Those are different mechanisms, not one mechanism at
 * different settings, and one topology gives them all the same character
 * however its numbers are set.
 *
 * Each family below is built from what the instrument actually is. */
type DrumFamily =
	/** A large tuned head, heavily damped: kick, toms. Modes into a shell. */
	| 'head'
	/** A tuned head plus wires across it: snare. Two paths, mixed. */
	| 'snare'
	/** A metal plate: cymbals, hats. Dense wash, no pitch, no shell. */
	| 'cymbal'
	/** A stiff struck bar: cowbell, claves, blocks, agogo. Few strong partials. */
	| 'bar'
	/** Rattling grains: shaker, cabasa, maracas, tambourine jingles. */
	| 'shaker'
	/** A stick on a rim: side stick, and the hand clap's burst. */
	| 'stick';

interface DrumSpec {
	family: DrumFamily;
	/** The instrument's own pitch in Hz. Ignored by cymbal and shaker. */
	hz?: number;
	/** Partial ratios above hz, for the families that have them. */
	modes?: [number, number, number];
	/** Ring: roughly q/12 seconds on the lowest partial. */
	q?: number;
	/** Strike: 0 a soft mallet, 100 a hard stick. */
	hard: number;
	/** Contact time in ms. */
	len: number;
	/** Strike brightness in Hz. */
	tone: number;
	/** Shell size 0-100 and how much of it is heard, for the families with one. */
	body?: number;
	bodyMix?: number;
	/** How much rattle, for snare and shaker. */
	snare?: number;
	/** Amp envelope, which gates the whole voice. */
	decay: number;
	release?: number;
	/** Keys sharing a group cut each other off. 0 is none. */
	group?: number;
}

/* Laid out left to right along the signal path, so the canvas reads as the
   instrument's own chain rather than a fixed template. */
const COL = 300;
const node = (id: string, type: string, col: number, row = 0) => ({
	id,
	type,
	x: 48 + col * COL,
	y: 190 + row * 150
});
const wire = (from: string, to: string, toPort = 'in') => ({
	from,
	fromPort: 'out',
	to,
	toPort
});

/* Struck harder means struck brighter.
 *
 * A drum hit hard is not the same sound louder: the stick is in contact for
 * less time, so the strike itself carries more high frequency, and the head is
 * stretched tighter under it. Velocity reached the amp gain and nothing else
 * before ENTRY published it as a pin, which is a large part of why the kit
 * sounded mechanical however carefully the rest was voiced -- every hit was the
 * same timbre at a different level.
 *
 * REMAP rather than a raw cable because EXCT's TONE is in Hz: velocity arrives
 * 0..1 and the knob wants hundreds, which is exactly the conversion the node
 * exists for. */
const velToTone = (target: string, lo: number, hi: number) => ({
	nodes: [{ id: 'vt', type: 'remap', x: 48, y: 40 }],
	cables: [
		{ from: ENTRY_ID, fromPort: 'vel', to: 'vt', toPort: 'a' },
		{ from: 'vt', fromPort: 'out', to: target, toPort: 'exTone' }
	],
	params: { 'vt.inLo': 0, 'vt.inHi': 1, 'vt.outLo': Math.round(lo), 'vt.outHi': Math.round(hi) }
});

/**
 * One drum, built the way that kind of instrument is built.
 *
 * The graph differs per family; only the amp envelope and the output trim are
 * common, because those belong to the voice rather than to the instrument.
 */
function drumPatch(o: DrumSpec): Partial<TrackData> {
	const hz = o.hz ?? 200;
	const modes = o.modes ?? [1, 2.4, 4.6];
	const q = o.q ?? 8;
	let nodes: { id: string; type: string; x: number; y: number }[];
	let cables: { from: string; fromPort: string; to: string; toPort: string }[];
	let gp: Record<string, number> = {};

	if (o.family === 'cymbal') {
		/* A plate has no tuned body and no shell: what makes it a cymbal is a
		   dense metal wash. A long noise burst through a high-pass, with a comb
		   for the closely spaced plate modes that give it its shimmer, and a
		   short space so it is a cymbal in a room rather than a hiss. */
		nodes = [
			node(ENTRY_ID, 'in', 0),
			node('n', 'excite', 1),
			node('hp', 'filter', 2),
			node('cb', 'comb', 3),
			node('sp', 'space', 4),
			node(OUTPUT_ID, 'out', 5)
		];
		cables = [wire('n', 'hp'), wire('hp', 'cb'), wire('cb', 'sp'), wire('sp', OUTPUT_ID)];
		gp = {
			'n.hardness': o.hard,
			'n.exLength': Math.min(60, Math.max(2, Math.round(o.len * 6))),
			'n.exTone': o.tone,
			'hp.type': 2,
			'hp.cutoff': Math.max(1500, o.tone * 0.45),
			'hp.q': 0.6,
			'hp.depth': 0,
			// Short comb: the plate's own closely spaced modes, not an echo.
			'cb.combPos': 3,
			'cb.combDepth': Math.round(40 + q * 1.2),
			/* The plate's ring lives in SPACE, so its size has to carry the
			   whole tail: a crash written for 1.6 s measured 0.48 with the size
			   capped at 70. A convolver rings for the length of its impulse,
			   which is spaceSize/100 * 3 seconds.
			
			   DECAY now reads the way it is labelled -- higher is a longer tail
			   -- so a cymbal written to ring wants more of it, which is the
			   direction this already asked for. */
			'sp.spaceSize': Math.round(Math.min(100, 20 + o.decay * 50)),
			'sp.spaceDecay': Math.round(Math.min(95, 40 + o.decay * 34)),
			'sp.spaceMix': Math.round(Math.min(85, 45 + o.decay * 20))
		};
	} else if (o.family === 'shaker') {
		/* Grains, not a body: many tiny collisions. A bandpassed burst with no
		   resonator at all -- adding one is what made every shaker in the kit
		   sound like a small tuned drum. */
		nodes = [
			node(ENTRY_ID, 'in', 0),
			node('n', 'excite', 1),
			node('bp', 'filter', 2),
			node('sh', 'delay', 3),
			node(OUTPUT_ID, 'out', 4)
		];
		cables = [wire('n', 'bp'), wire('bp', 'sh'), wire('sh', OUTPUT_ID)];
		gp = {
			'n.hardness': o.hard,
			'n.exLength': Math.min(60, Math.max(6, Math.round(o.decay * 220))),
			'n.exTone': o.tone,
			'bp.type': 1,
			'bp.cutoff': o.tone,
			'bp.q': 0.8,
			'bp.depth': 0,
			/* The shell the grains rattle inside. EXCT's burst caps at 60 ms, so
			   without something to sustain it a cabasa was over in 0.02 s.
			
			   A short delay with feedback, not a comb: COMB is feed-forward --
			   it notches, it never rings -- so it left the tail exactly as
			   short. Each lap is another handful of beads hitting the shell,
			   which is what a shaker is. */
			'sh.dlTime': 11,
			'sh.dlFeedback': Math.round(Math.min(82, 30 + o.decay * 110)),
			'sh.dlTone': Math.min(12000, o.tone),
			'sh.dlMix': 78
		};
	} else if (o.family === 'bar') {
		/* A stiff bar rings at a few strong, widely spaced partials and has
		   almost no shell. Struck modes straight out, with a touch of drive for
		   the metallic edge a hard strike puts on one. */
		nodes = [
			node(ENTRY_ID, 'in', 0),
			node('e', 'excite', 1),
			node('m', 'modes', 2),
			node('dr', 'drive', 3),
			node(OUTPUT_ID, 'out', 4)
		];
		cables = [wire('e', 'm'), wire('m', 'dr'), wire('dr', OUTPUT_ID)];
		gp = {
			'e.hardness': o.hard,
			'e.exLength': o.len,
			'e.exTone': Math.min(o.tone, hz * 5),
			'm.mode1': modes[0],
			'm.mode2': modes[1],
			'm.mode3': modes[2],
			'm.modeQ': q,
			'm.modeMix': 100,
			'm.modeHz': hz,
			'dr.driveAmt': 12,
			'dr.driveBias': 20,
			'dr.driveTone': Math.min(16000, hz * 12)
		};
	} else if (o.family === 'stick') {
		/* Wood on wood, or a hand clap. The strike is the whole event, but it
		   still rings briefly: a clave is a tuned wooden bar, not a click.
		
		   Built as a burst into a short resonance, because EXCT alone caps at
		   60 ms and measured a 0.01 s decay -- a frame or two, inaudible as
		   anything but a tick. MODES gives it the pitch a struck block has,
		   with the Q short enough that it stays a knock. */
		nodes = [
			node(ENTRY_ID, 'in', 0),
			node('n', 'excite', 1),
			node('m', 'modes', 2),
			node(OUTPUT_ID, 'out', 3)
		];
		cables = [wire('n', 'm'), wire('m', OUTPUT_ID)];
		gp = {
			'n.hardness': o.hard,
			'n.exLength': Math.min(60, Math.max(2, Math.round(o.len * 4))),
			'n.exTone': o.tone,
			'm.mode1': 1,
			'm.mode2': 2.8,
			'm.mode3': 5.4,
			/* Q well above decay*12: the higher partials are damped by r^0.6, so
			   the audible tail is a fraction of what the lowest mode promises.
			   A clave measured 0.03 s against the 0.09 it was written for. */
			'm.modeQ': Math.max(3, Math.round(o.decay * 40)),
			'm.modeMix': 82,
			'm.modeHz': hz
		};
	} else if (o.family === 'snare') {
		/* The one instrument that really is two: a tuned head, and wires
		   rattling against it. They are summed because you hear both at once --
		   the head gives the pitch, the wires the sizzle. */
		nodes = [
			node(ENTRY_ID, 'in', 0),
			node('e', 'excite', 1, -1),
			node('m', 'modes', 2, -1),
			node('n', 'excite', 1, 1),
			node('hp', 'filter', 2, 1),
			node('mx', 'mix', 3),
			node('b', 'body', 4),
			node(OUTPUT_ID, 'out', 5)
		];
		cables = [
			wire('e', 'm'),
			wire('m', 'mx'),
			wire('n', 'hp'),
			wire('hp', 'mx', 'b'),
			wire('mx', 'b'),
			wire('b', OUTPUT_ID)
		];
		gp = {
			'e.hardness': o.hard,
			'e.exLength': o.len,
			'e.exTone': Math.min(o.tone, hz * 6),
			'm.mode1': modes[0],
			'm.mode2': modes[1],
			'm.mode3': modes[2],
			'm.modeQ': q,
			'm.modeMix': 100,
			'm.modeHz': hz,
			// The wires: long, bright, and high-passed clear of the head.
			'n.hardness': 0,
			'n.exLength': Math.min(60, Math.round(o.len * 8)),
			'n.exTone': o.tone,
			'hp.type': 2,
			'hp.cutoff': Math.max(900, hz * 4),
			'hp.q': 0.6,
			'hp.depth': 0,
			'mx.mixA': 100,
			'mx.mixB': Math.round(o.snare ?? 60),
			'b.bodySize': o.body ?? 20,
			'b.bodyDepth': 45,
			'b.bodyMix': o.bodyMix ?? 40
		};
	} else {
		/* A head: struck modes into the shell they are stretched over. A kick
		   and a tom are the same instrument at different sizes, which is why
		   they share this and nothing else does. */
		nodes = [
			node(ENTRY_ID, 'in', 0),
			node('e', 'excite', 1),
			node('m', 'modes', 2),
			node('b', 'body', 3),
			node(OUTPUT_ID, 'out', 4)
		];
		cables = [wire('e', 'm'), wire('m', 'b'), wire('b', OUTPUT_ID)];
		gp = {
			'e.hardness': o.hard,
			'e.exLength': o.len,
			// A beater on a big head is dull: the click belongs near the drum.
			'e.exTone': Math.min(o.tone, Math.max(300, hz * 6)),
			'm.mode1': modes[0],
			'm.mode2': modes[1],
			'm.mode3': modes[2],
			'm.modeQ': q,
			'm.modeMix': 100,
			'm.modeHz': hz,
			'b.bodySize': o.body ?? 30,
			'b.bodyDepth': 50,
			'b.bodyMix': o.bodyMix ?? 60
		};
	}

	/* Velocity into the strike's brightness, for every family that has a strike.
	   The shaker and the cymbal have one too -- a hard shake is a sharper rattle
	   -- so this is not limited to the drums with heads. */
	const strike = nodes.find((n) => n.type === 'excite');
	if (strike) {
		const base = Math.min(o.tone, 12000);
		const vt = velToTone(strike.id, base * 0.45, base);
		nodes = [...nodes, ...vt.nodes];
		cables = [...cables, ...vt.cables];
		gp = { ...gp, ...vt.params };
	}

	/* The kit's own trim, as a gain stage rather than a knob on OUT: a drum
	   graph arrives far hotter than a melodic one, and 15% is where the 47 keys
	   sit level with the rest of the instrument. */
	const TRIM = 'trim';
	const outNode = nodes.find((n) => n.id === OUTPUT_ID)!;
	nodes = [...nodes, { id: TRIM, type: 'vca', x: outNode.x, y: outNode.y }];
	outNode.x += COL;
	cables = cables.map((c) => (c.to === OUTPUT_ID ? { ...c, to: TRIM } : c));
	cables = [
		...cables,
		wire(TRIM, OUTPUT_ID),
		{ from: ENTRY_ID, fromPort: 'then', to: OUTPUT_ID, toPort: 'exec' }
	];
	gp[`${TRIM}.gain`] = 15;

	/* Held back with the melodic patches above, and for the same reason: every
	   drum key here is wired out of primitives the catalogue no longer carries,
	   so the graph would load, draw, and play nothing. `advanced` goes with it --
	   a track switched to ADV with an empty patch is silent, where left on the
	   racks it still plays the kit. */
	void nodes;
	void cables;
	void gp;
	return keyOnly({
		ampAttack: 0.001,
		/* The envelope must not close before the instrument has finished
		   sounding: a crash written to ring 1.3 s measured 0.25 because the amp
		   gate reaped the voice first. */
		/* The gate opens well past where the instrument is meant to be audible.
		
		   An exponential amp decay reaches -40 dB at roughly 40% of its setting,
		   so a clave written for 0.09 s died at 0.03 -- a tick rather than a
		   knock. The short percussion suffered most because nothing downstream
		   was ringing to cover the gate closing. */
		ampDecay: Math.max(o.decay * 2.5, q / 12),
		ampSustain: 0,
		ampRelease: o.release ?? 0.04,
		muteGroup: o.group ?? 0
	});
}

export const BUILTIN_KITS: DrumKit[] = [
	{
		name: '808 KIT',
		keys: {
			72: drum('KICK 808'), // C2
			70: drum('KICK PUNCH'), // D2
			60: drum('TOM'), // C3
			48: drum('SNARE'), // C4
			46: drum('CLAP'), // D4
			44: drum('CLOSED HAT'), // E4
			43: drum('OPEN HAT'), // F4
			41: drum('RIMSHOT'), // G4
			39: drum('COWBELL'), // A4
			37: drum('SHAKER') // B4
		}
	},
	{
		/* JAZZ KIT -- built in the patch bay rather than from oscillators.
		 *
		 * Every drum here is the same three ideas an acoustic drum actually is:
		 * something strikes a surface (EXCT), the surface rings at frequencies
		 * that are not a harmonic series (MODES), and a shell or a cymbal body
		 * colours what comes off it (BODY). The 808 kit next to it is the other
		 * way of doing this -- oscillators and envelopes, which is what a drum
		 * machine is -- so the two are different instruments rather than two
		 * attempts at one.
		 *
		 * A jazz kit rather than a rock one: smaller shells tuned higher, sticks
		 * rather than beaters, and cymbals that are thin and quick. That is what
		 * the numbers below say -- short decays, high mode ratios, and a light
		 * strike.
		 *
		 * Laid out on the General MIDI map (notes 35-81), so a MIDI drum part
		 * written anywhere else plays correctly here.
		 */
		name: 'JAZZ KIT',
		keys: {
			// GM 35 ACOUSTIC BASS DRUM
			73: drumPatch({
				family: 'head',
				hz: 48,
				modes: [1, 1.59, 2.14],
				q: 5,
				hard: 26,
				len: 11,
				tone: 900,
				body: 42,
				bodyMix: 72,
				decay: 0.34
			}),
			// GM 36 BASS DRUM 1
			72: drumPatch({
				family: 'head',
				hz: 58,
				modes: [1, 1.59, 2.14],
				q: 4,
				hard: 34,
				len: 9,
				tone: 1100,
				body: 36,
				bodyMix: 70,
				decay: 0.26
			}),
			// GM 37 SIDE STICK
			71: drumPatch({ family: 'stick', hz: 780, hard: 92, len: 2, tone: 6000, decay: 0.07 }),
			// GM 38 ACOUSTIC SNARE
			70: drumPatch({
				family: 'snare',
				hz: 185,
				modes: [1, 1.59, 2.14],
				q: 6,
				hard: 68,
				len: 3,
				tone: 5200,
				body: 20,
				bodyMix: 40,
				snare: 70,
				decay: 0.22
			}),
			// GM 39 HAND CLAP
			69: drumPatch({ family: 'stick', hz: 1500, hard: 70, len: 6, tone: 4200, decay: 0.18 }),
			// GM 40 ELECTRIC SNARE
			68: drumPatch({
				family: 'snare',
				hz: 210,
				modes: [1, 1.59, 2.14],
				q: 5,
				hard: 80,
				len: 2,
				tone: 6200,
				body: 16,
				bodyMix: 34,
				snare: 78,
				decay: 0.18
			}),
			// GM 41 LOW FLOOR TOM
			67: drumPatch({
				family: 'head',
				hz: 78,
				modes: [1, 1.59, 2.14],
				q: 11,
				hard: 42,
				len: 7,
				tone: 1500,
				body: 44,
				bodyMix: 64,
				decay: 0.6
			}),
			// GM 42 CLOSED HI-HAT
			66: drumPatch({
				family: 'cymbal',
				q: 4,
				hard: 94,
				len: 2,
				tone: 9000,
				decay: 0.06,
				group: 1
			}),
			// GM 43 HIGH FLOOR TOM
			65: drumPatch({
				family: 'head',
				hz: 94,
				modes: [1, 1.59, 2.14],
				q: 10,
				hard: 44,
				len: 7,
				tone: 1600,
				body: 40,
				bodyMix: 62,
				decay: 0.54
			}),
			// GM 44 PEDAL HI-HAT
			64: drumPatch({ family: 'cymbal', q: 5, hard: 88, len: 3, tone: 8200, decay: 0.1, group: 1 }),
			// GM 45 LOW TOM
			63: drumPatch({
				family: 'head',
				hz: 115,
				modes: [1, 1.59, 2.14],
				q: 9,
				hard: 46,
				len: 6,
				tone: 1800,
				body: 36,
				bodyMix: 60,
				decay: 0.46
			}),
			// GM 46 OPEN HI-HAT
			62: drumPatch({
				family: 'cymbal',
				q: 12,
				hard: 86,
				len: 6,
				tone: 8000,
				decay: 0.55,
				group: 1
			}),
			// GM 47 LOW-MID TOM
			61: drumPatch({
				family: 'head',
				hz: 142,
				modes: [1, 1.59, 2.14],
				q: 8,
				hard: 48,
				len: 6,
				tone: 2000,
				body: 32,
				bodyMix: 58,
				decay: 0.4
			}),
			// GM 48 HI-MID TOM
			60: drumPatch({
				family: 'head',
				hz: 172,
				modes: [1, 1.59, 2.14],
				q: 8,
				hard: 50,
				len: 5,
				tone: 2200,
				body: 28,
				bodyMix: 56,
				decay: 0.35
			}),
			// GM 49 CRASH CYMBAL 1
			59: drumPatch({ family: 'cymbal', q: 30, hard: 72, len: 8, tone: 7000, decay: 1.6 }),
			// GM 50 HIGH TOM
			58: drumPatch({
				family: 'head',
				hz: 205,
				modes: [1, 1.59, 2.14],
				q: 7,
				hard: 52,
				len: 5,
				tone: 2400,
				body: 24,
				bodyMix: 54,
				decay: 0.3
			}),
			// GM 51 RIDE CYMBAL 1
			57: drumPatch({ family: 'cymbal', q: 26, hard: 90, len: 3, tone: 7600, decay: 1.4 }),
			// GM 52 CHINESE CYMBAL
			56: drumPatch({ family: 'cymbal', q: 24, hard: 84, len: 7, tone: 6000, decay: 1.1 }),
			// GM 53 RIDE BELL
			55: drumPatch({
				family: 'bar',
				hz: 520,
				modes: [1, 2.0, 3.01],
				q: 26,
				hard: 94,
				len: 2,
				tone: 9000,
				decay: 1.1
			}),
			// GM 54 TAMBOURINE
			54: drumPatch({ family: 'cymbal', q: 8, hard: 92, len: 3, tone: 9500, decay: 0.3 }),
			// GM 55 SPLASH CYMBAL
			53: drumPatch({ family: 'cymbal', q: 14, hard: 80, len: 4, tone: 8600, decay: 0.55 }),
			// GM 56 COWBELL
			52: drumPatch({
				family: 'bar',
				hz: 540,
				modes: [1, 1.52, 2.71],
				q: 14,
				hard: 88,
				len: 3,
				tone: 6800,
				decay: 0.35
			}),
			// GM 57 CRASH CYMBAL 2
			51: drumPatch({ family: 'cymbal', q: 32, hard: 70, len: 8, tone: 6600, decay: 1.8 }),
			// GM 58 VIBRASLAP
			50: drumPatch({
				family: 'bar',
				hz: 380,
				modes: [1, 2.7, 4.9],
				q: 20,
				hard: 92,
				len: 4,
				tone: 5200,
				decay: 0.85
			}),
			// GM 59 RIDE CYMBAL 2
			49: drumPatch({ family: 'cymbal', q: 28, hard: 88, len: 3, tone: 7200, decay: 1.55 }),
			// GM 60 HI BONGO
			48: drumPatch({
				family: 'head',
				hz: 330,
				modes: [1, 1.59, 2.14],
				q: 6,
				hard: 62,
				len: 4,
				tone: 3200,
				body: 16,
				bodyMix: 44,
				decay: 0.2
			}),
			// GM 61 LOW BONGO
			47: drumPatch({
				family: 'head',
				hz: 232,
				modes: [1, 1.59, 2.14],
				q: 6,
				hard: 60,
				len: 4,
				tone: 2800,
				body: 20,
				bodyMix: 46,
				decay: 0.24
			}),
			// GM 62 MUTE HI CONGA
			46: drumPatch({
				family: 'head',
				hz: 292,
				modes: [1, 1.59, 2.14],
				q: 3,
				hard: 66,
				len: 3,
				tone: 3000,
				body: 14,
				bodyMix: 38,
				decay: 0.11
			}),
			// GM 63 OPEN HI CONGA
			45: drumPatch({
				family: 'head',
				hz: 262,
				modes: [1, 1.59, 2.14],
				q: 8,
				hard: 58,
				len: 5,
				tone: 2600,
				body: 22,
				bodyMix: 50,
				decay: 0.32
			}),
			// GM 64 LOW CONGA
			44: drumPatch({
				family: 'head',
				hz: 180,
				modes: [1, 1.59, 2.14],
				q: 8,
				hard: 54,
				len: 6,
				tone: 2200,
				body: 28,
				bodyMix: 54,
				decay: 0.38
			}),
			// GM 65 HIGH TIMBALE
			43: drumPatch({
				family: 'head',
				hz: 330,
				modes: [1, 1.59, 2.14],
				q: 9,
				hard: 76,
				len: 3,
				tone: 4200,
				body: 12,
				bodyMix: 34,
				decay: 0.3
			}),
			// GM 66 LOW TIMBALE
			42: drumPatch({
				family: 'head',
				hz: 262,
				modes: [1, 1.59, 2.14],
				q: 9,
				hard: 74,
				len: 3,
				tone: 3800,
				body: 14,
				bodyMix: 36,
				decay: 0.34
			}),
			// GM 67 HIGH AGOGO
			41: drumPatch({
				family: 'bar',
				hz: 780,
				modes: [1, 1.55, 2.68],
				q: 16,
				hard: 90,
				len: 2,
				tone: 7400,
				decay: 0.32
			}),
			// GM 68 LOW AGOGO
			40: drumPatch({
				family: 'bar',
				hz: 620,
				modes: [1, 1.55, 2.68],
				q: 16,
				hard: 90,
				len: 2,
				tone: 7000,
				decay: 0.36
			}),
			// GM 69 CABASA
			39: drumPatch({ family: 'shaker', hard: 90, len: 3, tone: 7000, decay: 0.12 }),
			// GM 70 MARACAS
			38: drumPatch({ family: 'shaker', hard: 92, len: 2, tone: 7800, decay: 0.1 }),
			// GM 71 SHORT WHISTLE
			37: drumPatch({
				family: 'bar',
				hz: 1700,
				modes: [1, 2.0, 3.0],
				q: 30,
				hard: 40,
				len: 6,
				tone: 3000,
				decay: 0.22
			}),
			// GM 72 LONG WHISTLE
			36: drumPatch({
				family: 'bar',
				hz: 1500,
				modes: [1, 2.0, 3.0],
				q: 34,
				hard: 40,
				len: 14,
				tone: 2800,
				decay: 0.6
			}),
			// GM 73 SHORT GUIRO
			35: drumPatch({ family: 'shaker', hard: 76, len: 5, tone: 4000, decay: 0.16 }),
			// GM 74 LONG GUIRO
			34: drumPatch({ family: 'shaker', hard: 74, len: 14, tone: 3800, decay: 0.42 }),
			// GM 75 CLAVES
			33: drumPatch({ family: 'stick', hz: 2500, hard: 98, len: 1, tone: 9000, decay: 0.09 }),
			// GM 76 HI WOOD BLOCK
			32: drumPatch({ family: 'stick', hz: 1200, hard: 96, len: 1, tone: 8000, decay: 0.1 }),
			// GM 77 LOW WOOD BLOCK
			31: drumPatch({ family: 'stick', hz: 900, hard: 94, len: 2, tone: 7000, decay: 0.12 }),
			// GM 78 MUTE CUICA
			30: drumPatch({
				family: 'bar',
				hz: 420,
				modes: [1, 2.0, 3.0],
				q: 8,
				hard: 44,
				len: 5,
				tone: 1800,
				decay: 0.16
			}),
			// GM 79 OPEN CUICA
			29: drumPatch({
				family: 'bar',
				hz: 350,
				modes: [1, 2.0, 3.0],
				q: 14,
				hard: 42,
				len: 8,
				tone: 1600,
				decay: 0.4
			}),
			// GM 80 MUTE TRIANGLE
			28: drumPatch({
				family: 'bar',
				hz: 4200,
				modes: [1, 2.14, 3.41],
				q: 8,
				hard: 96,
				len: 1,
				tone: 12000,
				decay: 0.1
			}),
			// GM 81 OPEN TRIANGLE
			27: drumPatch({
				family: 'bar',
				hz: 4200,
				modes: [1, 2.14, 3.41],
				q: 44,
				hard: 96,
				len: 1,
				tone: 12000,
				decay: 1.6
			})
		}
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

/** Keep the active track's key table as a kit. Needs percussion mode with at least one customised key. */
export function saveActiveAsKit(): void {
	const row = get(activeTrackRow);
	const keys = row?.percussion
		? sanitiseKeys((row.keyTimbres ?? {}) as Record<string, unknown>)
		: {};
	if (!Object.keys(keys).length) {
		showSaveStatus(tr('synthPanels.toast.noKitYet'));
		return;
	}
	const base =
		row!.name
			.replace(/^TRK\s*\d+\s*:\s*/i, '')
			.trim()
			.toUpperCase() || 'KIT';
	const name = uniqueName(`${base} KIT`, kitNames());
	upsertUserKit({ name, keys });
	showSaveStatus(tr('synthPanels.toast.kitApplied', { name }));
	playSound('click');
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
	const keys = row?.percussion
		? sanitiseKeys((row.keyTimbres ?? {}) as Record<string, unknown>)
		: {};
	if (!Object.keys(keys).length) {
		showSaveStatus(tr('synthPanels.toast.noKitYet'));
		return;
	}
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

export function handleImportKitFile(file: File): void {
	const reader = new FileReader();
	reader.onload = (ev) => {
		try {
			const parsed = JSON.parse(ev.target?.result as string);
			if (isKitFile(parsed)) applyKitFile(parsed);
			else if (isPresetFile(parsed)) applyPresetFile(parsed);
			else throw new Error('not a kit');
		} catch {
			showSaveStatus(tr('synthPanels.toast.notAKit'));
		}
	};
	reader.readAsText(file);
}
