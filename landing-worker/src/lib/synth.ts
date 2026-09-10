import {
	laneAt,
	lanesOf,
	laneToVelocity,
	VELOCITY_LANE_ID,
	type NoteLane
} from './stores/note-lanes';
import { EXEC_PORT_IDS, MODULE_SPECS, WAVE_SHAPES } from './stores/synth-modules';
import {
	createResolver,
	execReach,
	execDelays,
	runs,
	isPureNode,
	PURE_NODES
} from './stores/node-graph';
import { graphOf } from './stores/graph-model';
import { tr } from './i18n';
import { soundEngine } from './sound';
import { UNDERWATER_TRACKS } from './songs/underwater';
import { OVERWORLD_TRACKS } from './songs/overworld';
import { OVERWORLD_FULL_TRACKS } from './songs/overworld-full';
import { MARIO1_TRACKS } from './songs/mario1';
import { SPAIN_TRACKS, SPAIN_STEPS } from './songs/spain';
import { TAKE_FIVE_TRACKS, TAKE_FIVE_STEPS } from './songs/take-five';

/* Basic waves, buffer sources (noise, the 808-style METAL bank), stacked
   waves (PWM = two saws with a slowly drifting phase, SUPERSAW = five detuned
   saws), harmonic tables (ORGAN drawbars, FOLD = a folded sine), and user
   drawn tables registered at runtime as `custom:<id>`. */
export type SynthWaveform =
	| 'sawtooth'
	| 'square'
	| 'sine'
	| 'triangle'
	| 'noise'
	| 'metal'
	| 'pwm'
	| 'supersaw'
	| 'organ'
	| 'fold'
	| `custom:${string}`;

export const BASIC_WAVES: SynthWaveform[] = ['square', 'sawtooth', 'triangle', 'sine'];
export const NOISE_WAVES: SynthWaveform[] = ['noise', 'metal'];
export const ADVANCED_WAVES: SynthWaveform[] = ['pwm', 'supersaw', 'organ', 'fold'];

export interface CustomWave {
	id: string;
	name: string;
	/** One cycle, -1..1, any length (128 is what the editor draws). */
	samples: number[];
}

/* The knobs behind the ADVANCED waves. They live on the track (and on a
   percussion key), like PW does, and are shared by OSC1 and OSC2. */
export interface WaveParams {
	pwmWidth?: number; // 5..95 %, the duty cycle the sweep centres on
	pwmRate?: number; // 0.1..10 Hz
	pwmDepth?: number; // 0..100 %, how far the width sweeps
	ssawSpread?: number; // 0..50 cents, the outer saws' detune
	ssawMix?: number; // 0..100 %, companions against the centre saw
	foldAmt?: number; // 1..8, drive into the folder
	org1?: number;
	org2?: number;
	org3?: number;
	org4?: number;
	org5?: number;
	org8?: number; // drawbars 0..8
}
export interface WaveParamSpec {
	key: keyof WaveParams;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
	def: number;
	hint: string;
}
export const WAVE_PARAM_SPECS: Partial<Record<SynthWaveform, WaveParamSpec[]>> = {
	pwm: [
		{
			key: 'pwmWidth',
			label: 'PW',
			min: 5,
			max: 95,
			step: 5,
			unit: '%',
			def: 50,
			hint: 'Duty cycle the sweep centres on'
		},
		{
			key: 'pwmRate',
			label: 'RATE',
			min: 0.1,
			max: 10,
			step: 0.1,
			unit: 'Hz',
			def: 0.4,
			hint: 'How fast the width sweeps'
		},
		{
			key: 'pwmDepth',
			label: 'DPTH',
			min: 0,
			max: 100,
			step: 5,
			unit: '%',
			def: 40,
			hint: 'How far the width sweeps either side of WIDTH; 0 = a fixed pulse'
		}
	],
	supersaw: [
		{
			key: 'ssawSpread',
			label: 'SPRD',
			min: 0,
			max: 50,
			step: 1,
			unit: 'c',
			def: 19,
			hint: 'Detune of the outer saws, in cents; the inner pair sits at half'
		},
		{
			key: 'ssawMix',
			label: 'MIX',
			min: 0,
			max: 100,
			step: 5,
			unit: '%',
			def: 60,
			hint: 'Level of the four companion saws against the centre one'
		}
	],
	organ: [
		{
			key: 'org1',
			label: 'H1',
			min: 0,
			max: 8,
			step: 1,
			unit: '',
			def: 8,
			hint: 'Fundamental drawbar'
		},
		{ key: 'org2', label: 'H2', min: 0, max: 8, step: 1, unit: '', def: 6, hint: 'Octave drawbar' },
		{
			key: 'org3',
			label: 'H3',
			min: 0,
			max: 8,
			step: 1,
			unit: '',
			def: 4,
			hint: 'Twelfth drawbar (3rd harmonic)'
		},
		{
			key: 'org4',
			label: 'H4',
			min: 0,
			max: 8,
			step: 1,
			unit: '',
			def: 4,
			hint: 'Two-octave drawbar'
		},
		{
			key: 'org5',
			label: 'H5',
			min: 0,
			max: 8,
			step: 1,
			unit: '',
			def: 2,
			hint: 'Seventeenth drawbar (5th harmonic)'
		},
		{
			key: 'org8',
			label: 'H8',
			min: 0,
			max: 8,
			step: 1,
			unit: '',
			def: 2,
			hint: 'Three-octave drawbar'
		}
	],
	fold: [
		{
			key: 'foldAmt',
			label: 'FOLD',
			min: 1,
			max: 8,
			step: 0.2,
			unit: 'x',
			def: 2.6,
			hint: 'Drive into the folder; more folds, brighter'
		}
	]
};
const WAVE_PARAM_DEFAULTS: Record<keyof WaveParams, number> = Object.fromEntries(
	Object.values(WAVE_PARAM_SPECS)
		.flatMap((a) => a ?? [])
		.map((sp) => [sp.key, sp.def])
) as Record<keyof WaveParams, number>;
export function waveParam(p: WaveParams | undefined, key: keyof WaveParams): number {
	return p?.[key] ?? WAVE_PARAM_DEFAULTS[key];
}

// ISO 226 / Fletcher-Munson Perceptual Equal Loudness Normalization Scale
// Compares harmonic rich waveforms (Square/Saw) against pure fundamental tones (Sine/Triangle)
export function getWaveformPerceptualScale(w: SynthWaveform): number {
	switch (w) {
		case 'sine':
			return 1.18; // Pure sine fundamental boost (+1.4dB)
		case 'triangle':
			return 1.05; // Triangle mostly fundamental (+0.4dB)
		case 'sawtooth':
			return 0.82; // Sawtooth all harmonics (-1.7dB)
		case 'square':
			return 0.74; // Square odd harmonics concentrated in 2-4kHz (-2.6dB)
		// Noise used to be scaled 0.70 like a sustained wave; it is only ever a
		// hit, and the ear reads a 50 ms burst as quieter still, so it sits at 1.
		case 'noise':
			return 1.0;
		case 'metal':
			return 0.9;
		case 'pwm':
			return 0.74;
		case 'supersaw':
			return 0.8;
		case 'organ':
			return 1.0;
		case 'fold':
			return 0.95;
		default:
			return 0.85; // drawn tables
	}
}

export function getWaveformAbbr(w: SynthWaveform): string {
	switch (w) {
		case 'sawtooth':
			return 'SAW';
		case 'square':
			return 'SQR';
		case 'sine':
			return 'SIN';
		case 'triangle':
			return 'TRI';
		case 'noise':
			return 'NOI';
		case 'metal':
			return 'MTL';
		case 'pwm':
			return 'PWM';
		case 'supersaw':
			return 'SSAW';
		case 'organ':
			return 'ORG';
		case 'fold':
			return 'FOLD';
		default:
			return w.startsWith('custom:') ? 'USR' : String(w).toUpperCase().slice(0, 3);
	}
}
export type BlendMode = 'layer' | 'fm' | 'ring' | 'sync';
export type FilterType = 'lowpass' | 'bandpass' | 'highpass' | 'notch';
export type LfoWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';
export type LfoTarget = 'filter' | 'pitch' | 'amp' | 'morph' | 'pan';

export type ModSource = 'lfo' | 'vcf_env' | 'amp_env' | 'velocity';
export type ModDest = 'cutoff' | 'pitch' | 'morph' | 'pan' | 'resonance';

export interface ModRoute {
	id: string;
	source: ModSource;
	dest: ModDest;
	amount: number; // -1.0 to +1.0
	enabled: boolean;
}

export type NoteDurationDiv = '4' | '2' | '1' | '1/2' | '1/3' | '1/4' | '1/6' | '1/8' | '1/12';

/**
 * Finest grid resolution: 1/24 beat. 24 divides both the binary family
 * (1/2, 1/4, 1/8 beat -> 12/6/3 steps) and the ternary family
 * (1/3, 1/6, 1/12 beat -> 8/4/2 steps), so straight and swung/triplet
 * rhythms land on exact steps.
 */
export const STEPS_PER_BEAT = 24;
/** Longest pattern the sequencer will hold, in 1/24-beat steps (256 bars of 4/4, or ~136 of 5/4). Each
    track allocates a JS array of this length per grid/accents, so this is a memory/GC tradeoff, not
    just a step-count choice -- exported patches are gzip-compressed, but that doesn't shrink the
    in-memory grids these allocate. */
export const MAX_GRID_STEPS = 32768;

export function isTernaryDiv(div: NoteDurationDiv): boolean {
	return div === '1/3' || div === '1/6' || div === '1/12';
}

export function divToStepSpan(div: NoteDurationDiv): number {
	switch (div) {
		case '4':
			return 96; // Whole note: 4 beats
		case '2':
			return 48; // Half note: 2 beats
		case '1':
			return 24; // Quarter note: 1 beat
		case '1/2':
			return 12; // Eighth note
		case '1/3':
			return 8; // Quarter-note triplet third
		case '1/4':
			return 6; // Sixteenth note
		case '1/6':
			return 4; // Eighth-note triplet third (swung 16th)
		case '1/8':
			return 3; // 32nd note
		case '1/12':
			return 2; // Sixteenth-note triplet third
		default:
			return 3;
	}
}

/**
 * Steps rendered per piano-roll column. Binary snaps draw 1/4-beat columns,
 * ternary snaps draw 1/6-beat columns — each family tiles its own grid exactly.
 */
export function stepsPerColumn(snap: NoteDurationDiv): number {
	return isTernaryDiv(snap) ? 4 : 6;
}

/** Snaps finer than one column render as two half-column sub-cells. */
export function hasSubColumns(snap: NoteDurationDiv): boolean {
	return snap === '1/8' || snap === '1/12';
}

/** Visual column count multiplier when a ternary snap is active (16 -> 24 cols/bar in 4/4). */
export function ternaryColFactor(snap: NoteDurationDiv): number {
	return isTernaryDiv(snap) ? 1.5 : 1;
}

/** Span of `div` measured in the CURRENT column unit implied by `snap`. */
export function divToColumnSpan(div: NoteDurationDiv, snap: NoteDurationDiv = div): number {
	return divToStepSpan(div) / stepsPerColumn(snap);
}

export type VelocityCurve = 'OFF' | 'LINEAR' | 'EXP' | 'LOG' | 'HARD';

export interface EqBandSpec {
	id: number;
	label: string;
	freq: number;
	type: BiquadFilterType;
	color: string;
}

export const EQ_6_BANDS: EqBandSpec[] = [
	{ id: 0, label: '80', freq: 80, type: 'lowshelf', color: '#56b6c2' },
	{ id: 1, label: '250', freq: 250, type: 'peaking', color: '#56b6c2' },
	{ id: 2, label: '800', freq: 800, type: 'peaking', color: '#e5c07b' },
	{ id: 3, label: '2.5k', freq: 2500, type: 'peaking', color: '#e5c07b' },
	{ id: 4, label: '6k', freq: 6000, type: 'peaking', color: '#98c379' },
	{ id: 5, label: '12k', freq: 12000, type: 'highshelf', color: '#98c379' }
];

export const VELOCITY_CURVES: VelocityCurve[] = ['EXP', 'LINEAR', 'LOG', 'HARD', 'OFF'];

export type TimeSignature = '4/4' | '3/4' | '2/4' | '5/4' | '6/8' | '7/8';

export interface MeterSpec {
	sig: TimeSignature;
	label: string;
	name: string;
	beatsPerBar: number;
	colsPerBar: number;
	colsPerBeat: number;
	stepsPerBar: number; // total 1/24-beat steps per measure
	downbeatInterval: number; // steps per primary beat
}

export const METER_SPECS: Record<TimeSignature, MeterSpec> = {
	'4/4': {
		sig: '4/4',
		label: '4/4',
		name: '4/4 Common Time',
		beatsPerBar: 4,
		colsPerBar: 16,
		colsPerBeat: 4,
		stepsPerBar: 96,
		downbeatInterval: 24
	},
	'3/4': {
		sig: '3/4',
		label: '3/4',
		name: '3/4 Waltz Time',
		beatsPerBar: 3,
		colsPerBar: 12,
		colsPerBeat: 4,
		stepsPerBar: 72,
		downbeatInterval: 24
	},
	'2/4': {
		sig: '2/4',
		label: '2/4',
		name: '2/4 March Time',
		beatsPerBar: 2,
		colsPerBar: 8,
		colsPerBeat: 4,
		stepsPerBar: 48,
		downbeatInterval: 24
	},
	'5/4': {
		sig: '5/4',
		label: '5/4',
		name: '5/4 Odd Meter',
		beatsPerBar: 5,
		colsPerBar: 20,
		colsPerBeat: 4,
		stepsPerBar: 120,
		downbeatInterval: 24
	},
	'6/8': {
		sig: '6/8',
		label: '6/8',
		name: '6/8 Compound Time',
		beatsPerBar: 6,
		colsPerBar: 12,
		colsPerBeat: 2,
		stepsPerBar: 72,
		downbeatInterval: 12
	},
	'7/8': {
		sig: '7/8',
		label: '7/8',
		name: '7/8 Complex Time',
		beatsPerBar: 7,
		colsPerBar: 14,
		colsPerBeat: 2,
		stepsPerBar: 84,
		downbeatInterval: 12
	}
};

export interface TrackData {
	id: number;
	name: string;
	color: string;
	volume: number; // 0.0 to 1.0 (Master voice level)
	pan: number; // -1.0 to +1.0
	muted: boolean;
	solo: boolean;

	// Node 1: Dual Input Waveform Generators
	osc1Waveform: SynthWaveform;
	osc1Gain: number; // 0.0 to 1.0
	osc2Waveform: SynthWaveform;
	osc2Gain: number; // 0.0 to 1.0
	osc2Ratio: number; // 0.5, 1, 1.5, 2, 3, 4
	detuneCents: number; // -50 to +50 cents
	phaseOffset: number; // 0 to 360 degrees
	osc2Semitone: number; // -24 to +24 semitones (OSC2 transpose)
	pulseWidth: number; // 5 to 95 percent (square wave duty cycle)
	waveParams?: WaveParams; // knobs of the ADVANCED waves; see WAVE_PARAM_SPECS
	subOscGain: number; // 0.0 to 1.0 (sub-oscillator one octave below)
	noiseGain: number; // 0.0 to 1.0 (noise generator mix level)
	noiseRetrig?: number; // 1 to 4 bursts per hit -- the 808 clap's stutter; 1 = plain noise
	noiseRetrigGap?: number; // 5 to 40 ms between bursts

	// Node 2: Timbre Fusion Node
	blendMode: BlendMode; // 'layer' | 'fm' | 'ring' | 'sync'
	morphAmount: number; // 0.0 to 1.0 (Blend / FM modulation depth)
	glideTime?: number; // 0 to 300ms (Portamento / Glide slide time)
	xfade?: number; // 0.0 to 1.0 (OSC1 to OSC2 Crossfade Balance, default 0.5)

	// Node 3: Multi-Mode VCF Resonant Filter Node
	filterType: FilterType; // 'lowpass' | 'bandpass' | 'highpass' | 'notch'
	cutoff: number; // 40Hz to 14000Hz
	resonance: number; // 0.1 to 16.0
	envFilterMod: number; // 0.0 to 1.0 (Envelope to VCF cutoff sweep)
	keyTracking?: number; // 0.0 to 1.0 (Keyboard Pitch to Cutoff Tracking)

	// Node 4: Envelope & LFO Modulation Matrix
	attack: number; // 0.005 to 1.2s (legacy / ampAttack alias)
	decay: number; // 0.01 to 1.5s
	sustain: number; // 0.0 to 1.0
	release: number; // 0.01 to 2.5s

	// Dual Envelope Architecture (AMP ENV + VCF ENV)
	ampAttack: number;
	ampDecay: number;
	ampSustain: number;
	ampRelease: number;

	filterAttack: number;
	filterDecay: number;
	filterSustain: number;
	filterRelease: number;
	filterEnvAmount: number; // -1.0 to +1.0

	pitchAttack?: number;
	pitchDecay?: number;
	pitchEnvAmount?: number; // Amount in octaves (e.g. 0 to 4)

	// Node 5: LFO Modulation Engine (Pure & Self-consistent)
	lfoWaveform: LfoWaveform;
	lfoRate: number; // 0.1 to 20.0 Hz
	lfoPitchAmt?: number; // 0.0 to 1.0 (Vibrato / Pitch modulation depth)
	lfoCutoffAmt?: number; // 0.0 to 1.0 (Wah / Filter sweep modulation depth)
	lfoPanAmt?: number; // 0.0 to 1.0 (Auto-Pan modulation depth)
	lfoAmpAmt?: number; // 0.0 to 1.0 (Tremolo / Amplitude modulation depth)
	lfoFadeTime?: number; // 0 to 2000 ms (LFO Fade-in attack delay)
	lfoDepth?: number; // legacy alias
	lfoTarget?: LfoTarget; // legacy alias

	// Node 6: Per-Track 6-Band Graphic EQ (gains in dB for EQ_6_BANDS, default flat & off)
	eqOn?: boolean;
	eqGains?: number[];
	/** Per-key EQ in dB, one per EQ_6_BANDS entry. Kits use this; the track-wide
	 *  eqGains above cannot shape a kick and a hi-hat differently. */
	keyEqGains?: number[];
	/** The voice's signal path, as module ids, built by `buildRackModule`. Absent
	 *  means the chain the engine has always built. Per key in percussion mode,
	 *  so a kick and a hi-hat need not share one.
	 *
	 *  This pointed at stores/synth-rack.ts, which had no importers left and is
	 *  gone: it declared a second `moduleSpec` and a rival set of param specs
	 *  that nothing read, so following the comment landed you in the abandoned
	 *  model of the thing you were looking at. */
	rackChain?: string[];
	/* The patch bay as a graph: modules placed on a canvas, cables between named
     ports. Kept beside rackChain rather than replacing it -- they are two ways
     of building a voice and only one is in force, so switching between them
     must not destroy the other's work. See stores/synth-graph.ts. */
	rackGraph?: {
		nodes: { id: string; type: string; x: number; y: number }[];
		cables: { from: string; fromPort: string; to: string; toPort: string }[];
	};
	/** Per-node knob values, keyed `${nodeId}.${paramKey}`. */
	graphParams?: Record<string, number>;
	/* How a new note treats the one before it.
	 *
	 *   POLY   -- they overlap, which is what a keyboard does.
	 *   MONO   -- the new note takes the voice; the old tail stops at once.
	 *   LEGATO -- the same, but the envelope is not retriggered while a key is
	 *             still held, so a phrase played overlapping is one breath.
	 *
	 * Glide is not here: rack 2's glideTime already slides the pitch from the
	 * last note, and it applies to all three modes. One knob, one meaning. */
	voiceMode?: 'poly' | 'mono' | 'legato';
	/* Which keys silence which, in K.MAP. Keys sharing a group number cut each
	 * other off -- the closed hi-hat stopping the open one is the reason this
	 * exists, and a triangle or a cuica needs the same. 0 means no group. */
	muteGroup?: number;

	// Node 7: Master Output Channel Strip
	airGain?: number; // -1.0 to +1.0 (Air Shelf EQ / Tone Shaping, ±8dB at 10kHz)

	// Sidechain ducking (7.OUT): this track dips whenever the source track fires a note.
	duckSource?: number; // source track id, -1 = off
	duckKeys?: number[]; // only these note indices on the source trigger it; empty = any key
	duckDepth?: number; // 0.0 to 1.0 -- how far the track dips (1 = to silence)
	duckDip?: number; // ms to reach the floor
	duckHold?: number; // ms held at the floor
	duckRelease?: number; // ms back to unity

	// Modular Modulation Matrix Routing (Optional legacy support)
	modRoutes?: ModRoute[];

	/* Percussion mode: every key can carry its own sound. keyTimbres is sparse --
     a key with no entry plays the track's own timbre -- and each entry holds
     only the fields that differ, so a kit of eight sounds stays small in a
     patch or a share link. Off, the table is kept but ignored. */
	percussion?: boolean;
	keyTimbres?: Record<number, Partial<TrackData>>;

	/* Advanced layout, per track: the racks give way to the patch bay for this
     track alone, so one track can be edited as a signal path while the next is
     still edited on the knobs. Only one of the two is in force at a time --
     they are the same track seen two ways, not two patches -- but the setting
     is per track and travels in the patch file, since which view a sound wants
     is a property of that sound. */
	advanced?: boolean;
	/** Which view owns the lower panel while `advanced` is on. */
	advancedView?: 'roll' | 'rack';
	/** Values for the rack modules' own knobs, keyed by param id. Flat rather
	 *  than nested per module: a module appears once in a chain, so its keys
	 *  cannot collide, and a flat record survives reordering untouched. */
	rackParams?: Record<string, number>;

	// Sequencer Grid (Polyphonic: array of note indices per step, up to 8 notes)
	grid: number[][];
	/* The accent row this replaced: one value per step, cycled 0..+4 dB by
     clicking. Kept only so the bundled songs -- which store it -- can be read
     into the velocity lane on load; nothing writes it any more. */
	accents: (number | boolean)[];
	/* Automation lanes: curves drawn under the roll, published as sockets on
     ENTRY so the same shape can drive any parameter. Absent means the track
     has only the default velocity lane, which is materialised rather than
     stored -- most tracks never draw one. */
	noteLanes?: NoteLane[];
	/* A preset's own level, so the built-ins sit at a common loudness.
	 *
	 * Separate from `volume`, which is the player's fader and must not move when
	 * a patch is loaded. This is part of the sound: measured across the 24
	 * electric presets, onset energy spanned 18.8 dB -- a CLAV arrived 10 dB
	 * under an ORGAN -- which is a defect rather than a voicing choice, and
	 * fixing it by editing every oscillator gain would have meant re-voicing 24
	 * patches to correct one number. 1 means unchanged. */
	presetGain?: number;
}

export const PIANO_ROLL_NOTES = [
	{ note: 'C8', freq: 4186.01, isBlack: false, oct: 8 }, // 0
	{ note: 'B7', freq: 3951.07, isBlack: false, oct: 7 }, // 1
	{ note: 'A#7', freq: 3729.31, isBlack: true, oct: 7 }, // 2
	{ note: 'A7', freq: 3520.0, isBlack: false, oct: 7 }, // 3
	{ note: 'G#7', freq: 3322.44, isBlack: true, oct: 7 }, // 4
	{ note: 'G7', freq: 3135.96, isBlack: false, oct: 7 }, // 5
	{ note: 'F#7', freq: 2959.96, isBlack: true, oct: 7 }, // 6
	{ note: 'F7', freq: 2793.83, isBlack: false, oct: 7 }, // 7
	{ note: 'E7', freq: 2637.02, isBlack: false, oct: 7 }, // 8
	{ note: 'D#7', freq: 2489.02, isBlack: true, oct: 7 }, // 9
	{ note: 'D7', freq: 2349.32, isBlack: false, oct: 7 }, // 10
	{ note: 'C#7', freq: 2217.46, isBlack: true, oct: 7 }, // 11
	{ note: 'C7', freq: 2093.0, isBlack: false, oct: 7 }, // 12
	{ note: 'B6', freq: 1975.53, isBlack: false, oct: 6 }, // 13
	{ note: 'A#6', freq: 1864.66, isBlack: true, oct: 6 }, // 14
	{ note: 'A6', freq: 1760.0, isBlack: false, oct: 6 }, // 15
	{ note: 'G#6', freq: 1661.22, isBlack: true, oct: 6 }, // 16
	{ note: 'G6', freq: 1567.98, isBlack: false, oct: 6 }, // 17
	{ note: 'F#6', freq: 1479.98, isBlack: true, oct: 6 }, // 18
	{ note: 'F6', freq: 1396.91, isBlack: false, oct: 6 }, // 19
	{ note: 'E6', freq: 1318.51, isBlack: false, oct: 6 }, // 20
	{ note: 'D#6', freq: 1244.51, isBlack: true, oct: 6 }, // 21
	{ note: 'D6', freq: 1174.66, isBlack: false, oct: 6 }, // 22
	{ note: 'C#6', freq: 1108.73, isBlack: true, oct: 6 }, // 23
	{ note: 'C6', freq: 1046.5, isBlack: false, oct: 6 }, // 24
	{ note: 'B5', freq: 987.77, isBlack: false, oct: 5 }, // 25
	{ note: 'A#5', freq: 932.33, isBlack: true, oct: 5 }, // 26
	{ note: 'A5', freq: 880.0, isBlack: false, oct: 5 }, // 27
	{ note: 'G#5', freq: 830.61, isBlack: true, oct: 5 }, // 28
	{ note: 'G5', freq: 783.99, isBlack: false, oct: 5 }, // 29
	{ note: 'F#5', freq: 739.99, isBlack: true, oct: 5 }, // 30
	{ note: 'F5', freq: 698.46, isBlack: false, oct: 5 }, // 31
	{ note: 'E5', freq: 659.26, isBlack: false, oct: 5 }, // 32
	{ note: 'D#5', freq: 622.25, isBlack: true, oct: 5 }, // 33
	{ note: 'D5', freq: 587.33, isBlack: false, oct: 5 }, // 34
	{ note: 'C#5', freq: 554.37, isBlack: true, oct: 5 }, // 35
	{ note: 'C5', freq: 523.25, isBlack: false, oct: 5 }, // 36
	{ note: 'B4', freq: 493.88, isBlack: false, oct: 4 }, // 37
	{ note: 'A#4', freq: 466.16, isBlack: true, oct: 4 }, // 38
	{ note: 'A4', freq: 440.0, isBlack: false, oct: 4 }, // 39
	{ note: 'G#4', freq: 415.3, isBlack: true, oct: 4 }, // 40
	{ note: 'G4', freq: 392.0, isBlack: false, oct: 4 }, // 41
	{ note: 'F#4', freq: 369.99, isBlack: true, oct: 4 }, // 42
	{ note: 'F4', freq: 349.23, isBlack: false, oct: 4 }, // 43
	{ note: 'E4', freq: 329.63, isBlack: false, oct: 4 }, // 44
	{ note: 'D#4', freq: 311.13, isBlack: true, oct: 4 }, // 45
	{ note: 'D4', freq: 293.66, isBlack: false, oct: 4 }, // 46
	{ note: 'C#4', freq: 277.18, isBlack: true, oct: 4 }, // 47
	{ note: 'C4', freq: 261.63, isBlack: false, oct: 4 }, // 48
	{ note: 'B3', freq: 246.94, isBlack: false, oct: 3 }, // 49
	{ note: 'A#3', freq: 233.08, isBlack: true, oct: 3 }, // 50
	{ note: 'A3', freq: 220.0, isBlack: false, oct: 3 }, // 51
	{ note: 'G#3', freq: 207.65, isBlack: true, oct: 3 }, // 52
	{ note: 'G3', freq: 196.0, isBlack: false, oct: 3 }, // 53
	{ note: 'F#3', freq: 185.0, isBlack: true, oct: 3 }, // 54
	{ note: 'F3', freq: 174.61, isBlack: false, oct: 3 }, // 55
	{ note: 'E3', freq: 164.81, isBlack: false, oct: 3 }, // 56
	{ note: 'D#3', freq: 155.56, isBlack: true, oct: 3 }, // 57
	{ note: 'D3', freq: 146.83, isBlack: false, oct: 3 }, // 58
	{ note: 'C#3', freq: 138.59, isBlack: true, oct: 3 }, // 59
	{ note: 'C3', freq: 130.81, isBlack: false, oct: 3 }, // 60
	{ note: 'B2', freq: 123.47, isBlack: false, oct: 2 }, // 61
	{ note: 'A#2', freq: 116.54, isBlack: true, oct: 2 }, // 62
	{ note: 'A2', freq: 110.0, isBlack: false, oct: 2 }, // 63
	{ note: 'G#2', freq: 103.83, isBlack: true, oct: 2 }, // 64
	{ note: 'G2', freq: 98.0, isBlack: false, oct: 2 }, // 65
	{ note: 'F#2', freq: 92.5, isBlack: true, oct: 2 }, // 66
	{ note: 'F2', freq: 87.31, isBlack: false, oct: 2 }, // 67
	{ note: 'E2', freq: 82.41, isBlack: false, oct: 2 }, // 68
	{ note: 'D#2', freq: 77.78, isBlack: true, oct: 2 }, // 69
	{ note: 'D2', freq: 73.42, isBlack: false, oct: 2 }, // 70
	{ note: 'C#2', freq: 69.3, isBlack: true, oct: 2 }, // 71
	{ note: 'C2', freq: 65.41, isBlack: false, oct: 2 }, // 72
	{ note: 'B1', freq: 61.74, isBlack: false, oct: 1 }, // 73
	{ note: 'A#1', freq: 58.27, isBlack: true, oct: 1 }, // 74
	{ note: 'A1', freq: 55.0, isBlack: false, oct: 1 }, // 75
	{ note: 'G#1', freq: 51.91, isBlack: true, oct: 1 }, // 76
	{ note: 'G1', freq: 49.0, isBlack: false, oct: 1 }, // 77
	{ note: 'F#1', freq: 46.25, isBlack: true, oct: 1 }, // 78
	{ note: 'F1', freq: 43.65, isBlack: false, oct: 1 }, // 79
	{ note: 'E1', freq: 41.2, isBlack: false, oct: 1 }, // 80
	{ note: 'D#1', freq: 38.89, isBlack: true, oct: 1 }, // 81
	{ note: 'D1', freq: 36.71, isBlack: false, oct: 1 }, // 82
	{ note: 'C#1', freq: 34.65, isBlack: true, oct: 1 }, // 83
	{ note: 'C1', freq: 32.7, isBlack: false, oct: 1 }, // 84
	{ note: 'B0', freq: 30.87, isBlack: false, oct: 0 }, // 85
	{ note: 'A#0', freq: 29.14, isBlack: true, oct: 0 }, // 86
	{ note: 'A0', freq: 27.5, isBlack: false, oct: 0 } // 87
];

