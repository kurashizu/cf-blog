/**
 * What a track is, and the vocabulary a track is written in.
 *
 * Waveforms, the note grid and its divisions, time signatures, the EQ band
 * table, TrackData itself and the helpers that make and pad one. No Web Audio,
 * no context, no engine -- these are the shapes that a saved file, the piano
 * roll, the stores and the six built-in songs all have to agree on, and they
 * are needed long before anything makes a sound.
 *
 * Split out of synth.ts, which held them above a 4,900-line class. That made
 * `import type { TrackData } from '../synth'` -- which is the *only* thing
 * every song file wants -- drag the whole Web Audio engine into the module
 * graph behind 1.5 MB of note data. It also meant the stores imported upward
 * into the file that imports them, since 17 of them reach into `../synth` for
 * exactly this vocabulary.
 *
 * synth.ts re-exports all of it, so no existing import path changed.
 */

import type { NoteLane } from './stores/note-lanes';

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

/* INITIAL_TRACKS stays in synth.ts: it is the one thing here that needs an
   actual song, and importing one back would put the song data this split
   exists to decouple straight back into the graph. */

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
