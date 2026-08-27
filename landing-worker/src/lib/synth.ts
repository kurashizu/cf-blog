import { soundEngine } from './sound';
import { UNDERWATER_TRACKS } from './songs/underwater';
import { OVERWORLD_TRACKS } from './songs/overworld';
import { OVERWORLD_FULL_TRACKS } from './songs/overworld-full';
import { MARIO1_TRACKS } from './songs/mario1';

export type SynthWaveform = 'sawtooth' | 'square' | 'sine' | 'triangle' | 'noise';

// ISO 226 / Fletcher-Munson Perceptual Equal Loudness Normalization Scale
// Compares harmonic rich waveforms (Square/Saw) against pure fundamental tones (Sine/Triangle)
export function getWaveformPerceptualScale(w: SynthWaveform): number {
  switch (w) {
    case 'sine': return 1.18;      // Pure sine fundamental boost (+1.4dB)
    case 'triangle': return 1.05;  // Triangle mostly fundamental (+0.4dB)
    case 'sawtooth': return 0.82;  // Sawtooth all harmonics (-1.7dB)
    case 'square': return 0.74;    // Square odd harmonics concentrated in 2-4kHz (-2.6dB)
    case 'noise': return 0.70;     // Full bandwidth noise (-3.1dB)
    default: return 1.0;
  }
}

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

export type ModSource = 'lfo' | 'vcf_env' | 'amp_env' | 'velocity';
export type ModDest = 'cutoff' | 'pitch' | 'morph' | 'pan' | 'resonance';

export interface ModRoute {
  id: string;
  source: ModSource;
  dest: ModDest;
  amount: number; // -1.0 to +1.0
  enabled: boolean;
}

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

export type VelocityCurve = 'OFF' | 'LINEAR' | 'EXP' | 'LOG' | 'HARD';

export interface VelocityCurveSpec {
  id: VelocityCurve;
  name: string;
  calcGainScale: (rawVel: number) => number;
}

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
  osc2Semitone: number; // -24 to +24 semitones (OSC2 transpose)
  pulseWidth: number;   // 5 to 95 percent (square wave duty cycle)
  subOscGain: number;   // 0.0 to 1.0 (sub-oscillator one octave below)
  noiseGain: number;    // 0.0 to 1.0 (noise generator mix level)

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

  // Node 7: Master Output Channel Strip
  airGain?: number;        // -1.0 to +1.0 (Air Shelf EQ / Tone Shaping, ±8dB at 10kHz)

  // Modular Modulation Matrix Routing (Optional legacy support)
  modRoutes?: ModRoute[];

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

