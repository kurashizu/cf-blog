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
  | 'sawtooth' | 'square' | 'sine' | 'triangle' | 'noise'
  | 'metal' | 'pwm' | 'supersaw' | 'organ' | 'fold'
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
  pwmWidth?: number;   // 5..95 %, the duty cycle the sweep centres on
  pwmRate?: number;    // 0.1..10 Hz
  pwmDepth?: number;   // 0..100 %, how far the width sweeps
  ssawSpread?: number; // 0..50 cents, the outer saws' detune
  ssawMix?: number;    // 0..100 %, companions against the centre saw
  foldAmt?: number;    // 1..8, drive into the folder
  org1?: number; org2?: number; org3?: number; org4?: number; org5?: number; org8?: number; // drawbars 0..8
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
    { key: 'pwmWidth', label: 'PW', min: 5, max: 95, step: 5, unit: '%', def: 50, hint: 'Duty cycle the sweep centres on' },
    { key: 'pwmRate', label: 'RATE', min: 0.1, max: 10, step: 0.1, unit: 'Hz', def: 0.4, hint: 'How fast the width sweeps' },
    { key: 'pwmDepth', label: 'DPTH', min: 0, max: 100, step: 5, unit: '%', def: 40, hint: 'How far the width sweeps either side of WIDTH; 0 = a fixed pulse' }
  ],
  supersaw: [
    { key: 'ssawSpread', label: 'SPRD', min: 0, max: 50, step: 1, unit: 'c', def: 19, hint: 'Detune of the outer saws, in cents; the inner pair sits at half' },
    { key: 'ssawMix', label: 'MIX', min: 0, max: 100, step: 5, unit: '%', def: 60, hint: 'Level of the four companion saws against the centre one' }
  ],
  organ: [
    { key: 'org1', label: 'H1', min: 0, max: 8, step: 1, unit: '', def: 8, hint: 'Fundamental drawbar' },
    { key: 'org2', label: 'H2', min: 0, max: 8, step: 1, unit: '', def: 6, hint: 'Octave drawbar' },
    { key: 'org3', label: 'H3', min: 0, max: 8, step: 1, unit: '', def: 4, hint: 'Twelfth drawbar (3rd harmonic)' },
    { key: 'org4', label: 'H4', min: 0, max: 8, step: 1, unit: '', def: 4, hint: 'Two-octave drawbar' },
    { key: 'org5', label: 'H5', min: 0, max: 8, step: 1, unit: '', def: 2, hint: 'Seventeenth drawbar (5th harmonic)' },
    { key: 'org8', label: 'H8', min: 0, max: 8, step: 1, unit: '', def: 2, hint: 'Three-octave drawbar' }
  ],
  fold: [{ key: 'foldAmt', label: 'FOLD', min: 1, max: 8, step: 0.2, unit: 'x', def: 2.6, hint: 'Drive into the folder; more folds, brighter' }]
};
const WAVE_PARAM_DEFAULTS: Record<keyof WaveParams, number> = Object.fromEntries(
  Object.values(WAVE_PARAM_SPECS).flatMap((a) => a ?? []).map((sp) => [sp.key, sp.def])
) as Record<keyof WaveParams, number>;
export function waveParam(p: WaveParams | undefined, key: keyof WaveParams): number {
  return p?.[key] ?? WAVE_PARAM_DEFAULTS[key];
}

// ISO 226 / Fletcher-Munson Perceptual Equal Loudness Normalization Scale
// Compares harmonic rich waveforms (Square/Saw) against pure fundamental tones (Sine/Triangle)
export function getWaveformPerceptualScale(w: SynthWaveform): number {
  switch (w) {
    case 'sine': return 1.18;      // Pure sine fundamental boost (+1.4dB)
    case 'triangle': return 1.05;  // Triangle mostly fundamental (+0.4dB)
    case 'sawtooth': return 0.82;  // Sawtooth all harmonics (-1.7dB)
    case 'square': return 0.74;    // Square odd harmonics concentrated in 2-4kHz (-2.6dB)
    // Noise used to be scaled 0.70 like a sustained wave; it is only ever a
    // hit, and the ear reads a 50 ms burst as quieter still, so it sits at 1.
    case 'noise': return 1.0;
    case 'metal': return 0.9;
    case 'pwm': return 0.74;
    case 'supersaw': return 0.8;
    case 'organ': return 1.0;
    case 'fold': return 0.95;
    default: return 0.85;           // drawn tables
  }
}

