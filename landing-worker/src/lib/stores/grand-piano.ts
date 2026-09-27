/**
 * GRAND PIANO: the built-in piano, as a patch.
 *
 * Voiced against the University of Iowa MIS Steinway recordings (mf C2/C4/C6,
 * pp and ff C4): centroid, decay, inharmonicity and the C6 spectrum. What
 * makes it a piano rather than a plucked string, in the order the signal
 * meets them:
 *
 *   the felt     a smooth force pulse, not a click: a step (a constant turned
 *                into sound) through a critically damped bandpass is a pulse
 *                that rises and lets go over the contact time, shorter (so
 *                brighter) the harder the blow
 *                and longer on the heavy bass hammers; then two lowpasses in
 *                absolute hertz that open with velocity, since felt limits
 *                bandwidth the same on every key
 *   the knock    the same pulse ringing the key and frame, a low resonance
 *                for a few tens of milliseconds under the note
 *   the strings  two WIREs a key, slightly detuned so they beat: a long one
 *                whose fundamental is shelved down, and a prompt one that
 *                decays quickly for the first sound -- the two-stage decay of
 *                a unison, from two strings rather than three
 *   the damper   an envelope that lets go at the key's release; with the
 *                pedal down the engine holds the note, so it does not
 *   the board    one for the whole track (TSND into TRTN), which every string
 *                drives after its damper: the case's filters and the measured
 *                Steinway body (IR: PNO), and a SPACE that the pedal, from
 *                CTRL, lets ring longer and louder, as lifting every damper
 *                does
 *
 * Built here rather than in the preset list because every key-tracked number
 * is a drawn curve over the 88 keys; the list holds the name and this holds
 * the instrument.
 *
 * The budget (docs/node-graph.md, "The built-in patches"). This patch once
 * built 72 nodes and 10 worklets a note -- three WIREs, a case and an IR per
 * key, an EXCITE for the hammer and another for the key-up thud, an ENV each
 * for the felt, the knock and the bass drain -- and twelve held notes of it
 * underran the audio thread until the page went silent. The sound was never
 * in those: the felt is a step through a bandpass (no envelope), the knock is
 * that pulse through one resonant filter (no noise, no envelope), and the
 * board is one per instrument, so the case and the IR moved to the track
 * chain and are built once. A note is now two WIREs and the damper's ENV.
 */
import type { GraphCable, GraphNode, RackGraph } from './graph-model';
import { layoutStages } from './graph-layout';
import { BODY_IRS } from '../audio/body-irs';

const F32 = 6;
const EXP = 1;
const LOG = 3;
const INV = 8;
const DRAW = 9;
const COL = 300;
/* Rows are written 140 apart and drawn 1.9 times that: a drawn MAP's card
   is taller than 140, and at 1.0 each column's MAPs stacked on each other. */
const ROW = 1.9;

/**
 * Anything that changes up the keyboard is five numbers, at A0, C2, C4, C6
 * and C8, with a straight line between each pair. Two ends and a curve
 * could not do it: the recordings want the treble's first sound gone in 40
 * ms and the middle's in seconds, and any shape joining the ends bent both.
 */
type ByKey = [number, number, number, number, number];
/** The keys those five sit on, counted from A0. */
const ANCHOR = [0, 15, 39, 63, 87];
/* The voice's level wants a number every half octave: A0, then C1 to C8 by
   tritones. An octave apart could not hold it -- the keys between (Gb2, Gb3,
   Gb4) came out 4 to 12 dB over the recording's balance, and one number an
   octave can only move them with their neighbours. */
type ByTritone = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
const KEY_ANCHOR = [0, 3, 9, 15, 21, 27, 33, 39, 45, 51, 57, 63, 69, 75, 81, 87];

