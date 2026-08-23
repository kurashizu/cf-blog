/**
 * KRSZ™ Sound Engine — Web Audio API Synthesizer
 * 
 * Pure mathematical Web Audio API sound synthesis (zero external audio assets).
 * Synthesizes high-definition tactile UI feedback and harmonic ambient notes.
 * 
 * Aesthetics: Matte, tactile, mechanical, futuristic edge telemetry.
 */

// Musical note frequency mapping (Hz)
export const NOTE_FREQUENCIES: Record<string, number> = {
  'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
  'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
  'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
  'C6': 1046.50
};

export type NoteName = keyof typeof NOTE_FREQUENCIES | string | number;

export interface SoundEngineState {
  muted: boolean;
  volume: number;
  initialized: boolean;
}

type StateListener = (state: SoundEngineState) => void;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted: boolean = false;
  private volume: number = 0.28; // Default comfortable level
  private lastHoverTime: number = 0;
  private lastSseTickTime: number = 0;
  private listeners: Set<StateListener> = new Set();
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    // Restore preference if in browser
    if (typeof window !== 'undefined') {
      const savedMute = localStorage.getItem('krsz_sound_muted');
      if (savedMute !== null) {
        this.muted = savedMute === 'true';
      }
      const savedVol = localStorage.getItem('krsz_sound_volume');
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        if (!isNaN(v) && v >= 0 && v <= 1) {
          this.volume = v;
        }
      }
    }
  }

  /**
   * Safe lazy initialization of AudioContext on first user interaction.
   */
  public init(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;

      try {
        this.ctx = new AudioContextClass();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 4096;
        this.analyser.smoothingTimeConstant = 0.75;
        this.visualizerDataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.visualizerFreqArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.visualizerTimeArray = new Uint8Array(this.analyser.fftSize);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
        this.generateNoiseBuffer();
      } catch (e) {
        console.warn('Web Audio API not supported or blocked:', e);
        return null;
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  /**
   * Pre-generate 0.5s of white noise buffer for mechanical click/percussion synthesis.
   */
  private generateNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  /**
   * Return active AudioContext after ensuring it's running.
   */
  private getReadyContext(): AudioContext | null {
    if (this.muted) return null;
    const ctx = this.init();
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  /**
   * Subscribe to sound engine state changes (mute, volume).
   */
  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((fn) => fn(state));
  }

  public getState(): SoundEngineState {
    return {
      muted: this.muted,
      volume: this.volume,
      initialized: this.ctx !== null,
    };
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('krsz_sound_muted', String(muted));
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx.currentTime);
    }
    this.notify();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      // Play a confirmation blip when unmuting
      this.toggle(true);
    }
    return this.muted;
  }

  public setVolume(vol: number) {
    const clamped = Math.max(0, Math.min(1, vol));
    this.volume = clamped;
    if (typeof window !== 'undefined') {
      localStorage.setItem('krsz_sound_volume', String(clamped));
    }
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setValueAtTime(clamped, this.ctx.currentTime);
    }
    this.notify();
  }

  /* -------------------------------------------------------------------------- */
  /*                             SYNTHESIS METHODS                              */
  /* -------------------------------------------------------------------------- */

  /**
   * CLICK: Crisp tactile mechanical switch click (filtered pulse + micro noise transient).
   */
  public click(intensity: number = 1.0) {
    const ctx = this.getReadyContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const gainNode = ctx.createGain();
    gainNode.connect(this.masterGain);

    // 1. High frequency mechanical transient noise pulse (4ms)
    if (this.noiseBuffer) {
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(2200, t);
      noiseFilter.Q.setValueAtTime(3.5, t);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35 * intensity, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.012);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(gainNode);

      noiseSource.start(t);
      noiseSource.stop(t + 0.015);
    }

    // 2. Micro tone blip (850Hz -> 220Hz rapid pitch drop)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(850, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.018);

    oscGain.gain.setValueAtTime(0.28 * intensity, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);

    osc.connect(oscGain);
    oscGain.connect(gainNode);

    osc.start(t);
    osc.stop(t + 0.02);

    // Clean up
    setTimeout(() => {
      gainNode.disconnect();
    }, 50);
  }

  /**
   * TOGGLE: Pitch shifted frequency blip (dual tone).
   * @param direction 'up' | 'down' | boolean (true = on/up, false = off/down)
   */
  public toggle(direction: boolean | 'up' | 'down' = 'up') {
    const ctx = this.getReadyContext();
    if (!ctx || !this.masterGain) return;

    const isUp = direction === true || direction === 'up';
    const t = ctx.currentTime;
    const duration = 0.055;

    const gainNode = ctx.createGain();
    gainNode.connect(this.masterGain);

    // Primary Blip Tone
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const subGain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    if (isUp) {
      // Ascending crisp duo-tone (480Hz -> 820Hz)
      osc1.frequency.setValueAtTime(480, t);
      osc1.frequency.exponentialRampToValueAtTime(820, t + duration * 0.8);

      osc2.frequency.setValueAtTime(960, t);
      osc2.frequency.exponentialRampToValueAtTime(1640, t + duration * 0.8);
    } else {
      // Descending tone (780Hz -> 420Hz)
      osc1.frequency.setValueAtTime(780, t);
      osc1.frequency.exponentialRampToValueAtTime(420, t + duration * 0.8);

      osc2.frequency.setValueAtTime(1560, t);
      osc2.frequency.exponentialRampToValueAtTime(840, t + duration * 0.8);
    }

    subGain.gain.setValueAtTime(0.001, t);
    subGain.gain.linearRampToValueAtTime(0.22, t + 0.006);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc1.connect(subGain);
    osc2.connect(subGain);
    subGain.connect(gainNode);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + duration);
    osc2.stop(t + duration);

    setTimeout(() => {
      gainNode.disconnect();
    }, (duration + 0.05) * 1000);
  }

  /**
   * HOVER: Ultra-short faint high tick (attenuated sine blip).
   * Throttled to avoid sound clutter during rapid mouse movement.
   */
  public hover() {
    const now = Date.now();
    if (now - this.lastHoverTime < 38) return; // 38ms debounce window
    this.lastHoverTime = now;

    const ctx = this.getReadyContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const duration = 0.012; // 12ms feather tick

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2600, t);
    osc.frequency.exponentialRampToValueAtTime(1900, t + duration);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);

    setTimeout(() => {
      gain.disconnect();
    }, 40);
  }

  /**
   * SSE TICK: Rapid typewriter token streaming tick for AI/SSE agents.
   */
  public sseTick() {
    const now = Date.now();
    if (now - this.lastSseTickTime < 18) return; // 18ms throttle
    this.lastSseTickTime = now;

    const ctx = this.getReadyContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const duration = 0.008;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2800 + Math.random() * 400, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + duration);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.035, t + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);

    setTimeout(() => {
      gain.disconnect();
    }, 25);
  }

  /**
   * PING: Clean chime tone for completion/acknowledgement events.
   */
  public ping(success: boolean = true) {
    const ctx = this.getReadyContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const duration = success ? 0.22 : 0.14;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    if (success) {
      // E6 + B6 high pure chime
      osc1.frequency.setValueAtTime(1318.51, t);
      osc2.frequency.setValueAtTime(1975.53, t);
    } else {
      osc1.frequency.setValueAtTime(440, t);
      osc2.frequency.setValueAtTime(330, t);
    }

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + duration);
    osc2.stop(t + duration);

    setTimeout(() => {
      gain.disconnect();
    }, (duration + 0.05) * 1000);
  }

  /**
   * KEYSTROKE: Physical mechanical keyboard switch synthesis.
   * Features organic randomized pitch detuning for satisfying realistic typing.
   */
  public keystroke(type: 'char' | 'enter' | 'space' | 'backspace' = 'char') {
    const ctx = this.getReadyContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    // Micro pitch variation between 0.94 and 1.06 for organic feel
    const pitchMod = 0.94 + Math.random() * 0.12;

    const gainNode = ctx.createGain();
    gainNode.connect(this.masterGain);

    // 1. Tactile click noise burst (Kailh/Cherry switch actuation)
    if (this.noiseBuffer) {
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime((type === 'space' ? 2400 : 3200) * pitchMod, t);
      bandpass.Q.setValueAtTime(5.0, t);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.32, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);

      noiseSource.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(gainNode);

      noiseSource.start(t);
      noiseSource.stop(t + 0.02);
    }

    // 2. Stem bottom-out thump (low resonance plate vibration)
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();

    thump.type = 'sine';
    const baseThump = type === 'space' || type === 'enter' ? 85 : 120;
    thump.frequency.setValueAtTime(baseThump * pitchMod, t);
    thump.frequency.exponentialRampToValueAtTime(45, t + 0.035);

    thumpGain.gain.setValueAtTime(0.24, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

    thump.connect(thumpGain);
    thumpGain.connect(gainNode);

    thump.start(t);
    thump.stop(t + 0.04);

    setTimeout(() => {
      gainNode.disconnect();
    }, 60);
  }

  /**
   * POWER: Ambient low drone / edge sweep (futuristic server activate / edge sweep).
   */
  public power() {
    const ctx = this.getReadyContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const duration = 1.6;

    const masterOut = ctx.createGain();
    masterOut.connect(this.masterGain);

    // 1. Sub Bass Drone (A1: 55Hz -> 65.4Hz)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(55, t);
    subOsc.frequency.exponentialRampToValueAtTime(65.41, t + duration * 0.7);

    subGain.gain.setValueAtTime(0.001, t);
    subGain.gain.linearRampToValueAtTime(0.28, t + 0.25);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    subOsc.connect(subGain);
    subGain.connect(masterOut);

    // 2. Resonant Filtered Sawtooth Sweep (Sci-Fi edge startup)
    const sawOsc1 = ctx.createOscillator();
    const sawOsc2 = ctx.createOscillator();
    sawOsc1.type = 'sawtooth';
    sawOsc2.type = 'triangle';
    sawOsc1.frequency.setValueAtTime(110, t);
    sawOsc2.frequency.setValueAtTime(110.8, t); // Detuned for chorus thickness

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(4.5, t);
    filter.frequency.setValueAtTime(90, t);
    filter.frequency.exponentialRampToValueAtTime(720, t + 0.55);
    filter.frequency.exponentialRampToValueAtTime(180, t + duration);

    const sawGain = ctx.createGain();
    sawGain.gain.setValueAtTime(0.001, t);
    sawGain.gain.linearRampToValueAtTime(0.18, t + 0.15);
    sawGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    sawOsc1.connect(filter);
    sawOsc2.connect(filter);
    filter.connect(sawGain);
    sawGain.connect(masterOut);

    // Start all
    subOsc.start(t);
    sawOsc1.start(t);
    sawOsc2.start(t);

    subOsc.stop(t + duration);
    sawOsc1.stop(t + duration);
    sawOsc2.stop(t + duration);

    setTimeout(() => {
      masterOut.disconnect();
    }, (duration + 0.1) * 1000);
  }

  /**
   * SYNTH PAD: Warm analog polysynth note for interactive soundboards (e.g. C4, E4, G4, B4).
   * @param note Note name (e.g. 'C4') or frequency in Hz
   * @param duration Note duration in seconds (default: 0.75s)
   */
  public synthPad(note: NoteName = 'C4', duration: number = 0.75) {
    const ctx = this.getReadyContext();
    if (!ctx || !this.masterGain) return;

    let freq: number;
    if (typeof note === 'number') {
      freq = note;
    } else if (NOTE_FREQUENCIES[note]) {
      freq = NOTE_FREQUENCIES[note];
    } else {
      freq = 261.63; // Default C4
    }

    const t = ctx.currentTime;
    const voiceGain = ctx.createGain();
    voiceGain.connect(this.masterGain);

    // Triple Oscillator Voice: Saw + Detuned Triangle + Sub Sine
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const oscSub = ctx.createOscillator();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, t);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 1.004, t); // +7 cents detune

    oscSub.type = 'sine';
    oscSub.frequency.setValueAtTime(freq * 0.5, t); // Sub octave

    // Resonant Warm Lowpass Filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(2.2, t);
    filter.frequency.setValueAtTime(freq * 3.8, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.2, t + duration);

    // Envelope Generator: Attack (30ms), Decay, Release
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.001, t);
    envelope.gain.linearRampToValueAtTime(0.32, t + 0.035);
    envelope.gain.setValueAtTime(0.32, t + duration * 0.4);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    // Routing
    osc1.connect(filter);
    osc2.connect(filter);
    oscSub.connect(filter);
    filter.connect(envelope);
    envelope.connect(voiceGain);

    // Play Voice
    osc1.start(t);
    osc2.start(t);
    oscSub.start(t);

    osc1.stop(t + duration);
    osc2.stop(t + duration);
    oscSub.stop(t + duration);

    setTimeout(() => {
      voiceGain.disconnect();
    }, (duration + 0.1) * 1000);
  }
  private analyser: AnalyserNode | null = null;
  private visualizerDataArray: Uint8Array | null = null;
  private visualizerFreqArray: Uint8Array | null = null;
  private visualizerTimeArray: Uint8Array | null = null;

  public getAnalyser(): AnalyserNode | null {
    this.init();
    return this.analyser;
  }

  public getFftSize(): number {
    return this.analyser ? this.analyser.fftSize : 4096;
  }

  public setFftSize(size: number) {
    if (!this.analyser) this.init();
    if (this.analyser) {
      this.analyser.fftSize = size;
      this.visualizerDataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.visualizerFreqArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.visualizerTimeArray = new Uint8Array(this.analyser.fftSize);
    }
  }

  public getFftSmoothing(): number {
    return this.analyser ? this.analyser.smoothingTimeConstant : 0.75;
  }

  public setFftSmoothing(val: number) {
    if (!this.analyser) this.init();
    if (this.analyser) {
      this.analyser.smoothingTimeConstant = Math.max(0.0, Math.min(0.99, val));
    }
  }

  public getAudioSampleRate(): number {
    return this.ctx ? this.ctx.sampleRate : 44100;
  }

  public getAudioContextState(): string {
    return this.ctx ? this.ctx.state : 'uninitialized';
  }

  public getVisualizerData(): Uint8Array | null {
    return this.getByteFrequencyData();
  }

  public getByteFrequencyData(): Uint8Array | null {
    if (this.analyser && this.visualizerFreqArray) {
      this.analyser.getByteFrequencyData(this.visualizerFreqArray as unknown as Uint8Array<ArrayBuffer>);
      return this.visualizerFreqArray;
    }
    return null;
  }

  public getByteTimeDomainData(): Uint8Array | null {
    if (this.analyser && this.visualizerTimeArray) {
      this.analyser.getByteTimeDomainData(this.visualizerTimeArray as unknown as Uint8Array<ArrayBuffer>);
      return this.visualizerTimeArray;
    }
    return null;
  }

  public getMuted(): boolean {
    return this.muted;
  }

  /**
   * Soundboard 4-pad trigger helper
   */
  public playPad(padIndex: number) {
    const ctx = this.getReadyContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    switch (padIndex) {
      case 0: {
        // Deep 808 Sub Kick
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(38, t + 0.28);

        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.32);
        break;
      }
      case 1: {
        // Authentic Roland TR-909 Snare Drum Synthesis
        // 1. Dual Body Oscillators (Tunable analog shell tone)
        const oscLow = ctx.createOscillator();
        const oscHigh = ctx.createOscillator();
        const bodyGain = ctx.createGain();

        oscLow.type = 'triangle';
        oscLow.frequency.setValueAtTime(185, t);
        oscLow.frequency.exponentialRampToValueAtTime(80, t + 0.06);

        oscHigh.type = 'sine';
        oscHigh.frequency.setValueAtTime(330, t);
        oscHigh.frequency.exponentialRampToValueAtTime(175, t + 0.05);

        bodyGain.gain.setValueAtTime(0.35, t);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

        oscLow.connect(bodyGain);
        oscHigh.connect(bodyGain);
        bodyGain.connect(this.masterGain);

        oscLow.start(t);
        oscHigh.start(t);
        oscLow.stop(t + 0.09);
        oscHigh.stop(t + 0.09);

        // 2. High-Frequency Stick Click Transient (3.8kHz burst for 4ms)
        const clickOsc = ctx.createOscillator();
        const clickGain = ctx.createGain();
        clickOsc.type = 'sawtooth';
        clickOsc.frequency.setValueAtTime(3800, t);
        clickOsc.frequency.exponentialRampToValueAtTime(400, t + 0.006);

        clickGain.gain.setValueAtTime(0.3, t);
        clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.008);

        clickOsc.connect(clickGain);
        clickGain.connect(this.masterGain);
        clickOsc.start(t);
        clickOsc.stop(t + 0.01);

        // 3. Resonant Snare Wire Noise Decay (2.6kHz Bandpass + 1.2kHz Highpass)
        if (this.noiseBuffer) {
          const noiseSrc = ctx.createBufferSource();
          noiseSrc.buffer = this.noiseBuffer;

          const bpFilter = ctx.createBiquadFilter();
          bpFilter.type = 'bandpass';
          bpFilter.frequency.setValueAtTime(2600, t);
          bpFilter.Q.setValueAtTime(2.2, t);

          const hpFilter = ctx.createBiquadFilter();
          hpFilter.type = 'highpass';
          hpFilter.frequency.setValueAtTime(1400, t);

          const noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(0.45, t);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

          noiseSrc.connect(bpFilter);
          bpFilter.connect(hpFilter);
          hpFilter.connect(noiseGain);
          noiseGain.connect(this.masterGain);

          noiseSrc.start(t);
          noiseSrc.stop(t + 0.24);
        }
        break;
      }
      case 2: {
        // Neon Chime (C5 + G5 harmonic)
        this.synthPad('C5', 0.6);
        this.synthPad('G5', 0.6);
        break;
      }
      case 3: {
        // Cyber Arp (Sawtooth)
        this.synthPad('E5', 0.4);
        break;
      }
    }
  }
}

