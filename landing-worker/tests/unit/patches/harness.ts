/**
 * Play a whole patch and look at what got built.
 *
 * The unit tests elsewhere ask about one module at a time, which is what finds
 * a socket that does nothing or a knob bound to the wrong param. It is not what
 * finds the bugs a *patch* has: those come from two modules disagreeing about a
 * cable between them, and neither one is wrong on its own.
 *
 * The flute patch is the case that argued for this. Every module in it behaved
 * exactly as its own tests said, and the patch still could not reach silence,
 * because a signal landing on GAIN's level summed with a knob that nothing had
 * told to get out of the way. One module's correct behaviour, another module's
 * correct behaviour, and a wrong sound.
 *
 * So: give it a graph, get back what the engine made of it.
 */
import { modularSynth } from '../../../src/lib/synth';
import { FakeCtx, FakeParam, type FakeNode } from '../stubs/audio-context';

export interface PatchGraph {
	nodes: { id: string; type: string; x?: number; y?: number }[];
	cables: { from: string; fromPort: string; to: string; toPort: string }[];
}

export interface PatchSpec {
	graph: PatchGraph;
	params?: Record<string, number>;
	waves?: Record<string, string>;
	/** Which key, 0-based within the track's own range. */
	note?: number;
	velocity?: number;
}

export interface BuiltPatch {
	ctx: FakeCtx;
	/** Every node the voice created, in creation order. */
	nodes: FakeNode[];
	/** Gains whose param has something connected to it: the modulated levels. */
	modulated: { value: number; sources: number }[];
	/** Frequencies of every oscillator built, in creation order. */
	oscFreqs: number[];
	/** How many waveshapers the patch built -- MAP and SHAPE each make one. */
	shapers: number;
	/** Did anything reach the output at all? */
	sounds: boolean;
}

const S = modularSynth as unknown as {
	renderCtx: unknown;
	masterFXCtx: unknown;
	delayNode: unknown;
	noiseBuffer: unknown;
	tracks: Record<string, unknown>[];
	activeVoices: Map<string, unknown>;
	triggerTrackVoice(...a: unknown[]): unknown;
};

/**
 * Build one note of a patch against a recording context.
 *
 * Goes through `triggerTrackVoice`, the same entry a played key uses, rather
 * than through `buildGraphNode` directly: the migration, the execution walk and
 * the mod-cable pass are all part of what a patch does, and a harness that
 * skipped them would test a graph nobody plays.
 */
export function playPatch(spec: PatchSpec): BuiltPatch {
	const ctx = new FakeCtx();
	S.renderCtx = ctx;
	S.masterFXCtx = null;
	S.delayNode = null;
	S.noiseBuffer = ctx.createBuffer(1, 1024, 48000);
	S.activeVoices.clear();
	const track = S.tracks[0];
	const saved = JSON.parse(JSON.stringify(track));
	try {
		track.muted = false;
		track.advanced = true;
		track.rackGraph = spec.graph;
		track.graphParams = spec.params ?? {};
		track.graphWaves = spec.waves ?? {};
		S.triggerTrackVoice(0, spec.note ?? 40, 0, 0, 0.4, spec.velocity ?? 100, spec.velocity ?? 100);

		const nodes = ctx.nodes as unknown as FakeNode[];
		const gainOf = (n: FakeNode) => (n as unknown as { gain?: FakeParam }).gain;
		return {
			ctx,
			nodes,
			modulated: nodes
				.filter((n) => gainOf(n) instanceof FakeParam && gainOf(n)!.sources.length > 0)
				.map((n) => ({ value: gainOf(n)!.value, sources: gainOf(n)!.sources.length })),
			oscFreqs: nodes
				.filter((n) => n.kind === 'osc')
				.map((n) => (n as unknown as { frequency?: FakeParam }).frequency?.value ?? 0),
			shapers: nodes.filter((n) => n.kind === 'shaper').length,
			sounds: nodes.some((n) => n.outgoing.some((e) => e.to === ctx.destination))
		};
	} finally {
		Object.assign(track, saved);
		S.renderCtx = null;
	}
}

/**
 * What a named node's own gain ended up holding.
 *
 * Node ids do not survive into the audio graph -- Web Audio has no idea what a
 * GAIN card is -- so this builds the patch twice, once with the knob at a
 * distinctive value, and finds the gain that moved. Slower than reading an id,
 * and the only way to ask the question at all.
 */
export function knobValueOf(spec: PatchSpec, nodeId: string, key: string): number | null {
	const MARK = 0.123456;
	const base = playPatch(spec);
	const marked = playPatch({
		...spec,
		params: { ...(spec.params ?? {}), [`${nodeId}.${key}`]: MARK }
	});
	const gainsOf = (b: BuiltPatch) =>
		b.nodes.map((n) => (n as unknown as { gain?: FakeParam }).gain?.value);
	const a = gainsOf(base);
	const m = gainsOf(marked);
	for (let i = 0; i < m.length; i++) {
		if (m[i] === MARK) return a[i] ?? null;
	}
	/* No gain took the mark, which means the knob is not reaching a gain at all
	   -- it is claimed by a cable, or bound to some other kind of param. Null
	   rather than a number, so a test says which. */
	return null;
}