const VOICING = {
	/* The prompt string against the long one: under a cent (0.9 at C4).
	   The band tables pulled it to three and a half, which beats like a
	   honky-tonk and which the ear heard as a plucked string's twang: 0.39 on
	   the AudioSet piano label there, 0.49 at 1.3 cents, 0.52 here. Tighter
	   in the bass, where the beat is in the upper partials that carry the
	   note. */
	detune: [1.0001, 1.0001, 1.0005, 1.0005, 1.0005] as ByKey,
	/* T60 of the long string, seconds. The treble's two (C6, C8) and the
	   treble anchors of the prompt string, loss, blow and knock below were
	   refitted on tools/ear/keyboard.py's table (tune_keyboard.py): at 7.2
	   and 0.41 s the tone was gone by 0.3 s and each high key was its strike
	   alone -- C7 41 dB of crest over its tone where the Steinway has 23, C8
	   78 against 35 -- so a chord's top notes came out as clicks. */
	dec: [25.7, 21.8, 9.3, 22.13, 5.209] as ByKey,
	/* The prompt string's decay, as a share of `dec`: the treble's first
	   sound falls away in tens of milliseconds -- C6 drops 15 dB in the first
	   40 -- where the bass's takes seconds. */
	prompt: [0.408, 0.648, 0.119, 0.1599, 0.6617] as ByKey,
	/** And its level against the long one. */
	promptLevel: [2.06, 1.68, 3.59, 0.5311, 4.585] as ByKey,
	/* More loss in the upper partials at both ends: C2's tenth to twelfth are
	   15-30 dB under its seventh by 2 s, and the short treble strings go dull
	   fast. Next to none at C2 itself -- the 4th to 9th carry the bass note
	   once its lowest partials have drained. */
	damp: [19.6, 0.21, 2.39, 39.77, 0.631] as ByKey,
	/** Strike point, % of the string from its end. */
	pos: [5, 2.681, 8.138, 6.697, 12] as ByKey,
	/* Fitted to B of 1.5e-4 at C2, 3.1e-4 at C4 and 2.4e-3 at C6 (the
	   recordings' first four partials). Past C7 it asks for more than WIRE's
	   100 and holds there. */
	stiff: [22, 25.18, 43.5, 78.11, 129] as ByKey,
	/* Low shelf on the long string's fundamental, dB. A few dB: the prompt
	   string, dying young, already takes the bass's lowest partials away
	   early, which the old three-string patch needed an envelope-swept shelf
	   (and -19 dB here) to do. */
	cutLong: [-4.19, -2.3, -1.35, -0.16, -4] as ByKey,
	/* The felt's contact, ms: the pulse's peak time. Fitted key by key, not
	   drawn as "heavier in the bass": the recordings want C4 struck softly
	   long (its 2nd and 3rd partials lead, not the 5th to 8th) and the
	   treble short, and A0's hammer is the longest of all. */
	blow: [5.77, 1.55, 3.63, 2.041, 0.0775] as ByKey,
	/** A soft blow stays on the string this much longer. */
	blowSoft: 1.3,
	/* Felt's bandwidth from pp to ff, in hertz. Wide apart: a soft blow's
	   spectrum falls steeply, which is most of why pp is dark. */
	feltSoft: 353,
	feltHard: 4411,
	/** The felt's cutoff by key, as a share of what the blow asks. */
	feltKey: [1, 1, 1, 0.8, 0.8] as ByKey,
	/* The knock: the key hitting its bed and the frame answering, low and
	   broad (Q under 1, so a thud rather than a tone), loudest around C6. At
	   C8 it was the loudest thing in the note; the keyboard table took it to
	   a sixteenth of that, where the strike stands over the tone as the
	   recording's does. */
	knockHz: 267,
	knockQ: 0.72,
	knock: [0.36, 0.36, 0.72, 2.318, 0.2275] as ByKey,
	/* The voice's level by key, A0 then C1 to C8 by tritones: the Steinway's
	   own balance, measured (tools/ear/keyboard.py -- each key's tone at 0.3 to
	   0.7 s against C4's, mf and ff, the recording's smoothed over neighbours
	   so one odd take is not chased). The band tables normalise every note to
	   itself and could not see this: the treble had come out 10 to 30 dB
	   under the recording, and the middle's Gb keys 4 to 12 over. */
	key: [0.418, 0.443, 0.493, 0.771, 0.427, 0.498, 0.355, 0.765, 0.573, 1.713, 2.635, 6.429, 4.775, 14.256, 33.69, 79.621] as ByTritone,
	ampLo: 0.03,
	/** The whole instrument's level: `key` says how loud each key is against the others. */
	level: 0.1,
	riseBass: 0.03,
	riseTreble: 0.003,
	damperRel: 0.3,
	/* The board, as the track hears it: the measured body nine times over
	   the dry string (the note's own OUT is the dry), and the case's broad
	   strokes on the way in -- a dip around 860 Hz, and a radiation highpass
	   low enough to leave A0 its body. */
	body: 9,
	radiate: 46,
	caseMidHz: 861,
	caseMidDb: -10.4,
	caseHiDb: -0.09,
	board: { spaceSize: 12, spaceDecay: 12, spaceMix: 100 },
	boardLevel: 1.06,
	boardPedal: 3,
	decayPedal: 60
};

