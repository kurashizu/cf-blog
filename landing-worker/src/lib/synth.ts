import { soundEngine } from './sound';

export type SynthWaveform = 'sawtooth' | 'square' | 'sine' | 'triangle' | 'noise';

export function getWaveformAbbr(w: SynthWaveform): string {
  switch (w) {
    case 'sawtooth': return 'SAW';
    case 'square': return 'SQR';
    case 'sine': return 'SIN';
    case 'triangle': return 'TRI';
    case 'noise': return 'NOI';
    default: return 'SIN';
  }
}
export type BlendMode = 'layer' | 'fm' | 'ring' | 'sync';
export type FilterType = 'lowpass' | 'bandpass' | 'highpass' | 'notch';
export type LfoWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';
export type LfoTarget = 'filter' | 'pitch' | 'amp' | 'morph' | 'pan';

export type NoteDurationDiv = '4' | '2' | '1' | '1/2' | '1/4' | '1/8';

export function divToStepSpan(div: NoteDurationDiv): number {
  switch (div) {
    case '4': return 32; // Whole note: 4 beats = 32 steps (at 1/8 beat per step)
    case '2': return 16; // Half note: 2 beats = 16 steps
    case '1': return 8;  // Quarter note: 1 beat = 8 steps
    case '1/2': return 4;// Eighth note: 1/2 beat = 4 steps
    case '1/4': return 2;// Sixteenth note: 1/4 beat = 2 steps
    case '1/8': return 1;// 32nd note: 1/8 beat = 1 step
    default: return 1;
  }
}

export function divToColumnSpan(div: NoteDurationDiv): number {
  switch (div) {
    case '4': return 16; // Whole note: 16 visual columns (4 beats)
    case '2': return 8;  // Half note: 8 visual columns (2 beats)
    case '1': return 4;  // Quarter note: 4 visual columns (1 beat)
    case '1/2': return 2;// Eighth note: 2 visual columns (1/2 beat)
    case '1/4': return 1;// Sixteenth note: 1 visual column (1/4 beat)
    case '1/8': return 0.5; // 32nd note: 1/2 visual column (1/8 beat)
    default: return 1;
  }
}

export type TimeSignature = '4/4' | '3/4' | '2/4' | '5/4' | '6/8' | '7/8';

export interface MeterSpec {
  sig: TimeSignature;
  label: string;
  name: string;
  beatsPerBar: number;
  colsPerBar: number;
  colsPerBeat: number;
  stepsPerBar: number;      // total 1/8-beat steps per measure
  downbeatInterval: number; // steps per primary beat
}