/* The fields that make up a sound, as opposed to where the track sits in the
   mix (volume, pan, mute, solo), what it plays (grid, accents) or what it is
   (id, name, colour). The per-track EQ is a bus effect and stays with the
   track. This is what a preset carries and what a percussion key can override. */
/**
 * The songs the engine can load, as a closed set.
 *
 * The parameter was a bare `string` over an if/else chain with no final else,
 * so an unrecognised name fell through to the transport reset at the bottom
 * and reported success while leaving the *previous* song's tracks in place.
 * The menu's own list lived in synth-patch with `id: string`, so nothing
 * connected the two -- and this side quietly accepted two extra aliases,
 * OVERWORLD_FULL and OVERWORLD, that the menu could never send. Now the
 * compiler holds the menu and the engine to the same six.
 */
export type BuiltinSongId =
	'MARIO_1' | 'UNDERWATER' | 'OVERWORLD_1' | 'OVERWORLD_2' | 'SPAIN' | 'TAKE_FIVE';

export const KEY_TIMBRE_KEYS = [
	'osc1Waveform',
	'osc1Gain',
	'osc2Waveform',
	'osc2Gain',
	'osc2Ratio',
	'detuneCents',
	'phaseOffset',
	'osc2Semitone',
	'pulseWidth',
	'waveParams',
	'subOscGain',
	'noiseGain',
	'noiseRetrig',
	'noiseRetrigGap',
	'blendMode',
	'morphAmount',
	'glideTime',
	'xfade',
	'filterType',
	'cutoff',
	'resonance',
	'envFilterMod',
	'keyTracking',
	'attack',
	'decay',
	'sustain',
	'release',
	'ampAttack',
	'ampDecay',
	'ampSustain',
	'ampRelease',
	'filterAttack',
	'filterDecay',
	'filterSustain',
	'filterRelease',
	'filterEnvAmount',
	'pitchAttack',
	'pitchDecay',
	'pitchEnvAmount',
	'lfoWaveform',
	'lfoRate',
	'lfoPitchAmt',
	'lfoCutoffAmt',
	'lfoPanAmt',
	'lfoAmpAmt',
	'lfoFadeTime',
	'lfoDepth',
	'lfoTarget',
	'airGain',
	'keyEqGains',
	'rackChain',
	'rackParams',
	'rackGraph',
	'graphParams',
	'presetGain',
	// Per key: which sounds cannot coexist is a property of the sound, not the track.
	'muteGroup'
] as const satisfies readonly (keyof TrackData)[];

export type KeyTimbreKey = (typeof KEY_TIMBRE_KEYS)[number];

export function isKeyTimbreKey(k: string): k is KeyTimbreKey {
	return (KEY_TIMBRE_KEYS as readonly string[]).includes(k);
}

/** The sound a given key plays on a track: the track's own, overlaid with that key's entry in percussion mode. */
export function effectiveTimbre(track: TrackData, noteIndex: number): TrackData {
	if (!track.percussion) return track;
	const kt = track.keyTimbres?.[noteIndex];
	// A percussion track is a kit, not an instrument: a key the kit does not
	// define has no sound. Falling back to the track's own timbre played it as a
	// pitched note instead, so every key outside the kit answered with whatever
	// the track happened to be before percussion was switched on -- a bass note
	// in the middle of a drum part.
	if (!kt) return { ...track, osc1Gain: 0, osc2Gain: 0, subOscGain: 0, noiseGain: 0 };
	return { ...track, ...kt };
}

/** The rack always has this many tracks; songs that define fewer get blank ones appended. */
export const TRACK_COUNT = 8;
const EXTRA_TRACK_COLORS = ['#e06c75', '#d19a66'];

/** A neutral sound for a track a song does not use: square + saw, open filter, plain envelope. */
/** A neutral timbre, exported so "start from nothing" means the same thing
 *  wherever it is offered. */
export const BLANK_TRACK_TIMBRE: Omit<TrackData, 'id' | 'name' | 'color' | 'grid' | 'accents'> = {
	volume: 0.8,
	pan: 0,
	muted: false,
	solo: false,
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
	airGain: 0,
	duckSource: -1,
	duckKeys: [],
	duckDepth: 0,
	duckDip: 5,
	duckHold: 40,
	duckRelease: 150
};

/** Append blank tracks up to TRACK_COUNT, with grids the length of the song's own. */
export function padTracks(tracks: TrackData[], count = TRACK_COUNT): TrackData[] {
	const out = tracks.slice();
	const len = tracks[0]?.grid.length ?? MAX_GRID_STEPS;
	for (let id = out.length; id < count; id++) {
		out.push({
			...JSON.parse(JSON.stringify(BLANK_TRACK_TIMBRE)),
			id,
			name: `TRK ${id + 1}`,
			color: EXTRA_TRACK_COLORS[(id - 6 + EXTRA_TRACK_COLORS.length) % EXTRA_TRACK_COLORS.length],
			grid: Array.from({ length: len }, () => []),
			accents: Array.from({ length: len }, () => 0)
		});
	}
	return out;
}

/** What the synth holds at boot. SPAIN is authored natively on the 1/24-beat grid, so it is copied, not scaled. */
export const INITIAL_TRACKS: TrackData[] = padTracks(SPAIN_TRACKS);

/**
 * The song files predate the 1/24-beat grid (their cells are 1/8-beat steps).
 * Expand each cell to 3 grid steps — the merge rule keeps note durations
 * identical. Cells are cloned so in-place grid edits never alias.
 */
export function scaleTracksToFineGrid(tracks: TrackData[]): TrackData[] {
	return tracks.map((t) => ({
		...t,
		grid: t.grid.flatMap((cell) => [[...cell], [...cell], [...cell]]),
		accents: (t.accents as number[]).flatMap((a) => [a, 0, 0])
	}));
}

interface FreqPlan {
	t: number;
	start: number;
	ramps: { to: number; at: number }[];
}

interface ActiveVoice {
	osc1?: OscillatorNode;
	osc2?: OscillatorNode;
	noise?: AudioBufferSourceNode;
	/** Sub oscillator and the NOISE-knob source: started and stopped with the rest. */
	extras?: AudioScheduledSourceNode[];
	filter: BiquadFilterNode;
	gain: GainNode;
	lfo?: OscillatorNode;
	lfoGain?: GainNode;
	panNode?: StereoPannerNode;
	/** Air shelf and per-key EQ bands: they hold the reverb send, so they need cutting too. */
	tail?: AudioNode[];
	startTime: number;
	ampRel: number;
	vcfRel: number;
	baseCutoff: number;
	isContinuousHold?: boolean;
	/** Which key this voice is playing, so LOWEST can pick a victim by pitch. */
	noteIndex: number;
	/** Which track and mute group this voice belongs to, for the choke rules. */
	trackId?: number;
	muteGroup?: number;
}

class ModularSynth {
	private tracks: TrackData[] = JSON.parse(JSON.stringify(INITIAL_TRACKS));
	private activeVoices: Map<string, ActiveVoice> = new Map();
	private noiseBuffer: AudioBuffer | null = null;
	private lastTrackFreqs: Map<number, number> = new Map();
	private lastTrackNoteTimes: Map<number, number> = new Map();
	private trackHeldVoices: Map<string, string> = new Map(); // key: `${trackId}-${noteIndex}` -> voiceKey
	private isSustainPedalDown: boolean = false;
	private sustainedVoiceKeys: Set<string> = new Set();
	private velocityCurve: VelocityCurve = 'EXP';

	// Master Global Params (Default: SUPER MARIO 3 - OVERWORLD 1, 150 BPM, 3360 steps)
	private bpm: number = 115;
	private meter: TimeSignature = '4/4';
	private editNoteDiv: NoteDurationDiv = '1/8';
	private delayMix: number = 0.0;
	private delayTime: number = 0.22;
	private delayFeedback: number = 0.32;
	/* 0.06, not 0.15: none of the built-in songs set this, so every one of them
     played through whatever the default was, and at 0.15 the chip voices --
     dry, square and short by nature -- came out washed and distant. Low enough
     now to give the room a little depth without smearing the attacks; the
     R-MIX knob still reaches the old value and beyond. */
	private reverbMix: number = 0.0;
	private driveAmount: number = 0.0;

	// Master Audio FX Nodes
	private delayNode: DelayNode | null = null;
	private delayFeedbackGain: GainNode | null = null;
	private delayWetGain: GainNode | null = null;
	private reverbConvolver: ConvolverNode | null = null;
	private reverbWetGain: GainNode | null = null;
	private waveShaper: WaveShaperNode | null = null;
	private shaperIn: GainNode | null = null;
	private shaperBypass: GainNode | null = null;

	// Per-Track 6-Band Graphic EQ chains (track voices -> input -> 6 biquads -> master bus)
	private trackBuses: { input: GainNode; filters: BiquadFilterNode[]; duck: GainNode }[] = [];
	// Master bus input: track EQ chains + FX wet returns sum here, then pass the
	// drive shaper on the way to the sound engine's master gain.
	private masterBusIn: GainNode | null = null;

	// Master Audio Hardware & DSP Engine Settings
	private noiseBufferDuration: number = 2.0; // 0.5s to 5.0s
	private noiseColor: 'white' | 'pink' | 'brown' = 'white';
	private reverbDuration: number = 1.8; // 0.2s to 6.0s
	private reverbDecayRate: number = 0.6; // 0.1 to 2.0 (High Frequency Air Absorption)
	private masterTuningFreq: number = 440.0; // 430Hz to 450Hz
	private maxPolyphony: number = 8; // 1 to 16 voices per track
	private midiSelectedDeviceId: string = 'all'; // 'all' or specific MIDI device ID
	/* Which tracks each MIDI input plays. One keyboard is often two inputs -- a
     Roland GO:KEYS on USB is advertised over Bluetooth too -- so leaving every
     input on the active track voiced each key press twice, about 10 ms apart,
     which sounds like a flam on every note. A device routed here plays exactly
     the tracks it lists: several to layer them under one key, one to keep two
     keyboards apart, none to switch the input off. An input with no entry at
     all follows the active track. */
	private midiDeviceTracks: Record<string, number[]> = {};
	private latencyHintMode: 'interactive' | 'balanced' | 'playback' = 'balanced';
	private masterLimiterEnabled: boolean = true; // Brickwall Soft Peak Limiter
	private voiceStealingMode: 'oldest' | 'quietest' | 'lowest' = 'oldest';
	private eqlCompensation: boolean = true; // Equal Loudness (ISO 226) Perceptual Waveform Normalization

	// Sequencer Engine (Default 3360 steps for OVERWORLD 1)
	private isSequencerPlaying: boolean = false;
	private currentStep: number = 0;
	private totalSteps: number = SPAIN_STEPS; // the boot song
	private sequencerTimer: any = null;
	private onStepListeners: Set<(step: number) => void> = new Set();
	private onNoteListeners: Set<
		(trackId: number, noteIndex: number, noteName: string, durationMs: number) => void
	> = new Set();

	/**
	 * Non-null only for the duration of renderOffline(). While it is set, every
	 * node the engine builds goes into the offline graph instead of the live one,
	 * and the real-time bookkeeping (voice stealing, cleanup timers, mute) is
	 * bypassed — an offline render has no "now" for any of it to be relative to.
	 */
	private renderCtx: OfflineAudioContext | null = null;

	/** The context the engine should build into right now. */
	private audioCtx(): AudioContext | null {
		return (this.renderCtx as unknown as AudioContext | null) ?? soundEngine.init();
	}

	private renderMaster: GainNode | null = null;

	/**
	 * Where the master bus terminates: the sound engine's fader, or — while
	 * rendering — a stand-in fader at the same volume, so a bounce is as loud as
	 * what you actually hear rather than however loud the raw chain happens to be.
	 */
	private masterOut(ctx: AudioContext): AudioNode {
		if (this.renderCtx) {
			if (!this.renderMaster) {
				this.renderMaster = ctx.createGain();
				this.renderMaster.gain.value = soundEngine.getVolume();
				this.renderMaster.connect(ctx.destination);
			}
			return this.renderMaster;
		}
		return (soundEngine as any).masterGain || ctx.destination;
	}

	constructor() {
		this.initNoiseBuffer();
	}

	public regenerateNoiseBuffer() {
		if (typeof window === 'undefined') return;
		const ctx = this.audioCtx();
		if (!ctx) return;

		const bufferSize = Math.floor(
			ctx.sampleRate * Math.max(0.5, Math.min(5.0, this.noiseBufferDuration))
		);
		const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
		const data = buffer.getChannelData(0);

		if (this.noiseColor === 'white') {
			for (let i = 0; i < bufferSize; i++) {
				data[i] = Math.random() * 2 - 1;
			}
		} else if (this.noiseColor === 'pink') {
			// Paul Kellet's filtered pink noise generator (-3dB/octave)
			let b0 = 0,
				b1 = 0,
				b2 = 0,
				b3 = 0,
				b4 = 0,
				b5 = 0,
				b6 = 0;
			for (let i = 0; i < bufferSize; i++) {
				const white = Math.random() * 2 - 1;
				b0 = 0.99886 * b0 + white * 0.0555179;
				b1 = 0.99332 * b1 + white * 0.0750759;
				b2 = 0.969 * b2 + white * 0.153852;
				b3 = 0.8665 * b3 + white * 0.3104856;
				b4 = 0.55 * b4 + white * 0.5329522;
				b5 = -0.7616 * b5 - white * 0.016898;
				data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
				b6 = white * 0.115926;
			}
		} else {
			// Brownian / Red Noise generator (-6dB/octave)
			let lastOut = 0.0;
			for (let i = 0; i < bufferSize; i++) {
				const white = Math.random() * 2 - 1;
				data[i] = (lastOut + 0.02 * white) / 1.02;
				lastOut = data[i];
				data[i] *= 3.5; // Compensate amplitude
			}
		}
		this.noiseBuffer = buffer;
	}

	private initNoiseBuffer() {
		this.regenerateNoiseBuffer();
	}

	public regenerateReverbBuffer() {
		if (typeof window === 'undefined') return;
		const ctx = this.audioCtx();
		if (!ctx || !this.reverbConvolver) return;

		const rate = ctx.sampleRate;
		const length = Math.floor(rate * Math.max(0.2, Math.min(6.0, this.reverbDuration)));
		const impulse = ctx.createBuffer(2, length, rate);
		const left = impulse.getChannelData(0);
		const right = impulse.getChannelData(1);
		const decayConst = Math.max(0.1, this.reverbDecayRate);

		for (let i = 0; i < length; i++) {
			const decay = Math.exp(-i / (rate * decayConst));
			left[i] = (Math.random() * 2 - 1) * decay;
			right[i] = (Math.random() * 2 - 1) * decay;
		}
		this.reverbConvolver.buffer = impulse;
	}

	/* Both buffers are filled a sample at a time -- 6s of stereo reverb is 529k
     iterations of Math.exp plus two Math.random, and the noise buffer is
     another 220k -- which measures at 10ms and 6ms of blocked main thread.
     The knobs that set their parameters are sliders, so a single drag asked
     for dozens of those rebuilds, one per input event, when only the value the
     drag ends on is ever heard. Collapsing them into one rebuild per frame
     keeps the result identical and pays the cost once. */
	private reverbRebuildHandle: number | null = null;
	private noiseRebuildHandle: number | null = null;

	private scheduleReverbRebuild() {
		if (typeof window === 'undefined') return this.regenerateReverbBuffer();
		if (this.reverbRebuildHandle !== null) return;
		this.reverbRebuildHandle = window.requestAnimationFrame(() => {
			this.reverbRebuildHandle = null;
			this.regenerateReverbBuffer();
		});
	}

	private scheduleNoiseRebuild() {
		if (typeof window === 'undefined') return this.regenerateNoiseBuffer();
		if (this.noiseRebuildHandle !== null) return;
		this.noiseRebuildHandle = window.requestAnimationFrame(() => {
			this.noiseRebuildHandle = null;
			this.regenerateNoiseBuffer();
		});
	}

	/** Which context the master chain currently belongs to. */
	private masterFXCtx: BaseAudioContext | null = null;
	/** Catches peaks between the summed tracks and the output. */
	private masterLimiter: DynamicsCompressorNode | null = null;

	private initMasterFX(ctx: AudioContext) {
		/* One chain per context, and the guard has to say *which* context.
    
       `if (this.delayNode) return;` asked only whether a chain existed, so
       calling this with a second context silently kept the first one's nodes --
       and the next `connect` across the boundary throws
       "cannot connect to an AudioNode belonging to a different audio context",
       taking the note with it. It held together only because `renderOffline`
       happens to clear the cache first; anything else that acquires a context
       (a recreated one after `close()`, a suspended-context recovery) hit it. */
		if (this.delayNode && this.masterFXCtx === ctx) return;
		this.masterFXCtx = ctx;

		// Stereo Tape Delay
		this.delayNode = ctx.createDelay(2.0);
		this.delayNode.delayTime.setValueAtTime(this.delayTime, ctx.currentTime);

		this.delayFeedbackGain = ctx.createGain();
		this.delayFeedbackGain.gain.setValueAtTime(this.delayFeedback, ctx.currentTime);

		this.delayWetGain = ctx.createGain();
		this.delayWetGain.gain.setValueAtTime(this.delayMix, ctx.currentTime);

		this.delayNode.connect(this.delayFeedbackGain);
		this.delayFeedbackGain.connect(this.delayNode);

		// Convolution Space Reverb
		this.reverbConvolver = ctx.createConvolver();
		this.reverbWetGain = ctx.createGain();
		this.reverbWetGain.gain.setValueAtTime(this.reverbMix, ctx.currentTime);

		const rate = ctx.sampleRate;
		const length = rate * 1.8;
		const impulse = ctx.createBuffer(2, length, rate);
		const left = impulse.getChannelData(0);
		const right = impulse.getChannelData(1);
		for (let i = 0; i < length; i++) {
			const decay = Math.exp(-i / (rate * 0.6));
			left[i] = (Math.random() * 2 - 1) * decay;
			right[i] = (Math.random() * 2 - 1) * decay;
		}
		this.reverbConvolver.buffer = impulse;

		const masterGain = this.masterOut(ctx);

		// Master bus: track chains + wet FX returns -> drive shaper -> masterGain.
		// The shaper's curve is only defined on [-1, 1]: anything hotter is
		// clamped, i.e. hard-clipped, even at drive 0 where the curve is a
		// straight line. A busy mix sums well past 1 before the master fader
		// brings it down, so at drive 0 the shaper is routed around entirely.
		this.masterBusIn = ctx.createGain();
		this.waveShaper = ctx.createWaveShaper();
		(this.waveShaper as any).curve = this.makeDistortionCurve(this.driveAmount);
		this.waveShaper.oversample = '2x';
		this.shaperIn = ctx.createGain();
		this.shaperBypass = ctx.createGain();
		/* A limiter between the sum and the output.
    
       Eight track buses plus the delay and reverb returns all land on
       `masterBusIn`, and at the default drive of 0 the shaper is routed around
       entirely -- correctly, since its curve clamps outside [-1,1]. That left
       nothing at all between the sum and `destination`, so eight tracks past
       unity hard-clipped, which is why the export path needs a post-hoc
       "peak > -0.1 dB" warning: the engine detected clipping rather than
       preventing it.
    
       Set transparent: a 20:1 ratio above -1 dBFS with a fast attack catches
       peaks and does nothing at all to material that was not going to clip. */
		this.masterLimiter = ctx.createDynamicsCompressor();
		this.masterLimiter.threshold.setValueAtTime(-1, ctx.currentTime);
		this.masterLimiter.knee.setValueAtTime(0, ctx.currentTime);
		this.masterLimiter.ratio.setValueAtTime(20, ctx.currentTime);
		this.masterLimiter.attack.setValueAtTime(0.002, ctx.currentTime);
		this.masterLimiter.release.setValueAtTime(0.1, ctx.currentTime);
		this.masterLimiter.connect(masterGain);
		// ...unless the user switched it off, which until now the build ignored.
		this.applyMasterLimiter();

		this.masterBusIn.connect(this.shaperIn);
		this.shaperIn.connect(this.waveShaper);
		this.waveShaper.connect(this.masterLimiter);
		this.masterBusIn.connect(this.shaperBypass);
		this.shaperBypass.connect(this.masterLimiter);
		this.applyDriveRouting();

		// Per-Track 6-Band Graphic EQ chains: voices -> input -> 80Hz -> ... -> 12kHz -> master bus.
		// Persistent per track (not per voice), so 8 tracks cost at most 48 biquads total.
		const busCount = Math.max(8, this.tracks.length);
		this.trackBuses = Array.from({ length: busCount }, () => {
			const input = ctx.createGain();
			const filters = EQ_6_BANDS.map((band) => {
				const filter = ctx.createBiquadFilter();
				filter.type = band.type;
				filter.frequency.setValueAtTime(band.freq, ctx.currentTime);
				if (band.type === 'peaking') {
					filter.Q.setValueAtTime(1.2, ctx.currentTime);
				}
				filter.gain.setValueAtTime(0, ctx.currentTime);
				return filter;
			});
			input.connect(filters[0]);
			for (let i = 0; i < filters.length - 1; i++) {
				filters[i].connect(filters[i + 1]);
			}
			// The ducking gain sits after the EQ, so sidechain dips are one
			// automation curve per track and never touch the summing point.
			const duck = ctx.createGain();
			duck.gain.setValueAtTime(1, ctx.currentTime);
			filters[filters.length - 1].connect(duck);
			duck.connect(this.masterBusIn!);
			return { input, filters, duck };
		});
		this.applyAllTrackEq();

		this.delayNode.connect(this.delayWetGain);
		this.delayWetGain.connect(this.masterBusIn);

		this.reverbConvolver.connect(this.reverbWetGain);
		this.reverbWetGain.connect(this.masterBusIn);
	}

	/**
	 * How long the voice's chain rings after its input stops.
	 *
	 * The sources are stopped a moment after the amp envelope closes, which is
	 * right for a subtractive voice: nothing downstream is still producing sound.
	 * A resonator is exactly the opposite -- a plucked string rings on -- so the
	 * voice has to be held open for as long as the chain will sound.
	 */
	private rackTailSeconds(track: TrackData): number {
		// Same rule as the chain itself: no ADV, no resonator, no ring-out.
		if (!track.advanced) return 0;

		/* How long a module keeps sounding after its input stops. Everything not
       listed is a filter or a gain, which stops when its input does.

       This has to cover the graph as well as the chain. It did not, and a
       patched DELAY measured a 0.33s ring at every feedback setting from 0 to
       85% -- the tail was there, but the voice was torn down at the amp
       release before any of it could be heard. */
		const tailOf = (id: string, p: Record<string, number>): number => {
			switch (id) {
				case 'string':
					return p.decayTime ?? 2;
				// A tube's partials hold with the key and then fall away quickly, so
				// its ring-out is that fall, not the full decay setting.
				case 'tube':
					return Math.min(p.tubeDecay ?? 1.2, 0.35);
				/* A delay line's tail is how long its echoes stay audible: each lap
           loses (1 - feedback), so the time to fall 60 dB is time * 3 /
           -log10(g). Capped, because g near 1 diverges. */
				case 'delay': {
					const time = Math.max(0.001, (p.dlTime ?? 220) / 1000);
					const g = Math.min(0.85, Math.max(0, (p.dlFeedback ?? 35) / 100));
					if (g <= 0.01) return time;
					return Math.min(8, (time * 3) / -Math.log10(g));
				}
				// A convolver rings for exactly the length of its impulse.
				case 'space':
					return Math.min(4, Math.max(0.05, ((p.spaceSize ?? 40) / 100) * 3));
				/* A struck mode rings on after the strike, the same way a string does:
           roughly q/40 seconds on the lowest one. Without this the amp envelope
           reaped the voice first, and a crash written to ring for 1.3 s
           measured 0.25 -- every cymbal in the kit cut short. */
				case 'modes':
					return Math.min(8, Math.max(0.02, (p.modeQ ?? 14) / 12));
				default:
					return 0;
			}
		};

		let tail = 0;
		const chain = track.rackChain;
		if (Array.isArray(chain) && chain.length) {
			const p = track.rackParams ?? {};
			for (const id of chain) tail = Math.max(tail, tailOf(id, p));
		}

		const graph = track.rackGraph;
		if (graph && Array.isArray(graph.nodes)) {
			const gp = track.graphParams ?? {};
			for (const n of graph.nodes) {
				// Graph params are keyed per node; collect this node's into a flat set.
				const p: Record<string, number> = {};
				const prefix = `${n.id}.`;
				for (const [k, v] of Object.entries(gp))
					if (k.startsWith(prefix)) p[k.slice(prefix.length)] = v;
				tail = Math.max(tail, tailOf(n.type, p));
			}
		}
		return Math.min(12, tail);
	}

	/**
	 * Build a patched graph: modules as nodes, cables between named ports.
	 *
	 * Audio cables are followed in topological order, so a node's inputs exist
	 * before it does. Mod cables are connected afterwards and land on AudioParams
	 * rather than on inputs -- that is the whole difference between the two, and
	 * why a mod cable may form a cycle while an audio one may not.
	 *
	 * A node with no audio input is fed the voice itself, so dropping a filter on
	 * an empty canvas and wiring it to nothing still makes a sound: the patch is
	 * discovered by connecting things, not by getting it right first time.
	 */
	private buildRackGraph(
		ctx: BaseAudioContext,
		graph: {
			nodes: { id: string; type: string }[];
			cables: { from: string; fromPort: string; to: string; toPort: string }[];
		},
		params: Record<string, number>,
		baseFreq: number,
		t: number,
		heldSec: number,
		laneValues: Record<string, number> = {},
		presetGain = 1,
		/* What the key press itself was. ENTRY publishes these as pins, so a patch
       can wire velocity to brightness the way a real drum has it rather than
       only to level. */
		note: { velocity: number; noteIndex: number } = { velocity: 1, noteIndex: 48 },
		/* Whose voice this is. WHEN's "ANY VOICE" test asks what is sounding on
       this track, so the audio side needs it to answer the same question the
       action side does. */
		trackId?: number
	): {
		out: AudioNode;
		sources: AudioScheduledSourceNode[];
		/** When each source starts, so a SEQ gap reaches the sound and not only
        the modules that happen to schedule against the note time. */
		startAt: Map<AudioScheduledSourceNode, number>;
	} | null {
		/* Read from the catalogue rather than listed here. The list this replaces
       said ['fm','cv'] and had fallen behind the modules: pwm, trig and do are
       mod ports too, so a PWM cable was sorted as audio, found PULSE has no
       audio inlet, and was silently dropped. */
		const isExec = (c: { to: string; toPort: string; from: string; fromPort: string }) =>
			portKind(c.to, c.toPort, 'in') === 'exec' && portKind(c.from, c.fromPort, 'out') === 'exec';
		/* What kind of cable is this?
    
       Asked of the port on the module it lands on, not of the port's name.
       Matching bare ids across the whole catalogue looked equivalent and is
       not: `b` is an audio inlet on RING, SUM, DIFF and MIX and a value inlet
       on ADD, MUL and LERP, so every audio `b` in the instrument was being
       sorted as control -- it went looking for an AudioParam, found none, and
       vanished. RING was silent however it was wired. `out` is worse: it is the
       audio outlet of thirty modules and the value outlet of seven.
    
       A port belongs to a module. Look it up there. */
		const specById = new Map(MODULE_SPECS.map((m) => [m.id, m]));
		const typeOfNode = new Map(graph.nodes.map((n) => [n.id, n.type]));
		const portKind = (nodeId: string, portId: string, side: 'in' | 'out'): string | undefined => {
			const spec = specById.get(typeOfNode.get(nodeId) ?? '');
			if (!spec) return undefined;
			const list = side === 'in' ? spec.inputs : spec.outputs;
			const port = list.find((q) => q.id === portId);
			if (port) return port.kind;
			// A knob is an inlet too, and always a control one.
			if (side === 'in' && spec.params.some((q) => q.key === portId)) return 'mod';
			return undefined;
		};
		const isMod = (c: { to: string; toPort: string; from: string; fromPort: string }) =>
			c.fromPort.startsWith('lane:') || portKind(c.to, c.toPort, 'in') === 'mod';
		const execCables = graph.cables.filter(isExec);
		const audioCables = graph.cables.filter((c) => !isExec(c) && !isMod(c));
		const modCables = graph.cables.filter((c) => !isExec(c) && isMod(c));

		/* Values and execution, both resolved in one place.
    
       Every module reads its inputs through the resolver and reaches past it for
       nothing, which is what makes "an unwired socket falls back to its default"
       true everywhere at once. It used to be written per module and was
       therefore wrong per module: OSC read the key it was played from whatever
       its PITCH socket said, MODES consulted a knob and never the socket,
       STRING declared a socket the builder never read.
    
       See docs/node-graph.md for the contract, and stores/node-graph.ts for the
       implementation. */
		// Analysers for nodes this patch no longer holds are not coming back.
		if (!this.renderCtx) this.pruneProbes(graph);

		const resolver = createResolver(graph, params, {
			/* Semitones from the tuning reference, not hertz. ENTRY publishes a pitch
         and an oscillator takes a frequency, so a patch converts through FREQ --
         which is where the reference is chosen rather than assumed.
      
         Measured against master tuning so the round trip is exact: baseFreq
         already carries the tuning scale, and dividing it back out means a
         pitch through FREQ lands on the frequency the key actually plays,
         whatever A4 is set to. */
			pitch: 12 * Math.log2(Math.max(1e-6, baseFreq) / this.masterTuningFreq),
			tuning: this.masterTuningFreq,
			velocity: note.velocity,
			noteIndex: note.noteIndex,
			gate: heldSec,
			lanes: laneValues
		});
		const cvIn = (nodeId: string, port: string, fallback: number) =>
			resolver.input(nodeId, port, fallback);

		/* Which nodes this note runs. Execution is Blueprint's white wire: it
       reaches the nodes that *do* something -- WHEN asks, ACT mutes, OUT hands
       the patch to the master bus.
    
       There is no "unless the patch draws no exec cable" exemption; the seed
       patch draws the cable instead, so the simplest patch is still one you can
       play without building it. This comment used to claim the opposite of what
       execReach does, which is how the exemption stayed alive in the branch
       below long after it was deleted from the resolver. */
		const reach = execReach(graph, EXEC_PORT_IDS, 'in', (id) =>
			this.whenHolds(params, id, note.noteIndex, trackId ?? -1)
		);
		const outputRuns = (id: string) => runs(reach, id);
		/* When each node runs, in seconds after the note. Zero for everything the
       event reaches directly; SEQ adds its gap as execution passes through, so
       a strike wired downstream of one lands late -- which is a flam. */
		const delays = execDelays(graph, params, EXEC_PORT_IDS);

		// Kahn's algorithm; a cycle here means a hand-edited patch file, since the
		// editor refuses to draw one.
		const indeg = new Map<string, number>();
		for (const n of graph.nodes) indeg.set(n.id, 0);
		for (const c of audioCables) if (indeg.has(c.to)) indeg.set(c.to, (indeg.get(c.to) ?? 0) + 1);
		const queue = graph.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0);
		const order: typeof graph.nodes = [];
		while (queue.length) {
			const n = queue.shift()!;
			order.push(n);
			for (const c of audioCables) {
				if (c.from !== n.id) continue;
				const left = (indeg.get(c.to) ?? 0) - 1;
				indeg.set(c.to, left);
				if (left === 0) {
					const next = graph.nodes.find((m) => m.id === c.to);
					if (next) queue.push(next);
				}
			}
		}
		if (order.length !== graph.nodes.length) return null;