export type PianoVoicing = typeof VOICING;

/**
 * The patch, from the voicing above -- or from one with some numbers changed,
 * which is how it is voiced: render, compare against the recordings, adjust.
 */
export function grandPiano(over: Partial<PianoVoicing> = {}): {
	rackGraph: RackGraph;
	graphParams: Record<string, number>;
	graphLabels: Record<string, string>;
} {
	const opt = { ...VOICING, ...over };
	const nodes: GraphNode[] = [];
	const cables: GraphCable[] = [];
	const params: Record<string, number> = {};
	const labels: Record<string, string> = {};
	/* Placed on a grid of columns, [column, y], as the patch reads left to right:
	   the key's numbers, the hammer, the strings, the damper, and last the
	   track's board. */
	const node = (id: string, type: string, at: [number, number], p: Record<string, number> = {}) => {
		nodes.push({ id, type, x: at[0] * COL, y: at[1] * ROW });
		for (const [k, v] of Object.entries(p)) params[`${id}.${k}`] = v;
	};
	const cable = (from: string, fromPort: string, to: string, toPort: string) =>
		cables.push({ from, fromPort, to, toPort });
	/* Every MAP, MUL and CONST here reads only ENTRY's numbers, so it is
	   worked out once when the note starts and builds nothing: a per-note
	   number, not a node on the audio thread. */
	/* Key tracking reads NOTE, the key's index, rather than PITCH: a pitch is
	   a place on a scale and only a converter may take it, so the editor would
	   not draw PITCH into a MAP. The index counts down from C8 (index = 39 -
	   pitch), so each range is given reversed -- MAP reads a reversed X range
	   as it is written, and the curve lands exactly where it would over pitch. */
	const byPitch = (id: string, shape: number, lo: number, hi: number, at: [number, number]) => {
		node(id, 'map', at, { shape, inLo: 39 + 48, inHi: 0, outLo: lo, outHi: hi });
		cable('entry', 'note', id, 'a');
	};
	/* Any curve over the keys, drawn: DRAW interpolates between its points,
	   so 88 of them is every key exactly. */
	const byCurve = (id: string, f: (key: number) => number, at: [number, number]) => {
		const ys = Array.from({ length: 88 }, (_, key) => f(key));
		const lo = Math.min(...ys);
		const hi = Math.max(...ys) === lo ? lo + 1 : Math.max(...ys);
		const pts: Record<string, number> = {};
		ys.forEach((y, key) => (pts[`d${key}`] = (y - lo) / (hi - lo)));
		node(id, 'map', at, { shape: DRAW, inLo: 87, inHi: 0, outLo: lo, outHi: hi, drawN: 88, ...pts });
		cable('entry', 'note', id, 'a');
	};
	/** A straight line between each pair of anchors. */
	const lerp = (v: number[], anchor: number[], key: number) => {
		const seg = Math.min(
			anchor.length - 2,
			anchor.findIndex((_, n) => key <= anchor[n + 1])
		);
		const t = (key - anchor[seg]) / (anchor[seg + 1] - anchor[seg]);
		return v[seg] + t * (v[seg + 1] - v[seg]);
	};
	const byKey = (id: string, v: ByKey, at: [number, number]) =>
		byCurve(id, (key) => lerp(v, ANCHOR, key), at);
	const byVel = (id: string, shape: number, lo: number, hi: number, at: [number, number]) => {
		node(id, 'map', at, { shape, inLo: 0, inHi: 1, outLo: lo, outHi: hi });
		cable('entry', 'vel', id, 'a');
	};
	const mul = (id: string, a: string, b: string, at: [number, number]) => {
		node(id, 'mul', at);
		cable(a, 'out', id, 'a');
		cable(b, 'out', id, 'b');
	};
	const k = (id: string, value: number, at: [number, number]) =>
		node(id, 'const', at, { kind: F32, value });

	node('entry', 'in', [0, 700]);

	// ── the hammer: a step through a bandpass is the felt's pulse
	/* A step through a bandpass at Q 0.5 (critically damped) is t e^(-t/tau):
	   a force that rises smoothly, peaks at tau and lets go over a few more,
	   with no ringing -- the felt's pulse, flat to 1 / (2 pi tau) and falling
	   12 dB an octave above it. Through a highpass instead the step kept its
	   instant rise, a 1/f tail, and every key came out an octave too bright. */
	const blowHz = (key: number) => lerp(opt.blow.map((ms) => 1000 / (2 * Math.PI * ms)), ANCHOR, key);
	byCurve('mBlow', blowHz, [1, 300]);
	byVel('mSoft', LOG, 1 / opt.blowSoft, 1, [1, 440]);
	mul('blowHz', 'mBlow', 'mSoft', [2, 300]);
	/* Above its corner the pulse's partials go as 1/tau, so a short blow is a
	   loud one as well as a bright one: F5, between C4's long blow and C6's
	   short one, came out 12 dB over its neighbours. Scaled by tau, the blow
	   says only how bright a key is, and `key` alone how loud. */
	byCurve('mBlowLvl', (key) => 1000 / (2 * Math.PI * blowHz(key)), [1, 160]);
	byVel('mAmp', EXP, opt.ampLo, 1, [1, 0]);
	// In decibels between the anchors: a level halfway is heard halfway in dB, not in amplitude.
	byCurve('mKey', (key) => 10 ** (lerp(opt.key.map((g) => 20 * Math.log10(g)), KEY_ANCHOR, key) / 20), [2, 160]);
	mul('ampKey', 'mAmp', 'mKey', [2, 0]);
	mul('ampBlow', 'ampKey', 'mBlowLvl', [3, 0]);
	k('cLevel', opt.level, [3, 160]);
	mul('strike', 'ampBlow', 'cLevel', [4, 160]);
	node('dc', 'tosig', [4, 0]);
	cable('strike', 'out', 'dc', 'level');
	node('blow', 'filter', [5, 0], { type: 2, cutoff: 400, q: 0.5 });
	cable('dc', 'out', 'blow', 'in');
	cable('blowHz', 'out', 'blow', 'cutoff');
	// Felt limits the blow's bandwidth in hertz, the same on every key; a harder blow opens it.
	byVel('mFelt', EXP, opt.feltSoft, opt.feltHard, [1, 580]);
	byKey('mFeltKey', opt.feltKey, [1, 720]);
	mul('feltHz', 'mFelt', 'mFeltKey', [2, 580]);
	/* Two poles twice: a soft blow's spectrum falls steeply, which is most of
	   why pp is dark -- the second partial 25 dB down at C4, where one filter
	   left it 6 dB down and pp sounded like mf played quietly. */
	node('felt', 'filter', [6, 0], { type: 0, cutoff: 1400, q: 0.5 });
	node('felt2', 'filter', [7, 0], { type: 0, cutoff: 1400, q: 0.5 });
	cable('blow', 'out', 'felt', 'in');
	cable('felt', 'out', 'felt2', 'in');
	cable('feltHz', 'out', 'felt', 'cutoff');
	cable('feltHz', 'out', 'felt2', 'cutoff');
	/* Each key's hammer lands a little apart from its neighbours'.

	   The pulse is the same shape on neighbouring keys, so a chord's strings
	   all began with one coincident pulse and the strike summed coherently:
	   a C-E-G stood 3.4 dB further over its tone than C alone, where the
	   Steinway's three notes, summed exactly in time, stand 0.7 (mf) to 2.6
	   (ff) further -- each of its hammers and actions arrives a little
	   differently. So each key waits its own 0 to 2.5 ms before the strings
	   hear it, spread by the golden ratio so that neighbours differ most. */
	byCurve('mSpread', (key) => ((key * 0.6180339887) % 1) * 0.0025, [7, 460]);
	node('spread', 'delay', [8, 460], { delayTime: 0.001 });
	cable('felt2', 'out', 'spread', 'in');
	cable('mSpread', 'out', 'spread', 'delayTime');
	// The knock: the same pulse ringing the key and the frame, under the note.
	node('knock', 'filter', [6, 240], { type: 2, cutoff: opt.knockHz, q: opt.knockQ });
	cable('blow', 'out', 'knock', 'in');
	byKey('mKnock', opt.knock, [5, 380]);
	node('gKnock', 'gain', [7, 240], { level: 0 });
	cable('knock', 'out', 'gKnock', 'in');
	cable('mKnock', 'out', 'gKnock', 'level');

	// ── the strings: a long one and a prompt one, detuned so they beat
	node('freq', 'tofreq', [8, -420]);
	cable('entry', 'pitch', 'freq', 'a');
	byKey('mDetune', opt.detune, [8, -280]);
	mul('f2', 'freq', 'mDetune', [9, -280]);
	byKey('mDec', opt.dec, [8, -140]);
	byKey('mPrompt', opt.prompt, [8, 0]);
	mul('dec2', 'mDec', 'mPrompt', [9, -140]);
	// Where the hammer meets the string: nearer the end in the bass, so its notch sits high.
	byKey('mPos', opt.pos, [8, 560]);
	// High partials die sooner up the keyboard: a string's loss grows with its frequency.
	byKey('mDamp', opt.damp, [8, 700]);
	byKey('mStiff', opt.stiff, [8, 840]);
	for (const [id, f, d, y] of [
		['long', 'freq', 'mDec', 200],
		['prompt', 'f2', 'dec2', 420]
	] as const) {
		node(id, 'wire', [10, y], { wireDecay: 4, wireDamp: opt.damp[2], wireStiff: 30, wirePos: opt.pos[2] });
		cable('spread', 'out', id, 'in');
		cable(f, 'out', id, 'pitch');
		cable(d, 'out', id, 'wireDecay');
		cable('mPos', 'out', id, 'wirePos');
		cable('mDamp', 'out', id, 'wireDamp');
		cable('mStiff', 'out', id, 'wireStiff');
	}
	/* The long string's fundamental fades into the board first, so it passes a
	   low shelf keyed to the note; the prompt string keeps its own and dies
	   young, so the bass's lowest partials go early, as the recordings' do. */
	k('cShelf', 1.5, [9, 0]);
	mul('fShelf', 'freq', 'cShelf', [9, 140]);
	byKey('mCutLong', opt.cutLong, [10, 0]);
	node('shLong', 'filter', [11, 200], { type: 4, cutoff: 400, q: 0.7, filterGain: -10 });
	cable('long', 'out', 'shLong', 'in');
	cable('fShelf', 'out', 'shLong', 'cutoff');
	cable('mCutLong', 'out', 'shLong', 'filterGain');
	byKey('mPromptLvl', opt.promptLevel, [10, 600]);
	node('gPrompt', 'gain', [11, 420], { level: 0 });
	cable('prompt', 'out', 'gPrompt', 'in');
	cable('mPromptLvl', 'out', 'gPrompt', 'level');

	// ── the damper: it lets go at the key's release
	node('envD', 'env', [13, 0], { envA: 0.001, envD: 0.001, envS: 100, envR: opt.damperRel, envCurve: 0 });
	byPitch('mRise', LOG, opt.riseBass, opt.riseTreble, [12, 0]);
	cable('mRise', 'out', 'envD', 'envA');
	node('vDmp', 'gain', [14, 300], { level: 0 });
	for (const s of ['shLong', 'gPrompt', 'gKnock']) cable(s, 'out', 'vDmp', 'in');
	cable('envD', 'out', 'vDmp', 'level');
	byPitch('mPan', INV, 0.35, -0.35, [14, 0]);
	node('pan', 'pan', [15, 300], { panPos: 0 });
	cable('vDmp', 'out', 'pan', 'in');
	cable('mPan', 'out', 'pan', 'panPos');
	node('output', 'out', [16, 300]);
	cable('pan', 'out', 'output', 'in');
	cable('entry', 'then', 'output', 'exec');

	// ── the board, one for the track: every string drives it after its damper
	node('toBoard', 'tsend', [16, 560], { bus: 0 });
	cable('pan', 'out', 'toBoard', 'in');
	cable('entry', 'then', 'toBoard', 'exec');
	node('fromStr', 'trtn', [17, 560], { bus: 0 });
	/* The case: a radiation highpass, a dip in the middle, a softened top --
	   on the way into the body, so the dry string keeps its own edge. */
	node('radiate', 'filter', [18, 560], { type: 1, cutoff: opt.radiate, q: 0.7 });
	node('caseMid', 'filter', [19, 560], {
		type: 6,
		cutoff: opt.caseMidHz,
		q: 0.9,
		filterGain: opt.caseMidDb
	});
	node('caseHi', 'filter', [20, 560], { type: 5, cutoff: 6000, q: 0.7, filterGain: opt.caseHiDb });
	/* The body, measured: the Iowa Steinway's response, every mf key pooled
	   (IR: PNO), all wet -- the note's own OUT is the dry. */
	node('pno', 'ir', [21, 560], { irBody: BODY_IRS.findIndex((b) => b.label === 'PNO'), irMix: 100 });
	k('cBody', opt.body, [21, 400]);
	node('gBody', 'gain', [22, 560], { level: 0 });
	node('outBody', 'out', [23, 560]);
	cable('fromStr', 'out', 'radiate', 'in');
	cable('radiate', 'out', 'caseMid', 'in');
	cable('caseMid', 'out', 'caseHi', 'in');
	cable('caseHi', 'out', 'pno', 'in');
	cable('pno', 'out', 'gBody', 'in');
	cable('cBody', 'out', 'gBody', 'level');
	cable('gBody', 'out', 'outBody', 'in');
	cable('entry', 'then', 'outBody', 'exec');
	node('board', 'space', [18, 820], opt.board);
	cable('fromStr', 'out', 'board', 'in');
	// The pedal lifts every damper: the whole instrument rings longer and louder.
	node('hands', 'ctrl', [17, 1060]);
	node('mPedDec', 'map', [18, 1080], {
		shape: INV,
		inLo: 0,
		inHi: 1,
		outLo: opt.decayPedal,
		outHi: opt.board.spaceDecay
	});
	cable('hands', 'ped', 'mPedDec', 'a');
	cable('mPedDec', 'out', 'board', 'spaceDecay');
	node('mPedLvl', 'map', [19, 1080], {
		shape: INV,
		inLo: 0,
		inHi: 1,
		outLo: opt.boardPedal,
		outHi: opt.boardLevel
	});
	cable('hands', 'ped', 'mPedLvl', 'a');
	node('gBoard', 'gain', [19, 820], { level: 0 });
	cable('board', 'out', 'gBoard', 'in');
	cable('mPedLvl', 'out', 'gBoard', 'level');
	node('outBoard', 'out', [20, 820]);
	cable('gBoard', 'out', 'outBoard', 'in');
	cable('entry', 'then', 'outBoard', 'exec');

	/* The stages as boxes, each with a NOTE across its top saying what the
	   stage is: the canvas is where someone who did not write this finds out
	   how the piano works. */
	const stages: [string, string[], string][] = [];
	const notes: [string, string][] = [];
	const stage = (label: string, members: string[], color: string, note: string) => {
		stages.push([label, members, color]);
		notes.push([note, members[0]]);
	};
	stage(
		'HAMMER',
		['mBlowLvl', 'mAmp', 'mKey', 'ampKey', 'ampBlow', 'cLevel', 'strike', 'dc', 'mBlow', 'mSoft', 'blowHz', 'blow', 'mFelt', 'mFeltKey', 'feltHz', 'felt', 'felt2', 'mSpread', 'spread', 'knock', 'mKnock', 'gKnock'],
		'#d19a66',
		'The felt: a step through a bandpass is a pulse over the contact time, softened by two lowpasses that open with velocity. The same pulse rings the frame (BP): the knock.'
	);
	stage(
		'STRINGS',
		['freq', 'mDetune', 'f2', 'mDec', 'mPrompt', 'dec2', 'mPos', 'mDamp', 'mStiff', 'long', 'prompt', 'cShelf', 'fShelf', 'mCutLong', 'shLong', 'mPromptLvl', 'gPrompt'],
		'#61afef',
		'Two strings a key, a fraction of a cent apart so they beat: a long one with its fundamental shelved down, and a prompt one that dies young -- the two-stage decay of a unison.'
	);
	stage(
		'DAMPER',
		['envD', 'mRise', 'vDmp', 'mPan', 'pan', 'output', 'toBoard'],
		'#c678dd',
		'The damper lets go at key-up (the pedal holds the note). Low keys sit left, high keys right, as the player hears them.'
	);
	stage(
		'BOARD (TRACK)',
		['fromStr', 'radiate', 'caseMid', 'caseHi', 'pno', 'cBody', 'gBody', 'outBody', 'board', 'hands', 'mPedDec', 'mPedLvl', 'gBoard', 'outBoard'],
		'#98c379',
		'One board for the whole track (TSND > TRTN), built once: the case, the measured Steinway body (IR: PNO), and a SPACE the pedal opens.'
	);

	const { groups, notes: noteNodes, labels: noteLabels } = layoutStages(nodes, stages, notes);
	nodes.push(...noteNodes);
	Object.assign(labels, noteLabels);

	return {
		rackGraph: { nodes, cables, groups },
		graphParams: params,
		graphLabels: labels
	};
}
