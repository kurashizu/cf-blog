import { LIVE_PARAMS } from '../../../src/lib/audio/live-dsp-params';
/**
 * A recording Web Audio context.
 *
 * Every bug this file exists to catch had the same shape: a cable drawn on the
 * canvas that carried nothing. None of them threw, none changed a number any
 * pure function returned, and the suite that was supposed to cover them
 * asserted on substrings of synth.ts -- so renaming a local variable failed a
 * test and connecting the wrong node passed one. Reverting the two fixes named
 * in a commit subject left 838 tests green.
 *
 * vitest has no Web Audio. This is the smallest thing that lets a test ask the
 * questions that actually matter: what is connected to what, and what value
 * did each AudioParam end up with. It records rather than renders -- there are
 * no samples here -- which is enough for every "is it wired" question and for
 * none of the "does it sound right" ones. Those stay in the browser.
 */

/** An AudioParam that remembers what was set and what was plugged into it. */
export class FakeParam {
	/* The default matters, and it is not the same for every param. A real
	   GainNode's gain is 1, an oscillator's detune is 0, a panner's pan is 0.
	   Every FakeParam started at 0, so a gain the engine deliberately leaves
	   alone read as silence -- which is indistinguishable from the bug where a
	   gain is never set at all, and made a test asserting "this leg is open"
	   impossible to write. Each node now passes the default the spec gives. */
	value: number;
	/** Scheduled automation, in the order it was written. */
	events: [kind: string, value: number, time: number][] = [];
	/** Nodes connected to this param, which is what modulation *is*. */
	sources: FakeNode[] = [];
	constructor(
		public owner: FakeNode,
		public name: string,
		initial = 0
	) {
		this.value = initial;
	}
	setValueAtTime(v: number, t: number) {
		this.events.push(['set', v, t]);
		return this;
	}
	/**
	 * What the param would hold at the end of what has been scheduled.
	 *
	 * Deliberately not `.value`. A real AudioParam does *not* move `.value` when
	 * you schedule against it -- checked in Chrome, where `ratio.setValueAtTime(20)`
	 * on a fresh compressor leaves `ratio.value` at its default of 12. A stub
	 * that moved it would let a test pass on an assertion the browser answers
	 * differently, which is the whole failure mode this directory exists to
	 * avoid. Tests that mean the scheduled value ask for it by name.
	 */
	get scheduled(): number {
		return this.events.length ? this.events[this.events.length - 1][1] : this.value;
	}
	linearRampToValueAtTime(v: number, t: number) {
		this.events.push(['lin', v, t]);
		return this;
	}
	exponentialRampToValueAtTime(v: number, t: number) {
		this.events.push(['exp', v, t]);
		return this;
	}
	setTargetAtTime(v: number, t: number) {
		this.events.push(['target', v, t]);
		return this;
	}
	cancelScheduledValues() {
		return this;
	}
}

export class FakeNode {
	outgoing: { to: FakeNode | FakeParam; fromChannel?: number; toChannel?: number }[] = [];
	incoming: FakeNode[] = [];
	numberOfInputs = 1;
	numberOfOutputs = 1;
	channelCount = 2;
	/** When a source was started, or undefined if it never was. */
	startedAt?: number;
	constructor(
		public kind: string,
		public ctx: FakeCtx
	) {
		ctx.nodes.push(this);
	}
	/** Real nodes carry their context, and engine code reads it back off them. */
	get context(): FakeCtx {
		return this.ctx;
	}
	connect(dest: FakeNode | FakeParam, fromChannel?: number, toChannel?: number) {
		this.outgoing.push({ to: dest, fromChannel, toChannel });
		if (dest instanceof FakeParam) dest.sources.push(this);
		else dest.incoming.push(this);
		return dest;
	}
	disconnect() {
		this.outgoing = [];
	}
	start(t?: number) {
		this.startedAt = t;
	}
	stop() {}
}