		const built = new Map<
			string,
			{
				in: AudioNode | null;
				in2?: AudioNode;
				out: AudioNode;
				out2?: AudioNode;
				mod: Map<string, AudioNode | AudioParam>;
				isOutput?: boolean;
				outs?: Map<string, AudioNode>;
			}
		>();
		/**
		 * Which node a cable leaves by.
		 *
		 * One lookup for both cable loops, by port name, so a named outlet works
		 * the same wherever it is wired. `out2` keeps serving the two-outlet
		 * modules that name their second port `r`; anything with a name of its own
		 * declares it in `outs`.
		 */
		const outletOf = (
			src: { out: AudioNode; out2?: AudioNode; outs?: Map<string, AudioNode> },
			port: string
		): AudioNode => src.outs?.get(port) ?? (port === 'r' && src.out2 ? src.out2 : src.out);

		const sources: AudioScheduledSourceNode[] = [];
		/* When each source starts, keyed by the node that made it.
    
       SEQ's gap reaches a module that schedules against `t` -- an envelope, a
       strike -- but every AudioScheduledSourceNode was started at the note
       regardless, so an oscillator behind a SEQ played on the beat and the flam
       the module exists for did not happen. */
		const startAt = new Map<AudioScheduledSourceNode, number>();
		const typeById = new Map(graph.nodes.map((n) => [n.id, n.type]));
		/* Modules whose output is a value, not a sound. A CONST left unwired must
       not be summed into the mix -- it is DC, and DC is a click and then a
       silent offset eating headroom. */
		/* Modules whose output is a value, not a sound. A CONST left unwired must
       not be summed into the mix -- it is DC, and DC is a click and then a
       silent offset eating headroom.
    
       Derived from the pure-node table rather than typed out beside it: the
       hand-written copy happened to be correct, and stayed correct only for as
       long as whoever added a pure node remembered this list existed. */
		const isModOnly = (type: string) => isPureNode(type) || type === 'env' || type === 'lfo';

		for (const node of order) {
			/* A knob reads its cable first, and its own setting when there is none.
      
         Blueprint has no separate notion of "modulatable" inputs: a pin either
         has something plugged into it or it uses its default. Doing the same
         here is what lets ENTRY's VEL reach a strike's TONE at all -- the mod
         map only ever registered a handful of hand-named ports (`fm`, `cv`,
         `pwm`), so every other knob was unreachable by cable no matter what the
         canvas showed. */
			const p = (key: string, def: number) =>
				cvIn(node.id, key, params[`${node.id}.${key}`] ?? def);
			const runAt = t + (delays.get(node.id) ?? 0);
			const madeBefore = sources.length;
			const made = this.buildGraphNode(
				ctx,
				node.type,
				p,
				baseFreq,
				runAt,
				heldSec,
				sources,
				node.id,
				laneValues,
				cvIn,
				{ ...note, tuning: this.masterTuningFreq },
				heldSec
			);
			if (!made) continue;
			// Whatever this node just created starts when this node runs.
			for (let i = madeBefore; i < sources.length; i++) startAt.set(sources[i], runAt);

			built.set(node.id, made);

			/* Feed it. A cable decides where a signal goes; the voice from racks 1-7
         only arrives on its own when the patch has no IN module to say so, which
         keeps older patches sounding as they did. */
			const feeds = audioCables.filter((c) => c.to === node.id);
			/* ADV is its own instrument.
      
         ENTRY used to hand the racks 1-7 voice through unconditionally, so every
         patch was the subtractive synth *plus* whatever was wired: a kit built
         entirely from EXCT and MODES still had an oscillator underneath it, and
         the only way to silence it was to zero four gains in every preset. ADV
         and the racks are two instruments rather than two views of one, so
         switching to ADV plays what the canvas says and nothing else. */
			if (made.in) {
				if (feeds.length) {
					for (const c of feeds) {
						// A module with two inlets takes its second signal on 'b' (or 'r').
						const dest = (c.toPort === 'b' || c.toPort === 'r') && made.in2 ? made.in2 : made.in;
						const src = built.get(c.from);
						if (!src) continue;
						// ...and one with two outlets sends its second from 'r'.
						outletOf(src, c.fromPort).connect(dest);
					}
				}
			}
		}

		// Mod cables last, so both ends exist however the graph was ordered.
		for (const c of modCables) {
			const src = built.get(c.from);
			const dst = built.get(c.to);
			const param = dst?.mod.get(c.toPort);
			if (!src || !param) continue;
			/* A pure node -- and ENTRY -- is already in the number.
      
         The resolver pulled its value and the module set it as the param's
         `.value` before this loop ran, so connecting it as a signal too would
         apply it twice: CONST 50 into MIX's A gave a gain of 1.0 rather than
         0.5, and CONST 100 gave 2.0. ENTRY resolves the same way, by pin name,
         so its VEL into a knob doubled in exactly the same manner.
      
         Only cables onto a *knob* are skipped. A declared mod inlet -- a VCA's
         CV, a PULSE's PWM -- has no value path at all, so ENTRY's VEL reaching
         one of those is a signal and must still be connected.
      
         The two mechanisms are one decision seen from either side -- a value
         replaces the knob, a signal adds to it (docs/node-graph.md, "A value
         replaces a knob; a signal adds to it") -- so exactly one of them may
         act on any given cable. */
			const fromType = typeById.get(c.from) ?? '';
			const ontoKnob = !specById
				.get(typeOfNode.get(c.to) ?? '')
				?.inputs.some((q) => q.id === c.toPort);
			if (ontoKnob && (isPureNode(fromType) || fromType === 'in')) continue;
			const from = outletOf(src, c.fromPort);
			/* An AudioParam and an AudioNode are both legitimate destinations, and
         TypeScript needs telling which overload applies. A param destination is
         what makes a signal into PITCH mean FM rather than needing an inlet of
         its own with a depth baked into it. */
			if (param instanceof AudioParam) from.connect(param);
			else from.connect(param);
		}

