import { soundEngine } from './sound';

export type SynthWaveform = 'sawtooth' | 'square' | 'sine' | 'triangle' | 'noise';
export type BlendMode = 'layer' | 'fm' | 'ring' | 'sync';
export type FilterType = 'lowpass' | 'bandpass' | 'highpass' | 'notch';
export type LfoWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';
export type LfoTarget = 'filter' | 'pitch' | 'amp' | 'morph' | 'pan';

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

  // Node 2: Timbre Fusion Node
  blendMode: BlendMode; // 'layer' | 'fm' | 'ring' | 'sync'
  morphAmount: number;  // 0.0 to 1.0 (Blend / FM modulation depth)

  // Node 3: Multi-Mode VCF Resonant Filter Node
  filterType: FilterType; // 'lowpass' | 'bandpass' | 'highpass' | 'notch'
  cutoff: number;       // 40Hz to 14000Hz
  resonance: number;    // 0.1 to 16.0
  envFilterMod: number; // 0.0 to 1.0 (Envelope to VCF cutoff sweep)

  // Node 4: Envelope & LFO Modulation Matrix
  attack: number;       // 0.005 to 1.2s
  decay: number;        // 0.01 to 1.5s
  sustain: number;      // 0.0 to 1.0
  release: number;      // 0.01 to 2.5s
  lfoWaveform: LfoWaveform;
  lfoRate: number;      // 0.1 to 20.0 Hz
  lfoDepth: number;     // 0.0 to 1.0
  lfoTarget: LfoTarget; // 'filter' | 'pitch' | 'amp' | 'morph' | 'pan'

  // Sequencer Grid (Polyphonic: array of note indices per step, up to 8 notes) & Accents
  grid: number[][];    // 64 steps, each containing active note indices [0-35]
  accents: boolean[];  // 64 steps
}

export const PIANO_ROLL_NOTES = [
  // OCTAVE 5 (High Lead / Arp) - Index 0 to 11
  { note: 'B5', freq: 987.77, isBlack: false, oct: 5 },  // 0
  { note: 'A#5', freq: 932.33, isBlack: true, oct: 5 },  // 1
  { note: 'A5', freq: 880.00, isBlack: false, oct: 5 },  // 2
  { note: 'G#5', freq: 830.61, isBlack: true, oct: 5 },  // 3
  { note: 'G5', freq: 783.99, isBlack: false, oct: 5 },  // 4
  { note: 'F#5', freq: 739.99, isBlack: true, oct: 5 },  // 5
  { note: 'F5', freq: 698.46, isBlack: false, oct: 5 },  // 6
  { note: 'E5', freq: 659.25, isBlack: false, oct: 5 },  // 7
  { note: 'D#5', freq: 622.25, isBlack: true, oct: 5 },  // 8
  { note: 'D5', freq: 587.33, isBlack: false, oct: 5 },  // 9
  { note: 'C#5', freq: 554.37, isBlack: true, oct: 5 },  // 10
  { note: 'C5', freq: 523.25, isBlack: false, oct: 5 },  // 11

  // OCTAVE 4 (Mid Lead / Chords) - Index 12 to 23
  { note: 'B4', freq: 493.88, isBlack: false, oct: 4 },  // 12
  { note: 'A#4', freq: 466.16, isBlack: true, oct: 4 },  // 13
  { note: 'A4', freq: 440.00, isBlack: false, oct: 4 },  // 14
  { note: 'G#4', freq: 415.30, isBlack: true, oct: 4 },  // 15
  { note: 'G4', freq: 392.00, isBlack: false, oct: 4 },  // 16
  { note: 'F#4', freq: 369.99, isBlack: true, oct: 4 },  // 17
  { note: 'F4', freq: 349.23, isBlack: false, oct: 4 },  // 18
  { note: 'E4', freq: 329.63, isBlack: false, oct: 4 },  // 19
  { note: 'D#4', freq: 311.13, isBlack: true, oct: 4 },  // 20
  { note: 'D4', freq: 293.66, isBlack: false, oct: 4 },  // 21
  { note: 'C#4', freq: 277.18, isBlack: true, oct: 4 },  // 22
  { note: 'C4', freq: 261.63, isBlack: false, oct: 4 },  // 23

  // OCTAVE 3 (Deep Bass / Roots) - Index 24 to 35
  { note: 'B3', freq: 246.94, isBlack: false, oct: 3 },  // 24
  { note: 'A#3', freq: 233.08, isBlack: true, oct: 3 },  // 25
  { note: 'A3', freq: 220.00, isBlack: false, oct: 3 },  // 26
  { note: 'G#3', freq: 207.65, isBlack: true, oct: 3 },  // 27
  { note: 'G3', freq: 196.00, isBlack: false, oct: 3 },  // 28
  { note: 'F#3', freq: 185.00, isBlack: true, oct: 3 },  // 29
  { note: 'F3', freq: 174.61, isBlack: false, oct: 3 },  // 30
  { note: 'E3', freq: 164.81, isBlack: false, oct: 3 },  // 31
  { note: 'D#3', freq: 155.56, isBlack: true, oct: 3 },  // 32
  { note: 'D3', freq: 146.83, isBlack: false, oct: 3 },  // 33
  { note: 'C#3', freq: 138.59, isBlack: true, oct: 3 },  // 34
  { note: 'C3', freq: 130.81, isBlack: false, oct: 3 },  // 35
];

/* ────────────────────────────────────────────────────────────────────────── */
/*    ICONIC SUPER MARIO BROS (OVERWORLD THEME) COMPLETE 512-STEP NES SCORE    */
/* ────────────────────────────────────────────────────────────────────────── */

