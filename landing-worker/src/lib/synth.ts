import {
	laneAt,
	lanesOf,
	laneToVelocity,
	VELOCITY_LANE_ID,
	type NoteLane
} from './stores/note-lanes';
import {
	EXEC_PORT_IDS,
	ACTIVATION_TYPES,
	PROBE_TYPES,
	FILTER_TYPES,
	MODULE_SPECS,
	WAVE_SHAPES,
	DUR_STEP_CHOICES
} from './stores/synth-modules';
import {
	createResolver,
	execReach,
	execDelays,
	runs,
	isPureNode,
	isValueNode,
	audioAncestors,
	trackScope,
	noteRandom,
	PURE_NODES,
	type NoteEvent
} from './stores/node-graph';
import { graphOf, type GraphCable, type RackGraph } from './stores/graph-model';
import { tr } from './i18n';
import { soundEngine } from './sound';
import { createLiveDsp, ensureLiveDsp, type LiveDsp } from './audio/live-dsp';
import { planLoops, LOOP_KNOBS, type LoopIsland } from './audio/loop-plan';
import { flattenMacros, throughTerminals } from './stores/macros';
import { BODY_IRS } from './audio/body-irs';
import {
	ENV_PROCESSOR,
	MAP_PROCESSOR,
	SHAPE_PROCESSOR,
	STRINGS_PROCESSOR,
	MODES_PROCESSOR,
	SPACE_PROCESSOR,
	WIRE_PROCESSOR,
	LOOP_PROCESSOR,
	LOOP_SLOTS,
	SH_PROCESSOR,
	SLEW_PROCESSOR,
	GUARD_PROCESSOR,
	type LoopOp
} from './audio/live-dsp-params';
import { UNDERWATER_TRACKS } from './songs/underwater';
import { OVERWORLD_TRACKS } from './songs/overworld';
import { OVERWORLD_FULL_TRACKS } from './songs/overworld-full';
import { MARIO1_TRACKS } from './songs/mario1';
import { SPAIN_TRACKS, SPAIN_STEPS } from './songs/spain';
import { TAKE_FIVE_TRACKS, TAKE_FIVE_STEPS } from './songs/take-five';

/* The track vocabulary moved to ./track-data -- see that file for why. Re-
   exported here so every existing `from '../synth'` keeps working; new code
   can import from either, and the stores should prefer track-data since it
   costs them nothing. */
export * from './track-data';
import {
	type TrackData,
	type NoteDurationDiv,
	type TimeSignature,
	type SynthWaveform,
	type CustomWave,
	type WaveParams,
	type BlendMode,
	type FilterType,
	type LfoWaveform,
	type ModRoute,
	type VelocityCurve,
	type BuiltinSongId,
	type KeyTimbreKey,
	STEPS_PER_BEAT,
	MAX_GRID_STEPS,
	EQ_6_BANDS,
	METER_SPECS,
	VELOCITY_CURVES,
	PIANO_ROLL_NOTES,
	KEY_TIMBRE_KEYS,
	TRACK_COUNT,
	BLANK_TRACK_TIMBRE,
	WAVE_PARAM_SPECS,
	BASIC_WAVES,
	NOISE_WAVES,
	ADVANCED_WAVES,
	waveParam,
	getWaveformPerceptualScale,
	getWaveformAbbr,
	isTernaryDiv,
	divToStepSpan,
	stepsPerColumn,
	hasSubColumns,
	ternaryColFactor,
	divToColumnSpan,
	isKeyTimbreKey,
	effectiveTimbre,
	padTracks,
	scaleTracksToFineGrid
} from './track-data';

/** What the synth holds at boot. SPAIN is authored natively on the 1/24-beat grid, so it is copied, not scaled. */
export const INITIAL_TRACKS: TrackData[] = padTracks(SPAIN_TRACKS);

interface FreqPlan {
	t: number;
	start: number;
	ramps: { to: number; at: number }[];
}

/**
 * Everything `buildActivation` needs to run again, later, against the graph
 * as it stood at note-on.
 *
 * A snapshot rather than a live read of `this.tracks[trackId]`, because the
 * track can be edited while a voice is held -- a knob turned, a node moved --
 * and an activation firing at release has to build the graph the key was
 * actually pressed against, not whatever the canvas happens to hold when the
 * key comes back up.
 *
 * Kept as its own type rather than written out twice, once per event kind
 * that needs it (REL and ON-CHOKE, both today): both are "build this
 * activation again, at a different real time", and the inputs that requires
 * are the same regardless of which exec outlet is asking. Kept separate from
 * `ActiveVoice` itself for the same reason: both existing users of this type
 * are per-voice snapshots hung off one, but a future track-level event source
 * (a transport tick belonging to no note at all -- see docs/node-graph.md)
 * would need the same shape of inputs without anything to snapshot onto,
 * since it has no voice. Folding this into `ActiveVoice` would make that
 * case require pulling the type back out later; not folding it costs
 * nothing today.
 */
interface AdvBuildContext {
	graph: RackGraph;
	params: Record<string, number>;
	baseFreq: number;
	laneValues: Record<string, number>;
	presetGain: number;
	note: { velocity: number; noteIndex: number; seed?: number };
	trackId?: number;
	waves: Record<string, string>;
	/** Where a second activation's own sound should land -- the track's mix
	    bus, not the voice's own gain, which may already be fading towards
	    zero by the time this fires. */
	busInput: AudioNode;
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
	/** Set only when this voice's ADV graph has a REL outlet with something
	    wired to it -- undefined for every other voice, so `releaseVoice`
	    finding it absent is the whole cost this feature has for the patches
	    that do not use it. */
	advRelContext?: AdvBuildContext;
	/** REL's own sources, once fired -- independent of `extras`, because they
	    may still be ringing after this voice's own nodes are reaped. */
	relSources?: AudioScheduledSourceNode[];
	/** When a timed note's REL was scheduled for -- its end, known at note-on.
	    Undefined for a key held live, whose REL waits for the real key-up. */
	relAt?: number;
	/** Every module gate this note opened, closed by `releaseVoice` when the
	    key comes up -- see `holdGate`. */
	gates?: AudioParam[];
	/** When those gates rose -- later than `startTime` for a key played live (see `deferredGates`). */
	gatesRise?: number;
	/** When the key came up: a live key at its release, a timed note at its end. Undefined while held. */
	releasedAt?: number;
	/** What the voice is putting out, read when one has to be taken. Live voices only. */
	meter?: AnalyserNode;
	/** The ON-CHOKE counterpart of `advRelContext`: set only when this voice's
	    graph has something wired to ON-CHOKE. Fired by `chokeVoice` and
	    `stopVoice`, never by `releaseVoice` -- being cut off from outside is
	    not the same event as the key coming up, however similar the two
	    activations look once built. */
	advChokeContext?: AdvBuildContext;
	/** ON-CHOKE's own sources, the same reason `relSources` are kept apart
	    from `extras`. */
	chokeSources?: AudioScheduledSourceNode[];
	/** The ADV graph's own sink gain -- undefined for a classic voice, where
	    `gain` already owns this job. Faded to 0 wherever `extras` are stopped,
	    so a patch with no envelope module of its own does not click. */
	advGraphOut?: GainNode;
	/** Every OUT the graph reached, independent of the others -- see
	    `buildActivation`'s own field of the same name. `releaseVoice` reads
	    this to fade each OUT's own gain at its own DUR or natural stop,
	    rather than fading the one shared `advGraphOut` and taking every
	    other OUT down with whichever OUT's deadline arrives first. */
	advGraphOuts?: Map<
		string,
		{ delay: number; durCap: number | undefined; gain: GainNode; sources: AudioScheduledSourceNode[] }
	>;
}

/** A track's shared chain: what its TRTNs feed, built once for every note. */
interface TrackChain {
	/** What the chain was built from, so an edit is noticed at the next note. */
	sig: string;
	/** Bus number to the gain every note's TSND lands on. */
	buses: Map<number, GainNode>;
	/** The chain's last node before the mixer, which a retirement fades. */
	out: GainNode;
	sources: AudioScheduledSourceNode[];
	/** How long it rings after its last note, before it can be taken down. */
	tail: number;
	quietSince?: number;
}

class ModularSynth {
	private tracks: TrackData[] = JSON.parse(JSON.stringify(INITIAL_TRACKS));
	private activeVoices: Map<string, ActiveVoice> = new Map();
	/** Every REL/ON-CHOKE source currently ringing, across every voice that
	    has already been reaped or choked out of `activeVoices`.

	    Their whole reason to exist is outliving the voice that fired them, so
	    nothing in `activeVoices` can find them once that voice is gone -- and
	    a tail with no envelope of its own has no natural end, which without
	    this set would mean no way at all to silence it short of reloading the
	    page. Entries remove themselves on `onended`; `stopAll` is the one
	    caller that needs to reach in from outside. */
	private ringingTails: Set<AudioScheduledSourceNode> = new Set();
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
	/* Told when the pedal changes, including when the engine drops it itself.
	   STOP clears `isSustainPedalDown` directly, and the store that draws the
	   badge is only ever written by the MIDI handler -- so stopping with the
	   pedal physically down left the UI reading "sustain on" against an engine
	   that had let go, and it stayed wrong until the pedal was moved. */
	private onSustainListeners: Set<(down: boolean) => void> = new Set();
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
	/**
	 * The gates of the note being built right now, collected so the key coming
	 * up can close them. Set around the build in `triggerTrackVoice` and null
	 * everywhere else -- a REL or ON-CHOKE activation is built later, against a
	 * length it already knows, and schedules its own gates as before.
	 */
	private noteGates: { list: AudioParam[]; openEnded: boolean } | null = null;
	/**
	 * Gates raised by the note being built in real time, held back until the
	 * whole voice exists.
	 *
	 * A voice is built a node and a cable at a time on the main thread, and the
	 * audio thread renders between those calls -- and Chrome runs a worklet
	 * whose output is not connected yet anyway. A gate raised at the note's own
	 * time let a module run before the cable carrying it existed. An envelope
	 * that loses a few milliseconds sounds the same; a 3 ms hammer pulse played
	 * into nothing struck no string, and about one note in fifteen of a
	 * waveguide piano was silent. A fixed lead cut that down and a GC pause
	 * mid-build still beat it, so the gates wait for the build instead: raised
	 * together once it is done, past where the audio thread can already be. Null outside a real-time build -- offline renders and sequenced
	 * notes are scheduled ahead and raise their gates as before.
	 */
	private deferredGates: { gate: AudioParam; t: number; heldSec: number; strike: boolean }[] | null = null;

