import type { TrackData } from '../synth';

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
}

/** The grid the synth runs on now: 24 steps per beat. */
export const STEPS_PER_BEAT = 24;

/**
 * Bring a patch saved on the old 1/8-beat grid onto the 1/24-beat one.
 *
 * Each step becomes three, so a note keeps its length in time rather than in
 * steps. Accents expand with the note they belong to and leave the two new
 * steps empty -- an accent is a property of the strike, not of the duration.
 */
export function migratePatch(data: SynthPatchFile): SynthPatchFile {
	if (data.stepsPerBeat === STEPS_PER_BEAT) return data;
	return {
		...data,
		totalSteps: data.totalSteps ? data.totalSteps * 3 : data.totalSteps,
		tracks: (data.tracks ?? []).map((t) => ({
			...t,
			grid: t.grid ? t.grid.flatMap((cell) => [[...cell], [...cell], [...cell]]) : t.grid,
			accents: t.accents
				? (t.accents as number[]).flatMap((a) => [Number(a) || 0, 0, 0])
				: t.accents
		})),
		stepsPerBeat: STEPS_PER_BEAT
	};
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
	return {
		eqOn: false,
		eqGains: [0, 0, 0, 0, 0, 0],
		percussion: false,
		keyTimbres: {},
		duckSource: -1,
		duckKeys: [],
		duckDepth: 0,
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