// Track 1: Pulse 1 (Lead Melody / 50% Duty Square Wave - 512 Steps / 32 Bars)
const MARIO_TRK1_GRID: number[][] = [
  // BAR 1: Intro Stabs (E5-E5-E5-C5-E5-G5... G4)
  [7], [7], [], [7], [], [11], [7], [], [4], [], [], [], [16], [], [], [],
  // BAR 2: Intro Stabs Hold & Transition
  [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 3: Main Verse 1 (A1: C5-G4-E4-A4-B4-Bb4-A4)
  [11], [], [], [16], [], [], [19], [], [], [14], [], [12], [], [13], [14], [],
  // BAR 4: Main Verse 1 (A2: G4-E5-G5-A5-F5-G5-E5-C5-D5-B4)
  [16], [7], [4], [2], [], [6], [4], [], [7], [], [11], [9], [12], [], [], [],
  // BAR 5: Main Verse 1 (A3: Repeat A1)
  [11], [], [], [16], [], [], [19], [], [], [14], [], [12], [], [13], [14], [],
  // BAR 6: Main Verse 1 (A4: Cadence resolving to C5)
  [16], [7], [4], [2], [], [6], [4], [], [7], [], [11], [9], [12], [], [11], [],
  // BAR 7: B Section (B1: Chromatic Arp Jump 1)
  [4], [5], [6], [8], [7], [], [15], [14], [11], [], [14], [11], [9], [], [], [],
  // BAR 8: B Section (B2: Chromatic Arp Jump 2 - Triple High Stabs)
  [4], [5], [6], [8], [7], [], [0], [0], [0], [], [], [], [], [], [], [],
  // BAR 9: B Section (B3: Chromatic Arp Jump 3)
  [4], [5], [6], [8], [7], [], [15], [14], [11], [], [14], [11], [9], [], [], [],
  // BAR 10: B Section (B4: Chromatic Descending Turnaround)
  [8], [], [], [9], [], [], [11], [], [], [], [], [], [], [], [], [],
  // BAR 11: B Section Repeat 1
  [4], [5], [6], [8], [7], [], [15], [14], [11], [], [14], [11], [9], [], [], [],
  // BAR 12: B Section Repeat 2 (High Stabs)
  [4], [5], [6], [8], [7], [], [0], [0], [0], [], [], [], [], [], [], [],
  // BAR 13: C Section (C1: Underground/Castle Staccato Groove Part 1)
  [11], [11], [], [11], [], [11], [9], [], [7], [11], [], [14], [16], [], [], [],
  // BAR 14: C Section (C2: Underground/Castle Staccato Groove Part 2)
  [11], [11], [], [11], [], [11], [9], [7], [], [], [], [], [], [], [], [],
  // BAR 15: C Section (C3: Underground/Castle Staccato Groove Part 3)
  [11], [11], [], [11], [], [11], [9], [], [7], [11], [], [14], [16], [], [], [],
  // BAR 16: C Section (C4: Fanfare Break)
  [7], [7], [], [7], [], [11], [7], [], [4], [], [], [], [16], [], [], [],
  // BAR 17: Theme Reprise (Verse A1 with octave lift)
  [11], [], [], [16], [], [], [19], [], [], [14], [], [12], [], [13], [14], [],
  // BAR 18: Theme Reprise (Verse A2 Arps)
  [16], [7], [4], [2], [], [6], [4], [], [7], [], [11], [9], [12], [], [], [],
  // BAR 19: Theme Reprise (Verse A3)
  [11], [], [], [16], [], [], [19], [], [], [14], [], [12], [], [13], [14], [],
  // BAR 20: Theme Reprise (Verse A4 Cadence)
  [16], [7], [4], [2], [], [6], [4], [], [7], [], [11], [9], [12], [], [11], [],
  // BAR 21: Starman Invincible Theme (High-energy arps 1)
  [7], [], [7], [], [9], [], [9], [], [11], [], [11], [], [9], [], [7], [],
  // BAR 22: Starman Invincible Theme (High-energy arps 2)
  [7], [], [7], [], [9], [], [9], [], [11], [], [11], [], [9], [], [7], [],
  // BAR 23: Starman Invincible Theme (High-energy arps 3 - Shift)
  [9], [], [9], [], [11], [], [11], [], [12], [], [12], [], [11], [], [9], [],
  // BAR 24: Starman Invincible Theme (High-energy arps 4 - Resolving)
  [7], [], [7], [], [9], [], [9], [], [11], [], [11], [], [9], [], [7], [],
  // BAR 25: Castle / Underground Funk Arp 1
  [23], [11], [24], [12], [26], [14], [], [23], [11], [24], [12], [26], [14], [], [], [],
  // BAR 26: Castle / Underground Funk Arp 2
  [22], [10], [23], [11], [25], [13], [], [22], [10], [23], [11], [25], [13], [], [], [],
  // BAR 27: Flagpole Fanfare (Victory Ascent 1)
  [16], [11], [7], [4], [0], [4], [0], [4], [0], [], [], [], [0], [], [], [],
  // BAR 28: Flagpole Fanfare (Victory Ascent 2)
  [15], [10], [6], [3], [], [3], [], [3], [], [], [], [], [3], [], [], [],
  // BAR 29: Level Clear Fanfare (Victory Chords)
  [13], [9], [5], [1], [], [1], [], [1], [], [], [], [], [0], [], [0], [],
  // BAR 30: Victory Resolution Hold
  [0], [], [], [], [0], [], [], [], [0], [], [], [], [], [], [], [],
  // BAR 31: Outro Turnaround
  [11], [], [11], [], [9], [], [7], [], [14], [], [12], [], [16], [], [], [],
  // BAR 32: Final Fanfare Stabs (Smooth loop to Bar 1)
  [7], [7], [], [7], [], [11], [7], [], [4], [], [], [], [16], [], [], [],
];

const MARIO_TRK1_ACCENTS: boolean[] = [
  // BARS 1-4
  true, true, false, true, false, true, true, false, true, false, false, false, true, false, false, false,
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  true, false, false, true, false, false, true, false, false, true, false, true, false, true, true, false,
  true, true, true, true, false, true, true, false, true, false, true, true, true, false, false, false,
  // BARS 5-8
  true, false, false, true, false, false, true, false, false, true, false, true, false, true, true, false,
  true, true, true, true, false, true, true, false, true, false, true, true, true, false, true, false,
  true, true, true, true, true, false, true, true, true, false, true, true, true, false, false, false,
  true, true, true, true, true, false, true, true, true, false, false, false, false, false, false, false,
  // BARS 9-12
  true, true, true, true, true, false, true, true, true, false, true, true, true, false, false, false,
  true, false, false, true, false, false, true, false, false, false, false, false, false, false, false, false,
  true, true, true, true, true, false, true, true, true, false, true, true, true, false, false, false,
  true, true, true, true, true, false, true, true, true, false, false, false, false, false, false, false,
  // BARS 13-16
  true, true, false, true, false, true, true, false, true, true, false, true, true, false, false, false,
  true, true, false, true, false, true, true, true, false, false, false, false, false, false, false, false,
  true, true, false, true, false, true, true, false, true, true, false, true, true, false, false, false,
  true, true, false, true, false, true, true, false, true, false, false, false, true, false, false, false,
  // BARS 17-20
  true, false, false, true, false, false, true, false, false, true, false, true, false, true, true, false,
  true, true, true, true, false, true, true, false, true, false, true, true, true, false, false, false,
  true, false, false, true, false, false, true, false, false, true, false, true, false, true, true, false,
  true, true, true, true, false, true, true, false, true, false, true, true, true, false, true, false,
  // BARS 21-24 (Starman)
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BARS 25-28 (Underground / Flagpole)
  true, true, true, true, true, true, false, true, true, true, true, true, true, false, false, false,
  true, true, true, true, true, true, false, true, true, true, true, true, true, false, false, false,
  true, true, true, true, true, true, true, true, true, false, false, false, true, false, false, false,
  true, true, true, true, false, true, false, true, false, false, false, false, true, false, false, false,
  // BARS 29-32 (Victory Fanfare & Outro)
  true, true, true, true, false, true, false, true, false, false, false, false, true, false, true, false,
  true, false, false, false, true, false, false, false, true, false, false, false, false, false, false, false,
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, false, false,
  true, true, false, true, false, true, true, false, true, false, false, false, true, false, false, false,
];

// Track 2: Pulse 2 (Harmony Chords / 25% Duty Square Wave - 512 Steps / 32 Bars)
const MARIO_TRK2_GRID: number[][] = [
  // BAR 1: Intro Harmony [D4, F#4] Stabs
  [17, 21], [17, 21], [], [17, 21], [], [18, 23], [17, 21], [], [19, 24], [], [], [], [28], [], [], [],
  // BAR 2: Hold & Transition
  [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 3: Harmony Thirds/Sixths under melody
  [19], [], [], [23], [], [], [28], [], [], [23], [], [21], [], [22], [23], [],
  // BAR 4: Harmony Run
  [19], [11], [7], [6], [], [9], [7], [], [11], [], [14], [12], [16], [], [], [],
  // BAR 5: Harmony Repeat
  [19], [], [], [23], [], [], [28], [], [], [23], [], [21], [], [22], [23], [],
  // BAR 6: Harmony Cadence
  [19], [11], [7], [6], [], [9], [7], [], [11], [], [14], [12], [16], [], [19], [],
  // BAR 7: B Section Harmony 1
  [7], [8], [9], [11], [10], [], [18], [17], [14], [], [17], [14], [12], [], [], [],
  // BAR 8: B Section Harmony 2 (Triple Stabs)
  [7], [8], [9], [11], [10], [], [4, 7], [4, 7], [4, 7], [], [], [], [], [], [], [],
  // BAR 9: B Section Harmony 3
  [7], [8], [9], [11], [10], [], [18], [17], [14], [], [17], [14], [12], [], [], [],
  // BAR 10: B Section Harmony Turnaround
  [11], [], [], [12], [], [], [14], [], [], [], [], [], [], [], [], [],
  // BAR 11: B Section Harmony Repeat 1
  [7], [8], [9], [11], [10], [], [18], [17], [14], [], [17], [14], [12], [], [], [],
  // BAR 12: B Section Harmony Repeat 2
  [7], [8], [9], [11], [10], [], [4, 7], [4, 7], [4, 7], [], [], [], [], [], [], [],
  // BAR 13: C Section Harmony 1
  [19], [19], [], [19], [], [19], [21], [], [19], [19], [], [23], [24], [], [], [],
  // BAR 14: C Section Harmony 2
  [19], [19], [], [19], [], [19], [21], [19], [], [], [], [], [], [], [], [],
  // BAR 15: C Section Harmony 3
  [19], [19], [], [19], [], [19], [21], [], [19], [19], [], [23], [24], [], [], [],
  // BAR 16: C Section Turnaround
  [17, 21], [17, 21], [], [17, 21], [], [18, 23], [17, 21], [], [19, 24], [], [], [], [28], [], [], [],
  // BAR 17: Reprise Harmony 1
  [19], [], [], [23], [], [], [28], [], [], [23], [], [21], [], [22], [23], [],
  // BAR 18: Reprise Harmony 2
  [19], [11], [7], [6], [], [9], [7], [], [11], [], [14], [12], [16], [], [], [],
  // BAR 19: Reprise Harmony 3
  [19], [], [], [23], [], [], [28], [], [], [23], [], [21], [], [22], [23], [],
  // BAR 20: Reprise Harmony 4
  [19], [11], [7], [6], [], [9], [7], [], [11], [], [14], [12], [16], [], [19], [],
  // BAR 21: Starman Harmony 1
  [11], [], [11], [], [14], [], [14], [], [16], [], [16], [], [14], [], [11], [],
  // BAR 22: Starman Harmony 2
  [11], [], [11], [], [14], [], [14], [], [16], [], [16], [], [14], [], [11], [],
  // BAR 23: Starman Harmony 3
  [14], [], [14], [], [16], [], [16], [], [18], [], [18], [], [16], [], [14], [],
  // BAR 24: Starman Harmony 4
  [11], [], [11], [], [14], [], [14], [], [16], [], [16], [], [14], [], [11], [],
  // BAR 25: Castle Harmony 1
  [16], [], [], [16], [], [], [16], [], [16], [], [], [16], [], [], [], [],
  // BAR 26: Castle Harmony 2
  [15], [], [], [15], [], [], [15], [], [15], [], [], [15], [], [], [], [],
  // BAR 27: Flagpole Harmony 1
  [7], [4], [0], [4], [0], [4], [0], [4], [0], [], [], [], [0], [], [], [],
  // BAR 28: Flagpole Harmony 2
  [6], [3], [], [3], [], [3], [], [3], [], [], [], [], [3], [], [], [],
  // BAR 29: Level Clear Harmony 1
  [5], [1], [], [1], [], [1], [], [1], [], [], [], [], [0], [], [0], [],
  // BAR 30: Level Clear Harmony 2
  [4, 7], [], [], [], [4, 7], [], [], [], [4, 7], [], [], [], [], [], [], [],
  // BAR 31: Outro Harmony 1
  [19], [], [19], [], [21], [], [19], [], [23], [], [24], [], [28], [], [], [],
  // BAR 32: Final Harmony Fanfare
  [17, 21], [17, 21], [], [17, 21], [], [18, 23], [17, 21], [], [19, 24], [], [], [], [28], [], [], [],
];

const MARIO_TRK2_ACCENTS: boolean[] = [
  // BARS 1-4
  true, true, false, true, false, true, true, false, true, false, false, false, true, false, false, false,
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  true, false, false, true, false, false, true, false, false, true, false, true, false, true, true, false,
  true, true, true, true, false, true, true, false, true, false, true, true, true, false, false, false,
  // BARS 5-8
  true, false, false, true, false, false, true, false, false, true, false, true, false, true, true, false,
  true, true, true, true, false, true, true, false, true, false, true, true, true, false, true, false,
  true, true, true, true, true, false, true, true, true, false, true, true, true, false, false, false,
  true, true, true, true, true, false, true, true, true, false, false, false, false, false, false, false,
  // BARS 9-12
  true, true, true, true, true, false, true, true, true, false, true, true, true, false, false, false,
  true, false, false, true, false, false, true, false, false, false, false, false, false, false, false, false,
  true, true, true, true, true, false, true, true, true, false, true, true, true, false, false, false,
  true, true, true, true, true, false, true, true, true, false, false, false, false, false, false, false,
  // BARS 13-16
  true, true, false, true, false, true, true, false, true, true, false, true, true, false, false, false,
  true, true, false, true, false, true, true, true, false, false, false, false, false, false, false, false,
  true, true, false, true, false, true, true, false, true, true, false, true, true, false, false, false,
  true, true, false, true, false, true, true, false, true, false, false, false, true, false, false, false,
  // BARS 17-20
  true, false, false, true, false, false, true, false, false, true, false, true, false, true, true, false,
  true, true, true, true, false, true, true, false, true, false, true, true, true, false, false, false,
  true, false, false, true, false, false, true, false, false, true, false, true, false, true, true, false,
  true, true, true, true, false, true, true, false, true, false, true, true, true, false, true, false,
  // BARS 21-24 (Starman)
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BARS 25-28 (Underground / Flagpole)
  true, false, false, true, false, false, true, false, true, false, false, true, false, false, false, false,
  true, false, false, true, false, false, true, false, true, false, false, true, false, false, false, false,
  true, true, true, true, true, true, true, true, true, false, false, false, true, false, false, false,
  true, true, true, true, false, true, false, true, false, false, false, false, true, false, false, false,
  // BARS 29-32 (Victory Fanfare & Outro)
  true, true, true, true, false, true, false, true, false, false, false, false, true, false, true, false,
  true, false, false, false, true, false, false, false, true, false, false, false, false, false, false, false,
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, false, false,
  true, true, false, true, false, true, true, false, true, false, false, false, true, false, false, false,
];

// Track 3: Triangle (Walking Sub-Bassline - 512 Steps / 32 Bars)
const MARIO_TRK3_GRID: number[][] = [
  // BAR 1: Intro Bass (D3-D3-D3-D3-D3-G3... G3)
  [33], [33], [], [33], [], [33], [33], [], [28], [], [], [], [28], [], [], [],
  // BAR 2: Intro Bass Hold
  [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 3: Walking Bass Groove 1
  [35], [], [], [28], [], [], [31], [], [], [26], [], [24], [], [25], [26], [],
  // BAR 4: Bouncy Triangle Arp 1
  [28], [35], [31], [30], [], [33], [31], [], [35], [], [26], [24], [28], [], [], [],
  // BAR 5: Walking Bass Groove 2
  [35], [], [], [28], [], [], [31], [], [], [26], [], [24], [], [25], [26], [],
  // BAR 6: Walking Bass Cadence
  [28], [35], [31], [30], [], [33], [31], [], [35], [], [26], [24], [28], [], [35], [],
  // BAR 7: B Section Bass 1
  [35], [], [], [28], [], [], [35], [], [], [26], [], [], [33], [], [], [],
  // BAR 8: B Section Bass 2 (Triple Stabs)
  [35], [], [], [28], [], [], [35], [35], [35], [], [], [], [28], [], [], [],
  // BAR 9: B Section Bass 3
  [35], [], [], [28], [], [], [35], [], [], [26], [], [], [33], [], [], [],
  // BAR 10: B Section Bass Turnaround
  [32], [], [], [33], [], [], [35], [], [], [28], [], [], [35], [], [], [],
  // BAR 11: B Section Bass Repeat 1
  [35], [], [], [28], [], [], [35], [], [], [26], [], [], [33], [], [], [],
  // BAR 12: B Section Bass Repeat 2
  [35], [], [], [28], [], [], [35], [35], [35], [], [], [], [28], [], [], [],
  // BAR 13: C Section Bass 1
  [35], [35], [], [35], [], [35], [33], [], [31], [35], [], [26], [28], [], [], [],
  // BAR 14: C Section Bass 2
  [35], [35], [], [35], [], [35], [33], [31], [], [], [], [], [28], [], [], [],
  // BAR 15: C Section Bass 3
  [35], [35], [], [35], [], [35], [33], [], [31], [35], [], [26], [28], [], [], [],
  // BAR 16: C Section Bass Turnaround
  [33], [33], [], [33], [], [33], [33], [], [28], [], [], [], [28], [], [], [],
  // BAR 17: Reprise Bass 1
  [35], [], [], [28], [], [], [31], [], [], [26], [], [24], [], [25], [26], [],
  // BAR 18: Reprise Bass 2
  [28], [35], [31], [30], [], [33], [31], [], [35], [], [26], [24], [28], [], [], [],
  // BAR 19: Reprise Bass 3
  [35], [], [], [28], [], [], [31], [], [], [26], [], [24], [], [25], [26], [],
  // BAR 20: Reprise Bass Cadence
  [28], [35], [31], [30], [], [33], [31], [], [35], [], [26], [24], [28], [], [35], [],
  // BAR 21: Starman Bass Octave Pump 1
  [35], [23], [35], [23], [35], [23], [35], [23], [35], [23], [35], [23], [35], [23], [35], [23],
  // BAR 22: Starman Bass Octave Pump 2
  [35], [23], [35], [23], [35], [23], [35], [23], [35], [23], [35], [23], [35], [23], [35], [23],
  // BAR 23: Starman Bass Octave Pump 3
  [33], [21], [33], [21], [33], [21], [33], [21], [33], [21], [33], [21], [33], [21], [33], [21],
  // BAR 24: Starman Bass Octave Pump 4
  [35], [23], [35], [23], [35], [23], [35], [23], [35], [23], [35], [23], [35], [23], [35], [23],
  // BAR 25: Castle Sub Bass 1
  [35], [], [], [35], [], [], [35], [], [35], [], [], [35], [], [], [], [],
  // BAR 26: Castle Sub Bass 2
  [34], [], [], [34], [], [], [34], [], [34], [], [], [34], [], [], [], [],
  // BAR 27: Flagpole Bass 1
  [28], [35], [31], [28], [35], [28], [35], [28], [35], [], [], [], [35], [], [], [],
  // BAR 28: Flagpole Bass 2
  [27], [34], [30], [27], [], [27], [], [27], [], [], [], [], [27], [], [], [],
  // BAR 29: Level Clear Bass 1
  [25], [32], [28], [25], [], [25], [], [25], [], [], [], [], [35], [], [35], [],
  // BAR 30: Level Clear Bass 2
  [35], [], [], [], [35], [], [], [], [35], [], [], [], [], [], [], [],
  // BAR 31: Outro Walking Bass
  [35], [], [35], [], [33], [], [31], [], [26], [], [24], [], [28], [], [], [],
  // BAR 32: Final Bass Fanfare
  [33], [33], [], [33], [], [33], [33], [], [28], [], [], [], [28], [], [], [],
];

const MARIO_TRK3_ACCENTS: boolean[] = [
  // BARS 1-4
  true, true, false, true, false, true, true, false, true, false, false, false, true, false, false, false,
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  true, false, false, true, false, false, true, false, false, true, false, true, false, true, true, false,
  true, true, true, true, false, true, true, false, true, false, true, true, true, false, false, false,
  // BARS 5-8
  true, false, false, true, false, false, true, false, false, true, false, true, false, true, true, false,
  true, true, true, true, false, true, true, false, true, false, true, true, true, false, true, false,
  true, true, true, true, true, false, true, true, true, false, true, true, true, false, false, false,
  true, true, true, true, true, false, true, true, true, false, false, false, false, false, false, false,
  // BARS 9-12
  true, true, true, true, true, false, true, true, true, false, true, true, true, false, false, false,
  true, false, false, true, false, false, true, false, false, false, false, false, false, false, false, false,
  true, true, true, true, true, false, true, true, true, false, true, true, true, false, false, false,
  true, true, true, true, true, false, true, true, true, false, false, false, false, false, false, false,
  // BARS 13-16
  true, true, false, true, false, true, true, false, true, true, false, true, true, false, false, false,
  true, true, false, true, false, true, true, true, false, false, false, false, false, false, false, false,
  true, true, false, true, false, true, true, false, true, true, false, true, true, false, false, false,
  true, true, false, true, false, true, true, false, true, false, false, false, true, false, false, false,
  // BARS 17-20
  true, false, false, true, false, false, true, false, false, true, false, true, false, true, true, false,
  true, true, true, true, false, true, true, false, true, false, true, true, true, false, false, false,
  true, false, false, true, false, false, true, false, false, true, false, true, false, true, true, false,
  true, true, true, true, false, true, true, false, true, false, true, true, true, false, true, false,
  // BARS 21-24 (Starman)
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BARS 25-28 (Underground / Flagpole)
  true, false, false, true, false, false, true, false, true, false, false, true, false, false, false, false,
  true, false, false, true, false, false, true, false, true, false, false, true, false, false, false, false,
  true, true, true, true, true, true, true, true, true, false, false, false, true, false, false, false,
  true, true, true, true, false, true, false, true, false, false, false, false, true, false, false, false,
  // BARS 29-32 (Victory Fanfare & Outro)
  true, true, true, true, false, true, false, true, false, false, false, false, true, false, true, false,
  true, false, false, false, true, false, false, false, true, false, false, false, false, false, false, false,
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, false, false,
  true, true, false, true, false, true, true, false, true, false, false, false, true, false, false, false,
];

export const INITIAL_TRACKS: TrackData[] = [
  {
    id: 0,
    name: 'TRK 1: PULSE 1 (LEAD)',
    color: '#e5c07b',
    volume: 0.95,
    pan: -0.15,
    muted: false,
    solo: false,

    // Node 1: Crisp Chiptune Pulse
    osc1Waveform: 'square',
    osc1Gain: 0.9,
    osc2Waveform: 'sawtooth',
    osc2Gain: 0.25,
    osc2Ratio: 1.0,
    detuneCents: 3,
    phaseOffset: 0,

    // Node 2: Layer Timbre
    blendMode: 'layer',
    morphAmount: 0.2,

    // Node 3: Open Punchy VCF Filter
    filterType: 'lowpass',
    cutoff: 6200,
    resonance: 2.8,
    envFilterMod: 0.45,

    // Node 4: Snappy 8-Bit ADSR Envelope
    attack: 0.008,
    decay: 0.12,
    sustain: 0.4,
    release: 0.14,
    lfoWaveform: 'sine',
    lfoRate: 4.5,
    lfoDepth: 0.1,
    lfoTarget: 'pitch',

    grid: MARIO_TRK1_GRID,
    accents: MARIO_TRK1_ACCENTS,
  },
  {
    id: 1,
    name: 'TRK 2: PULSE 2 (HARMONY)',
    color: '#56b6c2',
    volume: 0.85,
    pan: 0.25,
    muted: false,
    solo: false,

    // Node 1: Dual Polyphonic Square / Sine Voice
    osc1Waveform: 'square',
    osc1Gain: 0.8,
    osc2Waveform: 'triangle',
    osc2Gain: 0.5,
    osc2Ratio: 1.0,
    detuneCents: -4,
    phaseOffset: 45,

    // Node 2: Layer Timbre
    blendMode: 'layer',
    morphAmount: 0.25,

    // Node 3: Warm Lowpass
    filterType: 'lowpass',
    cutoff: 5200,
    resonance: 2.4,
    envFilterMod: 0.35,

    // Node 4: Chime ADSR
    attack: 0.008,
    decay: 0.14,
    sustain: 0.4,
    release: 0.16,
    lfoWaveform: 'triangle',
    lfoRate: 5.0,
    lfoDepth: 0.12,
    lfoTarget: 'pitch',

    grid: MARIO_TRK2_GRID,
    accents: MARIO_TRK2_ACCENTS,
  },
  {
    id: 2,
    name: 'TRK 3: TRIANGLE (BASS)',
    color: '#c678dd',
    volume: 0.95,
    pan: 0.0,
    muted: false,
    solo: false,

    // Node 1: Deep Triangle Sub-Bass
    osc1Waveform: 'triangle',
    osc1Gain: 0.95,
    osc2Waveform: 'sine',
    osc2Gain: 0.4,
    osc2Ratio: 1.0,
    detuneCents: 0,
    phaseOffset: 0,

    // Node 2: Pure Sub Layer
    blendMode: 'layer',
    morphAmount: 0.1,

    // Node 3: Lowpass Sub-Bass
    filterType: 'lowpass',
    cutoff: 3200,
    resonance: 1.5,
    envFilterMod: 0.2,

    // Node 4: Bouncy Bass Envelope
    attack: 0.008,
    decay: 0.2,
    sustain: 0.6,
    release: 0.15,
    lfoWaveform: 'sine',
    lfoRate: 3.0,
    lfoDepth: 0.05,
    lfoTarget: 'filter',

    grid: MARIO_TRK3_GRID,
    accents: MARIO_TRK3_ACCENTS,
  },
];

interface ActiveVoice {
  osc1?: OscillatorNode;
  osc2?: OscillatorNode;
  noise?: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  lfo?: OscillatorNode;
  lfoGain?: GainNode;
  panNode?: StereoPannerNode;
  startTime: number;
}

class ModularSynth {
  private tracks: TrackData[] = JSON.parse(JSON.stringify(INITIAL_TRACKS));
  private activeVoices: Map<string, ActiveVoice> = new Map();
  private noiseBuffer: AudioBuffer | null = null;

  // Master Global Params (100 BPM for Authentic Original NES Super Mario Bros Groove)
  private bpm: number = 100;
  private delayMix: number = 0.18;
  private delayTime: number = 0.22;
  private delayFeedback: number = 0.32;
  private reverbMix: number = 0.15;

  // Master Audio FX Nodes
  private delayNode: DelayNode | null = null;
  private delayFeedbackGain: GainNode | null = null;
  private delayWetGain: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;

  // Sequencer Engine (512 Steps, 32 Bars)
  private isSequencerPlaying: boolean = false;
  private currentStep: number = 0;
  private totalSteps: number = 512; // Default 512 steps (32 Bars), configurable: 16, 32, 64, 128, 256, 512
  private sequencerTimer: any = null;
  private onStepListeners: Set<(step: number) => void> = new Set();

  constructor() {
    this.initNoiseBuffer();
  }

  private initNoiseBuffer() {
    if (typeof window === 'undefined') return;
    const ctx = soundEngine.init();
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
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

    const masterGain = (soundEngine as any).masterGain || ctx.destination;
    this.delayNode.connect(this.delayWetGain);
    this.delayWetGain.connect(masterGain);

    this.reverbConvolver.connect(this.reverbWetGain);
    this.reverbWetGain.connect(masterGain);
  }

  public getTracks(): TrackData[] {
    return this.tracks;
  }

  public getTrack(trackId: number): TrackData | undefined {
    return this.tracks[trackId];
  }

  public updateTrack(trackId: number, partial: Partial<TrackData>) {
    if (this.tracks[trackId]) {
      this.tracks[trackId] = { ...this.tracks[trackId], ...partial };
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

  public toggleTrackAccent(trackId: number, stepIndex: number) {
    if (this.tracks[trackId]) {
      this.tracks[trackId].accents[stepIndex] = !this.tracks[trackId].accents[stepIndex];
    }
  }

  public toggleTrackMute(trackId: number) {
    if (this.tracks[trackId]) {
      this.tracks[trackId].muted = !this.tracks[trackId].muted;
    }
  }

  public toggleTrackSolo(trackId: number) {
    if (this.tracks[trackId]) {
      const current = this.tracks[trackId].solo;
      this.tracks.forEach((t) => (t.solo = false));
      this.tracks[trackId].solo = !current;
    }
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
    this.totalSteps = Math.max(8, Math.min(512, steps));
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

  /* -------------------------------------------------------------------------- */
  /*                      COMPLETE MODULAR SIGNAL FLOW DSP                      */
  /* -------------------------------------------------------------------------- */

  public triggerTrackVoice(trackId: number, noteIndex: number, isAccent = false) {
    const track = this.tracks[trackId];
    if (!track || soundEngine.isMuted()) return;

    const noteInfo = PIANO_ROLL_NOTES[noteIndex];
    if (!noteInfo) return;

    const ctx = soundEngine.init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    this.initMasterFX(ctx);

    const voiceKey = `trk_${trackId}_${noteIndex}_${Math.random().toString(36).slice(2, 6)}`;

    const t = ctx.currentTime;
    const baseFreq = noteInfo.freq;
    const masterGain = (soundEngine as any).masterGain || ctx.destination;

    // ──────────────────────────────────────────────────────────────────────────
    // NODE 1 & NODE 2: DUAL INPUT WAVEFORM GENERATORS & TIMBRE FUSION
    // ──────────────────────────────────────────────────────────────────────────
    const voiceMix = ctx.createGain();
    let osc1: OscillatorNode | undefined;
    let osc2: OscillatorNode | undefined;
    let noiseSource: AudioBufferSourceNode | undefined;

    const phaseDelaySec = (track.phaseOffset / 360) * (1 / baseFreq);
    const startT1 = t;
    const startT2 = t + Math.min(0.01, phaseDelaySec);

    if (track.osc1Waveform === 'noise' && track.osc2Waveform === 'noise') {
      if (!this.noiseBuffer) this.initNoiseBuffer();
      noiseSource = ctx.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;
      noiseSource.loop = true;
      noiseSource.connect(voiceMix);
      noiseSource.start(startT1);
    } else {
      if (track.osc1Waveform === 'noise') {
        if (!this.noiseBuffer) this.initNoiseBuffer();
        noiseSource = ctx.createBufferSource();
        noiseSource.buffer = this.noiseBuffer;
        noiseSource.loop = true;
        const g1 = ctx.createGain();
        g1.gain.setValueAtTime(track.osc1Gain, t);
        noiseSource.connect(g1);
        g1.connect(voiceMix);
        noiseSource.start(startT1);
      } else {
        osc1 = ctx.createOscillator();
        osc1.type = track.osc1Waveform;
        osc1.frequency.setValueAtTime(baseFreq, t);
      }

      const osc2Freq = baseFreq * track.osc2Ratio * Math.pow(2, track.detuneCents / 1200);
      osc2 = ctx.createOscillator();
      osc2.type = track.osc2Waveform === 'noise' ? 'sawtooth' : track.osc2Waveform;
      osc2.frequency.setValueAtTime(osc2Freq, t);

      if (track.blendMode === 'fm' && osc1) {
        const fmGain = ctx.createGain();
        const fmIndex = track.morphAmount * baseFreq * 3.5 * track.osc2Gain;
        fmGain.gain.setValueAtTime(fmIndex, t);
        osc2.connect(fmGain);
        fmGain.connect(osc1.frequency);

        const osc1GainNode = ctx.createGain();
        osc1GainNode.gain.setValueAtTime(track.osc1Gain, t);
        osc1.connect(osc1GainNode);
        osc1GainNode.connect(voiceMix);
      } else if (track.blendMode === 'ring' && osc1) {
        const ringGain = ctx.createGain();
        ringGain.gain.setValueAtTime(0, t);
        osc1.connect(ringGain);
        osc2.connect(ringGain.gain);
        ringGain.connect(voiceMix);
      } else if (track.blendMode === 'sync' && osc1) {
        const g1 = ctx.createGain();
        const g2 = ctx.createGain();
        g1.gain.setValueAtTime(track.osc1Gain * (1.0 - track.morphAmount * 0.4), t);
        g2.gain.setValueAtTime(track.osc2Gain * track.morphAmount * 0.9, t);
        osc1.connect(g1);
        osc2.connect(g2);
        g1.connect(voiceMix);
        g2.connect(voiceMix);
      } else {
        if (osc1) {
          const g1 = ctx.createGain();
          g1.gain.setValueAtTime(track.osc1Gain * (1.0 - track.morphAmount * 0.6), t);
          osc1.connect(g1);
          g1.connect(voiceMix);
        }
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(track.osc2Gain * (0.2 + track.morphAmount * 0.8), t);
        osc2.connect(g2);
        g2.connect(voiceMix);
      }

      if (osc1) osc1.start(startT1);
      osc2.start(startT2);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NODE 3: MULTI-MODE VCF RESONANT FILTER (LPF / BPF / HPF / NOTCH)
    // ──────────────────────────────────────────────────────────────────────────
    const filter = ctx.createBiquadFilter();
    filter.type = track.filterType;
    const baseCutoff = isAccent ? Math.min(14000, track.cutoff * 1.5) : track.cutoff;
    filter.frequency.setValueAtTime(Math.max(40, baseCutoff * (1.0 - track.envFilterMod * 0.7)), t);
    filter.frequency.exponentialRampToValueAtTime(baseCutoff, t + Math.max(0.005, track.attack));
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, baseCutoff * (0.3 + (1.0 - track.envFilterMod) * 0.5)),
      t + track.attack + Math.max(0.02, track.decay)
    );
    filter.Q.setValueAtTime(isAccent ? track.resonance * 1.3 : track.resonance, t);

    // ──────────────────────────────────────────────────────────────────────────
    // NODE 4: ADSR AMPLITUDE ENVELOPE & LFO MODULATION MATRIX
    // ──────────────────────────────────────────────────────────────────────────
    const peakGain = (isAccent ? 0.35 : 0.24) * track.volume;
    const sustainGain = Math.max(0.0001, peakGain * track.sustain);
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, t);

    gainNode.gain.linearRampToValueAtTime(peakGain, t + Math.max(0.005, track.attack));
    gainNode.gain.exponentialRampToValueAtTime(sustainGain, t + track.attack + Math.max(0.01, track.decay));
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      t + track.attack + track.decay + Math.max(0.02, track.release)
    );

    let lfo: OscillatorNode | undefined;
    let lfoGain: GainNode | undefined;
    if (track.lfoDepth > 0) {
      lfo = ctx.createOscillator();
      lfo.type = track.lfoWaveform;
      lfo.frequency.setValueAtTime(track.lfoRate, t);

      lfoGain = ctx.createGain();
      if (track.lfoTarget === 'filter') {
        const modAmount = track.lfoDepth * baseCutoff * 0.6;
        lfoGain.gain.setValueAtTime(modAmount, t);
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
      } else if (track.lfoTarget === 'pitch' && osc1) {
        const pitchMod = track.lfoDepth * 35;
        lfoGain.gain.setValueAtTime(pitchMod, t);
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.detune);
      } else if (track.lfoTarget === 'amp') {
        const ampMod = track.lfoDepth * 0.25;
        lfoGain.gain.setValueAtTime(ampMod, t);
        lfo.connect(lfoGain);
        lfoGain.connect(gainNode.gain);
      }
      lfo.start(t);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NODE 5: STEREO PAN & MASTER FX ROUTING
    // ──────────────────────────────────────────────────────────────────────────
    let panner: StereoPannerNode | undefined;
    if (ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(track.pan, t);
      if (track.lfoTarget === 'pan' && lfo && lfoGain) {
        lfoGain.gain.setValueAtTime(track.lfoDepth * 0.8, t);
        lfo.connect(lfoGain);
        lfoGain.connect(panner.pan);
      }
    }

    voiceMix.connect(filter);
    filter.connect(gainNode);

    if (panner) {
      gainNode.connect(panner);
      panner.connect(masterGain);
      if (this.delayNode && this.delayMix > 0) panner.connect(this.delayNode);
      if (this.reverbConvolver && this.reverbMix > 0) panner.connect(this.reverbConvolver);
    } else {
      gainNode.connect(masterGain);
      if (this.delayNode && this.delayMix > 0) gainNode.connect(this.delayNode);
      if (this.reverbConvolver && this.reverbMix > 0) gainNode.connect(this.reverbConvolver);
    }

    const stopTime = t + track.attack + track.decay + track.release + 0.1;
    if (osc1) osc1.stop(stopTime);
    if (osc2) osc2.stop(stopTime);
    if (noiseSource) noiseSource.stop(stopTime);
    if (lfo) lfo.stop(stopTime);

    this.activeVoices.set(voiceKey, {
      osc1,
      osc2,
      noise: noiseSource,
      filter,
      gain: gainNode,
      lfo,
      lfoGain,
      panNode: panner,
      startTime: t,
    });

    // Auto cleanup voice from map
    setTimeout(() => {
      this.activeVoices.delete(voiceKey);
    }, (track.attack + track.decay + track.release + 0.2) * 1000);
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
      if (voice.lfo) voice.lfo.stop();
    } catch {}
    this.activeVoices.delete(voiceKey);
  }

  public stopAll() {
    Array.from(this.activeVoices.keys()).forEach((k) => this.stopVoice(k));
  }

  /* -------------------------------------------------------------------------- */
  /*                     CLOSED-LOOP SEQUENCER ENGINE                           */
  /* -------------------------------------------------------------------------- */

  public subscribeStep(listener: (step: number) => void): () => void {
    this.onStepListeners.add(listener);
    return () => this.onStepListeners.delete(listener);
  }

  public isPlayingSeq(): boolean {
    return this.isSequencerPlaying;
  }

  public toggleSequencer(): boolean {
    if (this.isSequencerPlaying) {
      this.stopSequencer();
    } else {
      this.startSequencer();
    }
    return this.isSequencerPlaying;
  }

  public startSequencer() {
    if (this.isSequencerPlaying) return;
    this.isSequencerPlaying = true;
    this.currentStep = 0;
    this.restartSequencerTimer();
  }

  public stopSequencer() {
    this.isSequencerPlaying = false;
    if (this.sequencerTimer) {
      clearInterval(this.sequencerTimer);
      this.sequencerTimer = null;
    }
    this.stopAll();
  }

  private restartSequencerTimer() {
    if (this.sequencerTimer) clearInterval(this.sequencerTimer);
    const intervalMs = (60 / this.bpm / 4) * 1000; // 16th note subdivision

    this.sequencerTimer = setInterval(() => {
      this.tickSequencer();
    }, intervalMs);
  }

  private tickSequencer() {
    const hasSolo = this.tracks.some((t) => t.solo);

    this.tracks.forEach((track) => {
      if (track.muted) return;
      if (hasSolo && !track.solo) return;

      const stepNotes = track.grid[this.currentStep] || [];
      const isAccent = track.accents[this.currentStep] || false;

      stepNotes.forEach((noteIdx) => {
        if (noteIdx !== null && noteIdx !== undefined && PIANO_ROLL_NOTES[noteIdx]) {
          this.triggerTrackVoice(track.id, noteIdx, isAccent);
        }
      });
    });

    this.onStepListeners.forEach((fn) => fn(this.currentStep));
    this.currentStep = (this.currentStep + 1) % this.totalSteps;
  }
}

export const modularSynth = new ModularSynth();
