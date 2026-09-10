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
	value = 0;
	/** Scheduled automation, in the order it was written. */
	events: [kind: string, value: number, time: number][] = [];
	/** Nodes connected to this param, which is what modulation *is*. */
	sources: FakeNode[] = [];
	constructor(
		public owner: FakeNode,
		public name: string
	) {}
	setValueAtTime(v: number, t: number) {
		this.events.push(['set', v, t]);
		return this;
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
	frequency = new FakeParam(this, 'frequency');
	detune = new FakeParam(this, 'detune');
	setPeriodicWave() {}
}
class Gain extends FakeNode {
	gain = new FakeParam(this, 'gain');
}
class Biquad extends FakeNode {
	type = 'lowpass';
	frequency = new FakeParam(this, 'frequency');
	Q = new FakeParam(this, 'Q');
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
	threshold = new FakeParam(this, 'threshold');
	ratio = new FakeParam(this, 'ratio');
	attack = new FakeParam(this, 'attack');
	release = new FakeParam(this, 'release');
	knee = new FakeParam(this, 'knee');
	reduction = 0;
}
class BufSrc extends FakeNode {
	buffer: unknown = null;
	loop = false;
	playbackRate = new FakeParam(this, 'playbackRate');
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
	createChannelMerger(n = 2) {
		return new Merger('merger', this, n);
	}
	createPeriodicWave() {
		return {};
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