// Global Singleton Instance
export const soundEngine = new SoundEngine();

export type SoundEffectType = 'click' | 'toggle' | 'hover' | 'keystroke' | 'power' | 'synthPad' | 'sseTick' | 'ping';

/**
 * Universal sound player function supporting string type parameter
 */
export function playSound(type: SoundEffectType, ...args: any[]): void {
  switch (type) {
    case 'click':
      soundEngine.click(args[0]);
      break;
    case 'toggle':
      soundEngine.toggle(args[0]);
      break;
    case 'hover':
      soundEngine.hover();
      break;
    case 'keystroke':
      soundEngine.keystroke(args[0]);
      break;
    case 'power':
      soundEngine.power();
      break;
    case 'synthPad':
      soundEngine.synthPad(args[0], args[1]);
      break;
    case 'sseTick':
      soundEngine.sseTick();
      break;
    case 'ping':
      soundEngine.ping(args[0]);
      break;
  }
}

/**
 * Object namespace export for components importing `sound`
 */
export const sound = {
  click: (intensity?: number) => soundEngine.click(intensity),
  playClick: (intensity?: number) => soundEngine.click(intensity),
  toggle: (dir?: boolean | 'up' | 'down') => soundEngine.toggle(dir),
  playToggle: (dir?: boolean | 'up' | 'down') => soundEngine.toggle(dir),
  hover: () => soundEngine.hover(),
  playHover: () => soundEngine.hover(),
  sseTick: () => soundEngine.sseTick(),
  playSseTick: () => soundEngine.sseTick(),
  ping: (success?: boolean) => soundEngine.ping(success),
  playPing: (success?: boolean) => soundEngine.ping(success),
  keystroke: (type?: 'char' | 'enter' | 'space' | 'backspace') => soundEngine.keystroke(type),
  playKeystroke: (type?: 'char' | 'enter' | 'space' | 'backspace') => soundEngine.keystroke(type),
  power: () => soundEngine.power(),
  playPower: () => soundEngine.power(),
  synthPad: (note?: NoteName, duration?: number) => soundEngine.synthPad(note, duration),
  playSynthPad: (note?: NoteName, duration?: number) => soundEngine.synthPad(note, duration),
  playPad: (padIndex: number) => soundEngine.playPad(padIndex),
  getVisualizerData: () => soundEngine.getVisualizerData(),
  getByteFrequencyData: () => soundEngine.getByteFrequencyData(),
  getByteTimeDomainData: () => soundEngine.getByteTimeDomainData(),
  getAnalyser: () => soundEngine.getAnalyser(),
  toggleMute: () => soundEngine.toggleMute(),
  setMuted: (muted: boolean) => soundEngine.setMuted(muted),
  isMuted: () => soundEngine.isMuted(),
  getMuted: () => soundEngine.getMuted(),
  setVolume: (vol: number) => soundEngine.setVolume(vol),
  getVolume: () => soundEngine.getVolume(),
  init: () => soundEngine.init(),
  getState: () => soundEngine.getState(),
  subscribe: (listener: StateListener) => soundEngine.subscribe(listener),
};

/* -------------------------------------------------------------------------- */
/*                         CONVENIENT DIRECT EXPORTS                          */
/* -------------------------------------------------------------------------- */

export const playClick = (intensity?: number) => soundEngine.click(intensity);
export const playToggle = (direction?: boolean | 'up' | 'down') => soundEngine.toggle(direction);
export const playHover = () => soundEngine.hover();
export const playSseTick = () => soundEngine.sseTick();
export const playPing = (success?: boolean) => soundEngine.ping(success);
export const playKeystroke = (type?: 'char' | 'enter' | 'space' | 'backspace') => soundEngine.keystroke(type);
export const playPower = () => soundEngine.power();
export const playSynthPad = (note?: NoteName, duration?: number) => soundEngine.synthPad(note, duration);
export const toggleSound = () => soundEngine.toggleMute();
export const setSoundMuted = (muted: boolean) => soundEngine.setMuted(muted);
export const isSoundMuted = () => soundEngine.isMuted();
export const setSoundVolume = (vol: number) => soundEngine.setVolume(vol);
export const getSoundVolume = () => soundEngine.getVolume();
export const initAudioContext = () => soundEngine.init();