export function getWaveformAbbr(w: SynthWaveform): string {
  switch (w) {
    case 'sawtooth': return 'SAW';
    case 'square': return 'SQR';
    case 'sine': return 'SIN';
    case 'triangle': return 'TRI';
    case 'noise': return 'NOI';
    case 'metal': return 'MTL';
    case 'pwm': return 'PWM';
    case 'supersaw': return 'SSAW';
    case 'organ': return 'ORG';
    case 'fold': return 'FOLD';
    default: return w.startsWith('custom:') ? 'USR' : String(w).toUpperCase().slice(0, 3);
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
    case '4': return 96;  // Whole note: 4 beats
    case '2': return 48;  // Half note: 2 beats
    case '1': return 24;  // Quarter note: 1 beat
    case '1/2': return 12;// Eighth note
    case '1/3': return 8; // Quarter-note triplet third
    case '1/4': return 6; // Sixteenth note
    case '1/6': return 4; // Eighth-note triplet third (swung 16th)
    case '1/8': return 3; // 32nd note
    case '1/12': return 2;// Sixteenth-note triplet third
    default: return 3;
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
  { id: 5, label: '12k', freq: 12000, type: 'highshelf', color: '#98c379' },
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
  stepsPerBar: number;      // total 1/24-beat steps per measure
  downbeatInterval: number; // steps per primary beat
}

export const METER_SPECS: Record<TimeSignature, MeterSpec> = {
  '4/4': { sig: '4/4', label: '4/4', name: '4/4 Common Time', beatsPerBar: 4, colsPerBar: 16, colsPerBeat: 4, stepsPerBar: 96, downbeatInterval: 24 },
  '3/4': { sig: '3/4', label: '3/4', name: '3/4 Waltz Time', beatsPerBar: 3, colsPerBar: 12, colsPerBeat: 4, stepsPerBar: 72, downbeatInterval: 24 },
  '2/4': { sig: '2/4', label: '2/4', name: '2/4 March Time', beatsPerBar: 2, colsPerBar: 8, colsPerBeat: 4, stepsPerBar: 48, downbeatInterval: 24 },
  '5/4': { sig: '5/4', label: '5/4', name: '5/4 Odd Meter', beatsPerBar: 5, colsPerBar: 20, colsPerBeat: 4, stepsPerBar: 120, downbeatInterval: 24 },
  '6/8': { sig: '6/8', label: '6/8', name: '6/8 Compound Time', beatsPerBar: 6, colsPerBar: 12, colsPerBeat: 2, stepsPerBar: 72, downbeatInterval: 12 },
  '7/8': { sig: '7/8', label: '7/8', name: '7/8 Complex Time', beatsPerBar: 7, colsPerBar: 14, colsPerBeat: 2, stepsPerBar: 84, downbeatInterval: 12 },
};

export interface TrackData {
  id: number;
  name: string;
  color: string;
  volume: number;       // 0.0 to 1.0 (Master voice level)
  pan: number;          // -1.0 to +1.0
  muted: boolean;
  solo: boolean;

  // Node 1: Dual Input Waveform Generators
  osc1Waveform: SynthWaveform;
  osc1Gain: number;     // 0.0 to 1.0
  osc2Waveform: SynthWaveform;
  osc2Gain: number;     // 0.0 to 1.0
  osc2Ratio: number;    // 0.5, 1, 1.5, 2, 3, 4
  detuneCents: number;  // -50 to +50 cents
  phaseOffset: number;  // 0 to 360 degrees
  osc2Semitone: number; // -24 to +24 semitones (OSC2 transpose)
  pulseWidth: number;   // 5 to 95 percent (square wave duty cycle)
  waveParams?: WaveParams; // knobs of the ADVANCED waves; see WAVE_PARAM_SPECS
  subOscGain: number;   // 0.0 to 1.0 (sub-oscillator one octave below)
  noiseGain: number;    // 0.0 to 1.0 (noise generator mix level)
  noiseRetrig?: number;    // 1 to 4 bursts per hit -- the 808 clap's stutter; 1 = plain noise
  noiseRetrigGap?: number; // 5 to 40 ms between bursts

  // Node 2: Timbre Fusion Node
  blendMode: BlendMode; // 'layer' | 'fm' | 'ring' | 'sync'
  morphAmount: number;  // 0.0 to 1.0 (Blend / FM modulation depth)
  glideTime?: number;   // 0 to 300ms (Portamento / Glide slide time)
  xfade?: number;       // 0.0 to 1.0 (OSC1 to OSC2 Crossfade Balance, default 0.5)

  // Node 3: Multi-Mode VCF Resonant Filter Node
  filterType: FilterType; // 'lowpass' | 'bandpass' | 'highpass' | 'notch'
  cutoff: number;       // 40Hz to 14000Hz
  resonance: number;    // 0.1 to 16.0
  envFilterMod: number; // 0.0 to 1.0 (Envelope to VCF cutoff sweep)
  keyTracking?: number; // 0.0 to 1.0 (Keyboard Pitch to Cutoff Tracking)

  // Node 4: Envelope & LFO Modulation Matrix
  attack: number;       // 0.005 to 1.2s (legacy / ampAttack alias)
  decay: number;        // 0.01 to 1.5s
  sustain: number;      // 0.0 to 1.0
  release: number;      // 0.01 to 2.5s

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
  lfoRate: number;         // 0.1 to 20.0 Hz
  lfoPitchAmt?: number;    // 0.0 to 1.0 (Vibrato / Pitch modulation depth)
  lfoCutoffAmt?: number;   // 0.0 to 1.0 (Wah / Filter sweep modulation depth)
  lfoPanAmt?: number;      // 0.0 to 1.0 (Auto-Pan modulation depth)
  lfoAmpAmt?: number;      // 0.0 to 1.0 (Tremolo / Amplitude modulation depth)
  lfoFadeTime?: number;    // 0 to 2000 ms (LFO Fade-in attack delay)
  lfoDepth?: number;       // legacy alias
  lfoTarget?: LfoTarget;   // legacy alias

  // Node 6: Per-Track 6-Band Graphic EQ (gains in dB for EQ_6_BANDS, default flat & off)
  eqOn?: boolean;
  eqGains?: number[];

  // Node 7: Master Output Channel Strip
  airGain?: number;        // -1.0 to +1.0 (Air Shelf EQ / Tone Shaping, ±8dB at 10kHz)

  // Sidechain ducking (7.OUT): this track dips whenever the source track fires a note.
  duckSource?: number;     // source track id, -1 = off
  duckKeys?: number[];     // only these note indices on the source trigger it; empty = any key
  duckDepth?: number;      // 0.0 to 1.0 -- how far the track dips (1 = to silence)
  duckDip?: number;        // ms to reach the floor
  duckHold?: number;       // ms held at the floor
  duckRelease?: number;    // ms back to unity

  // Modular Modulation Matrix Routing (Optional legacy support)
  modRoutes?: ModRoute[];

  /* Percussion mode: every key can carry its own sound. keyTimbres is sparse --
     a key with no entry plays the track's own timbre -- and each entry holds
     only the fields that differ, so a kit of eight sounds stays small in a
     patch or a share link. Off, the table is kept but ignored. */
  percussion?: boolean;
  keyTimbres?: Record<number, Partial<TrackData>>;

  // Sequencer Grid (Polyphonic: array of note indices per step, up to 8 notes) & Accents (0 = Off, 1 = +3dB, 2 = +6dB)
  grid: number[][];
  accents: (number | boolean)[];
}

export const PIANO_ROLL_NOTES = [
  { note: 'C8', freq: 4186.01, isBlack: false, oct: 8 },  // 0
  { note: 'B7', freq: 3951.07, isBlack: false, oct: 7 },  // 1
  { note: 'A#7', freq: 3729.31, isBlack: true, oct: 7 },  // 2
  { note: 'A7', freq: 3520.0, isBlack: false, oct: 7 },  // 3
  { note: 'G#7', freq: 3322.44, isBlack: true, oct: 7 },  // 4
  { note: 'G7', freq: 3135.96, isBlack: false, oct: 7 },  // 5
  { note: 'F#7', freq: 2959.96, isBlack: true, oct: 7 },  // 6
  { note: 'F7', freq: 2793.83, isBlack: false, oct: 7 },  // 7
  { note: 'E7', freq: 2637.02, isBlack: false, oct: 7 },  // 8
  { note: 'D#7', freq: 2489.02, isBlack: true, oct: 7 },  // 9
  { note: 'D7', freq: 2349.32, isBlack: false, oct: 7 },  // 10
  { note: 'C#7', freq: 2217.46, isBlack: true, oct: 7 },  // 11
  { note: 'C7', freq: 2093.0, isBlack: false, oct: 7 },  // 12
  { note: 'B6', freq: 1975.53, isBlack: false, oct: 6 },  // 13
  { note: 'A#6', freq: 1864.66, isBlack: true, oct: 6 },  // 14
  { note: 'A6', freq: 1760.0, isBlack: false, oct: 6 },  // 15
  { note: 'G#6', freq: 1661.22, isBlack: true, oct: 6 },  // 16
  { note: 'G6', freq: 1567.98, isBlack: false, oct: 6 },  // 17
  { note: 'F#6', freq: 1479.98, isBlack: true, oct: 6 },  // 18
  { note: 'F6', freq: 1396.91, isBlack: false, oct: 6 },  // 19
  { note: 'E6', freq: 1318.51, isBlack: false, oct: 6 },  // 20
  { note: 'D#6', freq: 1244.51, isBlack: true, oct: 6 },  // 21
  { note: 'D6', freq: 1174.66, isBlack: false, oct: 6 },  // 22
  { note: 'C#6', freq: 1108.73, isBlack: true, oct: 6 },  // 23
  { note: 'C6', freq: 1046.5, isBlack: false, oct: 6 },  // 24
  { note: 'B5', freq: 987.77, isBlack: false, oct: 5 },  // 25
  { note: 'A#5', freq: 932.33, isBlack: true, oct: 5 },  // 26
  { note: 'A5', freq: 880.0, isBlack: false, oct: 5 },  // 27
  { note: 'G#5', freq: 830.61, isBlack: true, oct: 5 },  // 28
  { note: 'G5', freq: 783.99, isBlack: false, oct: 5 },  // 29
  { note: 'F#5', freq: 739.99, isBlack: true, oct: 5 },  // 30
  { note: 'F5', freq: 698.46, isBlack: false, oct: 5 },  // 31
  { note: 'E5', freq: 659.26, isBlack: false, oct: 5 },  // 32
  { note: 'D#5', freq: 622.25, isBlack: true, oct: 5 },  // 33
  { note: 'D5', freq: 587.33, isBlack: false, oct: 5 },  // 34
  { note: 'C#5', freq: 554.37, isBlack: true, oct: 5 },  // 35
  { note: 'C5', freq: 523.25, isBlack: false, oct: 5 },  // 36
  { note: 'B4', freq: 493.88, isBlack: false, oct: 4 },  // 37
  { note: 'A#4', freq: 466.16, isBlack: true, oct: 4 },  // 38
  { note: 'A4', freq: 440.0, isBlack: false, oct: 4 },  // 39
  { note: 'G#4', freq: 415.3, isBlack: true, oct: 4 },  // 40
  { note: 'G4', freq: 392.0, isBlack: false, oct: 4 },  // 41
  { note: 'F#4', freq: 369.99, isBlack: true, oct: 4 },  // 42
  { note: 'F4', freq: 349.23, isBlack: false, oct: 4 },  // 43
  { note: 'E4', freq: 329.63, isBlack: false, oct: 4 },  // 44
  { note: 'D#4', freq: 311.13, isBlack: true, oct: 4 },  // 45
  { note: 'D4', freq: 293.66, isBlack: false, oct: 4 },  // 46
  { note: 'C#4', freq: 277.18, isBlack: true, oct: 4 },  // 47
  { note: 'C4', freq: 261.63, isBlack: false, oct: 4 },  // 48
  { note: 'B3', freq: 246.94, isBlack: false, oct: 3 },  // 49
  { note: 'A#3', freq: 233.08, isBlack: true, oct: 3 },  // 50
  { note: 'A3', freq: 220.0, isBlack: false, oct: 3 },  // 51
  { note: 'G#3', freq: 207.65, isBlack: true, oct: 3 },  // 52
  { note: 'G3', freq: 196.0, isBlack: false, oct: 3 },  // 53
  { note: 'F#3', freq: 185.0, isBlack: true, oct: 3 },  // 54
  { note: 'F3', freq: 174.61, isBlack: false, oct: 3 },  // 55
  { note: 'E3', freq: 164.81, isBlack: false, oct: 3 },  // 56
  { note: 'D#3', freq: 155.56, isBlack: true, oct: 3 },  // 57
  { note: 'D3', freq: 146.83, isBlack: false, oct: 3 },  // 58
  { note: 'C#3', freq: 138.59, isBlack: true, oct: 3 },  // 59
  { note: 'C3', freq: 130.81, isBlack: false, oct: 3 },  // 60
  { note: 'B2', freq: 123.47, isBlack: false, oct: 2 },  // 61
  { note: 'A#2', freq: 116.54, isBlack: true, oct: 2 },  // 62
  { note: 'A2', freq: 110.0, isBlack: false, oct: 2 },  // 63
  { note: 'G#2', freq: 103.83, isBlack: true, oct: 2 },  // 64
  { note: 'G2', freq: 98.0, isBlack: false, oct: 2 },  // 65
  { note: 'F#2', freq: 92.5, isBlack: true, oct: 2 },  // 66
  { note: 'F2', freq: 87.31, isBlack: false, oct: 2 },  // 67
  { note: 'E2', freq: 82.41, isBlack: false, oct: 2 },  // 68
  { note: 'D#2', freq: 77.78, isBlack: true, oct: 2 },  // 69
  { note: 'D2', freq: 73.42, isBlack: false, oct: 2 },  // 70
  { note: 'C#2', freq: 69.3, isBlack: true, oct: 2 },  // 71
  { note: 'C2', freq: 65.41, isBlack: false, oct: 2 },  // 72
  { note: 'B1', freq: 61.74, isBlack: false, oct: 1 },  // 73
  { note: 'A#1', freq: 58.27, isBlack: true, oct: 1 },  // 74
  { note: 'A1', freq: 55.0, isBlack: false, oct: 1 },  // 75
  { note: 'G#1', freq: 51.91, isBlack: true, oct: 1 },  // 76
  { note: 'G1', freq: 49.0, isBlack: false, oct: 1 },  // 77
  { note: 'F#1', freq: 46.25, isBlack: true, oct: 1 },  // 78
  { note: 'F1', freq: 43.65, isBlack: false, oct: 1 },  // 79
  { note: 'E1', freq: 41.2, isBlack: false, oct: 1 },  // 80
  { note: 'D#1', freq: 38.89, isBlack: true, oct: 1 },  // 81
  { note: 'D1', freq: 36.71, isBlack: false, oct: 1 },  // 82
  { note: 'C#1', freq: 34.65, isBlack: true, oct: 1 },  // 83
  { note: 'C1', freq: 32.7, isBlack: false, oct: 1 },  // 84
  { note: 'B0', freq: 30.87, isBlack: false, oct: 0 },  // 85
  { note: 'A#0', freq: 29.14, isBlack: true, oct: 0 },  // 86
  { note: 'A0', freq: 27.5, isBlack: false, oct: 0 },  // 87
];

/* The fields that make up a sound, as opposed to where the track sits in the
   mix (volume, pan, mute, solo), what it plays (grid, accents) or what it is
   (id, name, colour). The per-track EQ is a bus effect and stays with the
   track. This is what a preset carries and what a percussion key can override. */
export const KEY_TIMBRE_KEYS = [
  'osc1Waveform', 'osc1Gain', 'osc2Waveform', 'osc2Gain', 'osc2Ratio', 'detuneCents', 'phaseOffset',
  'osc2Semitone', 'pulseWidth', 'waveParams', 'subOscGain', 'noiseGain', 'noiseRetrig', 'noiseRetrigGap',
  'blendMode', 'morphAmount', 'glideTime', 'xfade',
  'filterType', 'cutoff', 'resonance', 'envFilterMod', 'keyTracking',
  'attack', 'decay', 'sustain', 'release',
  'ampAttack', 'ampDecay', 'ampSustain', 'ampRelease',
  'filterAttack', 'filterDecay', 'filterSustain', 'filterRelease', 'filterEnvAmount',
  'pitchAttack', 'pitchDecay', 'pitchEnvAmount',
  'lfoWaveform', 'lfoRate', 'lfoPitchAmt', 'lfoCutoffAmt', 'lfoPanAmt', 'lfoAmpAmt', 'lfoFadeTime',
  'lfoDepth', 'lfoTarget', 'airGain'
] as const satisfies readonly (keyof TrackData)[];

export type KeyTimbreKey = (typeof KEY_TIMBRE_KEYS)[number];

export function isKeyTimbreKey(k: string): k is KeyTimbreKey {
  return (KEY_TIMBRE_KEYS as readonly string[]).includes(k);
}

/** The sound a given key plays on a track: the track's own, overlaid with that key's entry in percussion mode. */
export function effectiveTimbre(track: TrackData, noteIndex: number): TrackData {
  if (!track.percussion) return track;
  const kt = track.keyTimbres?.[noteIndex];
  return kt ? { ...track, ...kt } : track;
}

/** The rack always has this many tracks; songs that define fewer get blank ones appended. */
export const TRACK_COUNT = 8;
const EXTRA_TRACK_COLORS = ['#e06c75', '#d19a66'];

/** A neutral sound for a track a song does not use: square + saw, open filter, plain envelope. */
const BLANK_TRACK_TIMBRE: Omit<TrackData, 'id' | 'name' | 'color' | 'grid' | 'accents'> = {
  volume: 0.8, pan: 0, muted: false, solo: false,
  osc1Waveform: 'square', osc1Gain: 0.9, osc2Waveform: 'sawtooth', osc2Gain: 0.5, osc2Ratio: 1, detuneCents: 0, phaseOffset: 0,
  osc2Semitone: 0, pulseWidth: 50, subOscGain: 0, noiseGain: 0, noiseRetrig: 1, noiseRetrigGap: 12,
  blendMode: 'layer', morphAmount: 0, glideTime: 0, xfade: 0.5,
  filterType: 'lowpass', cutoff: 12000, resonance: 0.2, envFilterMod: 0, keyTracking: 0,
  attack: 0.005, decay: 0.15, sustain: 0.7, release: 0.1,
  ampAttack: 0.005, ampDecay: 0.15, ampSustain: 0.7, ampRelease: 0.1,
  filterAttack: 0.005, filterDecay: 0.15, filterSustain: 0.3, filterRelease: 0.1, filterEnvAmount: 0,
  pitchAttack: 0.001, pitchDecay: 0.03, pitchEnvAmount: 0,
  lfoWaveform: 'sine', lfoRate: 5, lfoPitchAmt: 0, lfoCutoffAmt: 0, lfoPanAmt: 0, lfoAmpAmt: 0, lfoFadeTime: 0,
  eqOn: false, eqGains: [0, 0, 0, 0, 0, 0], airGain: 0,
  duckSource: -1, duckKeys: [], duckDepth: 0, duckDip: 5, duckHold: 40, duckRelease: 150,
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
      accents: Array.from({ length: len }, () => 0),
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
    accents: (t.accents as number[]).flatMap((a) => [a, 0, 0]),
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
  startTime: number;
  ampRel: number;
  vcfRel: number;
  baseCutoff: number;
  isContinuousHold?: boolean;
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
  private reverbDuration: number = 1.8;      // 0.2s to 6.0s
  private reverbDecayRate: number = 0.6;     // 0.1 to 2.0 (High Frequency Air Absorption)
  private masterTuningFreq: number = 440.0;  // 430Hz to 450Hz
  private maxPolyphony: number = 8;          // 1 to 16 voices per track
  private midiOmniMode: boolean = false;     // false = active track only, true = all tracks (Omni)
  private midiSelectedDeviceId: string = 'all'; // 'all' or specific MIDI device ID
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
  private onNoteListeners: Set<(trackId: number, noteIndex: number, noteName: string, durationMs: number) => void> = new Set();

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

    const bufferSize = Math.floor(ctx.sampleRate * Math.max(0.5, Math.min(5.0, this.noiseBufferDuration)));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (this.noiseColor === 'white') {
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } else if (this.noiseColor === 'pink') {
      // Paul Kellet's filtered pink noise generator (-3dB/octave)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
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

  private initMasterFX(ctx: AudioContext) {
    if (this.delayNode) return;

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
    this.masterBusIn.connect(this.shaperIn);
    this.shaperIn.connect(this.waveShaper);
    this.waveShaper.connect(masterGain);
    this.masterBusIn.connect(this.shaperBypass);
    this.shaperBypass.connect(masterGain);
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

  public loadBuiltInSong(songName: string = 'OVERWORLD_1') {
    this.stopAll();
    if (songName === 'OVERWORLD_1' || songName === 'OVERWORLD_FULL') {
      this.tracks = scaleTracksToFineGrid(JSON.parse(JSON.stringify(OVERWORLD_FULL_TRACKS)));
      this.totalSteps = 10080;
      this.bpm = 150;
      this.meter = '4/4';
    } else if (songName === 'OVERWORLD_2' || songName === 'OVERWORLD') {
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
      accents: Array.from({ length: MAX_GRID_STEPS }, () => 0),
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

  public setTrackAccent(trackId: number, stepIndex: number, level: number) {
    if (this.tracks[trackId]?.accents) {
      this.tracks[trackId].accents[stepIndex] = level;
    }
  }

  public cycleTrackAccent(trackId: number, stepIndex: number): number {
    if (this.tracks[trackId] && this.tracks[trackId].accents) {
      const current = Number(this.tracks[trackId].accents[stepIndex] || 0);
      let next = 0;
      if (current === 0) next = 1;      // +1dB
      else if (current === 1) next = 2; // +2dB
      else if (current === 2) next = 3; // +3dB
      else if (current === 3) next = 4; // +4dB
      else next = 0;                    // OFF (0dB)

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
    if (this.isSequencerPlaying) {
      this.restartSequencerTimer();
    }
  }

  public getTotalSteps(): number {
    return this.totalSteps;
  }

  public setTotalSteps(steps: number) {
    this.totalSteps = Math.max(8, Math.min(MAX_GRID_STEPS, steps));
    if (this.currentStep >= this.totalSteps) {
      this.currentStep = 0;
    }
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

  public isMidiOmniMode(): boolean {
    return this.midiOmniMode;
  }

  public setMidiOmniMode(omni: boolean) {
    this.midiOmniMode = omni;
  }

  public getMidiSelectedDeviceId(): string {
    return this.midiSelectedDeviceId;
  }

  public setMidiSelectedDeviceId(deviceId: string) {
    this.midiSelectedDeviceId = deviceId;
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
  private periodicFromSamples(ctx: BaseAudioContext, key: string, samples: ArrayLike<number>): PeriodicWave {
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
        let re = 0, im = 0;
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
    const bars = (['org1', 'org2', 'org3', 'org4', 'org5', 'org8'] as const).map((k) => Math.max(0, Math.min(8, Math.round(waveParam(p, k)))));
    const key = 'organ:' + bars.join('');
    let table = this.organTables.get(key);
    if (!table) {
      const harm = [1, 2, 3, 4, 5, 8];
      const N = 256;
      table = new Float32Array(N);
      for (let i = 0; i < N; i++) for (let k = 0; k < 6; k++) table[i] += (bars[k] / 8) * Math.sin((2 * Math.PI * harm[k] * i) / N);
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

  private applyWaveform(osc: OscillatorNode, w: SynthWaveform, pulseWidth: number | undefined, params: WaveParams | undefined, ctx: BaseAudioContext) {
    const pw = pulseWidth ?? 50;
    if (w === 'square' && Math.round(pw) !== 50) osc.setPeriodicWave(this.pulseWave(ctx, pw));
    else if (w === 'organ') {
      const { key, table } = this.organTable(params);
      osc.setPeriodicWave(this.periodicFromSamples(ctx, key, table));
    } else if (w === 'fold') {
      const { key, table } = this.foldTable(params);
      osc.setPeriodicWave(this.periodicFromSamples(ctx, key, table));
    }
    else if (w.startsWith('custom:')) {
      const id = w.slice(7);
      const cw = this.customWaves.get(id);
      if (cw && cw.samples.length >= 8) osc.setPeriodicWave(this.periodicFromSamples(ctx, `custom:${id}:${this.waveVersion.get(id) ?? 0}`, cw.samples));
      else osc.type = 'sine';
    }
    // Buffer sources only exist for OSC1; on OSC2 they fall back to a saw. PWM
    // and SUPERSAW start from a saw and get their companions in buildToneStack.
    else if (w === 'noise' || w === 'metal' || w === 'pwm' || w === 'supersaw') osc.type = 'sawtooth';
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
  private buildToneStack(ctx: BaseAudioContext, osc: OscillatorNode, w: SynthWaveform, plan: FreqPlan, p: WaveParams | undefined): { out: AudioNode; companions: OscillatorNode[]; helpers: AudioScheduledSourceNode[] } {
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
      for (let k = 0; k < freqs.length; k++) v += Math.sin((2 * Math.PI * freqs[k] * i) / sr + phases[k]) >= 0 ? 1 : -1;
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

  public triggerTrackVoice(trackId: number, noteIndex: number, accentLevel: number | boolean = 0, startTime?: number, durationSec?: number, rawVelocity?: number) {
    const trackRow = this.tracks[trackId];
    // Muting silences live playback, but must not silence an offline render.
    if (!trackRow || (!this.renderCtx && soundEngine.isMuted())) return;

    const noteInfo = PIANO_ROLL_NOTES[noteIndex];
    if (!noteInfo) return;

    // In percussion mode the key decides the sound; everything below reads the merged timbre.
    const track = effectiveTimbre(trackRow, noteIndex);

    const acc = typeof accentLevel === 'boolean' ? (accentLevel ? 1 : 0) : (accentLevel || 0);

    const ctx = this.audioCtx();
    if (!ctx) return;
    // An OfflineAudioContext also reports "suspended" before startRendering();
    // resuming it here would begin the render mid-schedule.
    if (!this.renderCtx && ctx.state === 'suspended') ctx.resume().catch(() => {});

    this.initMasterFX(ctx);

    // Overload guard: steal the oldest voice rather than let the live graph
    // grow without bound (Map iteration order is insertion order). Offline
    // voices all carry explicit start/stop times, so none of them is "active".
    if (!this.renderCtx && this.activeVoices.size >= 64) {
      const oldest = this.activeVoices.keys().next().value;
      if (oldest) this.stopVoice(oldest);
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
    const voiceMix = ctx.createGain();
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
      const durMs = Math.round((durationSec ?? (60 / this.bpm / 8)) * 1000);
      const delayMs = Math.max(0, Math.round((t - ctx.currentTime) * 1000));
      if (delayMs <= 5) {
        this.onNoteListeners.forEach((fn) => fn(trackId, noteIndex, noteInfo.note, durMs));
      } else {
        window.setTimeout(() => {
          this.onNoteListeners.forEach((fn) => fn(trackId, noteIndex, noteInfo.note, durMs));
        }, delayMs);
      }
    }

    const phaseDelaySec = (track.phaseOffset / 360) * (1 / baseFreq);
    const startT1 = t;
    const startT2 = t + Math.min(0.01, phaseDelaySec);

    const pEnvAmt = track.pitchEnvAmount ?? 0;
    const pAtt = Math.max(0.001, track.pitchAttack ?? 0.002);
    const pDec = Math.max(0.005, track.pitchDecay ?? 0.05);
    const pRatio = Math.pow(2, pEnvAmt);

    // NES-style noise pitch: with keyTracking > 0 the noise playback rate follows
    // the note (like the NES noise channel's 16 rates) — high notes tick bright
    // (hi-hat), mid notes rasp fuller (snare), low notes rumble (kick).
    const noiseKeyTrk = track.keyTracking ?? 0.0;
    const noiseRate = noiseKeyTrk > 0
      ? Math.max(0.25, Math.min(4, Math.pow(baseFreq / 261.63, noiseKeyTrk)))
      : 1.0;

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
      this.gateNoiseBursts(gN.gain, 1.0, t, track);
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
        const isLegato = (t - lastTime) < 1.5; // Within 1.5s interval
        const startFreq = (glideSec > 0 && lastFreq && isLegato) ? lastFreq : baseFreq;

        osc1 = ctx.createOscillator();
        this.applyWaveform(osc1, track.osc1Waveform, track.pulseWidth, track.waveParams, ctx);
        const plan1: FreqPlan = { t, start: startFreq, ramps: [] };
        if (glideSec > 0 && startFreq !== baseFreq) plan1.ramps.push({ to: baseFreq, at: t + glideSec });
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
      const osc2Freq = baseFreq * track.osc2Ratio * Math.pow(2, track.detuneCents / 1200) * Math.pow(2, (track.osc2Semitone ?? 0) / 12);
      const glideSec2 = (track.glideTime ?? 0) / 1000;
      const lastFreq2 = this.lastTrackFreqs.get(track.id);
      const lastTime2 = this.lastTrackNoteTimes.get(track.id) ?? 0;
      const isLegato2 = (t - lastTime2) < 1.5;
      const prevOsc2Freq = lastFreq2 ? lastFreq2 * track.osc2Ratio * Math.pow(2, track.detuneCents / 1200) * Math.pow(2, (track.osc2Semitone ?? 0) / 12) : osc2Freq;
      const startFreq2 = (glideSec2 > 0 && lastFreq2 && isLegato2) ? prevOsc2Freq : osc2Freq;

      osc2 = ctx.createOscillator();
      this.applyWaveform(osc2, track.osc2Waveform, track.pulseWidth, track.waveParams, ctx);
      const plan2: FreqPlan = { t, start: startFreq2, ramps: [] };
      if (glideSec2 > 0 && startFreq2 !== osc2Freq) plan2.ramps.push({ to: osc2Freq, at: t + glideSec2 });
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
        const ringGain = ctx.createGain();
        ringGain.gain.setValueAtTime(0, t);
        osc1Out!.connect(ringGain);
        osc2Out!.connect(ringGain.gain);
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
      const subGainAmt = track.subOscGain ?? 0;
      if (subGainAmt > 0 && osc1) {
        const subStart = (glideSec2 > 0 && lastFreq2 && isLegato2) ? lastFreq2 : baseFreq;
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(subStart / 2, t);
        if (glideSec2 > 0 && subStart !== baseFreq) sub.frequency.exponentialRampToValueAtTime(baseFreq / 2, t + glideSec2);
        if (pEnvAmt !== 0) {
          sub.frequency.exponentialRampToValueAtTime((baseFreq / 2) * pRatio, t + glideSec2 + pAtt);
          sub.frequency.exponentialRampToValueAtTime(baseFreq / 2, t + glideSec2 + pAtt + pDec);
        }
        const gSub = ctx.createGain();
        gSub.gain.setValueAtTime(subGainAmt * 0.9, t);
        sub.connect(gSub);
        gSub.connect(voiceMix);
        sub.start(startT1);
        extras.push(sub);
      }
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
    const ampAtt = ampAttRaw < 0.0005 ? 0 : Math.max(0.001, ampAttRaw);
    const ampDec = Math.max(0.01, track.ampDecay ?? track.decay ?? 0.15);
    const ampSus = Math.max(0.0001, track.ampSustain ?? track.sustain ?? 0.5);
    const ampRel = Math.max(0.01, track.ampRelease ?? track.release ?? 0.1);

    const vcfAttRaw = Math.max(0, track.filterAttack ?? 0.005);
    const vcfAtt = vcfAttRaw < 0.0005 ? 0 : Math.max(0.001, vcfAttRaw);
    const vcfDec = Math.max(0.01, track.filterDecay ?? 0.18);
    const vcfSus = Math.max(0.0, track.filterSustain ?? 0.25);
    const vcfRel = Math.max(0.01, track.filterRelease ?? 0.1);
    const vcfAmount = track.filterEnvAmount !== undefined ? track.filterEnvAmount : (track.envFilterMod ?? 0.5);

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
      accGainMult = Math.pow(10, acc / 20); // Exact decibels to amplitude ratio
      accCutoffMult = 1.0 + (acc * 0.04);   // Subtle harmonic opening (+1 -> 1.04x, +4 -> 1.16x)
      accResMult = 1.0 + (acc * 0.025);     // Subtle punch increase
    }

    for (const route of (track.modRoutes || [])) {
      if (!route.enabled) continue;
      if (route.source === 'velocity' && acc > 0) {
        const velMod = acc / 4.0;
        if (route.dest === 'cutoff') dynamicCutoffBase += route.amount * 1500 * velMod;
        if (route.dest === 'resonance') dynamicResonance = Math.max(0.2, dynamicResonance + route.amount * 1.5 * velMod);
      }
    }

    if (acc > 0) {
      dynamicCutoffBase = Math.min(16000, dynamicCutoffBase * accCutoffMult);
      dynamicResonance = Math.min(16.0, dynamicResonance * accResMult);
    }

    const baseCutoff = Math.max(40, Math.min(16000, dynamicCutoffBase));
    
    // Correctly scale positive and negative VCF envelope amounts
    const peakDelta = vcfAmount >= 0 
      ? vcfAmount * (16000 - baseCutoff) 
      : vcfAmount * (baseCutoff - 40);
      
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
    if (this.velocityCurve !== 'OFF' && rawVelocity !== undefined && rawVelocity > 0) {
      const v = Math.max(1, Math.min(127, rawVelocity)) / 127;
      let velGainScale = 1.0;

      switch (this.velocityCurve) {
        case 'EXP':
          // Exponential / Natural Piano: deep dynamic range, soft pianissimo & punchy fortissimo
          velGainScale = 0.06 + Math.pow(v, 1.8) * 1.35;
          break;
        case 'LINEAR':
          // Linear: direct 1:1 proportional tracking (0.15 to 1.25)
          velGainScale = 0.15 + v * 1.10;
          break;
        case 'LOG':
          // Logarithmic / Soft: easy to play loudly with lighter touch
          velGainScale = 0.20 + Math.sqrt(v) * 1.05;
          break;
        case 'HARD':
          // Hard / Aggressive: requires very firm strike to reach full volume
          velGainScale = 0.04 + Math.pow(v, 3.0) * 1.50;
          break;
      }
      gainBase = 0.28 * velGainScale;
    }

    // A one-shot (no sustain) is over in 50-200 ms; at the same peak the ear
    // hears it 6-10 dB under a held note. Give hits back some of that.
    const oneShot = ampSus <= 0.001 ? 1.8 : 1;
    const peakGain = gainBase * track.volume * oneShot;
    const sustainGain = Math.max(0.0001, peakGain * ampSus);
    const gainNode = ctx.createGain();
    if (ampAtt === 0) {
      gainNode.gain.setValueAtTime(peakGain, t);
    } else {
      gainNode.gain.setValueAtTime(0.0001, t);
      gainNode.gain.linearRampToValueAtTime(peakGain, t + ampAtt);
    }
    gainNode.gain.exponentialRampToValueAtTime(sustainGain, t + ampAtt + ampDec);

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

    let lfo: OscillatorNode | undefined;
    if ((pitchModAmt > 0 || cutoffModAmt > 0 || panModAmt > 0 || ampModAmt > 0) && track.lfoRate > 0) {
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
        const targetAmpGain = ampModAmt * 0.45 * track.volume;
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
      const holdSec = durationSec !== undefined ? Math.max(0.02, durationSec) : (60 / this.bpm / 8);
      const releaseStartTime = Math.max(t + ampAtt + ampDec, t + holdSec);
      gainNode.gain.setValueAtTime(sustainGain, releaseStartTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, releaseStartTime + ampRel);

      filter.frequency.setValueAtTime(sustainCutoff, releaseStartTime);
      filter.frequency.exponentialRampToValueAtTime(baseCutoff, releaseStartTime + vcfRel);

      const stopTime = releaseStartTime + ampRel + 0.1;
      if (osc1) osc1.stop(stopTime);
      if (osc2) osc2.stop(stopTime);
      if (noiseSource) noiseSource.stop(stopTime);
      for (const x of extras) x.stop(stopTime);
      if (lfo) lfo.stop(stopTime);

      // onended fires off the audio clock even when background-tab timer
      // throttling delays the setTimeout fallback by seconds or minutes. It
      // is also the only reaper an offline render may use: it fires when the
      // renderer actually reaches the end of the note, whereas wall-clock
      // reaping would disconnect nodes it has not got to yet. Without any
      // reaping offline, every finished voice stayed in the graph and the
      // render cost grew with the square of the song length.
      const endSrc = osc1 ?? osc2 ?? noiseSource;
      if (endSrc) endSrc.onended = () => this.reapVoice(voiceKey);
      if (!this.renderCtx) {
        const cleanupMs = Math.ceil((stopTime - ctx.currentTime) * 1000) + 50;
        void window.setTimeout(() => this.reapVoice(voiceKey), cleanupMs);
      }
    }

    voiceMix.connect(filter);
    filter.connect(gainNode);

    // Node 7: Air Shelf Filter (±8dB high shelf @ 10kHz per track)
    let finalVoiceNode: AudioNode = gainNode;
    if (track.airGain !== undefined && Math.abs(track.airGain) > 0.01) {
      const airFilter = ctx.createBiquadFilter();
      airFilter.type = 'highshelf';
      airFilter.frequency.setValueAtTime(10000, t);
      airFilter.gain.setValueAtTime(track.airGain * 8, t); // ±8dB
      gainNode.connect(airFilter);
      finalVoiceNode = airFilter;
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
        filter,
        gain: gainNode,
        lfo,
        panNode: panner,
        startTime: t,
        ampRel,
        vcfRel,
        baseCutoff,
        isContinuousHold,
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

    const accent = velocity > 100 ? 2 : velocity > 70 ? 1 : 0;
    // Pass durationSec = 0 to indicate continuous hold until noteOff, and pass raw velocity
    const voiceKey = this.triggerTrackVoice(trackId, noteIndex, accent, undefined, 0, velocity);
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

  public stopVoice(voiceKey: string) {
    const voice = this.activeVoices.get(voiceKey);
    if (!voice) return;
    try {
      voice.gain.gain.cancelScheduledValues(0);
      voice.gain.gain.setValueAtTime(0.0001, 0);
      if (voice.osc1) voice.osc1.stop();
      if (voice.osc2) voice.osc2.stop();
      if (voice.noise) voice.noise.stop();
      for (const x of voice.extras ?? []) x.stop();
      if (voice.lfo) voice.lfo.stop();
    } catch {}
    this.reapVoice(voiceKey);
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
    try {
      voice.gain.disconnect();
      voice.filter.disconnect();
      voice.panNode?.disconnect();
    } catch { /* already detached */ }
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

  public subscribeNote(listener: (trackId: number, noteIndex: number, noteName: string, durationMs: number) => void): () => void {
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
    // Set sequencer internal currentStep to the exact last heard audible step so next start resumes right where it stopped
    this.currentStep = this.lastAudibleStep;
    this.scheduledStepQueue = [];
    // A natural end in ONCE mode leaves the tails to ring; a STOP cuts them.
    if (cutVoices) this.stopAll();
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
      trackBuses: this.trackBuses,
    };
  }

  private restoreGraphCache(cache: ReturnType<ModularSynth['graphCache']>) {
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
  }

  private clearGraphCache() {
    this.restoreGraphCache({
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
      trackBuses: [],
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
    if (typeof OfflineAudioContext === 'undefined') throw new Error('OfflineAudioContext is unavailable in this browser.');
    if (this.renderCtx) throw new Error('A render is already running.');

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
    const ctx = soundEngine.init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const stepDuration = 60 / this.bpm / STEPS_PER_BEAT; // one grid step (1/24 beat)

    // Background tabs clamp setInterval to >=1s — 200ms of lookahead cannot
    // bridge that, so widen the window while hidden to keep playback gapless.
    const aheadSec = typeof document !== 'undefined' && document.hidden ? 1.6 : this.scheduleAheadSec;

    if (this.endAtTime !== null) return;
    while (this.nextStepTime < ctx.currentTime + aheadSec) {
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
      const isAccent = track.accents[step] || 0;

      stepNotes.forEach((noteIdx) => {
        if (noteIdx !== null && noteIdx !== undefined && PIANO_ROLL_NOTES[noteIdx]) {
          // If this note was ALREADY ringing on the previous step, it is a sustained continuation:
          // Do NOT re-trigger the voice attack!
          if (step > 0 && prevStepNotes.includes(noteIdx)) {
            return;
          }

          // Measure note duration across consecutive steps
          let durSteps = 1;
          while (
            (step + durSteps) < this.totalSteps &&
            track.grid[step + durSteps]?.includes(noteIdx)
          ) {
            durSteps++;
          }
          const noteHoldSec = durSteps * stepDuration;

          this.triggerTrackVoice(track.id, noteIdx, isAccent, time, noteHoldSec);
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