	/* The TRTN buses a note's TSND delivers to, set while that note builds. */
	private trackBusSends: Map<number, AudioNode> | null = null;
	/* The buses a track chain opens, collected while the chain builds. */
	private trackBusReturns: Map<number, GainNode> | null = null;
	/* Each track's shared chain, per context: an export renders its own. */
	private trackChains = new WeakMap<BaseAudioContext, Map<number, TrackChain>>();
	private chainWatch: ReturnType<typeof setInterval> | null = null;
	/* The live context the watched chains belong to. */
	private chainCtx: BaseAudioContext | null = null;

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
		// Built, not turned: take the value now rather than gliding to it.
		this.applyDriveRouting(true);

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
		this.sharedGuardsCtx = null;
		this.ensureSharedGuards(ctx);
	}

	private sharedGuardsCtx: BaseAudioContext | null = null;

	/**
	 * GUARDs where notes meet: each track bus's input, and the outputs of the
	 * master delay and reverb.
	 *
	 * Everything a note sends meets every other track on the master bus, and
	 * the reverb and the delay hold what they are given. One non-finite sample
	 * from one resonator made the sum NaN and sat in the reverb for its whole
	 * tail -- every track silent for seconds, then back as the tail ran out:
	 * the "global mute" the complex patches set off now and then. A guard at
	 * each of these keeps a fault on the track that made it, and says so in
	 * the console. At the shared points rather than on every note: a guard per
	 * note was two more worklets a voice, and on a twelve-voice piano that was
	 * enough to underrun the audio thread on its own.
	 *
	 * The worklet loads when the context is made and the master chain is built
	 * at the first note, so this is asked again at each note until it has run.
	 */
	private ensureSharedGuards(ctx: BaseAudioContext) {
		if (this.sharedGuardsCtx === ctx || this.masterFXCtx !== ctx) return;
		const made: LiveDsp[] = [];
		const insert = (from: AudioNode, to: AudioNode[], what: string, trackId?: number) => {
			const g = this.guard(ctx, trackId, what);
			if (!g) return false;
			from.disconnect();
			from.connect(g.node);
			for (const t of to) g.node.connect(t);
			made.push(g);
			return true;
		};
		if (!this.trackBuses.length || !this.delayNode || !this.delayFeedbackGain || !this.delayWetGain) return;
		if (!this.reverbConvolver || !this.reverbWetGain) return;
		for (const [i, bus] of this.trackBuses.entries()) if (!insert(bus.input, [bus.filters[0]], 'bus', i)) return;
		// The delay's output feeds its own feedback as well as the mix: guarded, a fault cannot circulate.
		insert(this.delayNode, [this.delayFeedbackGain, this.delayWetGain], 'master delay');
		insert(this.reverbConvolver, [this.reverbWetGain], 'master reverb');
		this.sharedGuardsCtx = ctx;
	}

	/**
	 * When an event-fired activation with no DUR of its own (REL or ON-CHOKE
	 * into a FOLLOW OUT) has finished sounding: held for as long as its key
	 * was, then the longest release anything in the graph asks for -- an ENV's
	 * attack, decay and release, or a resonator's ring. Its sources are stopped
	 * then. Nothing used to stop them: every key-up of a patch with a REL
	 * branch left a looping noise source and a worklet running for the rest of
	 * the session, measured as 60 still running after 30 key-ups.
	 */
	private static activationEnd(graph: RackGraph, params: Record<string, number>, heldSec: number): number {
		let tail = 0.1;
		// The track's chain rings on its own; a note's activation is not held for it.
		const shared = trackScope(graph, EXEC_PORT_IDS);
		for (const n of graph.nodes ?? []) {
			if (shared.has(n.id)) continue;
			const p: Record<string, number> = {};
			const prefix = `${n.id}.`;
			for (const [k, v] of Object.entries(params)) if (k.startsWith(prefix)) p[k.slice(prefix.length)] = v;
			tail = Math.max(tail, ModularSynth.moduleTail(n.type, p));
			if (n.type === 'env') tail = Math.max(tail, (p.envA ?? 0.005) + (p.envD ?? 0.2) + (p.envR ?? 0.2));
		}
		return heldSec + Math.min(20, tail) + 0.1;
	}

	private static moduleTail(id: string, p: Record<string, number>): number {
		switch (id) {
			case 'string':
				return p.decayTime ?? 2;
			// DCAY is the fundamental's T60; the upper modes are gone well before.
			case 'wire':
				return p.wireDecay ?? 4;
			/* The fundamental (n=1) carries most of a tube's level and its decay
           exponent is n-independent at n=1, so its partial rings for the
           full DCAY setting -- not the capped 0.35s this used to return,
           which agreed with a `min(dn, 0.35)` the builder dropped once DCAY
           became the release its docstring describes. Left capped here after
           that, `extrasStop` reaped the voice a third of a second in and the
           bench could not tell a 0.1s decay from a 12s one because both were
           cut to the same tail. 1.5 is still TUBE's own printed default. */
			case 'tube':
				return Math.max(0.05, p.tubeDecay ?? 1.5);
			/* A delay line's tail is how long its echoes stay audible: each lap
           loses (1 - feedback), so the time to fall 60 dB is time * 3 /
           -log10(g). Capped, because g near 1 diverges. */
			case 'delay': {
				const time = Math.max(0.001, (p.dlTime ?? 220) / 1000);
				const g = Math.min(0.85, Math.max(0, (p.dlFeedback ?? 35) / 100));
				if (g <= 0.01) return time;
				return Math.min(8, (time * 3) / -Math.log10(g));
			}
			// A body's impulse is under a tenth of a second.
			case 'ir':
				return 0.1;
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
		}

	/**
	 * How long the voice's chain rings after its input stops.
	 *
	 * The sources are stopped a moment after the amp envelope closes, which is
	 * right for a subtractive voice: nothing downstream is still producing sound.
	 * A resonator is exactly the opposite -- a plucked string rings on -- so the
	 * voice has to be held open for as long as the chain will sound.
	 *
	 * OUT's own DUR caps this rather than replacing it: it can only shorten a
	 * tail the graph would have rung out anyway, never lengthen one, so a knob
	 * left at its -1 default changes nothing and a mistuned feedback loop that
	 * would otherwise ring for the full 12s ceiling can be told to let go sooner.
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
		const tailOf = ModularSynth.moduleTail;

		let tail = 0;
		const graph = track.rackGraph;
		const graphOwnsVoice = !!graph?.nodes?.length;
		/* The chain plays only when there is no graph to play instead -- the
       same precedence `triggerTrackVoice` gives them, matched here rather
       than checked independently. Checking both unconditionally meant a
       track carrying a `rackChain` from before it switched to ADV, or a
       preset that saves one alongside its graph, had its silent chain's
       modules still setting the tail: a plain OSC-only graph measured a 2s
       ring-out because `rackChain` still named a STRING nothing was
       playing, and DUR's own FOLLOW default read as "keep the voice two
       seconds longer" instead of "no cap at all". */
		if (!graphOwnsVoice) {
			const chain = track.rackChain;
			if (Array.isArray(chain) && chain.length) {
				const p = track.rackParams ?? {};
				for (const id of chain) tail = Math.max(tail, tailOf(id, p));
			}
		}

		if (graph && Array.isArray(graph.nodes)) {
			const gp = track.graphParams ?? {};
			/* The track's chain is not the note's: a soundboard's ring is the
			   chain's own tail, and holding every voice open for it would cost a
			   voice's worth of strings per key for as long as the board sounds. */
			const shared = trackScope(graph, EXEC_PORT_IDS);
			for (const n of graph.nodes) {
				if (shared.has(n.id)) continue;
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
	 * OUT's own DUR: FOLLOW is level-triggered, following however long the
	 * note (or its natural ring-out) actually lasts, the same as
	 * `rackTailSeconds` on its own decides. TIME and STEP are edge-triggered
	 * instead -- once whatever reaches this OUT fires, the voice holds for
	 * exactly that many seconds and no more or less, independent of how long
	 * the graph's own sound would have taken by itself. A ring shorter than
	 * DUR sits at silence rather than being reaped early; a ring longer than
	 * DUR is cut off exactly at the mark instead of wherever it would
	 * naturally end. This used to be a single field, -1 folded into
	 * `rackTailSeconds`'s own `Math.min` as a ceiling that could only shorten
	 * a tail, never replace it outright -- which measured DUR against the
	 * wrong clock (a rack module's tail runs from the note's *release*; DUR
	 * runs from the *edge that set it going*), could never hold a voice open
	 * past its natural end even when asked to, and made every value read
	 * ambiguous until you remembered which numbers meant what.
	 *
	 * Undefined when no OUT sets one, so a voice with nothing to cap costs
	 * this function nothing beyond the walk every note already pays for.
	 */
	private advGraphDurCap(track: TrackData): number | undefined {
		if (!track.advanced) return undefined;
		return ModularSynth.durCapOf(track.rackGraph, track.graphParams ?? {}, this.bpm);
	}

	/**
	 * The latest moment any OUT in this graph could still need to be heard,
	 * given `t` (when the activation starts) and `voiceStop` (when the voice
	 * would naturally end if every OUT were plain FOLLOW with no WAIT ahead
	 * of it).
	 *
	 * Answered before anything is built, by walking the graph the same way
	 * `buildActivation`'s own per-OUT plan does -- `execDelays` for how late
	 * WAIT pushes each OUT's own start, `durCapOfNode` for what TIME or STEP
	 * asks for from there. Needed early because the voice's *reap* deadline
	 * (when `osc1`'s own `onended` disconnects everything, including OUTs
	 * this graph has not even started yet) is decided before the graph is
	 * built at all -- reaping used the classic voice's own, un-extended
	 * `reapTime` regardless, so a FOLLOW OUT sitting behind a WAIT was
	 * disconnected out from under its own still-scheduled fade the moment
	 * the classic (silent, muted-by-ADV) oscillator's stale stop time
	 * arrived. Measured: a WAIT of 800ms pushed a FOLLOW OUT's own release to
	 * 2.21s, and the voice was torn down at 1.41s regardless -- the fade was
	 * scheduled correctly and never got to run.
	 *
	 * Not gated on `outputRuns`: a WHEN could route around an OUT for this
	 * particular note despite it existing in the graph, and answering "not
	 * reached" here would need the same exec-reach walk `buildActivation`
	 * already does once building starts. Counting every OUT the graph
	 * declares, reached or not, only ever holds reaping open *later* than
	 * strictly necessary -- never earlier, which is the direction that
	 * cannot be wrong.
	 */
	private advGraphLatestDeadline(track: TrackData, t: number, voiceStop: number): number | undefined {
		if (!track.advanced) return undefined;
		const graph = track.rackGraph;
		if (!graph || !Array.isArray(graph.nodes)) return undefined;
		const params = track.graphParams ?? {};
		const delays = execDelays(graph, params, EXEC_PORT_IDS, 'in', 'then');
		const shared = trackScope(graph, EXEC_PORT_IDS);
		let latest: number | undefined;
		for (const n of graph.nodes) {
			if (n.type !== 'out' || shared.has(n.id)) continue;
			const delay = delays.get(n.id) ?? 0;
			const durCap = ModularSynth.durCapOfNode(n.id, params, this.bpm);
			const deadline = durCap !== undefined ? t + delay + durCap : voiceStop + delay;
			latest = latest === undefined ? deadline : Math.max(latest, deadline);
		}
		return latest;
	}

	/**
	 * TIME and STEP both name a length; this is what turns either into
	 * seconds. FOLLOW has no length to name and never reaches here -- see
	 * `durCapOf`'s own guard.
	 */
	private static durSecondsOf(mode: number, params: Record<string, number>, bpm: number): number {
		if (mode === 1) return Math.max(0.001, params.durSec ?? 1);
		const div = DUR_STEP_CHOICES[Math.round(params.durStep ?? 2)] ?? '1';
		const stepDuration = 60 / bpm / STEPS_PER_BEAT;
		return divToStepSpan(div) * stepDuration;
	}

	/**
	 * The graph-walking half of `advGraphDurCap`, apart from it because REL
	 * and ON-CHOKE fire a *second* activation of the same graph -- their own
	 * `AdvBuildContext` snapshot, not the `TrackData` the first activation
	 * built from. That second activation had no DUR of its own at all: its
	 * sources were started and left running with nothing to stop them but
	 * their own `onended`, which a plain oscillator with no envelope never
	 * fires on its own. An OUT reached only by REL rang forever regardless
	 * of what its DUR said, TIME and STEP alike, because nothing here ever
	 * asked the graph what either one meant.
	 *
	 * `bpm` is the *current* tempo, read at the moment this activation fires
	 * rather than baked in at note-on -- a STEP duration is a musical length,
	 * not a fixed number of seconds, so a tempo change between a note
	 * starting and this OUT firing changes what "one beat" means exactly the
	 * way it changes every other beat-relative duration in the engine.
	 */
	private static durCapOf(
		graph: { nodes: { id: string; type: string }[] } | undefined,
		params: Record<string, number>,
		bpm: number
	): number | undefined {
		if (!graph || !Array.isArray(graph.nodes)) return undefined;
		let cap: number | undefined;
		const shared = Array.isArray((graph as RackGraph).cables)
			? trackScope(graph as RackGraph, EXEC_PORT_IDS)
			: new Set<string>();
		for (const n of graph.nodes) {
			if (n.type !== 'out' || shared.has(n.id)) continue;
			const dur = ModularSynth.durCapOfNode(n.id, params, bpm);
			if (dur === undefined) continue;
			cap = cap === undefined ? dur : Math.min(cap, dur);
		}
		return cap;
	}

	/**
	 * One OUT's own DUR, in seconds -- undefined at FOLLOW (0) or an OUT that
	 * has never carried the field at all.
	 *
	 * Split out of `durCapOf` so a per-OUT stop plan can ask this one
	 * question about one node without also asking every other OUT the graph
	 * carries -- see `buildActivation`'s `outs` field, which is what a graph
	 * with more than one OUT needed and `durCapOf`'s single tightest-cap-wins
	 * number could not give it: two OUTs sharing one voice-wide cap meant a
	 * TIME OUT reaching for its own second cut short a sibling OUT set to
	 * FOLLOW, silencing a branch its own DUR never mentioned.
	 */
	private static durCapOfNode(
		outId: string,
		params: Record<string, number>,
		bpm: number
	): number | undefined {
		const mode = params[`${outId}.dur`];
		// FOLLOW (0), or an OUT that has never carried the field at all.
		if (!mode) return undefined;
		const prefix = `${outId}.`;
		const own: Record<string, number> = {};
		for (const [k, v] of Object.entries(params)) if (k.startsWith(prefix)) own[k.slice(prefix.length)] = v;
		return ModularSynth.durSecondsOf(mode, own, bpm);
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
	/**
	 * The whole graph, playing exactly as it always has: THEN's own activation.
	 *
	 * A thin wrapper now -- see `buildActivation` for what building actually
	 * does. Kept as its own method rather than inlining `'then'` at every call
	 * site, so the two things every existing caller wants ("build the note")
	 * and the one thing REL wants ("build what its own outlet reaches") read
	 * as what they are rather than as the same call with a string threaded
	 * through it.
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
		note: { velocity: number; noteIndex: number; seed?: number } = { velocity: 1, noteIndex: 48 },
		trackId?: number,
		waves: Record<string, string> = {}
	): {
		out: AudioNode;
		sources: AudioScheduledSourceNode[];
		startAt: Map<AudioScheduledSourceNode, number>;
		outs: Map<
			string,
			{ delay: number; durCap: number | undefined; gain: GainNode; sources: AudioScheduledSourceNode[] }
		>;
		/** The TSND gains, joined to the track's chain rather than to `out`. */
		sends: AudioNode[];
	} | null {
		return this.buildActivation(
			ctx,
			graph,
			'then',
			params,
			baseFreq,
			t,
			heldSec,
			laneValues,
			presetGain,
			note,
			trackId,
			waves
		);
	}

	/* Each track's sound with its macros flattened, cached per track object: a
	   track is replaced, never edited in place, so a new object is a new patch. */
	private flattened = new WeakMap<TrackData, TrackData>();

	/**
	 * The sound as the engine builds it: every macro instance replaced by what
	 * it holds (`flattenMacros`), knobs and waves rekeyed to match. Everything
	 * that reads a track's graph to play it -- the voice, its tail, the shared
	 * chain -- reads it through this, so none of them knows macros exist.
	 */
	private playable<T extends TrackData | undefined>(track: T): T {
		if (!track?.rackGraph?.macros) return track;
		const hit = this.flattened.get(track);
		if (hit) return hit as T;
		const flat = flattenMacros(track.rackGraph as RackGraph, track.graphParams ?? {}, track.graphWaves ?? {});
		const out = {
			...track,
			rackGraph: { ...flat.graph, ...throughTerminals(flat.graph.nodes, flat.graph.cables) },
			graphParams: flat.params,
			graphWaves: flat.waves
		};
		this.flattened.set(track, out);
		return out as T;
	}

	/**
	 * One compiled loop, as stand-ins for each of its modules.
	 *
	 * The program lists the loop's modules in `isl.members` order with the
	 * members feeding each inlet, and gives every inlet fed from outside the
	 * loop its own input channel and every module its own output channel. Each
	 * stand-in's IN (and B) is a gain into that module's channel, its OUT a
	 * gain on its output, and its knobs the slots holding them -- so a cable
	 * from outside lands where it would on the native module, in the same
	 * units. Null when the loop needs more slots than there are, or the
	 * context has no worklet, and the caller builds the modules one by one.
	 */
	private buildLoopIsland(
		ctx: BaseAudioContext,
		isl: LoopIsland,
		typeById: Map<string, string>,
		audioCables: { from: string; fromPort: string; to: string; toPort: string }[],
		sources: AudioScheduledSourceNode[],
		p: (id: string, key: string, def: number) => number
	): Map<string, ReturnType<ModularSynth['buildGraphNode']>> | null {
		const index = new Map(isl.members.map((id, k) => [id, k]));
		const second = (port: string) => port === 'b' || port === 'r';
		let inputs = 0;
		let slot = 0;
		const slotValues: number[] = [];
		const ops: LoopOp[] = [];
		for (const id of isl.members) {
			const type = typeById.get(id) ?? '';
			const feeds = audioCables.filter((c) => c.to === id);
			const twoInlets = type === 'diff' || type === 'ring';
			const side = (b: boolean) => feeds.filter((c) => (twoInlets && second(c.toPort)) === b);
			const inner = (list: typeof feeds) =>
				list.filter((c) => index.has(c.from)).map((c) => index.get(c.from)!);
			const outer = (list: typeof feeds) => list.some((c) => !index.has(c.from));
			const slots: Record<string, number> = {};
			for (const [key, def] of LOOP_KNOBS[type] ?? []) {
				if (slot >= LOOP_SLOTS) return null;
				slots[key] = slot;
				slotValues.push(p(id, key, def));
				slot++;
			}
			ops.push({
				type,
				a: inner(side(false)),
				aExt: outer(side(false)) ? inputs++ : -1,
				b: inner(side(true)),
				bExt: twoInlets && outer(side(true)) ? inputs++ : -1,
				slots,
				kind: Math.round(p(id, type === 'shape' ? 'shapeKind' : 'type', 0)),
				bus: Math.max(0, Math.min(7, Math.round(p(id, 'bus', 0)))),
				lend: isl.lenders.has(id) ? 1 : 0
			});
		}
		const dsp = createLiveDsp(ctx, LOOP_PROCESSOR, {
			numberOfInputs: inputs,
			numberOfOutputs: ops.length,
			outputChannelCount: ops.map(() => 1),
			channelCount: 1,
			channelCountMode: 'explicit',
			processorOptions: { program: { ops, inputs } }
		});
		if (!dsp) return null;
		slotValues.forEach((v, s) => (dsp.param(`p${s}`).value = v));
		sources.push(dsp.source);

		const stands = new Map<string, ReturnType<ModularSynth['buildGraphNode']>>();
		ops.forEach((op, k) => {
			const id = isl.members[k];
			const inlet = (ch: number) => {
				const g = ctx.createGain();
				if (ch >= 0) g.connect(dsp.node, 0, ch);
				return g;
			};
			const out = ctx.createGain();
			dsp.node.connect(out, k);
			const mod = new Map<string, AudioNode | AudioParam>();
			for (const [key, s] of Object.entries(op.slots)) mod.set(key, dsp.param(`p${s}`));
			stands.set(id, {
				in: inlet(op.aExt),
				in2: op.type === 'diff' || op.type === 'ring' ? inlet(op.bExt) : undefined,
				out,
				mod
			});
		});
		return stands;
	}

	/**
	 * The track's shared chain for this patch, built if it is not already
	 * running, and the buses a note's TSND can reach. Null when the patch has
	 * no TRTN.
	 *
	 * Built at the first note that needs it and kept while the track sounds,
	 * so the notes played into it meet there -- the body a piano's strings
	 * share. An edit to anything the chain reads is noticed at the next note:
	 * the old chain rings out for its own tail and a new one takes the notes
	 * from then on, since notes already sounding are still wired to the old.
	 */
	private ensureTrackChain(
		ctx: AudioContext,
		trackId: number,
		track: TrackData,
		graph: RackGraph,
		busInput: AudioNode
	): Map<number, GainNode> | null {
		let chains = this.trackChains.get(ctx);
		if (!chains) {
			chains = new Map();
			this.trackChains.set(ctx, chains);
		}
		const current = chains.get(trackId);
		const shared = trackScope(graph, EXEC_PORT_IDS);
		if (!shared.size) {
			if (current) this.retireChain(ctx, chains, trackId, current.tail);
			return null;
		}
		const sig = ModularSynth.chainSig(graph, shared, track);
		if (current?.sig === sig) {
			current.quietSince = undefined;
			return current.buses;
		}
		if (current) this.retireChain(ctx, chains, trackId, current.tail);

		const params = track.graphParams ?? {};
		const t = ctx.currentTime;
		const buses = new Map<number, GainNode>();
		/* Gates rise now, not on a note's deferred schedule: the chain is not a
		   note, and outlives the one that happened to build it. */
		const savedGates = this.noteGates;
		const savedDeferred = this.deferredGates;
		this.noteGates = null;
		this.deferredGates = null;
		this.trackBusReturns = buses;
		let built: ReturnType<ModularSynth['buildActivation']> = null;
		try {
			built = this.buildActivation(
				ctx,
				graph,
				'then',
				params,
				this.masterTuningFreq,
				t,
				// Held for as long as the chain lives; its sources stop when it retires.
				1e5,
				{},
				track.presetGain ?? 1,
				{ velocity: 1, noteIndex: 48 },
				trackId,
				track.graphWaves ?? {},
				'in',
				'track'
			);
		} finally {
			this.trackBusReturns = null;
			this.noteGates = savedGates;
			this.deferredGates = savedDeferred;
		}
		if (!built || !buses.size) return null;
		for (const src of built.sources) src.start(built.startAt.get(src) ?? t);

		const out = ctx.createGain();
		built.out.connect(out);
		const pan = ctx.createStereoPanner();
		pan.pan.value = track.pan;
		out.connect(pan);
		pan.connect(busInput);
		if (this.delayNode && this.delayMix > 0) pan.connect(this.delayNode);
		if (this.reverbConvolver && this.reverbMix > 0) out.connect(this.reverbConvolver);

		let tail = 0.1;
		for (const n of graph.nodes) {
			if (!shared.has(n.id)) continue;
			tail = Math.max(tail, ModularSynth.moduleTail(n.type, ModularSynth.paramsOf(n.id, params)));
		}
		chains.set(trackId, { sig, buses, out, sources: built.sources, tail: Math.min(20, tail) });
		if (!this.renderCtx) {
			this.chainCtx = ctx;
			this.watchChains();
		}
		return buses;
	}

	/** What a chain reads: its nodes, the cables into them, their knobs, and the track's pan and level. */
	private static chainSig(graph: RackGraph, shared: Set<string>, track: TrackData): string {
		const cables = graph.cables.filter((c) => shared.has(c.to));
		const readers = new Set([...shared, ...cables.map((c) => c.from)]);
		const params = Object.entries(track.graphParams ?? {})
			.filter(([k]) => readers.has(k.slice(0, k.indexOf('.'))))
			.sort(([a], [b]) => (a < b ? -1 : 1));
		const waves = Object.entries(track.graphWaves ?? {}).filter(([k]) =>
			readers.has(k.slice(0, k.indexOf('.')))
		);
		return JSON.stringify([
			graph.nodes.filter((n) => readers.has(n.id)).map((n) => [n.id, n.type]),
			cables,
			params,
			waves,
			track.pan,
			track.presetGain ?? 1
		]);
	}

	private static paramsOf(id: string, params: Record<string, number>): Record<string, number> {
		const own: Record<string, number> = {};
		const prefix = `${id}.`;
		for (const [k, v] of Object.entries(params)) if (k.startsWith(prefix)) own[k.slice(prefix.length)] = v;
		return own;
	}

	/** When each track last reported a fault, so a stream of them is one line a second. */
	private guardReported = new Map<string, number>();

	/**
	 * A GUARD for one shared point of the mix: what passes is finite and within
	 * +-8, or silence. Null where the worklet is not loaded yet.
	 */
	private guard(ctx: BaseAudioContext, trackId: number | undefined, what: string): LiveDsp | null {
		/* No outputChannelCount: one in and one out, so the output takes the
		   input's channels as they come -- a mono note stays mono, and the
		   panner after it pans it the way it panned before the guard. */
		const dsp = createLiveDsp(ctx, GUARD_PROCESSOR, {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			channelCountMode: 'max'
		});
		if (!dsp) return null;
		dsp.node.port.onmessage = (e: MessageEvent) => {
			const m = e.data as { nonFinite?: number; clipped?: number };
			const key = `${trackId}:${what}`;
			const now = Date.now();
			if (now - (this.guardReported.get(key) ?? 0) < 1000) return;
			this.guardReported.set(key, now);
			const name = trackId !== undefined ? this.tracks[trackId]?.name : undefined;
			console.warn(
				`[synth] track ${trackId ?? '?'}${name ? ` (${name})` : ''}, ${what}: ` +
					`${m.nonFinite ?? 0} non-finite samples silenced, ${m.clipped ?? 0} held at +-8`
			);
		};
		return dsp;
	}

	private bodyIrs = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

	/** Body `index` of BODY_IRS as a buffer on `ctx`, decoded the first time it is asked for. */
	private bodyIr(ctx: BaseAudioContext, index: number): AudioBuffer {
		let cache = this.bodyIrs.get(ctx);
		if (!cache) {
			cache = new Map();
			this.bodyIrs.set(ctx, cache);
		}
		const i = Math.max(0, Math.min(BODY_IRS.length - 1, index));
		const hit = cache.get(i);
		if (hit) return hit;
		const ir = BODY_IRS[i];
		const bytes = Uint8Array.from(atob(ir.data), (c) => c.charCodeAt(0));
		const samples = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
		/* At the context's own rate: a ConvolverNode refuses a buffer at any
		   other, and a live context runs at the device's -- 44.1 kHz on most
		   machines, where the 48 kHz impulse threw and every note of every
		   patch using IR was built as nothing. Resampled (cubic), and scaled by
		   the ratio of rates so a convolution sums to the same level with more
		   or fewer taps. */
		const rate = ctx.sampleRate;
		const step = ir.rate / rate;
		const length = Math.max(1, Math.floor((samples.length - 1) / step));
		const buf = ctx.createBuffer(1, length, rate);
		const ch = buf.getChannelData(0);
		const k = (ir.scale / 32767) * step;
		const at = (n: number) => samples[Math.max(0, Math.min(samples.length - 1, n))];
		for (let n = 0; n < length; n++) {
			const t = n * step;
			const j = Math.floor(t);
			const f = t - j;
			const y0 = at(j - 1);
			const y1 = at(j);
			const y2 = at(j + 1);
			const y3 = at(j + 2);
			ch[n] =
				k *
				(y1 +
					0.5 *
						f *
						(y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0))));
		}
		cache.set(i, buf);
		return buf;
	}

	/** Let a chain ring for `after` seconds more, then take it down. */
	private retireChain(ctx: BaseAudioContext, chains: Map<number, TrackChain>, trackId: number, after: number) {
		const chain = chains.get(trackId);
		if (!chain) return;
		chains.delete(trackId);
		const now = ctx.currentTime;
		const end = now + Math.max(0.02, after);
		try {
			chain.out.gain.cancelScheduledValues(now);
			chain.out.gain.setValueAtTime(chain.out.gain.value, Math.max(now, end - Math.min(0.5, after)));
			chain.out.gain.linearRampToValueAtTime(0, end);
			for (const src of chain.sources) src.stop(end + 0.01);
		} catch {
			/* a source already stopped */
		}
		if (!this.renderCtx) setTimeout(() => chain.out.disconnect(), (end - now) * 1000 + 100);
	}

	/**
	 * Take down a live chain once its track has been quiet for its tail, or
	 * has stopped playing the patch it was built from.
	 *
	 * Once a second is plenty: the question is whether a reverb has been
	 * silent long enough to stop computing it, and the answer is in seconds.
	 */
	private watchChains() {
		if (this.chainWatch) return;
		this.chainWatch = setInterval(() => {
			const ctx = this.chainCtx;
			const chains = ctx ? this.trackChains.get(ctx) : undefined;
			if (!ctx || !chains || !chains.size) {
				if (this.chainWatch) clearInterval(this.chainWatch);
				this.chainWatch = null;
				return;
			}
			const now = ctx.currentTime;
			for (const [trackId, chain] of [...chains]) {
				const track = this.playable(this.tracks[trackId]);
				const graph = track?.advanced && track.rackGraph?.nodes?.length ? graphOf(track) : undefined;
				const stale =
					!graph || ModularSynth.chainSig(graph, trackScope(graph, EXEC_PORT_IDS), track) !== chain.sig;
				if (stale) {
					this.retireChain(ctx, chains, trackId, chain.tail);
					continue;
				}
				let busy = false;
				for (const v of this.activeVoices.values()) if (v.trackId === trackId) busy = true;
				if (busy) chain.quietSince = undefined;
				else if (chain.quietSince === undefined) chain.quietSince = now;
				else if (now - chain.quietSince > chain.tail + 0.5) this.retireChain(ctx, chains, trackId, 0.05);
			}
		}, 1000);
	}

	/** Every live chain, gone in a moment: STOP means silence, a shared room included. */
	private retireAllChains() {
		const ctx = this.chainCtx;
		const chains = ctx ? this.trackChains.get(ctx) : undefined;
		if (!ctx || !chains) return;
		for (const trackId of [...chains.keys()]) this.retireChain(ctx, chains, trackId, 0.05);
	}

	/**
	 * One exec outlet's activation: the audio network it reaches, built and
	 * started as of `t`.
	 *
	 * This is the rewrite `buildRackGraph` used to be whole. Blueprint's own
	 * split is exec versus data -- which nodes run, and what they read when
	 * they do -- and an activation is one run of the exec side: pick the exec
	 * outlet (`entryPort`, an outlet on one of `EVENT_SOURCE_TYPES`), walk
	 * where it reaches, and build only the audio ancestry of whatever it
	 * activates (`ACTIVATION_TYPES` -- an OUT, today). THEN calling this is
	 * what plays a note; REL calling it later, at the real moment the key
	 * comes up, with its own `t`, is what makes a release its own event rather
	 * than a number read off in advance.
	 *
	 * Two activations of the same graph never share a built node. An
	 * oscillator REL's ancestry reaches cannot be the one THEN already started
	 * -- it has been running since the note began and cannot be rewound -- so
	 * each call here builds its own instances from scratch, however much of
	 * the graph the two activations have in common. A pure node has no
	 * instance to share in the first place: it is pulled fresh by the
	 * resolver either way, at whatever `noteEvent` this call constructs.
	 */
	private buildActivation(
		ctx: BaseAudioContext,
		graph: {
			nodes: { id: string; type: string }[];
			cables: { from: string; fromPort: string; to: string; toPort: string }[];
		},
		entryPort: string,
		params: Record<string, number>,
		baseFreq: number,
		t: number,
		heldSec: number,
		laneValues: Record<string, number> = {},
		presetGain = 1,
		/* What the key press itself was. ENTRY publishes these as pins, so a patch
       can wire velocity to brightness the way a real drum has it rather than
       only to level. */
		note: { velocity: number; noteIndex: number; seed?: number } = { velocity: 1, noteIndex: 48 },
		/* Whose voice this is. WHEN's "ANY VOICE" test asks what is sounding on
       this track, so the audio side needs it to answer the same question the
       action side does. */
		trackId?: number,
		/* Per-node settings that are names rather than numbers -- an oscillator's
       waveform is the only one so far. Kept out of `params` because everything
       reading that map treats a value as a quantity. */
		waves: Record<string, string> = {},
		/* Which node type this activation's `entryPort` lives on -- KEY-EVENT
       for THEN and REL, ON-CHOKE for its own outlet. Defaulted to `'in'`
       (KEY-EVENT) rather than derived from `EVENT_SOURCE_TYPES` here, because
       a single activation always seeds from exactly one event source and the
       caller already knows which one fired; asking the catalogue again per
       call would only be answering a question this parameter already
       settles. */
		entryType = 'in',
		/* Which half of the patch this build is: a note's own nodes, or the
		   track's shared chain behind a TRTN (see `trackScope`). A note leaves
		   the chain out -- it is built once, in `ensureTrackChain` -- and the
		   chain takes only its own nodes and the values that set its knobs. */
		part: 'voice' | 'track' = 'voice'
	): {
		out: AudioNode;
		sources: AudioScheduledSourceNode[];
		/** When each source starts, so a WAIT gap reaches the sound and not only
        the modules that happen to schedule against the note time. */
		startAt: Map<AudioScheduledSourceNode, number>;
		/** Every OUT this activation reached, each independent of the others --
		 *  see the field's own construction below for why that has to be true. */
		outs: Map<
			string,
			{ delay: number; durCap: number | undefined; gain: GainNode; sources: AudioScheduledSourceNode[] }
		>;
		/** The TSND gains, joined to the track's chain rather than to `out`. */
		sends: AudioNode[];
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

		/* The event this note is, named once.
		
		   Hoisted out of the `createResolver` call because `execReach` needs the
		   same thing: a WHEN's IF socket is a value, and resolving a value takes
		   the event it is resolved against. Passing four arguments where six were
		   wanted left `note` undefined, and `whenHolds` returns true the moment
		   it is -- so the IF socket was read by nobody and a WHEN passed
		   execution whatever its condition said. Measured: a CONST of 1 and a
		   CONST of 0 into IF both rendered peak 0.6807.
		
		   One object rather than two literals, because `noteActions` builds its
		   own with `velocity: 1` and `pitch: noteIndex - 69` -- a different
		   quantity under the same name -- and two copies of "what this note is"
		   are what let the two halves of the engine disagree. */
		const noteEvent = {
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
			lanes: laneValues,
			seed: note.seed
		};
		const resolver = createResolver(graph, params, noteEvent);
		const cvIn = (nodeId: string, port: string, fallback: number) =>
			resolver.input(nodeId, port, fallback);

		/* Which nodes this activation runs. Execution is Blueprint's white wire:
       it reaches the nodes that *do* something -- WHEN asks, ACT mutes, OUT
       hands the patch to the master bus.

       There is no "unless the patch draws no exec cable" exemption; the seed
       patch draws the cable instead, so the simplest patch is still one you can
       play without building it. This comment used to claim the opposite of what
       execReach does, which is how the exemption stayed alive in the branch
       below long after it was deleted from the resolver.

       `entryPort` is threaded through rather than assumed: THEN and REL are
       two different activations of the same graph, and a WHEN or a WAIT
       reachable from one must not be reachable from the other's walk just
       because both outlets sit on the same ENTRY node. */
		const reach = execReach(
			graph,
			EXEC_PORT_IDS,
			entryType,
			(id) => this.whenHolds(params, id, note.noteIndex, trackId ?? -1, graph, noteEvent),
			entryPort
		);
		const outputRuns = (id: string) => runs(reach, id);
		/* When each node runs, in seconds after the note. Zero for everything the
       event reaches directly; WAIT adds its gap as execution passes through, so
       a strike wired downstream of one lands late -- which is a flam. */
		const delays = execDelays(graph, params, EXEC_PORT_IDS, entryType, entryPort);

		/* Which nodes this activation actually needs built.

       An activation point (an OUT, by ACTIVATION_TYPES) that this walk's exec
       reaches is what "playing" means for this call; everything upstream of
       it, along audio and mod cables, is its ancestry and nothing else is.
       Restricting the build to that ancestry is what makes REL's own call
       here not start an oscillator that belongs only to THEN's branch --
       today, with only THEN ever calling in, it also happens to prune the
       nodes that were built and left disconnected before, which is waste
       rather than a behaviour anyone relied on.

       A patch with no OUT module at all is the one case this cannot narrow:
       ACTIVATION_TYPES finds no root to walk ancestry from, and the sink step
       below falls back to its own older rule -- every node nothing else
       listens to is an output. That rule needs the whole graph in `order`,
       so this keeps the whole graph rather than pruning to an empty ancestry
       and building nothing. */
		const shared = trackScope(graph, EXEC_PORT_IDS);
		/* In the chain, a node outside it is built only if it settles to a
		   number or is a controller: a note's pitch or envelope has no single
		   value on a track many notes share, so a cable from one is dropped. */
		const partHas = (n: { id: string; type: string }) =>
			part === 'voice'
				? !shared.has(n.id)
				: shared.has(n.id) || isValueNode(n.type) || n.type === 'ctrl' || n.type === entryType;
		const activatedOuts = graph.nodes.filter(
			(n) =>
				ACTIVATION_TYPES.has(n.type) &&
				runs(reach, n.id) &&
				partHas(n) &&
				(part === 'voice' || (shared.has(n.id) && n.type === 'out'))
		);
		/* SEND feeds RTN with no cable to say so -- see `fbBuses` and the
       `fbsend`/`fbrtn` case below. An ancestor walk that only followed
       cables would find RTN behind an OUT (RTN does have an audio outlet)
       but never SEND behind RTN, and the signal the loop is meant to catch
       would never be built. Paired here by BUS number, the same number the
       engine itself matches them by at build time, and fed to the walk as
       edges that are not cables but must still count as one. */
		const fbEdges = graph.nodes
			.filter((n) => n.type === 'fbrtn')
			.flatMap((rtn) => {
				const bus = params[`${rtn.id}.bus`] ?? 0;
				return graph.nodes
					.filter((n) => n.type === 'fbsend' && (params[`${n.id}.bus`] ?? 0) === bus)
					.map((send) => ({ from: send.id, to: rtn.id }));
			});
		/* Probes are exempt from ancestry the way OUT is its own root: a SCOPE,
       FFT or LOUD has no outlet at all, so nothing an activated OUT depends
       on ever depends on a probe, and an ancestry walk from OUT alone would
       never find one -- a probe on the canvas would simply stop working.
       Placing one has to cost nothing, which is the whole reason it exists,
       so every probe *this activation's own OUTs can actually reach* is
       treated as a root alongside them; its own feed (a MUL's operands, say)
       is then found the same way an OUT's is.

       Not every probe in the whole graph, regardless of entry: a probe
       tapped off a branch only THEN reaches used to be rebuilt from scratch
       by REL's own activation too, because probes ignored `entryType` and
       `entryPort` entirely and were roots every single time, on every walk.
       REL firing then found the probe, walked back to whatever fed it --
       here, a plain FOLLOW OUT's own OSC, with no REL wiring anywhere near
       it -- and built a second, independent oscillator nothing in this
       activation's own release logic would ever stop: `releaseVoice`
       schedules the fade on the note-on voice's own sources, and this new
       one belongs to `fireVoiceInterrupt`'s `relSources` instead, ringing
       forever with no envelope of its own. Measured: a bare OSC into a
       FOLLOW OUT, watched through a SCOPE tapped on its output, kept
       reading a full-amplitude wave indefinitely after the key came up,
       because the *second* OSC the probe's own root status built on every
       REL was never released -- the first one behind the FOLLOW OUT itself
       had already faded exactly on schedule and was inaudible; the SCOPE
       was reading the orphan.

       Answered here by computing the OUT-only ancestry first, then keeping
       a probe only if its own *feed* -- the node on the other end of the
       cable running into it, the same thing `audioAncestors` itself chases
       for anything else -- is either a value node (a CONST, an ADD, and the
       rest of the family this graph can pull as a plain number without
       building anything that outlives the read) or already inside that
       ancestry. A probe sits downstream of whatever it taps, never
       upstream, so it never appears in an OUT's own ancestry the way its
       feed does; asking about the feed instead is what makes this the same
       question audioAncestors already answers for every other node.

       The value-node exemption matters on its own: SCOPE and LOUD both take
       a CV as well as audio, precisely so a bare CONST feeding nothing else
       in the graph can still be watched -- that CONST is never going to be
       any OUT's own ancestor, by design, and would be dropped by the OUT
       reachability test alone the same wrong way an actual orphaned
       oscillator needed to be. A value node never becomes a source this
       activation would need to clean up later, so there is nothing here for
       the REL-rebuilds-THEN's-OSC bug to reach through it -- unlike an OSC,
       ENV or NODE.CV, which do build something with a lifetime of its own. */
		const probes = graph.nodes.filter(
			(n) => PROBE_TYPES.has(n.type) && (part === 'voice' ? !shared.has(n.id) : shared.has(n.id))
		);
		const hasAnyOut = graph.nodes.some((n) => ACTIVATION_TYPES.has(n.type) && partHas(n));
		const outIds = activatedOuts.map((n) => n.id);
		const outOnlyAncestry = hasAnyOut
			? audioAncestors(graph, audioCables, modCables, outIds, fbEdges)
			: null;
		const feedsOf = (id: string) =>
			[...audioCables, ...modCables].filter((c) => c.to === id).map((c) => c.from);
		const probeFeedType = new Map(graph.nodes.map((n) => [n.id, n.type]));
		const reachableProbes = outOnlyAncestry
			? probes.filter((n) =>
					feedsOf(n.id).some(
						(f) => isValueNode(probeFeedType.get(f) ?? '') || outOnlyAncestry.has(f) || outIds.includes(f)
					)
				)
			: probes;
		const roots = [...activatedOuts, ...reachableProbes].map((n) => n.id);
		const ancestry = hasAnyOut
			? audioAncestors(graph, audioCables, modCables, roots, fbEdges)
			: null;
		const inScope = (id: string) =>
			!ancestry || ancestry.has(id) || roots.includes(id);
		const scopedNodes = (ancestry ? graph.nodes.filter((n) => inScope(n.id)) : graph.nodes).filter(
			partHas
		);

		// Kahn's algorithm; a cycle here means a hand-edited patch file, since the
		// editor refuses to draw one.
		const indeg = new Map<string, number>();
		for (const n of scopedNodes) indeg.set(n.id, 0);
		for (const c of audioCables) {
			if (!indeg.has(c.to) || !indeg.has(c.from)) continue;
			indeg.set(c.to, (indeg.get(c.to) ?? 0) + 1);
		}
		const queue = scopedNodes.filter((n) => (indeg.get(n.id) ?? 0) === 0);
		const order: typeof graph.nodes = [];
		while (queue.length) {
			const n = queue.shift()!;
			order.push(n);
			for (const c of audioCables) {
				if (c.from !== n.id || !indeg.has(c.to)) continue;
				const left = (indeg.get(c.to) ?? 0) - 1;
				indeg.set(c.to, left);
				if (left === 0) {
					const next = scopedNodes.find((m) => m.id === c.to);
					if (next) queue.push(next);
				}
			}
		}
		if (order.length !== scopedNodes.length) return null;

		/* One feedback bus map per voice. See the `fbBuses` parameter. */
		const fbBuses = new Map<number, { send: GainNode; rtn: GainNode }>();

		/* Loops that close in one sample. A SEND/RTN loop whose every module the
		   loop processor knows is built as one worklet (see `planLoops`); each of
		   its modules is then a stand-in whose inlets, outlet and knobs are that
		   worklet's, so every cable below connects the way it always has. A loop
		   that cannot be compiled -- or a context without the worklet -- builds
		   the block-delayed pair as before. */
		const islands = planLoops(order, audioCables, (id) => Math.round(cvIn(id, 'bus', 0)));
		const islandOf = new Map<string, LoopIsland>();
		for (const isl of islands) for (const id of isl.members) islandOf.set(id, isl);
		const islandBuilt = new Map<LoopIsland, Map<string, ReturnType<ModularSynth['buildGraphNode']>> | null>();

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
				sendTo?: AudioNode | null;
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

       WAIT's gap reaches a module that schedules against `t` -- an envelope, a
       strike -- but every AudioScheduledSourceNode was started at the note
       regardless, so an oscillator behind a WAIT played on the beat and the flam
       the module exists for did not happen. */
		const startAt = new Map<AudioScheduledSourceNode, number>();
		/* Which sources each node made, so a per-OUT stop plan can find them by
       walking that OUT's own ancestry -- see the `outs` field this function
       returns. Same slice-of-`sources` trick `startAt` already uses below. */
		const sourcesByNode = new Map<string, AudioScheduledSourceNode[]>();
		const typeById = new Map(graph.nodes.map((n) => [n.id, n.type]));
		/* Modules whose output is a value, not a sound. A CONST left unwired must
       not be summed into the mix -- it is DC, and DC is a click and then a
       silent offset eating headroom.

       Derived from `isValueNode` rather than `isPureNode`, and this is the one
       place the difference is load-bearing. Every entry in `PURE_NODES` used
       to be pure -- pulled once, never built -- so asking either question gave
       the same answer. That stopped being true the day ADD, MUL, CMP and the
       rest of them gained a live-signal build: `isPureNode` now answers false
       for a MUL sitting on the canvas doing nothing but multiply two CONSTs,
       because it *can* be built, and this list would have started mixing that
       MUL's output into the master bus as DC the moment it stopped being
       "pure" in the classification sense -- a correct, inert node suddenly
       audible for a reason that has nothing to do with whether it makes
       sound. `isValueNode` answers the question this list actually asks --
       does this node's output settle to a number rather than describe air
       moving -- and stays true regardless of which build path served it.

       Four names sit beside it, not covered by `isValueNode` because their
       whole reason to exist is producing a live control signal rather than a
       one-shot value: ENV, TO-CV and NODE.CV emit through real audio nodes
       with nothing in `PURE_NODES` to answer for them structurally, and each
       needs the same exemption from the master mix an unwired CONST does. */
		const isModOnly = (type: string) =>
			isValueNode(type) ||
			['env', 'tocv', 'ctrl', 'sh', 'slew'].includes(type);

		for (const node of order) {
			/* A value node carrying no signal is pulled as a number by everything
			   that reads it -- the cable loop below skips a settled source rather
			   than connecting it -- so building it makes nodes nothing is wired
			   to. For MAP that was a live-DSP worklet per node per note, running
			   for the whole voice: a piano patch mapping VEL and PITCH onto a dozen
			   knobs built 14 of them a key and rendered 3x slower than real time. */
			if (isValueNode(node.type) && !isPureNode(node.type) && !resolver.nodeCarriesSignal(node.id))
				continue;
			/* A knob reads its cable first, and its own setting when there is none.
      
         Blueprint has no separate notion of "modulatable" inputs: a pin either
         has something plugged into it or it uses its default. Doing the same
         here is what lets ENTRY's VEL reach a strike's TONE at all -- the mod
         map only ever registered a handful of hand-named ports (`fm`, `cv`,
         `pwm`), so every other knob was unreachable by cable no matter what the
         canvas showed. */
			/* The default is the code default, not the stored one.

			   `cvIn` reads `graphParams` itself and guards it: a stored value that
			   is not finite means the knob is broken, and a broken knob means the
			   same as an absent one. Passing the raw param back in as the fallback
			   handed that guard its own rejected value, so `NaN` resolved to `NaN`
			   and reached `frequency.value`, where Web Audio throws and takes the
			   note -- and the scheduler tick for every other track -- with it. The
			   lookup was redundant as well as harmful. */
			/* A cable takes the knob over.
			
			   Two mechanisms reach a knob and only one of them replaces it. A value
			   cable is already in the number -- `cvIn` returned the cable instead
			   of the stored setting -- but a *signal* cable is connected to the
			   AudioParam afterwards and sums with whatever the knob holds. So a
			   MAP swinging 0..1 into a GAIN whose LVL reads 1 gave a level moving
			   between 1 and 2: the patch that should have gated the sound on and
			   off never reached silence, and no setting of the knob would fix it
			   except the one nobody thinks to try.
			
			   Zero is the identity for a sum, so a knob a signal has claimed reads
			   as zero and the cable alone decides. Turning the knob then does
			   nothing, which is the honest behaviour and what the card now shows
			   by disabling it.
			
			   This is what a VCA's own knob was for, and it is not lost: the
			   resting level a patch wants under an envelope is a GAIN before or
			   after this one, where it is visible and can be automated separately.
			   A knob that silently offsets a cable is not a control, it is a
			   second opinion. */
			const p = (key: string, def: number) =>
				resolver.isDrivenBySignal(node.id, key) ? 0 : cvIn(node.id, key, def);
			const runAt = t + (delays.get(node.id) ?? 0);
			const madeBefore = sources.length;
			const isl = islandOf.get(node.id);
			if (isl && !islandBuilt.has(isl))
				islandBuilt.set(
					isl,
					this.buildLoopIsland(ctx, isl, typeById, audioCables, sources, (id, key, def) =>
						resolver.isDrivenBySignal(id, key) ? 0 : cvIn(id, key, def)
					)
				);
			const stand = isl ? islandBuilt.get(isl)?.get(node.id) : undefined;
			const made = stand ?? this.buildGraphNode(
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
				waves[`${node.id}.wave`],
				fbBuses,
				new Set(
					graph.cables.filter((c) => c.to === node.id).map((c) => c.toPort)
				),
				(port) => resolver.isDrivenBySignal(node.id, port)
			);
			if (!made) continue;
			// Whatever this node just created starts when this node runs.
			for (let i = madeBefore; i < sources.length; i++) startAt.set(sources[i], runAt);
			if (sources.length > madeBefore) sourcesByNode.set(node.id, sources.slice(madeBefore));

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
						// Inside a compiled loop the processor carries it already.
						if (isl && islandBuilt.get(isl) && islandOf.get(c.from) === isl) continue;
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
      
         Cables onto a *knob* are skipped. A declared mod inlet with no knob
         behind it -- a PULSE's PWM -- has no value path at all, so ENTRY's VEL
         reaching one of those is a signal and must still be connected.
      
         And a port can be both. GAIN's LVL is a declared inlet *and* a param
         of the same name, so the resolver reads it as a value and the inlet
         test alone said "signal, connect it". ENTRY's VEL into GAIN's LVL
         was therefore applied twice -- measured at 0.58 RMS where the same
         velocity typed into the knob, and the same velocity from a CONST,
         both read 0.4163. A 1.39x error on the first patch anyone builds.

         TO-SIG's own IN used to be the same shape and is not any more: it
         has no field beside it now, cable-only the way CMP's A is, so it is
         never "already resolved as a value" and always takes this branch --
         which is correct for it, since carrying a live signal is the whole
         reason the module exists.
      
         CONST never showed it: a pure node builds nothing, so `src` is
         undefined and the cable was already being dropped a line below. Only
         ENTRY, which does build, could reach the double.
      
         The two mechanisms are one decision seen from either side -- a value
         replaces the knob, a signal adds to it (docs/node-graph.md, "A value
         replaces a knob; a signal adds to it") -- so exactly one of them may
         act on any given cable. Whether a value path exists is the question,
         and a param of the same name is what makes one. */
			const fromType = typeById.get(c.from) ?? '';
			const toSpec = specById.get(typeOfNode.get(c.to) ?? '');
			const hasValuePath =
				!toSpec?.inputs.some((q) => q.id === c.toPort) ||
				!!toSpec?.params.some((q) => q.key === c.toPort);
			/* MAP is the one node that is pullable *and* buildable, and the two
			   classifications disagree about it: `isValueNode('map')` is true, so
			   the resolver returns its number, while `isPureNode('map')` is false,
			   so the engine builds a WaveShaper. Asking `isPureNode` here therefore
			   failed to skip a MAP that was carrying a value -- the value was read
			   onto the param by `cvIn` and the WaveShaper's resting DC was
			   connected on top of it. Measured: an INV over 0..1 into GAIN's LVL
			   read exactly 1.0 too high at every input, which is `map(midpoint)`
			   arriving a second time.

			   `isValueNode` is the question that was meant: can this be pulled as a
			   number. A node that is itself carrying a signal still has to connect,
			   which is what `carriesSignal` preserves -- so a waveform through MAP
			   is shaped per sample, and a value through MAP is read once.

			   `nodeCarriesSignal` rather than `isDrivenBySignal(c.from, 'a')`: the
			   narrower check answered only for MAP and NODE.CV, whose one movable
			   inlet happens to be named `a`. ADD, MUL, CMP and the rest of the
			   family that followed them do not share that shape -- a MUL fed HELD
			   on `b` alone still has a live output, and asking only about `a` read
			   it as settled, which very nearly reintroduced the exact bug this
			   whole family exists to fix, one port later. */
			const carriesSignal = isValueNode(fromType) && resolver.nodeCarriesSignal(c.from);
			/* ENTRY's own HELD is the one outlet on it that is never a snapshot --
         see the resolver's `read()`, which excludes exactly this port from
         the value path for the same reason. Skipping the connection here
         the way every other ENTRY pin is skipped would leave the resolver's
         fix with nothing to connect to: the value path would already have
         backed off, and this loop would back off too, so the cable would
         draw and carry nothing. */
			const isEntryHeld = fromType === 'in' && c.fromPort === 'held';
			/* A settled value node never needs a second, live connection on top of
			   whatever `cvIn` already resolved for this exact cable -- true
			   whether or not the destination happens to declare a `params` entry
			   under the same key, which is all `hasValuePath` alone ever asked.
			   WIDE, PW and PITCH all resolve their own resting number through
			   `cvIn` with no matching param to its name, and so does every bare
			   leg in the ADD/MUL/CMP family -- `hasValuePath` read every one of
			   them as having nowhere for a value to land, so a CONST reaching any
			   of them connected as well as being pulled and doubled the result
			   (WIDE at 2 measured 0.5085 against an expected 0.41-0.44). None of
			   this could be seen before today, because none of `PURE_NODES` built
			   anything: `src` was always undefined and the guard two lines above
			   dropped the cable regardless of what happens here.

			   Scoped to value-node sources specifically, beside the older rule
			   rather than instead of it -- ENTRY's own snapshot pins (PITCH, VEL,
			   a lane) are not value nodes by this table's own definition and keep
			   the narrower, already-relied-on rule untouched. */
			const settledValueSource = isValueNode(fromType) && !carriesSignal;
			/* ENTRY's snapshot pins into a value node's leg: the leg's resting
			   number is `p(leg)`, which the resolver already answers with the
			   pin -- so connecting the pin too counted it twice. Unseen while
			   ADD only ever settled; once an LFO on B made it build, PITCH on A
			   arrived as the rest *and* as a signal, and a flute with vibrato
			   played a ninth flat. */
			const entryIntoValueLeg =
				fromType === 'in' && !isEntryHeld && isValueNode(typeOfNode.get(c.to) ?? '');
			if (entryIntoValueLeg) continue;
			if (settledValueSource || (hasValuePath && !carriesSignal && !isEntryHeld && (isValueNode(fromType) || fromType === 'in')))
				continue;
			const from = outletOf(src, c.fromPort);
			/* An AudioParam and an AudioNode are both legitimate destinations, and
			   TypeScript needs telling which overload applies. A param destination
			   is what makes a signal into PITCH mean FM rather than needing an
			   inlet of its own with a depth baked into it.

			   Both arms did the same thing -- the test was only ever choosing an
			   overload -- but `AudioParam` is a browser global, so on any runtime
			   without one the whole mod loop threw a ReferenceError and took the
			   note with it. A cast says the same thing to the compiler and nothing
			   at all at runtime. */
			from.connect(param as AudioNode & AudioParam);
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
		/* One gain per OUT, between that OUT's own output and the shared sink --
       the seam a per-OUT stop plan needs and did not have. Without it, a
       DUR fade could only ever land on the *sink itself*, which every OUT
       feeds: fading it to end one OUT's TIME cap silenced every other OUT
       sharing the same voice, whatever their own DUR said. Named in
       `outGains` and handed to the per-OUT stop-plan construction below,
       which is the only place that reads it. */
		const outGains = new Map<string, GainNode>();
		/* The chain outlives every note that feeds it, so a send left joined to
		   it keeps the whole note behind it in the graph the audio thread
		   walks: every string ever struck, each block. Played for a minute the
		   PIANO underran its buffer and fell silent. Whoever ends the note cuts these. */
		const sends: AudioNode[] = [];
		if (outs.length) {
			for (const [id, m] of outs) {
				// An OUT execution never reached does not pass anything on.
				if (!outputRuns(id)) continue;
				const og = ctx.createGain();
				m.out.connect(og);
				/* A TSND's note goes to the track's chain instead of this voice's
				   sink, still through its own gain, so a release fades it the same
				   way it fades an OUT. With no TRTN on its bus it goes nowhere,
				   which is what half a bus is while it is being wired. */
				if (m.sendTo !== undefined) {
					if (m.sendTo) {
						og.connect(m.sendTo);
						sends.push(og);
					}
				} else og.connect(sink);
				outGains.set(id, og);
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
		/* Every OUT this activation actually reached, on its own terms.

       Each entry answers three questions about one OUT alone: when its own
       activation begins (`delay`, seconds after `t` -- 0 unless something
       like WAIT pushed it later), what its own DUR asks for (`durCap`,
       undefined at FOLLOW), and which sources are only reachable by walking
       backward from it (`sources`). `gain` is the seam: the per-OUT node
       built above, sitting between this OUT's own output and the shared
       sink, which is the only place a fade can land without also silencing
       every other OUT feeding the same sink.

       This is what makes two OUTs independent instead of sharing one
       voice-wide stop time. Before it existed, every source the graph built
       -- across every OUT -- stopped at one shared deadline computed from
       whichever OUT's DUR was tightest, so a TIME OUT behind a WAIT silenced
       a sibling OUT set to FOLLOW a full voice-width away, and that same TIME
       OUT's own second was measured from the note's start rather than from
       the moment WAIT actually let it fire -- so a 200ms gap ate 200ms out of
       its own budget instead of shifting it. Both were invisible until a
       patch actually put two OUTs a WAIT apart, because until today nothing
       in this catalogue gave a second OUT a reason to disagree with the
       first about when it should stop.

       Nothing is scheduled on `gain` here, for either TIME/STEP or FOLLOW --
       both need an anchor this function does not have. A first attempt had
       TIME and STEP fade themselves immediately, `t + delay + durCap`, on
       the reasoning that both know their whole lifetime the moment the graph
       builds. That reasoning holds for a *timed* note, where this activation
       both starts and is due to end by times fixed at note-on -- but a
       continuously held note builds this exact same graph once, at note-on,
       with no release in sight yet, and TIME's own established meaning for
       one of those has always been "this many seconds *after the key comes
       up*" (`releaseVoice`'s own `now + durCap`, `now` being the release
       instant) -- not after the note started. Scheduling `t + durCap` here
       fired a full `releaseVoice`'s worth of hold-time early on every
       continuously held TIME note, cutting a 1-second tail at 1.0s into a
       note released at 0.5s instead of the 1.5s DUR was asking for.

       So both modes wait for a caller that knows which shape of note this
       is: the timed-note path anchors TIME/STEP at `t` (its own activation
       truly is fixed length) and FOLLOW at its own uncapped stop, each
       shifted by `delay`; `releaseVoice` anchors both at the real release
       instant instead, the same shift applied to a different `now`.

       Ancestry rather than the whole graph: `audioAncestors` seeded from one
       OUT's own id finds exactly what feeds it, the same walk the graph's own
       build-order pruning already trusts. A node feeding two OUTs appears in
       both entries' `sources` -- unusual, since a WAIT-forked patch normally
       gives each branch its own generator, but not refused -- and the caller
       takes the later of the two deadlines for stopping it outright, so
       neither OUT's own cleanup cuts a source the other still needs. */
		const outsMap = new Map<
			string,
			{ delay: number; durCap: number | undefined; gain: GainNode; sources: AudioScheduledSourceNode[] }
		>();
		if (outs.length) {
			for (const [id] of outs) {
				if (!outputRuns(id)) continue;
				const og = outGains.get(id);
				if (!og) continue;
				const ancestry = audioAncestors(graph, audioCables, modCables, [id], fbEdges);
				const ownSources: AudioScheduledSourceNode[] = [];
				for (const nodeId of [id, ...ancestry]) {
					const found = sourcesByNode.get(nodeId);
					if (found) ownSources.push(...found);
				}
				outsMap.set(id, {
					delay: delays.get(id) ?? 0,
					durCap: ModularSynth.durCapOfNode(id, params, this.bpm),
					gain: og,
					sources: ownSources
				});
			}
		}
		return { out: level, sources, startAt, outs: outsMap, sends };
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
		note: { velocity: number; noteIndex: number; tuning?: number; seed?: number } = { velocity: 1, noteIndex: 48 },
		/* The waveform this node is set to, if it has a picker. A name rather
       than an index, so a drawn table keeps its identity when its neighbours
       are deleted. */
		wave?: string,
		/* The feedback buses this voice is using, shared between the SEND and RTN
       that name the same number.
    
       Held per voice rather than on the synth, because two notes sounding at
       once are two independent loops -- a shared bus would make one note's
       feedback arrive in the other's, which is a different instrument and not
       the one the patch describes. */
		fbBuses?: Map<number, { send: GainNode; rtn: GainNode }>,
		/* Which of this node's inlets have a cable on them, whatever is on the
       other end. `cvIn` cannot answer that: it returns the fallback for a
       signal source, so a port fed by an oscillator looks unwired to it. OSC's
       PHS needs the difference -- it builds a delay line only when something is
       patched, and a signal is exactly the case that wants one. */
		wiredPorts?: ReadonlySet<string>,
		/* Is this port fed by something that *moves*, as opposed to a number?
    
       `cvIn` cannot answer it: the dual nodes -- MAP, NODE.CV -- resolve to a
       finite value even while carrying a waveform, which is exactly what makes
       them dual. The caller holds the resolver that can walk back up the cable
       and say which it is. */
		drivenBySignal: (port: string) => boolean = () => false
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
		/** Where a TSND delivers instead of the voice's sink: its bus, or null for none. */
		sendTo?: AudioNode | null;
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
		/**
		 * A knob carried through a function, live -- decibels to a gain, say.
		 *
		 * The knob (or whatever is patched into it: a cable adds to its offset
		 * the way it adds to any param) is a constant source; a gain and an
		 * offset put its range [lo, hi] onto a WaveShaper's -1..1, and the
		 * shaper's table is `fn` sampled across that range. What comes out is
		 * fn(knob), as a signal, for connecting to whatever param needed it.
		 * Past the range the shaper holds its end values, which is the card's
		 * own limit anyway.
		 */
		const knobFn = (
			key: string,
			def: number,
			lo: number,
			hi: number,
			fn: (v: number) => number
		): AudioNode => {
			const knobSrc = ctx.createConstantSource();
			knobSrc.offset.value = p(key, def);
			sources.push(knobSrc);
			mod.set(key, knobSrc.offset);
			const mid = (lo + hi) / 2;
			const half = (hi - lo) / 2 || 1;
			const toDomain = ctx.createGain();
			toDomain.gain.value = 1 / half;
			const shift = ctx.createConstantSource();
			shift.offset.value = -mid / half;
			sources.push(shift);
			const shaper = ctx.createWaveShaper();
			const N = 2048;
			const curve = new Float32Array(N);
			for (let i = 0; i < N; i++) curve[i] = fn(mid + half * ((i / (N - 1)) * 2 - 1));
			shaper.curve = curve;
			knobSrc.connect(toDomain);
			toDomain.connect(shaper);
			shift.connect(shaper);
			return shaper;
		};
		/* Indexed straight off the catalogue's list, so the button that says SAW
       and the wave that plays cannot disagree -- they did, and three of the
       four labels named the wrong shape. */
		const WAVES: OscillatorType[] = WAVE_SHAPES.map((w) => w.type as OscillatorType);

		/* A pure node builds nothing.
		
		   Its whole output is a number, pulled through the resolver by whoever
		   reads it -- there is no audio node to make, and the arithmetic lives in
		   one table in stores/node-graph shared with the resolver rather than
		   being written a second time here.
		
		   This used to be a hand-written run of case labels falling into ENTRY's
		   body, and the list had gone stale: it still named REMAP and LERP, which
		   MAP absorbed, and had never gained MAP, CMP, LOGIC, NOT or TRSP. The
		   ones it did name fell through and built *ENTRY* -- a CONST came back
		   with ENTRY's silent gain and its four note outlets, because that is the
		   next case body down. Saying it once here cannot drift the way a second
		   copy of the list does. */
		if (isPureNode(type)) return null;

		switch (type) {
			case 'osc': {
				const osc = ctx.createOscillator();
				/* The same resolver racks 1-7 use, so a shape picked on a card and
           the same shape picked on the rack panel are the same sound -- and a
           drawn table works in both without a second code path. It is given a
           name rather than an index because that is what survives its
           neighbours being deleted. */
				const shape = (wave as SynthWaveform) ?? 'sine';
				/* PHS, as a fraction of a turn.

           Read as a value rather than registered as a modulation destination,
           because the offset is rotated into the wave table when the note is
           built -- there is no AudioParam for a cable to land on. An
           oscillator has no phase input in Web Audio, and a delay is not one
           either: a fixed delay is a different phase at every frequency, so it
           would drift as soon as the note changed pitch.

           Only the four named shapes take this path. A drawn or generated table
           is already a table, and rotating it is the same operation -- but the
           basic shapes reach `osc.type` directly, which is cheaper and has no
           phase, so asking for one is what turns them into a table. Zero keeps
           the cheap path, which is what nearly every note wants. */
				/* NaN when nothing is patched or typed, which is how this tells a
           wired PHS from an unwired one -- `cvIn` cannot return NaN from a real
           cable, and `resolver` is not in scope here. */
				const phaseRaw = cvIn(probeKey, 'phase', NaN);
				/* A *signal* on PHS, as opposed to a value. `cvIn` returns the
           fallback for a signal source, so a port an oscillator feeds looks
           unwired to it -- `wiredPorts` says a cable is there and the NaN says
           no number came down it, and together they mean "something is moving
           this". A CONST keeps the wave-table path below, which is exact. */
				const phaseMoving = !!wiredPorts?.has('phase') && !Number.isFinite(phaseRaw);
				const phase = Number.isFinite(phaseRaw) ? phaseRaw : 0;
				const turns = ((phase % 1) + 1) % 1;
				/* The wave table rotates only when nothing is patched to PHS.
        
           With a cable, the delay below carries the whole offset -- rotating
           here as well would apply it twice, and at half a turn each that is a
           full turn, which is no shift at all. Measured when this was wrong: a
           pair that should have cancelled read 0.8306, the same as no shift.
           Exactly one mechanism per cable, the rule the mod loop follows. */
				if (
					!phaseMoving &&
					turns !== 0 &&
					['sine', 'square', 'sawtooth', 'triangle'].includes(shape)
				) {
					osc.setPeriodicWave(this.phasedWave(ctx, `shape:${shape}`, this.shapeTable(shape), turns));
				} else {
					this.applyWaveform(osc, shape, undefined, undefined, ctx);
				}
				/* The note if PITCH is wired, and the knob if it is not.
        
           An oscillator used to read the key it was played from whether or not
           anything was patched into it, so every OSC tracked the keyboard and a
           fixed drone was unsayable -- and, worse, the cable you could see made
           no difference to what you heard. */
				/* The base frequency the modulation deviates from.
        
           Deliberately *not* `p`, which zeroes a knob a signal has claimed.
           That rule is right where the cable is the whole quantity -- a GAIN's
           level under an envelope -- and wrong here, because frequency
           modulation is a deviation and a deviation needs something to deviate
           from. Zeroing it made the most obvious FM patch silent: set the
           carrier's FREQ to 440, cable a modulator in, and the carrier had no
           pitch to be modulated. Measured at depth 0 it rendered exact silence.
        
           So the knob stays the carrier and the signal sums onto it in hertz,
           which is what an AudioParam on `frequency` means. Both mechanisms act
           and that is correct for this port: they are not two opinions about
           one value, they are a centre and an excursion. A CONST still resolves
           through `cvIn` and is skipped by the mod loop, so a patched constant
           sets the pitch exactly once. */
				osc.frequency.value = cvIn(probeKey, 'pitch', 220);
				const g = ctx.createGain();
				osc.connect(g);
				sources.push(osc);
				/* FREQ is registered, which is what makes FM sayable.
        
           This used to be value-only, under a comment saying audio-rate FM
           "would need the param registered here, but then a constant would have
           to be excluded from it -- and the two cannot be told apart at this
           point". They can, and the tool for it was already in the file: `p`
           asks `resolver.isDrivenBySignal`, which is the same question that
           stops a GAIN's knob fighting the cable that claimed it.
        
           So both mechanisms are wired and exactly one acts per cable. A value
           sets `frequency.value` and is skipped by the mod loop; a signal leaves
           the base at 0 and sums onto the param. Measured before this: an
           oscillator patched into FREQ rendered byte-identical to no cable at
           all -- 0.4813 RMS either way -- so the entire FM family was
           undrawable while the socket lit up as though it were working.
        
           A modulator arrives in hertz of deviation, which is what an AudioParam
           on `frequency` means, so the depth is a GAIN on the way in. That is
           the same "the amount is a cable you can see" argument the rest of the
           catalogue makes. */
				mod.set('pitch', osc.frequency);

				/* PHS, live: a delay of one period times the offset.
        
           The static path above rotates the wave table, which cannot move once
           the note is built. This is the moving one, and the comment that said
           it was impossible was half right: "a fixed delay is a different phase
           at every frequency, so it would drift as soon as the note changed
           pitch". A fixed delay, yes. One scaled by the note's own period is
           not -- half a turn is `0.5 / f` seconds, and measured across five
           octaves it cancels against an unshifted copy at every one of them
           (0.00003 at 110 Hz through 0.00555 at 1760).
        
           `delayTime` is a-rate, so a cable on this sums per sample and the
           phase slides continuously: an LFO at half a turn of depth swings a
           summed pair between 1.4142 and 0.834, where the unmodulated control
           sits flat at 1.4142.
        
           Only built when something is patched, because a delay in the signal
           path is not free and nearly every oscillator wants neither the node
           nor the quarter-sample of interpolation it costs. The static case
           keeps the wave table, which is exact. */
				if (phaseMoving) {
					/* One period of the base pitch. Read from the oscillator rather
             than from the cable, so it is the frequency this note actually
             plays -- and clamped, since a delay line has a maximum and 20 Hz
             is a twentieth of a second. */
					const hz = Math.max(20, Math.min(20000, osc.frequency.value || 220));
					const period = 1 / hz;
					const line = ctx.createDelay(Math.max(0.05, period * 2));
					/* The static offset, so a value and a signal both land here and
             the wave table above is left alone when either does. */
					line.delayTime.value = Math.min(period, turns * period);
					const depth = ctx.createGain();
					depth.gain.value = period;
					depth.connect(line.delayTime);
					mod.set('phase', depth);
					g.connect(line);
					return { in: null, out: line, mod };
				}
				return { in: null, out: g, mod };
			}

			case 'noise': {
				/* White, and only white.
        
           COL used to pick a slope here: pink and brown were the same buffer
           through a one-pole low-pass with make-up gain. That is a FILTER and a
           VCA, both of which are modules you can already put after this one, so
           welding them in made three settings the card called colours and the
           patch could not take apart. */
				if (!this.noiseBuffer) this.initNoiseBuffer();
				const nz = ctx.createBufferSource();
				nz.buffer = this.noiseBuffer;
				nz.loop = true;
				const g = ctx.createGain();
				g.gain.value = 1;
				nz.connect(g);
				sources.push(nz);
				return { in: null, out: g, mod };
			}

			case 'gain': {
				/* Sound times a number.

           MUL cannot do this and adding an audio inlet to it would not help:
           MUL is a pure node, so its whole result is one number pulled once per
           note, while multiplying sound has to happen sample by sample inside
           the audio graph. They are two mechanisms, and a card that switched
           between them depending on what you patched would be two modules
           wearing one name.

           The range goes negative, which is what makes this VCA and INV at
           once: -1 is the same signal upside down, and a separate invert module
           would be this one with its knob welded. */
				const g = ctx.createGain();
				knob(g.gain, 'level', 1);
				return { in: g, out: g, mod };
			}

			case 'filter': {
				/* One biquad, all eight of its types.
        
           `BiquadFilterNode` computes every one of them from the same three
           coefficients, so the shelves and the allpass cost exactly what the
           lowpass costs -- and four of the eight used to be unreachable for no
           reason but the length of an array. That is the argument that keeps
           OSC one module for every periodic wave: when the node already does
           it, splitting it into separate cards is a decision to offer less.
        
           GAIN is the shelving filters' amount, and it only means anything for
           three of the eight -- the shelves and the peak. The other five ignore
           it, which is a property of the node rather than something to hide:
           a card cannot usefully grow and shrink its own controls as a picker
           moves, and a knob that does nothing for the type you chose is
           cheaper to explain than five extra modules. */
				const f = ctx.createBiquadFilter();
				f.type = (FILTER_TYPES[Math.round(p('type', 0))]?.id as BiquadFilterType) ?? 'lowpass';
				knob(f.frequency, 'cutoff', 4000);
				knob(f.Q, 'q', 1);
				knob(f.gain, 'filterGain', 0);
				/* No DEPTH. It scaled the CV on its way to the cutoff, which is a
           second gain stage welded onto the inlet -- and scaling a control
           signal by a value is what MUL and GAIN are. The cable lands on the
           cutoff's own AudioParam and sums with the knob, like every other
           modulatable knob in the catalogue. */
				return { in: f, out: f, mod };
			}

			case 'follow': {
				/* Sound becoming a number: the loudness of what arrives, as a value.

           The crossing from the audio family into the control family, and the
           only one -- the same structural role CMP plays for `bool`. Without it
           nothing a patch *hears* can steer anything it does: no ducking, no
           auto-wah, no filter that opens because the note came in loud.

           A rectifier and a lowpass, which is what an envelope follower is.
           Both are ordinary audio nodes, so no worklet is needed and the value
           moves with the sound the way an envelope's does. Connecting audio
           straight to a knob instead would put the waveform itself in: a cable
           to a level would be ring modulation at the signal's own frequency
           rather than a level that follows it.

           RESP is the lowpass corner -- how fast it reacts. Low is a slow
           average; high tracks the waveform closely enough to buzz, and where
           that line sits depends on what is being followed. */
				const finp = ctx.createGain();
				const rect = ctx.createWaveShaper();
				const curve = new Float32Array(257);
				for (let i = 0; i < curve.length; i++) {
					const x = (i / (curve.length - 1)) * 2 - 1;
					curve[i] = Math.abs(x);
				}
				rect.curve = curve;
				const smooth = ctx.createBiquadFilter();
				smooth.type = 'lowpass';
				knob(smooth.frequency, 'resp', 20);
				/* The rectified average of a sine is 2/pi of its peak, so a signal
           reaching 1.0 would follow out at about 0.64 and every range built for
           0..1 downstream would arrive a third short. SENS restores the scale
           and is a knob, so a quiet source can be brought up here rather than
           needing a MUL after every follower. */
				const lift = ctx.createGain();
				knob(lift.gain, 'sens', Math.PI / 2);
				finp.connect(rect);
				rect.connect(smooth);
				smooth.connect(lift);
				return { in: finp, out: lift, mod };
			}

			case 'nodecv': {
				/* The control-side terminal. A GainNode at unity, so whatever the
           inlet carries leaves unchanged.

           It has a build case at all because it is in NOT_PURE: pulled as a
           value it resolves through `PURE_NODES`, but a *signal* routed through
           one has to be passed per sample or a moving envelope would be read
           once and held. Both halves, decided per cable, exactly as MAP does. */
				const g = ctx.createGain();
				/* `a` registered as the node's *input*, which is what MAP does too.

           The mod map is not only for AudioParams. `isMod` classifies a cable
           by the kind of the port it lands on, and `a` is a mod inlet -- so a
           signal into this terminal is a mod cable, and mod cables are
           connected by looking the destination up in this map. Leaving it out
           meant the lookup found nothing and the cable was silently dropped:
           a CONST through a terminal still worked, because that resolves as a
           value, while anything *moving* vanished.

           An earlier comment here argued that registering `a` would make the
           cable scale the terminal rather than pass through it. That is true
           of a GainNode's `gain` param and false of its input, which is what
           is stored here -- the same distinction MAP relies on. */
				mod.set('a', g);
				return { in: g, out: g, mod };
			}

			case 'map': {
				/* The same transfer curve MAP always computed, applied per sample.
        
           It was a pure node: one number pulled once per note, which meant a
           waveform arriving at its inlet was read as the fallback and vanished
           -- measured, a TO-CV into MAP's A came out 0 rather than following
           the wave. A shaping node that cannot shape a signal is the wrong
           half of the module.

           Built in the live-DSP worklet: the ranges are parameters it reads
           per sample, so X.LO..Y.HI can be turned or patched while it runs.
           It used to be a WaveShaperNode between a gain and an offset, all
           three set from the ranges at the note -- a cable into a range was
           read once, and a moving one read as 0.

           The shape stays a table, sampled over 0..1 by the evaluator itself
           with the ranges held at 0..1, so the curve here and the curve a
           pulled MAP computes are one function -- and the card draws through
           the same call, so all three agree. Which shape is a choice made
           per note; GATE and WRAP are read from the raw input rather than
           the clamped one, so they are modes rather than tables. */
				const shape = Math.round(p('shape', 0));
				const unit: Record<string, number> = { inLo: 0, inHi: 1, outLo: 0, outHi: 1 };
				const N = 1024;
				const table = new Float32Array(N);
				for (let i = 0; i < N; i++) {
					const x = i / (N - 1);
					table[i] = PURE_NODES.map(
						{ get: (port, f) => (port === 'a' ? x : f) },
						(key, def) => (key in unit ? unit[key] : p(key, def))
					);
				}
				const map = createLiveDsp(ctx, MAP_PROCESSOR, {
					numberOfInputs: 1,
					numberOfOutputs: 1,
					outputChannelCount: [1],
					channelCount: 1,
					channelCountMode: 'explicit',
					processorOptions: {
						mode: shape === 0 ? 'gate' : shape === 10 ? 'wrap' : 'clamp',
						table
					}
				});
				if (!map) return null;
				knob(map.param('inLo'), 'inLo', 0);
				knob(map.param('inHi'), 'inHi', 1);
				knob(map.param('outLo'), 'outLo', 0);
				knob(map.param('outHi'), 'outHi', 1);
				sources.push(map.source);

				/* `a` is where the signal enters. A value on it -- a CONST, a
           velocity -- is held by a constant source summing into the same
           inlet, the way TO-FREQ's A is: a pure node builds nothing, so
           without it a MAP built because a *range* moves would read its
           input as 0. The mod loop looks `a` up in this map; without the
           entry a cable into MAP was classed as a mod cable, found nothing to
           land on, and was dropped. */
				const inGain = ctx.createGain();
				const restA = ctx.createConstantSource();
				restA.offset.value = p('a', 0);
				sources.push(restA);
				restA.connect(inGain);
				inGain.connect(map.node);
				mod.set('a', inGain);
				return { in: inGain, out: map.node, mod };
			}

			case 'shape': {
				/* A transfer curve: every sample looked up in a table.
        
           The primitive under distortion, saturation and wavefolding -- all
           three are one function applied sample by sample, differing only in
           which function. That is why it is one module with a picker rather
           than three cards, the same argument FILTER's eight types and OSC's
           waveforms rest on.
        
           Not MAP, though the shapes look alike. MAP carries a value from one
           range to another; this bends a waveform, which is what generates
           harmonics -- the thing a distortion is *for*. Different questions,
           so two modules, exactly as MUL and GAIN are two.
        
           The tone filter and the makeup gain the old DRIVE welded on are gone:
           those are FILTER and GAIN, and a patch that wants them can see them.
           What is left is the curve. */
				/* In the live-DSP worklet, which computes the curve per sample from
           DRIVE as it is (see live-dsp.worklet.ts). It was a WaveShaperNode
           whose table was filled from DRIVE when the note was built, so a
           cable into DRIVE was read once -- and every one of the three curves
           depends on DRIVE in a way no gain in front of a fixed table can say. */
				const shape = createLiveDsp(ctx, SHAPE_PROCESSOR, {
					numberOfInputs: 1,
					numberOfOutputs: 1,
					outputChannelCount: [1],
					channelCount: 1,
					channelCountMode: 'explicit',
					processorOptions: { kind: Math.round(p('shapeKind', 0)) }
				});
				if (!shape) return null;
				knob(shape.param('drive'), 'shapeDrive', 25);
				sources.push(shape.source);
				return { in: shape.node, out: shape.node, mod };
			}

			case 'tocv': {
				/* Sound read as a value, with its sign intact.
        
           The other bridge, and not the one FOLLOW is. FOLLOW answers "how
           loud", which has no negative half -- it rectifies, so a 1 Hz sine
           arrives as a 2 Hz run of humps and the waveform is gone. That is the
           right answer for ducking and auto-wah and the wrong one for
           everything that wanted the shape: a tremolo needs the negative half
           to pull the level down, and a rectified LFO pushes it up twice per
           cycle instead.
        
           This one does nothing to the signal at all. It is a gain of 1 whose
           output is registered as a value, because a Web Audio node connected
           to an AudioParam already *is* a control voltage -- `fm.connect(
           osc.frequency)` is the same operation the engine does in a dozen
           places. The wall between the families is ours, put there so a
           waveform cannot land on a knob by accident, and this is the door
           through it rather than a hole in it.
        
           That makes an oscillator a usable LFO, which is why there is no LFO
           module: a low-frequency oscillator is an oscillator at a low
           frequency, and giving it its own card would be the same primitive
           twice. */
				const g = ctx.createGain();
				g.gain.value = 1;
				return { in: g, out: g, mod };
			}

			case 'tosig': {
				/* A number becoming sound: the other direction across the same line.

           A ConstantSourceNode whose offset the value drives. The point is not
           "listening to a CV" -- it is that audio-rate modulation lives on this
           side of the line. An LFO at 30 Hz is a tremolo and the same shape at
           300 Hz is a sideband, and only the audio family carries the second.

           It is also what lets a value reach an inlet that *sums* rather than a
           knob read once, which is the difference between a modulation that
           moves during the note and one fixed when it starts. */
				const dc = ctx.createConstantSource();
				dc.offset.value = 0;
				knob(dc.offset, 'level', 0);
				sources.push(dc);
				const tg = ctx.createGain();
				dc.connect(tg);
				return { in: null, out: tg, mod };
			}

			case 'delay': {
				/* A delay line, which is a primitive rather than an effect: a comb
           flanger is this with the time moving, and a chorus is several at
           once -- both are this module plus a cable.
        
           A resonating comb is not. This comment used to say feedback was "a
           cable the patch draws rather than a knob here -- the graph already
           refuses audio cycles, so a resonating comb is built with the delay
           and a GAIN", which does not follow from its own premise: the refusal
           is exactly what prevents the patch. `addCable` returns 'cycle' for
           any audio cable closing a loop, so the comb cannot be drawn at all.
        
           maxDelayTime is fixed at build and cannot be a cable, so the ceiling
           is generous rather than tight: a DelayNode whose time is set past its
           maximum silently clamps, and a cable driving it would then hit a wall
           nothing on the card explains. */
				const d = ctx.createDelay(4);
				knob(d.delayTime, 'delayTime', 0.25);
				return { in: d, out: d, mod };
			}

			case 'env': {
				/* A shape over the note, as a value.
        
           A constant of 1 through a gain the envelope shapes, so a cable from
           it carries the envelope rather than any sound. That is what makes it
           MODULATE: it emits control, and what it is *for* is being cabled into
           somebody else's knob.
        
           It is a module rather than something an oscillator has because a
           patch usually wants more than one -- the classic subtractive voice is
           two, one on the level and one on the cutoff, at different speeds. An
           envelope welded into every source would be one per source and never
           the shape you wanted on the parameter you wanted it on. */
				/* Built in the live-DSP worklet, so every knob is a live parameter.

           It used to be a constant through a gain whose automation was written
           once, at the note: attack, decay and release baked into a schedule
           the moment it was built. A cable into ATTACK could only be read as
           a number at note-on, and a moving signal there -- an LFO, another
           envelope -- was read as nothing, which made the attack zero. The
           processor steps the same shape per sample and reads each time as it
           goes (see live-dsp.worklet.ts), so turning or patching one moves the
           envelope while it plays.

           The gate is the note: up at `t`, down when it is held until. The
           processor starts the release once the gate is down *and* the decay
           has finished, which is what `t + max(a + d, held)` meant here. The
           floors (a tenth of a millisecond on each time, the exponential
           floor under silence) live in the processor now, beside the ramps
           they exist for. */
				const env = createLiveDsp(ctx, ENV_PROCESSOR, {
					numberOfInputs: 0,
					numberOfOutputs: 1,
					outputChannelCount: [1],
					processorOptions: { curved: Math.round(p('envCurve', 0)) === 1 }
				});
				if (!env) return null;
				knob(env.param('attack'), 'envA', 0.005);
				knob(env.param('decay'), 'envD', 0.2);
				knobPct(env.param('sustain'), 'envS', 60);
				knob(env.param('release'), 'envR', 0.2);
				this.holdGate(env.param('gate'), t, heldSec);
				sources.push(env.source);
				return { in: null, out: env.node, mod };
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
				/* HARD sharpens the contact by resonating the tone filter: Q runs
           0.7..3.7 across the knob. Linear, so a scaling gain carries a cable
           in the knob's own units onto Q, over the 0.7 floor. */
				knobAt(tone.Q, 'hardness', 50, 0.03);
				tone.Q.value += 0.7;
				/* The burst is ENV's processor struck once: a 0.4 ms straight rise,
           then an exponential fall that reaches the floor after LEN. It was an
           automation curve written at the note, so LEN was read once; as a
           decay parameter it is live. The gate drops straight away, so once
           the fall is done the release finishes it to silence. Every fallback
           is the number the card prints -- an untouched LEN is absent from
           the patch, and the default is what plays. */
				const burst = createLiveDsp(ctx, ENV_PROCESSOR, {
					numberOfInputs: 0,
					numberOfOutputs: 1,
					outputChannelCount: [1],
					processorOptions: { curved: true, linearAttack: true }
				});
				if (!burst) return null;
				burst.param('attack').value = 0.0004;
				knobAt(burst.param('decay'), 'exLength', 8, 0.001, (v) => Math.max(0.001, v));
				burst.param('sustain').value = 0;
				burst.param('release').value = 0.002;
				this.strikeGate(burst.param('gate'), t);
				sources.push(burst.source);
				const g = ctx.createGain();
				g.gain.value = 0;
				burst.node.connect(g.gain);
				nz.connect(tone);
				tone.connect(g);
				sources.push(nz);
				return { in: null, out: g, mod };
			}

			case 'pwm': {
				/* A square whose width is settable and modulatable. Web Audio has no
           pulse oscillator, so it is built the standard way: a sawtooth minus
           a phase-shifted copy of itself is a rectangle whose duty cycle is the
           shift. PWM is what makes a single oscillator sound like two. */
				/* The width, 0..1, read off the inlet rather than a knob.
        
           `unit` is the socket's declared range, so a CONST of 0.25 is a
           quarter-open pulse and ENTRY's VEL is a pulse that opens with how
           hard the key was struck. Clamped short of both ends because 0 and 1
           are each a constant rather than a wave -- silence with two
           oscillators still running -- and a patch reaching past them means
           something the width cannot express. */
				const width = Math.min(0.95, Math.max(0.05, cvIn(probeKey, 'pw', 0.5)));
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
				/* A signal into PW sweeps the width, in the same units the value has.
        
           The delay is `period * width`, so one unit of CV is one period --
           which makes an LFO of depth 0.3 a sweep of thirty percent of the
           cycle, the number it reads on its own card. It used to be
           `period * 0.4` against a port of its own, a depth nobody could
           predict from what they typed.
        
           A resolved value has already been applied above, so this connection
           is only ever reached by a signal: the mod loop skips a cable from a
           pure node onto a port the module reads as a value. */
				const pw = ctx.createGain();
				pw.gain.value = period;
				pw.connect(dl.delayTime);
				/* FREQ, registered onto both saws so the pulse can be played.
        
           It was read as a value and nothing else, so a cable into it did
           nothing at all: measured, a CONST of 110 and one of 880 both rendered
           0.1726 -- the same reading as no cable. A pulse oscillator that
           cannot be tuned by patch is one an instrument cannot use, and PWM is
           the only square-wave source in the catalogue.
        
           Both saws take the signal, because the pulse is their difference and
           they have to stay in step. What does *not* follow is the duty delay:
           `period` is computed at build time from the base pitch, so a
           modulated FREQ sweeps the pitch while the width in seconds stays put
           -- which means the duty cycle drifts as it moves. That is a real
           limit and it is the one Web Audio leaves: `delayTime` would have to
           be `1/f * width` continuously, and there is no reciprocal node. Named
           here rather than hidden, since a patch sweeping FREQ hard will hear
           the width move with it. */
				const fm = ctx.createGain();
				fm.gain.value = 1;
				fm.connect(a.frequency);
				fm.connect(b.frequency);
				mod.set('pitch', fm);
				mod.set('pw', pw);
				return { in: null, out: sum, mod };
			}

			case 'wire': {
				/* A struck string: IN is added into a delay line one period long that
           feeds back through the string's losses (see live-dsp.worklet.ts).
           PITCH follows the cable when one is patched and the note when not;
           a moving signal lands on the parameter and adds to the 0 `p` gives
           it, the same way STRING's does. */
				const wire = createLiveDsp(ctx, WIRE_PROCESSOR, {
					numberOfInputs: 1,
					numberOfOutputs: 1,
					outputChannelCount: [1],
					channelCount: 1,
					channelCountMode: 'explicit'
				});
				if (!wire) return null;
				const pitchIn = p('pitch', NaN);
				wire.param('pitch').value = Number.isNaN(pitchIn) ? baseFreq : pitchIn;
				mod.set('pitch', wire.param('pitch'));
				knob(wire.param('decay'), 'wireDecay', 4);
				knob(wire.param('damping'), 'wireDamp', 30);
				knob(wire.param('stiffness'), 'wireStiff', 10);
				knob(wire.param('position'), 'wirePos', 12);
				sources.push(wire.source);
				return { in: wire.node, out: wire.node, mod };
			}

			case 'ir': {
				/* A body, convolved. The impulse is fixed data, decoded once per
				   context and shared by every note: a ConvolverNode only reads its
				   buffer, and a hundred notes each decoding 4096 samples would be
				   the whole cost of the module. */
				const input = ctx.createGain();
				/* A mix nothing patches, at an end: at 0 there is no body to run
				   -- a four-thousand-tap convolution per note, heard as nothing,
				   which on a twelve-voice piano was a real share of the audio
				   thread -- and at 100 no dry to keep. */
				const mixed = !!wiredPorts?.has('irMix');
				const mix = p('irMix', 100);
				if (!mixed && mix <= 0) return { in: input, out: input, mod };
				const conv = ctx.createConvolver();
				conv.normalize = false;
				conv.buffer = this.bodyIr(ctx, Math.round(p('irBody', 0)));
				if (!mixed && mix >= 100) {
					input.connect(conv);
					return { in: input, out: conv, mod };
				}
				const out = ctx.createGain();
				const wet = ctx.createGain();
				const dry = ctx.createGain();
				knobMix(wet, dry, 'irMix', 100);
				input.connect(dry);
				dry.connect(out);
				input.connect(conv);
				conv.connect(wet);
				wet.connect(out);
				return { in: input, out, mod };
			}

			case 'space': {
				/* A room. Every acoustic instrument is heard in one, and a bare
           resonator sounds like a recording made inside a box of cotton wool.
           Synthesised rather than a recorded impulse: the size is a knob, and
           a patch has to stay self-contained. */
				const input = ctx.createGain();
				const out = ctx.createGain();
				/* A feedback delay network in the live-DSP worklet (see
           live-dsp.worklet.ts), with SIZE and DECAY as parameters it reads
           every render block.

           It used to convolve with an impulse of noise generated here, when
           the note was built -- SIZE its length, DECAY the exponent of its
           envelope -- so both were read once and a cable into either did
           nothing it could be heard doing. DECAY still means what it did: a
           bigger number rings longer, and the tail ends where the old
           impulse's did. MIX stays a native crossfade in front of it. */
				/* Stopped four seconds after the voice -- SIZE's longest room --
           so the tail rings out as the convolver's did, which had no `stop`
           to obey. */
				const room = createLiveDsp(
					ctx,
					SPACE_PROCESSOR,
					{
						numberOfInputs: 1,
						numberOfOutputs: 1,
						outputChannelCount: [2],
						channelCount: 2,
						channelCountMode: 'explicit'
					},
					4
				);
				if (!room) return null;
				knob(room.param('size'), 'spaceSize', 40);
				knob(room.param('decay'), 'spaceDecay', 50);
				sources.push(room.source);
				const wet = ctx.createGain();
				const dry = ctx.createGain();
				knobMix(wet, dry, 'spaceMix', 30);
				input.connect(dry);
				dry.connect(out);
				input.connect(room.node);
				room.node.connect(wet);
				wet.connect(out);
				return { in: input, out, mod };
			}

			case 'pan': {
				/* Placing the instrument. Rack 7 has it on the output; as a module it
           can differ per branch, so a patch can put the body somewhere the
           string is not. */
				const pn = ctx.createStereoPanner();
				/* POS is the only inlet, and it is typed -1..1 now -- the same unit
           `pan` itself holds -- so a plain `knob()` reads it and registers
           the AudioParam directly, no scaling node in front. It used to read
           -100..100 and convert through `knobAt`; that bought nothing a
           typed field spanning the param's own range does not already say
           for free, the same move DELAY's TIME made dropping its own
           millisecond/second split.

           There was a second registration here once, under the key `cv`,
           left from when DPTH was a gain stage on the control leg. PAN has
           no port called `cv` -- so nothing could address it, and anything
           that did would have arrived at gain 1 against a param that wanted
           hundredths, a hundred times hard over. Two registrations for one
           destination is one more than can be right. */
				knob(pn.pan, 'panPos', 0);
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
				/* MAKE is decibels and the gain is linear, and the conversion between
           them is exponential -- which no scaling node in front of the param
           can do, so it used to be read once and marked unpatchable. `knobFn`
           carries the knob (or the cable) through the conversion as a signal,
           so a patched "6" means six decibels, live. */
				const makeup = ctx.createGain();
				makeup.gain.value = 0;
				knobFn('compGain', 0, -12, 24, (db) => Math.pow(10, db / 20)).connect(makeup.gain);
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

				/* Two outlets, not three. There was an AMP here -- an envelope
           follower welded on, so a filter could track how loud the signal was
           -- and it is FOLLOW now. Keeping it would be the follower in two
           places, and this module is about the mid/side decomposition rather
           than about measuring anything.

           Named outlets, so each socket carries what its label says. `mid` and
           `side` used to ride on `out`/`out2`, which meant the port literally
           named `side` resolved to the mid gain. */
				const outs = new Map<string, AudioNode>([
					['out', mid],
					['side', side]
				]);

				return { in: input, out: mid, out2: side, outs, mod };
			}

			case 'make': {
				/* Mid and side back into two channels: L is mid plus side, R is mid
           minus it. WIDE scales the side, which is what stereo width is. */
				const midIn = ctx.createGain();
				const sideIn = ctx.createGain();
				const wide = ctx.createGain();
				/* WIDE is read *and* registered, which is the ordinary pair now rather
           than the double application it once was.

           `cvIn` resolves a pure node to its number and hands back the fallback
           for anything that carries a signal -- so a CONST of 2 arrives as 2
           here and connects nothing, while an ENV arrives as the unity fallback
           and connects as a source that sums on top. Exactly one mechanism per
           cable, decided by what is at the other end.

           Registering alone was right only while a CONST also built a
           ConstantSourceNode to connect. Pure nodes build nothing now -- their
           value is pulled through the resolver -- so a registered-only inlet
           would leave the socket dead: no connection, and no value either. */
				wide.gain.value = cvIn(probeKey, 'wide', 1);
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
				const makers = new Map<string, () => AudioNode>();
				const outs = new (class extends Map<string, AudioNode> {
					get(k: string) {
						const make = makers.get(k);
						if (make && !super.has(k)) super.set(k, make());
						return super.get(k);
					}
					has(k: string) {
						return super.has(k) || makers.has(k);
					}
				})();
				const lazy = (k: string, make: () => AudioNode) => makers.set(k, make);
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
           from VEL, NOTE or PITCH silently carried the zero out of `silent`
           instead.

           PITCH is in semitones from the tuning reference, matching what the
           resolver publishes for the same socket. It used to be `baseFreq`
           here and semitones there: one outlet, two different quantities,
           depending on whether it reached a knob or an audio param. */
				/* Made when a signal cable asks for one, not before: a pin read as a
				   value resolves through the pure nodes and never becomes a node,
				   and four constant sources a note that nothing listened to were
				   four more nodes a voice on the audio thread. */
				lazy('pitch', () => pin(12 * Math.log2(Math.max(1e-6, baseFreq) / this.masterTuningFreq)));
				lazy('vel', () => pin(note.velocity));
				lazy('note', () => pin(note.noteIndex));

				/* HELD: how long the key has been down, live -- the one outlet here
           that is not a snapshot. A `ConstantSourceNode` ramped from 0 at a
           constant rate of one second per second is not a trick: it is
           exactly what elapsed time is, expressed as an AudioParam schedule
           instead of read back from the clock, so it moves at sample
           accuracy without anything polling it every frame.

           Ramped from `t`, this build's own start -- the strike for DOWN,
           the real release instant for REL or ON-CHOKE -- not from 0 at the
           context's start, which would answer "how far into the render are
           we" rather than "how long has this activation been running".

           There used to be a GATE outlet beside this one: a number decided
           once, at build time, for how long the note would/did last. It was
           removed rather than kept alongside HELD, because every use it had
           -- "how long will this note run" -- is a question HELD answers
           better by being true continuously rather than guessed once, and
           keeping both meant a patch had to know which one was live before
           wiring either.

           The ceiling here is arbitrary and generous rather than exact:
           nothing playable holds a key for ten minutes, and reading how long
           the render or the voice's own life is expected to run instead
           would be GATE's mistake again, wearing a ramp -- a number decided
           in advance rather than one that is true because it is still being
           measured. */
				const HELD_CEILING_SEC = 600;
				lazy('held', () => {
					const held = ctx.createConstantSource();
					held.offset.setValueAtTime(0, t);
					held.offset.linearRampToValueAtTime(HELD_CEILING_SEC, t + HELD_CEILING_SEC);
					sources.push(held);
					return held;
				});

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

			case 'rand': {
				/* Built only when a moving signal reaches MIN or MAX -- a number
				   there is pulled, and the draw is one number per note. The same
				   draw as the pulled one, so the two paths cannot disagree. */
				const r = noteRandom(note.seed ?? 0.5, probeKey);
				const lo = ctx.createConstantSource();
				const hi = ctx.createConstantSource();
				lo.offset.value = p('lo', 0);
				hi.offset.value = p('hi', 1);
				const out = ctx.createGain();
				const wLo = ctx.createGain();
				const wHi = ctx.createGain();
				wLo.gain.value = 1 - r;
				wHi.gain.value = r;
				lo.connect(wLo).connect(out);
				hi.connect(wHi).connect(out);
				sources.push(lo, hi);
				mod.set('lo', lo.offset);
				mod.set('hi', hi.offset);
				return { in: null, out, mod };
			}

			case 'sh':
			case 'slew': {
				const dsp = createLiveDsp(ctx, type === 'sh' ? SH_PROCESSOR : SLEW_PROCESSOR, {
					numberOfInputs: 0,
					numberOfOutputs: 1,
					outputChannelCount: [1]
				});
				if (!dsp) return null;
				// IN is a socket with no knob: a number arriving is its value, a signal adds to it.
				dsp.param('in').value = p('a', 0);
				mod.set('a', dsp.param('in'));
				if (type === 'sh') {
					dsp.param('trig').value = p('trig', 0);
					mod.set('trig', dsp.param('trig'));
				} else {
					knob(dsp.param('rise'), 'rise', 0.05);
					knob(dsp.param('fall'), 'fall', 0.05);
				}
				sources.push(dsp.source);
				return { in: null, out: dsp.node, mod };
			}

			case 'tsend': {
				const g = ctx.createGain();
				const bus = Math.round(p('bus', 0));
				return { in: g, out: g, mod, isOutput: true, sendTo: this.trackBusSends?.get(bus) ?? null };
			}

			case 'trtn': {
				/* Built only in the track's own chain; `ensureTrackChain` collects
				   the bus it opens so every note's TSND can find it. */
				const g = ctx.createGain();
				const bus = Math.round(p('bus', 0));
				const opened = this.trackBusReturns;
				if (opened && !opened.has(bus)) opened.set(bus, g);
				return { in: null, out: opened?.get(bus) ?? g, mod };
			}

			case 'ctrl': {
				/* One constant source per outlet, set to where the controller is now
				   and moved by `setController` while it sounds. Sources rather than
				   gains fed from one shared node: a shared source would hold every
				   voice's graph alive after the voice ended, and a source of the
				   voice's own is stopped with the rest of it. */
				const cc = Math.max(0, Math.min(127, Math.round(p('cc', 11))));
				const live = !this.renderCtx;
				const outs = new Map<string, AudioNode>();
				for (const port of ['ped', 'bend', 'mod', 'pres', 'cc']) {
					const src = ctx.createConstantSource();
					src.offset.value = live ? this.controllerValue(port, cc) : 0;
					sources.push(src);
					if (live) {
						const entry = { port, cc, node: src };
						this.ctrlSources.add(entry);
						src.addEventListener('ended', () => this.ctrlSources.delete(entry));
					}
					outs.set(port, src);
				}
				return { in: null, out: outs.get('ped')!, mod, outs };
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
				/* The control inlet, registered so the mod loop can find it.
        
           This is the lesson MAP taught, applied before it could be repeated:
           a `mod` inlet that is not in this map is silently dropped -- the
           cable draws, the socket lights, and nothing arrives. MAP declared
           one, registered nothing, and spent its life shaping a constant while
           every one of its own settings still visibly worked.
        
           The same analyser, deliberately. A probe with two inlets is still one
           instrument looking at one thing; wiring both is a patch saying
           "compare these", and summing is what the canvas already does
           everywhere else a second cable lands. */
				if (type !== 'fft') {
					mod.set('cv', g);
					/* A pure value made into something an analyser can look at.
          
             A CONST, an ADD, a CMP -- anything pure -- builds no node at all:
             the resolver pulls it as a number and the module sets it as a
             param's `.value`, so there is nothing for the mod loop to connect
             and a cable from one lands on nobody. Every other module is fine
             with that, because a number in a param is exactly what they
             wanted. A probe is the exception: it has no param, it *is* the
             reading, so a value that never becomes a signal is a probe
             showing zero while the cable sits there looking connected.
          
             Measured before this existed: CONST 0.5, 3 and 5000 into SCOPE's
             CV all read back 0.
          
             The fallback is NaN rather than 0, which is what tells an unwired
             socket from one carrying a genuine zero. A CV of 0 is a reading and
             has to draw as one; defaulting to a visible zero instead would
             invent a trace on a probe nothing is patched to. NaN is the only
             value `cvIn` cannot be handed back from a real cable.
          
             A signal-carrying cable needs none of this -- it is already an
             audio node and the mod loop connects it -- and cannot reach here,
             because the resolver returns the fallback for those. */
					/* Only when nothing is *moving* into the socket.

					   The comment below says a signal-carrying cable cannot reach
					   here because the resolver hands back the fallback for those.
					   That is true of a plain audio node and false of the dual kind:
					   `read` walks a MAP or a NODE.CV and returns the number it would
					   resolve to, so a live signal through one arrived as a finite
					   value *as well as* being connected by the mod loop -- and this
					   added a DC offset of that number on top of the wave.

					   Measured: a GATE mapping -1..1 onto -1..1, which is a square
					   between the rails, reached a SCOPE oscillating between 0 and 2.
					   The trace was the right shape and sat an entire unit too high,
					   which reads as a signal that never goes negative. */
					const probe = drivenBySignal('cv') ? NaN : cvIn(probeKey, 'cv', NaN);
					if (Number.isFinite(probe)) {
						const dc = ctx.createConstantSource();
						dc.offset.value = probe;
						dc.connect(g);
						sources.push(dc);
					}
				}
				/* Offline renders have no frames to draw on, and the map is read by the
           canvas while a live voice is sounding. Keyed by node so several
           probes in one patch stay apart. */
				if (!this.renderCtx) {
					this.graphProbes.set(probeKey, an);
					/* A probe inside a macro is `instance/inner` here, and the canvas
					   opened into that macro draws it as `inner`. The last note built
					   wins, the same rule two tracks sharing an id already live by. */
					const slash = probeKey.lastIndexOf('/');
					if (slash >= 0) this.graphProbes.set(probeKey.slice(slash + 1), an);
				}
				// No `out`: the sink only gathers nodes marked isOutput, and a meter is
				// not one, so a dangling gain here is heard by nobody.
				return { in: g, out: g, mod };
			}

			case 'fbsend':
			case 'fbrtn': {
				/* The two ends of a feedback loop, matched by BUS rather than cabled.
        
           A cable between them would be exactly the cycle `addCable` refuses,
           so the connection is made here: both ends look up the same entry in
           this voice's bus map and share the pair of gains it holds.

           The delay line is where the round trip happens, and what it is for is
           narrower than it first looks. This comment used to say Web Audio
           "permits a cycle through a DelayNode ... and refuses one without",
           which is not so -- measured, `a.connect(b); b.connect(a)` with no
           delay anywhere connects without throwing. What the platform actually
           does is insert one render quantum of latency into any cycle by
           itself, so the loop is already bounded before this node exists.

           Which means the explicit delay *adds* to that rather than supplying
           it. Measured with a single-sample impulse round a gain-0.5 loop: at
           `delayTime = 0` the repeats land at samples 128, 256, 384 -- the
           platform's own block -- and at `delayTime = 128/sampleRate` they land
           at 256, 512, 768, one block for the platform and one for us. So the
           round trip is two quanta, 5.8 ms at this bench's 44.1 kHz, not the
           2.7 ms the old comment claimed.

           It is kept because the extra block costs nothing audible and the node
           is what makes the intent legible -- a loop whose only delay is an
           implementation detail of the host is a loop that breaks when the host
           changes. But it is not load-bearing for correctness, and a test that
           removes it entirely still passes, which is recorded in
           `tests/audio/ports.test.ts` rather than papered over.

           This pair is what a loop falls back to. A loop whose modules the loop
           processor knows never reaches here: it is compiled whole and closes
           in one sample (`buildLoopIsland`, docs/node-graph.md).

           Created by whichever end is built first, since the topological order
           is over audio cables and these two are not connected by one. */
				const busNo = Math.round(p('bus', 0));
				let bus = fbBuses?.get(busNo);
				if (!bus) {
					const send = ctx.createGain();
					const rtn = ctx.createGain();
					const line = ctx.createDelay(1);
					line.delayTime.value = 128 / ctx.sampleRate;
					/* Saturated rather than clipped, and this is the reason the loop
             was banned rather than built: a gain of 0.95 round the loop was
             measured to scream. A tanh curve means a runaway settles into
             distortion at full scale instead of arriving at the speakers as an
             unbounded spike -- the feedback is still wrong, but it is a sound
             someone chose rather than a hazard.
        
             Plain `tanh(x)`, and the shape of the curve is load-bearing in a
             way that is easy to get wrong. This was first written as
             `tanh(x * 1.6) / tanh(1.6)`, to reach exactly +/-1 at full scale --
             which it does, and which leaves the slope *at the origin* at
             1.6/tanh(1.6) = 1.736. A comb tail is a small signal, so every trip
             round the loop multiplied it by 1.736 and the whole thing went
             unstable at a feedback of 1/1.736 = 0.576: past that the tail did
             not ring down, it rose and latched at a fixed level and held it for
             the rest of the render, seconds after an 8 ms strike was over. That
             is the screaming the cycle ban existed to prevent, merely
             amplitude-limited, and it made two thirds of the knob unusable.
        
             `tanh(x)` has unity slope at the origin, so the feedback amount
             means what it says -- below 1 it decays, above 1 it saturates --
             and still reaches within a whisker of full scale, so no headroom is
             lost. Verified by iterating the loop: every gain under 1.0 settles
             to exactly 0, and 1.5 and 4.0 settle at 0.537 and 0.625. */
					const guard = ctx.createWaveShaper();
					const curve = new Float32Array(1024);
					for (let i = 0; i < curve.length; i++) {
						const x = (i / (curve.length - 1)) * 2 - 1;
						curve[i] = Math.tanh(x);
					}
					guard.curve = curve;
					guard.oversample = '2x';
					send.connect(guard);
					guard.connect(line);
					line.connect(rtn);
					bus = { send, rtn };
					fbBuses?.set(busNo, bus);
				}
				return type === 'fbsend'
					? { in: bus.send, out: bus.send, mod }
					: { in: null, out: bus.rtn, mod };
			}

			case 'nodept': {
				/* A wire with a name on it. Unity gain in, unity gain out: Web Audio
           has no "identity node", and a GainNode left at 1 is exactly that --
           the same thing SUM is, which is why this is three lines.

           It is deliberately not free. A node in the path is a node in the
           topological order, so a TERM can be routed around and can sit on a
           group's edge as the one socket a bundle of cables lands on. What it
           must never do is colour the sound, so there is no knob here to turn
           it into a gain stage by accident. */
				const g = ctx.createGain();
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

			/* The value nodes, built for real.

         Every one of these used to be pure -- pulled once, as a plain number,
         never an AudioNode -- until HELD reaching MUL's B leg exposed the
         gap that shape has: a pure node has no AudioParam for a live signal
         to land on, so the cable was drawn, the socket lit, and what MUL
         actually multiplied by was its own unwired identity regardless.
         See docs/node-graph.md, "Every value a pure node reads is a signed
         float, whatever role drew the cable".

         `p(key, def)` already carries exactly the right behaviour for every
         leg built here, unchanged from what every knob in this file already
         does: it reads the cable or the stored setting when neither is a
         moving signal, and it reads zero when one is -- not because zero is
         these nodes' own identity, but because the AudioParam a live signal
         lands on sums with whatever is already there, and zero is the base
         that leaves the connected signal uncorrupted. That is the one fact
         a VCA's LVL and MUL's B share despite meaning different things:
         both are "the resting number, unless a cable is about to add its own
         on top of it". Nothing new is invented here; ten more nodes are
         simply let through the door every knob in the catalogue already
         walks through. */

			case 'const': {
				/* No inputs, so no live/value split to make -- but a real node all
           the same, so a CONST fed into a chain of other live math is a
           genuine, connectable signal rather than a value that stops the
           chain from building further. `PURE_NODES.const` is called
           directly rather than re-typing the pitch-kind conversion, which
           is the same reason MAP fills its own table by calling its entry
           in the same object: one function, so the number pulled once and
           the number built here cannot drift apart. */
				const c = ctx.createConstantSource();
				c.offset.value = PURE_NODES.const({ get: (_p, f) => f }, p);
				sources.push(c);
				return { in: null, out: c, mod };
			}

			case 'add': {
				/* A plus B, built as two gains sharing a destination -- which is
           what Web Audio already does with anything connected to the same
           node, so the sum itself costs nothing beyond naming the two legs.
           Each leg's resting value is `p(key, 0)`, ADD's own identity for an
           operand nothing is wired to; a live cable replaces that resting
           zero with itself by summing on top of it, the AudioParam-signal
           mechanism every knob in this file already relies on. */
				const out = ctx.createGain();
				const a = ctx.createGain();
				a.gain.value = 1;
				a.connect(out);
				const b = ctx.createGain();
				b.gain.value = 1;
				b.connect(out);
				const restA = ctx.createConstantSource();
				restA.offset.value = p('a', 0);
				sources.push(restA);
				restA.connect(a);
				const restB = ctx.createConstantSource();
				restB.offset.value = p('b', 0);
				sources.push(restB);
				restB.connect(b);
				mod.set('a', a);
				mod.set('b', b);
				return { in: null, out, mod };
			}

			case 'sub': {
				/* A minus B, the same shape ADD is with B's leg inverted -- the
           identical trick DIFF already uses for the audio-domain version,
           a gain of -1 rather than a second subtraction mechanism. Both
           legs default to 0, SUB's own identity, through the same `p(key,
           0)` that zeroes a leg the instant something live claims it. */
				const out = ctx.createGain();
				const a = ctx.createGain();
				a.gain.value = 1;
				a.connect(out);
				const b = ctx.createGain();
				b.gain.value = -1;
				b.connect(out);
				const restA = ctx.createConstantSource();
				restA.offset.value = p('a', 0);
				sources.push(restA);
				restA.connect(a);
				const restB = ctx.createConstantSource();
				restB.offset.value = p('b', 0);
				sources.push(restB);
				restB.connect(b);
				mod.set('a', a);
				mod.set('b', b);
				return { in: null, out, mod };
			}

			case 'div': {
				/* A over B, the same carrier/gain shape MUL already builds --
           A is the audio-rate carrier, and what the gain multiplies by is
           B's *reciprocal*, not B itself. Web Audio has no reciprocal
           AudioParam (`docs/node-graph.md` names the same gap PWM's duty
           cycle runs into), but a WaveShaperNode maps a live *signal*
           through any fixed curve, `1/x` included -- so B is shaped into
           its own reciprocal first, and that shaped signal drives the
           gain the same way MUL's B drives its own.

           B at exactly 0 has no answer a signed float can give that is not
           a lie, matching `PURE_NODES.div`: the curve holds `1/x` right up
           to a narrow dead zone around 0 and reads the identity (1, DIV's
           own B-unwired default) there instead of jumping to +-Infinity,
           which a GainNode would happily multiply into a very loud click. */
				/* `DOMAIN` bounds the *magnitude* the reciprocal curve resolves,
           not the values this graph's numbers actually take -- CLAMP and
           TO-FREQ can both afford a domain of 1e6/120 because a bound or a
           semitone offset outside that range is not a patch anyone is
           writing. A divisor is different: the two operands in every test
           this module was built against are single- and double-digit
           numbers, the same scale ADD, MUL and SUB's own operands are, and
           1/x changes fastest exactly there -- close to 0 is where a
           reciprocal's precision matters, and far from it is where it
           matters least. `DOMAIN = 1e4` (CLAMP's own bound) put a B of 2
           or 4 both a few thousandths of the way into the curve, inside a
           dead zone sized to be reachable at all: two different divisors
           landed on the identical identity value and DIV stopped dividing
           by anything a real patch would type in. 100 keeps the same
           table resolution spent on the range that is actually used. */
				const DOMAIN = 100;
				const N = 4096;
				/* A dead zone narrower than one table sample is never actually
           reached at runtime -- `x` at the two samples nearest 0 already
           sits several units out once `DOMAIN` spreads -1..1 across a
           range this wide, so `1/x` right up to an infinitesimal band
           would in practice just be `1/x` everywhere, unbounded, exactly
           the failure this exists to avoid. Sized in samples instead of
           in `x` units so it always covers at least a few real table
           entries regardless of how wide `DOMAIN` is. */
				const DEAD_ZONE_SAMPLES = 4;
				const DEAD_ZONE = (DEAD_ZONE_SAMPLES / (N - 1)) * DOMAIN;
				/* The honest limit a fixed-size table leaves, the same trade
           CLAMP and TO-FREQ each name for their own domain: 1/x is
           steepest close to 0, and `DEAD_ZONE` -- reachable at all only by
           spending several samples on it -- eats a real fraction of the B
           values just past it. A B under roughly half a unit measures a
           few percent off its exact reciprocal; from 1 upward the error
           is under a percent. Not the failure DIV's own B-at-0 identity
           guards against, which would be silence or a click -- a patch
           dividing by a fraction well under 1 hears a slightly detuned
           answer, not a wrong one. */
				const reciprocalCurve = new Float32Array(N);
				for (let i = 0; i < N; i++) {
					const x = ((i / (N - 1)) * 2 - 1) * DOMAIN;
					reciprocalCurve[i] = Math.abs(x) < DEAD_ZONE ? 1 : 1 / x;
				}
				/* The curve computes `1/x` directly from the real (unscaled) B
           value at each table entry, the same as `PURE_NODES.div` would
           -- `bScale` only maps that real value onto the table's -1..1
           index space, it does not change what the table holds. Unscaling
           the *output* by `DOMAIN` afterwards, the way TO-FREQ never does
           to its own Hz result, would multiply an already-correct 1/x by
           100 on top: measured, DIV(1, 2) built to 50 rather than 0.5. */
				const bIn = ctx.createGain();
				bIn.gain.value = 1;
				const restB = ctx.createConstantSource();
				restB.offset.value = p('b', 1);
				sources.push(restB);
				restB.connect(bIn);
				const bScale = ctx.createGain();
				bScale.gain.value = 1 / DOMAIN;
				bIn.connect(bScale);
				const bShaper = ctx.createWaveShaper();
				bShaper.curve = reciprocalCurve;
				bScale.connect(bShaper);

				const g = ctx.createGain();
				g.gain.value = 0;
				bShaper.connect(g.gain);
				const aIn = ctx.createGain();
				aIn.gain.value = 1;
				aIn.connect(g);
				const restA = ctx.createConstantSource();
				restA.offset.value = p('a', 0);
				sources.push(restA);
				restA.connect(aIn);
				mod.set('a', aIn);
				mod.set('b', bIn);
				return { in: null, out: g, mod };
			}

			case 'mod': {
				/* A remainder B, `A - B * trunc(A/B)` -- the same identity
           JavaScript's own `%` uses (round *toward zero*, not down: -7 % 3
           is -1, not the 2 a floor-based Euclidean remainder would give),
           built rather than shaped directly because a remainder depends
           on *two* live signals and a WaveShaperNode only ever bends one.
           DIV's own reciprocal trick gives `A/B`; TRUNC is one more fixed
           curve, a staircase toward zero rather than a reciprocal; MUL and
           SUB are the two-gain shapes every other operator here already
           is. Matching `PURE_NODES.mod` exactly is the point -- the two
           are the same function pulled once or built live, and a live
           build answering a different sign than its own pulled value
           would be a second, disagreeing implementation of MOD, not one.

           B at exactly 0 reads as MOD's own identity (A itself) the same
           way DIV's B does: `bLiveGate` gates B's own live value to 0
           wherever the dead zone is active, so `A - 0 * trunc(...)`
           collapses to exactly A rather than to `A - B` (which DIV's
           dead-zone-holds-1 would otherwise leave this built from). */
				// See DIV's own comment on both of these: 100 keeps the table's
				// resolution spent on the range B actually takes, and the dead
				// zone is sized in samples so it is reachable at all.
				const DOMAIN = 100;
				const N = 4096;
				const DEAD_ZONE_SAMPLES = 4;
				const DEAD_ZONE = (DEAD_ZONE_SAMPLES / (N - 1)) * DOMAIN;
				const reciprocalCurve = new Float32Array(N);
				const deadZoneCurve = new Float32Array(N);
				for (let i = 0; i < N; i++) {
					const x = ((i / (N - 1)) * 2 - 1) * DOMAIN;
					const inDeadZone = Math.abs(x) < DEAD_ZONE;
					reciprocalCurve[i] = inDeadZone ? 0 : 1 / x;
					deadZoneCurve[i] = inDeadZone ? 0 : 1;
				}
				/* The quotient A/B, before it is truncated -- not a bound on A or
           B themselves, both already scaled to `DOMAIN`. A truncation's
           own usefulness is its step landing within a fraction of 1, and
           a 4096-sample table spread across 1e3 either way puts roughly
           0.5 between two adjacent samples, coarser than the very
           remainder MOD exists to resolve. 20 (a divisor of 1 rarely
           needing a quotient past single digits for the same operand
           scale DIV's own `DOMAIN` targets) keeps a table entry roughly
           every 0.01 -- fine enough that `Math.trunc` still reads as a
           truncation and not a coin flip between two neighbouring
           integers. */
				const TRUNC_DOMAIN = 20;
				/* A whole B divides A -- 6 mod 3, say -- and the quotient this
           truncation actually receives is not exactly 2: it already
           travelled through the reciprocal table above, and a `1/3`
           sampled from a 4096-point curve lands a few thousandths short
           of the real one. `Math.trunc` on 1.9976 answers 1, not 2, and
           the remainder that builds from a truncation short by one is
           short by a whole extra B -- measured, 6 mod 3 built to 3 rather
           than 0. Snapping a quotient within a small tolerance of the
           nearest integer to that integer, before truncating, is what an
           exact division needs and a genuine fraction never notices: the
           snap band is far narrower than the gap between two real,
           distinct quotients this table would ever be asked to tell
           apart. Wider than one table step (~0.0098 at this
           `TRUNC_DOMAIN`, N) because the reciprocal that fed this
           quotient carries its own error on top, several thousandths for
           a `1/3` at this table's own resolution, and the snap has to
           clear both sources or it never actually triggers for the case
           it exists to catch. */
				const SNAP_EPS = 0.02;
				/* Toward zero, not down -- `Math.trunc`, matching `%`'s own sign
           convention rather than a floor's. -7/3 truncates to -2 and
           floors to -3; built from a floor, -7 mod 3 would build to 2
           (Euclidean, always B's own sign) where `PURE_NODES.mod` -- and
           every other `%` in this codebase -- answers -1 (A's own sign).
           A live build that disagreed with its own pulled value about
           which number MOD means would not be two views of one function,
           it would be two different functions sharing a name. */
				const truncCurve = new Float32Array(N);
				for (let i = 0; i < N; i++) {
					const x = ((i / (N - 1)) * 2 - 1) * TRUNC_DOMAIN;
					const rounded = Math.round(x);
					truncCurve[i] = Math.abs(x - rounded) < SNAP_EPS ? rounded : Math.trunc(x);
				}

				const bIn = ctx.createGain();
				bIn.gain.value = 1;
				const restB = ctx.createConstantSource();
				restB.offset.value = p('b', 0);
				sources.push(restB);
				restB.connect(bIn);

				const bScale = ctx.createGain();
				bScale.gain.value = 1 / DOMAIN;
				bIn.connect(bScale);
				// 0 away from the dead zone, 1 inside it -- gates B itself to 0
				// there so the identity (A - 0 * anything = A) holds exactly.
				const bLiveGate = ctx.createWaveShaper();
				bLiveGate.curve = deadZoneCurve;
				bScale.connect(bLiveGate);
				const bGated = ctx.createGain();
				bGated.gain.value = 0;
				bLiveGate.connect(bGated.gain);
				bIn.connect(bGated);

				const bReciprocal = ctx.createWaveShaper();
				bReciprocal.curve = reciprocalCurve;
				bScale.connect(bReciprocal);

				const aIn = ctx.createGain();
				aIn.gain.value = 1;
				const restA = ctx.createConstantSource();
				restA.offset.value = p('a', 0);
				sources.push(restA);
				restA.connect(aIn);

				const aOverB = ctx.createGain();
				aOverB.gain.value = 0;
				bReciprocal.connect(aOverB.gain);
				aIn.connect(aOverB);

				/* Same shape as DIV's own curve: `truncCurve` already stores the
           real (unscaled) truncated quotient at each entry, `aOverBScale`
           only maps `aOverB`'s real value onto the table's index space.
           An unscale stage after `truncated` would multiply an
           already-real integer by `TRUNC_DOMAIN` on top of itself, DIV's
           own bug one stage further down the chain. */
				const aOverBScale = ctx.createGain();
				aOverBScale.gain.value = 1 / TRUNC_DOMAIN;
				aOverB.connect(aOverBScale);
				const truncated = ctx.createWaveShaper();
				truncated.curve = truncCurve;
				aOverBScale.connect(truncated);

				const bTimesTrunc = ctx.createGain();
				bTimesTrunc.gain.value = 0;
				truncated.connect(bTimesTrunc.gain);
				bGated.connect(bTimesTrunc);

				const out = ctx.createGain();
				aIn.connect(out);
				const negBTimesTrunc = ctx.createGain();
				negBTimesTrunc.gain.value = -1;
				bTimesTrunc.connect(negBTimesTrunc);
				negBTimesTrunc.connect(out);

				mod.set('a', aIn);
				mod.set('b', bIn);
				return { in: null, out, mod };
			}

			case 'trsp': {
				/* PITCH plus BY, in semitones -- the same shape ADD is, with BY's
           own field as the resting value rather than a bare zero, since BY
           is a knob with a typed default as well as a socket. */
				const out = ctx.createGain();
				const a = ctx.createGain();
				a.gain.value = 1;
				a.connect(out);
				const b = ctx.createGain();
				b.gain.value = 1;
				b.connect(out);
				const restA = ctx.createConstantSource();
				restA.offset.value = p('a', 0);
				sources.push(restA);
				restA.connect(a);
				const restB = ctx.createConstantSource();
				restB.offset.value = p('b', 0);
				sources.push(restB);
				restB.connect(b);
				mod.set('a', a);
				mod.set('b', b);
				return { in: null, out, mod };
			}

			case 'mul': {
				/* A times B, built the way RING already builds one signal times
           another: A is the carrier, arriving at the gain's audio input: B
           is the gain itself, an AudioParam that live-modulates exactly the
           way an envelope opening a VCA does. The only choice this node adds
           is which leg plays which part, and it does not matter which,
           because multiplication does not care about order.

           Both legs default to 1, MUL's own identity, through the same
           `p(key, 1)` that zeroes a leg the instant something live claims
           it -- so an unwired B leaves the gain at its resting 1 and a live
           B leaves it at 0 plus whatever arrives, never 1 plus it. That is
           what stops "multiply by HELD" from reading as "multiply by HELD
           plus one". */
				const g = ctx.createGain();
				g.gain.value = p('b', 1);
				mod.set('b', g.gain);
				const aIn = ctx.createGain();
				aIn.gain.value = 1;
				aIn.connect(g);
				const restA = ctx.createConstantSource();
				restA.offset.value = p('a', 1);
				sources.push(restA);
				restA.connect(aIn);
				mod.set('a', aIn);
				return { in: null, out: g, mod };
			}

			case 'cmp': {
				/* A minus B, then a lookup table answering the test -- the same
           two-stage shape TO-FREQ and CLAMP use, a linear combination
           feeding a WaveShaperNode, because Web Audio has no node that
           compares two signals directly and a fixed curve is exactly what a
           threshold test is.

           GT/GE/LT/LE only need the *sign* of the difference, which survives
           unscaled: a WaveShaperNode holds its curve's own end value past
           its -1..1 domain, so a difference of 4 and a difference of 4000
           both saturate to the same "true" as long as the step sits at
           zero. The equality tests do not survive that -- `PURE_NODES.cmp`
           tests within 1e-9, and 1e-9 is far narrower than one sample of a
           1024-point table spanning -1..1 -- so the difference is scaled up
           before the shaper only for those two tests, wide enough that the
           tolerance band actually occupies real table entries instead of
           collapsing into one. */
				const test = Math.round(p('test', 0));
				const diff = ctx.createGain();
				const a = ctx.createGain();
				a.gain.value = 1;
				a.connect(diff);
				const b = ctx.createGain();
				b.gain.value = -1;
				b.connect(diff);
				const restA = ctx.createConstantSource();
				restA.offset.value = p('a', 0);
				sources.push(restA);
				restA.connect(a);
				const restB = ctx.createConstantSource();
				restB.offset.value = p('b', 0);
				sources.push(restB);
				restB.connect(b);
				mod.set('a', a);
				mod.set('b', b);

				const isNear = test === 4 || test === 5;
				const EPS = 1e-9;
				// The tolerance band occupies half the shaper's domain, wide
				// enough for a 1024-point table to resolve it cleanly.
				const NEAR_HALFWIDTH = 0.5;
				const scale = ctx.createGain();
				scale.gain.value = isNear ? NEAR_HALFWIDTH / EPS : 1;
				diff.connect(scale);

				const shaper = ctx.createWaveShaper();
				const N = 1024;
				const curve = new Float32Array(N);
				for (let i = 0; i < N; i++) {
					const x = (i / (N - 1)) * 2 - 1;
					let y: number;
					switch (test) {
						case 1:
							y = x >= 0 ? 1 : 0; // GE
							break;
						case 2:
							y = x < 0 ? 1 : 0; // LT
							break;
						case 3:
							y = x <= 0 ? 1 : 0; // LE
							break;
						case 4:
							y = Math.abs(x) <= NEAR_HALFWIDTH ? 1 : 0; // EQ, within tolerance
							break;
						case 5:
							y = Math.abs(x) <= NEAR_HALFWIDTH ? 0 : 1; // NEQ
							break;
						default:
							y = x > 0 ? 1 : 0; // GT
					}
					curve[i] = y;
				}
				shaper.curve = curve;
				scale.connect(shaper);
				return { in: null, out: shaper, mod };
			}

			case 'logic': {
				/* Two truths summed land on exactly 0, 1 or 2 -- clean integers,
           since the only things that reach these sockets are CMP or another
           logic node, both of which hand out exactly 0 or 1 -- so a fixed
           lookup keyed on that sum answers every test in the picker without
           needing to see A and B separately. Offset by -1 so the three
           values sit at the shaper's own -1, 0 and 1 exactly, with a
           tolerance band around each in case anything upstream is not
           perfectly clean. */
				const op = Math.round(p('op', 0));
				const sum = ctx.createGain();
				const a = ctx.createGain();
				a.gain.value = 1;
				a.connect(sum);
				const b = ctx.createGain();
				b.gain.value = 1;
				b.connect(sum);
				const restA = ctx.createConstantSource();
				restA.offset.value = p('a', 0);
				sources.push(restA);
				restA.connect(a);
				const restB = ctx.createConstantSource();
				restB.offset.value = p('b', 0);
				sources.push(restB);
				restB.connect(b);
				mod.set('a', a);
				mod.set('b', b);

				const offset = ctx.createConstantSource();
				offset.offset.value = -1;
				sources.push(offset);

				const shaper = ctx.createWaveShaper();
				const N = 1024;
				const curve = new Float32Array(N);
				const near = (x: number, target: number) => Math.abs(x - target) < 0.5;
				for (let i = 0; i < N; i++) {
					const x = (i / (N - 1)) * 2 - 1;
					let y: number;
					switch (op) {
						case 1:
							y = x > -0.5 ? 1 : 0; // OR: anything but both-false
							break;
						case 2:
							y = near(x, 0) ? 1 : 0; // XOR: exactly one true
							break;
						case 3:
							y = near(x, 1) ? 0 : 1; // NAND: not both true
							break;
						case 4:
							y = near(x, -1) ? 1 : 0; // NOR: both false
							break;
						default:
							y = near(x, 1) ? 1 : 0; // AND: both true
					}
					curve[i] = y;
				}
				shaper.curve = curve;
				sum.connect(shaper);
				offset.connect(shaper);
				return { in: null, out: shaper, mod };
			}

			case 'not': {
				/* True only where the input is exactly zero, false anywhere else --
           `PURE_NODES.not` takes any nonzero at all as true, so the input is
           scaled hard before the shaper: anything but a genuine zero
           saturates past the tolerance band and reads false, the same
           technique CMP's equality test uses for the same reason. */
				const aIn = ctx.createGain();
				aIn.gain.value = 1;
				const restA = ctx.createConstantSource();
				restA.offset.value = p('a', 0);
				sources.push(restA);
				restA.connect(aIn);
				mod.set('a', aIn);

				const scale = ctx.createGain();
				scale.gain.value = 1e9;
				aIn.connect(scale);

				const shaper = ctx.createWaveShaper();
				const N = 1024;
				const curve = new Float32Array(N);
				for (let i = 0; i < N; i++) {
					const x = (i / (N - 1)) * 2 - 1;
					curve[i] = Math.abs(x) <= 0.5 ? 1 : 0;
				}
				shaper.curve = curve;
				scale.connect(shaper);
				return { in: null, out: shaper, mod };
			}

			case 'clamp': {
				/* MIN(a, hi) = a - relu(a - hi); MAX(x, lo) = x + relu(lo - x).
           Two algebraic identities rather than a single lookup table, so
           MIN and MAX can be live signals too, the same as A -- a fixed
           table baking the bounds in the way MAP bakes its own X range
           would have meant a socket the canvas drew, `rolesCompatible`
           accepted and a cable reached, doing nothing once connected,
           which is exactly the bug this whole family of nodes exists to
           not have any more.

           ReLU is the one nonlinearity both identities need, and it is
           the same shaper reused for both: a difference, scaled into a
           wide domain, shaped flat-then-linear, scaled back out. The
           domain is generous -- swings far larger than any bound this
           catalogue's own knobs allow -- and past it the shaper holds its
           last value rather than continuing the ramp, the one honest
           limit a fixed-size table has, same trade TO-FREQ's semitone
           domain takes and for the same reason. */
				const DOMAIN = 1e6;
				const N = 2048;
				const reluCurve = new Float32Array(N);
				for (let i = 0; i < N; i++) {
					const x = (i / (N - 1)) * 2 - 1;
					reluCurve[i] = Math.max(0, x);
				}
				const relu = (x: AudioNode): AudioNode => {
					const scaleIn = ctx.createGain();
					scaleIn.gain.value = 1 / DOMAIN;
					x.connect(scaleIn);
					const shaper = ctx.createWaveShaper();
					shaper.curve = reluCurve;
					scaleIn.connect(shaper);
					const scaleOut = ctx.createGain();
					scaleOut.gain.value = DOMAIN;
					shaper.connect(scaleOut);
					return scaleOut;
				};
				const diff = (x: AudioNode, y: AudioNode): AudioNode => {
					const out = ctx.createGain();
					x.connect(out);
					const neg = ctx.createGain();
					neg.gain.value = -1;
					y.connect(neg);
					neg.connect(out);
					return out;
				};
				// Each leg is its own resting DC plus a live mod target, exactly
				// the shape every other leg in this family already uses.
				const leg = (key: string, def: number): AudioNode => {
					const g = ctx.createGain();
					g.gain.value = 1;
					const rest = ctx.createConstantSource();
					rest.offset.value = p(key, def);
					sources.push(rest);
					rest.connect(g);
					mod.set(key, g);
					return g;
				};
				const a = leg('a', 0);
				const legLo = leg('lo', 0);
				const legHi = leg('hi', 1);
				/* Which physical leg plays MIN's bound and which plays MAX's is
           decided once, from the resting values -- "MIN 100 with MAX 0"
           is a typo PURE_NODES.clamp guards the same way, by sorting.
           Sorting a live signal has no single answer, so this is the
           best a build-time decision can do; a patch that drives both
           bounds AND crosses them mid-note is the one case this does not
           chase further. */
				const [hiBound, loBound] = p('lo', 0) <= p('hi', 1) ? [legHi, legLo] : [legLo, legHi];
				const minned = diff(a, relu(diff(a, hiBound)));
				const out = ctx.createGain();
				minned.connect(out);
				relu(diff(loBound, minned)).connect(out);
				return { in: null, out, mod };
			}

			case 'tofreq': {
				/* Semitones to hertz, live: the domain is +-120 semitones (ten
           octaves either side of the tuning reference), wide enough that no
           patch playing an actual keyboard reaches the edge of it. Past
           that the shaper holds its end value rather than continuing the
           exponential, the one honest limit a fixed-size lookup table has
           -- the same trade `docs/node-graph.md` already names for the
           reasons an AudioWorklet would remove and this engine does not
           have one.

           The table calls `PURE_NODES.tofreq` directly rather than
           re-deriving the exponential, so the value pulled once and the
           value built here read the same reference and cannot drift
           apart. */
				const aIn = ctx.createGain();
				aIn.gain.value = 1;
				const restA = ctx.createConstantSource();
				restA.offset.value = p('a', 0);
				sources.push(restA);
				restA.connect(aIn);
				mod.set('a', aIn);

				const tuning = p('tuning', note.tuning ?? 440);
				const DOMAIN = 120;
				const scale = ctx.createGain();
				scale.gain.value = 1 / DOMAIN;
				aIn.connect(scale);

				const shaper = ctx.createWaveShaper();
				const N = 2048;
				const curve = new Float32Array(N);
				for (let i = 0; i < N; i++) {
					const x = (i / (N - 1)) * 2 - 1;
					const semis = x * DOMAIN;
					curve[i] = PURE_NODES.tofreq({ get: (_p, _f) => semis }, () => tuning);
				}
				shaper.curve = curve;
				scale.connect(shaper);
				return { in: null, out: shaper, mod };
			}

			case 'topitch': {
				/* Hertz to semitones, live: the lossy direction, and lossy in the
           same place a lookup table is -- both already round. The domain is
           a wide 0..20000 Hz, linear rather than log-spaced, which spends
           more of the table's resolution on the top octaves than the
           bottom; TO-PITCH was already the direction that quantises, so a
           table coarser at the low end is the same kind of imprecision this
           node always had, not a new one. */
				const aIn = ctx.createGain();
				aIn.gain.value = 1;
				const restA = ctx.createConstantSource();
				restA.offset.value = p('a', 0);
				sources.push(restA);
				restA.connect(aIn);
				mod.set('a', aIn);

				const tuning = p('tuning', note.tuning ?? 440);
				const DOMAIN_HZ = 20000;
				const scale = ctx.createGain();
				scale.gain.value = 2 / DOMAIN_HZ;
				const preOffset = ctx.createConstantSource();
				preOffset.offset.value = -1;
				sources.push(preOffset);
				const scaled = ctx.createGain();
				aIn.connect(scale);
				scale.connect(scaled);
				preOffset.connect(scaled);

				const shaper = ctx.createWaveShaper();
				const N = 4096;
				const curve = new Float32Array(N);
				for (let i = 0; i < N; i++) {
					const t = (i / (N - 1)) * 2 - 1;
					const hz = ((t + 1) / 2) * DOMAIN_HZ;
					curve[i] = PURE_NODES.topitch({ get: (_p, _f) => hz }, () => tuning);
				}
				shaper.curve = curve;
				scaled.connect(shaper);
				return { in: null, out: shaper, mod };
			}

			default: {
				/* The acoustic modules are the same ones the linear chain builds.

           This list is a silent filter -- a param not named here never reaches
           the module, with no error and no clue. modeHz was added to the
           catalogue and to MODES and did nothing for exactly that reason: three
           separate fixes to the kick's brightness all measured identical
           because the value was being dropped here. Adding a param to a module
           means adding it here too.

           It filters in one direction only, so a name that stops being read
           costs nothing and says nothing -- which is how `exNoise` sat here
           after EXCT's own `case` took over from this fallthrough, naming a
           param no module declares and no builder reads. Removed rather than
           left: the list's whole job is to be the answer to "does this param
           reach the module", and a name that reaches nothing makes it lie in
           the direction that is expensive to check. */
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
					'exTone'
				])
					asParams[k] = p(k, NaN);
				for (const k of Object.keys(asParams)) if (Number.isNaN(asParams[k])) delete asParams[k];
				/* PITCH decides what these are tuned to, like every other pitched
           module: wired, it follows the cable; unwired, the note. Passing
           baseFreq straight through made a STRING track the keyboard whatever
           the canvas said.

           Read through `p`, which says three things: NaN when nothing is
           patched, the number when a value is, and 0 when a moving signal is
           -- that signal is connected to the processor's pitch parameter by
           the mod loop and adds to the 0, so a vibrato reaches every partial.
           It used to be read once with `cvIn`, which returned the fallback for
           a signal, so the vibrato was dropped and the note played instead. */
				const pitchIn = p('pitch', NaN);
				const pitchWired = !Number.isNaN(pitchIn);
				const made = this.buildRackModule(
					ctx,
					type,
					asParams,
					pitchWired ? pitchIn : baseFreq,
					t,
					heldSec,
					pitchWired
				);
				if (!made) return null;
				for (const src of made.sources ?? []) sources.push(src);
				for (const [key, param] of Object.entries(made.params ?? {})) mod.set(key, param);
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
		heldSec: number,
		/* Whether a cable decided `baseFreq`, as opposed to it being the played
       note. MODES needs the difference: its BASE knob pins the body to an
       absolute pitch, and only a patch saying otherwise should override it. */
		pitchWired = false
	): {
		in: AudioNode;
		out: AudioNode;
		sources?: AudioScheduledSourceNode[];
		/** Each card key's live parameter, for a caller that lets cables reach them. */
		params?: Record<string, AudioParam>;
	} | null {
		/* Built in the live-DSP worklet, so every setting is a parameter read as
       the note plays (see live-dsp.worklet.ts for the models themselves).
       Native, each partial was an oscillator with an automation curve written
       at the note: DECAY, DAMP, STIFF, Q and the ratios were read once, and
       PITCH set the frequencies once, so a vibrato patched into a STRING was
       dropped.

       Karplus-Strong -- a delay line one period long, fed back through a
       damping filter -- was the first model tried, and a DelayNode in a
       feedback loop is only stable up to about g = 0.90 here, which buys
       0.45 s of ring. Additive has no loop and no such limit, which is why
       these are banks of decaying partials.

       The gate is the note, as ENV's is: the partials are struck when it
       rises, and a TUBE holds until it falls. `params` maps each card key to
       its parameter, and each is set from `p` here -- a caller whose cable
       carries a signal passes 0 for that key and connects the signal to the
       parameter, which then adds to it. */
		const setAll = (
			node: LiveDsp,
			map: [cardKey: string, param: string, def: number][]
		): Record<string, AudioParam> => {
			const params: Record<string, AudioParam> = {};
			for (const [cardKey, name, def] of map) {
				const param = node.param(name);
				param.value = p[cardKey] ?? def;
				params[cardKey] = param;
			}
			return params;
		};
		const gateNote = (node: LiveDsp) => this.holdGate(node.param('gate'), _t, heldSec);
		const options: AudioWorkletNodeOptions = {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			outputChannelCount: [1],
			channelCount: 1,
			channelCountMode: 'explicit'
		};

		switch (id) {
			case 'string':
			case 'tube': {
				const isTube = id === 'tube';
				/* TUBE's odd-only switch is a two-position selector, and read as one:
           a patch saved when it was a dial holds 100, so 1 and 100 both mean
           odd and 0 does not. */
				const oddOnly = isTube && (p.tubeOdd ?? 1) >= 0.5;
				const node = createLiveDsp(ctx, STRINGS_PROCESSOR, {
					...options,
					processorOptions: { tube: isTube, oddOnly }
				});
				if (!node) return null;
				/* Every default is the number the card prints: an untouched knob is
           absent from the patch, so the default is what plays while the
           field shows it. */
				const params = setAll(
					node,
					isTube
						? [
								['tubeDecay', 'decay', 1.5],
								['tubeDamp', 'damping', 50],
								['tubeMix', 'mix', 70]
							]
						: [
								['decayTime', 'decay', 2],
								['damping', 'damping', 40],
								['stiffness', 'stiffness', 10],
								['strBlend', 'mix', 70]
							]
				);
				node.param('pitch').value = baseFreq;
				params.pitch = node.param('pitch');
				gateNote(node);
				return { in: node.node, out: node.node, sources: [node.source], params };
			}

			case 'modes': {
				/* A modal bank -- partials that are not a harmonic series, which is
           what a drum or a bell is and what one filter cannot produce. */
				const node = createLiveDsp(ctx, MODES_PROCESSOR, {
					...options,
					processorOptions: { pitchWired }
				});
				if (!node) return null;
				const params = setAll(node, [
					['modeHz', 'base', 0],
					['mode1', 'r1', 1],
					['mode2', 'r2', 2.4],
					['mode3', 'r3', 4.1],
					['modeQ', 'q', 14],
					['modeMix', 'mix', 70]
				]);
				node.param('pitch').value = baseFreq;
				params.pitch = node.param('pitch');
				gateNote(node);
				return { in: node.node, out: node.node, sources: [node.source], params };
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

	/**
	 * The DRIVE curve, normalised so the knob adds character and not a cliff.
	 *
	 * The shape is the usual arctan-ish soft clip, and it is kept. What was
	 * wrong is that it was used raw: its own output at full scale is about
	 * 0.335 for every k in the range, so the first click of the knob -- 5% --
	 * dropped the entire master bus by 9.4 dB and clamped every peak to a
	 * third of full scale. It only clawed back to unity somewhere past 50%.
	 * Nobody turns a drive knob expecting the mix to duck.
	 *
	 * Dividing by the curve's own peak keeps the shape exactly and removes the
	 * step: at 5% the small-signal gain is now +0.14 dB rather than -9.4, and
	 * it rises from there, which is what drive is supposed to do.
	 */
	private makeDistortionCurve(amount: number): Float32Array {
		const k = typeof amount === 'number' ? amount * 50 : 0;
		const n_samples = 44100;
		const curve = new Float32Array(n_samples);
		const deg = Math.PI / 180;
		const shape = (x: number) =>
			k === 0 ? x : ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
		// What the shape yields at full scale, so the curve can be scaled to it.
		const peak = Math.abs(shape(1)) || 1;
		for (let i = 0; i < n_samples; ++i) {
			const x = (i * 2) / n_samples - 1;
			curve[i] = shape(x) / peak;
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
		/* And the lookahead that was booked against the old length.
		
		   Clamping the two cursors was not enough: `scheduledStepQueue` still
		   held entries for steps the pattern no longer has, and `checkUIQueue`
		   publishes those to the step listeners as their times arrive. Shrinking
		   a 200-step pattern to 16 while playing sent the playhead to steps 44
		   through 51 for a whole lookahead window. Notes already sounding are in
		   flight and keep their tails; what has not been heard yet should not
		   claim to be somewhere that no longer exists. */
		this.scheduledStepQueue = this.scheduledStepQueue.filter((e) => e.step < this.totalSteps);
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
	/**
	 * Which of the two master legs carries the signal.
	 *
	 * `immediate` is for the moment the pair is built. Both gains are new, so
	 * both are 1, and `setTargetAtTime` never actually sets a value -- it decays
	 * towards one. Live that costs nothing, because the context is minutes old
	 * before a note arrives. Offline it happens at currentTime 0, which is
	 * exactly where the song starts, so the first ~50 ms of every rendered file
	 * went through the bypass *and* the peak-clamping shaper at once: roughly
	 * double level, clipped, and not what was heard while playing. It could
	 * trigger the render's own "peak > -0.1 dB" warning by itself.
	 *
	 * Turning the knob still ramps, because that is a control being moved and a
	 * step there would click.
	 */
	private applyDriveRouting(immediate = false) {
		if (!this.shaperIn || !this.shaperBypass) return;
		const on = this.driveAmount > 0.001;
		const t = this.shaperIn.context.currentTime;
		if (immediate) {
			this.shaperIn.gain.setValueAtTime(on ? 1 : 0, t);
			this.shaperBypass.gain.setValueAtTime(on ? 0 : 1, t);
			return;
		}
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

	/* One cycle of each of the four named shapes, for the case where a phase has
	   been asked for. `osc.type = 'sawtooth'` is the cheap path and has no phase
	   to speak of, so a rotated wave has to be built from samples like every
	   other table -- these are the samples. 2048 points is well past the 64
	   harmonics the DFT keeps, so the table is not what limits the result. */
	private shapeTables = new Map<string, Float32Array>();
	private shapeTable(w: string): Float32Array {
		let t = this.shapeTables.get(w);
		if (!t) {
			const N = 2048;
			t = new Float32Array(N);
			for (let i = 0; i < N; i++) {
				const x = i / N;
				t[i] =
					w === 'square'
						? x < 0.5
							? 1
							: -1
						: w === 'sawtooth'
							? 2 * x - 1
							: w === 'triangle'
								? 4 * Math.abs(x - 0.5) - 1
								: Math.sin(2 * Math.PI * x);
			}
			this.shapeTables.set(w, t);
		}
		return t;
	}

	private phasedWaves: WeakMap<BaseAudioContext, Map<string, PeriodicWave>> = new WeakMap();
	/**
	 * One cycle of samples, rotated by a fraction of a turn.
	 *
	 * A phase offset is a rotation of every harmonic, and the nth harmonic turns
	 * n times as far -- which is exactly what `createPeriodicWave` takes, since
	 * it is given the real and imaginary coefficients separately. That is why
	 * this is possible at all: `OscillatorNode` has no phase parameter, and
	 * delaying it would not be one either, because a fixed delay is a different
	 * phase at every frequency, so the offset would drift the moment the note
	 * changed pitch.
	 *
	 * The cost is that the rotation is baked into the wave table, so it is fixed
	 * when the note starts and an LFO cannot sweep it. Sweeping phase needs two
	 * oscillators beating against each other, which is a patch rather than a
	 * knob.
	 */
	private phasedWave(
		ctx: BaseAudioContext,
		key: string,
		samples: ArrayLike<number>,
		turns: number
	): PeriodicWave {
		let perCtx = this.phasedWaves.get(ctx);
		if (!perCtx) {
			perCtx = new Map();
			this.phasedWaves.set(ctx, perCtx);
		}
		/* Quantised into the cache key, because phase is a continuous value and
		   an un-rounded one would make a new wave table for every note. A
		   thousandth of a turn is a third of a degree, which is finer than the
		   ear resolves in a beating pair. */
		const q = Math.round(turns * 1000) / 1000;
		const ck = `${key}@${q}`;
		let wave = perCtx.get(ck);
		if (!wave) {
			const N = samples.length;
			const H = 64;
			const real = new Float32Array(H + 1);
			const imag = new Float32Array(H + 1);
			const phi = 2 * Math.PI * q;
			for (let n = 1; n <= H; n++) {
				let re = 0,
					im = 0;
				for (let i = 0; i < N; i++) {
					const ph = (2 * Math.PI * n * i) / N;
					re += samples[i] * Math.cos(ph);
					im += samples[i] * Math.sin(ph);
				}
				re *= 2 / N;
				im *= 2 / N;
				/* Rotate this harmonic by n turns of the offset. Rotating all of
				   them by the same angle would smear the shape instead of sliding
				   it: what makes this a delay of the whole wave rather than a new
				   waveform is that the nth partial moves n times as far. */
				const c = Math.cos(n * phi);
				const s = Math.sin(n * phi);
				real[n] = re * c - im * s;
				imag[n] = im * c + re * s;
			}
			wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
			perCtx.set(ck, wave);
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
		// A build that threw last time must not hand its collector to this one.
		this.noteGates = null;
		this.deferredGates = null;
		this.trackBusSends = null;
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
		const track = this.playable(effectiveTimbre(trackRow, noteIndex));

		const acc = typeof accentLevel === 'boolean' ? (accentLevel ? 1 : 0) : accentLevel || 0;

		const ctx = this.audioCtx();
		if (!ctx) return;
		// An OfflineAudioContext also reports "suspended" before startRendering();
		// resuming it here would begin the render mid-schedule.
		if (!this.renderCtx && ctx.state === 'suspended') ctx.resume().catch(() => {});

		this.initMasterFX(ctx);
		this.ensureSharedGuards(ctx);

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
		const act = this.noteActions(track, noteIndex, trackId, {
			/* The same three quantities `buildRackGraph` resolves against, computed
			   the same way. Semitones from master tuning rather than from MIDI 69,
			   and the velocity actually played rather than a hardcoded 1.
			
			   The tuning cancels: `buildRackGraph` divides `noteInfo.freq * (A4/440)`
			   back by A4, so the pitch a patch sees is against 440 whatever A4 is.
			   Written out rather than shortened, so it reads as the same expression
			   as the one it has to agree with. */
			pitch:
				12 *
				Math.log2(
					Math.max(1e-6, noteInfo.freq * (this.masterTuningFreq / 440.0)) /
						this.masterTuningFreq
				),
			velocity: Math.max(0, Math.min(1, (laneVelocity ?? rawVelocity ?? 100) / 127)),
			noteIndex,
			lanes: {}
		});
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
					this.chokeVoice(k, ctx, ctx.currentTime, act.fadeSec);
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
			const limit = Math.max(1, Math.min(32, Math.round(trackRow.polyphony ?? this.maxPolyphony)));
			while (onThisTrack.length >= limit) {
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
		/* The oscillators that make up OSC1's tone, kept apart from OSC2's.

		   In FM, OSC2 is the modulator and OSC1 the carrier, so the modulator's
		   output goes to the carrier's frequency. `companions` holds *both* stacks
		   by the time FM is wired, and the guard there excluded only the osc2
		   primary -- so a SUPERSAW on OSC2 had its own four companions patched to
		   the summed output they themselves produce. An audio-rate self-FM loop,
		   and a timbre unrelated to the index the MORPH knob sets. */
		const carrierVoices: OscillatorNode[] = [];
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
				carrierVoices.push(...stack1.companions);
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
				// The carrier's own stack only: never the modulator's.
				for (const c of carrierVoices) fmGain.connect(c.frequency);

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

		/* The graph's own sink gain, so a patch with no envelope of its own can
       still be stopped cleanly. Undefined for a classic voice, where
       `gainNode` already owns this job. Set later, once the graph is built
       below -- read here already because the timed-note branch just past
       this point needs to leave `extrasStop` somewhere for that later code
       to find. */
		let advGraphOut: GainNode | undefined;
		/* When `extras` (which the graph's own sources join) are due to stop,
       set by the timed-note branch below before `advGraphOut` exists --
       read again once it does, past the graph-build block further down. */
		let advGraphExtrasStop: number | undefined;
		/* Every OUT the graph reached, keyed by node id -- see `buildActivation`'s
       own field of the same name for what each entry answers. Read past the
       graph-build block below to fade each FOLLOW OUT's own gain at
       `advGraphExtrasStop` shifted by that OUT's own delay, rather than
       fading the one shared `advGraphOut` and taking every other OUT down
       with it. */
		let advGraphOuts:
			| Map<string, { delay: number; durCap: number | undefined; gain: GainNode; sources: AudioScheduledSourceNode[] }>
			| undefined;
		// The graph's TSND gains, cut from the track's chain with the voice.
		let advSends: AudioNode[] = [];
		/* FOLLOW's own release anchor for a timed note -- `releaseStartTime`,
       set inside the `!isContinuousHold` branch below, read again past
       the graph-build block for the same reason `advGraphExtrasStop` is:
       a FOLLOW OUT's fade has to start where `ampRelease` itself starts
       counting, not `extrasStop`'s own deliberate buffer past it. */
		let advGraphReleaseStart: number | undefined;
		/* Same reasoning as `advGraphReleaseStart`: a FOLLOW OUT's own fade
       needs `rackTail`, set inside the same branch, to know how long a
       resonator in the graph is still owed past `ampRel` alone. */
		let advGraphRackTail: number | undefined;

		const isContinuousHold = durationSec === 0;
		const voiceGates: AudioParam[] = [];
		if (!this.renderCtx) this.deferredGates = [];

		if (!isContinuousHold) {
			const holdSec = durationSec !== undefined ? Math.max(0.02, durationSec) : 60 / this.bpm / 8;
			const releaseStartTime = Math.max(t + ampAtt + ampDec, t + holdSec);
			advGraphReleaseStart = releaseStartTime;
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
			advGraphRackTail = rackTail;
			const stopTime = releaseStartTime + ampRel + 0.1;
			const reapTime = stopTime + rackTail;
			/* A resonator's partials are sources of their own and outlive the
         excitation -- a piano string rings for seconds after the hammer. Stop
         them at the reap, not with the oscillators, or the note is cut off
         mid-decay however long its DECY says.

         Half a second past it, because the ring-out is where the partial
         envelope reaches -80 dB, not silence: stopping exactly there leaves a
         step from a quiet note to nothing, which is heard as a click. */
			const uncappedExtrasStop = rackTail > 0 ? reapTime + 0.5 : stopTime;
			/* No DUR folded in here any more. It used to replace `extrasStop`
         outright the moment any OUT in the graph set one, which measured
         from the note's start and applied to every source the graph built
         -- across every OUT, not only the one whose DUR this was. A TIME OUT
         behind a WAIT therefore silenced a sibling OUT set to FOLLOW, and
         even on its own reached its mark 200ms early for every 200ms WAIT
         delayed it by, because `t + durCap` never knew a delay existed.

         DUR is answered per OUT now, inside `buildActivation` itself for
         TIME and STEP (both know their own whole lifetime the moment the
         graph builds, `t + delay + durCap`, needing nothing from here) and
         just past the graph-build block below for FOLLOW, which reads
         `extrasStop` -- what this variable is still for -- shifted by each
         FOLLOW OUT's own delay. Classic-rack `extras` answer to their own
         envelope alone now, exactly as if no graph were attached, which is
         correct: DUR was never a setting this array's own modules carried. */
			const extrasStop = uncappedExtrasStop;
			advGraphExtrasStop = extrasStop;
			/* How much further out reaping has to be held for a WAIT-delayed OUT
         still to be heard when it fades. Computed before the graph is even
         built -- `advGraphLatestDeadline` only needs to walk it, not run it
         -- because `endSrc`'s own `.stop()` decides when `onended` reaps the
         *whole* voice, ADV graph included, and it is called below, still
         inside this branch, well before the graph-build block further down
         gets anywhere near existing. Left at `extrasStop`'s own value for a
         classic (non-ADV) track, where this always answers undefined and
         changes nothing.

         Measured before this existed: a FOLLOW OUT sitting behind an 800ms
         WAIT scheduled its own fade for 2.21s and was torn down at 1.41s
         regardless, because reaping answered to the classic voice's own
         stale, un-extended stop time -- the fade was correct and never got
         to run. */
			const advDeadline = this.advGraphLatestDeadline(track, t, uncappedExtrasStop);
			const reapDeadline = advDeadline !== undefined ? Math.max(extrasStop, advDeadline) : extrasStop;
			if (osc1) osc1.stop(Math.min(stopTime, extrasStop));
			if (osc2) osc2.stop(Math.min(stopTime, extrasStop));
			if (noiseSource) noiseSource.stop(Math.min(stopTime, extrasStop));
			for (const x of extras) x.stop(extrasStop);
			if (lfo) lfo.stop(Math.min(stopTime, extrasStop));

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
         cut off mid-note. Wait out the chain's tail first -- and any
         WAIT-delayed ADV OUT still fading.

         `endSrc` is re-stopped at `reapDeadline` rather than having its
         `onended` wrapped in an extra `window.setTimeout`: `setTimeout` is
         wall-clock time, and an offline render does not run at wall-clock
         speed at all -- a render that finishes in fifty real milliseconds
         would have fired a "wait 800ms more" timeout long after the buffer
         was already read out, which is to say never, as far as the render
         was concerned. `onended` itself is audio-clock-accurate in both
         contexts, so moving the deadline onto the node's own `.stop()` call
         is what makes this correct offline and not only in a live tab.
         `endSrc` is silent under ADV regardless of when it stops, so
         holding it open longer costs nothing but the reap it would
         otherwise have triggered early. A later `.stop()` call before a
         node has actually stopped replaces the earlier one, which is the
         same rule WAIT's own re-scheduling already relies on. */
			if (endSrc && reapDeadline > extrasStop) endSrc.stop(reapDeadline);
			if (endSrc) {
				endSrc.onended =
					rackTail > 0
						? () => window.setTimeout(() => this.reapVoice(voiceKey), rackTail * 1000 + 600)
						: () => this.reapVoice(voiceKey);
			}
			if (!this.renderCtx) {
				// Past extrasStop, so the graph outlives the partials rather than
				// cutting them: disconnecting mid-decay is an audible click.
				const cleanupMs = Math.ceil((Math.max(reapTime, reapDeadline) - ctx.currentTime) * 1000) + 600;
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
		/* Set only when this note's graph actually wires something to REL or
       ON-CHOKE -- the two fields carried out of this block for
       `activeVoices.set` below, once `busInput` exists to put in them. Left
       undefined for every patch that has never touched either outlet, which
       is what keeps this feature's cost at exactly zero for them:
       `releaseVoice`/`chokeVoice`/`stopVoice` finding it absent is the
       entire check any of them does. */
		let advRelContext: Omit<AdvBuildContext, 'busInput'> | undefined;
		let advChokeContext: Omit<AdvBuildContext, 'busInput'> | undefined;
		if (graph) {
			/* What each lane reads for this note. Sampled once, when the note starts:
         that is what a lane means for a voice, and it is why the socket is a
         constant rather than a moving signal. */
			const laneValues: Record<string, number> = {};
			for (const l of lanesOf(trackRow as { noteLanes?: NoteLane[] })) {
				laneValues[l.id] = laneAt(l, this.currentStep);
			}
			const graphParams = track.graphParams ?? {};
			const graphWaves = track.graphWaves ?? {};
			const presetGain = track.presetGain ?? 1;
			/* RAND's draw for this note. Live, a fresh one; in a render, derived
			   from the note itself, so an export sounds the same every time. */
			const noteSeed = this.renderCtx
				? ((trackId * 131 + noteIndex * 7919 + Math.round(t * 48000)) % 1000003) / 1000003
				: Math.random();
			this.trackBusSends = this.ensureTrackChain(
				ctx,
				trackId,
				track,
				graph,
				this.trackBuses[track.id]?.input ?? this.masterBusIn ?? masterGain
			);
			this.noteGates = { list: voiceGates, openEnded: isContinuousHold };
			const built = this.buildRackGraph(
				ctx,
				graph,
				graphParams,
				baseFreq,
				t,
				heldSec,
				laneValues,
				presetGain,
				{ velocity: velocityUnit, noteIndex, seed: noteSeed },
				trackId,
				graphWaves
			);
			this.noteGates = null;
			this.trackBusSends = null;
			if (built) {
				/* The graph is the whole voice, and answers to none of racks 1-7.

           Routing it through track.volume was tried and is wrong: that is rack
           7's VOL knob, so turning down a control on the instrument you are not
           playing silenced the one you are. Level inside a patch is a VCA on the
           canvas; the track's place in the mix is the mixer's business, further
           down. */
				chainOut = built.out;
				advGraphOut = built.out as GainNode;
				advGraphOuts = built.outs;
				advSends = built.sends;
				for (const src of built.sources) {
					src.start(built.startAt.get(src) ?? t);
					extras.push(src);
				}
			}
			/* Whether REL or ON-CHOKE reach anything at all, asked once here
         rather than redone inside `releaseVoice`/`chokeVoice`/`stopVoice`:
         reachability depends on the graph as it stood at this exact
         note-on, and that is what the snapshot below freezes. An outlet
         with no cable on it costs nothing past this one check. */
			const snapshot: Omit<AdvBuildContext, 'busInput'> = {
				graph,
				params: graphParams,
				baseFreq,
				laneValues,
				presetGain,
				note: { velocity: velocityUnit, noteIndex, seed: noteSeed },
				trackId,
				waves: graphWaves
			};
			if (execReach(graph, EXEC_PORT_IDS, 'in', undefined, 'rel').reached.size > 0) {
				advRelContext = snapshot;
			}
			/* ON-CHOKE is its own node type, not an outlet on KEY-EVENT, so its
         reachability is asked with `entryType: 'onchoke'` rather than a
         different `entryPort` on the same entry -- see the module's own
         docstring in synth-modules.ts for why the two are not the same
         event. */
			if (execReach(graph, EXEC_PORT_IDS, 'onchoke', undefined, 'then').reached.size > 0) {
				advChokeContext = snapshot;
			}
		}

		/* An ADV graph is the whole voice and answers to none of racks 1-7 --
       `chainOut` is reassigned to the graph's own sink the moment a graph
       builds, so `gainNode`'s own release ramp (scheduled far above, at
       the top of the `!isContinuousHold` branch) drives a node the signal
       path no longer passes through at all. Every OUT's own fade has to
       happen on its own `gain` here, the per-OUT node actually wired into
       that sink -- there is no upstream envelope already doing this job
       to defer to, FOLLOW included.

       TIME/STEP: nothing else stops this OUT's sound at its own mark, so
       `t + durCap`, shifted by the OUT's own `delay` the same way WAIT
       shifted when it started.

       FOLLOW: anchored at `releaseStartTime + max(ampRel, rackTail)`, not
       `releaseStartTime + ampRel` alone and not `extrasStop`'s own
       deliberate buffer past both (`uncappedExtrasStop`'s `+0.1`/`+0.5`,
       there for the *reap* deadline, not for how long the ear should
       hear something). `ampRel` is what a plain FOLLOW OUT with no
       resonator needs; `rackTail` is what one carrying a STRING, TUBE or
       similar actually needs -- taking `ampRel` alone once cut a
       resonator's own ring short at whatever `ampRelease` said, however
       long DCAY/DECY asked for on top of it. Left at `extrasStop` alone,
       a plain OSC held at full level for the gap past `ampRel` and then
       cut in a flat 10ms, audibly nothing like `ampRelease`'s own shape.
       Measured: a bare OSC with `ampRelease` 0.12s held at peak until
       ~0.1s past where the release should have finished, then vanished
       in under 15ms. The fade now spans `max(ampRel, rackTail)` itself,
       plain FOLLOW getting the same short release its own envelope
       always drew and a resonator keeping the tail its own module
       already earns. */
		if (
			advGraphOuts &&
			advGraphOuts.size &&
			advGraphExtrasStop !== undefined &&
			advGraphReleaseStart !== undefined
		) {
			const followFadeLen = Math.max(ampRel, advGraphRackTail ?? 0);
			for (const { delay, durCap, gain } of advGraphOuts.values()) {
				const stopAt =
					durCap !== undefined ? t + durCap + delay : advGraphReleaseStart + followFadeLen + delay;
				const anchor = durCap !== undefined ? t : advGraphReleaseStart;
				const fadeSec =
					durCap !== undefined ? Math.min(0.01, Math.max(0, stopAt - anchor)) : Math.max(0, stopAt - anchor);
				gain.gain.setValueAtTime(gain.gain.value, Math.max(anchor, stopAt - fadeSec));
				gain.gain.linearRampToValueAtTime(0, stopAt);
			}
		} else if (advGraphOut && advGraphExtrasStop !== undefined) {
			// No OUT module at all -- the legacy "everything nothing else
			// listens to is an output" shape -- so there is no per-OUT gain to
			// fade individually; the merged sink is the only seam there is.
			const fadeSec = Math.min(0.01, Math.max(0, advGraphExtrasStop - t));
			advGraphOut.gain.setValueAtTime(
				advGraphOut.gain.value,
				Math.max(t, advGraphExtrasStop - fadeSec)
			);
			advGraphOut.gain.linearRampToValueAtTime(0, advGraphExtrasStop);
		}

		const rackChain = track.advanced && !graph ? track.rackChain : undefined;
		if (Array.isArray(rackChain) && rackChain.length) {
			const rackParams = track.rackParams ?? {};
			for (const id of rackChain) {
				this.noteGates = { list: voiceGates, openEnded: isContinuousHold };
				const mod = this.buildRackModule(ctx, id, rackParams, baseFreq, t, heldSec);
				this.noteGates = null;
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
		const tailNodes: AudioNode[] = [...advSends];
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

		/* Whatever ends the voice has to be reapable.

		   `tailNodes` collects the AIR shelf and the per-key EQ, and both are
		   gated: AIR on `!advOwnsVoice`, keyEq on percussion. An ADV voice on a
		   melodic track takes neither, so `finalVoiceNode` is still the graph's
		   own output -- a node `detachVoice` has never heard of. The send below
		   connects it to `reverbConvolver`, which lives as long as the page, so
		   the edge kept the whole per-note graph alive on the audio thread after
		   the voice was released. Same leak `tailNodes` was added to close, on
		   the one path that reaches the send without passing through either
		   branch that fills it. */
		if (!tailNodes.includes(finalVoiceNode)) tailNodes.push(finalVoiceNode);

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

		/* A tap on what the voice puts out, so QUIETEST can take the one that is
		   actually quietest. The amp envelope it read before is racks 1-7's, and
		   an ADV voice does not pass through it at all. Disconnected with the
		   rest of the tail. */
		let meter: AnalyserNode | undefined;
		if (!this.renderCtx) {
			meter = ctx.createAnalyser();
			meter.fftSize = 256;
			finalVoiceNode.connect(meter);
		}

		// The voice map lets held notes be released and stolen live, and lets
		// onended reap a finished voice's nodes in either context.
		const gatesRise = this.raiseDeferredGates(ctx, t);
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
				muteGroup: trackRow.percussion ? act.cutGroup : 0,
				advRelContext: advRelContext ? { ...advRelContext, busInput } : undefined,
				advChokeContext: advChokeContext ? { ...advChokeContext, busInput } : undefined,
				advGraphOut,
				advGraphOuts,
				gates: voiceGates,
				gatesRise,
				releasedAt: isContinuousHold ? undefined : t + heldSec,
				meter
			});
			/* A timed note's key comes up at a moment known now: its end. REL used
			   to fire only from `releaseVoice`, which a sequenced or rendered note
			   never reaches -- so a patch's release sound played under a hand and
			   was missing from the song and from every exported WAV. Built now,
			   starting then; `chokeVoice` cancels it if the note is cut first. */
			const timed = this.activeVoices.get(voiceKey);
			if (timed?.advRelContext && !isContinuousHold) {
				timed.relAt = t + heldSec;
				this.fireVoiceInterrupt(timed, ctx, timed.relAt, 'advRelContext', 'in', 'rel', 'relSources');
			}
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

	/**
	 * `releaseVoice`, exposed for a caller that already has the voice key
	 * rather than a track/note pair -- the audit bench, which triggers a voice
	 * directly and needs to release that exact one without going through
	 * `trackHeldVoices` at all.
	 */
	/**
	 * Hold a module's gate up for the note: open at `t`, closed when it ends.
	 *
	 * A timed note knows when it ends and closes the gate on schedule. A key
	 * held live does not: `heldSec` is a placeholder there (8 s), and closing
	 * on it meant two faults at once -- letting go early left every ENV at its
	 * sustain, so a patch's release never ran and the note hung on until the
	 * OUT faded it, and holding past 8 s released the envelopes under a key
	 * still down. So a live note's gate stays open and is collected, and
	 * `releaseVoice` closes it at the moment the key actually comes up.
	 */
	private holdGate(gate: AudioParam, t: number, heldSec: number) {
		const note = this.noteGates;
		note?.list.push(gate);
		if (this.deferredGates) {
			this.deferredGates.push({ gate, t, heldSec: note?.openEnded ? Infinity : heldSec, strike: false });
			return;
		}
		gate.setValueAtTime(1, t);
		if (!note?.openEnded) gate.setValueAtTime(0, t + heldSec);
	}

	/** A strike: the gate up and straight down again (EXCITE's burst), deferred like `holdGate`. */
	private strikeGate(gate: AudioParam, t: number) {
		if (this.deferredGates) {
			this.deferredGates.push({ gate, t, heldSec: 0.0001, strike: true });
			return;
		}
		gate.setValueAtTime(1, t);
		gate.setValueAtTime(0, t + 0.0001);
	}

	/** Raise every gate a real-time build held back, now that the voice exists. Returns when they rise. */
	private raiseDeferredGates(ctx: BaseAudioContext, t: number): number {
		const pending = this.deferredGates;
		this.deferredGates = null;
		if (!pending?.length) return t;
		/* Past the audio thread as well as the clock: it renders a device buffer
		   at a time, so it can already be `baseLatency` ahead of `currentTime`
		   when this runs, and a gate risen in the quantum it is on would still
		   beat the cables it needs, which join at the next one. Two quanta past
		   that alone missed about one note in 150 on a 10 ms device. */
		const ahead = (ctx as AudioContext).baseLatency ?? 0;
		const go = Math.max(t, ctx.currentTime + ahead + (2 * 128) / ctx.sampleRate);
		for (const { gate, heldSec } of pending) {
			gate.setValueAtTime(1, go);
			if (Number.isFinite(heldSec)) gate.setValueAtTime(0, go + heldSec);
		}
		return go;
	}

	public releaseTrackVoice(voiceKey: string) {
		this.releaseVoice(voiceKey);
	}

	// Set Sustain Pedal (CC 64) State
	/* What CTRL hands a patch: pedal, bend, wheel, pressure, and every CC by
	   number. One set for the engine, the way the pedal already is -- a
	   controller belongs to the player, not to a key. */
	private ctrlValues: Record<'ped' | 'bend' | 'mod' | 'pres', number> = { ped: 0, bend: 0, mod: 0, pres: 0 };
	private ccValues = new Float32Array(128);
	/* Every CTRL outlet sounding right now, so a controller that moves reaches
	   the voices already ringing. Each leaves when its source ends. */
	private ctrlSources = new Set<{ port: string; cc: number; node: ConstantSourceNode }>();

	private controllerValue(port: string, cc: number): number {
		if (port === 'cc') return this.ccValues[cc] ?? 0;
		return this.ctrlValues[port as keyof ModularSynth['ctrlValues']] ?? 0;
	}

	/**
	 * A controller moved. `kind` is one of CTRL's own outlets, or `cc` with the
	 * controller's number; values are 0..1 (BEND -1..1).
	 *
	 * CC 1 is the mod wheel and CC 64 the pedal, so a CC on either number moves
	 * that outlet too -- the pedal continuously, which is what a half-pedal is.
	 * A few milliseconds of glide, because a controller arrives in steps and a
	 * step on a gain is a click.
	 */
	public setController(kind: 'ped' | 'bend' | 'mod' | 'pres' | 'cc', value: number, cc = 0) {
		const v = Number.isFinite(value) ? value : 0;
		if (kind === 'cc') {
			const n = Math.max(0, Math.min(127, Math.round(cc)));
			this.ccValues[n] = v;
			if (n === 1) this.ctrlValues.mod = v;
			if (n === 64) this.ctrlValues.ped = v;
		} else {
			this.ctrlValues[kind] = v;
		}
		// Nothing sounding, nothing to move -- and no reason to wake a context.
		if (!this.ctrlSources.size || this.renderCtx) return;
		const ctx = this.audioCtx();
		if (!ctx) return;
		for (const s of this.ctrlSources) {
			const now = this.controllerValue(s.port, s.cc);
			try {
				s.node.offset.cancelScheduledValues(ctx.currentTime);
				s.node.offset.setTargetAtTime(now, ctx.currentTime, 0.004);
			} catch {
				this.ctrlSources.delete(s);
			}
		}
	}

	public setSustainPedal(down: boolean) {
		this.setController('ped', down ? 1 : 0);
		if (this.isSustainPedalDown !== down) {
			this.isSustainPedalDown = down;
			this.onSustainListeners.forEach((fn) => fn(down));
		}
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

		/* `audioCtx()`, not `soundEngine.init()` directly: the latter always
       hands back the live context, so a release during an offline render
       scheduled its ramp against wall-clock time on a context nothing was
       rendering from -- which is also why the audit bench has never been
       able to call this. `audioCtx()` already prefers `renderCtx` while one
       is set, the same way `chokeVoice` and `stopVoice` read `now`. */
		const ctx = this.audioCtx();
		if (!ctx) return;

		const now = ctx.currentTime;
		voice.releasedAt = now;
		const { gain, filter, ampRel, vcfRel, baseCutoff, osc1, osc2, noise, lfo, extras, advGraphOut, advGraphOuts } =
			voice;

		/* The key is up: close every gate this note opened, so each ENV starts its
		   release and a held TUBE starts to fall now rather than at a guessed
		   length (see `holdGate`). A timed note released early is cut short the
		   same way; one released after its gates already closed changes nothing. */
		/* Never before the gates rose: a live key raises them a few ms after
		   its build (`deferredGates`), and a tap shorter than that would cancel
		   the rise along with everything after it, and never sound. */
		const closeAt = Math.max(now, (voice.gatesRise ?? voice.startTime) + 0.002);
		for (const g of voice.gates ?? []) {
			g.cancelScheduledValues(closeAt);
			g.setValueAtTime(0, closeAt);
		}
		try {
			gain.gain.cancelScheduledValues(now);
			gain.gain.setValueAtTime(gain.gain.value, now);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.02, ampRel));

			filter.frequency.cancelScheduledValues(now);
			filter.frequency.setValueAtTime(filter.frequency.value, now);
			filter.frequency.exponentialRampToValueAtTime(baseCutoff, now + Math.max(0.02, vcfRel));

			const track = voice.trackId !== undefined ? this.playable(this.tracks[voice.trackId]) : undefined;
			/* Same gap the timed-note path closes: a resonator's ring-out is not
         `ampRel`/`vcfRel`, both of which are the classic voice's own release
         and stop shaping the ADV graph the moment its oscillator does. Without
         this, `extras.stop` fired at `uncappedStopTime` and a STRING released
         by REL was cut off within a tenth of a second of the key coming up,
         however long its DECY said -- audible only once the click that used
         to hide it (a raw `.stop()` with no ramp) was fixed, not caused by it. */
			const rackTail = track ? this.rackTailSeconds(track) : 0;
			const uncappedStopTime = now + Math.max(ampRel, vcfRel, rackTail) + 0.05;
			/* FOLLOW measures from the moment the key comes up here, not from the
         note's start -- releaseVoice fires on a continuous hold, which has
         no other clock for "how long the tail rings" to be measured from.

         TIME and STEP are the opposite: both name a fixed length that starts
         counting the moment the OUT itself starts making sound, which is
         `voice.startTime` (+ that OUT's own WAIT `delay`), never `now`. A
         WAIT'd OUT set to TIME=1s is a *level signal, delayed*, exactly as
         much when the key comes up early as when it never comes up before
         the second ends -- releasing at 0.1s must not shorten it any more
         than releasing at 5s would lengthen it. Measured with the bug: a 1s
         TIME OUT behind a 200ms WAIT, released at 0.1s, went silent at 1.3s
         (`now(0.1) + durCap(1) + delay(0.2)`) instead of 1.2s
         (`t(0) + delay(0.2) + durCap(1)`) -- release time was leaking into a
         length that was supposed to answer to none of it.

         `advGraphDurCap` (the whole-voice tightest cap, still used for the
         one-OUT common case below) stays; what changed is that a graph with
         more than one OUT no longer shares this single number. Each OUT in
         `advGraphOuts` gets its own fade at its own `t + delay + durCap`
         (TIME or STEP) or `uncappedStopTime + delay` (FOLLOW). */
			const durCap = track ? this.advGraphDurCap(track) : undefined;
			const stopTime = durCap !== undefined ? voice.startTime + durCap : uncappedStopTime;
			/* Same reasoning as the note-on ramp this mirrors: a patch with its
         own envelope is already at or near zero by `stopTime`, and a patch
         with none has nothing else standing between its oscillator and a
         raw `.stop()`. Per OUT where there is more than one, for the same
         reason the timed-note path fades each OUT's own gain rather than
         the merged sink: one shared fade took every OUT down at whichever
         OUT's own deadline came first. */
			let latestOutStop = stopTime;
			/* A WAIT-delayed OUT's own oscillator used to be stopped here too, at
         the same shared `stopTime` every other `extras` source was -- the
         fade above was correctly delayed by the OUT's own `delay`, but the
         sound it was fading had already been cut off by a `.stop()` call
         that never heard of that delay. A 200ms WAIT ahead of a FOLLOW OUT
         measured silence at exactly `stopTime`, the *un*-delayed release
         moment, instead of `stopTime + delay` -- audible as the delayed
         branch simply not sounding at all once the key came up before its
         own 200ms had elapsed.

         `sourceStop` below answers each source by which OUT(s) actually own
         it -- `advGraphOuts`' own `sources`, the same ancestry walk the fade
         loop already trusts -- rather than assuming every `extras` member
         answers to the one shared clock. A source two OUTs both draw from
         takes the later of the two, so neither OUT's own cleanup cuts a
         source the other still needs; a source no tracked OUT claims (a
         rack-chain extra, or a graph with no OUT module at all) keeps
         answering to `stopTime` exactly as before. */
			const sourceStop = new Map<AudioScheduledSourceNode, number>();
			if (advGraphOuts && advGraphOuts.size) {
				for (const { delay, durCap: outDurCap, gain: og, sources: outSources } of advGraphOuts.values()) {
					/* An ADV graph is the whole voice and answers to none of racks
             1-7 -- `chainOut` is reassigned to the graph's own sink the
             moment a graph builds, so `gainNode`/`gain.gain`'s own release
             ramp, scheduled above, drives a node the signal path no longer
             passes through at all. Every OUT's own fade has to happen on
             `og.gain`, the per-OUT gain actually wired into that sink --
             there is no upstream envelope already doing this job to defer
             to, FOLLOW included.

             TIME/STEP: a fixed length from this OUT's own start
             (`voice.startTime + delay`), the same reasoning `stopTime`
             above already applies -- release time never enters it, early
             or late.

             FOLLOW: anchored at `now + max(ampRel, rackTail)`, not
             `now + ampRel` alone and not `uncappedStopTime`'s own extra
             +0.05 buffer either. `ampRel` is the length a plain FOLLOW
             OUT with no resonator in front of it needs -- a fade held
             open past that with nothing left to ring pointlessly delays
             silence. `rackTail` is the length a graph carrying a STRING,
             TUBE or similar actually needs -- taking `ampRel` alone once
             cut a resonator's own ring short at whatever `ampRelease`
             said, however long DCAY/DECY asked for on top of it, because
             nothing here asked the graph what it was still doing.
             `uncappedStopTime`'s own extra buffer was for the *reap*
             deadline, not for how long the ear should hear something --
             a plain OSC held at full level for that whole extra gap and
             then cut in a flat 10ms, audibly nothing like `ampRelease`'s
             own shape. Measured: released at 0.6s with `ampRelease`
             0.12s and no resonator in the graph, the peak sat unmoved
             until ~0.765s, then vanished in under 15ms. The fade now
             spans `max(ampRel, rackTail)` itself, plain FOLLOW getting
             the same short release its own envelope always drew and a
             resonator keeping the tail its own module already earns. */
					const outStop =
						outDurCap !== undefined
							? voice.startTime + delay + outDurCap
							: now + Math.max(ampRel, rackTail) + delay;
					latestOutStop = Math.max(latestOutStop, outStop);
					const fadeSec =
						outDurCap !== undefined
							? Math.min(0.01, Math.max(0, outStop - now))
							: Math.max(0, outStop - now);
					og.gain.cancelScheduledValues(now);
					og.gain.setValueAtTime(og.gain.value, now);
					og.gain.setValueAtTime(og.gain.value, Math.max(now, outStop - fadeSec));
					og.gain.linearRampToValueAtTime(0, Math.max(now, outStop));
					for (const src of outSources)
						sourceStop.set(src, Math.max(sourceStop.get(src) ?? outStop, outStop));
				}
			} else if (advGraphOut) {
				const fadeSec = Math.min(0.01, Math.max(0, stopTime - now));
				advGraphOut.gain.cancelScheduledValues(now);
				advGraphOut.gain.setValueAtTime(advGraphOut.gain.value, now);
				advGraphOut.gain.setValueAtTime(advGraphOut.gain.value, Math.max(now, stopTime - fadeSec));
				advGraphOut.gain.linearRampToValueAtTime(0, stopTime);
			}
			if (osc1) osc1.stop(sourceStop.get(osc1) ?? stopTime);
			if (osc2) osc2.stop(sourceStop.get(osc2) ?? stopTime);
			if (noise) noise.stop(sourceStop.get(noise) ?? stopTime);
			for (const x of extras ?? []) x.stop(sourceStop.get(x) ?? stopTime);
			if (lfo) lfo.stop(stopTime);

			/* Reaping (`detachVoice`, via `onended`) disconnects the whole voice,
         ADV graph included -- so it has to wait for the *latest* of every
         OUT's own deadline, not just the classic voice's own `stopTime`, or
         a WAIT-delayed OUT's carefully scheduled fade above is severed
         before it runs. `endSrc` is re-stopped at `latestOutStop` rather
         than wrapping `onended` in an extra `setTimeout`: `setTimeout` is
         wall-clock time, useless for lining up with an offline render that
         does not run at wall-clock speed, where `onended` (audio-clock
         accurate in every context) is the only reaper available at all. */
			const endSrc = voice.osc1 ?? voice.osc2 ?? voice.noise;
			if (endSrc && latestOutStop > stopTime) endSrc.stop(latestOutStop);
			if (endSrc) endSrc.onended = () => this.reapVoice(voiceKey);
			const cleanupMs = Math.ceil((latestOutStop - now) * 1000) + 50;
			window.setTimeout(() => this.reapVoice(voiceKey), cleanupMs);
		} catch {}

		this.fireAdvActivation(voice, ctx, now);
	}

	/**
	 * REL, at the moment the key actually comes up.
	 *
	 * Everything above this call is the racks 1-7 ramp, unchanged: it does not
	 * know or care whether the graph also has a REL outlet wired to something.
	 * This is the separate event the rewrite exists for -- a second, later
	 * activation of the same graph, built fresh rather than reusing anything
	 * THEN already started, because an oscillator that has been running since
	 * the note began cannot be rewound to sound like one just struck.
	 *
	 * `heldSec`/`gate` here is how long the key was actually down, not the
	 * estimate THEN's own activation was built against -- REL is a real
	 * runtime event and the data it publishes should be the real number, not
	 * the guess note-on made before it knew.
	 */
	private fireAdvActivation(voice: ActiveVoice, ctx: BaseAudioContext, now: number) {
		/* A timed note's REL is already scheduled for its end. Let go of after
		   that, it has fired; let go of before, the key really came up now. */
		if (voice.relAt !== undefined) {
			if (now >= voice.relAt) return;
			this.cancelScheduledRel(voice, now);
		}
		this.fireVoiceInterrupt(voice, ctx, now, 'advRelContext', 'in', 'rel', 'relSources');
	}

	/** Drop a timed note's REL that has not sounded yet: the note ended some
	    other way first, so the key-up it was built for never happens. */
	private cancelScheduledRel(voice: ActiveVoice, now: number) {
		if (voice.relAt === undefined || now >= voice.relAt) return;
		for (const src of voice.relSources ?? []) {
			try {
				src.stop(now);
			} catch {
				/* already stopped */
			}
		}
		voice.relSources = undefined;
		voice.relAt = undefined;
	}

	/**
	 * One activation of a voice's graph, fired from outside the note-on pass
	 * that built the rest of it -- REL and ON-CHOKE both, which differ only in
	 * which snapshot they read, which node type seeds the walk, and which
	 * outlet on that node it leaves by. Everything past that point is the same
	 * question: what does this event's own exec reach, build it fresh, start
	 * it, and let it clean itself up independently of the voice that carried
	 * the snapshot here.
	 */
	/**
	 * An event-fired build knows its own time, so a real-time note's collectors
	 * must not reach into it -- and it can run in the middle of one: stealing a
	 * voice to make room for a new key fires that voice's ON-CHOKE while the new
	 * key is being built. Clearing the collectors there dropped the gates the new
	 * key had queued, and it never sounded. Set aside, and put back.
	 */
	private fireVoiceInterrupt(
		voice: ActiveVoice,
		ctx: BaseAudioContext,
		now: number,
		contextKey: 'advRelContext' | 'advChokeContext',
		entryType: string,
		entryPort: string,
		sourcesKey: 'relSources' | 'chokeSources'
	) {
		const deferred = this.deferredGates;
		const collecting = this.noteGates;
		const sends = this.trackBusSends;
		this.deferredGates = null;
		this.noteGates = null;
		// A release sound can go to the track's chain too: a damper's thud in the body.
		this.trackBusSends =
			voice.trackId !== undefined ? (this.trackChains.get(ctx)?.get(voice.trackId)?.buses ?? null) : null;
		try {
			this.fireVoiceInterruptNow(voice, ctx, now, contextKey, entryType, entryPort, sourcesKey);
		} finally {
			this.deferredGates = deferred;
			this.noteGates = collecting;
			this.trackBusSends = sends;
		}
	}

	private fireVoiceInterruptNow(
		voice: ActiveVoice,
		ctx: BaseAudioContext,
		now: number,
		contextKey: 'advRelContext' | 'advChokeContext',
		entryType: string,
		entryPort: string,
		sourcesKey: 'relSources' | 'chokeSources'
	) {
		const snap = voice[contextKey];
		if (!snap) return;
		const heldSec = Math.max(0.001, now - voice.startTime);
		const built = this.buildActivation(
			ctx,
			snap.graph,
			entryPort,
			snap.params,
			snap.baseFreq,
			now,
			heldSec,
			snap.laneValues,
			snap.presetGain,
			snap.note,
			snap.trackId,
			snap.waves,
			entryType
		);
		if (!built) return;
		built.out.connect(snap.busInput);
		voice[sourcesKey] = built.sources;
		for (const src of built.sources) {
			this.ringingTails.add(src);
			try {
				src.start(built.startAt.get(src) ?? now);
			} catch {
				/* Already started, or NaN slipped through -- either way not this
				   activation's problem to recover from beyond not throwing. */
			}
		}
		/* DUR here is not a ceiling on however long this activation would
       otherwise have rung -- it *is* the ring, exactly, once it is set to
       TIME or STEP. A plain oscillator with no envelope of its own never
       fires `onended` on its own account, so REL wired straight to an OUT
       rang forever regardless of what DUR said: FOLLOW and a positive
       length read identically, because nothing here ever asked the graph.
       At FOLLOW this changes nothing, the same as every other DUR site.

       Per OUT, through `built.outs`, not the single whole-graph cap
       `durCapOf` answers: that shared one shared cap (and, with it, one
       shared fade on the merged sink) across every OUT the same way the
       timed-note and release paths once did, before a second OUT existed
       to disagree with the first about when it should stop -- see
       `buildActivation`'s own `outs` field. A WAIT sitting between REL and
       an OUT compounds the same bug this fires from without: `durCapOfNode`
       already answers `t + delay + durCap`-shaped questions through
       `outsMap`'s own `delay`, but this call site kept computing `now +
       durCap` with no `delay` folded in at all -- `now` *is* this
       activation's own `t`, since it is what every source here was started
       from, so a REL-fed OUT sitting behind a 500ms WAIT with a 1s TIME
       measured its own second from the moment REL fired rather than from
       500ms later, when WAIT actually let it out. Measured: released at
       0.4s, a 500ms-WAIT-then-1s-TIME OUT went silent at 1.4s (`now +
       durCap`) instead of 1.9s (`now + delay + durCap`). */
		let anyDurCap = false;
		let latestStop = now;
		if (built.outs.size) {
			for (const { delay, durCap: outDurCap, gain: og, sources: outSources } of built.outs.values()) {
				if (outDurCap === undefined) continue;
				anyDurCap = true;
				const stopAt = now + delay + outDurCap;
				latestStop = Math.max(latestStop, stopAt);
				const fadeSec = Math.min(0.01, Math.max(0, stopAt - now));
				og.gain.cancelScheduledValues(now);
				og.gain.setValueAtTime(og.gain.value, now);
				og.gain.setValueAtTime(og.gain.value, Math.max(now, stopAt - fadeSec));
				og.gain.linearRampToValueAtTime(0, stopAt);
				for (const src of outSources) {
					try {
						src.stop(stopAt);
					} catch {
						/* already stopped */
					}
				}
			}
		} else {
			// No OUT module at all -- the legacy "everything nothing else
			// listens to is an output" shape -- so there is no per-OUT gain
			// or delay to read; fall back to the single whole-graph cap this
			// site always used, unable to disagree with itself when there is
			// only one answer to give.
			const durCap = ModularSynth.durCapOf(snap.graph, snap.params, this.bpm);
			if (durCap !== undefined) {
				anyDurCap = true;
				const stopAt = now + durCap;
				latestStop = stopAt;
				const fadeSec = Math.min(0.01, Math.max(0, durCap));
				const outGain = (built.out as GainNode).gain;
				outGain.cancelScheduledValues(now);
				outGain.setValueAtTime(outGain.value, now);
				outGain.setValueAtTime(outGain.value, Math.max(now, stopAt - fadeSec));
				outGain.linearRampToValueAtTime(0, stopAt);
				for (const src of built.sources) {
					try {
						src.stop(stopAt);
					} catch {
						/* already stopped */
					}
				}
			}
		}
		/* Cleanup independent of the voice that fired it: `reapVoice` may run
       long before this tail finishes ringing, since these sources have
       nothing to do with the voice's `extras`. Disconnected once every
       source has ended, rather than on a timer, so a tail is never cut short
       by a guess at how long it runs. DUR aside, a source with nothing
       stopping it never reaches that point at all -- the timeout below is
       what still reclaims it. */
		/* FOLLOW: no length of its own, so it ends where it naturally rings out. */
		if (!anyDurCap) {
			anyDurCap = true;
			latestStop = now + ModularSynth.activationEnd(snap.graph, snap.params, heldSec);
			for (const src of built.sources) {
				try {
					src.stop(latestStop);
				} catch {
					/* already stopped */
				}
			}
		}
		const detach = () => {
			for (const n of [built.out, ...built.sends]) {
				try {
					n.disconnect();
				} catch {
					/* already disconnected */
				}
			}
		};
		let remaining = built.sources.length;
		if (remaining === 0) {
			detach();
			return;
		}
		for (const src of built.sources) {
			src.onended = () => {
				this.ringingTails.delete(src);
				remaining--;
				if (remaining <= 0) detach();
			};
		}
		if (anyDurCap) {
			/* From the clock as it reads now, not from `now`: a timed note's REL is
			   built at note-on for a moment still to come. */
			const cleanupMs = Math.ceil((latestStop - ctx.currentTime) * 1000) + 50;
			setTimeout(() => {
				for (const src of built.sources) this.ringingTails.delete(src);
				detach();
			}, cleanupMs);
		}
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
	private chokeVoice(voiceKey: string, ctx: BaseAudioContext, now: number, fadeSec = 0.006) {
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
			if (voice.advGraphOut) {
				const ag = voice.advGraphOut.gain;
				ag.cancelScheduledValues(now);
				ag.setValueAtTime(ag.value, now);
				ag.linearRampToValueAtTime(0, end);
			}
			if (voice.osc1) voice.osc1.stop(end);
			if (voice.osc2) voice.osc2.stop(end);
			if (voice.noise) voice.noise.stop(end);
			for (const x of voice.extras ?? []) x.stop(end);
			if (voice.lfo) voice.lfo.stop(end);
		} catch {
			/* already stopped */
		}
		this.cancelScheduledRel(voice, now);
		this.fireVoiceInterrupt(voice, ctx, now, 'advChokeContext', 'onchoke', 'then', 'chokeSources');
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
		const now = this.renderCtx?.currentTime ?? this.audioCtx()?.currentTime ?? 0;
		/* A note whose key is up is only ringing out, and goes before any that is
		   still held: a piano's tails were cut from under the chord being played
		   because the oldest voice was usually a held bass note. The pedal keeps
		   a note held -- its release has not happened yet. */
		const released = keys.filter((k) => {
			const at = this.activeVoices.get(k)?.releasedAt;
			return at !== undefined && at <= now;
		});
		const pool = released.length ? released : keys;
		let best = pool[0];
		let bestScore = Infinity;
		for (const k of pool) {
			const v = this.activeVoices.get(k);
			if (!v) continue;
			/* LOWEST: the piano roll counts down from C8, so the lowest pitch is
			   the *largest* index -- this used to take the smallest, the top note.
			   OLDEST: the earliest let go, or among held keys the earliest struck. */
			const score =
				this.voiceStealingMode === 'quietest'
					? this.voiceLevel(v)
					: this.voiceStealingMode === 'lowest'
						? -v.noteIndex
						: pool === released
							? (v.releasedAt ?? 0)
							: v.startTime;
			if (score < bestScore) {
				bestScore = score;
				best = k;
			}
		}
		return best;
	}

	/** How loud a voice is right now, from its meter; the amp envelope where there is none. */
	private voiceLevel(v: ActiveVoice): number {
		if (!v.meter) return v.gain.gain.value;
		const buf = new Float32Array(v.meter.fftSize);
		v.meter.getFloatTimeDomainData(buf);
		let sum = 0;
		for (const x of buf) sum += x * x;
		return Math.sqrt(sum / buf.length);
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
	/**
	 * Does this WHEN's test hold for this note?
	 *
	 * The test used to be a picker with three hardwired answers -- above a note,
	 * below a note, is the track busy -- which meant the only questions a patch
	 * could ask were the ones written into this method. Adding a fourth meant
	 * editing the engine.
	 *
	 * It is now a cable. CMP turns any two values into a truth and LOGIC
	 * combines them, so "above C3" is a CMP the patch can see and change, and
	 * "above C3 and hard enough" is one more card rather than a new engine
	 * branch. That is what the `bool` role was added for.
	 *
	 * BUSY stays as a knob, and is the one that could not become a cable: it
	 * asks about the engine's own state -- which voices are sounding right now
	 * -- and nothing in the graph publishes that. Every other test it used to
	 * offer is arithmetic on values ENTRY already hands out.
	 */
	private whenHolds(
		params: Record<string, number>,
		id: string,
		noteIndex: number,
		trackId: number,
		graph?: { nodes: { id: string; type: string }[]; cables: GraphCable[] },
		note?: NoteEvent
	): boolean {
		const num = (key: string, def: number) => params[`${id}.${key}`] ?? def;
		/* Is anything already sounding on this track?
		
		   Offline renders schedule every voice with explicit times and never hold
		   anything in activeVoices, so the question has no answer there. It used
		   to matter only for muting, where a false negative means one fewer
		   choke; now that execution gates *sound*, answering false would drop
		   every note behind a BUSY WHEN out of an export while the same patch
		   played live. An unanswerable test passes: a rendered patch keeps what
		   you heard. */
		if (Math.round(num('busy', 0)) === 1) {
			if (this.renderCtx) return true;
			let sounding = false;
			for (const v of this.activeVoices.values()) if (v.trackId === trackId) sounding = true;
			if (!sounding) return false;
		}
		/* The IF socket. Unwired, the branch is open -- a WHEN with nothing asked
		   of it passes execution through, which is what makes it safe to place
		   one before deciding what it should test. */
		if (!graph || !note) return true;
		const wired = graph.cables.some((c) => c.to === id && c.toPort === 'cond');
		if (!wired) return true;
		const resolver = createResolver(graph, params, note);
		return resolver.input(id, 'cond', 1) !== 0;
	}

	private noteActions(
		track: TrackData,
		noteIndex: number,
		trackId: number,
		/* What this note actually is, for the WHENs along the way.
		
		   Passed in rather than reconstructed. This used to build its own event
		   with `velocity: 1` and `pitch: noteIndex - 69` under a comment claiming
		   a CMP here "sees the same PITCH and VEL the sound does" -- and those
		   are not the same quantities: the audio path publishes semitones from
		   master tuning and the real velocity, so a CMP on VEL answered one way
		   for the choke and another for the sound. */
		noteEvent: NoteEvent
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
       a WAIT anywhere in the chain silently dropped the rest of it: the walk found
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

		/* WHEN reads through the same resolver every module does, against the
		   same event the sound is built from -- so a CMP feeding it sees the
		   PITCH and VEL the sound sees. */
		const holds = (id: string) =>
			this.whenHolds(p, id, noteIndex, trackId, graph as never, noteEvent);

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
		const ctx = this.audioCtx();
		const now = ctx?.currentTime ?? 0;
		const end = now + 0.002;
		try {
			const g = voice.gain.gain;
			g.cancelScheduledValues(now);
			g.setValueAtTime(Math.max(0.0001, g.value), now);
			g.linearRampToValueAtTime(0, end);
			if (voice.advGraphOut) {
				const ag = voice.advGraphOut.gain;
				ag.cancelScheduledValues(now);
				ag.setValueAtTime(ag.value, now);
				ag.linearRampToValueAtTime(0, end);
			}
			if (voice.osc1) voice.osc1.stop(end);
			if (voice.osc2) voice.osc2.stop(end);
			if (voice.noise) voice.noise.stop(end);
			for (const x of voice.extras ?? []) x.stop(end);
			if (voice.lfo) voice.lfo.stop(end);
		} catch {
			/* already stopped */
		}
		if (ctx) {
			this.fireVoiceInterrupt(voice, ctx, now, 'advChokeContext', 'onchoke', 'then', 'chokeSources');
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
		this.retireAllChains();
		this.trackHeldVoices.clear();
		this.sustainedVoiceKeys.clear();
		Array.from(this.activeVoices.keys()).forEach((k) => this.stopVoice(k));
		/* REL and ON-CHOKE tails outlive the voice that fired them by design,
       so stopping every voice above does not reach them -- a tail with no
       envelope of its own would otherwise keep ringing past "stop
       everything" until the page reloaded. */
		for (const src of [...this.ringingTails]) {
			try {
				src.stop();
			} catch {
				/* already stopped */
			}
		}
		this.ringingTails.clear();
	}

	/* -------------------------------------------------------------------------- */
	/*                     CLOSED-LOOP SEQUENCER ENGINE                           */
	/* -------------------------------------------------------------------------- */

	public subscribeSustain(listener: (down: boolean) => void): () => void {
		this.onSustainListeners.add(listener);
		return () => this.onSustainListeners.delete(listener);
	}

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
		// Through the setter, so anything drawing the pedal hears about it.
		this.setSustainPedal(false);
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
		// Voices build worklet nodes, and an offline context loads its own copy.
		await ensureLiveDsp(offline);

		const live = this.graphCache();
		const liveVoiceKeys = new Set(this.activeVoices.keys());
		this.renderCtx = offline;
		this.clearGraphCache();
		try {
			const ctx = offline as unknown as AudioContext;
			this.regenerateNoiseBuffer();
			this.initMasterFX(ctx);
			/* renderMaster is otherwise set with `.value =`, a bare step from 0 to
			   volume on the buffer's very first sample -- audible as a click a
			   per-voice envelope can't own, since it sits above every voice. A 1 ms
			   ramp costs nothing a listener can hear and removes the step. The
			   matching fade-out is scheduled below, right before startRendering(),
			   since only there do we know the buffer's true last frame. */
			if (this.renderMaster) {
				const vol = soundEngine.getVolume();
				this.renderMaster.gain.setValueAtTime(0, 0);
				this.renderMaster.gain.linearRampToValueAtTime(vol, 0.001);
			}
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

			/* The buffer ends wherever `frames` ends, mid-waveform more often than
			   not -- a hard truncation, heard as a click at the tail. Fading out
			   over the last few ms trades an inaudible sliver of the tail for a
			   clean stop. */
			if (this.renderMaster) {
				const fadeOutSec = Math.min(0.005, seconds / 2);
				const fadeStart = Math.max(0, seconds - fadeOutSec);
				this.renderMaster.gain.setValueAtTime(this.renderMaster.gain.value, fadeStart);
				this.renderMaster.gain.linearRampToValueAtTime(0, seconds);
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

/* An edit to the engine reloads the page rather than swapping this module in
   place. A hot swap made a second engine next to the one the page was built
   against: keys went to the new one while the tracks, the loaded patch and the
   held voices stayed with the old, and a key played after the edit was silent
   until a manual reload -- which, mid-session, reads as the synth dying. Every
   engine change lands here, since the modules it imports propagate to it. */
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