export const METER_SPECS: Record<TimeSignature, MeterSpec> = {
  '4/4': { sig: '4/4', label: '4/4', name: '4/4 Common Time', beatsPerBar: 4, colsPerBar: 16, colsPerBeat: 4, stepsPerBar: 32, downbeatInterval: 8 },
  '3/4': { sig: '3/4', label: '3/4', name: '3/4 Waltz Time', beatsPerBar: 3, colsPerBar: 12, colsPerBeat: 4, stepsPerBar: 24, downbeatInterval: 8 },
  '2/4': { sig: '2/4', label: '2/4', name: '2/4 March Time', beatsPerBar: 2, colsPerBar: 8, colsPerBeat: 4, stepsPerBar: 16, downbeatInterval: 8 },
  '5/4': { sig: '5/4', label: '5/4', name: '5/4 Odd Meter', beatsPerBar: 5, colsPerBar: 20, colsPerBeat: 4, stepsPerBar: 40, downbeatInterval: 8 },
  '6/8': { sig: '6/8', label: '6/8', name: '6/8 Compound Time', beatsPerBar: 6, colsPerBar: 12, colsPerBeat: 2, stepsPerBar: 24, downbeatInterval: 4 },
  '7/8': { sig: '7/8', label: '7/8', name: '7/8 Complex Time', beatsPerBar: 7, colsPerBar: 14, colsPerBeat: 2, stepsPerBar: 28, downbeatInterval: 4 },
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
  // BAR 1A (Steps 0..15)
  [32], [], [32], [], [], [], [32], [], [], [], [36], [], [32], [], [], [],
  // BAR 1B (Steps 16..31)
  [29], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 2A (Steps 32..47)
  [36], [], [], [], [], [], [41], [], [], [], [], [], [44], [], [], [],
  // BAR 2B (Steps 48..63)
  [], [], [39], [], [], [], [37], [], [], [], [38], [], [39], [], [], [],
  // BAR 3A (Steps 64..79)
  [41], [], [], [32], [], [29], [], [], [27], [], [], [], [31], [], [29], [],
  // BAR 3B (Steps 80..95)
  [], [], [32], [], [], [], [36], [], [34], [], [37], [], [], [], [], [],
  // BAR 4A (Steps 96..111)
  [36], [], [], [], [], [], [41], [], [], [], [], [], [44], [], [], [],
  // BAR 4B (Steps 112..127)
  [], [], [39], [], [], [], [37], [], [], [], [38], [], [39], [], [], [],
  // BAR 5A (Steps 128..143)
  [41], [], [], [32], [], [29], [], [], [27], [], [], [], [31], [], [29], [],
  // BAR 5B (Steps 144..159)
  [], [], [32], [], [], [], [36], [], [34], [], [37], [], [], [], [], [],
  // BAR 6A (Steps 160..175)
  [], [], [], [], [29], [], [30], [], [31], [], [33], [], [], [], [32], [],
  // BAR 6B (Steps 176..191)
  [], [], [40], [], [39], [], [36], [], [], [], [39], [], [36], [], [34], [],
  // BAR 7A (Steps 192..207)
  [], [], [], [], [29], [], [30], [], [31], [], [33], [], [], [], [32], [],
  // BAR 7B (Steps 208..223)
  [], [], [24], [], [], [], [24], [], [24], [], [], [], [], [], [], [],
  // BAR 8A (Steps 224..239)
  [], [], [], [], [29], [], [30], [], [31], [], [33], [], [], [], [32], [],
  // BAR 8B (Steps 240..255)
  [], [], [40], [], [39], [], [36], [], [], [], [39], [], [36], [], [34], [],
  // BAR 9A (Steps 256..271)
  [], [], [], [], [33], [], [], [], [], [], [34], [], [], [], [], [],
  // BAR 9B (Steps 272..287)
  [36], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 10A (Steps 288..303)
  [], [], [], [], [29], [], [30], [], [31], [], [33], [], [], [], [32], [],
  // BAR 10B (Steps 304..319)
  [], [], [40], [], [39], [], [36], [], [], [], [39], [], [36], [], [34], [],
  // BAR 11A (Steps 320..335)
  [], [], [], [], [29], [], [30], [], [31], [], [33], [], [], [], [32], [],
  // BAR 11B (Steps 336..351)
  [], [], [24], [], [], [], [24], [], [24], [], [], [], [], [], [], [],
  // BAR 12A (Steps 352..367)
  [], [], [], [], [29], [], [30], [], [31], [], [33], [], [], [], [32], [],
  // BAR 12B (Steps 368..383)
  [], [], [40], [], [39], [], [36], [], [], [], [39], [], [36], [], [34], [],
  // BAR 13A (Steps 384..399)
  [], [], [], [], [33], [], [], [], [], [], [34], [], [], [], [], [],
  // BAR 13B (Steps 400..415)
  [36], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 14A (Steps 416..431)
  [36], [], [36], [], [], [], [36], [], [], [], [36], [], [34], [], [], [],
  // BAR 14B (Steps 432..447)
  [32], [], [36], [], [], [], [39], [], [41], [], [], [], [], [], [], [],
  // BAR 15A (Steps 448..463)
  [36], [], [36], [], [], [], [36], [], [], [], [36], [], [34], [], [32], [],
  // BAR 15B (Steps 464..479)
  [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 16A (Steps 480..495)
  [36], [], [36], [], [], [], [36], [], [], [], [36], [], [34], [], [], [],
  // BAR 16B (Steps 496..511)
  [32], [], [36], [], [], [], [39], [], [41], [], [], [], [], [], [], [],
  // BAR 17A (Steps 512..527)
  [32], [], [32], [], [], [], [32], [], [], [], [36], [], [32], [], [], [],
  // BAR 17B (Steps 528..543)
  [29], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 18A (Steps 544..559)
  [36], [], [], [], [], [], [41], [], [], [], [], [], [44], [], [], [],
  // BAR 18B (Steps 560..575)
  [], [], [39], [], [], [], [37], [], [], [], [38], [], [39], [], [], [],
  // BAR 19A (Steps 576..591)
  [41], [], [], [32], [], [29], [], [], [27], [], [], [], [31], [], [29], [],
  // BAR 19B (Steps 592..607)
  [], [], [32], [], [], [], [36], [], [34], [], [37], [], [], [], [], [],
  // BAR 20A (Steps 608..623)
  [36], [], [], [], [], [], [41], [], [], [], [], [], [44], [], [], [],
  // BAR 20B (Steps 624..639)
  [], [], [39], [], [], [], [37], [], [], [], [38], [], [39], [], [], [],
  // BAR 21A (Steps 640..655)
  [41], [], [], [32], [], [29], [], [], [27], [], [], [], [31], [], [29], [],
  // BAR 21B (Steps 656..671)
  [], [], [32], [], [], [], [36], [], [34], [], [37], [], [], [], [], [],
  // BAR 22A (Steps 672..687)
  [32], [], [36], [], [], [], [41], [], [], [], [], [], [40], [], [], [],
  // BAR 22B (Steps 688..703)
  [39], [], [31], [], [], [], [31], [], [39], [], [], [], [], [], [], [],
  // BAR 23A (Steps 704..719)
  [37], [], [], [27], [], [27], [], [], [27], [], [], [29], [], [31], [], [],
  // BAR 23B (Steps 720..735)
  [32], [], [36], [], [], [], [39], [], [41], [], [], [], [], [], [], [],
  // BAR 24A (Steps 736..751)
  [32], [], [36], [], [], [], [41], [], [], [], [], [], [40], [], [], [],
  // BAR 24B (Steps 752..767)
  [39], [], [31], [], [], [], [31], [], [39], [], [], [], [], [], [], [],
  // BAR 25A (Steps 768..783)
  [37], [], [31], [], [], [], [31], [], [31], [], [], [32], [], [34], [], [],
  // BAR 25B (Steps 784..799)
  [36], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 26A (Steps 800..815)
  [32], [], [36], [], [], [], [41], [], [], [], [], [], [40], [], [], [],
  // BAR 26B (Steps 816..831)
  [39], [], [31], [], [], [], [31], [], [39], [], [], [], [], [], [], [],
  // BAR 27A (Steps 832..847)
  [37], [], [], [27], [], [27], [], [], [27], [], [], [29], [], [31], [], [],
  // BAR 27B (Steps 848..863)
  [32], [], [36], [], [], [], [39], [], [41], [], [], [], [], [], [], [],
  // BAR 28A (Steps 864..879)
  [32], [], [36], [], [], [], [41], [], [], [], [], [], [40], [], [], [],
  // BAR 28B (Steps 880..895)
  [39], [], [31], [], [], [], [31], [], [39], [], [], [], [], [], [], [],
  // BAR 29A (Steps 896..911)
  [37], [], [31], [], [], [], [31], [], [31], [], [], [32], [], [34], [], [],
  // BAR 29B (Steps 912..927)
  [36], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 30A (Steps 928..943)
  [36], [], [36], [], [], [], [36], [], [], [], [36], [], [34], [], [], [],
  // BAR 30B (Steps 944..959)
  [32], [], [36], [], [], [], [39], [], [41], [], [], [], [], [], [], [],
  // BAR 31A (Steps 960..975)
  [36], [], [36], [], [], [], [36], [], [], [], [36], [], [34], [], [32], [],
  // BAR 31B (Steps 976..991)
  [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 32A (Steps 992..1007)
  [36], [], [36], [], [], [], [36], [], [], [], [36], [], [34], [], [], [],
  // BAR 32B (Steps 1008..1023)
  [32], [], [36], [], [], [], [39], [], [41], [], [], [], [], [], [], [],
  // BAR 33A (Steps 1024..1039)
  [32], [], [32], [], [], [], [32], [], [], [], [36], [], [32], [], [], [],
  // BAR 33B (Steps 1040..1055)
  [29], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 34A (Steps 1056..1071)
  [32], [], [36], [], [], [], [41], [], [], [], [], [], [40], [], [], [],
  // BAR 34B (Steps 1072..1087)
  [39], [], [31], [], [], [], [31], [], [39], [], [], [], [], [], [], [],
  // BAR 35A (Steps 1088..1103)
  [37], [], [], [27], [], [27], [], [], [27], [], [], [29], [], [31], [], [],
  // BAR 35B (Steps 1104..1119)
  [32], [], [36], [], [], [], [39], [], [41], [], [], [], [], [], [], [],
  // BAR 36A (Steps 1120..1135)
  [32], [], [36], [], [], [], [41], [], [], [], [], [], [40], [], [], [],
  // BAR 36B (Steps 1136..1151)
  [39], [], [31], [], [], [], [31], [], [39], [], [], [], [], [], [], [],
  // BAR 37A (Steps 1152..1167)
  [37], [], [31], [], [], [], [31], [], [31], [], [], [32], [], [34], [], [],
  // BAR 37B (Steps 1168..1183)
  [36], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
];

const MARIO_TRK1_ACCENTS: boolean[] = [
  // BAR 1A (Steps 0..15)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 1B (Steps 16..31)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 2A (Steps 32..47)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 2B (Steps 48..63)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 3A (Steps 64..79)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 3B (Steps 80..95)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 4A (Steps 96..111)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 4B (Steps 112..127)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 5A (Steps 128..143)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 5B (Steps 144..159)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 6A (Steps 160..175)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 6B (Steps 176..191)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 7A (Steps 192..207)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 7B (Steps 208..223)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 8A (Steps 224..239)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 8B (Steps 240..255)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 9A (Steps 256..271)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 9B (Steps 272..287)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 10A (Steps 288..303)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 10B (Steps 304..319)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 11A (Steps 320..335)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 11B (Steps 336..351)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 12A (Steps 352..367)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 12B (Steps 368..383)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 13A (Steps 384..399)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 13B (Steps 400..415)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 14A (Steps 416..431)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 14B (Steps 432..447)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 15A (Steps 448..463)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 15B (Steps 464..479)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 16A (Steps 480..495)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 16B (Steps 496..511)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 17A (Steps 512..527)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 17B (Steps 528..543)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 18A (Steps 544..559)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 18B (Steps 560..575)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 19A (Steps 576..591)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 19B (Steps 592..607)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 20A (Steps 608..623)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 20B (Steps 624..639)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 21A (Steps 640..655)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 21B (Steps 656..671)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 22A (Steps 672..687)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 22B (Steps 688..703)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 23A (Steps 704..719)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 23B (Steps 720..735)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 24A (Steps 736..751)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 24B (Steps 752..767)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 25A (Steps 768..783)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 25B (Steps 784..799)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 26A (Steps 800..815)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 26B (Steps 816..831)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 27A (Steps 832..847)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 27B (Steps 848..863)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 28A (Steps 864..879)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 28B (Steps 880..895)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 29A (Steps 896..911)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 29B (Steps 912..927)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 30A (Steps 928..943)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 30B (Steps 944..959)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 31A (Steps 960..975)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 31B (Steps 976..991)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 32A (Steps 992..1007)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 32B (Steps 1008..1023)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 33A (Steps 1024..1039)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 33B (Steps 1040..1055)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 34A (Steps 1056..1071)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 34B (Steps 1072..1087)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 35A (Steps 1088..1103)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 35B (Steps 1104..1119)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 36A (Steps 1120..1135)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 36B (Steps 1136..1151)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 37A (Steps 1152..1167)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 37B (Steps 1168..1183)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
];

const MARIO_TRK2_GRID: number[][] = [
  // BAR 1A (Steps 0..15)
  [42], [], [42], [], [], [], [42], [], [], [], [42], [], [42], [], [], [],
  // BAR 1B (Steps 16..31)
  [37], [], [], [], [], [], [], [], [41], [], [], [], [], [], [], [],
  // BAR 2A (Steps 32..47)
  [44], [], [], [], [], [], [48], [], [], [], [], [], [53], [], [], [],
  // BAR 2B (Steps 48..63)
  [], [], [48], [], [], [], [46], [], [], [], [47], [], [48], [], [], [],
  // BAR 3A (Steps 64..79)
  [48], [], [], [41], [], [37], [], [], [36], [], [], [], [39], [], [37], [],
  // BAR 3B (Steps 80..95)
  [], [], [39], [], [], [], [44], [], [43], [], [46], [], [], [], [], [],
  // BAR 4A (Steps 96..111)
  [44], [], [], [], [], [], [48], [], [], [], [], [], [53], [], [], [],
  // BAR 4B (Steps 112..127)
  [], [], [48], [], [], [], [46], [], [], [], [47], [], [48], [], [], [],
  // BAR 5A (Steps 128..143)
  [48], [], [], [41], [], [37], [], [], [36], [], [], [], [39], [], [37], [],
  // BAR 5B (Steps 144..159)
  [], [], [39], [], [], [], [44], [], [43], [], [46], [], [], [], [], [],
  // BAR 6A (Steps 160..175)
  [], [], [], [], [32], [], [33], [], [34], [], [37], [], [], [], [36], [],
  // BAR 6B (Steps 176..191)
  [], [], [44], [], [43], [], [41], [], [], [], [48], [], [44], [], [43], [],
  // BAR 7A (Steps 192..207)
  [], [], [], [], [32], [], [33], [], [34], [], [37], [], [], [], [36], [],
  // BAR 7B (Steps 208..223)
  [], [], [31], [], [], [], [31], [], [31], [], [], [], [], [], [], [],
  // BAR 8A (Steps 224..239)
  [], [], [], [], [32], [], [33], [], [34], [], [37], [], [], [], [36], [],
  // BAR 8B (Steps 240..255)
  [], [], [44], [], [43], [], [41], [], [], [], [48], [], [44], [], [43], [],
  // BAR 9A (Steps 256..271)
  [], [], [], [], [40], [], [], [], [], [], [43], [], [], [], [], [],
  // BAR 9B (Steps 272..287)
  [44], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 10A (Steps 288..303)
  [], [], [], [], [32], [], [33], [], [34], [], [37], [], [], [], [36], [],
  // BAR 10B (Steps 304..319)
  [], [], [44], [], [43], [], [41], [], [], [], [48], [], [44], [], [43], [],
  // BAR 11A (Steps 320..335)
  [], [], [], [], [32], [], [33], [], [34], [], [37], [], [], [], [36], [],
  // BAR 11B (Steps 336..351)
  [], [], [31], [], [], [], [31], [], [31], [], [], [], [], [], [], [],
  // BAR 12A (Steps 352..367)
  [], [], [], [], [32], [], [33], [], [34], [], [37], [], [], [], [36], [],
  // BAR 12B (Steps 368..383)
  [], [], [44], [], [43], [], [41], [], [], [], [48], [], [44], [], [43], [],
  // BAR 13A (Steps 384..399)
  [], [], [], [], [40], [], [], [], [], [], [43], [], [], [], [], [],
  // BAR 13B (Steps 400..415)
  [44], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 14A (Steps 416..431)
  [40], [], [40], [], [], [], [40], [], [], [], [40], [], [38], [], [], [],
  // BAR 14B (Steps 432..447)
  [41], [], [44], [], [], [], [44], [], [48], [], [], [], [], [], [], [],
  // BAR 15A (Steps 448..463)
  [40], [], [40], [], [], [], [40], [], [], [], [40], [], [38], [], [41], [],
  // BAR 15B (Steps 464..479)
  [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 16A (Steps 480..495)
  [40], [], [40], [], [], [], [40], [], [], [], [40], [], [38], [], [], [],
  // BAR 16B (Steps 496..511)
  [41], [], [44], [], [], [], [44], [], [48], [], [], [], [], [], [], [],
  // BAR 17A (Steps 512..527)
  [42], [], [42], [], [], [], [42], [], [], [], [42], [], [42], [], [], [],
  // BAR 17B (Steps 528..543)
  [37], [], [], [], [], [], [], [], [41], [], [], [], [], [], [], [],
  // BAR 18A (Steps 544..559)
  [44], [], [], [], [], [], [48], [], [], [], [], [], [53], [], [], [],
  // BAR 18B (Steps 560..575)
  [], [], [48], [], [], [], [46], [], [], [], [47], [], [48], [], [], [],
  // BAR 19A (Steps 576..591)
  [48], [], [], [41], [], [37], [], [], [36], [], [], [], [39], [], [37], [],
  // BAR 19B (Steps 592..607)
  [], [], [39], [], [], [], [44], [], [43], [], [46], [], [], [], [], [],
  // BAR 20A (Steps 608..623)
  [44], [], [], [], [], [], [48], [], [], [], [], [], [53], [], [], [],
  // BAR 20B (Steps 624..639)
  [], [], [48], [], [], [], [46], [], [], [], [47], [], [48], [], [], [],
  // BAR 21A (Steps 640..655)
  [48], [], [], [41], [], [37], [], [], [36], [], [], [], [39], [], [37], [],
  // BAR 21B (Steps 656..671)
  [], [], [39], [], [], [], [44], [], [43], [], [46], [], [], [], [], [],
  // BAR 22A (Steps 672..687)
  [36], [], [39], [], [], [], [44], [], [], [], [], [], [44], [], [], [],
  // BAR 22B (Steps 688..703)
  [43], [], [36], [], [], [], [36], [], [43], [], [], [], [], [], [], [],
  // BAR 23A (Steps 704..719)
  [41], [], [], [31], [], [31], [], [], [31], [], [], [32], [], [34], [], [],
  // BAR 23B (Steps 720..735)
  [36], [], [39], [], [], [], [43], [], [44], [], [], [], [], [], [], [],
  // BAR 24A (Steps 736..751)
  [36], [], [39], [], [], [], [44], [], [], [], [], [], [44], [], [], [],
  // BAR 24B (Steps 752..767)
  [43], [], [36], [], [], [], [36], [], [43], [], [], [], [], [], [], [],
  // BAR 25A (Steps 768..783)
  [41], [], [34], [], [], [], [34], [], [34], [], [], [36], [], [37], [], [],
  // BAR 25B (Steps 784..799)
  [41], [], [44], [], [], [], [44], [], [48], [], [], [], [], [], [], [],
  // BAR 26A (Steps 800..815)
  [36], [], [39], [], [], [], [44], [], [], [], [], [], [44], [], [], [],
  // BAR 26B (Steps 816..831)
  [43], [], [36], [], [], [], [36], [], [43], [], [], [], [], [], [], [],
  // BAR 27A (Steps 832..847)
  [41], [], [], [31], [], [31], [], [], [31], [], [], [32], [], [34], [], [],
  // BAR 27B (Steps 848..863)
  [36], [], [39], [], [], [], [43], [], [44], [], [], [], [], [], [], [],
  // BAR 28A (Steps 864..879)
  [36], [], [39], [], [], [], [44], [], [], [], [], [], [44], [], [], [],
  // BAR 28B (Steps 880..895)
  [43], [], [36], [], [], [], [36], [], [43], [], [], [], [], [], [], [],
  // BAR 29A (Steps 896..911)
  [41], [], [34], [], [], [], [34], [], [34], [], [], [36], [], [37], [], [],
  // BAR 29B (Steps 912..927)
  [41], [], [44], [], [], [], [44], [], [48], [], [], [], [], [], [], [],
  // BAR 30A (Steps 928..943)
  [40], [], [40], [], [], [], [40], [], [], [], [40], [], [38], [], [], [],
  // BAR 30B (Steps 944..959)
  [41], [], [44], [], [], [], [44], [], [48], [], [], [], [], [], [], [],
  // BAR 31A (Steps 960..975)
  [40], [], [40], [], [], [], [40], [], [], [], [40], [], [38], [], [41], [],
  // BAR 31B (Steps 976..991)
  [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [],
  // BAR 32A (Steps 992..1007)
  [40], [], [40], [], [], [], [40], [], [], [], [40], [], [38], [], [], [],
  // BAR 32B (Steps 1008..1023)
  [41], [], [44], [], [], [], [44], [], [48], [], [], [], [], [], [], [],
  // BAR 33A (Steps 1024..1039)
  [42], [], [42], [], [], [], [42], [], [], [], [42], [], [42], [], [], [],
  // BAR 33B (Steps 1040..1055)
  [37], [], [], [], [], [], [], [], [41], [], [], [], [], [], [], [],
  // BAR 34A (Steps 1056..1071)
  [36], [], [39], [], [], [], [44], [], [], [], [], [], [44], [], [], [],
  // BAR 34B (Steps 1072..1087)
  [43], [], [36], [], [], [], [36], [], [43], [], [], [], [], [], [], [],
  // BAR 35A (Steps 1088..1103)
  [41], [], [], [31], [], [31], [], [], [31], [], [], [32], [], [34], [], [],
  // BAR 35B (Steps 1104..1119)
  [36], [], [39], [], [], [], [43], [], [44], [], [], [], [], [], [], [],
  // BAR 36A (Steps 1120..1135)
  [36], [], [39], [], [], [], [44], [], [], [], [], [], [44], [], [], [],
  // BAR 36B (Steps 1136..1151)
  [43], [], [36], [], [], [], [36], [], [43], [], [], [], [], [], [], [],
  // BAR 37A (Steps 1152..1167)
  [41], [], [34], [], [], [], [34], [], [34], [], [], [36], [], [37], [], [],
  // BAR 37B (Steps 1168..1183)
  [41], [], [44], [], [], [], [44], [], [48], [], [], [], [], [], [], [],
];

const MARIO_TRK2_ACCENTS: boolean[] = [
  // BAR 1A (Steps 0..15)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 1B (Steps 16..31)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 2A (Steps 32..47)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 2B (Steps 48..63)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 3A (Steps 64..79)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 3B (Steps 80..95)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 4A (Steps 96..111)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 4B (Steps 112..127)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 5A (Steps 128..143)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 5B (Steps 144..159)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 6A (Steps 160..175)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 6B (Steps 176..191)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 7A (Steps 192..207)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 7B (Steps 208..223)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 8A (Steps 224..239)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 8B (Steps 240..255)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 9A (Steps 256..271)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 9B (Steps 272..287)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 10A (Steps 288..303)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 10B (Steps 304..319)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 11A (Steps 320..335)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 11B (Steps 336..351)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 12A (Steps 352..367)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 12B (Steps 368..383)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 13A (Steps 384..399)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 13B (Steps 400..415)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 14A (Steps 416..431)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 14B (Steps 432..447)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 15A (Steps 448..463)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 15B (Steps 464..479)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 16A (Steps 480..495)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 16B (Steps 496..511)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 17A (Steps 512..527)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 17B (Steps 528..543)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 18A (Steps 544..559)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 18B (Steps 560..575)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 19A (Steps 576..591)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 19B (Steps 592..607)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 20A (Steps 608..623)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 20B (Steps 624..639)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 21A (Steps 640..655)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 21B (Steps 656..671)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 22A (Steps 672..687)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 22B (Steps 688..703)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 23A (Steps 704..719)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 23B (Steps 720..735)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 24A (Steps 736..751)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 24B (Steps 752..767)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 25A (Steps 768..783)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 25B (Steps 784..799)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 26A (Steps 800..815)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 26B (Steps 816..831)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 27A (Steps 832..847)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 27B (Steps 848..863)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 28A (Steps 864..879)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 28B (Steps 880..895)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 29A (Steps 896..911)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 29B (Steps 912..927)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 30A (Steps 928..943)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 30B (Steps 944..959)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 31A (Steps 960..975)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 31B (Steps 976..991)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 32A (Steps 992..1007)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 32B (Steps 1008..1023)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 33A (Steps 1024..1039)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 33B (Steps 1040..1055)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 34A (Steps 1056..1071)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 34B (Steps 1072..1087)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 35A (Steps 1088..1103)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 35B (Steps 1104..1119)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 36A (Steps 1120..1135)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 36B (Steps 1136..1151)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 37A (Steps 1152..1167)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 37B (Steps 1168..1183)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
];

const MARIO_TRK3_GRID: number[][] = [
  // BAR 1A (Steps 0..15)
  [58], [], [58], [], [], [], [58], [], [], [], [58], [], [58], [], [], [],
  // BAR 1B (Steps 16..31)
  [41], [], [], [], [], [], [], [], [53], [], [], [], [], [], [], [],
  // BAR 2A (Steps 32..47)
  [53], [], [], [], [], [], [56], [], [], [], [], [], [60], [], [], [],
  // BAR 2B (Steps 48..63)
  [], [], [55], [], [], [], [53], [], [], [], [54], [], [55], [], [], [],
  // BAR 3A (Steps 64..79)
  [56], [], [], [48], [], [44], [], [], [43], [], [], [], [46], [], [44], [],
  // BAR 3B (Steps 80..95)
  [], [], [48], [], [], [], [51], [], [49], [], [53], [], [], [], [], [],
  // BAR 4A (Steps 96..111)
  [53], [], [], [], [], [], [56], [], [], [], [], [], [60], [], [], [],
  // BAR 4B (Steps 112..127)
  [], [], [55], [], [], [], [53], [], [], [], [54], [], [55], [], [], [],
  // BAR 5A (Steps 128..143)
  [56], [], [], [48], [], [44], [], [], [43], [], [], [], [46], [], [44], [],
  // BAR 5B (Steps 144..159)
  [], [], [48], [], [], [], [51], [], [49], [], [53], [], [], [], [], [],
  // BAR 6A (Steps 160..175)
  [60], [], [], [], [], [], [53], [], [], [], [], [], [48], [], [], [],
  // BAR 6B (Steps 176..191)
  [55], [], [], [], [], [], [48], [], [48], [], [], [], [55], [], [], [],
  // BAR 7A (Steps 192..207)
  [60], [], [], [], [], [], [56], [], [], [], [], [], [53], [], [48], [],
  // BAR 7B (Steps 208..223)
  [], [], [29], [], [], [], [29], [], [29], [], [], [], [53], [], [], [],
  // BAR 8A (Steps 224..239)
  [60], [], [], [], [], [], [53], [], [], [], [], [], [48], [], [], [],
  // BAR 8B (Steps 240..255)
  [55], [], [], [], [], [], [48], [], [48], [], [], [], [55], [], [], [],
  // BAR 9A (Steps 256..271)
  [60], [], [], [], [52], [], [], [], [], [], [50], [], [], [], [], [],
  // BAR 9B (Steps 272..287)
  [48], [], [], [], [], [], [53], [], [53], [], [], [], [60], [], [], [],
  // BAR 10A (Steps 288..303)
  [60], [], [], [], [], [], [53], [], [], [], [], [], [48], [], [], [],
  // BAR 10B (Steps 304..319)
  [55], [], [], [], [], [], [48], [], [48], [], [], [], [55], [], [], [],
  // BAR 11A (Steps 320..335)
  [60], [], [], [], [], [], [56], [], [], [], [], [], [53], [], [48], [],
  // BAR 11B (Steps 336..351)
  [], [], [29], [], [], [], [29], [], [29], [], [], [], [53], [], [], [],
  // BAR 12A (Steps 352..367)
  [60], [], [], [], [], [], [53], [], [], [], [], [], [48], [], [], [],
  // BAR 12B (Steps 368..383)
  [55], [], [], [], [], [], [48], [], [48], [], [], [], [55], [], [], [],
  // BAR 13A (Steps 384..399)
  [60], [], [], [], [52], [], [], [], [], [], [50], [], [], [], [], [],
  // BAR 13B (Steps 400..415)
  [48], [], [], [], [], [], [53], [], [53], [], [], [], [60], [], [], [],
  // BAR 14A (Steps 416..431)
  [64], [], [], [], [], [], [57], [], [], [], [], [], [52], [], [], [],
  // BAR 14B (Steps 432..447)
  [53], [], [], [], [], [], [60], [], [], [], [], [], [65], [], [], [],
  // BAR 15A (Steps 448..463)
  [64], [], [], [], [], [], [57], [], [], [], [], [], [52], [], [], [],
  // BAR 15B (Steps 464..479)
  [53], [], [], [], [], [], [60], [], [], [], [], [], [65], [], [], [],
  // BAR 16A (Steps 480..495)
  [64], [], [], [], [], [], [57], [], [], [], [], [], [52], [], [], [],
  // BAR 16B (Steps 496..511)
  [53], [], [], [], [], [], [60], [], [], [], [], [], [65], [], [], [],
  // BAR 17A (Steps 512..527)
  [58], [], [58], [], [], [], [58], [], [], [], [58], [], [58], [], [], [],
  // BAR 17B (Steps 528..543)
  [41], [], [], [], [], [], [], [], [53], [], [], [], [], [], [], [],
  // BAR 18A (Steps 544..559)
  [53], [], [], [], [], [], [56], [], [], [], [], [], [60], [], [], [],
  // BAR 18B (Steps 560..575)
  [], [], [55], [], [], [], [53], [], [], [], [54], [], [55], [], [], [],
  // BAR 19A (Steps 576..591)
  [56], [], [], [48], [], [44], [], [], [43], [], [], [], [46], [], [44], [],
  // BAR 19B (Steps 592..607)
  [], [], [48], [], [], [], [51], [], [49], [], [53], [], [], [], [], [],
  // BAR 20A (Steps 608..623)
  [53], [], [], [], [], [], [56], [], [], [], [], [], [60], [], [], [],
  // BAR 20B (Steps 624..639)
  [], [], [55], [], [], [], [53], [], [], [], [54], [], [55], [], [], [],
  // BAR 21A (Steps 640..655)
  [56], [], [], [48], [], [44], [], [], [43], [], [], [], [46], [], [44], [],
  // BAR 21B (Steps 656..671)
  [], [], [48], [], [], [], [51], [], [49], [], [53], [], [], [], [], [],
  // BAR 22A (Steps 672..687)
  [60], [], [], [], [], [], [54], [], [53], [], [], [], [48], [], [], [],
  // BAR 22B (Steps 688..703)
  [55], [], [], [], [55], [], [], [], [48], [], [48], [], [55], [], [], [],
  // BAR 23A (Steps 704..719)
  [58], [], [], [], [], [], [55], [], [53], [], [], [], [49], [], [], [],
  // BAR 23B (Steps 720..735)
  [53], [], [], [], [53], [], [], [], [48], [], [48], [], [53], [], [], [],
  // BAR 24A (Steps 736..751)
  [60], [], [], [], [], [], [54], [], [53], [], [], [], [48], [], [], [],
  // BAR 24B (Steps 752..767)
  [55], [], [], [], [55], [], [], [], [48], [], [48], [], [55], [], [], [],
  // BAR 25A (Steps 768..783)
  [53], [], [53], [], [], [], [53], [], [53], [], [], [51], [], [49], [], [],
  // BAR 25B (Steps 784..799)
  [48], [], [], [], [53], [], [], [], [60], [], [], [], [], [], [], [],
  // BAR 26A (Steps 800..815)
  [60], [], [], [], [], [], [54], [], [53], [], [], [], [48], [], [], [],
  // BAR 26B (Steps 816..831)
  [55], [], [], [], [55], [], [], [], [48], [], [48], [], [55], [], [], [],
  // BAR 27A (Steps 832..847)
  [58], [], [], [], [], [], [55], [], [53], [], [], [], [49], [], [], [],
  // BAR 27B (Steps 848..863)
  [53], [], [], [], [53], [], [], [], [48], [], [48], [], [53], [], [], [],
  // BAR 28A (Steps 864..879)
  [60], [], [], [], [], [], [54], [], [53], [], [], [], [48], [], [], [],
  // BAR 28B (Steps 880..895)
  [55], [], [], [], [55], [], [], [], [48], [], [48], [], [55], [], [], [],
  // BAR 29A (Steps 896..911)
  [53], [], [53], [], [], [], [53], [], [53], [], [], [51], [], [49], [], [],
  // BAR 29B (Steps 912..927)
  [48], [], [], [], [53], [], [], [], [60], [], [], [], [], [], [], [],
  // BAR 30A (Steps 928..943)
  [64], [], [], [], [], [], [57], [], [], [], [], [], [52], [], [], [],
  // BAR 30B (Steps 944..959)
  [53], [], [], [], [], [], [60], [], [], [], [], [], [65], [], [], [],
  // BAR 31A (Steps 960..975)
  [64], [], [], [], [], [], [57], [], [], [], [], [], [52], [], [], [],
  // BAR 31B (Steps 976..991)
  [53], [], [], [], [], [], [60], [], [], [], [], [], [65], [], [], [],
  // BAR 32A (Steps 992..1007)
  [64], [], [], [], [], [], [57], [], [], [], [], [], [52], [], [], [],
  // BAR 32B (Steps 1008..1023)
  [53], [], [], [], [], [], [60], [], [], [], [], [], [65], [], [], [],
  // BAR 33A (Steps 1024..1039)
  [58], [], [58], [], [], [], [58], [], [], [], [58], [], [58], [], [], [],
  // BAR 33B (Steps 1040..1055)
  [41], [], [], [], [], [], [], [], [53], [], [], [], [], [], [], [],
  // BAR 34A (Steps 1056..1071)
  [60], [], [], [], [], [], [54], [], [53], [], [], [], [48], [], [], [],
  // BAR 34B (Steps 1072..1087)
  [55], [], [], [], [55], [], [], [], [48], [], [48], [], [55], [], [], [],
  // BAR 35A (Steps 1088..1103)
  [58], [], [], [], [], [], [55], [], [53], [], [], [], [49], [], [], [],
  // BAR 35B (Steps 1104..1119)
  [53], [], [], [], [53], [], [], [], [48], [], [48], [], [53], [], [], [],
  // BAR 36A (Steps 1120..1135)
  [60], [], [], [], [], [], [54], [], [53], [], [], [], [48], [], [], [],
  // BAR 36B (Steps 1136..1151)
  [55], [], [], [], [55], [], [], [], [48], [], [48], [], [55], [], [], [],
  // BAR 37A (Steps 1152..1167)
  [53], [], [53], [], [], [], [53], [], [53], [], [], [51], [], [49], [], [],
  // BAR 37B (Steps 1168..1183)
  [48], [], [], [], [53], [], [], [], [60], [], [], [], [], [], [], [],
];

const MARIO_TRK3_ACCENTS: boolean[] = [
  // BAR 1A (Steps 0..15)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 1B (Steps 16..31)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 2A (Steps 32..47)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 2B (Steps 48..63)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 3A (Steps 64..79)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 3B (Steps 80..95)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 4A (Steps 96..111)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 4B (Steps 112..127)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 5A (Steps 128..143)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 5B (Steps 144..159)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 6A (Steps 160..175)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 6B (Steps 176..191)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 7A (Steps 192..207)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 7B (Steps 208..223)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 8A (Steps 224..239)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 8B (Steps 240..255)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 9A (Steps 256..271)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 9B (Steps 272..287)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 10A (Steps 288..303)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 10B (Steps 304..319)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 11A (Steps 320..335)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 11B (Steps 336..351)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 12A (Steps 352..367)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 12B (Steps 368..383)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 13A (Steps 384..399)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 13B (Steps 400..415)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 14A (Steps 416..431)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 14B (Steps 432..447)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 15A (Steps 448..463)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 15B (Steps 464..479)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 16A (Steps 480..495)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 16B (Steps 496..511)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 17A (Steps 512..527)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 17B (Steps 528..543)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 18A (Steps 544..559)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 18B (Steps 560..575)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 19A (Steps 576..591)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 19B (Steps 592..607)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 20A (Steps 608..623)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 20B (Steps 624..639)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 21A (Steps 640..655)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 21B (Steps 656..671)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 22A (Steps 672..687)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 22B (Steps 688..703)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 23A (Steps 704..719)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 23B (Steps 720..735)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 24A (Steps 736..751)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 24B (Steps 752..767)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 25A (Steps 768..783)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 25B (Steps 784..799)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 26A (Steps 800..815)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 26B (Steps 816..831)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 27A (Steps 832..847)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 27B (Steps 848..863)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 28A (Steps 864..879)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 28B (Steps 880..895)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 29A (Steps 896..911)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 29B (Steps 912..927)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 30A (Steps 928..943)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 30B (Steps 944..959)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 31A (Steps 960..975)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 31B (Steps 976..991)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 32A (Steps 992..1007)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 32B (Steps 1008..1023)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 33A (Steps 1024..1039)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 33B (Steps 1040..1055)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 34A (Steps 1056..1071)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 34B (Steps 1072..1087)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 35A (Steps 1088..1103)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 35B (Steps 1104..1119)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 36A (Steps 1120..1135)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 36B (Steps 1136..1151)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 37A (Steps 1152..1167)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 37B (Steps 1168..1183)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
];

const MARIO_TRK4_GRID: number[][] = [
  // BAR 1A (Steps 0..15)
  [48], [], [], [], [48], [], [48], [], [], [], [48], [], [48], [], [], [],
  // BAR 1B (Steps 16..31)
  [48], [], [], [], [], [], [48], [], [], [], [48], [], [48], [], [48], [],
  // BAR 2A (Steps 32..47)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 2B (Steps 48..63)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 3A (Steps 64..79)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 3B (Steps 80..95)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 4A (Steps 96..111)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 4B (Steps 112..127)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 5A (Steps 128..143)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 5B (Steps 144..159)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 6A (Steps 160..175)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 6B (Steps 176..191)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 7A (Steps 192..207)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 7B (Steps 208..223)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 8A (Steps 224..239)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 8B (Steps 240..255)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 9A (Steps 256..271)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 9B (Steps 272..287)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 10A (Steps 288..303)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 10B (Steps 304..319)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 11A (Steps 320..335)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 11B (Steps 336..351)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 12A (Steps 352..367)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 12B (Steps 368..383)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 13A (Steps 384..399)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 13B (Steps 400..415)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 14A (Steps 416..431)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 14B (Steps 432..447)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 15A (Steps 448..463)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 15B (Steps 464..479)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 16A (Steps 480..495)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 16B (Steps 496..511)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 17A (Steps 512..527)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 17B (Steps 528..543)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 18A (Steps 544..559)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 18B (Steps 560..575)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 19A (Steps 576..591)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 19B (Steps 592..607)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 20A (Steps 608..623)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 20B (Steps 624..639)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 21A (Steps 640..655)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 21B (Steps 656..671)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 22A (Steps 672..687)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 22B (Steps 688..703)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 23A (Steps 704..719)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 23B (Steps 720..735)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 24A (Steps 736..751)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 24B (Steps 752..767)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 25A (Steps 768..783)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 25B (Steps 784..799)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 26A (Steps 800..815)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 26B (Steps 816..831)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 27A (Steps 832..847)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 27B (Steps 848..863)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 28A (Steps 864..879)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 28B (Steps 880..895)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 29A (Steps 896..911)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 29B (Steps 912..927)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 30A (Steps 928..943)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 30B (Steps 944..959)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 31A (Steps 960..975)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 31B (Steps 976..991)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 32A (Steps 992..1007)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 32B (Steps 1008..1023)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 33A (Steps 1024..1039)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 33B (Steps 1040..1055)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 34A (Steps 1056..1071)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 34B (Steps 1072..1087)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 35A (Steps 1088..1103)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 35B (Steps 1104..1119)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 36A (Steps 1120..1135)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 36B (Steps 1136..1151)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 37A (Steps 1152..1167)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
  // BAR 37B (Steps 1168..1183)
  [48], [], [], [], [48], [], [48], [], [48], [], [], [], [48], [], [48], [],
];

const MARIO_TRK4_ACCENTS: boolean[] = [
  // BAR 1A (Steps 0..15)
  true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
  // BAR 1B (Steps 16..31)
  true, false, false, false, false, false, true, false, false, false, false, false, false, false, false, false,
  // BAR 2A (Steps 32..47)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 2B (Steps 48..63)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 3A (Steps 64..79)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 3B (Steps 80..95)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 4A (Steps 96..111)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 4B (Steps 112..127)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 5A (Steps 128..143)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 5B (Steps 144..159)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 6A (Steps 160..175)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 6B (Steps 176..191)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 7A (Steps 192..207)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 7B (Steps 208..223)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 8A (Steps 224..239)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 8B (Steps 240..255)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 9A (Steps 256..271)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 9B (Steps 272..287)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 10A (Steps 288..303)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 10B (Steps 304..319)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 11A (Steps 320..335)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 11B (Steps 336..351)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 12A (Steps 352..367)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 12B (Steps 368..383)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 13A (Steps 384..399)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 13B (Steps 400..415)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 14A (Steps 416..431)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 14B (Steps 432..447)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 15A (Steps 448..463)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 15B (Steps 464..479)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 16A (Steps 480..495)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 16B (Steps 496..511)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 17A (Steps 512..527)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 17B (Steps 528..543)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 18A (Steps 544..559)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 18B (Steps 560..575)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 19A (Steps 576..591)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 19B (Steps 592..607)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 20A (Steps 608..623)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 20B (Steps 624..639)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 21A (Steps 640..655)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 21B (Steps 656..671)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 22A (Steps 672..687)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 22B (Steps 688..703)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 23A (Steps 704..719)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 23B (Steps 720..735)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 24A (Steps 736..751)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 24B (Steps 752..767)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 25A (Steps 768..783)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 25B (Steps 784..799)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 26A (Steps 800..815)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 26B (Steps 816..831)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 27A (Steps 832..847)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 27B (Steps 848..863)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 28A (Steps 864..879)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 28B (Steps 880..895)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 29A (Steps 896..911)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 29B (Steps 912..927)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 30A (Steps 928..943)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 30B (Steps 944..959)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 31A (Steps 960..975)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 31B (Steps 976..991)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 32A (Steps 992..1007)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 32B (Steps 1008..1023)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 33A (Steps 1024..1039)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 33B (Steps 1040..1055)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 34A (Steps 1056..1071)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 34B (Steps 1072..1087)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 35A (Steps 1088..1103)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 35B (Steps 1104..1119)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 36A (Steps 1120..1135)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 36B (Steps 1136..1151)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 37A (Steps 1152..1167)
  true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
  // BAR 37B (Steps 1168..1183)
  false, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false,
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

    // Node 1: Authentic NES 2A03 50%/25% Pulse Lead
    osc1Waveform: 'square',
    osc1Gain: 0.95,
    osc2Waveform: 'square',
    osc2Gain: 0.15,
    osc2Ratio: 1.0,
    detuneCents: 2,
    phaseOffset: 0,

    // Node 2: Layer Timbre
    blendMode: 'layer',
    morphAmount: 0.1,

    // Node 3: Punchy Chiptune Lowpass
    filterType: 'lowpass',
    cutoff: 8500,
    resonance: 1.8,
    envFilterMod: 0.35,

    // Node 4: Snappy 8-Bit Envelope
    attack: 0.003,
    decay: 0.12,
    sustain: 0.45,
    release: 0.08,
    lfoWaveform: 'sine',
    lfoRate: 4.5,
    lfoDepth: 0.05,
    lfoTarget: 'pitch',

    grid: MARIO_TRK1_GRID,
    accents: MARIO_TRK1_ACCENTS,
  },
  {
    id: 1,
    name: 'TRK 2: PULSE 2 (HARMONY)',
    color: '#56b6c2',
    volume: 0.85,
    pan: 0.2,
    muted: false,
    solo: false,

    // Node 1: Authentic NES 2A03 Pulse 2 Harmony
    osc1Waveform: 'square',
    osc1Gain: 0.9,
    osc2Waveform: 'square',
    osc2Gain: 0.1,
    osc2Ratio: 1.0,
    detuneCents: -2,
    phaseOffset: 45,

    // Node 2: Layer Timbre
    blendMode: 'layer',
    morphAmount: 0.1,

    // Node 3: Lowpass Filter
    filterType: 'lowpass',
    cutoff: 7200,
    resonance: 1.5,
    envFilterMod: 0.25,

    // Node 4: Chiptune Envelope
    attack: 0.003,
    decay: 0.14,
    sustain: 0.4,
    release: 0.08,
    lfoWaveform: 'triangle',
    lfoRate: 4.0,
    lfoDepth: 0.04,
    lfoTarget: 'pitch',

    grid: MARIO_TRK2_GRID,
    accents: MARIO_TRK2_ACCENTS,
  },
  {
    id: 2,
    name: 'TRK 3: TRIANGLE (BASS)',
    color: '#c678dd',
    volume: 1.0,
    pan: 0.0,
    muted: false,
    solo: false,

    // Node 1: Authentic NES 2A03 Pure Triangle Bass
    osc1Waveform: 'triangle',
    osc1Gain: 1.0,
    osc2Waveform: 'sine',
    osc2Gain: 0.2,
    osc2Ratio: 1.0,
    detuneCents: 0,
    phaseOffset: 0,

    // Node 2: Pure Sub Layer
    blendMode: 'layer',
    morphAmount: 0.05,

    // Node 3: Lowpass Sub-Bass
    filterType: 'lowpass',
    cutoff: 3500,
    resonance: 1.0,
    envFilterMod: 0.15,

    // Node 4: Bouncy Bass Gating
    attack: 0.003,
    decay: 0.2,
    sustain: 0.7,
    release: 0.06,
    lfoWaveform: 'sine',
    lfoRate: 3.0,
    lfoDepth: 0.0,
    lfoTarget: 'filter',

    grid: MARIO_TRK3_GRID,
    accents: MARIO_TRK3_ACCENTS,
  },
  {
    id: 3,
    name: 'TRK 4: NOISE (PERCUSSION)',
    color: '#e06c75',
    volume: 0.9,
    pan: 0.05,
    muted: false,
    solo: false,

    // Node 1: Authentic NES 2A03 White Noise Percussion
    osc1Waveform: 'noise',
    osc1Gain: 0.95,
    osc2Waveform: 'triangle',
    osc2Gain: 0.15,
    osc2Ratio: 1.0,
    detuneCents: 0,
    phaseOffset: 0,

    // Node 2: Percussive Mode
    blendMode: 'layer',
    morphAmount: 0.0,

    // Node 3: Bandpass Snare / Hi-Hat Filter
    filterType: 'bandpass',
    cutoff: 6500,
    resonance: 3.2,
    envFilterMod: 0.4,

    // Node 4: Ultra-Fast Percussion Envelope
    attack: 0.002,
    decay: 0.05,
    sustain: 0.0,
    release: 0.035,
    lfoWaveform: 'square',
    lfoRate: 10.0,
    lfoDepth: 0.0,
    lfoTarget: 'amp',

    grid: MARIO_TRK4_GRID,
    accents: MARIO_TRK4_ACCENTS,
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
  private bpm: number = 105;
  private meter: TimeSignature = '4/4';
  private editNoteDiv: NoteDurationDiv = '1/8';
  private delayMix: number = 0.0;
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
  private totalSteps: number = 1184; // Default 512 steps (32 Bars), configurable: 16, 32, 64, 128, 256, 512
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

  public setGranularity(g: NoteDurationDiv) {
    this.editNoteDiv = g;
  }

  public getGranularity(): NoteDurationDiv {
    return this.editNoteDiv;
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
    this.totalSteps = Math.max(8, Math.min(2048, steps));
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

  public triggerTrackVoice(trackId: number, noteIndex: number, isAccent = false, startTime?: number, durationSec?: number) {
    const track = this.tracks[trackId];
    if (!track || soundEngine.isMuted()) return;

    const noteInfo = PIANO_ROLL_NOTES[noteIndex];
    if (!noteInfo) return;

    const ctx = soundEngine.init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    this.initMasterFX(ctx);

    const voiceKey = `trk_${trackId}_${noteIndex}_${Math.random().toString(36).slice(2, 6)}`;

    const t = startTime !== undefined ? Math.max(ctx.currentTime, startTime) : ctx.currentTime;
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

    const actualAttack = Math.max(0.005, track.attack);
    const actualDecay = Math.max(0.01, track.decay);
    const actualRelease = Math.max(0.02, track.release);
    const holdSec = durationSec !== undefined ? Math.max(0.02, durationSec) : (60 / this.bpm / 8);

    gainNode.gain.linearRampToValueAtTime(peakGain, t + actualAttack);
    gainNode.gain.exponentialRampToValueAtTime(sustainGain, t + actualAttack + actualDecay);
    
    const releaseStartTime = Math.max(t + actualAttack + actualDecay, t + holdSec);
    gainNode.gain.setValueAtTime(sustainGain, releaseStartTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, releaseStartTime + actualRelease);

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

    const stopTime = releaseStartTime + actualRelease + 0.1;
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

  private lookaheadTimer: number | null = null;
  private uiTimer: number | null = null;
  private nextStepTime = 0;
  private scheduleAheadSec = 0.12; // 120ms Web Audio Lookahead
  private scheduledStepQueue: { step: number; time: number }[] = [];

  public startSequencer() {
    if (this.isSequencerPlaying) return;
    this.isSequencerPlaying = true;
    this.currentStep = 0;
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

  public stopSequencer() {
    this.isSequencerPlaying = false;
    if (this.lookaheadTimer) {
      clearInterval(this.lookaheadTimer);
      this.lookaheadTimer = null;
    }
    if (this.uiTimer) {
      clearInterval(this.uiTimer);
      this.uiTimer = null;
    }
    this.scheduledStepQueue = [];
    this.stopAll();
  }

  private restartSequencerTimer() {
    if (this.isSequencerPlaying) {
      this.startLookaheadTimers();
    }
  }

  private startLookaheadTimers() {
    if (this.lookaheadTimer) clearInterval(this.lookaheadTimer);
    if (this.uiTimer) clearInterval(this.uiTimer);

    // Audio thread scheduling lookahead (runs every 25ms)
    this.lookaheadTimer = window.setInterval(() => {
      this.schedulerLoop();
    }, 25);

    // UI sync loop (runs every 16ms to update playhead position)
    this.uiTimer = window.setInterval(() => {
      this.checkUIQueue();
    }, 16);
  }

  private schedulerLoop() {
    if (!this.isSequencerPlaying) return;
    const ctx = soundEngine.init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const stepDuration = 60 / this.bpm / 8; // 1/8 beat

    while (this.nextStepTime < ctx.currentTime + this.scheduleAheadSec) {
      this.scheduleStepAudio(this.currentStep, this.nextStepTime);
      this.scheduledStepQueue.push({ step: this.currentStep, time: this.nextStepTime });
      this.nextStepTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % this.totalSteps;
    }
  }

  private scheduleStepAudio(step: number, time: number) {
    const hasSolo = this.tracks.some((t) => t.solo);
    const stepDuration = 60 / this.bpm / 8; // 1/8 beat in seconds

    this.tracks.forEach((track) => {
      if (track.muted) return;
      if (hasSolo && !track.solo) return;

      const stepNotes = track.grid[step] || [];
      const prevStep = (step - 1 + this.totalSteps) % this.totalSteps;
      const prevStepNotes = track.grid[prevStep] || [];
      const isAccent = track.accents[step] || false;

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
      this.onStepListeners.forEach((fn) => fn(latestStep!));
    }
  }
}

export const modularSynth = new ModularSynth();