class Osc extends FakeNode {
	type = 'sine';
	frequency = new FakeParam(this, 'frequency', 440);
	detune = new FakeParam(this, 'detune');
	/* The wave it was actually given, kept rather than dropped.
	
	   `setPeriodicWave` used to be a no-op, which meant a test could check that
	   an oscillator was built and never that it was built with the right
	   harmonics -- and phase lives entirely in those coefficients, so there was
	   nothing to assert against. */
	periodic: { real: Float32Array; imag: Float32Array } | null = null;
	setPeriodicWave(w: { real: Float32Array; imag: Float32Array }) {
		this.periodic = w;
	}
}
class Gain extends FakeNode {
	gain = new FakeParam(this, 'gain', 1);
}
class Biquad extends FakeNode {
	type = 'lowpass';
	frequency = new FakeParam(this, 'frequency', 350);
	Q = new FakeParam(this, 'Q', 1);
	gain = new FakeParam(this, 'gain');
	detune = new FakeParam(this, 'detune');
}
class Delay extends FakeNode {
	delayTime = new FakeParam(this, 'delayTime');
}
class ConstSrc extends FakeNode {
	offset = new FakeParam(this, 'offset');
}
class Panner extends FakeNode {
	pan = new FakeParam(this, 'pan');
}
class Comp extends FakeNode {
	threshold = new FakeParam(this, 'threshold', -24);
	ratio = new FakeParam(this, 'ratio', 12);
	attack = new FakeParam(this, 'attack', 0.003);
	release = new FakeParam(this, 'release', 0.25);
	knee = new FakeParam(this, 'knee', 30);
	reduction = 0;
}
class BufSrc extends FakeNode {
	buffer: unknown = null;
	loop = false;
	playbackRate = new FakeParam(this, 'playbackRate', 1);
}
class Shaper extends FakeNode {
	curve: Float32Array | null = null;
	oversample = 'none';
}
class Analyser extends FakeNode {
	fftSize = 2048;
	smoothingTimeConstant = 0;
	minDecibels = -100;
	maxDecibels = -30;
	get frequencyBinCount() {
		return this.fftSize / 2;
	}
	getByteTimeDomainData() {}
	getByteFrequencyData() {}
	getFloatTimeDomainData() {}
	getFloatFrequencyData() {}
}
class Convolver extends FakeNode {
	buffer: unknown = null;
	normalize = true;
}
class Splitter extends FakeNode {
	constructor(kind: string, ctx: FakeCtx, n: number) {
		super(kind, ctx);
		this.numberOfOutputs = n;
	}
}
class Merger extends FakeNode {
	constructor(kind: string, ctx: FakeCtx, n: number) {
		super(kind, ctx);
		this.numberOfInputs = n;
	}
}

/**
 * A live-DSP worklet node: its parameters are real FakeParams built from the
 * same descriptor list the processor declares, so a knob bound to one and a
 * cable patched into one are recorded like any other param. What the
 * processor would compute is not modelled -- that is the browser's job, and
 * the audio tests hear it.
 */
export class FakeWorklet extends FakeNode {
	parameters = new Map<string, FakeParam>();
	/** Every message the engine posted, e.g. `{ stop: t }`. */
	messages: unknown[] = [];
	port = { postMessage: (m: unknown) => void this.messages.push(m) };
	constructor(
		public processor: string,
		public options: { processorOptions?: Record<string, unknown> },
		ctx: FakeCtx
	) {
		super('worklet', ctx);
		this.numberOfInputs = 0;
		for (const d of LIVE_PARAMS[processor] ?? [])
			this.parameters.set(d.name, new FakeParam(this, d.name, d.defaultValue));
	}
}

export class FakeCtx {
	/** Every node made, in creation order. */
	nodes: FakeNode[] = [];
	sampleRate = 48000;
	currentTime = 0;
	destination = new FakeNode('destination', this);

	createOscillator() {
		return new Osc('osc', this);
	}
	createGain() {
		return new Gain('gain', this);
	}
	createBiquadFilter() {
		return new Biquad('biquad', this);
	}
	createDelay(_max = 1) {
		return new Delay('delay', this);
	}
	createConstantSource() {
		return new ConstSrc('const', this);
	}
	createStereoPanner() {
		return new Panner('panner', this);
	}
	createDynamicsCompressor() {
		return new Comp('comp', this);
	}
	createBufferSource() {
		return new BufSrc('bufsrc', this);
	}
	createWaveShaper() {
		return new Shaper('shaper', this);
	}
	createAnalyser() {
		return new Analyser('analyser', this);
	}
	createConvolver() {
		return new Convolver('convolver', this);
	}
	createChannelSplitter(n = 2) {
		return new Splitter('splitter', this, n);
	}
	createAudioWorkletNode(
		name: string,
		options: { processorOptions?: Record<string, unknown> } = {}
	) {
		return new FakeWorklet(name, options, this);
	}
	createChannelMerger(n = 2) {
		return new Merger('merger', this, n);
	}
	createPeriodicWave(real: Float32Array, imag: Float32Array) {
		// Handed back whole, so a test can read the harmonics the engine computed.
		return { real, imag };
	}
	createBuffer(channels: number, length: number, rate: number) {
		const data = Array.from({ length: channels }, () => new Float32Array(length));
		return {
			numberOfChannels: channels,
			length,
			sampleRate: rate,
			getChannelData: (i: number) => data[i]
		};
	}
}

/**
 * Can a signal get from `from` to `param`?
 *
 * Follows the edges rather than looking for one hop, because a modulation path
 * is usually several: ENTRY's pin into a scaling gain into the param. A cable
 * that is drawn and does nothing looks exactly like a cable that works until
 * you ask this question.
 */
export function reaches(from: FakeNode, target: FakeParam | FakeNode): boolean {
	const seen = new Set<FakeNode>();
	const queue: FakeNode[] = [from];
	while (queue.length) {
		const at = queue.shift()!;
		if (seen.has(at)) continue;
		seen.add(at);
		for (const edge of at.outgoing) {
			if (edge.to === target) return true;
			if (edge.to instanceof FakeNode) queue.push(edge.to);
		}
	}
	return false;
}
