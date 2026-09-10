import { BLANK_TRACK_TIMBRE, STEPS_PER_BEAT, type TrackData } from '../synth';

/**
 * What a saved project is, as data.
 *
 * Split from synth-patch so it can be tested: that module reaches the Web Audio
 * engine and the SvelteKit runtime, and neither is needed to answer the
 * questions that actually break a saved file -- whether an older patch still
 * loads, and whether loading one leaves anything of the previous song behind.
 *
 * That second one is the reason this exists. The synth has grown fields since
 * the format was written (automation lanes, a per-preset level), and a track
 * the incoming project does not mention keeps whatever the live track had
 * unless it is explicitly cleared. Getting that wrong is silent: the song plays
 * with the last one's dynamics under it and nothing says so.
 */
export interface SynthPatchFile {
	tracks: Partial<TrackData>[];
	bpm: number;
	meter: string;
	totalSteps: number;
	/** Grid resolution the patch was saved at. Absent = legacy 8-steps-per-beat. */
	stepsPerBeat?: number;
	waves?: unknown[];
	/**
	 * What the file's numbers mean.
	 *
	 * Absent is version 0: everything saved before this field existed. The grid
	 * migration keyed off `stepsPerBeat` alone, which answers one question --
	 * how fine is the grid -- and cannot answer any of the others, so a file
	 * already on the 24-step grid was returned verbatim and none of the later
	 * changes reached it. A knob whose *meaning* changed needs to be asked
	 * about separately from one whose scale did.
	 */
	version?: number;
}

/* The grid the synth runs on now: 24 steps per beat.

   Re-exported from the engine rather than declared again. The same number was
   written in both places, and a grid resolution that disagrees between the
   format and the sequencer is a silent-corruption bug: every saved bar would
   play at the wrong speed. */
export { STEPS_PER_BEAT };

/**
 * The current patch format.
 *
 * 1 — SPACE's DECAY was inverted so the knob reads the way it is labelled, and
 *     TUBE's ODD became a two-position selector rather than a percentage.
 */
export const PATCH_VERSION = 1;

/**
 * Bring a patch saved on the old 1/8-beat grid onto the 1/24-beat one.
 *
 * Each step becomes three, so a note keeps its length in time rather than in
 * steps. Accents expand with the note they belong to and leave the two new
 * steps empty -- an accent is a property of the strike, not of the duration.
 */
export function migratePatch(data: SynthPatchFile): SynthPatchFile {
	let out = data;

	/* Grid: 1/8-beat steps to 1/24. Only from the legacy grid -- a file that
	   names any other resolution is not one this tripling describes, and
	   tripling it anyway turned a 48-step file into 144. */
	if (out.stepsPerBeat === undefined || out.stepsPerBeat === 8) {
		const stretch = <T>(xs: T[] | undefined, fill: (x: T) => T[]) => (xs ? xs.flatMap(fill) : xs);
		out = {
			...out,
			totalSteps: out.totalSteps ? out.totalSteps * 3 : out.totalSteps,
			tracks: (out.tracks ?? []).map((t) => ({
				...t,
				grid: stretch(t.grid, (cell) => [[...cell], [...cell], [...cell]]),
				accents: stretch(t.accents as number[] | undefined, (a) => [Number(a) || 0, 0, 0]),
				/* Lanes are drawn against the same grid, so they stretch with it.
				   They were left alone, so a legacy patch's velocity curve ended
				   up covering the first third of the song and the rest read the
				   lane's default. */
				noteLanes: t.noteLanes?.map((lane) => ({
					...lane,
					points: (lane.points ?? []).flatMap((v) => [v, v, v])
				}))
			})),
			stepsPerBeat: STEPS_PER_BEAT
		};
	}

	/* Version 1: two knobs whose meaning changed under files already saved.
	
	   Neither is expressible as a scale, so neither could be caught by the grid
	   check above -- which is why the version exists. */
	if ((out.version ?? 0) < 1) {
		out = {
			...out,
			tracks: (out.tracks ?? []).map((t) => {
				const gp = t.graphParams;
				if (!gp) return t;
				const next: Record<string, number> = { ...gp };
				for (const [key, value] of Object.entries(gp)) {
					const param = key.slice(key.lastIndexOf('.') + 1);
					/* DECAY ran backwards: a bigger number decayed *faster*, and
					   the knob was inverted so it reads the way it is labelled.
					   A file tuned to 90 would otherwise become a 28x longer
					   tail -- a tight room turning into a cathedral. */
					if (param === 'spaceDecay') next[key] = 100 - value;
					/* ODD was a percentage and is a two-position selector. The
					   engine reads any value past half as "odd", so the sound is
					   right either way, but the stored number and the knob the
					   card draws disagreed until the first click. */
					if (param === 'tubeOdd') next[key] = value >= 50 ? 1 : 0;
				}
				return { ...t, graphParams: next };
			})
		};
	}

	return out === data ? data : { ...out, version: PATCH_VERSION };
}

/**
 * What every track is reset to before an incoming project is applied.
 *
 * Spread *before* the saved track, so a project that predates a field gets the
 * default rather than whatever the live track was holding. Every field here is
 * one that a previous song could otherwise leak into the next: a drum kit's key
 * table, a duck routing, an EQ curve, the automation lanes, the preset's own
 * level.
 */
export function trackResetDefaults(): Partial<TrackData> {
	/* Derived from the canonical defaults, not listed by hand.
	
	   This used to name nine fields out of the sixty-odd a track carries, so a
	   patch that did not mention a field inherited whatever the *live* track
	   had: load a two-track project over a six-track song and tracks 2-5 were
	   emptied in the grid while keeping the previous song's entire voice --
	   cutoff, envelopes, LFO, and its whole ADV patch bay. The list existed
	   precisely to stop that and had fallen sixty fields behind.
	
	   A deep copy, because several of these are arrays and objects: handing out
	   the shared literal would let one track's reset edit the next one's. */
	return {
		...(JSON.parse(JSON.stringify(BLANK_TRACK_TIMBRE)) as Partial<TrackData>),
		/* Not in the timbre: these are the track's role and its parts rather than
		   its sound, so `BLANK_TRACK_TIMBRE` has no entry for them. */
		percussion: false,
		keyTimbres: {},
		noteLanes: undefined,
		presetGain: 1
	};
}

/** A track the incoming project does not mention: emptied, not left playing. */
export function blankTrack(id: number, gridLength: number): Partial<TrackData> {
	return {
		...trackResetDefaults(),
		name: `TRK ${id + 1}`,
		muted: false,
		solo: false,
		grid: Array.from({ length: gridLength }, () => []),
		accents: Array.from({ length: gridLength }, () => 0)
	};
}

/** Is this parsed JSON shaped like a project file? */
export function isPatchFile(parsed: unknown): parsed is SynthPatchFile {
	if (typeof parsed !== 'object' || parsed === null) return false;
	const p = parsed as Record<string, unknown>;
	return Array.isArray(p.tracks);
}
