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

const MARIO_TRK1_GRID: number[][] = [
  // BAR 1
  [32], [], [32], [], [], [32], [], [36], [32], [], [], [29], [], [], [], [41],
  // BAR 2
  [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 3
  [36], [], [], [41], [], [], [44], [], [], [39], [], [37], [], [38], [39], [],
  // BAR 4
  [41], [32], [29], [27], [], [31], [29], [], [32], [], [36], [34], [37], [], [], [],
  // BAR 5
  [36], [], [], [41], [], [], [44], [], [], [39], [], [37], [], [38], [39], [],
  // BAR 6
  [41], [32], [29], [27], [], [31], [29], [], [32], [], [36], [34], [37], [], [36], [],
  // BAR 7
  [], [], [29], [30], [31], [33], [32], [], [40], [39], [36], [], [39], [36], [34], [],
  // BAR 8
  [], [], [29], [30], [31], [33], [32], [], [24], [], [24], [24], [], [], [], [],
  // BAR 9
  [], [], [29], [30], [31], [33], [32], [], [40], [39], [36], [], [39], [36], [34], [],
  // BAR 10
  [], [], [33], [], [], [34], [], [], [36], [], [], [], [], [], [], [],
  // BAR 11
  [], [], [29], [30], [31], [33], [32], [], [40], [39], [36], [], [39], [36], [34], [],
  // BAR 12
  [], [], [29], [30], [31], [33], [32], [], [24], [], [24], [24], [], [], [], [],
  // BAR 13
  [36], [36], [], [36], [], [36], [34], [], [32], [36], [], [39], [41], [], [], [],
  // BAR 14
  [36], [36], [], [36], [], [36], [34], [32], [], [], [], [], [], [], [], [],
  // BAR 15
  [36], [36], [], [36], [], [36], [34], [], [32], [36], [], [39], [41], [], [], [],
  // BAR 16
  [32], [], [32], [], [], [32], [], [36], [32], [], [], [29], [], [], [], [41],
  // BAR 17
  [36], [], [], [41], [], [], [44], [], [], [39], [], [37], [], [38], [39], [],
  // BAR 18
  [41], [32], [29], [27], [], [31], [29], [], [32], [], [36], [34], [37], [], [], [],
  // BAR 19
  [36], [], [], [41], [], [], [44], [], [], [39], [], [37], [], [38], [39], [],
  // BAR 20
  [41], [32], [29], [27], [], [31], [29], [], [32], [], [36], [34], [37], [], [36], [],
  // BAR 21
  [32], [], [32], [], [34], [], [34], [], [36], [], [36], [], [34], [], [32], [],
  // BAR 22
  [32], [], [32], [], [34], [], [34], [], [36], [], [36], [], [34], [], [32], [],
  // BAR 23
  [34], [], [34], [], [36], [], [36], [], [37], [], [37], [], [36], [], [34], [],
  // BAR 24
  [32], [], [32], [], [34], [], [34], [], [36], [], [36], [], [34], [], [32], [],
  // BAR 25
  [48], [36], [47], [35], [46], [34], [], [48], [36], [47], [35], [46], [34], [], [], [],
  // BAR 26
  [49], [37], [48], [36], [47], [35], [], [49], [37], [48], [36], [47], [35], [], [], [],
  // BAR 27
  [41], [36], [32], [29], [24], [20], [17], [20], [17], [], [], [], [17], [], [], [],
  // BAR 28
  [40], [36], [33], [28], [24], [21], [16], [21], [], [], [], [], [16], [], [], [],
  // BAR 29
  [38], [34], [31], [26], [22], [19], [14], [19], [], [], [], [], [12], [], [12], [],
  // BAR 30
  [12], [], [], [], [12], [], [], [], [12], [], [], [], [], [], [], [],
  // BAR 31
  [36], [], [36], [], [34], [], [32], [], [39], [], [37], [], [41], [], [], [],
  // BAR 32
  [32], [], [32], [], [], [32], [], [36], [32], [], [], [29], [], [], [], [41],
];

const MARIO_TRK1_ACCENTS: boolean[] = [
  // BAR 1
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 2
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 3
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 4
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 5
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 6
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 7
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 8
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 9
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 10
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 11
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 12
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 13
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 14
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 15
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 16
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 17
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 18
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 19
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 20
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 21
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 22
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 23
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 24
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 25
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 26
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 27
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 28
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 29
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 30
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 31
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 32
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
];

const MARIO_TRK2_GRID: number[][] = [
  // BAR 1
  [42, 46], [], [42, 46], [], [], [42, 46], [], [44, 48], [42, 46], [], [], [37, 41], [], [], [], [49, 53],
  // BAR 2
  [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 3
  [44], [], [], [44], [], [], [48], [], [], [43], [], [41], [], [42], [43], [],
  // BAR 4
  [44], [36], [32], [31], [], [34], [32], [], [36], [], [39], [37], [41], [], [], [],
  // BAR 5
  [44], [], [], [44], [], [], [48], [], [], [43], [], [41], [], [42], [43], [],
  // BAR 6
  [44], [36], [32], [31], [], [34], [32], [], [36], [], [39], [37], [41], [], [44], [],
  // BAR 7
  [], [], [32], [33], [34], [37], [36], [], [44], [43], [39], [], [43], [39], [37], [],
  // BAR 8
  [], [], [32], [33], [34], [37], [36], [], [29, 32], [], [29, 32], [29, 32], [], [], [], [],
  // BAR 9
  [], [], [32], [33], [34], [37], [36], [], [44], [43], [39], [], [43], [39], [37], [],
  // BAR 10
  [], [], [37], [], [], [38], [], [], [39], [], [], [], [], [], [], [],
  // BAR 11
  [], [], [32], [33], [34], [37], [36], [], [44], [43], [39], [], [43], [39], [37], [],
  // BAR 12
  [], [], [32], [33], [34], [37], [36], [], [29, 32], [], [29, 32], [29, 32], [], [], [], [],
  // BAR 13
  [41], [41], [], [41], [], [41], [39], [], [36], [41], [], [43], [44], [], [], [],
  // BAR 14
  [41], [41], [], [41], [], [41], [39], [36], [], [], [], [], [], [], [], [],
  // BAR 15
  [41], [41], [], [41], [], [41], [39], [], [36], [41], [], [43], [44], [], [], [],
  // BAR 16
  [42, 46], [], [42, 46], [], [], [42, 46], [], [44, 48], [42, 46], [], [], [37, 41], [], [], [], [49, 53],
  // BAR 17
  [44], [], [], [44], [], [], [48], [], [], [43], [], [41], [], [42], [43], [],
  // BAR 18
  [44], [36], [32], [31], [], [34], [32], [], [36], [], [39], [37], [41], [], [], [],
  // BAR 19
  [44], [], [], [44], [], [], [48], [], [], [43], [], [41], [], [42], [43], [],
  // BAR 20
  [44], [36], [32], [31], [], [34], [32], [], [36], [], [39], [37], [41], [], [44], [],
  // BAR 21
  [36], [], [36], [], [37], [], [37], [], [39], [], [39], [], [37], [], [36], [],
  // BAR 22
  [36], [], [36], [], [37], [], [37], [], [39], [], [39], [], [37], [], [36], [],
  // BAR 23
  [37], [], [37], [], [39], [], [39], [], [41], [], [41], [], [39], [], [37], [],
  // BAR 24
  [36], [], [36], [], [37], [], [37], [], [39], [], [39], [], [37], [], [36], [],
  // BAR 25
  [53], [], [52], [], [51], [], [], [53], [], [52], [], [51], [], [], [], [],
  // BAR 26
  [54], [], [53], [], [52], [], [], [54], [], [53], [], [52], [], [], [], [],
  // BAR 27
  [44], [41], [36], [32], [29], [24], [20], [24], [20], [], [], [], [20], [], [], [],
  // BAR 28
  [43], [40], [36], [31], [28], [24], [19], [24], [], [], [], [], [19], [], [], [],
  // BAR 29
  [43], [38], [34], [31], [26], [22], [19], [22], [], [], [], [], [20, 24], [], [20, 24], [],
  // BAR 30
  [20, 24], [], [], [], [20, 24], [], [], [], [20, 24], [], [], [], [], [], [], [],
  // BAR 31
  [44], [], [44], [], [43], [], [41], [], [43], [], [41], [], [44], [], [], [],
  // BAR 32
  [42, 46], [], [42, 46], [], [], [42, 46], [], [44, 48], [42, 46], [], [], [37, 41], [], [], [], [49, 53],
];

const MARIO_TRK2_ACCENTS: boolean[] = [
  // BAR 1
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 2
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 3
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 4
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 5
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 6
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 7
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 8
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 9
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 10
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 11
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 12
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 13
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 14
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 15
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 16
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 17
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 18
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 19
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 20
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 21
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 22
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 23
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 24
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 25
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 26
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 27
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 28
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 29
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 30
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 31
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 32
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
];

const MARIO_TRK3_GRID: number[][] = [
  // BAR 1
  [58], [], [58], [], [], [58], [], [58], [58], [], [], [53], [], [], [], [65],
  // BAR 2
  [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 3
  [60], [], [], [65], [], [], [68], [], [], [63], [], [61], [], [62], [63], [],
  // BAR 4
  [65], [60], [56], [55], [], [58], [56], [], [60], [], [63], [61], [65], [], [], [],
  // BAR 5
  [60], [], [], [65], [], [], [68], [], [], [63], [], [61], [], [62], [63], [],
  // BAR 6
  [65], [60], [56], [55], [], [58], [56], [], [60], [], [63], [61], [65], [], [60], [],
  // BAR 7
  [60], [], [65], [], [60], [], [65], [], [60], [], [67], [], [60], [], [67], [],
  // BAR 8
  [60], [], [65], [], [60], [], [65], [], [60], [], [60], [60], [], [], [], [],
  // BAR 9
  [60], [], [65], [], [60], [], [65], [], [60], [], [67], [], [60], [], [67], [],
  // BAR 10
  [], [], [64], [], [], [62], [], [], [60], [], [], [], [], [], [], [],
  // BAR 11
  [60], [], [65], [], [60], [], [65], [], [60], [], [67], [], [60], [], [67], [],
  // BAR 12
  [60], [], [65], [], [60], [], [65], [], [60], [], [60], [60], [], [], [], [],
  // BAR 13
  [60], [60], [], [60], [], [60], [58], [], [56], [60], [], [63], [65], [], [], [],
  // BAR 14
  [60], [60], [], [60], [], [60], [58], [56], [], [], [], [], [], [], [], [],
  // BAR 15
  [60], [60], [], [60], [], [60], [58], [], [56], [60], [], [63], [65], [], [], [],
  // BAR 16
  [58], [], [58], [], [], [58], [], [58], [58], [], [], [53], [], [], [], [65],
  // BAR 17
  [60], [], [], [65], [], [], [68], [], [], [63], [], [61], [], [62], [63], [],
  // BAR 18
  [65], [60], [56], [55], [], [58], [56], [], [60], [], [63], [61], [65], [], [], [],
  // BAR 19
  [60], [], [], [65], [], [], [68], [], [], [63], [], [61], [], [62], [63], [],
  // BAR 20
  [65], [60], [56], [55], [], [58], [56], [], [60], [], [63], [61], [65], [], [60], [],
  // BAR 21
  [60], [72], [60], [72], [60], [72], [60], [72], [60], [72], [60], [72], [60], [72], [60], [72],
  // BAR 22
  [60], [72], [60], [72], [60], [72], [60], [72], [60], [72], [60], [72], [60], [72], [60], [72],
  // BAR 23
  [62], [74], [62], [74], [62], [74], [62], [74], [62], [74], [62], [74], [62], [74], [62], [74],
  // BAR 24
  [60], [72], [60], [72], [60], [72], [60], [72], [60], [72], [60], [72], [60], [72], [60], [72],
  // BAR 25
  [60], [], [59], [], [58], [], [], [60], [], [59], [], [58], [], [], [], [],
  // BAR 26
  [61], [], [60], [], [59], [], [], [61], [], [60], [], [59], [], [], [], [],
  // BAR 27
  [60], [56], [53], [48], [44], [41], [36], [41], [36], [], [], [], [36], [], [], [],
  // BAR 28
  [64], [60], [57], [52], [48], [45], [40], [45], [], [], [], [], [40], [], [], [],
  // BAR 29
  [62], [58], [55], [50], [46], [43], [38], [43], [], [], [], [], [48], [], [48], [],
  // BAR 30
  [48], [], [], [], [48], [], [], [], [48], [], [], [], [], [], [], [],
  // BAR 31
  [60], [], [60], [], [58], [], [56], [], [67], [], [65], [], [60], [], [], [],
  // BAR 32
  [58], [], [58], [], [], [58], [], [58], [58], [], [], [53], [], [], [], [65],
];

const MARIO_TRK3_ACCENTS: boolean[] = [
  // BAR 1
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 2
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 3
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 4
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 5
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 6
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 7
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 8
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 9
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 10
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 11
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 12
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 13
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 14
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 15
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 16
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 17
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 18
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 19
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 20
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 21
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 22
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 23
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 24
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 25
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 26
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 27
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 28
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 29
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 30
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 31
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
  // BAR 32
  true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false,
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