export const INITIAL_TRACKS: TrackData[] = OVERWORLD_FULL_TRACKS;

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
  private bpm: number = 150;
  private meter: TimeSignature = '4/4';
  private editNoteDiv: NoteDurationDiv = '1/8';
  private delayMix: number = 0.0;
  private delayTime: number = 0.22;
  private delayFeedback: number = 0.32;
  private reverbMix: number = 0.15;
  private driveAmount: number = 0.0;

  // Master Audio FX Nodes
  private delayNode: DelayNode | null = null;
  private delayFeedbackGain: GainNode | null = null;
  private delayWetGain: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private waveShaper: WaveShaperNode | null = null;

  // Master 6-Band Graphic Equalizer (EQ) Nodes & State (Default: OFF)
  private eqEnabled: boolean = false;
  private eqGains: number[] = [0, 0, 0, 0, 0, 0]; // -12dB to +12dB for 6 bands (80Hz, 250Hz, 800Hz, 2.5kHz, 6kHz, 12kHz)
  private eqFilters: BiquadFilterNode[] = [];

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
  private totalSteps: number = 3360; // Default 3360 steps (105 Bars) for OVERWORLD 1
  private sequencerTimer: any = null;
  private onStepListeners: Set<(step: number) => void> = new Set();
  private onNoteListeners: Set<(trackId: number, noteIndex: number, noteName: string, durationMs: number) => void> = new Set();

  constructor() {
    this.initNoiseBuffer();
  }

  public regenerateNoiseBuffer() {
    if (typeof window === 'undefined') return;
    const ctx = soundEngine.init();
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
    const ctx = soundEngine.init();
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

    // Master 6-Band Parametric/Graphic Equalizer (EQ) Chain: 80Hz -> 250Hz -> 800Hz -> 2.5kHz -> 6kHz -> 12kHz -> MasterGain
    this.eqFilters = EQ_6_BANDS.map((band, idx) => {
      const filter = ctx.createBiquadFilter();
      filter.type = band.type;
      filter.frequency.setValueAtTime(band.freq, ctx.currentTime);
      if (band.type === 'peaking') {
        filter.Q.setValueAtTime(1.2, ctx.currentTime);
      }
      filter.gain.setValueAtTime(this.eqEnabled ? (this.eqGains[idx] ?? 0) : 0, ctx.currentTime);
      return filter;
    });

    // Cascade connect 6 filters: [0] -> [1] -> [2] -> [3] -> [4] -> [5] -> masterGain
    for (let i = 0; i < this.eqFilters.length - 1; i++) {
      this.eqFilters[i].connect(this.eqFilters[i + 1]);
    }
    if (this.eqFilters.length > 0) {
      this.eqFilters[this.eqFilters.length - 1].connect(masterGain);
    }

    const eqInputNode = this.eqFilters.length > 0 ? this.eqFilters[0] : masterGain;

    this.delayNode.connect(this.delayWetGain);
    this.delayWetGain.connect(eqInputNode);

    this.reverbConvolver.connect(this.reverbWetGain);
    this.reverbWetGain.connect(eqInputNode);

    // Master Warm Tape Overdrive / WaveShaper Saturation
    this.waveShaper = ctx.createWaveShaper();
    (this.waveShaper as any).curve = this.makeDistortionCurve(this.driveAmount);
    this.waveShaper.oversample = '2x';
    this.waveShaper.connect(eqInputNode);
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
      this.tracks = JSON.parse(JSON.stringify(OVERWORLD_FULL_TRACKS));
      this.totalSteps = 3360;
      this.bpm = 150;
      this.meter = '4/4';
    } else if (songName === 'OVERWORLD_2' || songName === 'OVERWORLD') {
      this.tracks = JSON.parse(JSON.stringify(OVERWORLD_TRACKS));
      this.totalSteps = 672;
      this.bpm = 90;
      this.meter = '4/4';
    } else if (songName === 'UNDERWATER') {
      this.tracks = JSON.parse(JSON.stringify(UNDERWATER_TRACKS));
      this.totalSteps = 768;
      this.bpm = 100;
      this.meter = '6/8';
    } else if (songName === 'MARIO_1') {
      this.tracks = JSON.parse(JSON.stringify(MARIO1_TRACKS));
      this.totalSteps = 1088;
      this.bpm = 100;
      this.meter = '4/4';
    }
    this.currentStep = 0;
    this.scheduledStepQueue = [];
    const ctx = soundEngine.init();
    if (ctx) {
      this.nextStepTime = ctx.currentTime + 0.05;
    }
    this.onStepListeners.forEach((fn) => fn(0));
  }

  public resetToBlank(steps: number = 64) {
    this.stopAll();
    this.tracks = INITIAL_TRACKS.map((t) => ({
      ...JSON.parse(JSON.stringify(t)),
      grid: Array.from({ length: 4096 }, () => []),
      accents: Array.from({ length: 4096 }, () => 0),
    }));
    this.totalSteps = steps;
    this.bpm = 120;
    this.meter = '4/4';
    this.currentStep = 0;
    this.scheduledStepQueue = [];
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
    this.totalSteps = Math.max(8, Math.min(4096, steps));
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
  }

  public getDrive(): number {
    return this.driveAmount;
  }

  // Master 6-Band Graphic Equalizer Controls
  public setEqEnabled(enabled: boolean) {
    this.eqEnabled = enabled;
    this.eqFilters.forEach((filter, idx) => {
      filter.gain.setValueAtTime(enabled ? (this.eqGains[idx] ?? 0) : 0, 0);
    });
  }

  public isEqEnabled(): boolean {
    return this.eqEnabled;
  }

  public setEqBandGain(bandIdx: number, gainDb: number) {
    if (bandIdx < 0 || bandIdx >= 6) return;
    const clamped = Math.max(-12, Math.min(12, gainDb));
    this.eqGains[bandIdx] = clamped;
    if (this.eqFilters[bandIdx] && this.eqEnabled) {
      this.eqFilters[bandIdx].gain.setValueAtTime(clamped, 0);
    }
  }

  public getEqBandGain(bandIdx: number): number {
    return this.eqGains[bandIdx] ?? 0;
  }

  public getEqGains(): number[] {
    return [...this.eqGains];
  }

  // DSP Engine & Buffer Advanced Configuration Settings
  public getNoiseBufferDuration(): number {
    return this.noiseBufferDuration;
  }

  public setNoiseBufferDuration(sec: number) {
    this.noiseBufferDuration = Math.max(0.5, Math.min(5.0, sec));
    this.regenerateNoiseBuffer();
  }

  public getNoiseColor(): 'white' | 'pink' | 'brown' {
    return this.noiseColor;
  }

  public setNoiseColor(color: 'white' | 'pink' | 'brown') {
    this.noiseColor = color;
    this.regenerateNoiseBuffer();
  }

  public getReverbDuration(): number {
    return this.reverbDuration;
  }

  public setReverbDuration(sec: number) {
    this.reverbDuration = Math.max(0.2, Math.min(6.0, sec));
    this.regenerateReverbBuffer();
  }

  public getReverbDecayRate(): number {
    return this.reverbDecayRate;
  }

  public setReverbDecayRate(decay: number) {
    this.reverbDecayRate = Math.max(0.1, Math.min(2.0, decay));
    this.regenerateReverbBuffer();
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

  public triggerTrackVoice(trackId: number, noteIndex: number, accentLevel: number | boolean = 0, startTime?: number, durationSec?: number, rawVelocity?: number) {
    const track = this.tracks[trackId];
    if (!track || soundEngine.isMuted()) return;

    const noteInfo = PIANO_ROLL_NOTES[noteIndex];
    if (!noteInfo) return;

    const acc = typeof accentLevel === 'boolean' ? (accentLevel ? 1 : 0) : (accentLevel || 0);

    const ctx = soundEngine.init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    this.initMasterFX(ctx);

    const voiceKey = `v${++this._voiceSeq}`;
    const t = startTime !== undefined ? Math.max(ctx.currentTime, startTime) : ctx.currentTime;
    const tuningScale = this.masterTuningFreq / 440.0;
    const baseFreq = noteInfo.freq * tuningScale;
    const masterGain = (soundEngine as any).masterGain || ctx.destination;

    // ──────────────────────────────────────────────────────────────────────────
    // NODE 1 & NODE 2: DUAL INPUT WAVEFORM GENERATORS & TIMBRE FUSION
    // ──────────────────────────────────────────────────────────────────────────
    const voiceMix = ctx.createGain();
    let osc1: OscillatorNode | undefined;
    let osc2: OscillatorNode | undefined;
    let noiseSource: AudioBufferSourceNode | undefined;

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

    if (track.osc1Waveform === 'noise' && track.osc2Waveform === 'noise') {
      if (!this.noiseBuffer) this.initNoiseBuffer();
      noiseSource = ctx.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;
      noiseSource.loop = true;
      if (pEnvAmt !== 0) {
        noiseSource.playbackRate.setValueAtTime(1.0, t);
        noiseSource.playbackRate.exponentialRampToValueAtTime(pRatio, t + pAtt);
        noiseSource.playbackRate.exponentialRampToValueAtTime(1.0, t + pAtt + pDec);
      }
      noiseSource.connect(voiceMix);
      noiseSource.start(startT1);
    } else {
      if (track.osc1Waveform === 'noise') {
        if (!this.noiseBuffer) this.initNoiseBuffer();
        noiseSource = ctx.createBufferSource();
        noiseSource.buffer = this.noiseBuffer;
        noiseSource.loop = true;
        if (pEnvAmt !== 0) {
          noiseSource.playbackRate.setValueAtTime(1.0, t);
          noiseSource.playbackRate.exponentialRampToValueAtTime(pRatio, t + pAtt);
          noiseSource.playbackRate.exponentialRampToValueAtTime(1.0, t + pAtt + pDec);
        }
        const g1 = ctx.createGain();
        g1.gain.setValueAtTime(track.osc1Gain, t);
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
        osc1.type = track.osc1Waveform;
        osc1.frequency.setValueAtTime(startFreq, t);
        if (glideSec > 0 && startFreq !== baseFreq) {
          osc1.frequency.exponentialRampToValueAtTime(baseFreq, t + glideSec);
        }
        if (pEnvAmt !== 0) {
          osc1.frequency.exponentialRampToValueAtTime(baseFreq * pRatio, t + glideSec + pAtt);
          osc1.frequency.exponentialRampToValueAtTime(baseFreq, t + glideSec + pAtt + pDec);
        }
      }

      const osc2Freq = baseFreq * track.osc2Ratio * Math.pow(2, track.detuneCents / 1200);
      const glideSec2 = (track.glideTime ?? 0) / 1000;
      const lastFreq2 = this.lastTrackFreqs.get(track.id);
      const lastTime2 = this.lastTrackNoteTimes.get(track.id) ?? 0;
      const isLegato2 = (t - lastTime2) < 1.5;
      const prevOsc2Freq = lastFreq2 ? lastFreq2 * track.osc2Ratio * Math.pow(2, track.detuneCents / 1200) : osc2Freq;
      const startFreq2 = (glideSec2 > 0 && lastFreq2 && isLegato2) ? prevOsc2Freq : osc2Freq;

      osc2 = ctx.createOscillator();
      osc2.type = track.osc2Waveform === 'noise' ? 'sawtooth' : track.osc2Waveform;
      osc2.frequency.setValueAtTime(startFreq2, t);
      if (glideSec2 > 0 && startFreq2 !== osc2Freq) {
        osc2.frequency.exponentialRampToValueAtTime(osc2Freq, t + glideSec2);
      }
      if (pEnvAmt !== 0) {
        osc2.frequency.exponentialRampToValueAtTime(osc2Freq * pRatio, t + glideSec2 + pAtt);
        osc2.frequency.exponentialRampToValueAtTime(osc2Freq, t + glideSec2 + pAtt + pDec);
      }

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
        osc2.connect(fmGain);
        fmGain.connect(osc1.frequency);

        const osc1GainNode = ctx.createGain();
        osc1GainNode.gain.setValueAtTime(track.osc1Gain * osc1Bal, t);
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
        g1.gain.setValueAtTime(track.osc1Gain * osc1Bal * (1.0 - track.morphAmount * 0.4), t);
        g2.gain.setValueAtTime(track.osc2Gain * osc2Bal * track.morphAmount * 0.9, t);
        osc1.connect(g1);
        osc2.connect(g2);
        g1.connect(voiceMix);
        g2.connect(voiceMix);
      } else {
        if (osc1) {
          const g1 = ctx.createGain();
          g1.gain.setValueAtTime(track.osc1Gain * osc1Bal * (1.0 - track.morphAmount * 0.6), t);
          osc1.connect(g1);
          g1.connect(voiceMix);
        }
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(track.osc2Gain * osc2Bal * (0.2 + track.morphAmount * 0.8), t);
        osc2.connect(g2);
        g2.connect(voiceMix);
      }

      if (osc1) osc1.start(startT1);
      osc2.start(startT2);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // NODE 3 & 4: DUAL INDEPENDENT ENVELOPES (AMP + VCF) & MODULATION MATRIX
    // ──────────────────────────────────────────────────────────────────────────
    const filter = ctx.createBiquadFilter();
    filter.type = track.filterType;

    // 1. Dual Envelope Parameters
    const ampAtt = Math.max(0.003, track.ampAttack ?? track.attack ?? 0.005);
    const ampDec = Math.max(0.01, track.ampDecay ?? track.decay ?? 0.15);
    const ampSus = Math.max(0.0001, track.ampSustain ?? track.sustain ?? 0.5);
    const ampRel = Math.max(0.01, track.ampRelease ?? track.release ?? 0.1);

    const vcfAtt = Math.max(0.003, track.filterAttack ?? 0.005);
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
    filter.frequency.setValueAtTime(baseCutoff, t);
    filter.frequency.exponentialRampToValueAtTime(peakCutoff, t + vcfAtt);
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

    const peakGain = gainBase * track.volume;
    const sustainGain = Math.max(0.0001, peakGain * ampSus);
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.linearRampToValueAtTime(peakGain, t + ampAtt);
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
      if (lfo) lfo.stop(stopTime);

      const cleanupMs = Math.ceil((stopTime - ctx.currentTime) * 1000) + 50;
      void window.setTimeout(() => {
        this.activeVoices.delete(voiceKey);
      }, cleanupMs);
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

    const eqInputNode: AudioNode = (this.eqFilters && this.eqFilters.length > 0) ? this.eqFilters[0] : masterGain;

    if (panner) {
      finalVoiceNode.connect(panner);
      panner.connect(eqInputNode);
      if (this.delayNode && this.delayMix > 0) panner.connect(this.delayNode);
      if (this.reverbConvolver && this.reverbMix > 0) finalVoiceNode.connect(this.reverbConvolver);
    } else {
      finalVoiceNode.connect(eqInputNode);
      if (this.delayNode && this.delayMix > 0) finalVoiceNode.connect(this.delayNode);
      if (this.reverbConvolver && this.reverbMix > 0) finalVoiceNode.connect(this.reverbConvolver);
    }

    this.activeVoices.set(voiceKey, {
      osc1,
      osc2,
      noise: noiseSource,
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
    const { gain, filter, ampRel, vcfRel, baseCutoff, osc1, osc2, noise, lfo } = voice;

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
      if (lfo) lfo.stop(stopTime);

      const cleanupMs = Math.ceil((stopTime - now) * 1000) + 50;
      window.setTimeout(() => {
        this.activeVoices.delete(voiceKey);
      }, cleanupMs);
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
      if (voice.lfo) voice.lfo.stop();
    } catch {}
    this.activeVoices.delete(voiceKey);
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
  private _voiceSeq = 0; // monotonic voice counter — avoids Math.random() hot-path allocation

  public startSequencer(fromStep?: number) {
    if (this.isSequencerPlaying) return;
    this.isSequencerPlaying = true;
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
    // Set sequencer internal currentStep to the exact last heard audible step so next start resumes right where it stopped
    this.currentStep = this.lastAudibleStep;
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

    // Audio thread scheduling lookahead (runs every 40ms — 200ms buffer is ample)
    this.lookaheadTimer = window.setInterval(() => {
      this.schedulerLoop();
    }, 40);

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
  }
}

export const modularSynth = new ModularSynth();