		/* Where the patch leaves.
    
       With an OUT module, only what reaches it is heard -- so a module dragged
       onto the canvas and not yet wired is silent, which is what anyone would
       expect while building. Without one the old rule stands: every node nothing
       else listens to is an output, which keeps existing patches sounding as
       they did and lets a two-ended patch run two voices in parallel. */
		const sink = ctx.createGain();
		let any = false;
		const outs = [...built.entries()].filter(([, m]) => m.isOutput);
		if (outs.length) {
			for (const [id, m] of outs) {
				// An OUT execution never reached does not pass anything on.
				if (!outputRuns(id)) continue;
				m.out.connect(sink);
				any = true;
			}
		} else {
			for (const [id, made] of built) {
				if (audioCables.some((c) => c.from === id)) continue;
				if (modCables.some((c) => c.from === id)) continue;
				// A modulator is not a voice: ENV and LFO exist to drive a param, so an
				// unpatched one is a mistake to leave silent rather than a tone to mix in.
				if (isModOnly(typeById.get(id) ?? '')) continue;
				/* Execution gates this branch too. Gating only the OUT branch left the
           removed "runs everything" exemption alive under a new condition --
           no OUT module rather than no exec cables -- and a terminal node in
           such a patch sounded whatever the white wire said. */
				if (!outputRuns(id)) continue;
				made.out.connect(sink);
				any = true;
			}
		}
		if (!any) return null;
		/* The preset's own level applies here too.
    
       presetGain multiplies the voice, which is the whole signal for a rack
       patch but only the excitation for a graph one -- a graph builds its own
       sound downstream of it, so the five patches whose sources are EXCT or
       NOISE ignored the field entirely and stayed where they were while the
       other 32 moved. One multiply at the sink covers both kinds. */
		const level = ctx.createGain();
		level.gain.value = presetGain;
		sink.connect(level);
		return { out: level, sources, startAt };
	}

	/**
	 * Analysers placed by SCOPE / FFT / LOUD, so the canvas can draw what is
	 * flowing at that point.
	 *
	 * Keyed by node id alone, which is what ProbeDisplay looks up. The docstring
	 * here used to claim `<trackId>:<nodeId>` and that the map was cleared on
	 * rebuild; neither was true, and a comment asserting an invariant nobody
	 * maintains is worse than no comment. Two tracks holding a node with the same
	 * id would share an entry -- only the active track's canvas reads it, so the
	 * last note to build wins, which is the one being looked at.
	 *
	 * Each note replaces its own entries, and `pruneProbes` drops the ones whose
	 * nodes are gone, so it tracks the patch rather than growing with it.
	 */
	public graphProbes = new Map<string, AnalyserNode>();

	/** Forget analysers for nodes the patch no longer has. */
	private pruneProbes(graph: { nodes: { id: string }[] }): void {
		const live = new Set(graph.nodes.map((n) => n.id));
		for (const id of this.graphProbes.keys()) if (!live.has(id)) this.graphProbes.delete(id);
	}

	/** One graph node. Returns its audio ends and the params a cable may drive. */

	private buildGraphNode(
		ctx: BaseAudioContext,
		type: string,
		p: (key: string, def: number) => number,
		baseFreq: number,
		t: number,
		heldSec: number,
		sources: AudioScheduledSourceNode[],
		probeKey = '',
		/* What each lane read at this note, 0..1, keyed by lane id. ENTRY turns
       these into CV outlets, which is what makes a curve drawn in the roll and
       a cable in the patch bay the same thing. */
		laneValues: Record<string, number> = {},
		/* What a value inlet reads: the pure node wired into it, or the fallback
       when nothing is. Resolved by the caller, which knows the graph. */
		cvIn: (nodeId: string, port: string, fallback: number) => number = (_n, _p, f) => f,
		/* The event's own data, for ENTRY's output pins and for the converters,
       which read the master tuning off it. */
		note: { velocity: number; noteIndex: number; tuning?: number } = { velocity: 1, noteIndex: 48 },
		gateSec = 0
	): {
		in: AudioNode | null;
		/** A second audio inlet, for the modules that take two signals. */
		in2?: AudioNode;
		out: AudioNode;
		/** A second audio outlet, for the modules that hand back two signals. */
		out2?: AudioNode;
		mod: Map<string, AudioNode | AudioParam>;
		/** The patch's output; when present, only what reaches it is heard. */
		isOutput?: boolean;
		/**
		 * Outlets that carry a signal under their own name.
		 *
		 * The destination side of a cable has always been looked up by port name,
		 * in `mod`. The source side was not: it took `out`, or `out2` for the one
		 * port literally called `r`, and everything else fell back to `out`. So a
		 * module publishing a second *named* outlet had nowhere to put it, and
		 * ENTRY -- whose four event pins are its whole reason to exist -- filed
		 * them in `mod`, which is only ever read on the destination. Its VEL pin
		 * connected the silent gain instead, and a hard hit and a soft one came out
		 * at the same level with the cable drawn on the canvas.
		 *
		 * Both ends now resolve a port by name through the same map. `lane:<id>`
		 * lives here too, so ENTRY can publish as many outlets as the track carries
		 * without the port list being fixed at build time.
		 */
		outs?: Map<string, AudioNode>;
	} | null {
		const mod = new Map<string, AudioNode | AudioParam>();
		/**
		 * A knob, set from its value and registered as a modulation target.
		 *
		 * `p('cutoff', 4000)` reads the knob; `knob(f.frequency, 'cutoff', 4000)`
		 * reads it *and* records which AudioParam it lives on, so a cable onto that
		 * knob has somewhere to land. Six inlets were registered by hand out of
		 * ninety-nine params, and the other ninety-three were resolved as values --
		 * fine for a CONST, and zero for an ENV or an LFO, which have no value to
		 * pull. A filter told to follow an envelope sat at 0 Hz and played silence
		 * with the cable drawn on the canvas.
		 *
		 * Binding it where the value is read means a knob cannot be modulatable in
		 * the catalogue and inert in the engine: they are the same line.
		 */
		const knob = (target: AudioParam, key: string, def: number): number => {
			const v = p(key, def);
			target.value = v;
			mod.set(key, target);
			return v;
		};
		/**
		 * A knob whose stored value is not what the param holds.
		 *
		 * COMP's ATTACK is milliseconds and `attack` is seconds; PAN's POS is
		 * -100..100 and `pan` is -1..1. `scale` converts one to the other, and the
		 * cable goes through the same conversion, so a patched value means what the
		 * turned value means. Without it a CONST of 100 into PAN's POS would slam
		 * the pan param to 100 -- a hundred times hard right.
		 */
		const knobAt = (
			target: AudioParam,
			key: string,
			def: number,
			scale: number,
			clamp?: (v: number) => number
		): number => {
			const raw = p(key, def) * scale;
			target.value = clamp ? clamp(raw) : raw;
			const gain = ctx.createGain();
			gain.gain.value = scale;
			gain.connect(target);
			mod.set(key, gain);
			return target.value;
		};
		/** The same, for a knob stored 0..100 and used as a fraction. */
		const knobPct = (target: AudioParam, key: string, def: number): number => {
			const v = p(key, def) / 100;
			target.value = v;
			/* The cable arrives in the knob's units, not the param's.
      
         Registering `target` directly made the two disagree by a factor of a
         hundred: the knob reads 0..100 and divides, so MIX A at 100 is a gain
         of 1 -- but a CONST of 100 patched into the same inlet landed on the
         param whole and gave a gain of 101, which is 40 dB of gain nobody
         asked for. A scaling node in front means "100" means the same thing
         whether it is turned or patched. */
			const scale = ctx.createGain();
			scale.gain.value = 0.01;
			scale.connect(target);
			mod.set(key, scale);
			return v;
		};
		/**
		 * A wet/dry pair driven as one crossfade, from a knob stored 0..100.
		 *
		 * `knobPct` on the wet leg alone was not a mix: it registered a scaling
		 * node onto `wet.gain` while the dry leg was a plain assignment with no
		 * source, so turning MIX by hand crossfaded but *patching* it only raised
		 * the wet. At MIX 30 with an envelope adding 0.7 the module summed dry 0.7
		 * and wet 1.0 -- louder than either end of the knob, and never reaching
		 * full wet. One CV moving both gains in opposite directions is what BLEND
		 * already does; this is the same thing for the two FX that have a mix.
		 */
		const knobMix = (wet: GainNode, dry: GainNode, key: string, def: number): void => {
			const v = p(key, def) / 100;
			wet.gain.value = v;
			dry.gain.value = 1 - v;
			const up = ctx.createGain();
			up.gain.value = 0.01;
			up.connect(wet.gain);
			const down = ctx.createGain();
			down.gain.value = -1;
			up.connect(down);
			down.connect(dry.gain);
			mod.set(key, up);
		};
		/* Indexed straight off the catalogue's list, so the button that says SAW
       and the wave that plays cannot disagree -- they did, and three of the
       four labels named the wrong shape. */
		const WAVES: OscillatorType[] = WAVE_SHAPES.map((w) => w.type as OscillatorType);

		switch (type) {
			case 'osc': {
				const osc = ctx.createOscillator();
				osc.type = WAVES[Math.round(p('wave', 0))] ?? 'sine';
				/* The note if PITCH is wired, and the knob if it is not.
        
           An oscillator used to read the key it was played from whether or not
           anything was patched into it, so every OSC tracked the keyboard and a
           fixed drone was unsayable -- and, worse, the cable you could see made
           no difference to what you heard. */
				osc.frequency.value = cvIn(probeKey, 'pitch', 220);
				const g = ctx.createGain();
				osc.connect(g);
				sources.push(osc);
				/* PITCH is read as a value, above, and not also registered as a
           modulation destination.
        
           Doing both put the same cable through twice: FREQ's 440 became the
           oscillator's base frequency *and* was connected to that frequency as a
           signal, so the note came out an octave sharp. Audio-rate FM would need
           the param registered here, but then a constant would have to be
           excluded from it -- and the two cannot be told apart at this point,
           because a resolved value and a connected signal look identical to the
           inlet. Value wins: it is what every other pitched module does. */
				return { in: null, out: g, mod };
			}

			case 'noise': {
				if (!this.noiseBuffer) this.initNoiseBuffer();
				const nz = ctx.createBufferSource();
				nz.buffer = this.noiseBuffer;
				nz.loop = true;
				const g = ctx.createGain();
				g.gain.value = 1;
				/* COL picks the noise's slope. The card has drawn this knob since the
           module was added and the engine never read it, so all three settings
           sounded identical -- white, whatever the label said.
        
           White is the buffer as generated. Pink falls about 3 dB per octave
           and brown about 6, which one-pole low-passes approximate closely
           enough at these gains; the make-up gain is because each pole throws
           away most of the energy and an unlifted brown setting simply reads as
           "quieter" rather than "darker". */
				const colour = Math.round(p('colour', 0));
				let tail: AudioNode = nz;
				if (colour >= 1) {
					const lp = ctx.createBiquadFilter();
					lp.type = 'lowpass';
					lp.frequency.value = colour >= 2 ? 440 : 1800;
					lp.Q.value = 0.0001;
					tail.connect(lp);
					tail = lp;
					const makeup = ctx.createGain();
					makeup.gain.value = colour >= 2 ? 5.5 : 2.2;
					tail.connect(makeup);
					tail = makeup;
				}
				tail.connect(g);
				sources.push(nz);
				return { in: null, out: g, mod };
			}

			case 'filter': {
				const TYPES: BiquadFilterType[] = ['lowpass', 'bandpass', 'highpass', 'notch'];
				const f = ctx.createBiquadFilter();
				f.type = TYPES[Math.round(p('type', 0))] ?? 'lowpass';
				knob(f.frequency, 'cutoff', 4000);
				knob(f.Q, 'q', 1);
				/* How far the FM inlet swings the cutoff, in hertz.
        
           It used to be `cutoff * depth/100`, so the FREQ knob silently scaled
           it: moving the cutoff changed how far the modulation reached, and two
           knobs shared one meaning with no way to see it on the card. DEPTH is
           now the swing itself, which is what its Hz unit says. Scaling a
           control signal by a value is what MUL is for. */
				const depth = ctx.createGain();
				knob(depth.gain, 'depth', 2000);
				depth.connect(f.frequency);
				mod.set('fm', depth);
				return { in: f, out: f, mod };
			}

			case 'vca': {
				/* An amplifier: one gain, and a CV that adds to it.
        
           DEPTH used to sit on the CV leg, scaling the control signal before it
           reached the gain -- a second VCA welded onto the first, and the thing
           OSC's LVL knob was removed for. It also made two different silences
           with two different causes (GAIN 0 with DEPTH 100, or the other way
           round), and the sum was unbounded despite a knob reading `%`.
        
           A CV that needs attenuating is attenuated at its source: LFO has AMT,
           ENV has its own shape, and a value can go through MUL. */
				const g = ctx.createGain();
				knobPct(g.gain, 'gain', 100);
				/* The inlet is a node whose output sums into the gain param, not the
           param itself: registering `g.gain` would make a cable land on the
           knob, which has nothing feeding it, so the destination never moved. */
				const cv = ctx.createGain();
				cv.gain.value = 1;
				cv.connect(g.gain);
				mod.set('cv', cv);
				return { in: g, out: g, mod };
			}

			case 'env': {
				/* An envelope is a source of control, not of sound: a constant of 1
           through a gain the envelope shapes, so a cable from it carries the
           envelope's value. */
				const dc = ctx.createConstantSource();
				dc.offset.value = 1;
				const g = ctx.createGain();
				const a = p('envA', 0.005);
				const d = p('envD', 0.2);
				const sus = p('envS', 60) / 100;
				const r = p('envR', 0.2);
				g.gain.setValueAtTime(0, t);
				g.gain.linearRampToValueAtTime(1, t + Math.max(0.001, a));
				g.gain.linearRampToValueAtTime(
					Math.max(0.0001, sus),
					t + Math.max(0.001, a) + Math.max(0.001, d)
				);
				g.gain.setValueAtTime(Math.max(0.0001, sus), t + Math.max(a + d, heldSec));
				g.gain.linearRampToValueAtTime(0, t + Math.max(a + d, heldSec) + Math.max(0.001, r));
				dc.connect(g);
				sources.push(dc);
				/* The catalogue names this outlet CV, and presets draw cables from
           `cv`. It resolved only because an unrecognised port falls back to
           `out` -- the same fallback that let BREAK's AMP ship raw audio into
           a CV leg. Publishing the name makes the declaration true instead of
           merely lucky. */
				return { in: null, out: g, outs: new Map([['cv', g]]), mod };
			}

			case 'lfo': {
				const osc = ctx.createOscillator();
				osc.type = WAVES[Math.round(p('lfoWave', 0))] ?? 'sine';
				knob(osc.frequency, 'lfoRate', 5);
				const g = ctx.createGain();
				knobPct(g.gain, 'lfoAmt', 50);
				osc.connect(g);
				sources.push(osc);
				/* The FM inlet's depth is the rate itself -- an octave of sweep per
           unit of CV -- not a knob of its own, so it is set rather than bound:
           binding it would register `lfoRate` a second time and overwrite the
           oscillator's own frequency as the knob's target. */
				const fm = ctx.createGain();
				fm.gain.value = p('lfoRate', 5);
				fm.connect(osc.frequency);
				mod.set('fm', fm);
				// Named, for the same reason ENV's is.
				return { in: null, out: g, outs: new Map([['cv', g]]), mod };
			}

			case 'mix': {
				/* Two inlets with their own levels. The card has drawn A and B knobs
           since the module was added, but this returned a single gain node as
           both inlets and ignored both values -- so turning either knob did
           nothing, and every patch that leaned on the balance (MARIMBA's
           resonator against its bar, PIANO's second string) got whatever the
           raw sum happened to be. */
				const out = ctx.createGain();
				const a = ctx.createGain();
				knobPct(a.gain, 'mixA', 100);
				a.connect(out);
				const b = ctx.createGain();
				knobPct(b.gain, 'mixB', 100);
				b.connect(out);
				return { in: a, in2: b, out, mod };
			}

			case 'eq': {
				/* Three bands, and all three corners move. LOW and HIGH were literals
           -- 200 and 5000 -- so a card presenting a three-band EQ had two bands
           you could only make louder, never place: boosting LOW on a 60 Hz kick
           lifted everything under 200 Hz equally and muddied it, with no way to
           reach down to where the weight actually is. */
				const low = ctx.createBiquadFilter();
				low.type = 'lowshelf';
				knob(low.frequency, 'lowFreq', 200);
				knob(low.gain, 'lowGain', 0);
				const mid = ctx.createBiquadFilter();
				mid.type = 'peaking';
				knob(mid.frequency, 'midFreq', 1200);
				knob(mid.Q, 'midQ', 1);
				knob(mid.gain, 'midGain', 0);
				const high = ctx.createBiquadFilter();
				high.type = 'highshelf';
				knob(high.frequency, 'highFreq', 5000);
				knob(high.gain, 'highGain', 0);
				low.connect(mid);
				mid.connect(high);
				return { in: low, out: high, mod };
			}

			case 'excite': {
				/* The strike, pluck or breath that starts an acoustic sound.
        
           A resonator needs something to hit it: a few milliseconds of noise
           shaped by how hard and how bright the contact is. Hardness moves it
           between a soft mallet and a stick, LEN is the contact time, and TONE
           is the filter the burst arrives through.
        
           This had a palette entry and no implementation -- it fell through to
           buildRackModule, which does not handle it either -- so every EXCT
           placed on a canvas was silent. */
				if (!this.noiseBuffer) this.initNoiseBuffer();
				const nz = ctx.createBufferSource();
				nz.buffer = this.noiseBuffer;
				nz.loop = true;

				const tone = ctx.createBiquadFilter();
				tone.type = 'lowpass';
				knob(tone.frequency, 'exTone', 3000);
				// A harder strike is a brighter, tighter contact.
				tone.Q.value = 0.7 + (p('hardness', 50) / 100) * 3;

				const g = ctx.createGain();
				const len = Math.max(0.001, p('exLength', 6) / 1000);
				/* A burst, not a tone: up in well under a millisecond and gone by LEN.
           Ending on an exponential leaves a step to silence, so it finishes on
           a short linear ramp to zero. */
				g.gain.setValueAtTime(0, t);
				g.gain.linearRampToValueAtTime(1, t + 0.0004);
				g.gain.exponentialRampToValueAtTime(0.0001, t + len);
				g.gain.linearRampToValueAtTime(0, t + len + 0.002);

				nz.connect(tone);
				tone.connect(g);
				sources.push(nz);
				return { in: null, out: g, mod };
			}

			case 'sub': {
				/* An octave (or two) below the note, as a pure shape. Racks 1-7 have
           this on the oscillator page; a patch that could not put weight under
           a voice was missing something the fixed chain already had. */
				const osc = ctx.createOscillator();
				osc.type = WAVES[Math.round(p('subWave', 0))] ?? 'sine';
				osc.frequency.value =
					cvIn(probeKey, 'pitch', 110) / Math.pow(2, Math.max(1, Math.round(p('subOct', 1))));
				const g = ctx.createGain();
				g.gain.value = 1;
				osc.connect(g);
				sources.push(osc);
				return { in: null, out: g, mod };
			}

			case 'pulse': {
				/* A square whose width is settable and modulatable. Web Audio has no
           pulse oscillator, so it is built the standard way: a sawtooth minus
           a phase-shifted copy of itself is a rectangle whose duty cycle is the
           shift. PWM is what makes a single oscillator sound like two. */
				const width = Math.min(0.95, Math.max(0.05, p('pw', 50) / 100));
				const a = ctx.createOscillator();
				a.type = 'sawtooth';
				/* No RATIO. Multiplying the pitch is what MUL does, and the knob was
           the one OSC lost for the same reason: put a MUL on the cable. */
				const pulseRoot = cvIn(probeKey, 'pitch', 220);
				a.frequency.value = pulseRoot;
				const b = ctx.createOscillator();
				b.type = 'sawtooth';
				b.frequency.value = a.frequency.value;
				// The delay that sets the duty cycle: one period times the width.
				const period = 1 / Math.max(1, a.frequency.value);
				const dl = ctx.createDelay(1);
				dl.delayTime.value = period * width;
				const inv = ctx.createGain();
				inv.gain.value = -1;
				const sum = ctx.createGain();
				sum.gain.value = 1;
				a.connect(sum);
				b.connect(dl);
				dl.connect(inv);
				inv.connect(sum);
				sources.push(a, b);
				// Modulating the delay sweeps the width, which is the PWM everyone wants.
				const pwm = ctx.createGain();
				pwm.gain.value = period * 0.4;
				pwm.connect(dl.delayTime);
				mod.set('pwm', pwm);
				return { in: null, out: sum, mod };
			}

			case 'blend': {
				/* Tilt between what arrives here and a filtered copy of it: rack 2's
           MORPH as a cable. One input, like every other module -- the graph
           joins several cables into one inlet by summing them, so a second
           inlet would be a second sum, not a second signal.

           MIX drives the balance from a CV, so an envelope can sweep a voice
           from dark to bright across the note. */
				const x = Math.min(1, Math.max(0, p('blendMix', 50) / 100));
				const input = ctx.createGain();
				const out = ctx.createGain();
				const dark = ctx.createBiquadFilter();
				dark.type = 'lowpass';
				knob(dark.frequency, 'blendTone', 800);
				const ga = ctx.createGain();
				const gb = ctx.createGain();
				ga.gain.value = 1 - x;
				gb.gain.value = x;
				input.connect(dark);
				dark.connect(ga);
				ga.connect(out);
				input.connect(gb);
				gb.connect(out);
				/* One CV moves both gains in opposite directions, so the pair stays a
           crossfade rather than becoming a level control. */
				const up = ctx.createGain();
				up.gain.value = 1;
				up.connect(gb.gain);
				const down = ctx.createGain();
				down.gain.value = -1;
				up.connect(down);
				down.connect(ga.gain);
				mod.set('cv', up);
				return { in: input, out, mod };
			}

			case 'delay': {
				/* A tap with feedback. Rack 6 has one on the master bus; here it is a
           module, so it can sit inside a voice -- a slapback on the string but
           not on the body, which the fixed chain cannot do.

           The feedback gain is assigned, not scheduled: setValueAtTime leaves
           a param at its default until the given time, and a voice is built
           slightly ahead of when it sounds, so for those milliseconds the loop
           would run at a gain of 1 with a delay of 0. */
				const input = ctx.createGain();
				const out = ctx.createGain();
				const dl = ctx.createDelay(2);
				knobAt(dl.delayTime, 'dlTime', 220, 0.001, (v) => Math.min(2, Math.max(0.001, v)));
				const fb = ctx.createGain();
				// Capped below unity: a delay line at g >= 1 never stops growing.
				knobAt(fb.gain, 'dlFeedback', 35, 0.01, (v) => Math.min(0.85, Math.max(0, v)));
				const damp = ctx.createBiquadFilter();
				damp.type = 'lowpass';
				knob(damp.frequency, 'dlTone', 6000);
				const wet = ctx.createGain();
				const dry = ctx.createGain();
				knobMix(wet, dry, 'dlMix', 30);
				input.connect(dry);
				dry.connect(out);
				input.connect(dl);
				dl.connect(damp);
				damp.connect(fb);
				fb.connect(dl);
				dl.connect(wet);
				wet.connect(out);
				return { in: input, out, mod };
			}

			case 'space': {
				/* A room. Every acoustic instrument is heard in one, and a bare
           resonator sounds like a recording made inside a box of cotton wool.
           A short generated impulse rather than a file: the size is a knob, and
           a patch has to stay self-contained. */
				const input = ctx.createGain();
				const out = ctx.createGain();
				const seconds = Math.min(4, Math.max(0.05, (p('spaceSize', 40) / 100) * 3));
				/* DECAY runs the way its label reads: turn it up and the tail lasts
           longer. It is the exponent of the impulse envelope, so a *bigger*
           number decays faster -- the knob was wired straight to it and ran
           backwards, and the only thing setting the actual tail length was
           SIZE. Invert it, and floor the exponent so the top of the knob is a
           slow room rather than an undefined one. */
				const decay = Math.max(0.1, (1 - p('spaceDecay', 60) / 100) * 3);
				const rate = ctx.sampleRate;
				const len = Math.max(1, Math.floor(seconds * rate));
				const buf = ctx.createBuffer(2, len, rate);
				for (let ch = 0; ch < 2; ch++) {
					const d = buf.getChannelData(ch);
					for (let i = 0; i < len; i++) {
						// Noise under an exponential envelope is the cheapest honest room.
						d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay * 2 + 1);
					}
				}
				const cv = ctx.createConvolver();
				cv.buffer = buf;
				const wet = ctx.createGain();
				const dry = ctx.createGain();
				knobMix(wet, dry, 'spaceMix', 30);
				input.connect(dry);
				dry.connect(out);
				input.connect(cv);
				cv.connect(wet);
				wet.connect(out);
				return { in: input, out, mod };
			}

			case 'comb': {
				/* Where the string is struck or plucked. A comb filter notches out the
           partials that have a node at that point, which is why a guitar
           plucked at the bridge is thin and nasal and the same string plucked
           over the hole is round. The fixed chain has no way to say this. */
				const input = ctx.createGain();
				const out = ctx.createGain();
				const pos = Math.min(0.5, Math.max(0.02, p('combPos', 25) / 100));
				const dl = ctx.createDelay(0.05);
				dl.delayTime.value = Math.min(0.05, pos / Math.max(1, cvIn(probeKey, 'pitch', 220)));
				const inv = ctx.createGain();
				knobAt(inv.gain, 'combDepth', 80, -0.01);
				input.connect(out);
				input.connect(dl);
				dl.connect(inv);
				inv.connect(out);
				return { in: input, out, mod };
			}

			case 'bow': {
				/* Friction. A bow does not strike and then let go -- it grabs the
           string, drags it, slips, and grabs again, hundreds of times a second,
           which is why a violin sustains and a plucked string does not.

           The slip-stick is a sawtooth at the note, roughened by noise: the
           scrape is what separates a bowed string from an organ. It is a source
           because a bow starts the sound rather than shaping one. */
				const out = ctx.createGain();
				const drag = ctx.createOscillator();
				drag.type = 'sawtooth';
				const bowRoot = cvIn(probeKey, 'pitch', 220);
				drag.frequency.value = bowRoot;
				const dg = ctx.createGain();
				dg.gain.value = 1 - (p('bowNoise', 25) / 100) * 0.5;
				drag.connect(dg);
				dg.connect(out);
				if (!this.noiseBuffer) this.initNoiseBuffer();
				const scrape = ctx.createBufferSource();
				scrape.buffer = this.noiseBuffer;
				scrape.loop = true;
				const sg = ctx.createGain();
				sg.gain.value = (p('bowNoise', 25) / 100) * 0.6;
				// Bow noise is a hiss riding the note, not a rumble under it.
				const hp = ctx.createBiquadFilter();
				hp.type = 'highpass';
				hp.frequency.value = Math.max(200, bowRoot * 2);
				scrape.connect(hp);
				hp.connect(sg);
				sg.connect(out);
				/* Pressure is how hard the bow bites: more pressure, more of the
           sawtooth's upper corner, which is the sound of digging in. */
				const tone = ctx.createBiquadFilter();
				tone.type = 'lowpass';
				tone.frequency.value = 400 + (p('bowPressure', 50) / 100) * 7000;
				const level = ctx.createGain();
				out.connect(tone);
				tone.connect(level);
				/* The bow speaks rather than starting instantly: rosin has to catch.
           BITE is that catch time -- 5 to 120 ms -- and read as a percentage
           because that is the scale its knob is on. */
				const att = Math.max(0.005, (p('bowBite', 40) / 100) * 0.12);
				level.gain.setValueAtTime(0, t);
				level.gain.linearRampToValueAtTime(1, t + att);
				sources.push(drag, scrape);
				return { in: null, out: level, mod };
			}

			case 'reed': {
				/* A reed is a valve, not a tone. Blowing harder does not make a
           clarinet louder in a straight line -- past a point the reed slams
           shut and the waveform squares off, which is where the honk lives.
           A tanh with an offset is that curve, and it belongs on its own so it
           can sit between a breath source and a tube. */
				const shaper = ctx.createWaveShaper();
				const stiff = p('reedStiff', 50) / 100;
				const bias = p('reedBias', 40) / 100;
				const n = 1024;
				const curve = new Float32Array(n);
				const k = 1 + stiff * 25;
				for (let i = 0; i < n; i++) {
					const x = (i / (n - 1)) * 2 - 1;
					// Asymmetric: a reed closes one way and cannot open past its rest.
					const v = Math.tanh((x + bias * 0.5) * k);
					curve[i] = Math.min(1, v) * 0.8;
				}
				shaper.curve = curve;
				shaper.oversample = '2x';
				const trim = ctx.createGain();
				trim.gain.value = 1 / (1 + stiff);
				shaper.connect(trim);
				return { in: shaper, out: trim, mod };
			}

			case 'pan': {
				/* Placing the instrument. Rack 7 has it on the output; as a module it
           can differ per branch, so a patch can put the body somewhere the
           string is not. */
				const pn = ctx.createStereoPanner();
				knobAt(pn.pan, 'panPos', 0, 0.01, (v) => Math.max(-1, Math.min(1, v)));
				/* One knob, like VCA: DPTH was a gain stage on the control leg, which
           is a second module hiding inside this one. A CV is attenuated where
           it is made. */
				const cv = ctx.createGain();
				cv.gain.value = 1;
				cv.connect(pn.pan);
				mod.set('cv', cv);
				return { in: pn, out: pn, mod };
			}

			case 'comp': {
				/* Rack 6's compressor, as a module. A struck body has a transient far
           above its own sustain, and something has to hold it down before the
           output does it less kindly. */
				const c = ctx.createDynamicsCompressor();
				knobAt(c.threshold, 'compThresh', -18, 1, (v) => Math.max(-60, Math.min(0, v)));
				knobAt(c.ratio, 'compRatio', 4, 1, (v) => Math.max(1, Math.min(20, v)));
				knobAt(c.attack, 'compAttack', 5, 0.001, (v) => Math.max(0, Math.min(1, v)));
				knobAt(c.release, 'compRelease', 120, 0.001, (v) => Math.max(0.01, Math.min(1, v)));
				c.knee.value = 6;
				const makeup = ctx.createGain();
				/* Not a modulation target. The knob is decibels and the param is a
           linear gain, and the conversion between them is exponential -- so a
           cable would have to carry dB and arrive multiplied, which no scaling
           node can do. Registering it anyway would make "6" mean six times
           rather than six decibels, which is the units bug this file has
           already been through twice. Drive a VCA instead. */
				makeup.gain.value = Math.pow(10, p('compGain', 0) / 20);
				c.connect(makeup);
				return { in: c, out: makeup, mod };
			}

			case 'break': {
				/* A signal taken apart into what describes it.
        
           MID and SIDE are the sum and difference of the two channels, which is
           the standard pair: mid is what both channels agree on, side is what
           only one of them has. AMP is an analyser read as a number, so a filter
           can follow how loud the signal is -- an audio cable cannot say that,
           because a knob does not take sound. */
				const input = ctx.createGain();
				const splitter = ctx.createChannelSplitter(2);
				input.connect(splitter);

				const mid = ctx.createGain();
				const side = ctx.createGain();
				// L+R and L-R, each halved so a centred signal comes back at unity.
				const half = () => {
					const g = ctx.createGain();
					g.gain.value = 0.5;
					return g;
				};
				const lm = half(),
					rm = half(),
					ls = half(),
					rs = half();
				rs.gain.value = -0.5;
				splitter.connect(lm, 0);
				splitter.connect(rm, 1);
				splitter.connect(ls, 0);
				splitter.connect(rs, 1);
				lm.connect(mid);
				rm.connect(mid);
				ls.connect(side);
				rs.connect(side);

				/* The AMP outlet: how loud what arrived is, as a control signal.
        
           An AnalyserNode was the wrong instrument -- nothing reads one back as
           CV, so the socket emitted nothing at all, and because it was declared
           on port id `out` it fell through to `mid` and connected raw audio
           into whatever knob it reached. A cable to a VCA's CV gave ring
           modulation at the signal's own frequency instead of an envelope.
        
           A rectifier and a lowpass is what an envelope follower is: square the
           signal against itself, then smooth. Both ends are real audio nodes,
           so the value moves with the sound the way ENV's does. */
				const rect = ctx.createWaveShaper();
				const curve = new Float32Array(257);
				for (let i = 0; i < curve.length; i++) {
					const x = (i / (curve.length - 1)) * 2 - 1;
					curve[i] = Math.abs(x);
				}
				rect.curve = curve;
				const smooth = ctx.createBiquadFilter();
				smooth.type = 'lowpass';
				smooth.frequency.value = 20;
				input.connect(rect);
				rect.connect(smooth);

				/* Named outlets, so each of the three sockets carries what its label
           says. `mid` and `side` used to ride on `out`/`out2`, which meant the
           port literally named `side` resolved to the mid gain. */
				const outs = new Map<string, AudioNode>([
					['mid', mid],
					['side', side],
					['out', smooth]
				]);

				return { in: input, out: mid, out2: side, outs, mod };
			}

			case 'make': {
				/* Mid and side back into two channels: L is mid plus side, R is mid
           minus it. WIDE scales the side, which is what stereo width is. */
				const midIn = ctx.createGain();
				const sideIn = ctx.createGain();
				const wide = ctx.createGain();
				wide.gain.value = Math.max(0, cvIn(probeKey, 'wide', 1));
				/* WIDE is a declared `mod` inlet on the card, so a cable has to be able
           to land on it. It was read as a value and never registered, and since
           MAKE deliberately carries no WIDE knob the resolver fell through to
           the caller's fallback of 1 -- the width was pinned at unity and the
           socket did nothing at all. */
				mod.set('wide', wide.gain);
				sideIn.connect(wide);

				const merger = ctx.createChannelMerger(2);
				const l = ctx.createGain();
				const r = ctx.createGain();
				const negate = ctx.createGain();
				negate.gain.value = -1;
				midIn.connect(l);
				wide.connect(l);
				midIn.connect(r);
				wide.connect(negate);
				negate.connect(r);
				l.connect(merger, 0, 0);
				r.connect(merger, 0, 1);
				return { in: midIn, in2: sideIn, out: merger, mod };
			}

			case 'mono': {
				/* Both channels summed to one, halved so a centred signal keeps its
           level rather than doubling. */
				const input = ctx.createGain();
				const splitter = ctx.createChannelSplitter(2);
				const out = ctx.createGain();
				const gl = ctx.createGain(),
					gr = ctx.createGain();
				gl.gain.value = 0.5;
				gr.gain.value = 0.5;
				input.connect(splitter);
				splitter.connect(gl, 0);
				splitter.connect(gr, 1);
				gl.connect(out);
				gr.connect(out);
				return { in: input, out, mod };
			}

			/* The pure value nodes.
      
         The arithmetic itself lives in stores/node-graph, in one table, and is
         shared with the resolver -- it was written twice before, once to build
         the node and once to pull a value through it, which is exactly the kind
         of duplication that drifts apart.
      
         The result is a ConstantSourceNode so that a cable from one of these
         lands on a knob the same way an envelope does. Resolved at build time,
         because the graph is rebuilt per note and the value is known before
         anything is created. */
			case 'tofreq':
			case 'topitch':
			case 'const':
			case 'add':
			case 'mul':
			case 'remap':
			case 'clamp':
			case 'lerp':
			case 'curve': {
				/* The note goes with it. TO-FREQ and TO-PITCH read the master tuning
           off the event, so omitting it silently fell back to A=440 -- the same
           converter answered 432 through the resolver and 440 here, and a
           filter told to track the note sat a third of a semitone sharp of the
           oscillator it was tracking. */
				const v = PURE_NODES[type]?.(
					{ get: (port, fallback) => cvIn(probeKey, port, fallback) },
					p,
					{
						pitch: 0,
						velocity: note.velocity,
						noteIndex: note.noteIndex,
						gate: heldSec,
						lanes: laneValues,
						tuning: note.tuning
					}
				);
				const src = ctx.createConstantSource();
				src.offset.value = Number.isFinite(v ?? NaN) ? (v as number) : 0;
				sources.push(src);
				return { in: null, out: src, mod };
			}

			case 'in': {
				/* ENTRY: the note, as an event.
        
           Blueprint's event node. In K.MAP this is the key that was struck;
           otherwise it is every key on the track. It makes no sound of its own
           and carries none in: ADV is a complete signal path and racks 1-7 are
           a different instrument, so what plays is what the canvas builds.
        
           What it publishes is the event's data -- when it happened, and what
           was played. */
				const silent = ctx.createGain();
				silent.gain.value = 0;
				/* One CV outlet per lane the track carries. A ConstantSourceNode holds
           the value this note read, so a cable from here into any knob is that
           knob following the curve -- which is the whole reason a lane and a
           socket are the same object seen twice.
        
           Constant per note rather than swept: a lane is sampled when the note
           starts. A continuous lane still moves between notes, because the next
           note reads it again. */
				const outs = new Map<string, AudioNode>();
				for (const [laneId, v] of Object.entries(laneValues)) {
					const src = ctx.createConstantSource();
					src.offset.value = v;
					sources.push(src);
					outs.set(`lane:${laneId}`, src);
				}

				/* What the event carries, as pins.
        
           Blueprint's event nodes hand you the data the event came with, and a
           key press comes with more than a moment in time: which key, how hard,
           and how long it is held. All three were locked inside the engine --
           velocity reached the amp gain and nothing else -- so a patch could not
           say "hit harder means brighter", which is what every struck instrument
           actually does. A drum skin under a harder strike is stiffer, and the
           strike itself is a sharper contact; both are timbre, not level.
        
           Constants rather than moving signals, sampled when the note starts,
           for the same reason the lane outlets are: this is what the event was,
           and the next event brings its own. */
				const pin = (v: number) => {
					const src = ctx.createConstantSource();
					src.offset.value = v;
					sources.push(src);
					return src;
				};
				/* Published as outlets, not in `mod`: `mod` is the *destination* side of
           a cable -- what a module offers as a modulation target -- and these
           are sources. Filed there they were never looked up, and every cable
           from VEL, GATE, NOTE or PITCH silently carried the zero out of
           `silent` instead.
        
           PITCH is in semitones from the tuning reference, matching what the
           resolver publishes for the same socket. It used to be `baseFreq`
           here and semitones there: one outlet, two different quantities,
           depending on whether it reached a knob or an audio param. */
				outs.set('pitch', pin(12 * Math.log2(Math.max(1e-6, baseFreq) / this.masterTuningFreq)));
				outs.set('vel', pin(note.velocity));
				outs.set('note', pin(note.noteIndex));
				outs.set('gate', pin(gateSec));

				return { in: null, out: silent, mod, outs };
			}

			case 'split': {
				/* Takes a stereo signal apart so the two sides can be processed
           separately: L out of one socket, R out of the other. A patch that
           filters the left and saturates the right is not reachable any other
           way, since every other module treats what it is given as one thing. */
				const input = ctx.createGain();
				const splitter = ctx.createChannelSplitter(2);
				input.connect(splitter);
				const l = ctx.createGain();
				const r = ctx.createGain();
				splitter.connect(l, 0);
				splitter.connect(r, 1);
				return { in: input, out: l, out2: r, mod };
			}

			case 'merge': {
				/* Puts two mono paths back into one stereo signal: whatever arrives at
           L lands left, whatever arrives at R lands right. The other half of
           SPLIT, and the only way a divided patch becomes one output again. */
				const l = ctx.createGain();
				const r = ctx.createGain();
				const merger = ctx.createChannelMerger(2);
				l.connect(merger, 0, 0);
				r.connect(merger, 0, 1);
				return { in: l, in2: r, out: merger, mod };
			}

			case 'out': {
				/* OUTPUT: where the patch leaves, and the end of every signal path in
           it. Everything reaching this is what you hear; anything not reaching
           it is silent, which is what lets a module sit on the canvas unwired
           without changing the sound.

           It takes a stereo pair and passes it to the master bus, and that is
           all it does. Level and pan were knobs here and are not any more: VCA
           and PAN are modules already, so having them again on the output was
           the same control in two places and a second thing to check when a
           patch came out quiet or lopsided. */
				const g = ctx.createGain();
				return { in: g, out: g, mod, isOutput: true };
			}

			case 'scope':
			case 'fft':
			case 'loud': {
				/* A probe: it looks at a signal and hands nothing back.
        
           Debugging a patch by ear alone means guessing which of six modules
           turned the signal to mud; a meter tapped off the point in question
           says where it happened. It has no outlet, because observing is not a
           stage in making a sound -- run a second cable to it from wherever you
           want to look, and it sits at the end of that branch.
        
           Placing one therefore cannot change the patch, which is the only way
           a debugging tool is worth having. */
				const g = ctx.createGain();
				const an = ctx.createAnalyser();
				/* A spectrum trades time for frequency resolution; a scope wants a
           window long enough to hold what SPAN asks for. 512 samples is 10.7 ms
           at 48 kHz, so a knob that went to 100 ms did nothing above a tenth of
           its travel -- 8192 covers 170 ms with room to spare, and the display
           reads back only as many samples as the span needs. */
				an.fftSize = type === 'fft' ? 2048 : 8192;
				an.smoothingTimeConstant = type === 'loud' ? 0.6 : 0.2;
				g.connect(an);
				/* Offline renders have no frames to draw on, and the map is read by the
           canvas while a live voice is sounding. Keyed by node so several
           probes in one patch stay apart. */
				if (!this.renderCtx) this.graphProbes.set(probeKey, an);
				// No `out`: the sink only gathers nodes marked isOutput, and a meter is
				// not one, so a dangling gain here is heard by nobody.
				return { in: g, out: g, mod };
			}

			case 'sum': {
				/* Adds its inputs. Web Audio sums anything sharing a destination, so
           this is a named place for it -- a patch reads better with the addition
           drawn than with three cables converging on one inlet. */
				const g = ctx.createGain();
				return { in: g, out: g, mod };
			}

			case 'diff': {
				/* Subtracts B from A: A arrives at IN, B at the inverting inlet. Cancels
           what two signals share and leaves the difference, which is how a
           phase-flipped copy becomes a filter you cannot build from a biquad. */
				const out = ctx.createGain();
				const a = ctx.createGain();
				a.gain.value = 1;
				a.connect(out);
				const b = ctx.createGain();
				b.gain.value = -1;
				b.connect(out);
				return { in: a, in2: b, out, mod };
			}

			case 'ring': {
				/* Ring modulation: one signal multiplies another. A gain node whose gain
           is driven by audio is exactly that, and the sum and difference tones it
           makes are inharmonic -- bells, gongs, and the metallic half of a drum
           kit. */
				const g = ctx.createGain();
				g.gain.value = 0;
				const depth = ctx.createGain();
				knobPct(depth.gain, 'ringDepth', 100);
				depth.connect(g.gain);
				return { in: g, in2: depth, out: g, mod };
			}

			case 'invert': {
				/* Flips the sign. On its own it is inaudible; against a copy of itself
           it is cancellation, which is what makes it a tool rather than a
           curiosity. */
				const g = ctx.createGain();
				g.gain.value = -1;
				return { in: g, out: g, mod };
			}

			default: {
				/* The acoustic modules are the same ones the linear chain builds.
        
           This list is a silent filter -- a param not named here never reaches
           the module, with no error and no clue. modeHz was added to the
           catalogue and to MODES and did nothing for exactly that reason: three
           separate fixes to the kick's brightness all measured identical
           because the value was being dropped here. Adding a param to a module
           means adding it here too. */
				const asParams: Record<string, number> = {};
				for (const k of [
					'decayTime',
					'damping',
					'stiffness',
					'strBlend',
					'tubeDecay',
					'tubeDamp',
					'tubeOdd',
					'tubeMix',
					'mode1',
					'mode2',
					'mode3',
					'modeQ',
					'modeMix',
					'modeHz',
					'bodySize',
					'bodyDepth',
					'bodyMix',
					'driveAmt',
					'driveBias',
					'driveTone',
					'hardness',
					'exLength',
					'exTone',
					'exNoise'
				])
					asParams[k] = p(k, NaN);
				for (const k of Object.keys(asParams)) if (Number.isNaN(asParams[k])) delete asParams[k];
				/* PITCH decides what these are tuned to, like every other pitched
           module: wired, it follows the cable; unwired, it holds its HZ knob.
           Passing baseFreq straight through made a STRING track the keyboard
           whatever the canvas said. */
				const rootHz = cvIn(probeKey, 'pitch', NaN);
				const made = this.buildRackModule(
					ctx,
					type,
					asParams,
					Number.isFinite(rootHz) && rootHz > 0 ? rootHz : baseFreq,
					t,
					heldSec
				);
				if (!made) return null;
				for (const src of made.sources ?? []) sources.push(src);
				return { in: made.in, out: made.out, mod };
			}
		}
	}

	/**
	 * Build one rack module and hand back its input and output.
	 *
	 * These are the stages an acoustic instrument has and a subtractive synth
	 * does not: something excites a resonator, the resonator drives a body. The
	 * engine's fixed chain is why a drum fitted against real recordings
	 * plateaus -- a snare's crack is a 2 ms transient, a struck drum is
	 * saturated, and neither is reachable by tuning a filter -- and why a
	 * plucked string is out of reach entirely.
	 *
	 * Returns null for a module with nothing to build, so the caller skips it.
	 */
	private buildRackModule(
		ctx: BaseAudioContext,
		id: string,
		p: Record<string, number>,
		baseFreq: number,
		_t: number,
		/** How long the key is held. A blown instrument sounds for as long as it is
		 *  blown; a struck one does not care. */
		heldSec: number
	): { in: AudioNode; out: AudioNode; sources?: AudioScheduledSourceNode[] } | null {
		/* Values are assigned, not scheduled. setValueAtTime(v, t) leaves the param
       at its default until t, and a voice is built slightly ahead of when it
       sounds -- so for those milliseconds a feedback loop ran at the default
       gain of 1 with a delay of 0, which is an instantaneous unity loop. It
       screamed, and did so while the wanted values looked perfectly correct in
       every log. None of these are automated; they are fixed for the life of
       the voice. */
		const pct = (v: number | undefined, d: number) => (v ?? d) / 100;

		switch (id) {
			case 'string':
			case 'tube': {
				/* A struck or plucked string as a bank of decaying partials.
				 *
				 * The textbook way is Karplus-Strong -- a delay line one period long,
				 * fed back through a damping filter. It was built that way first and
				 * measured unusable: a DelayNode inside a feedback loop is stable only
				 * up to about g = 0.90 here, which buys 0.45s of ring, and by g = 0.95
				 * it runs away. There is no setting that gives a guitar.
				 *
				 * Additive has no such limit because there is no loop. Each partial is
				 * a sine with its own exponential decay, and the higher ones die first
				 * -- which is what damping physically is, and what makes a plucked note
				 * grow warmer as it fades. Stiffness stretches the partials sharp of
				 * the harmonic series, the thing that makes a piano sound like a piano
				 * rather than an organ.
				 *
				 * A tube is the same bank with only odd partials: a cylinder closed at
				 * one end has no even harmonics, which is a clarinet.
				 */
				const isTube = id === 'tube';
				const decay = Math.max(0.05, (isTube ? p.tubeDecay : p.decayTime) ?? (isTube ? 1.2 : 2));
				const damping = pct(isTube ? p.tubeDamp : p.damping, isTube ? 40 : 30);
				const stiff = isTube ? 0 : pct(p.stiffness, 10);
				const mix = pct(isTube ? p.tubeMix : p.strBlend, 100);
				/* A switch, not a percentage: it chose between two outcomes and was
           drawn as a dial with 101 positions.
        
           ADV declares it as the two-position selector it always was, and the
           shipped presets were migrated to match. The threshold rather than an
           equality test is deliberate: a patch file saved before that migration
           holds 100, and reading it as "not odd" would turn every clarinet in
           it into an open pipe. 1 and 100 both mean odd; 0 does not. */
				const oddOnly = isTube && (p.tubeOdd ?? 1) >= 0.5;

				const input = ctx.createGain();
				const output = ctx.createGain();
				const dry = ctx.createGain();
				dry.gain.value = 1 - mix;
				input.connect(dry);
				dry.connect(output);

				const wet = ctx.createGain();
				// Partials add, so scale by the count to keep the voice in range.
				/* 0.3 was headroom for summing many partials, but the partials already
           scale by 1/n, and this was a fixed 10.5 dB cut nobody could undo.
           Measured through PAN FLUTE: 0.316 into the tube, 0.058 out, which is
           most of why the breath patches sat 19 dB under the struck ones.
        
           MIX is a real knob now. It was read here all along and declared
           nowhere, so in ADV it was always undefined, always 1, and the dry
           gain was always 0 -- which made the AUDIO IN socket decorative: a
           patch heard the same partials whether a strike was wired in or not. */
				wet.gain.value = mix * 0.85;
				wet.connect(output);

				const sources: AudioScheduledSourceNode[] = [];
				for (let n = 1; n <= 16; n++) {
					if (oddOnly && n % 2 === 0) continue;
					// Inharmonicity: partials of a stiff string run sharp, more so higher up.
					const fn = baseFreq * n * Math.sqrt(1 + stiff * 0.004 * n * n);
					if (fn > 18000) break;
					const osc = ctx.createOscillator();
					osc.type = 'sine';
					osc.frequency.value = fn;
					const g = ctx.createGain();
					/* Partial levels and decays.
					 *
					 * 1/n^2 alone gives a hollow, guitar-like tone whatever the decay is
					 * set to: a piano has far more upper partial energy than that, and
					 * its low ones ring for many seconds while the top of the spectrum is
					 * gone in under one. Stiffness stands in for how piano-like the
					 * string is, so it also controls how much of that spread there is --
					 * a stiff string keeps its upper partials and spreads its decays,
					 * which is the difference between a struck piano wire and a plucked
					 * nylon one. */
					const amp = 1 / Math.pow(n, 1.9 - stiff * 0.7);
					const dn = decay / Math.pow(n, 0.55 + damping * 1.4 + stiff * 0.5);
					if (isTube) {
						/* A tube is blown, not struck: the excitation continues, so the
               partials hold for as long as the key does and only then fall
               away. Letting them decay from the attack the way a string's do
               put a 14 dB bump on the first tenth of a second -- audible as a
               chiff on every note, and nothing like a clarinet. */
						const att = Math.max(0.01, 0.04 / (1 + (n - 1) * 0.4));
						g.gain.setValueAtTime(0, _t);
						g.gain.linearRampToValueAtTime(amp, _t + att);
						g.gain.setValueAtTime(amp, _t + Math.max(att, heldSec));
						const fall = Math.min(dn, 0.35);
						g.gain.exponentialRampToValueAtTime(0.00001, _t + Math.max(att, heldSec) + fall);
						// To zero, for the same reason as the string's.
						g.gain.linearRampToValueAtTime(0, _t + Math.max(att, heldSec) + fall + 0.06);
					} else {
						g.gain.setValueAtTime(0, _t);
						g.gain.linearRampToValueAtTime(amp, _t + 0.003);
						/* Exponential to nearly nothing, then linearly to actual zero: an
               exponential ramp cannot reach 0, so ending on one leaves a step
               from -100 dB to silence when the node stops. Small, but it is a
               click, and on a long piano note it is the last thing heard. */
						g.gain.exponentialRampToValueAtTime(0.00001, _t + 0.003 + dn);
						g.gain.linearRampToValueAtTime(0, _t + 0.003 + dn + 0.12);
					}
					osc.connect(g);
					g.connect(wet);
					sources.push(osc);
				}

				/* The partials are the sound, so the excitation only gates them: a key
           that is never struck should not ring. Feeding `input` through a gain
           of zero keeps the module a normal link in the chain. */
				const gate = ctx.createGain();
				gate.gain.value = 0;
				input.connect(gate);
				gate.connect(output);

				return { in: input, out: output, sources };
			}

			case 'modes': {
				/* Three tuned resonances at once. A drum head or a bell rings at several
           frequencies that are not a harmonic series, which is exactly what one
           filter cannot produce and why the kit's toms and cymbals stayed
           synthetic.

           Struck, not filtered. Three bandpasses fed a strike measured 0.008
           peak against 0.137 for the strike alone -- a resonant filter needs
           sustained input to ring up, and a 10 ms burst never gets it there.
           A struck mode is a sine that starts loud and decays, so that is what
           this builds, the same way STRING does. The filters stay in parallel
           with them: fed something continuous, they still colour it, which is
           what makes the module useful on a pad as well as on a drum. */
				const input = ctx.createGain();
				const output = ctx.createGain();
				const mix = pct(p.modeMix, 100);
				const dry = ctx.createGain();
				/* Squared, so the dry strike falls away faster than the body rises as
           MIX is turned up: at 68 that is 0.10 of raw strike under a body at
           0.68, which reads as a beater on a drum rather than as two sounds. */
				dry.gain.value = (1 - mix) * (1 - mix);
				input.connect(dry);
				dry.connect(output);

				const ratios = [p.mode1 ?? 1, p.mode2 ?? 2.4, p.mode3 ?? 4.6];
				const q = Math.max(1, p.modeQ ?? 14);
				/* Q is the ring: a mode at Q 40 rings for about a second, one at Q 2
           for a few tens of milliseconds. Roughly q/40 seconds, scaled down as
           the mode climbs because higher partials of a struck body die first. */
				const modeSources: AudioScheduledSourceNode[] = [];
				const struck = ctx.createGain();
				/* Not halved. The dry strike passes at (1 - mix) squared, so halving
           the body on top of that let the broadband strike decide the timbre. */
				struck.gain.value = mix;
				struck.connect(output);

				/* What the ratios are relative to. 0 means the key, which is the tuned
           case; anything else pins the body to an absolute pitch, which is what
           an untuned drum is. */
				const root = (p.modeHz ?? 0) > 0 ? (p.modeHz as number) : baseFreq;
				ratios.forEach((r, i) => {
					const f = Math.min(18000, Math.max(20, root * r));

					// The struck half: a decaying sine per mode.
					const osc = ctx.createOscillator();
					osc.type = 'sine';
					osc.frequency.value = f;
					const g = ctx.createGain();
					/* Q is the ring time. Measured against the -40 dB point rather than
             the nominal time constant, which is what anyone actually hears:
             q/40 gave 0.25 s at Q 30 where the number promised 0.75, so a
             crash asked for 1.3 s came out a quarter of that. q/12 puts the
             audible tail where the knob says it is. */
					const decay = Math.max(0.02, q / 12 / Math.pow(r, 0.6));
					const amp = 1 / (i + 1);
					/* The attack is a fraction of the partial's own period, not a fixed
             2 ms. On a 55 Hz kick, 2 ms is a tenth of a cycle -- a step, which
             is broadband, and it put a 1414 Hz centroid on a drum whose three
             partials sit at 55, 94 and 143 Hz. A low mode needs a slower rise
             for the same reason a subwoofer does; a cymbal's partials are short
             enough that the cap never binds. */
					const rise = Math.min(0.008, Math.max(0.0004, 1.2 / f));
					g.gain.setValueAtTime(0, _t);
					g.gain.linearRampToValueAtTime(amp, _t + rise);
					g.gain.exponentialRampToValueAtTime(0.00001, _t + rise + decay);
					// To true zero: an exponential cannot reach it, and the step is a click.
					g.gain.linearRampToValueAtTime(0, _t + rise + decay + 0.03);
					osc.connect(g);
					g.connect(struck);
					modeSources.push(osc);

					// The filtered half, for input that keeps arriving.
					const bp = ctx.createBiquadFilter();
					bp.type = 'bandpass';
					bp.frequency.value = f;
					bp.Q.value = q;
					/* Quiet against the struck sines. sqrt(q) was compensating for how
             little a narrow bandpass passes of a sustained tone, but a strike
             is 8 ms of broadband noise: at q 7 that came to 0.88 per band, so
             three filters handed almost the whole strike straight to the output
             and MODES alone measured a 1144 Hz centroid on a drum whose
             partials sit at 55, 94 and 143 Hz.
          
             The struck half IS the drum. This half exists so the module still
             colours something continuous fed into it -- a pad, a held note --
             and at that job it does not need to be loud. */
					const fg = ctx.createGain();
					fg.gain.value = (mix / ratios.length) * Math.min(1.2, Math.sqrt(q) * 0.25);
					input.connect(bp);
					bp.connect(fg);
					fg.connect(output);
				});

				/* The strike gates the modes rather than passing through them: a key
           that is never struck should not ring. Same shape STRING uses. */
				return { in: input, out: output, sources: modeSources };
			}

			case 'body': {
				/* The instrument's body: a soundboard, a box, a shell. Two fixed
           formant peaks whose frequency falls as the body gets bigger, which
           is what turns a bare string into a guitar rather than a sine. */
				const size = pct(p.bodySize, 50);
				const input = ctx.createGain();
				const output = ctx.createGain();
				const mix = pct(p.bodyMix, 60);
				const dry = ctx.createGain();
				dry.gain.value = 1 - mix;
				input.connect(dry);
				dry.connect(output);

				// A big body resonates low: 400Hz down to 90Hz across the range.
				const f1 = 400 - size * 310;
				const peaks: [number, number][] = [
					[f1, 1.4],
					[f1 * 2.7, 2.2]
				];
				const depth = pct(p.bodyDepth, 45);
				for (const [f, q] of peaks) {
					const bp = ctx.createBiquadFilter();
					bp.type = 'peaking';
					bp.frequency.value = Math.max(40, f);
					bp.Q.value = q;
					bp.gain.value = depth * 14;
					input.connect(bp);
					const g = ctx.createGain();
					g.gain.value = mix / peaks.length;
					bp.connect(g);
					g.connect(output);
				}
				return { in: input, out: output };
			}

			case 'drive': {
				/* Saturation. A struck or bowed body produces harmonics a clean
           oscillator cannot; bias makes them even-order, which reads as warmth
           rather than fuzz. */
				const shaper = ctx.createWaveShaper();
				const amt = pct(p.driveAmt, 25);
				const bias = pct(p.driveBias, 30);
				const n = 1024;
				const curve = new Float32Array(n);
				const k = 1 + amt * 40;
				for (let i = 0; i < n; i++) {
					const x = (i / (n - 1)) * 2 - 1;
					const b = x + bias * 0.35;
					curve[i] = Math.tanh(b * k) / Math.tanh(k) - Math.tanh(bias * 0.35 * k) / Math.tanh(k);
				}
				shaper.curve = curve;
				shaper.oversample = '2x';

				// Saturation makes harmonics all the way up; a shelf keeps them from
				// reading as aliasing hiss.
				const tone = ctx.createBiquadFilter();
				tone.type = 'lowpass';
				tone.frequency.value = p.driveTone ?? 8000;
				shaper.connect(tone);

				/* Saturation raises the level as well as the harmonics -- measured at
           +4 dB into clipping at 60% -- so give the gain back. */
				const trim = ctx.createGain();
				trim.gain.value = 1 / (1 + amt * 1.6);
				tone.connect(trim);
				return { in: shaper, out: trim };
			}

			case 'resonators': {
				const input = ctx.createGain();
				const output = ctx.createGain();
				const mix = pct(p.resMix, 50);
				const dry = ctx.createGain();
				dry.gain.value = 1 - mix;
				input.connect(dry);
				dry.connect(output);
				const bp = ctx.createBiquadFilter();
				bp.type = 'bandpass';
				bp.frequency.value = p.resFreq ?? 700;
				bp.Q.value = p.resQ ?? 12;
				const wet = ctx.createGain();
				wet.gain.value = mix;
				input.connect(bp);
				bp.connect(wet);
				wet.connect(output);
				return { in: input, out: output };
			}

			default:
				return null;
		}
	}

	// Push a track's stored EQ state onto its live filter chain.
	private applyTrackEq(trackId: number) {
		const bus = this.trackBuses[trackId];
		const trk = this.tracks[trackId];
		if (!bus || !trk) return;
		bus.filters.forEach((filter, i) => {
			filter.gain.setValueAtTime(trk.eqOn ? (trk.eqGains?.[i] ?? 0) : 0, 0);
		});
	}

	private applyAllTrackEq() {
		this.trackBuses.forEach((_, i) => this.applyTrackEq(i));
	}

	private makeDistortionCurve(amount: number): Float32Array {
		const k = typeof amount === 'number' ? amount * 50 : 0;
		const n_samples = 44100;
		const curve = new Float32Array(n_samples);
		const deg = Math.PI / 180;
		for (let i = 0; i < n_samples; ++i) {
			const x = (i * 2) / n_samples - 1;
			if (k === 0) {
				curve[i] = x;
			} else {
				curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
			}
		}
		return curve;
	}

	public setMeter(sig: TimeSignature) {
		this.meter = sig;
	}

	public getMeter(): TimeSignature {
		return this.meter;
	}

	public setEditNoteDiv(div: NoteDurationDiv) {
		this.editNoteDiv = div;
	}

	public getEditNoteDiv(): NoteDurationDiv {
		return this.editNoteDiv;
	}

	public getEqlCompensation(): boolean {
		return this.eqlCompensation;
	}

	public setEqlCompensation(enabled: boolean) {
		this.eqlCompensation = enabled;
	}

	public setGranularity(g: NoteDurationDiv) {
		this.editNoteDiv = g;
	}

	public getGranularity(): NoteDurationDiv {
		return this.editNoteDiv;
	}

	public getTracks(): TrackData[] {
		return this.tracks;
	}

	public loadBuiltInSong(songName: BuiltinSongId = 'OVERWORLD_1') {
		this.stopAll();
		if (songName === 'OVERWORLD_1') {
			this.tracks = scaleTracksToFineGrid(JSON.parse(JSON.stringify(OVERWORLD_FULL_TRACKS)));
			this.totalSteps = 10080;
			this.bpm = 150;
			this.meter = '4/4';
		} else if (songName === 'OVERWORLD_2') {
			this.tracks = scaleTracksToFineGrid(JSON.parse(JSON.stringify(OVERWORLD_TRACKS)));
			this.totalSteps = 2016;
			this.bpm = 90;
			this.meter = '4/4';
		} else if (songName === 'UNDERWATER') {
			this.tracks = scaleTracksToFineGrid(JSON.parse(JSON.stringify(UNDERWATER_TRACKS)));
			this.totalSteps = 2304;
			this.bpm = 100;
			this.meter = '6/8';
		} else if (songName === 'SPAIN') {
			// spain.ts is authored natively on the 1/24-beat grid, in half time (see the file).
			this.tracks = JSON.parse(JSON.stringify(SPAIN_TRACKS));
			this.totalSteps = SPAIN_STEPS;
			this.bpm = 115;
			this.meter = '4/4';
		} else if (songName === 'MARIO_1') {
			// mario1.ts is authored natively on the 1/24-beat grid (swing preserved).
			this.tracks = JSON.parse(JSON.stringify(MARIO1_TRACKS));
			this.totalSteps = 3840;
			this.bpm = 105;
			this.meter = '4/4';
		} else if (songName === 'TAKE_FIVE') {
			// take-five.ts is authored natively on the 1/24-beat grid, at full resolution (see the file).
			this.tracks = JSON.parse(JSON.stringify(TAKE_FIVE_TRACKS));
			this.totalSteps = TAKE_FIVE_STEPS;
			this.bpm = 180;
			this.meter = '5/4';
		}
		this.tracks = padTracks(this.tracks);
		this.currentStep = 0;
		this.scheduledStepQueue = [];
		this.applyAllTrackEq();
		const ctx = soundEngine.init();
		if (ctx) {
			this.nextStepTime = ctx.currentTime + 0.05;
		}
		this.onStepListeners.forEach((fn) => fn(0));
	}

	public resetToBlank(steps: number = 192) {
		this.stopAll();
		this.tracks = INITIAL_TRACKS.map((t) => ({
			...JSON.parse(JSON.stringify(t)),
			grid: Array.from({ length: MAX_GRID_STEPS }, () => []),
			accents: Array.from({ length: MAX_GRID_STEPS }, () => 0)
		}));
		this.totalSteps = steps;
		this.bpm = 120;
		this.meter = '4/4';
		this.currentStep = 0;
		this.scheduledStepQueue = [];
		this.applyAllTrackEq();
		const ctx = soundEngine.init();
		if (ctx) {
			this.nextStepTime = ctx.currentTime + 0.05;
		}
		this.onStepListeners.forEach((fn) => fn(0));
	}

	public getTrack(trackId: number): TrackData | undefined {
		return this.tracks[trackId];
	}

	public updateTrack(trackId: number, partial: Partial<TrackData>) {
		if (this.tracks[trackId]) {
			this.tracks[trackId] = { ...this.tracks[trackId], ...partial };
			if ('eqOn' in partial || 'eqGains' in partial) this.applyTrackEq(trackId);
		}
	}

	// Toggle note index in the step array (Polyphonic up to 8 notes)
	public toggleTrackCell(trackId: number, stepIndex: number, noteIndex: number) {
		const trk = this.tracks[trackId];
		if (!trk) return;

		if (!trk.grid[stepIndex]) trk.grid[stepIndex] = [];
		const arr = trk.grid[stepIndex];
		const existsIdx = arr.indexOf(noteIndex);

		if (existsIdx >= 0) {
			arr.splice(existsIdx, 1);
		} else {
			if (arr.length < 8) {
				arr.push(noteIndex);
				arr.sort((a, b) => a - b);
			}
		}
	}

	public clearTrackStep(trackId: number, stepIndex: number) {
		if (this.tracks[trackId]) {
			this.tracks[trackId].grid[stepIndex] = [];
		}
	}

	public setTrackStepNotes(trackId: number, stepIndex: number, notes: number[]) {
		if (this.tracks[trackId]) {
			this.tracks[trackId].grid[stepIndex] = [...notes];
		}
	}

	/**
	 * How hard a note at this step is struck, 1..127.
	 *
	 * The velocity lane if the track has one, and otherwise the accent row the
	 * lane replaced -- the bundled songs were written against that row, and
	 * rewriting several thousand lines of song data to say the same thing in a
	 * new place would risk them for nothing. Accent was 0..+4 dB; mapped onto
	 * the lane's range so a written accent still sounds like an accent.
	 */
	public trackVelocityAt(track: TrackData, step: number): number {
		const lanes = track.noteLanes;
		const vel = Array.isArray(lanes) ? lanes.find((l) => l.id === VELOCITY_LANE_ID) : undefined;
		/* Drawn at this step, so the lane wins. `!== undefined` was true for the
       `null` a saved hole comes back as, which took this branch for steps
       nobody drew and shadowed the accent row the bundled songs are written
       with. */
		if (vel && Number.isFinite(vel.points[step])) return laneToVelocity(laneAt(vel, step));

		const acc = Number(track.accents?.[step] ?? 0);
		if (acc > 0) return Math.min(127, Math.round(100 + acc * 6.75));
		return vel ? laneToVelocity(laneAt(vel, step)) : 100;
	}

	public setTrackAccent(trackId: number, stepIndex: number, level: number) {
		if (this.tracks[trackId]?.accents) {
			this.tracks[trackId].accents[stepIndex] = level;
		}
	}

	public cycleTrackAccent(trackId: number, stepIndex: number): number {
		if (this.tracks[trackId] && this.tracks[trackId].accents) {
			const current = Number(this.tracks[trackId].accents[stepIndex] || 0);
			let next = 0;
			if (current === 0)
				next = 1; // +1dB
			else if (current === 1)
				next = 2; // +2dB
			else if (current === 2)
				next = 3; // +3dB
			else if (current === 3)
				next = 4; // +4dB
			else next = 0; // OFF (0dB)

			this.tracks[trackId].accents[stepIndex] = next;
			return next;
		}
		return 0;
	}

	public toggleTrackAccent(trackId: number, stepIndex: number) {
		this.cycleTrackAccent(trackId, stepIndex);
	}

	public toggleTrackMute(trackId: number) {
		if (this.tracks[trackId]) {
			this.tracks[trackId].muted = !this.tracks[trackId].muted;
		}
	}

	/* Additive, like a mixer: solo is "only this set", and hearing kick and
     snare together is the common case. Playback already treated it that way;
     only this entry point used to clear the others. */
	public toggleTrackSolo(trackId: number) {
		if (this.tracks[trackId]) this.tracks[trackId].solo = !this.tracks[trackId].solo;
	}

	public updateKeyTimbre(trackId: number, noteIndex: number, partial: Partial<TrackData>) {
		const trk = this.tracks[trackId];
		if (!trk) return;
		const table = { ...(trk.keyTimbres ?? {}) };
		const picked: Record<string, unknown> = { ...(table[noteIndex] ?? {}) };
		for (const [k, v] of Object.entries(partial)) if (isKeyTimbreKey(k)) picked[k] = v;
		table[noteIndex] = picked as Partial<TrackData>;
		this.tracks[trackId] = { ...trk, keyTimbres: table };
	}

	public clearKeyTimbre(trackId: number, noteIndex: number) {
		const trk = this.tracks[trackId];
		if (!trk?.keyTimbres?.[noteIndex]) return;
		const table = { ...trk.keyTimbres };
		delete table[noteIndex];
		this.tracks[trackId] = { ...trk, keyTimbres: table };
	}

	public getBpm(): number {
		return this.bpm;
	}

	public setBpm(newBpm: number) {
		this.bpm = Math.max(40, Math.min(260, newBpm));
		if (!this.isSequencerPlaying) return;
		/* Notes already sounding keep the tempo they were booked at -- they are in
       flight and cannot be recalled -- but the lookahead that has not been
       heard yet should not be.
    
       `restartSequencerTimer` alone accomplished nothing here: the interval
       period is tempo-independent, so the queue kept its old spacing and the
       playhead, which is driven from that queue, advanced at the previous rate
       for up to a whole window after the change. Rebasing from the last step
       actually heard puts the grid back under the new tempo at once. */
		const ctx = this.audioCtx();
		if (ctx) {
			const stepDuration = 60 / this.bpm / STEPS_PER_BEAT;
			/* Rebase from the last step the clock actually reached.
      
         Reading it back off `scheduledStepQueue` could not work: `checkUIQueue`
         shifts every elapsed entry out as its time passes, so while playing the
         queue holds only *future* steps by construction. Filtering it to
         `time <= currentTime` therefore always yielded an empty array, the
         rebase below never ran, and the one thing the filter did accomplish was
         to throw away the pending lookahead -- which left the playhead frozen
         for up to a whole window on every tempo change. `lastAudibleStep` is
         the value `checkUIQueue` maintains for exactly this question, and is
         what STOP already resumes from. */
			const heardAt = this.scheduledStepQueue.length
				? this.scheduledStepQueue[0].time
				: ctx.currentTime;
			this.scheduledStepQueue = [];
			this.currentStep = (this.lastAudibleStep + 1) % this.totalSteps;
			this.nextStepTime = Math.max(
				ctx.currentTime,
				Math.min(heardAt, ctx.currentTime + stepDuration)
			);
		}
		this.restartSequencerTimer();
	}

	public getTotalSteps(): number {
		return this.totalSteps;
	}

	/**
	 * The meter, which the scheduler does not read.
	 *
	 * The grid is a flat 1/24 beat with no notion of a bar: `METER_SPECS` drives
	 * paging and the lines the roll draws, and nothing else. That is deliberate
	 * -- an absolute grid means a pattern is a length of time rather than a count
	 * of bars -- but it has one consequence worth stating: `totalSteps` is not
	 * constrained to whole bars, so in 7/8 a default 96-step pattern is 1.14 bars
	 * and the loop point lands mid-bar. Picking a multiple of `stepsPerBar` is
	 * what makes a loop line up, and nothing enforces it.
	 */
	public setTotalSteps(steps: number) {
		this.totalSteps = Math.max(8, Math.min(MAX_GRID_STEPS, steps));
		/* Both step cursors move together, or they disagree about where the
       playhead is. Only `currentStep` was clamped, so shrinking a pattern left
       `lastAudibleStep` pointing past its end. */
		if (this.currentStep >= this.totalSteps) this.currentStep = 0;
		if (this.lastAudibleStep >= this.totalSteps) this.lastAudibleStep = 0;
	}

	public getCurrentStep(): number {
		return this.currentStep;
	}

	public setDelayMix(mix: number) {
		this.delayMix = mix;
		if (this.delayWetGain) {
			this.delayWetGain.gain.setValueAtTime(mix, 0);
		}
	}

	public setReverbMix(mix: number) {
		this.reverbMix = mix;
		if (this.reverbWetGain) {
			this.reverbWetGain.gain.setValueAtTime(mix, 0);
		}
	}

	public getDelayMix(): number {
		return this.delayMix;
	}

	public getReverbMix(): number {
		return this.reverbMix;
	}

	public setDelayTime(t: number) {
		this.delayTime = Math.max(0.01, Math.min(2.0, t));
		if (this.delayNode) {
			this.delayNode.delayTime.setValueAtTime(this.delayTime, 0);
		}
	}

	public getDelayTime(): number {
		return this.delayTime;
	}

	public setDelayFeedback(fb: number) {
		this.delayFeedback = Math.max(0.0, Math.min(0.9, fb));
		if (this.delayFeedbackGain) {
			this.delayFeedbackGain.gain.setValueAtTime(this.delayFeedback, 0);
		}
	}

	public getDelayFeedback(): number {
		return this.delayFeedback;
	}

	public setDrive(drive: number) {
		this.driveAmount = Math.max(0.0, Math.min(1.0, drive));
		if (this.waveShaper) {
			(this.waveShaper as any).curve = this.makeDistortionCurve(this.driveAmount);
		}
		this.applyDriveRouting();
	}

	/** Drive on: through the shaper. Drive off: around it, so nothing clips before the master fader. */
	private applyDriveRouting() {
		if (!this.shaperIn || !this.shaperBypass) return;
		const on = this.driveAmount > 0.001;
		const t = this.shaperIn.context.currentTime;
		this.shaperIn.gain.setTargetAtTime(on ? 1 : 0, t, 0.01);
		this.shaperBypass.gain.setTargetAtTime(on ? 0 : 1, t, 0.01);
	}

	public getDrive(): number {
		return this.driveAmount;
	}

	// DSP Engine & Buffer Advanced Configuration Settings
	public getNoiseBufferDuration(): number {
		return this.noiseBufferDuration;
	}

	public setNoiseBufferDuration(sec: number) {
		this.noiseBufferDuration = Math.max(0.5, Math.min(5.0, sec));
		this.scheduleNoiseRebuild();
	}

	public getNoiseColor(): 'white' | 'pink' | 'brown' {
		return this.noiseColor;
	}

	public setNoiseColor(color: 'white' | 'pink' | 'brown') {
		this.noiseColor = color;
		this.scheduleNoiseRebuild();
	}

	public getReverbDuration(): number {
		return this.reverbDuration;
	}

	public setReverbDuration(sec: number) {
		this.reverbDuration = Math.max(0.2, Math.min(6.0, sec));
		this.scheduleReverbRebuild();
	}

	public getReverbDecayRate(): number {
		return this.reverbDecayRate;
	}

	public setReverbDecayRate(decay: number) {
		this.reverbDecayRate = Math.max(0.1, Math.min(2.0, decay));
		this.scheduleReverbRebuild();
	}

	public getMasterTuningFreq(): number {
		return this.masterTuningFreq;
	}

	public setMasterTuningFreq(freq: number) {
		this.masterTuningFreq = Math.max(430, Math.min(450, freq));
	}

	public getMaxPolyphony(): number {
		return this.maxPolyphony;
	}

	public setMaxPolyphony(poly: number) {
		this.maxPolyphony = Math.max(1, Math.min(16, poly));
	}

	public getMidiSelectedDeviceId(): string {
		return this.midiSelectedDeviceId;
	}

	public setMidiSelectedDeviceId(deviceId: string) {
		this.midiSelectedDeviceId = deviceId;
	}

	/* Inputs already given a default, so replugging a cable cannot overwrite a
     routing the player chose. Separate from midiDeviceTracks because "follow
     the active track" is stored as the absence of an entry there. */
	private midiDevicesSeen = new Set<string>();

	/**
	 * Give inputs their first routing, in the order the browser lists them: the
	 * first plays (follows the active track), every other one starts switched
	 * off. A keyboard the OS advertises twice would otherwise voice each key
	 * press on both entries at once. Devices already seen keep their routing.
	 */
	public defaultUnroutedMidiDevices(deviceIds: string[]) {
		for (const [i, id] of deviceIds.entries()) {
			if (this.midiDevicesSeen.has(id)) continue;
			this.midiDevicesSeen.add(id);
			if (i > 0) this.midiDeviceTracks[id] = [];
		}
	}

	/** The whole device -> tracks table, for the settings panel to render. */
	public getMidiDeviceTracks(): Record<string, number[]> {
		const out: Record<string, number[]> = {};
		for (const [id, tracks] of Object.entries(this.midiDeviceTracks)) out[id] = [...tracks];
		return out;
	}

	/**
	 * Every input whose routing has been decided, for storage. "Follow the active
	 * track" is the absence of a row in the table, so the table alone cannot say
	 * whether a device was set that way on purpose or simply never seen -- and
	 * without that, reloading would default a deliberate ACTIVE back to off.
	 */
	public getMidiDevicesSeen(): string[] {
		return [...this.midiDevicesSeen];
	}

	public markMidiDevicesSeen(deviceIds: string[]) {
		for (const id of deviceIds) this.midiDevicesSeen.add(id);
	}

	/** Route one input to a set of tracks, or pass null to let it follow the active track. */
	public setMidiDeviceTracks(deviceId: string, trackIds: number[] | null) {
		// Deciding a device's routing -- including restoring one from storage --
		// is what "seen" means, so the defaulting pass leaves it alone afterwards.
		this.midiDevicesSeen.add(deviceId);
		if (trackIds === null) delete this.midiDeviceTracks[deviceId];
		else this.midiDeviceTracks[deviceId] = [...new Set(trackIds)].sort((a, b) => a - b);
	}

	/**
	 * Add or remove one track from a device's set. Coming from "follow the active
	 * track" the pick replaces rather than extends: following the selection and
	 * naming a fixed set are alternatives, so the first number chosen is the
	 * whole answer, not the active track plus one.
	 */
	public toggleMidiDeviceTrack(deviceId: string, trackId: number) {
		this.midiDevicesSeen.add(deviceId);
		const current = this.midiDeviceTracks[deviceId];
		if (current === undefined) {
			this.midiDeviceTracks[deviceId] = [trackId];
			return;
		}
		const next = current.includes(trackId)
			? current.filter((t) => t !== trackId)
			: [...current, trackId];
		this.midiDeviceTracks[deviceId] = next.sort((a, b) => a - b);
	}

	/**
	 * The tracks a device plays: its own binding, else the active track. An empty
	 * list means the input is switched off and the caller drops it -- the
	 * duplicate input of a keyboard the OS lists twice is silenced this way.
	 */
	public getMidiTracksFor(deviceId: string | undefined, activeTrackId: number): number[] {
		if (deviceId !== undefined && deviceId in this.midiDeviceTracks)
			return this.midiDeviceTracks[deviceId];
		return [activeTrackId];
	}

	public getLatencyHintMode(): 'interactive' | 'balanced' | 'playback' {
		return this.latencyHintMode;
	}

	public setLatencyHintMode(mode: 'interactive' | 'balanced' | 'playback') {
		this.latencyHintMode = mode;
	}

	public isMasterLimiterEnabled(): boolean {
		return this.masterLimiterEnabled;
	}

	public setMasterLimiterEnabled(enabled: boolean) {
		this.masterLimiterEnabled = enabled;
		this.applyMasterLimiter();
	}

	/**
	 * Put the limiter's own settings where the toggle says they should be.
	 *
	 * The flag had a getter and a setter and no reader: `initMasterFX` built the
	 * compressor and wired it in unconditionally, so the AUDIO HW tab could read
	 * "LIMITER: BYPASSED" while it went on gain-reducing the master. Bypassing by
	 * ratio rather than by rerouting keeps the node in circuit, so nothing has to
	 * be disconnected and reconnected under a running graph -- at 1:1 with no
	 * knee a compressor is a wire.
	 */
	private applyMasterLimiter() {
		const lim = this.masterLimiter;
		if (!lim) return;
		const ctx = this.masterFXCtx;
		const now = ctx ? ctx.currentTime : 0;
		lim.threshold.setValueAtTime(this.masterLimiterEnabled ? -1 : 0, now);
		lim.ratio.setValueAtTime(this.masterLimiterEnabled ? 20 : 1, now);
	}

	public getVoiceStealingMode(): 'oldest' | 'quietest' | 'lowest' {
		return this.voiceStealingMode;
	}

	public setVoiceStealingMode(mode: 'oldest' | 'quietest' | 'lowest') {
		this.voiceStealingMode = mode;
	}

	/* -------------------------------------------------------------------------- */
	/*                      COMPLETE MODULAR SIGNAL FLOW DSP                      */
	/* -------------------------------------------------------------------------- */

	/* Web Audio has no pulse oscillator, only a 50% square. PW is a PeriodicWave
     built from the pulse's Fourier series -- a_n = (2/nπ) sin(nπd) for duty d --
     cached per context and duty so a hat pattern does not rebuild it every
     step. 64 harmonics: at C4 that reaches 16 kHz, above it the wave aliases
     less than the built-in square already does. */
	/* ---- drawn and tabled waves ---- */
	private customWaves = new Map<string, CustomWave>();
	private waveVersion = new Map<string, number>();
	private tableWaves: WeakMap<BaseAudioContext, Map<string, PeriodicWave>> = new WeakMap();

	public registerCustomWave(w: CustomWave) {
		this.customWaves.set(w.id, { ...w, samples: [...w.samples] });
		this.waveVersion.set(w.id, (this.waveVersion.get(w.id) ?? 0) + 1);
	}
	public unregisterCustomWave(id: string) {
		this.customWaves.delete(id);
	}
	public getCustomWave(id: string): CustomWave | undefined {
		return this.customWaves.get(id);
	}
	public listCustomWaves(): CustomWave[] {
		return Array.from(this.customWaves.values());
	}

	/** A PeriodicWave from one cycle of samples: 64 harmonics by direct DFT, cached per context and table version. */
	private periodicFromSamples(
		ctx: BaseAudioContext,
		key: string,
		samples: ArrayLike<number>
	): PeriodicWave {
		let perCtx = this.tableWaves.get(ctx);
		if (!perCtx) {
			perCtx = new Map();
			this.tableWaves.set(ctx, perCtx);
		}
		let wave = perCtx.get(key);
		if (!wave) {
			const N = samples.length;
			const H = 64;
			const real = new Float32Array(H + 1);
			const imag = new Float32Array(H + 1);
			for (let n = 1; n <= H; n++) {
				let re = 0,
					im = 0;
				for (let i = 0; i < N; i++) {
					const ph = (2 * Math.PI * n * i) / N;
					re += samples[i] * Math.cos(ph);
					im += samples[i] * Math.sin(ph);
				}
				real[n] = (2 / N) * re;
				imag[n] = (2 / N) * im;
			}
			wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
			perCtx.set(key, wave);
		}
		return wave;
	}

	/* Drawbars 8', 4', 2 2/3', 2', 1 3/5', 1': harmonics 1, 2, 3, 4, 5, 8, each
     0..8 like the real thing. One table per drawbar setting, cached. */
	private organTables = new Map<string, Float32Array>();
	private organTable(p: WaveParams | undefined): { key: string; table: Float32Array } {
		const bars = (['org1', 'org2', 'org3', 'org4', 'org5', 'org8'] as const).map((k) =>
			Math.max(0, Math.min(8, Math.round(waveParam(p, k))))
		);
		const key = 'organ:' + bars.join('');
		let table = this.organTables.get(key);
		if (!table) {
			const harm = [1, 2, 3, 4, 5, 8];
			const N = 256;
			table = new Float32Array(N);
			for (let i = 0; i < N; i++)
				for (let k = 0; k < 6; k++)
					table[i] += (bars[k] / 8) * Math.sin((2 * Math.PI * harm[k] * i) / N);
			this.organTables.set(key, table);
		}
		return { key, table };
	}
	/* A sine driven into a folder: sin(k * sin x), the West-coast timbre; k is the FOLD knob. */
	private foldTables = new Map<string, Float32Array>();
	private foldTable(p: WaveParams | undefined): { key: string; table: Float32Array } {
		const k = Math.max(1, Math.min(8, waveParam(p, 'foldAmt')));
		const key = 'fold:' + k.toFixed(1);
		let table = this.foldTables.get(key);
		if (!table) {
			const N = 256;
			table = new Float32Array(N);
			for (let i = 0; i < N; i++) table[i] = Math.sin(k * Math.sin((2 * Math.PI * i) / N));
			this.foldTables.set(key, table);
		}
		return { key, table };
	}
	/* A comparator: -1 below zero, +1 above. With a saw in and an offset added,
     the output is a pulse whose width is the offset -- the PWM oscillator. */
	private static STEP_CURVE = (() => {
		const c = new Float32Array(1024);
		for (let i = 0; i < c.length; i++) c[i] = i < c.length / 2 ? -1 : 1;
		return c;
	})();

	private pulseWaves: WeakMap<BaseAudioContext, Map<number, PeriodicWave>> = new WeakMap();
	private pulseWave(ctx: BaseAudioContext, dutyPct: number): PeriodicWave {
		const duty = Math.round(Math.max(5, Math.min(95, dutyPct)));
		let perCtx = this.pulseWaves.get(ctx);
		if (!perCtx) {
			perCtx = new Map();
			this.pulseWaves.set(ctx, perCtx);
		}
		let wave = perCtx.get(duty);
		if (!wave) {
			const N = 64;
			const real = new Float32Array(N + 1);
			const imag = new Float32Array(N + 1);
			const d = duty / 100;
			for (let n = 1; n <= N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
			wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
			perCtx.set(duty, wave);
		}
		return wave;
	}

	private applyWaveform(
		osc: OscillatorNode,
		w: SynthWaveform,
		pulseWidth: number | undefined,
		params: WaveParams | undefined,
		ctx: BaseAudioContext
	) {
		const pw = pulseWidth ?? 50;
		if (w === 'square' && Math.round(pw) !== 50) osc.setPeriodicWave(this.pulseWave(ctx, pw));
		else if (w === 'organ') {
			const { key, table } = this.organTable(params);
			osc.setPeriodicWave(this.periodicFromSamples(ctx, key, table));
		} else if (w === 'fold') {
			const { key, table } = this.foldTable(params);
			osc.setPeriodicWave(this.periodicFromSamples(ctx, key, table));
		} else if (w.startsWith('custom:')) {
			const id = w.slice(7);
			const cw = this.customWaves.get(id);
			if (cw && cw.samples.length >= 8)
				osc.setPeriodicWave(
					this.periodicFromSamples(ctx, `custom:${id}:${this.waveVersion.get(id) ?? 0}`, cw.samples)
				);
			else osc.type = 'sine';
		}
		// Buffer sources only exist for OSC1; on OSC2 they fall back to a saw. PWM
		// and SUPERSAW start from a saw and get their companions in buildToneStack.
		else if (w === 'noise' || w === 'metal' || w === 'pwm' || w === 'supersaw')
			osc.type = 'sawtooth';
		else osc.type = w as OscillatorType;
	}

	/** How an oscillator's frequency moves over the note, so companions can follow it exactly. */
	private applyFreqPlan(p: AudioParam, plan: FreqPlan, mul = 1, add = 0) {
		p.setValueAtTime(plan.start * mul + add, plan.t);
		for (const r of plan.ramps) p.exponentialRampToValueAtTime(r.to * mul + add, r.at);
	}

	/**
	 * PWM and SUPERSAW are built around the saw the caller made. PWM: the saw
	 * plus an offset goes through a comparator, so the pulse is high for the part
	 * of the cycle the saw sits above the offset -- WIDTH sets that offset and a
	 * triangle LFO (RATE, DEPTH) moves it. The offset is subtracted again after
	 * the comparator, which takes out the DC a lopsided pulse carries. (The old
	 * two-saws-subtracted version started every note with both saws in phase,
	 * i.e. silent, and went silent twice per sweep.) SUPERSAW: four more saws
	 * spread SPREAD cents either side, at MIX of the centre one.
	 * Returns the node to use downstream, the companion oscillators (they follow
	 * the primary's pitch modulation) and helper sources that only need to be
	 * started and stopped with the voice.
	 */
	private buildToneStack(
		ctx: BaseAudioContext,
		osc: OscillatorNode,
		w: SynthWaveform,
		plan: FreqPlan,
		p: WaveParams | undefined
	): { out: AudioNode; companions: OscillatorNode[]; helpers: AudioScheduledSourceNode[] } {
		if (w === 'pwm') {
			const width = Math.max(5, Math.min(95, waveParam(p, 'pwmWidth'))) / 100;
			const base = 2 * width - 1;
			// The sweep stops short of closing the pulse entirely.
			const depth = Math.min(waveParam(p, 'pwmDepth') / 100, 0.95 - Math.abs(base));
			const offset = ctx.createConstantSource();
			offset.offset.value = base;
			const lfo = ctx.createOscillator();
			lfo.type = 'triangle';
			lfo.frequency.value = Math.max(0.05, waveParam(p, 'pwmRate'));
			const lfoGain = ctx.createGain();
			lfoGain.gain.value = Math.max(0, depth);
			const offsetSum = ctx.createGain();
			offset.connect(offsetSum);
			lfo.connect(lfoGain);
			lfoGain.connect(offsetSum);

			const cmpIn = ctx.createGain();
			osc.connect(cmpIn);
			offsetSum.connect(cmpIn);
			const cmp = ctx.createWaveShaper();
			cmp.curve = ModularSynth.STEP_CURVE;
			cmp.oversample = '2x';
			cmpIn.connect(cmp);

			const out = ctx.createGain();
			cmp.connect(out);
			const dcCancel = ctx.createGain();
			dcCancel.gain.value = -1;
			offsetSum.connect(dcCancel);
			dcCancel.connect(out);
			return { out, companions: [], helpers: [offset, lfo] };
		}
		if (w === 'supersaw') {
			const spread = Math.max(0, Math.min(50, waveParam(p, 'ssawSpread')));
			const mix = Math.max(0, Math.min(1, waveParam(p, 'ssawMix') / 100));
			const sum = ctx.createGain();
			const gP = ctx.createGain();
			gP.gain.value = 0.5;
			osc.connect(gP);
			gP.connect(sum);
			const companions: OscillatorNode[] = [];
			for (const f of [-1, -0.5, 0.5, 1]) {
				const o = ctx.createOscillator();
				o.type = 'sawtooth';
				this.applyFreqPlan(o.frequency, plan, Math.pow(2, (f * spread) / 1200));
				const g = ctx.createGain();
				g.gain.value = 0.5 * mix;
				o.connect(g);
				g.connect(sum);
				companions.push(o);
			}
			return { out: sum, companions, helpers: [] };
		}
		return { out: osc, companions: [], helpers: [] };
	}

	/** The 808 cymbal bank: six squares at its inharmonic ratios, fixed pitch, four seconds. */
	private metalBuffer: AudioBuffer | null = null;
	private metalBuf(): AudioBuffer {
		if (this.metalBuffer) return this.metalBuffer;
		const ctx = this.audioCtx()!;
		const sr = ctx.sampleRate;
		const len = sr * 4;
		const buffer = ctx.createBuffer(1, len, sr);
		const data = buffer.getChannelData(0);
		const freqs = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
		const phases = freqs.map((_, k) => (k * 1.7) % (2 * Math.PI));
		for (let i = 0; i < len; i++) {
			let v = 0;
			for (let k = 0; k < freqs.length; k++)
				v += Math.sin((2 * Math.PI * freqs[k] * i) / sr + phases[k]) >= 0 ? 1 : -1;
			data[i] = v / freqs.length;
		}
		this.metalBuffer = buffer;
		return buffer;
	}

	/* The 808 clap is one noise burst repeated three or four times a few ms
     apart, then left to ring. Done as gain gating on the one source rather
     than several start() calls, so the bursts are sample-exact and the amp
     envelope and filter still shape the whole hit. The last burst stays open. */
	private gateNoiseBursts(g: AudioParam, level: number, t: number, track: TrackData) {
		const bursts = Math.max(1, Math.min(4, Math.round(track.noiseRetrig ?? 1)));
		if (bursts <= 1) {
			g.setValueAtTime(level, t);
			return;
		}
		const gap = Math.max(0.005, Math.min(0.04, (track.noiseRetrigGap ?? 12) / 1000));
		for (let i = 0; i < bursts; i++) {
			const on = t + i * gap;
			g.setValueAtTime(level, on);
			if (i < bursts - 1) g.setValueAtTime(0.0001, on + gap * 0.55);
		}
	}

	/**
	 * Sidechain, trigger-driven: every track keyed to this source (and, if it
	 * asked for one, to this key) gets a gain dip scheduled at the note's start
	 * time. There is no envelope follower -- every sound here is an envelope we
	 * already know -- so the dip is sample-accurate, costs nothing, and comes
	 * out identical in an offline render. The reverb/delay sends tap before the
	 * track bus, so only the dry signal ducks and tails keep ringing.
	 */
	private scheduleDucking(sourceId: number, noteIndex: number, t: number) {
		for (let j = 0; j < this.tracks.length; j++) {
			const trk = this.tracks[j];
			if (j === sourceId || trk.duckSource !== sourceId) continue;
			const depth = trk.duckDepth ?? 0;
			if (depth <= 0) continue;
			const keys = trk.duckKeys;
			if (keys?.length && !keys.includes(noteIndex)) continue;
			const bus = this.trackBuses[j];
			if (!bus) continue;
			const g = bus.duck.gain;
			const dip = Math.max(0.001, (trk.duckDip ?? 5) / 1000);
			const hold = Math.max(0, (trk.duckHold ?? 40) / 1000);
			const rel = Math.max(0.005, (trk.duckRelease ?? 150) / 1000);
			const floor = Math.max(0.0005, 1 - depth);
			const param = g as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
			// A retrigger inside the previous release starts from wherever the
			// curve is, not from unity; browsers without cancelAndHold restart
			// from the current value instead, which only matters mid-release.
			if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
			else {
				g.cancelScheduledValues(t);
				g.setValueAtTime(g.value, t);
			}
			g.linearRampToValueAtTime(floor, t + dip);
			g.setValueAtTime(floor, t + dip + hold);
			g.linearRampToValueAtTime(1, t + dip + hold + rel);
		}
	}

	public triggerTrackVoice(
		trackId: number,
		noteIndex: number,
		accentLevel: number | boolean = 0,
		startTime?: number,
		durationSec?: number,
		rawVelocity?: number,
		laneVelocity?: number
	) {
		const trackRow = this.tracks[trackId];
		// Muting silences live playback, but must not silence an offline render.
		if (!trackRow || (!this.renderCtx && soundEngine.isMuted())) return;
		/* A note played by hand while a render is running has nowhere to go.
    
       `audioCtx()` hands back the offline context during a render, so a key
       press, a roll audition or an arriving MIDI note was built into the
       *offline* graph at a live-clock time -- and baked into the exported WAV.
       The render's own calls all carry an explicit `startTime`; the manual ones
       never do, which is exactly the difference. */
		if (this.renderCtx && startTime === undefined) return;

		const noteInfo = PIANO_ROLL_NOTES[noteIndex];
		if (!noteInfo) return;

		// In percussion mode the key decides the sound; everything below reads the merged timbre.
		const track = effectiveTimbre(trackRow, noteIndex);

		const acc = typeof accentLevel === 'boolean' ? (accentLevel ? 1 : 0) : accentLevel || 0;

		const ctx = this.audioCtx();
		if (!ctx) return;
		// An OfflineAudioContext also reports "suspended" before startRendering();
		// resuming it here would begin the render mid-schedule.
		if (!this.renderCtx && ctx.state === 'suspended') ctx.resume().catch(() => {});

		this.initMasterFX(ctx);

		/* Voice allocation: what this note does to the ones already sounding.
    
       Three separate rules, because they answer different questions. A mute
       group is about which sounds cannot coexist -- a hi-hat cannot be open and
       closed at once, so the closed one has to cut the open one's tail. MONO is
       about how many notes a part has: a bass line is one voice, and the tail
       of the last note ringing under the next is not how a bass behaves.
       LEGATO is about phrasing: overlapping keys should be one breath rather
       than a stack of retriggers.
    
       Offline renders schedule every voice with explicit times and never hold
       anything in activeVoices, so none of this applies there. */
		/* Was this track already sounding when the note arrived?
    
       Read before the choke loop below, which is about to empty `activeVoices`
       for this track -- asking afterwards would always answer no. */
		let legatoTakeover = false;
		if (!this.renderCtx && (track.voiceMode ?? 'poly') === 'legato') {
			for (const v of this.activeVoices.values()) {
				if (v.trackId === trackId) {
					legatoTakeover = true;
					break;
				}
			}
		}

		/* What this note does to the ones already sounding, and which group it
       belongs to. Walked once: it was computed here and again when the voice
       was filed, so the exec graph was traversed twice per percussion note and
       the two answers were one divergence away from a voice being filed under a
       group different from the one that chose its choke. */
		const act = this.noteActions(track, noteIndex, trackId);
		if (!this.renderCtx) {
			if (act.cut || act.solo) {
				/* Choked rather than stopped: a few milliseconds of fade is inaudible
           as a fade and audible as the absence of a click, which a hard cut on
           a ringing cymbal would be.
        
           CUT with a group takes only that group -- the hi-hat case. CUT with
           no group takes everything on the track, which is what MONO is. SOLO
           is the inverse: everything except the group. */
				for (const [k, v] of this.activeVoices) {
					if (v.trackId !== trackId) continue;
					const inGroup = act.cutGroup === 0 || v.muteGroup === act.cutGroup;
					if (act.solo ? inGroup : !inGroup) continue;
					this.chokeVoice(k, ctx.currentTime, act.fadeSec);
				}
			}
		}

		/* Voice allocation limits.
    
       Two of these are settings the user can turn -- POLY on the voice tab, and
       which voice gets taken -- and neither was consulted: `maxPolyphony` at 2
       still allowed eight voices on a track, because the only limit here was
       the global 64. Both are honoured now.
    
       Per track first, because that is what POLY means: how many notes this
       part has. Then the global ceiling, which is about the audio thread rather
       than the music. Offline voices carry explicit start/stop times, so none
       of them is "active". */
		if (!this.renderCtx) {
			const onThisTrack: string[] = [];
			for (const [k, v] of this.activeVoices) if (v.trackId === trackId) onThisTrack.push(k);
			while (onThisTrack.length >= this.maxPolyphony) {
				const victim = this.pickVictim(onThisTrack);
				if (!victim) break;
				this.stopVoice(victim);
				onThisTrack.splice(onThisTrack.indexOf(victim), 1);
			}
			if (this.activeVoices.size >= 64) {
				const victim = this.pickVictim([...this.activeVoices.keys()]);
				if (victim) this.stopVoice(victim);
			}
		}

		const voiceKey = `v${++this._voiceSeq}`;
		const t = startTime !== undefined ? Math.max(ctx.currentTime, startTime) : ctx.currentTime;
		this.scheduleDucking(trackId, noteIndex, t);
		const tuningScale = this.masterTuningFreq / 440.0;
		const baseFreq = noteInfo.freq * tuningScale;
		const masterGain = this.masterOut(ctx);

		// ──────────────────────────────────────────────────────────────────────────
		// NODE 1 & NODE 2: DUAL INPUT WAVEFORM GENERATORS & TIMBRE FUSION
		// ──────────────────────────────────────────────────────────────────────────
		/* ADV and racks 1-7 are two instruments, and only one plays a note.
    
       A track carries both, so the mode decides which is heard: in ADV the
       canvas is the instrument, and the subtractive voice behind it must be
       silent rather than merely unrouted. It was only unrouted -- the graph
       replaced the chain output, so the oscillators still ran under every note,
       burning a voice each time and sitting one stray connection away from
       being audible. Zeroing the mixer is the whole of it: everything upstream
       still builds, so nothing else has to know which mode is in force.
    
       ADV owns the note whenever the mode is on, empty canvas included. Keying
       this off "has nodes" instead let the racks play through a blank patch:
       nothing on the canvas, every key sounding, and the leak coming from the
       instrument you had just switched away from. An empty patch makes no
       sound, which is the honest answer and the one the canvas is showing. */
		const advOwnsVoice = !!track.advanced;

		const voiceMix = ctx.createGain();
		if (advOwnsVoice) voiceMix.gain.value = 0;
		let osc1: OscillatorNode | undefined;
		let osc1Out: AudioNode | undefined;
		let osc2Out: AudioNode | undefined;
		const companions: OscillatorNode[] = [];
		const helpers: AudioScheduledSourceNode[] = [];
		let osc2: OscillatorNode | undefined;
		let noiseSource: AudioBufferSourceNode | undefined;
		const extras: AudioScheduledSourceNode[] = [];

		// Notify realtime visual keyboard listeners
		if (this.onNoteListeners.size > 0) {
			const durMs = Math.round((durationSec ?? 60 / this.bpm / 8) * 1000);
			const delayMs = Math.max(0, Math.round((t - ctx.currentTime) * 1000));
			if (delayMs <= 5) {
				this.onNoteListeners.forEach((fn) => fn(trackId, noteIndex, noteInfo.note, durMs));
			} else {
				window.setTimeout(() => {
					this.onNoteListeners.forEach((fn) => fn(trackId, noteIndex, noteInfo.note, durMs));
				}, delayMs);
			}
		}

		/* OSC2's phase, as a delay of part of one cycle.
    
       Two things were wrong with `(phase/360) * period` clamped to 10 ms. 360
       is a *whole* period, so the knob's two ends meant the same thing -- 0 and
       360 were audibly and mathematically identical. And the clamp bit long
       before the top of the range on high notes: at C7 both 180 and 360 gave a
       flat 10 ms, twenty-one whole periods, so the knob was a fixed flam rather
       than a phase.
    
       Wrapping at 360 keeps the ends distinct, and taking the delay modulo one
       period means it is always a phase, whatever the note. */
		const phaseFrac = ((((track.phaseOffset ?? 0) % 360) + 360) % 360) / 360;
		const period = 1 / Math.max(1, baseFreq);
		const startT1 = t;
		const startT2 = t + phaseFrac * period;

		const pEnvAmt = track.pitchEnvAmount ?? 0;
		const pAtt = Math.max(0.001, track.pitchAttack ?? 0.002);
		const pDec = Math.max(0.005, track.pitchDecay ?? 0.05);
		const pRatio = Math.pow(2, pEnvAmt);

		// NES-style noise pitch: with keyTracking > 0 the noise playback rate follows
		// the note (like the NES noise channel's 16 rates) — high notes tick bright
		// (hi-hat), mid notes rasp fuller (snare), low notes rumble (kick).
		const noiseKeyTrk = track.keyTracking ?? 0.0;
		const noiseRate =
			noiseKeyTrk > 0 ? Math.max(0.25, Math.min(4, Math.pow(baseFreq / 261.63, noiseKeyTrk))) : 1.0;

		const osc1IsBuffer = track.osc1Waveform === 'noise' || track.osc1Waveform === 'metal';
		if (osc1IsBuffer && !this.noiseBuffer) this.initNoiseBuffer();
		const buf1 = track.osc1Waveform === 'metal' ? this.metalBuf() : this.noiseBuffer;
		if (osc1IsBuffer && track.osc2Waveform === 'noise') {
			noiseSource = ctx.createBufferSource();
			noiseSource.buffer = buf1;
			noiseSource.loop = true;
			if (pEnvAmt !== 0) {
				noiseSource.playbackRate.setValueAtTime(noiseRate, t);
				noiseSource.playbackRate.exponentialRampToValueAtTime(noiseRate * pRatio, t + pAtt);
				noiseSource.playbackRate.exponentialRampToValueAtTime(noiseRate, t + pAtt + pDec);
			} else if (noiseRate !== 1.0) {
				noiseSource.playbackRate.setValueAtTime(noiseRate, t);
			}
			const gN = ctx.createGain();
			/* OSC1's own level, like every other branch passes. A literal 1.0 here
         made the knob inert whenever both oscillators were noise -- which is
         how a hi-hat or a snare is built, so the level control was missing from
         exactly the sounds that use this path. */
			this.gateNoiseBursts(gN.gain, track.osc1Gain, t, track);
			noiseSource.connect(gN);
			gN.connect(voiceMix);
			noiseSource.start(startT1);
		} else {
			if (osc1IsBuffer) {
				noiseSource = ctx.createBufferSource();
				noiseSource.buffer = buf1;
				noiseSource.loop = true;
				if (pEnvAmt !== 0) {
					noiseSource.playbackRate.setValueAtTime(noiseRate, t);
					noiseSource.playbackRate.exponentialRampToValueAtTime(noiseRate * pRatio, t + pAtt);
					noiseSource.playbackRate.exponentialRampToValueAtTime(noiseRate, t + pAtt + pDec);
				} else if (noiseRate !== 1.0) {
					noiseSource.playbackRate.setValueAtTime(noiseRate, t);
				}
				const g1 = ctx.createGain();
				this.gateNoiseBursts(g1.gain, track.osc1Gain, t, track);
				noiseSource.connect(g1);
				g1.connect(voiceMix);
				noiseSource.start(startT1);
			} else {
				const glideSec = (track.glideTime ?? 0) / 1000;
				const lastFreq = this.lastTrackFreqs.get(track.id);
				const lastTime = this.lastTrackNoteTimes.get(track.id) ?? 0;
				const isLegato = t - lastTime < 1.5; // Within 1.5s interval
				const startFreq = glideSec > 0 && lastFreq && isLegato ? lastFreq : baseFreq;

				osc1 = ctx.createOscillator();
				this.applyWaveform(osc1, track.osc1Waveform, track.pulseWidth, track.waveParams, ctx);
				const plan1: FreqPlan = { t, start: startFreq, ramps: [] };
				if (glideSec > 0 && startFreq !== baseFreq)
					plan1.ramps.push({ to: baseFreq, at: t + glideSec });
				if (pEnvAmt !== 0) {
					plan1.ramps.push({ to: baseFreq * pRatio, at: t + glideSec + pAtt });
					plan1.ramps.push({ to: baseFreq, at: t + glideSec + pAtt + pDec });
				}
				this.applyFreqPlan(osc1.frequency, plan1);
				const stack1 = this.buildToneStack(ctx, osc1, track.osc1Waveform, plan1, track.waveParams);
				osc1Out = stack1.out;
				companions.push(...stack1.companions);
				helpers.push(...stack1.helpers);
			}

			// SEMI transposes OSC2 in semitones on top of RATIO and DET; it was a knob
			// with nothing behind it until now.
			const osc2Freq =
				baseFreq *
				track.osc2Ratio *
				Math.pow(2, track.detuneCents / 1200) *
				Math.pow(2, (track.osc2Semitone ?? 0) / 12);
			const glideSec2 = (track.glideTime ?? 0) / 1000;
			const lastFreq2 = this.lastTrackFreqs.get(track.id);
			const lastTime2 = this.lastTrackNoteTimes.get(track.id) ?? 0;
			const isLegato2 = t - lastTime2 < 1.5;
			const prevOsc2Freq = lastFreq2
				? lastFreq2 *
					track.osc2Ratio *
					Math.pow(2, track.detuneCents / 1200) *
					Math.pow(2, (track.osc2Semitone ?? 0) / 12)
				: osc2Freq;
			const startFreq2 = glideSec2 > 0 && lastFreq2 && isLegato2 ? prevOsc2Freq : osc2Freq;

			osc2 = ctx.createOscillator();
			this.applyWaveform(osc2, track.osc2Waveform, track.pulseWidth, track.waveParams, ctx);
			const plan2: FreqPlan = { t, start: startFreq2, ramps: [] };
			if (glideSec2 > 0 && startFreq2 !== osc2Freq)
				plan2.ramps.push({ to: osc2Freq, at: t + glideSec2 });
			if (pEnvAmt !== 0) {
				plan2.ramps.push({ to: osc2Freq * pRatio, at: t + glideSec2 + pAtt });
				plan2.ramps.push({ to: osc2Freq, at: t + glideSec2 + pAtt + pDec });
			}
			this.applyFreqPlan(osc2.frequency, plan2);
			const stack2 = this.buildToneStack(ctx, osc2, track.osc2Waveform, plan2, track.waveParams);
			osc2Out = stack2.out;
			companions.push(...stack2.companions);
			helpers.push(...stack2.helpers);

			// Record this note for subsequent glide calculations
			this.lastTrackFreqs.set(track.id, baseFreq);
			this.lastTrackNoteTimes.set(track.id, t);

			// Crossfade balance weighting (xfade: 0 = 100% OSC1, 0.5 = 50/50, 1.0 = 100% OSC2)
			const xf = track.xfade ?? 0.5;
			const osc1Eql = this.eqlCompensation ? getWaveformPerceptualScale(track.osc1Waveform) : 1.0;
			const osc2Eql = this.eqlCompensation ? getWaveformPerceptualScale(track.osc2Waveform) : 1.0;
			const osc1Bal = Math.cos(xf * 0.5 * Math.PI) * Math.SQRT2 * osc1Eql;
			const osc2Bal = Math.sin(xf * 0.5 * Math.PI) * Math.SQRT2 * osc2Eql;

			if (track.blendMode === 'fm' && osc1) {
				const fmGain = ctx.createGain();
				const fmIndex = track.morphAmount * baseFreq * 3.5 * track.osc2Gain * osc2Bal;
				fmGain.gain.setValueAtTime(fmIndex, t);
				osc2Out!.connect(fmGain);
				fmGain.connect(osc1.frequency);
				for (const c of companions) if (c !== osc2) fmGain.connect(c.frequency);

				const osc1GainNode = ctx.createGain();
				osc1GainNode.gain.setValueAtTime(track.osc1Gain * osc1Bal, t);
				osc1Out!.connect(osc1GainNode);
				osc1GainNode.connect(voiceMix);
			} else if (track.blendMode === 'ring' && osc1) {
				/* Ring modulation: one oscillator multiplies the other.
        
           Both levels and the crossfade were ignored here -- osc2 arrived at
           the gain param at full swing with no depth control, and osc1's level
           knob did nothing, so three knobs on the card were inert in this mode
           alone.
        
           The carrier keeps its own level; the modulator is scaled before it
           reaches the gain param rather than after, so turning OSC2 down makes
           the effect shallower instead of the whole voice quieter. MORPH stays
           out of it: it defaults to 0, and reading it as depth here would
           silence both shipped ring presets, neither of which sets it. */
				const carrier = ctx.createGain();
				carrier.gain.setValueAtTime(track.osc1Gain * osc1Bal, t);
				osc1Out!.connect(carrier);

				const depth = ctx.createGain();
				depth.gain.setValueAtTime(track.osc2Gain * osc2Bal, t);
				osc2Out!.connect(depth);

				const ringGain = ctx.createGain();
				ringGain.gain.setValueAtTime(0, t);
				carrier.connect(ringGain);
				depth.connect(ringGain.gain);
				ringGain.connect(voiceMix);
			} else if (track.blendMode === 'sync' && osc1) {
				const g1 = ctx.createGain();
				const g2 = ctx.createGain();
				g1.gain.setValueAtTime(track.osc1Gain * osc1Bal * (1.0 - track.morphAmount * 0.4), t);
				g2.gain.setValueAtTime(track.osc2Gain * osc2Bal * track.morphAmount * 0.9, t);
				osc1Out!.connect(g1);
				osc2Out!.connect(g2);
				g1.connect(voiceMix);
				g2.connect(voiceMix);
			} else {
				if (osc1) {
					const g1 = ctx.createGain();
					g1.gain.setValueAtTime(track.osc1Gain * osc1Bal * (1.0 - track.morphAmount * 0.6), t);
					osc1Out!.connect(g1);
					g1.connect(voiceMix);
				}
				const g2 = ctx.createGain();
				g2.gain.setValueAtTime(track.osc2Gain * osc2Bal * (0.2 + track.morphAmount * 0.8), t);
				osc2Out!.connect(g2);
				g2.connect(voiceMix);
			}

			if (osc1) osc1.start(startT1);
			osc2.start(startT2);
			for (const c of companions) {
				c.start(startT1);
				extras.push(c);
			}
			for (const h of helpers) {
				h.start(startT1);
				extras.push(h);
			}

			// SUB: a sine an octave under OSC1, following its glide and pitch envelope.
			// Was a knob with nothing behind it; a kick without it has no weight.
		}

		/* SUB: a sine an octave under the note, following the same glide and pitch
       envelope.
    
       Outside the oscillator branches, because it belongs to the *note* rather
       than to OSC1. It used to live inside the `else` and be guarded by
       `&& osc1` -- `osc1` is undefined whenever OSC1 is a buffer waveform -- so
       a kick built as noise plus SUB, which is the obvious way to build one and
       what "a kick without it has no weight" is about, got no sub at all. */
		const subGainAmt = track.subOscGain ?? 0;
		if (subGainAmt > 0) {
			const subGlide = (track.glideTime ?? 0) / 1000;
			const subLast = this.lastTrackFreqs.get(track.id);
			const subLegato = t - (this.lastTrackNoteTimes.get(track.id) ?? 0) < 1.5;
			const subStart = subGlide > 0 && subLast && subLegato ? subLast : baseFreq;
			const sub = ctx.createOscillator();
			sub.type = 'sine';
			sub.frequency.setValueAtTime(subStart / 2, t);
			if (subGlide > 0 && subStart !== baseFreq) {
				sub.frequency.exponentialRampToValueAtTime(baseFreq / 2, t + subGlide);
			}
			if (pEnvAmt !== 0) {
				sub.frequency.exponentialRampToValueAtTime((baseFreq / 2) * pRatio, t + subGlide + pAtt);
				sub.frequency.exponentialRampToValueAtTime(baseFreq / 2, t + subGlide + pAtt + pDec);
			}
			const gSub = ctx.createGain();
			gSub.gain.setValueAtTime(subGainAmt * 0.9, t);
			sub.connect(gSub);
			gSub.connect(voiceMix);
			sub.start(startT1);
			extras.push(sub);
		}

		// NOISE: the mix knob's own source, so a snare can keep both oscillators
		// for its body and still have its rattle. Same key-tracked rate and pitch
		// envelope as OSC1-as-noise, same burst gating. Skipped when OSC1 is
		// already the noise source -- that would just be the same buffer twice.
		const noiseMixAmt = track.noiseGain ?? 0;
		if (noiseMixAmt > 0 && track.osc1Waveform !== 'noise') {
			if (!this.noiseBuffer) this.initNoiseBuffer();
			const nz = ctx.createBufferSource();
			nz.buffer = this.noiseBuffer;
			nz.loop = true;
			if (pEnvAmt !== 0) {
				nz.playbackRate.setValueAtTime(noiseRate, t);
				nz.playbackRate.exponentialRampToValueAtTime(noiseRate * pRatio, t + pAtt);
				nz.playbackRate.exponentialRampToValueAtTime(noiseRate, t + pAtt + pDec);
			} else if (noiseRate !== 1.0) {
				nz.playbackRate.setValueAtTime(noiseRate, t);
			}
			const gN = ctx.createGain();
			this.gateNoiseBursts(gN.gain, noiseMixAmt * 0.8, t, track);
			nz.connect(gN);
			gN.connect(voiceMix);
			nz.start(startT1);
			extras.push(nz);
		}

		// ──────────────────────────────────────────────────────────────────────────
		// NODE 3 & 4: DUAL INDEPENDENT ENVELOPES (AMP + VCF) & MODULATION MATRIX
		// ──────────────────────────────────────────────────────────────────────────
		const filter = ctx.createBiquadFilter();
		filter.type = track.filterType;

		// 1. Dual Envelope Parameters
		// ATK 0 is a real zero: the gain is set, not ramped, so a drum starts on
		// its first sample the way a chip's length-counter burst does. Anything
		// above zero still gets at least one 1 ms ramp so it cannot alias.
		const ampAttRaw = Math.max(0, track.ampAttack ?? track.attack ?? 0.005);
		/* LEGATO: a note that arrives while another is sounding does not re-attack.
    
       This is the whole difference between LEGATO and MONO, and it was missing
       -- the two modes produced byte-identical envelopes, so LEGATO was a
       slower MONO. A phrase played overlapping is one breath: the pitch moves
       and the envelope carries on, which is what a wind or bowed instrument
       does and why the mode exists.
    
       `legatoTakeover` is decided before the choke loop runs, since that loop
       is about to empty `activeVoices` for this track. */
		const ampAtt = legatoTakeover ? 0 : ampAttRaw < 0.0005 ? 0 : Math.max(0.001, ampAttRaw);
		const ampDec = Math.max(0.01, track.ampDecay ?? track.decay ?? 0.15);
		const ampSus = Math.max(0.0001, track.ampSustain ?? track.sustain ?? 0.5);
		const ampRel = Math.max(0.01, track.ampRelease ?? track.release ?? 0.1);

		const vcfAttRaw = Math.max(0, track.filterAttack ?? 0.005);
		const vcfAtt = vcfAttRaw < 0.0005 ? 0 : Math.max(0.001, vcfAttRaw);
		const vcfDec = Math.max(0.01, track.filterDecay ?? 0.18);
		const vcfSus = Math.max(0.0, track.filterSustain ?? 0.25);
		const vcfRel = Math.max(0.01, track.filterRelease ?? 0.1);
		const vcfAmount =
			track.filterEnvAmount !== undefined ? track.filterEnvAmount : (track.envFilterMod ?? 0.5);

		// 2. Mod Matrix Velocity & Keyboard Tracking Target Calculations
		let dynamicCutoffBase = track.cutoff;
		let dynamicResonance = track.resonance;

		// Key Tracking: scale cutoff proportional to note pitch relative to Middle C (C4 = 261.63Hz)
		const keyTrk = track.keyTracking ?? 0.0;
		if (keyTrk > 0) {
			const pitchRatio = Math.max(0.2, baseFreq / 261.63);
			dynamicCutoffBase = dynamicCutoffBase * Math.pow(pitchRatio, keyTrk);
		}

		// Map accent levels (0, 1, 2, 3, 4 dB) to smooth linear gain multiplier and subtle VCF opening
		// 0dB = 1.0x (solid, clear presence), +1dB = 1.12x, +2dB = 1.26x, +3dB = 1.41x, +4dB = 1.58x
		let accGainMult = 1.0;
		let accCutoffMult = 1.0;
		let accResMult = 1.0;

		if (acc > 0) {
			/* Level only when nothing else already carried it. The sequencer raises
         an accented step's velocity in `trackVelocityAt` and then passes the
         accent here as well, so applying the dB multiplier again would count
         the same stress twice and make an accent about 3 dB hotter than the
         row says. A note played by hand carries no velocity of its own, and
         for that one the multiplier is the only thing there is. */
			accGainMult =
				rawVelocity === undefined && laneVelocity === undefined ? Math.pow(10, acc / 20) : 1.0;
			accCutoffMult = 1.0 + acc * 0.04; // Subtle harmonic opening (+1 -> 1.04x, +4 -> 1.16x)
			accResMult = 1.0 + acc * 0.025; // Subtle punch increase
		}

		for (const route of track.modRoutes || []) {
			if (!route.enabled) continue;
			if (route.source === 'velocity' && acc > 0) {
				const velMod = acc / 4.0;
				if (route.dest === 'cutoff') dynamicCutoffBase += route.amount * 1500 * velMod;
				if (route.dest === 'resonance')
					dynamicResonance = Math.max(0.2, dynamicResonance + route.amount * 1.5 * velMod);
			}
		}

		if (acc > 0) {
			dynamicCutoffBase = Math.min(16000, dynamicCutoffBase * accCutoffMult);
			dynamicResonance = Math.min(16.0, dynamicResonance * accResMult);
		}

		const baseCutoff = Math.max(40, Math.min(16000, dynamicCutoffBase));

		// Correctly scale positive and negative VCF envelope amounts
		const peakDelta =
			vcfAmount >= 0 ? vcfAmount * (16000 - baseCutoff) : vcfAmount * (baseCutoff - 40);

		const peakCutoff = Math.max(40, Math.min(20000, baseCutoff + peakDelta));
		const sustainCutoff = Math.max(40, Math.min(20000, baseCutoff + peakDelta * vcfSus));

		// VCF Dynamic Sweep
		filter.frequency.setValueAtTime(vcfAtt === 0 ? peakCutoff : baseCutoff, t);
		if (vcfAtt > 0) filter.frequency.exponentialRampToValueAtTime(peakCutoff, t + vcfAtt);
		filter.frequency.exponentialRampToValueAtTime(sustainCutoff, t + vcfAtt + vcfDec);
		filter.Q.setValueAtTime(dynamicResonance, t);

		// AMP Dynamic Envelope: 0.28 base scaled by exact accent dB multiplier
		let gainBase = 0.28 * accGainMult;

		// Apply MIDI Velocity Sensitivity based on the active velocity curve (EXP / LINEAR / LOG / HARD / OFF)
		/* OFF flattens the *keyboard's* touch response, which is a property of the
       controller. A curve drawn in a lane is not touch -- it is the part as
       written -- so it still applies, linearly, rather than being discarded
       along with the velocity a key press happened to report. */
		/* Velocity 0 is a note-off in MIDI, and here it fell through the `> 0`
       guards to the *default* gain -- so vel 0 measured 0.224 where vel 1
       measured 0.014, a sixteenfold jump at the bottom of the range. Treat it
       as the quietest note rather than as no opinion. */
		if (rawVelocity !== undefined && rawVelocity <= 0) {
			gainBase = 0.28 * accGainMult * 0.05;
		} else if (this.velocityCurve === 'OFF' && laneVelocity !== undefined && laneVelocity > 0) {
			gainBase =
				0.28 * accGainMult * (0.15 + (Math.max(1, Math.min(127, laneVelocity)) / 127) * 1.1);
		} else if (this.velocityCurve !== 'OFF' && rawVelocity !== undefined && rawVelocity > 0) {
			const v = Math.max(1, Math.min(127, rawVelocity)) / 127;
			let velGainScale = 1.0;

			switch (this.velocityCurve) {
				case 'EXP':
					// Exponential / Natural Piano: deep dynamic range, soft pianissimo & punchy fortissimo
					velGainScale = 0.06 + Math.pow(v, 1.8) * 1.35;
					break;
				case 'LINEAR':
					// Linear: direct 1:1 proportional tracking (0.15 to 1.25)
					velGainScale = 0.15 + v * 1.1;
					break;
				case 'LOG':
					// Logarithmic / Soft: easy to play loudly with lighter touch
					velGainScale = 0.2 + Math.sqrt(v) * 1.05;
					break;
				case 'HARD':
					// Hard / Aggressive: requires very firm strike to reach full volume
					velGainScale = 0.04 + Math.pow(v, 3.0) * 1.5;
					break;
			}
			/* Velocity carries the level here; see `accGainMult` above for why the
         accent does not multiply it a second time on a sequenced note. */
			gainBase = 0.28 * accGainMult * velGainScale;
		}

		/* The strike, 0..1, as ENTRY publishes it.
    
       The lane if the part was written with one, the key press otherwise, and a
       firm default when neither says. This is the number a patch does its own
       thing with -- into a filter for "harder is brighter", into a strike's
       hardness for a sharper contact -- rather than only reaching the amp. */
		const velocityUnit = Math.max(0, Math.min(1, (laneVelocity ?? rawVelocity ?? 100) / 127));

		// A one-shot (no sustain) is over in 50-200 ms; at the same peak the ear
		// hears it 6-10 dB under a held note. Give hits back some of that.
		const oneShot = ampSus <= 0.001 ? 1.8 : 1;
		/* presetGain is applied at the graph's sink for a patched voice, so it must
       not also scale the voice feeding it -- that would square it. A rack voice
       has no sink, so it takes the factor here instead. */
		const peakGain =
			gainBase * track.volume * oneShot * (advOwnsVoice ? 1 : (track.presetGain ?? 1));
		const sustainGain = Math.max(0.0001, peakGain * ampSus);
		const gainNode = ctx.createGain();
		if (legatoTakeover) {
			/* Taking over a phrase already in progress: start where the last note
         had got to rather than at the top of a fresh attack. Jumping to
         `peakGain` here would be a click on every slurred note, which is the
         opposite of what the mode is for. */
			gainNode.gain.setValueAtTime(sustainGain, t);
		} else if (ampAtt === 0) {
			/* An exponential ramp from exactly 0 is undefined, and `peakGain` is a
         product of four factors any one of which can be zero -- a fader at the
         bottom, a preset gain of nothing. Floor the start so the ramp has
         somewhere to come from. */
			gainNode.gain.setValueAtTime(Math.max(0.0001, peakGain), t);
			gainNode.gain.exponentialRampToValueAtTime(sustainGain, t + ampDec);
		} else {
			gainNode.gain.setValueAtTime(0.0001, t);
			gainNode.gain.linearRampToValueAtTime(peakGain, t + ampAtt);
			gainNode.gain.exponentialRampToValueAtTime(sustainGain, t + ampAtt + ampDec);
		}

		// ──────────────────────────────────────────────────────────────────────────
		// NODE 5: STEREO PAN & MASTER FX ROUTING
		// ──────────────────────────────────────────────────────────────────────────
		let panner: StereoPannerNode | undefined;
		if (ctx.createStereoPanner) {
			panner = ctx.createStereoPanner();
			panner.pan.setValueAtTime(track.pan, t);
		}

		// Node 5 LFO Modulation Routing (Direct, self-consistent DSP flow)
		const pitchModAmt = track.lfoPitchAmt ?? 0;
		const cutoffModAmt = track.lfoCutoffAmt ?? 0;
		const panModAmt = track.lfoPanAmt ?? 0;
		const ampModAmt = track.lfoAmpAmt ?? 0;
		const lfoFadeSec = (track.lfoFadeTime ?? 0) / 1000;

		/* The rack LFO is rack 5's, so it does not touch an ADV voice.
    
       Its pitch and cutoff targets are rack oscillators and the rack filter,
       which an ADV voice does not use -- but PAN and AMP land on the panner and
       the gain node, which are shared, so without this an ADV patch wobbled to
       a modulator on the other instrument. A patch that wants an LFO puts one
       on the canvas. */
		let lfo: OscillatorNode | undefined;
		if (
			!advOwnsVoice &&
			(pitchModAmt > 0 || cutoffModAmt > 0 || panModAmt > 0 || ampModAmt > 0) &&
			track.lfoRate > 0
		) {
			lfo = ctx.createOscillator();
			lfo.type = track.lfoWaveform;
			lfo.frequency.setValueAtTime(track.lfoRate, t);

			// 1. Vibrato (Pitch modulation)
			if (pitchModAmt > 0) {
				const pitchGain = ctx.createGain();
				const targetPitchGain = pitchModAmt * baseFreq * 0.12;
				if (lfoFadeSec > 0) {
					pitchGain.gain.setValueAtTime(0.0001, t);
					pitchGain.gain.linearRampToValueAtTime(targetPitchGain, t + lfoFadeSec);
				} else {
					pitchGain.gain.setValueAtTime(targetPitchGain, t);
				}
				lfo.connect(pitchGain);
				if (osc1) pitchGain.connect(osc1.frequency);
				if (osc2) pitchGain.connect(osc2.frequency);
				for (const c of companions) pitchGain.connect(c.frequency);
			}

			// 2. Wah-Wah / Filter sweep modulation
			if (cutoffModAmt > 0) {
				const filterGain = ctx.createGain();
				const targetFilterGain = cutoffModAmt * 2800;
				if (lfoFadeSec > 0) {
					filterGain.gain.setValueAtTime(0.0001, t);
					filterGain.gain.linearRampToValueAtTime(targetFilterGain, t + lfoFadeSec);
				} else {
					filterGain.gain.setValueAtTime(targetFilterGain, t);
				}
				lfo.connect(filterGain);
				filterGain.connect(filter.frequency);
			}

			// 3. Auto-Pan modulation
			if (panModAmt > 0 && panner) {
				const panGain = ctx.createGain();
				const targetPanGain = panModAmt * 0.8;
				if (lfoFadeSec > 0) {
					panGain.gain.setValueAtTime(0.0001, t);
					panGain.gain.linearRampToValueAtTime(targetPanGain, t + lfoFadeSec);
				} else {
					panGain.gain.setValueAtTime(targetPanGain, t);
				}
				lfo.connect(panGain);
				panGain.connect(panner.pan);
			}

			// 4. Tremolo / Volume amplitude modulation
			if (ampModAmt > 0) {
				const ampGain = ctx.createGain();
				/* Tremolo depth, as a fraction of the note's own level.
        
           It was `ampModAmt * 0.45 * track.volume` -- a scale unrelated to the
           envelope it sums into. At the default volume the depth reached 1.71x
           the envelope's peak, so past about ampModAmt 0.585 the summed gain
           went negative and the voice phase-inverted on every LFO trough.
           `track.volume` was also being counted twice, since it is already
           inside `peakGain`.
        
           Half the peak at full depth: the loudest the tremolo gets is the note
           itself, and the quietest is silence. Capped just under 1 so the
           trough cannot reach zero, which would make the release ramp start
           from a gain of nothing. */
				const targetAmpGain = peakGain * Math.min(0.98, ampModAmt) * 0.5;
				if (lfoFadeSec > 0) {
					ampGain.gain.setValueAtTime(0.0001, t);
					ampGain.gain.linearRampToValueAtTime(targetAmpGain, t + lfoFadeSec);
				} else {
					ampGain.gain.setValueAtTime(targetAmpGain, t);
				}
				lfo.connect(ampGain);
				ampGain.connect(gainNode.gain);
			}

			lfo.start(t);
		}

		const isContinuousHold = durationSec === 0;

		if (!isContinuousHold) {
			const holdSec = durationSec !== undefined ? Math.max(0.02, durationSec) : 60 / this.bpm / 8;
			const releaseStartTime = Math.max(t + ampAtt + ampDec, t + holdSec);
			gainNode.gain.setValueAtTime(sustainGain, releaseStartTime);
			gainNode.gain.exponentialRampToValueAtTime(0.0001, releaseStartTime + ampRel);

			filter.frequency.setValueAtTime(sustainCutoff, releaseStartTime);
			filter.frequency.exponentialRampToValueAtTime(baseCutoff, releaseStartTime + vcfRel);

			/* The sources stop when the envelope closes, as they always did: leaving
         them running would keep feeding a resonator that is supposed to be
         ringing down, and the loop would build instead of decay.
         
         The voice itself is reaped later -- by the chain's ring-out -- so a
         plucked string is heard to the end rather than cut off at 0.3s. */
			/* The sources stop when the envelope closes, as they always did. Holding
         them longer keeps feeding the resonator, and a loop fed while it should
         be ringing down builds instead of decays -- measured at +52 dB for a
         string asked to ring for six seconds.
         
         The voice is reaped later, by the chain's ring-out, so its nodes are
         not torn down while a resonator is still sounding. */
			const rackTail = this.rackTailSeconds(track);
			const stopTime = releaseStartTime + ampRel + 0.1;
			const reapTime = stopTime + rackTail;
			/* A resonator's partials are sources of their own and outlive the
         excitation -- a piano string rings for seconds after the hammer. Stop
         them at the reap, not with the oscillators, or the note is cut off
         mid-decay however long its DECY says.
         
         Half a second past it, because the ring-out is where the partial
         envelope reaches -80 dB, not silence: stopping exactly there leaves a
         step from a quiet note to nothing, which is heard as a click. */
			const extrasStop = rackTail > 0 ? reapTime + 0.5 : stopTime;
			if (osc1) osc1.stop(stopTime);
			if (osc2) osc2.stop(stopTime);
			if (noiseSource) noiseSource.stop(stopTime);
			for (const x of extras) x.stop(extrasStop);
			if (lfo) lfo.stop(stopTime);

			// onended fires off the audio clock even when background-tab timer
			// throttling delays the setTimeout fallback by seconds or minutes. It
			// is also the only reaper an offline render may use: it fires when the
			// renderer actually reaches the end of the note, whereas wall-clock
			// reaping would disconnect nodes it has not got to yet. Without any
			// reaping offline, every finished voice stayed in the graph and the
			// render cost grew with the square of the song length.
			const endSrc = osc1 ?? osc2 ?? noiseSource;
			/* Reaping disconnects the voice's gain node, which is the chain's input:
         do it the moment the oscillators end and a resonator still ringing is
         cut off mid-note. Wait out the chain's tail first. */
			if (endSrc) {
				endSrc.onended =
					rackTail > 0
						? () => window.setTimeout(() => this.reapVoice(voiceKey), rackTail * 1000 + 600)
						: () => this.reapVoice(voiceKey);
			}
			if (!this.renderCtx) {
				// Past extrasStop, so the graph outlives the partials rather than
				// cutting them: disconnecting mid-decay is an audible click.
				const cleanupMs = Math.ceil((reapTime - ctx.currentTime) * 1000) + 600;
				void window.setTimeout(() => this.reapVoice(voiceKey), cleanupMs);
			}
		}

		voiceMix.connect(filter);
		filter.connect(gainNode);

		/* The rack chain: the voice's own signal path, after the amp envelope and
		 * before the output shaping.
		 *
		 * Here rather than earlier because these are resonators and bodies -- they
		 * answer an excitation, and the envelope is what shapes that excitation.
		 * A string fed a steady tone rings forever; fed a plucked one, it sounds
		 * plucked.
		 *
		 * Only while the track is in ADV. The two are different instruments, not
		 * two views of one: without ADV a track is the subtractive synth racks 1-7
		 * describe, and with it the signal path the patch bay describes. Switching
		 * the mode switches the sound, which is the point of having the mode --
		 * a track carries both and plays whichever is in force. */
		let chainOut: AudioNode = gainNode;

		/* How long the note is held, for modules that are driven rather than
       struck. Continuous hold (durationSec 0) has no known length, so give a
       blown instrument a generous one and let the release close it. */
		const heldSec =
			durationSec === 0
				? 8
				: durationSec !== undefined
					? Math.max(0.02, durationSec)
					: 60 / this.bpm / 8;

		/* A patched graph takes precedence over the linear chain: both are stored,
       and a track that has been wired by hand should play what was wired. */
		/* Through the same migration the canvas applies.
    
       The engine played `rackGraph` raw, so the port renames and the restored
       ENTRY/OUT that `graphOf` performs only ever happened in the editor. A
       patch saved with the old `in2` port name played its B leg at A's gain
       while the canvas drew it correctly on B; a patch saved without an ENTRY
       node was silent until the user happened to touch any node, at which point
       the canvas committed the migrated graph and it started working with no
       edit that explained it. One reading of a saved patch, not two. */
		const graph = advOwnsVoice && track.rackGraph?.nodes?.length ? graphOf(track) : undefined;
		if (graph) {
			/* What each lane reads for this note. Sampled once, when the note starts:
         that is what a lane means for a voice, and it is why the socket is a
         constant rather than a moving signal. */
			const laneValues: Record<string, number> = {};
			for (const l of lanesOf(trackRow as { noteLanes?: NoteLane[] })) {
				laneValues[l.id] = laneAt(l, this.currentStep);
			}
			const built = this.buildRackGraph(
				ctx,
				graph,
				track.graphParams ?? {},
				baseFreq,
				t,
				heldSec,
				laneValues,
				track.presetGain ?? 1,
				{ velocity: velocityUnit, noteIndex },
				trackId
			);
			if (built) {
				/* The graph is the whole voice, and answers to none of racks 1-7.
        
           Routing it through track.volume was tried and is wrong: that is rack
           7's VOL knob, so turning down a control on the instrument you are not
           playing silenced the one you are. Level inside a patch is a VCA on the
           canvas; the track's place in the mix is the mixer's business, further
           down. */
				chainOut = built.out;
				for (const src of built.sources) {
					src.start(built.startAt.get(src) ?? t);
					extras.push(src);
				}
			}
		}

		const rackChain = track.advanced && !graph ? track.rackChain : undefined;
		if (Array.isArray(rackChain) && rackChain.length) {
			const rackParams = track.rackParams ?? {};
			for (const id of rackChain) {
				const mod = this.buildRackModule(ctx, id, rackParams, baseFreq, t, heldSec);
				if (!mod) continue;
				chainOut.connect(mod.in);
				chainOut = mod.out;
				for (const src of mod.sources ?? []) {
					src.start(t);
					extras.push(src);
				}
			}
		}

		/* Node 7: air shelf, and the boundary between the two instruments.
    
       Everything from here down belongs to racks 1-7, so an ADV voice skips it:
       AIR is a knob on rack 7, and a patch that answers to a control on the
       instrument you are not playing is not isolated. What comes after -- the
       track's EQ, its place in the mix, the sends -- is the mixer's and applies
       to both. */
		let finalVoiceNode: AudioNode = chainOut;
		/* The nodes past the gain/filter/panner trio, kept so the voice can be
       taken apart again. The reverb send is taken from `finalVoiceNode`, which
       is the air shelf or the last key-EQ band rather than the panner -- and
       `detachVoice` knew about neither, so every note played with AIR up or on
       a kit key with its own EQ left its filters connected to the shared
       convolver for the life of the page. Unreachable from upstream, so silent,
       but still alive on the audio thread. */
		const tailNodes: AudioNode[] = [];
		if (!advOwnsVoice && track.airGain !== undefined && Math.abs(track.airGain) > 0.01) {
			const airFilter = ctx.createBiquadFilter();
			airFilter.type = 'highshelf';
			airFilter.frequency.setValueAtTime(10000, t);
			// ±8 dB, as the field declares. Unclamped, `airGain: 2` gave +16.
			airFilter.gain.setValueAtTime(Math.max(-1, Math.min(1, track.airGain)) * 8, t);
			chainOut.connect(airFilter);
			finalVoiceNode = airFilter;
			tailNodes.push(airFilter);
		}

		/* Node 7b: this key's own EQ, for a percussion track only.
		 *
		 * The six-band EQ above is per *track*, which a kit cannot use: one curve
		 * cannot serve a kick and a hi-hat, since they need opposite shaping. But
		 * matching a real drum needs more than the one filter a voice otherwise
		 * has -- a snare's spectrum dips at 2.5 kHz and rises again above it, and
		 * no single low-pass does that. `track` here is the merged timbre from
		 * effectiveTimbre(), so a key that carries keyEqGains gets its own chain,
		 * built beside the air shelf and torn down with the voice.
		 *
		 * Only when the key actually asks for it: percussion tracks are the only
		 * ones that set it, and a voice with no entry pays nothing.
		 */
		const keyEq = track.keyEqGains;
		if (keyEq && keyEq.some((g) => Math.abs(g) > 0.05)) {
			for (const [i, band] of EQ_6_BANDS.entries()) {
				const g = keyEq[i] ?? 0;
				if (Math.abs(g) <= 0.05) continue;
				const f = ctx.createBiquadFilter();
				f.type = i === 0 ? 'lowshelf' : i === EQ_6_BANDS.length - 1 ? 'highshelf' : 'peaking';
				f.frequency.setValueAtTime(band.freq, t);
				if (f.type === 'peaking') f.Q.setValueAtTime(1.0, t);
				f.gain.setValueAtTime(g, t);
				finalVoiceNode.connect(f);
				finalVoiceNode = f;
				tailNodes.push(f);
			}
		}

		// Route through this track's own EQ chain (delay/reverb sends tap pre-EQ).
		const busInput: AudioNode = this.trackBuses[track.id]?.input ?? this.masterBusIn ?? masterGain;

		if (panner) {
			finalVoiceNode.connect(panner);
			panner.connect(busInput);
			if (this.delayNode && this.delayMix > 0) panner.connect(this.delayNode);
			if (this.reverbConvolver && this.reverbMix > 0) finalVoiceNode.connect(this.reverbConvolver);
		} else {
			finalVoiceNode.connect(busInput);
			if (this.delayNode && this.delayMix > 0) finalVoiceNode.connect(this.delayNode);
			if (this.reverbConvolver && this.reverbMix > 0) finalVoiceNode.connect(this.reverbConvolver);
		}

		// The voice map lets held notes be released and stolen live, and lets
		// onended reap a finished voice's nodes in either context.
		{
			this.activeVoices.set(voiceKey, {
				osc1,
				osc2,
				noise: noiseSource,
				extras,
				noteIndex,
				filter,
				gain: gainNode,
				lfo,
				panNode: panner,
				tail: tailNodes,
				startTime: t,
				ampRel,
				vcfRel,
				baseCutoff,
				isContinuousHold,
				trackId,
				/* Which group this voice belongs to, so a later CUT can find it. Read
           from the ACT that fired for it, or the track field when there is no
           chain. */
				muteGroup: trackRow.percussion ? act.cutGroup : 0
			});
		}

		return voiceKey;
	}

	// Continuous Note On (from Keyboard / MIDI Controller)
	public noteOn(trackId: number, noteIndex: number, velocity: number = 64) {
		const key = `${trackId}-${noteIndex}`;
		// If existing held voice, release it first
		if (this.trackHeldVoices.has(key)) {
			this.noteOff(trackId, noteIndex);
		}

		/* No accent: the velocity is the dynamic here.
    
       This used to derive one from the velocity and pass both, which now that
       the two multiply would count the same strike twice -- a hard key press
       reading as a hard press *on a stressed step*. Accent is a property of the
       step in a written part, not of a key someone pressed. */
		// durationSec = 0 means hold until noteOff.
		const voiceKey = this.triggerTrackVoice(trackId, noteIndex, 0, undefined, 0, velocity);
		if (voiceKey) {
			this.trackHeldVoices.set(key, voiceKey);
		}
	}

	// Continuous Note Off (Release key)
	public noteOff(trackId: number, noteIndex: number) {
		const key = `${trackId}-${noteIndex}`;
		const voiceKey = this.trackHeldVoices.get(key);
		if (!voiceKey) return;
		this.trackHeldVoices.delete(key);

		if (this.isSustainPedalDown) {
			// Hold in sustained voice set until pedal releases
			this.sustainedVoiceKeys.add(voiceKey);
			return;
		}

		this.releaseVoice(voiceKey);
	}

	// Set Sustain Pedal (CC 64) State
	public setSustainPedal(down: boolean) {
		this.isSustainPedalDown = down;
		if (!down) {
			// Release all accumulated sustained voices whose keys are not still physically held
			this.sustainedVoiceKeys.forEach((vk) => {
				this.releaseVoice(vk);
			});
			this.sustainedVoiceKeys.clear();
		}
	}

	public isSustainActive(): boolean {
		return this.isSustainPedalDown;
	}

	public setVelocityCurve(curve: VelocityCurve) {
		this.velocityCurve = curve;
	}

	public getVelocityCurve(): VelocityCurve {
		return this.velocityCurve;
	}

	public cycleVelocityCurve(): VelocityCurve {
		const idx = VELOCITY_CURVES.indexOf(this.velocityCurve);
		const next = VELOCITY_CURVES[(idx + 1) % VELOCITY_CURVES.length];
		this.velocityCurve = next;
		return next;
	}

	private releaseVoice(voiceKey: string) {
		const voice = this.activeVoices.get(voiceKey);
		if (!voice) return;

		const ctx = soundEngine.init();
		if (!ctx) return;

		const now = ctx.currentTime;
		const { gain, filter, ampRel, vcfRel, baseCutoff, osc1, osc2, noise, lfo, extras } = voice;

		try {
			gain.gain.cancelScheduledValues(now);
			gain.gain.setValueAtTime(gain.gain.value, now);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.02, ampRel));

			filter.frequency.cancelScheduledValues(now);
			filter.frequency.setValueAtTime(filter.frequency.value, now);
			filter.frequency.exponentialRampToValueAtTime(baseCutoff, now + Math.max(0.02, vcfRel));

			const stopTime = now + Math.max(ampRel, vcfRel) + 0.05;
			if (osc1) osc1.stop(stopTime);
			if (osc2) osc2.stop(stopTime);
			if (noise) noise.stop(stopTime);
			for (const x of extras ?? []) x.stop(stopTime);
			if (lfo) lfo.stop(stopTime);

			const endSrc = voice.osc1 ?? voice.osc2 ?? voice.noise;
			if (endSrc) endSrc.onended = () => this.reapVoice(voiceKey);
			const cleanupMs = Math.ceil((stopTime - now) * 1000) + 50;
			window.setTimeout(() => this.reapVoice(voiceKey), cleanupMs);
		} catch {}
	}

	/**
	 * Cut a voice short because another one took its place.
	 *
	 * Not stopVoice: that ends everything at once, which on a ringing cymbal is a
	 * click rather than a choke. A few milliseconds of fade is inaudible as a
	 * fade and audible as the absence of a click, which is what a sampler's mute
	 * group has always done. The nodes are torn down after it, so a choked voice
	 * does not keep a graph alive.
	 */
	private chokeVoice(voiceKey: string, now: number, fadeSec = 0.006) {
		const voice = this.activeVoices.get(voiceKey);
		if (!voice) return;
		try {
			const g = voice.gain.gain;
			g.cancelScheduledValues(now);
			// From wherever it actually is, or the ramp starts by jumping.
			g.setValueAtTime(Math.max(0.0001, g.value), now);
			g.exponentialRampToValueAtTime(0.0001, now + fadeSec);
			g.linearRampToValueAtTime(0, now + fadeSec + 0.002);
			const end = now + fadeSec + 0.01;
			if (voice.osc1) voice.osc1.stop(end);
			if (voice.osc2) voice.osc2.stop(end);
			if (voice.noise) voice.noise.stop(end);
			for (const x of voice.extras ?? []) x.stop(end);
			if (voice.lfo) voice.lfo.stop(end);
		} catch {
			/* already stopped */
		}
		this.activeVoices.delete(voiceKey);
		this.forgetHeldVoice(voiceKey);
		/* Detach after the fade rather than during it.
    
       This used to re-look-up the voice by key, which the delete above had just
       removed -- so `reapVoice` returned at its own guard and the gain, filter
       and panner stayed connected to the track bus for the life of the session.
       It is the exact pile-up `reapVoice` exists to prevent, reintroduced
       through the choke path, and it fired on every mono and legato note.
    
       Hold the voice itself: it is the thing being torn down, and the map is
       only ever the way to find it. */
		setTimeout(() => this.detachVoice(voice), Math.ceil((fadeSec + 0.05) * 1000));
	}

	/**
	 * Which voice to take when one has to go.
	 *
	 * `voiceStealingMode` is a setting on the voice tab that had no reader: every
	 * steal took the oldest whatever it said. Map iteration order is insertion
	 * order, so the head of the list is the oldest either way -- the other two
	 * modes have to look at the voices themselves.
	 */
	private pickVictim(keys: string[]): string | undefined {
		if (!keys.length) return undefined;
		if (this.voiceStealingMode === 'oldest') return keys[0];
		let best = keys[0];
		let bestScore = Infinity;
		for (const k of keys) {
			const v = this.activeVoices.get(k);
			if (!v) continue;
			/* QUIETEST takes the one contributing least, which is the least missed.
         LOWEST takes the bottom note, which in a dense chord is the one whose
         absence changes the harmony least. */
			const score = this.voiceStealingMode === 'quietest' ? v.gain.gain.value : v.noteIndex;
			if (score < bestScore) {
				bestScore = score;
				best = k;
			}
		}
		return best;
	}

	/**
	 * Drop a dead voice from the held-key bookkeeping.
	 *
	 * `trackHeldVoices` maps a held key to the voice it started. A voice choked
	 * or stolen out from under a held key left its entry behind, so the map only
	 * ever grew on a MIDI keyboard, and a later note-off found a stale key and
	 * quietly did nothing. Whoever ends a voice forgets it here.
	 */
	private forgetHeldVoice(voiceKey: string) {
		for (const [key, v] of this.trackHeldVoices) {
			if (v === voiceKey) {
				this.trackHeldVoices.delete(key);
				break;
			}
		}
		this.sustainedVoiceKeys.delete(voiceKey);
	}

	/** Disconnect a voice's nodes. Safe to call more than once. */
	private detachVoice(voice: ActiveVoice) {
		try {
			voice.gain.disconnect();
			voice.filter.disconnect();
			voice.panNode?.disconnect();
			for (const n of voice.tail ?? []) n.disconnect();
		} catch {
			/* already detached */
		}
	}

	/**
	 * Walk the logic chain hanging off ENTRY, and say what this note should do.
	 *
	 * A patch says its rules as a chain rather than as a setting: ENTRY's TRIG
	 * goes to a WHEN, whose DO goes to an ACT. "When a note starts, if it is
	 * above C3, cut the others." The shape is Scratch's, and it reads left to
	 * right for the same reason.
	 *
	 * Only ENTRY -> WHEN -> ACT is walked; a chain is short by nature and the
	 * cost is paid once per note. A track with no graph falls back to its own
	 * fields, so nothing built before this stops working.
	 */
	/**
	 * Does a WHEN's test hold for this note?
	 *
	 * One predicate, consulted by both halves of the white wire. It was written
	 * only inside `noteActions`, so `execReach` -- which decides what *sounds* --
	 * took every branch unconditionally: a WHEN muted the right notes and let
	 * every note through, which is the two sides of one cable disagreeing.
	 */
	private whenHolds(
		params: Record<string, number>,
		id: string,
		noteIndex: number,
		trackId: number
	): boolean {
		const num = (key: string, def: number) => params[`${id}.${key}`] ?? def;
		const test = Math.round(num('test', 0));
		const at = Math.round(num('testNote', 48));
		if (test === 1) return noteIndex < at; // ABOVE: the roll counts downward
		if (test === 2) return noteIndex > at;
		if (test === 3) {
			/* "Is anything already sounding on this track?"
      
         Offline renders schedule every voice with explicit times and never hold
         anything in activeVoices, so the question has no answer there. It used
         to matter only for muting, where a false negative means one fewer
         choke; now that execution gates *sound*, answering false would drop
         every note behind a BUSY WHEN out of an export while the same patch
         played live. An unanswerable test passes: a rendered patch keeps what
         you heard. */
			if (this.renderCtx) return true;
			for (const v of this.activeVoices.values()) if (v.trackId === trackId) return true;
			return false;
		}
		return true;
	}

	private noteActions(
		track: TrackData,
		noteIndex: number,
		trackId: number
	): { cut: boolean; cutGroup: number; solo: boolean; fadeSec: number } {
		const none = { cut: false, cutGroup: 0, solo: false, fadeSec: 0.006 };
		const graph = track.advanced ? track.rackGraph : undefined;
		if (!graph?.nodes?.length) {
			// The old track-level fields, for a patch that has no chain.
			const mode = track.voiceMode ?? 'poly';
			return {
				...none,
				/* A mute group is its own reason to choke, independent of the voice
           mode. `cut` was `mode !== 'poly'` alone, so on a poly track -- which
           is what every K.MAP kit is -- the group was computed, stored on the
           voice, and never consulted: the closed hi-hat never stopped the open
           one, which is the whole reason the field exists. */
				cut: mode !== 'poly' || (track.muteGroup ?? 0) > 0,
				fadeSec: mode === 'legato' ? 0.04 : 0.006,
				cutGroup: track.muteGroup ?? 0
			};
		}

		const p = track.graphParams ?? {};
		const num = (id: string, key: string, def: number) => p[`${id}.${key}`] ?? def;
		const entry = graph.nodes.find((n) => n.type === 'in');
		if (!entry) return none;

		/* Follow the execution wire wherever it goes.
    
       This used to be hardcoded as ENTRY -> WHEN -> ACT, exactly two hops, so a
       SEQ anywhere in the chain silently dropped the rest of it: the walk found
       a node that was not a WHEN and gave up without a word. Worse, it
       disagreed with execReach, which traverses correctly -- so the audio side
       and the action side of the same patch reached different conclusions about
       the same white cable.
    
       WHEN is a branch: execution carries on out of it only when its test
       holds. Everything else passes execution straight through. */
		const out = { ...none };
		const execCables = graph.cables.filter(
			(c) => EXEC_PORT_IDS.has(c.toPort) && EXEC_PORT_IDS.has(c.fromPort)
		);

		const holds = (id: string) => this.whenHolds(p, id, noteIndex, trackId);

		const seen = new Set<string>([entry.id]);
		const queue = [entry.id];
		while (queue.length) {
			const id = queue.shift()!;
			for (const c of execCables) {
				if (c.from !== id || seen.has(c.to)) continue;
				const node = graph.nodes.find((n) => n.id === c.to);
				if (!node) continue;
				seen.add(node.id);

				if (node.type === 'when') {
					// A branch: the chain past it only runs when the answer is yes.
					if (holds(node.id)) queue.push(node.id);
					continue;
				}

				if (node.type === 'act') {
					const kind = Math.round(num(node.id, 'action', 0));
					const ms = num(node.id, 'actMs', 6);
					out.fadeSec = Math.max(0.001, ms / 1000);
					if (kind === 0) {
						out.cut = true;
						out.cutGroup = Math.round(num(node.id, 'actGroup', 0));
					} else if (kind === 1) {
						out.solo = true;
						out.cutGroup = Math.round(num(node.id, 'actGroup', 0));
					}
				}
				queue.push(node.id);
			}
		}
		return out;
	}

	public stopVoice(voiceKey: string) {
		const voice = this.activeVoices.get(voiceKey);
		if (!voice) return;
		/* A very short fade rather than a hard cut.
    
       This wrote `setValueAtTime(0.0001, 0)` -- absolute time zero, long past --
       and stopped every source at once, which is exactly the click `chokeVoice`
       exists to avoid. It is reached on the voice-stealing path, so it fires
       under the densest playing, where a click is most audible.
    
       2 ms is short enough that a stolen voice is gone before the new one
       speaks, and long enough that the step to silence is not a discontinuity. */
		const now = this.audioCtx()?.currentTime ?? 0;
		const end = now + 0.002;
		try {
			const g = voice.gain.gain;
			g.cancelScheduledValues(now);
			g.setValueAtTime(Math.max(0.0001, g.value), now);
			g.linearRampToValueAtTime(0, end);
			if (voice.osc1) voice.osc1.stop(end);
			if (voice.osc2) voice.osc2.stop(end);
			if (voice.noise) voice.noise.stop(end);
			for (const x of voice.extras ?? []) x.stop(end);
			if (voice.lfo) voice.lfo.stop(end);
		} catch {
			/* already stopped */
		}
		this.activeVoices.delete(voiceKey);
		this.forgetHeldVoice(voiceKey);
		setTimeout(() => this.detachVoice(voice), 60);
	}

	/**
	 * Fully detach a finished voice. Timers are throttled in background tabs
	 * (>=1s, down to once a minute), so relying on setTimeout alone left
	 * silent-but-still-connected gain/filter/pan nodes piling up on the bus
	 * during long unattended playback — the audio thread load grew until
	 * playback audibly glitched.
	 */
	private reapVoice(voiceKey: string) {
		const voice = this.activeVoices.get(voiceKey);
		if (!voice) return;
		this.activeVoices.delete(voiceKey);
		this.forgetHeldVoice(voiceKey);
		this.detachVoice(voice);
	}

	public stopAll() {
		this.trackHeldVoices.clear();
		this.sustainedVoiceKeys.clear();
		Array.from(this.activeVoices.keys()).forEach((k) => this.stopVoice(k));
	}

	/* -------------------------------------------------------------------------- */
	/*                     CLOSED-LOOP SEQUENCER ENGINE                           */
	/* -------------------------------------------------------------------------- */

	public subscribeStep(listener: (step: number) => void): () => void {
		this.onStepListeners.add(listener);
		return () => this.onStepListeners.delete(listener);
	}

	public subscribeNote(
		listener: (trackId: number, noteIndex: number, noteName: string, durationMs: number) => void
	): () => void {
		this.onNoteListeners.add(listener);
		return () => this.onNoteListeners.delete(listener);
	}

	public isPlayingSeq(): boolean {
		return this.isSequencerPlaying;
	}

	public toggleSequencer(fromStep?: number): boolean {
		if (this.isSequencerPlaying) {
			this.stopSequencer();
		} else {
			this.startSequencer(fromStep);
		}
		return this.isSequencerPlaying;
	}

	private lookaheadTimer: number | null = null;
	private uiTimer: number | null = null;
	private nextStepTime = 0;
	private scheduleAheadSec = 0.2; // 200ms lookahead — wider buffer against main thread jank
	private scheduledStepQueue: { step: number; time: number }[] = [];
	private lastAudibleStep: number = 0;
	/* ONCE mode: the scheduler stops booking steps after the last one and notes
     the audio-clock time the pattern ends; the UI tick sees that time pass,
     drops the timers, lets the last notes ring out and rewinds. */
	private loopMode = true;
	private endAtTime: number | null = null;
	private onEndedListeners: Set<() => void> = new Set();
	private _voiceSeq = 0; // monotonic voice counter — avoids Math.random() hot-path allocation

	public isLoopMode(): boolean {
		return this.loopMode;
	}

	public setLoopMode(loop: boolean) {
		this.loopMode = loop;
		if (loop) this.endAtTime = null;
	}

	public subscribeEnded(listener: () => void): () => void {
		this.onEndedListeners.add(listener);
		return () => this.onEndedListeners.delete(listener);
	}

	public startSequencer(fromStep?: number) {
		if (this.isSequencerPlaying) return;
		this.isSequencerPlaying = true;
		this.endAtTime = null;
		if (fromStep !== undefined && fromStep >= 0 && fromStep < this.totalSteps) {
			this.currentStep = fromStep;
			this.lastAudibleStep = fromStep;
		} else if (this.lastAudibleStep >= 0 && this.lastAudibleStep < this.totalSteps) {
			this.currentStep = this.lastAudibleStep;
		} else if (this.currentStep >= this.totalSteps) {
			this.currentStep = 0;
			this.lastAudibleStep = 0;
		}
		this.scheduledStepQueue = [];

		const ctx = soundEngine.init();
		if (ctx) {
			if (ctx.state === 'suspended') ctx.resume().catch(() => {});
			this.nextStepTime = ctx.currentTime + 0.05;
		} else {
			this.nextStepTime = 0;
		}

		this.startLookaheadTimers();
	}

	public setPlaybackStep(step: number) {
		const clamped = Math.max(0, Math.min(this.totalSteps - 1, step));
		this.currentStep = clamped;
		this.lastAudibleStep = clamped;
		this.scheduledStepQueue = [];
		const ctx = soundEngine.init();
		if (ctx) {
			this.nextStepTime = ctx.currentTime + 0.05;
		}
		this.onStepListeners.forEach((fn) => fn(this.currentStep));
	}

	public stopSequencer(cutVoices = true) {
		this.isSequencerPlaying = false;
		this.endAtTime = null;
		if (this.lookaheadTimer) {
			clearInterval(this.lookaheadTimer);
			this.lookaheadTimer = null;
		}
		if (this.uiTimer) {
			clearInterval(this.uiTimer);
			this.uiTimer = null;
		}
		/* Resume where the music actually got to.
    
       `lastAudibleStep` is only advanced by `checkUIQueue` once a step's time
       has passed, while the scheduler has already *sounded* up to a window
       beyond it -- so restarting replayed everything in between: up to 200 ms
       of material in the foreground, and up to 1.6 s while hidden. The right
       step is the last one whose start time the clock has reached, which is
       what the queue holds. */
		const now = this.audioCtx()?.currentTime ?? 0;
		let resumeAt = this.lastAudibleStep;
		for (const entry of this.scheduledStepQueue) {
			if (entry.time <= now) resumeAt = entry.step;
			else break;
		}
		this.currentStep = resumeAt;
		this.lastAudibleStep = resumeAt;
		this.scheduledStepQueue = [];
		/* A natural end in ONCE mode leaves the tails to ring; a STOP cuts them.
    
       The held-key bookkeeping goes either way. `stopAll` is what clears it, so
       the natural end left a key held at the end of a pattern mapped to a voice
       forever -- and the sustain pedal latched down across every stop. Neither
       is about whether the tails ring. */
		if (cutVoices) this.stopAll();
		else {
			this.trackHeldVoices.clear();
			this.sustainedVoiceKeys.clear();
		}
		this.isSustainPedalDown = false;
	}

	private restartSequencerTimer() {
		if (this.isSequencerPlaying) {
			this.startLookaheadTimers();
		}
	}

	private startLookaheadTimers() {
		if (this.lookaheadTimer) clearInterval(this.lookaheadTimer);
		if (this.uiTimer) clearInterval(this.uiTimer);

		// Audio thread scheduling lookahead (runs every 40ms — 200ms buffer is ample)
		this.lookaheadTimer = window.setInterval(() => {
			this.schedulerLoop();
		}, 40);

		// UI sync loop (runs every 16ms to update playhead position)
		this.uiTimer = window.setInterval(() => {
			this.checkUIQueue();
		}, 16);
	}

	/** Seconds the current pattern occupies at the current tempo. */
	public getPatternSeconds(): number {
		return (this.totalSteps * 60) / this.bpm / STEPS_PER_BEAT;
	}

	/** The node cache that belongs to one AudioContext and cannot outlive it. */
	private graphCache() {
		return {
			/* Which context these nodes belong to. Held with them because that is
         what makes them valid: a node cannot connect across contexts. */
			masterFXCtx: this.masterFXCtx as BaseAudioContext | null,
			masterLimiter: this.masterLimiter,
			noiseBuffer: this.noiseBuffer,
			metalBuffer: this.metalBuffer,
			delayNode: this.delayNode,
			delayFeedbackGain: this.delayFeedbackGain,
			delayWetGain: this.delayWetGain,
			reverbConvolver: this.reverbConvolver,
			reverbWetGain: this.reverbWetGain,
			waveShaper: this.waveShaper,
			shaperIn: this.shaperIn,
			shaperBypass: this.shaperBypass,
			masterBusIn: this.masterBusIn,
			trackBuses: this.trackBuses
		};
	}

	private restoreGraphCache(cache: ReturnType<ModularSynth['graphCache']>) {
		this.masterLimiter = cache.masterLimiter;
		this.noiseBuffer = cache.noiseBuffer;
		this.metalBuffer = cache.metalBuffer;
		this.delayNode = cache.delayNode;
		this.delayFeedbackGain = cache.delayFeedbackGain;
		this.delayWetGain = cache.delayWetGain;
		this.reverbConvolver = cache.reverbConvolver;
		this.reverbWetGain = cache.reverbWetGain;
		this.waveShaper = cache.waveShaper;
		this.shaperIn = cache.shaperIn;
		this.shaperBypass = cache.shaperBypass;
		this.masterBusIn = cache.masterBusIn;
		this.trackBuses = cache.trackBuses;
		/* The chain and the context it belongs to travel together. Restoring the
       live chain after a render has to restore *its* context too, or the guard
       in `initMasterFX` would take the offline one for the live one's. */
		this.masterFXCtx = cache.masterFXCtx ?? null;
	}

	private clearGraphCache() {
		this.restoreGraphCache({
			masterFXCtx: null,
			masterLimiter: null,
			noiseBuffer: null,
			metalBuffer: null,
			delayNode: null,
			delayFeedbackGain: null,
			delayWetGain: null,
			reverbConvolver: null,
			reverbWetGain: null,
			waveShaper: null,
			shaperIn: null,
			shaperBypass: null,
			masterBusIn: null,
			trackBuses: []
		});
	}

	/**
	 * Render the whole pattern through this exact signal chain into an
	 * AudioBuffer. The live node graph is set aside and put back afterwards, so
	 * playback and the visualizers are unaffected. Unlike a MediaRecorder
	 * capture this carries no scheduling jitter, ends exactly on the pattern,
	 * and does not require listening to the song in real time — but it is not
	 * necessarily quicker: a dense multi-minute pattern can render slower than
	 * it plays, which is why progress is reported.
	 */
	public async renderOffline(
		options: {
			sampleRate?: number;
			tailSeconds?: number;
			/** Called with 'schedule' | 'render' and a 0..1 fraction. */
			onProgress?: (phase: 'schedule' | 'render', fraction: number) => void;
		} = {}
	): Promise<AudioBuffer> {
		if (typeof OfflineAudioContext === 'undefined')
			throw new Error(tr('synth.render.offlineUnavailable'));
		if (this.renderCtx) throw new Error(tr('synth.render.alreadyRunning'));

		const sampleRate = options.sampleRate ?? 48000;
		// Long releases and the delay/reverb tails need room past the last step.
		const tailSeconds = options.tailSeconds ?? 2.5;
		const stepDuration = 60 / this.bpm / STEPS_PER_BEAT;
		const seconds = this.getPatternSeconds() + tailSeconds;
		const frames = Math.ceil(seconds * sampleRate);
		const offline = new OfflineAudioContext(2, frames, sampleRate);

		const live = this.graphCache();
		const liveVoiceKeys = new Set(this.activeVoices.keys());
		this.renderCtx = offline;
		this.clearGraphCache();
		try {
			const ctx = offline as unknown as AudioContext;
			this.regenerateNoiseBuffer();
			this.initMasterFX(ctx);
			// initMasterFX already filled a 1.8s/0.6 impulse. Regenerating is only
			// worth 264k iterations when the settings ask for something other than
			// that default.
			if (this.reverbDuration !== 1.8 || this.reverbDecayRate !== 0.6) {
				this.regenerateReverbBuffer();
			}

			// Voices are built a second of audio at a time, at suspend checkpoints
			// the renderer stops on. Building them all up front put every voice of
			// the song into the graph at once -- tens of thousands of nodes for a
			// dense tune -- and the renderer paid for all of them on every quantum,
			// so a four-minute song took minutes and the tab froze. With chunks,
			// only the voices of the current second (plus their tails, until
			// onended reaps them) are live.
			const chunkSteps = Math.max(1, Math.round(1.0 / stepDuration));
			const scheduleRange = (from: number, to: number) => {
				for (let step = from; step < Math.min(to, this.totalSteps); step++) {
					this.scheduleStepAudio(step, step * stepDuration);
				}
			};
			scheduleRange(0, chunkSteps);
			options.onProgress?.('schedule', 1);
			for (let from = chunkSteps; from < this.totalSteps; from += chunkSteps) {
				const at = from * stepDuration;
				void offline
					.suspend(at)
					.then(() => {
						scheduleRange(from, from + chunkSteps);
						options.onProgress?.('render', at / seconds);
						void offline.resume();
					})
					.catch(() => {
						/* a checkpoint past the buffer, or an aborted render — ignore */
					});
			}

			const buffer = await offline.startRendering();
			options.onProgress?.('render', 1);
			return buffer;
		} finally {
			// Voices whose tails ran past the buffer never fired onended; drop their
			// entries so the live voice-stealing guard does not count offline nodes.
			for (const k of Array.from(this.activeVoices.keys())) {
				if (!liveVoiceKeys.has(k)) this.activeVoices.delete(k);
			}
			this.renderCtx = null;
			this.renderMaster = null;
			this.restoreGraphCache(live);
		}
	}

	private schedulerLoop() {
		if (!this.isSequencerPlaying) return;
		/* A render owns the engine while it runs.
    
       `audioCtx()` hands back the offline context, and `renderOffline` swaps the
       graph cache out from under the live one -- but it never stopped this
       timer, so a step scheduled mid-export was built into the *offline* graph
       at live-clock times and baked into the WAV. The same held for anything
       else that makes a voice: a key pressed, a roll note auditioned, a MIDI
       note arriving. Playback stands still for the length of the render and
       picks up where it was. */
		if (this.renderCtx) return;
		const ctx = soundEngine.init();
		if (!ctx) return;
		if (ctx.state === 'suspended') ctx.resume().catch(() => {});

		const stepDuration = 60 / this.bpm / STEPS_PER_BEAT; // one grid step (1/24 beat)

		// Background tabs clamp setInterval to >=1s — 200ms of lookahead cannot
		// bridge that, so widen the window while hidden to keep playback gapless.
		const aheadSec =
			typeof document !== 'undefined' && document.hidden ? 1.6 : this.scheduleAheadSec;

		if (this.endAtTime !== null) return;

		/* A tab hidden past five minutes is clamped to one tick a *minute*, which
       no lookahead window bridges. `nextStepTime` only ever moves forward by a
       step, so once it falls behind the clock it stays behind: every later note
       is booked in the past, `triggerTrackVoice` floors them all to
       `currentTime`, and the whole backlog fires at once on unhide -- 2880
       steps and 30 voices in one blocking pass, of which the 64-voice guard
       keeps the last few.
    
       Falling more than a window behind is not lateness, it is a gap. Rebase to
       now and carry on from the step we are actually at; the time that passed
       was time the tab was not making sound anyway. */
		if (this.nextStepTime < ctx.currentTime - aheadSec) {
			const missed = Math.round((ctx.currentTime - this.nextStepTime) / stepDuration);
			this.nextStepTime = ctx.currentTime;
			this.currentStep = (this.currentStep + missed) % this.totalSteps;
			this.scheduledStepQueue.length = 0;
			this.lastAudibleStep = this.currentStep;
		}

		/* One window's worth, and no more. Without a bound this loop is however
       many steps fit in the gap since it last ran. */
		const maxSteps = Math.ceil(aheadSec / stepDuration) + 2;
		let booked = 0;
		while (this.nextStepTime < ctx.currentTime + aheadSec && booked++ < maxSteps) {
			this.scheduleStepAudio(this.currentStep, this.nextStepTime);
			this.scheduledStepQueue.push({ step: this.currentStep, time: this.nextStepTime });
			this.nextStepTime += stepDuration;
			if (!this.loopMode && this.currentStep === this.totalSteps - 1) {
				this.endAtTime = this.nextStepTime;
				break;
			}
			this.currentStep = (this.currentStep + 1) % this.totalSteps;
		}
	}

	private scheduleStepAudio(step: number, time: number) {
		const hasSolo = this.tracks.some((t) => t.solo);
		const stepDuration = 60 / this.bpm / STEPS_PER_BEAT; // one grid step (1/24 beat) in seconds

		this.tracks.forEach((track) => {
			if (track.muted) return;
			if (hasSolo && !track.solo) return;

			const stepNotes = track.grid[step] || [];
			const prevStep = (step - 1 + this.totalSteps) % this.totalSteps;
			const prevStepNotes = track.grid[prevStep] || [];
			/* Velocity comes from the lane now, not the accent row.
      
         A lane holds 0..1 per step and falls back to its own default where
         nothing was drawn, so a track nobody has touched plays at a normal
         level rather than silently. The bundled songs still carry accents;
         readTrackVelocity folds those in so they sound as written. */
			const vel = this.trackVelocityAt(track, step);

			stepNotes.forEach((noteIdx) => {
				if (noteIdx !== null && noteIdx !== undefined && PIANO_ROLL_NOTES[noteIdx]) {
					/* Already ringing on the previous step: a continuation, not a new
             note, so do not re-attack it.
          
             `prevStep` wraps to the last step of the pattern, and `step > 0`
             threw that wrap away -- so a note held across the loop point got a
             fresh attack and an envelope restart on every lap, where the same
             note held anywhere else in the pattern rings through. Only in LOOP
             mode: played once, the pattern's first step is a beginning. */
					const wrapped = step === 0 && this.loopMode;
					/* At the wrap, a note on the last step only continues if it has been
             ringing into it -- otherwise the last step is itself an attack, and
             suppressing step 0 would silence the note on every lap instead of
             re-attacking it on every lap. Look one further back to tell them
             apart. */
					const heldIntoWrap =
						wrapped &&
						(track.grid[(this.totalSteps - 2 + this.totalSteps) % this.totalSteps] || []).includes(
							noteIdx
						);
					if ((step > 0 || heldIntoWrap) && prevStepNotes.includes(noteIdx)) {
						return;
					}

					/* Measure note duration across consecutive steps.
          
             In LOOP mode the run continues past the end of the pattern and on
             into the next lap, because the step after the last one is step 0.
             Stopping at `totalSteps` booked a duration that expired exactly at
             the loop point while `heldIntoWrap` suppressed step 0's re-attack --
             so a note written across the boundary was audible up to it and then
             silent for the rest of its length, on every lap. Bounded by the
             pattern so a row that is held all the way round cannot spin. */
					let durSteps = 1;
					const maxRun = this.loopMode ? this.totalSteps : this.totalSteps - step;
					while (
						durSteps < maxRun &&
						track.grid[(step + durSteps) % this.totalSteps]?.includes(noteIdx)
					) {
						durSteps++;
					}
					const noteHoldSec = durSteps * stepDuration;

					/* The accent goes through as itself, not folded away.
          
             `trackVelocityAt` already raises the velocity of an accented step,
             which is what carries its *level*. But accent also opens the filter
             and drives any `velocity ->` route in the mod matrix, and those read
             `accentLevel`, not velocity. Passing 0 here left both of them dead
             on every note the sequencer has ever played. */
					const stepAccent = Number(track.accents?.[step] ?? 0);
					this.triggerTrackVoice(track.id, noteIdx, stepAccent, time, noteHoldSec, vel, vel);
				}
			});
		});
	}

	private checkUIQueue() {
		if (!this.isSequencerPlaying) return;
		const ctx = soundEngine.init();
		if (!ctx) return;

		const currentTime = ctx.currentTime;
		let latestStep: number | null = null;

		while (this.scheduledStepQueue.length > 0 && this.scheduledStepQueue[0].time <= currentTime) {
			const current = this.scheduledStepQueue.shift();
			if (current) {
				latestStep = current.step;
			}
		}

		if (latestStep !== null) {
			this.lastAudibleStep = latestStep;
			this.onStepListeners.forEach((fn) => fn(latestStep!));
		}

		if (this.endAtTime !== null && currentTime >= this.endAtTime) {
			this.stopSequencer(false);
			this.currentStep = 0;
			this.lastAudibleStep = 0;
			this.onStepListeners.forEach((fn) => fn(0));
			this.onEndedListeners.forEach((fn) => fn());
		}
	}
}

export const modularSynth = new ModularSynth();
