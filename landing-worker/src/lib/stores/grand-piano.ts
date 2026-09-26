/**
 * GRAND PIANO: the built-in piano, as a patch.
 *
 * Voiced against the University of Iowa MIS Steinway recordings (mf C2/C4/C6,
 * pp and ff C4): centroid, decay, inharmonicity and the C6 spectrum. What
 * makes it a piano rather than a plucked string, in the order the signal
 * meets them:
 *
 *   the felt     a smooth force pulse, not a click -- a constant through a
 *                gain an ENV opens, pressed fast and let go slowly, shorter
 *                (so brighter) the harder the blow and longer on the heavy
 *                bass hammers; then a lowpass in absolute hertz that opens
 *                with velocity, since felt limits bandwidth the same on every
 *                key
 *   the strings  three WIREs a key, slightly detuned so they beat, struck at
 *                a point that moves toward the end in the bass; the unison's
 *                fundamental fades first (a low shelf), and a third string
 *                decays quickly for the prompt sound
 *   the case     a radiation highpass and two gentle shelves
 *   the damper   an envelope that lets go at the key's release; with the
 *                pedal down the engine holds the note, so it does not
 *   the board    one soundboard for the whole track (TSND into TRTN), which
 *                every string drives -- and the pedal, from CTRL, lets it
 *                ring longer and louder, as lifting every damper does
 *   key-up       the damper felt landing, a soft thud on REL
 *
 * Built here rather than in the preset list because it is sixty modules; the
 * list holds the name and this holds the instrument. The strings are one
 * macro placed three times and the case another, so the canvas reads as the
 * instrument and a double-click shows each part.
 */
import type { GraphCable, GraphGroup, GraphNode, RackGraph } from './graph-model';
import type { MacroDef } from './macros';
import { BODY_IRS } from '../audio/body-irs';

const F32 = 6;
const EXP = 1;
const LOG = 3;
const INV = 8;
const DRAW = 9;
const COL = 260;

/**
 * Anything that changes up the keyboard is five numbers, at A0, C2, C4, C6
 * and C8, with a straight line between each pair. Two ends and a curve
 * could not do it: the recordings want the treble's first sound gone in 40
 * ms and the middle's in seconds, and any shape joining the ends bent both.
 */
type ByKey = [number, number, number, number, number];

const VOICING = {
	/* Half a cent or so either side: two cents beat like a honky-tonk, and
	   against the recordings read as a plucked string's twang. Tighter in the
	   bass, where the beat is in the upper partials that carry the note: at
	   half a cent C2's 7th cancelled itself two seconds in. */
	detune: [1.0001, 1.0001, 1.0005, 1.0005, 1.0005] as ByKey,
	detune3: [0.9999, 0.9999, 0.9995, 0.9995, 0.9995] as ByKey,
	third: 0.6,
	/** T60 of the long strings, seconds. */
	dec: [50, 42.37, 18, 14, 0.8] as ByKey,
	/** The prompt string's decay, as a share of `dec`. */
	prompt: [0.1715, 0.272, 0.05, 0.05, 0.1552] as ByKey,
	/** And its level against the long pair. */
	promptLevel: [4, 3.276, 7, 5, 3.5] as ByKey,
	/* A little more loss in the bass's upper partials: C2's tenth to twelfth
	   are 15-30 dB under its seventh by 2 s. Not much more -- the 4th to 9th
	   carry the bass note once its lowest partials have drained, and at DAMP
	   30 they died with them. */
	damp: [6, 4, 2, 5, 2] as ByKey,
	/** Strike point, % of the string from its end. */
	pos: [5, 2.681, 8.138, 6.697, 12] as ByKey,
	/* Fitted to B of 1.5e-4 at C2, 3.1e-4 at C4 and 2.4e-3 at C6 (the
	   recordings' first four partials). Past C7 it asks for more than WIRE's
	   100 and holds there. */
	stiff: [22, 25.18, 43.5, 78.11, 129] as ByKey,
	/** The hammer's own knock, dry. */
	hamDry: [0.1, 0.15, 0.1, 0.02, 0.02] as ByKey,
	/* The hammer hitting the string and the key hitting its bed: at C6 the
	   first 30 ms peaks 10 dB over the note that follows. Low, a thud -- the
	   recordings' partials 4-12 sit 60-75 dB down through it, so the knock is
	   under the note, not a hiss between its harmonics (a 3 kHz knock filled
	   those at -30 and the treble clicked like a plectrum). Five gains'
	   worth, since one stops at 2. */
	thump: [0.1, 0.1, 0.25, 1, 1] as ByKey,
	/** Low shelf on the long pair's fundamental, dB. */
	cutLong: [-4.5, -3.697, -4.276, -1.791, -4] as ByKey,
	/** And on the prompt string's. */
	cutPrompt: [-6, -5.128, 0, 0, 0] as ByKey,
	/* The bass's low partials drain into the board: dB the long pair's first
	   three partials have lost by `drainTime`, seconds. C2 at 2 s is led by
	   its 4th to 7th partials in the recordings, the 2nd 20 dB and the 3rd 40
	   dB under them -- where a string alone keeps its lowest partials longest
	   and rings like a bass guitar. */
	drain: [-24, -20, 0, 0, 0] as ByKey,
	drainTime: 1.2,
	/** The voice's level by key: the treble's short strings are quiet. */
	key: [0.825, 0.8277, 0.9492, 1.671, 3.9] as ByKey,
	/** The hammer's contact, ms: heavier and longer in the bass. */
	exLen: [4, 3.081, 2.566, 2.343, 0.8] as ByKey,
	radiate: 120,
	/** The case's middle: where its one broad dip or lift sits, and how deep. */
	caseMidHz: 500,
	caseMidDb: -2,
	/** And the top, above 6 kHz. */
	caseHiDb: -2,
	feltSoft: 600,
	feltHard: 2500,
	board: { spaceSize: 12, spaceDecay: 12, spaceMix: 100 },
	boardLevel: 1.5,
	boardPedal: 3,
	decayPedal: 60,
	dryLevel: 0.8,
	riseBass: 0.03,
	riseTreble: 0.003,
	ampLo: 0.03,
	/* A longer blow than the felt's cutoff alone implies: at 1.1 ms the
	   attack's upper partials stood 15-25 dB over the recordings', the
	   bright pluck that made the piano a koto. */
	contactHard: 0.002,
	contactSoft: 0.004,
	damperRel: 0.3,
	relLevel: 0.05,
	/** How much of the voice goes through the measured board (IR: PNO), %. */
	pnoMix: 0,
	/** The felt's cutoff by key, as a share of what the blow asks. */
	feltKey: [1, 1, 1, 0.8, 0.8] as ByKey
};

/** One string of the unison: struck at IN, tuned, damped and stiffened from outside. */
const stringDef = (opt: PianoVoicing): MacroDef => ({
	name: 'STR',
	nodes: [
		{ id: 'in', type: 'nodept', x: 0, y: 0 },
		{ id: 'freq', type: 'nodecv', x: 0, y: 110 },
		{ id: 'dec', type: 'nodecv', x: 0, y: 200 },
		{ id: 'pos', type: 'nodecv', x: 0, y: 290 },
		{ id: 'stif', type: 'nodecv', x: 0, y: 380 },
		{ id: 'damp', type: 'nodecv', x: 0, y: 470 },
		{ id: 'w', type: 'wire', x: 240, y: 120 },
		{ id: 'out', type: 'nodept', x: 520, y: 120 }
	],
	cables: [
		{ from: 'in', fromPort: 'out', to: 'w', toPort: 'in' },
		{ from: 'freq', fromPort: 'out', to: 'w', toPort: 'pitch' },
		{ from: 'dec', fromPort: 'out', to: 'w', toPort: 'wireDecay' },
		{ from: 'pos', fromPort: 'out', to: 'w', toPort: 'wirePos' },
		{ from: 'stif', fromPort: 'out', to: 'w', toPort: 'wireStiff' },
		{ from: 'damp', fromPort: 'out', to: 'w', toPort: 'wireDamp' },
		{ from: 'w', fromPort: 'out', to: 'out', toPort: 'in' }
	],
	params: {
		'w.wireDecay': 0.8,
		'w.wireDamp': opt.damp[2],
		'w.wireStiff': 30,
		'w.wirePos': opt.pos[2]
	},
	labels: {
		in: 'IN',
		freq: 'FREQ',
		dec: 'DCAY',
		pos: 'POS',
		stif: 'STIF',
		damp: 'DAMP',
		out: 'OUT'
	}
});

/** The case: a radiation highpass, a dip in the middle, a softened top. */
const caseDef = (opt: PianoVoicing): MacroDef => ({
	name: 'CASE',
	nodes: [
		{ id: 'in', type: 'nodept', x: 0, y: 40 },
		{ id: 'low', type: 'filter', x: 160, y: 0 },
		{ id: 'mid', type: 'filter', x: 420, y: 0 },
		{ id: 'hi', type: 'filter', x: 680, y: 0 },
		{ id: 'out', type: 'nodept', x: 940, y: 40 }
	],
	cables: [
		{ from: 'in', fromPort: 'out', to: 'low', toPort: 'in' },
		{ from: 'low', fromPort: 'out', to: 'mid', toPort: 'in' },
		{ from: 'mid', fromPort: 'out', to: 'hi', toPort: 'in' },
		{ from: 'hi', fromPort: 'out', to: 'out', toPort: 'in' }
	],
	params: {
		'low.type': 1,
		'low.cutoff': opt.radiate,
		'low.q': 0.7,
		'mid.type': 6,
		'mid.cutoff': opt.caseMidHz,
		'mid.q': 0.9,
		'mid.filterGain': opt.caseMidDb,
		'hi.type': 5,
		'hi.cutoff': 6000,
		'hi.q': 0.7,
		'hi.filterGain': opt.caseHiDb
	},
	labels: { in: 'IN', out: 'OUT' }
});

export type PianoVoicing = typeof VOICING;

/**
 * The patch, from the voicing above -- or from one with some numbers changed,
 * which is how it is voiced: render, compare against the recordings, adjust.
 */
export function grandPiano(over: Partial<PianoVoicing> = {}): {
	rackGraph: RackGraph;
	graphParams: Record<string, number>;
} {
	const opt = { ...VOICING, ...over };
	const STRING = stringDef(opt);
	const CASE = caseDef(opt);
	const nodes: GraphNode[] = [];
	const cables: GraphCable[] = [];
	const params: Record<string, number> = {};
	/* Placed on a grid of columns, [column, y], as the patch reads left to right:
	   key-tracked settings, the hammer, the strings, the case, the voice's own
	   level and damper, and last the track's soundboard. */
	const node = (
		id: string,
		type: string,
		at: [number, number],
		p: Record<string, number> = {},
		macro?: string
	) => {
		nodes.push({ id, type, x: at[0] * COL, y: at[1], ...(macro ? { macro } : {}) });
		for (const [k, v] of Object.entries(p)) params[`${id}.${k}`] = v;
	};
	const wire = (from: string, fromPort: string, to: string, toPort: string) =>
		cables.push({ from, fromPort, to, toPort });
	/* Key tracking reads NOTE, the key's index, rather than PITCH: a pitch is
	   a place on a scale and only a converter may take it, so the editor would
	   not draw PITCH into a MAP. The index counts down from C8 (index = 39 -
	   pitch), so each range is given reversed -- MAP reads a reversed X range
	   as it is written, and the curve lands exactly where it would over pitch. */
	const byPitch = (
		id: string,
		shape: number,
		lo: number,
		hi: number,
		at: [number, number],
		inHi = 39
	) => {
		node(id, 'map', at, { shape, inLo: 39 + 48, inHi: 39 - inHi, outLo: lo, outHi: hi });
		wire('entry', 'note', id, 'a');
	};
	/* Five anchors as a drawn curve, one point per key: DRAW interpolates
	   between its points, so 88 of them is every key exactly and a straight
	   line between the anchors. */
	const ANCHOR = [0, 15, 39, 63, 87];
	const byKey = (id: string, v: ByKey, at: [number, number]) => {
		const lo = Math.min(...v);
		const hi = Math.max(...v) === lo ? lo + 1 : Math.max(...v);
		const pts: Record<string, number> = {};
		for (let k = 0; k < 88; k++) {
			const seg = Math.min(
				3,
				ANCHOR.findIndex((_, n) => k <= ANCHOR[n + 1])
			);
			const t = (k - ANCHOR[seg]) / (ANCHOR[seg + 1] - ANCHOR[seg]);
			pts[`d${k}`] = (v[seg] + t * (v[seg + 1] - v[seg]) - lo) / (hi - lo);
		}
		node(id, 'map', at, {
			shape: DRAW,
			inLo: 87,
			inHi: 0,
			outLo: lo,
			outHi: hi,
			drawN: 88,
			...pts
		});
		wire('entry', 'note', id, 'a');
	};
	const byVel = (id: string, shape: number, lo: number, hi: number, at: [number, number]) => {
		node(id, 'map', at, { shape, inLo: 0, inHi: 1, outLo: lo, outHi: hi });
		wire('entry', 'vel', id, 'a');
	};

	node('entry', 'in', [0, 700]);

	// ── the key: pitch, the unison's detuning, decays and the strike position
	node('freq', 'tofreq', [1, 0]);
	wire('entry', 'pitch', 'freq', 'a');
	byKey('cUp', opt.detune, [1, 130]);
	node('f2', 'mul', [2, 130]);
	wire('freq', 'out', 'f2', 'a');
	wire('cUp', 'out', 'f2', 'b');
	byKey('cDn', opt.detune3, [0, 0]);
	node('f3', 'mul', [2, -40]);
	wire('freq', 'out', 'f3', 'a');
	wire('cDn', 'out', 'f3', 'b');
	byKey('mDec', opt.dec, [1, 260]);
	/* The prompt string's share of the decay, by key: the treble's first
	   sound falls away in tens of milliseconds -- C6 drops 15 dB in the first
	   40 -- where the bass's takes seconds. */
	byKey('mPrompt', opt.prompt, [1, 500]);
	node('dec2', 'mul', [2, 400]);
	wire('mDec', 'out', 'dec2', 'a');
	wire('mPrompt', 'out', 'dec2', 'b');
	node('cThird', 'const', [0, 130], { kind: F32, value: opt.third });
	node('dec3', 'mul', [2, 270]);
	wire('mDec', 'out', 'dec3', 'a');
	wire('cThird', 'out', 'dec3', 'b');
	// Where the hammer meets the string: nearer the end in the bass, so its notch sits high.
	byKey('mPos', opt.pos, [2, 620]);
	// High partials die sooner up the keyboard: a string's loss grows with its frequency.
	byKey('mDamp', opt.damp, [2, 760]);
	byKey('mStiff', opt.stiff, [1, 640]);

	// ── the hammer: harder and brighter with velocity, heavier and longer in the bass
	byKey('mExLen', opt.exLen, [1, 1560]);
	node('ham', 'excite', [2, 1760], { exLength: 2, hardness: 20, exTone: 900 });
	wire('mExLen', 'out', 'ham', 'exLength');
	byVel('mContact', INV, opt.contactHard, opt.contactSoft, [1, 900]);
	byPitch('mHeavy', INV, 0.15, 0.6, [1, 1140]);
	/* ...but relative to its long period a bass string is struck briefly, which
	   is where the low end's bright partials come from: shortened below C4. */
	byPitch('mBassBlow', INV, 1, 0.55, [0, 1140], -9);
	node('heavy', 'mul', [2, 820]);
	wire('mHeavy', 'out', 'heavy', 'a');
	wire('mBassBlow', 'out', 'heavy', 'b');
	node('contact', 'mul', [2, 960]);
	wire('mContact', 'out', 'contact', 'a');
	wire('heavy', 'out', 'contact', 'b');
	node('envH', 'env', [3, 1080], { envA: 0.001, envD: 0.001, envS: 0, envR: 0.001, envCurve: 0 });
	/* Felt is pressed fast and lets go slowly: a symmetric triangle has exact
	   spectral zeros (C4 lost its 5th and 10th partials), an asymmetric one
	   does not. */
	node('cRelease', 'const', [2, 1120], { kind: F32, value: 2.2 });
	node('contactD', 'mul', [3, 920]);
	wire('contact', 'out', 'contactD', 'a');
	wire('cRelease', 'out', 'contactD', 'b');
	wire('contact', 'out', 'envH', 'envA');
	wire('contactD', 'out', 'envH', 'envD');
	node('one', 'const', [1, 1400], { kind: F32, value: 1 });
	node('dc', 'tosig', [2, 1400]);
	wire('one', 'out', 'dc', 'level');
	node('felt', 'gain', [4, 1180], { level: 0 });
	wire('dc', 'out', 'felt', 'in');
	wire('envH', 'out', 'felt', 'level');
	// Felt limits the blow's bandwidth in hertz, the same on every key; a harder blow opens it.
	byVel('mFelt', EXP, opt.feltSoft, opt.feltHard, [4, 1400]);
	/* Two poles twice: a soft blow's spectrum falls steeply, which is most of
	   why pp is dark -- the second partial 25 dB down at C4, where one filter
	   left it 6 dB down and pp sounded like mf played quietly. */
	node('feltLp', 'filter', [5, 1180], { type: 0, cutoff: 1400, q: 0.5 });
	node('feltLp2', 'filter', [5, 1300], { type: 0, cutoff: 1400, q: 0.5 });
	wire('felt', 'out', 'feltLp', 'in');
	wire('feltLp', 'out', 'feltLp2', 'in');
	byKey('mFeltKey', opt.feltKey, [4, 1560]);
	node('feltCut', 'mul', [5, 1440]);
	wire('mFelt', 'out', 'feltCut', 'a');
	wire('mFeltKey', 'out', 'feltCut', 'b');
	wire('feltCut', 'out', 'feltLp', 'cutoff');
	wire('feltCut', 'out', 'feltLp2', 'cutoff');
	// The knock of the hammer itself, heard over the short treble strings more than the bass.
	byKey('mDry', opt.hamDry, [2, 1900]);
	node('gDry', 'gain', [3, 1760], { level: 0 });
	wire('ham', 'out', 'gDry', 'in');
	wire('mDry', 'out', 'gDry', 'level');
	/* Noise under a 35 ms fall, not a click: the knock is the key and the
	   frame ringing for a few tens of milliseconds -- a 2 ms burst was over
	   before it counted. */
	node('thk', 'noise', [2, 2050]);
	node('thkE', 'env', [2, 2200], { envA: 0.0005, envD: 0.035, envS: 0, envR: 0.01, envCurve: 1 });
	node('thkV', 'gain', [3, 1950], { level: 0 });
	node('thkF', 'filter', [3, 2050], { type: 0, cutoff: 500, q: 0.6 });
	node('gThk0', 'gain', [4, 2050], { level: 2 });
	node('gThk1', 'gain', [4, 2180], { level: 2 });
	node('gThk2', 'gain', [4, 2310], { level: 2 });
	node('gThk3', 'gain', [4, 2440], { level: 2 });
	byKey('mThk', opt.thump, [4, 2200]);
	node('gThk', 'gain', [5, 2050], { level: 0 });
	wire('thk', 'out', 'thkV', 'in');
	wire('thkE', 'out', 'thkV', 'level');
	wire('thkV', 'out', 'thkF', 'in');
	wire('thkF', 'out', 'gThk0', 'in');
	wire('gThk0', 'out', 'gThk1', 'in');
	wire('gThk1', 'out', 'gThk2', 'in');
	wire('gThk2', 'out', 'gThk3', 'in');
	wire('gThk3', 'out', 'gThk', 'in');
	wire('mThk', 'out', 'gThk', 'level');

	// ── the strings: one definition, three strings
	for (const [id, f, d, y] of [
		['s1', 'freq', 'mDec', 0],
		['s3', 'f3', 'dec3', 240],
		['s2', 'f2', 'dec2', 480]
	] as const) {
		node(id, 'macro', [6, y], {}, 'string');
		wire('feltLp2', 'out', id, 'in');
		wire('mDamp', 'out', id, 'damp');
		wire(f, 'out', id, 'freq');
		wire(d, 'out', id, 'dec');
		wire('mPos', 'out', id, 'pos');
		wire('mStiff', 'out', id, 'stif');
	}
	/* The unison's fundamental fades first, so the two long strings pass a low
	   shelf keyed to the note; the prompt string decays quickly and is lifted. */
	node('cShelf', 'const', [7, -120], { kind: F32, value: 1.5 });
	node('fShelf', 'mul', [8, -120]);
	wire('freq', 'out', 'fShelf', 'a');
	wire('cShelf', 'out', 'fShelf', 'b');
	byKey('mCutLong', opt.cutLong, [7, 700]);
	byKey('mCutPrompt', opt.cutPrompt, [7, 940]);
	node('sumLong', 'sum', [8, 60]);
	wire('s1', 'out', 'sumLong', 'in');
	wire('s3', 'out', 'sumLong', 'in');
	node('shLong', 'filter', [9, 40], { type: 4, cutoff: 400, q: 0.7, filterGain: -10 });
	wire('sumLong', 'out', 'shLong', 'in');
	wire('fShelf', 'out', 'shLong', 'cutoff');
	wire('mCutLong', 'out', 'shLong', 'filterGain');
	node('shPrompt', 'filter', [9, 380], { type: 4, cutoff: 400, q: 0.7, filterGain: 0 });
	wire('s2', 'out', 'shPrompt', 'in');
	wire('fShelf', 'out', 'shPrompt', 'cutoff');
	wire('mCutPrompt', 'out', 'shPrompt', 'filterGain');
	/* Lifted by 3.5, past the one GAIN's reach of 2, so it takes two. */
	node('gPrompt0', 'gain', [10, 280], { level: 2 });
	byKey('mPromptLvl', opt.promptLevel.map((v) => v / 2) as ByKey, [9, 560]);
	node('gPrompt', 'gain', [10, 380], { level: 0 });
	wire('mPromptLvl', 'out', 'gPrompt', 'level');
	wire('shPrompt', 'out', 'gPrompt0', 'in');
	wire('gPrompt0', 'out', 'gPrompt', 'in');
	node('sum', 'sum', [11, 420]);
	/* The drain: a low shelf over the first three partials of all three
	   strings, deepening as an envelope falls -- 0 dB at the strike, `drain`
	   once it has. */
	node('envDr', 'env', [9, -300], {
		envA: 0.001,
		envD: opt.drainTime,
		envS: 0,
		envR: opt.drainTime,
		envCurve: 0
	});
	node('mDrEnv', 'map', [10, -300], { shape: DRAW, inLo: 0, inHi: 1, outLo: 1, outHi: 0 });
	wire('envDr', 'out', 'mDrEnv', 'a');
	byKey('mDrain', opt.drain, [9, -440]);
	node('drainDb', 'mul', [11, -360]);
	wire('mDrEnv', 'out', 'drainDb', 'a');
	wire('mDrain', 'out', 'drainDb', 'b');
	node('cDrain', 'const', [9, -180], { kind: F32, value: 4.5 });
	node('fDrain', 'mul', [10, -180]);
	wire('freq', 'out', 'fDrain', 'a');
	wire('cDrain', 'out', 'fDrain', 'b');
	node('sumStr', 'sum', [11, 200]);
	wire('shLong', 'out', 'sumStr', 'in');
	wire('gPrompt', 'out', 'sumStr', 'in');
	node('shDrain', 'filter', [12, 200], { type: 4, cutoff: 400, q: 0.7, filterGain: 0 });
	wire('sumStr', 'out', 'shDrain', 'in');
	wire('fDrain', 'out', 'shDrain', 'cutoff');
	wire('drainDb', 'out', 'shDrain', 'filterGain');
	for (const s of ['shDrain', 'gDry', 'gThk']) wire(s, 'out', 'sum', 'in');

	// ── the case, and the voice's own level
	node('case', 'macro', [12, 420], {}, 'case');
	wire('sum', 'out', 'case', 'in');
	/* The board, measured: the Iowa Steinway's response, every mf key
	   pooled (IR: PNO). What the case's three filters could only suggest. */
	node('pno', 'ir', [12, 560], { irBody: BODY_IRS.findIndex((b) => b.label === 'PNO'), irMix: opt.pnoMix });
	wire('case', 'out', 'pno', 'in');
	node('gDryV', 'gain', [13, 420], { level: opt.dryLevel });
	wire('pno', 'out', 'gDryV', 'in');
	byVel('mAmp', EXP, opt.ampLo, 1, [13, 160]);
	node('vVel', 'gain', [14, 420], { level: 1 });
	wire('gDryV', 'out', 'vVel', 'in');
	wire('mAmp', 'out', 'vVel', 'level');
	// The treble's short strings and a felt that cannot reach their fundamentals: made up here.
	byKey('mKey', opt.key, [14, 160]);
	node('vKey', 'gain', [15, 420], { level: 1 });
	wire('vVel', 'out', 'vKey', 'in');
	wire('mKey', 'out', 'vKey', 'level');

	// ── the damper: it lets go at the key's release
	node('envD', 'env', [15, 100], {
		envA: 0.001,
		envD: 0.001,
		envS: 100,
		envR: opt.damperRel,
		envCurve: 0
	});
	byPitch('mRise', LOG, opt.riseBass, opt.riseTreble, [14, -140]);
	wire('mRise', 'out', 'envD', 'envA');
	node('vDmp', 'gain', [16, 420], { level: 0 });
	wire('vKey', 'out', 'vDmp', 'in');
	wire('envD', 'out', 'vDmp', 'level');
	byPitch('mPan', INV, 0.35, -0.35, [16, 160]);
	node('pan', 'pan', [17, 420], { panPos: 0 });
	wire('vDmp', 'out', 'pan', 'in');
	wire('mPan', 'out', 'pan', 'panPos');
	node('output', 'out', [18, 420]);
	wire('pan', 'out', 'output', 'in');
	wire('entry', 'then', 'output', 'exec');

	// ── key-up: the damper felt landing
	node('ham2', 'excite', [16, 760], { exLength: 30, hardness: 5, exTone: 700 });
	node('gRel', 'gain', [17, 760], { level: opt.relLevel });
	wire('ham2', 'out', 'gRel', 'in');
	node('outRel', 'out', [18, 760]);
	wire('gRel', 'out', 'outRel', 'in');
	wire('entry', 'rel', 'outRel', 'exec');

	// ── the soundboard, one for the track: every string drives it after its damper
	node('toBoard', 'tsend', [17, 1080], { bus: 0 });
	wire('vDmp', 'out', 'toBoard', 'in');
	wire('entry', 'then', 'toBoard', 'exec');
	node('fromStr', 'trtn', [18, 1080], { bus: 0 });
	node('board', 'space', [19, 1080], opt.board);
	wire('fromStr', 'out', 'board', 'in');
	// The pedal lifts every damper: the whole instrument rings longer and louder.
	node('hands', 'ctrl', [18, 1260]);
	node('mPedDec', 'map', [19, 1300], {
		shape: INV,
		inLo: 0,
		inHi: 1,
		outLo: opt.decayPedal,
		outHi: opt.board.spaceDecay
	});
	wire('hands', 'ped', 'mPedDec', 'a');
	wire('mPedDec', 'out', 'board', 'spaceDecay');
	node('mPedLvl', 'map', [20, 1300], {
		shape: INV,
		inLo: 0,
		inHi: 1,
		outLo: opt.boardPedal,
		outHi: opt.boardLevel
	});
	wire('hands', 'ped', 'mPedLvl', 'a');
	node('gBoard', 'gain', [20, 1080], { level: 0 });
	wire('board', 'out', 'gBoard', 'in');
	wire('mPedLvl', 'out', 'gBoard', 'level');
	node('outBoard', 'out', [21, 1080]);
	wire('gBoard', 'out', 'outBoard', 'in');
	wire('entry', 'then', 'outBoard', 'exec');

	const box = (id: string, label: string, members: string[], color: string): GraphGroup => {
		const own = nodes.filter((n) => members.includes(n.id));
		const x = Math.min(...own.map((n) => n.x)) - 20;
		const y = Math.min(...own.map((n) => n.y)) - 40;
		return {
			id,
			label,
			x,
			y,
			w: Math.max(...own.map((n) => n.x)) + 280 - x,
			h: Math.max(...own.map((n) => n.y)) + 240 - y,
			color,
			members
		};
	};
	const groups = [
		box(
			'g-hammer',
			'HAMMER',
			[
				'mExLen',
				'ham',
				'mContact',
				'mHeavy',
				'mBassBlow',
				'heavy',
				'contact',
				'envH',
				'cRelease',
				'contactD',
				'one',
				'dc',
				'felt',
				'mFelt',
				'feltLp',
				'feltLp2',
				'mDry',
				'gDry',
				'thk',
				'thkE',
				'thkV',
				'thkF',
				'gThk0',
				'gThk1',
				'gThk2',
				'gThk3',
				'mThk',
				'gThk'
			],
			'#d19a66'
		),
		box(
			'g-strings',
			'STRINGS',
			[
				's1',
				's2',
				's3',
				'cShelf',
				'fShelf',
				'mCutLong',
				'mCutPrompt',
				'sumLong',
				'shLong',
				'envDr',
				'mDrEnv',
				'mDrain',
				'drainDb',
				'cDrain',
				'fDrain',
				'sumStr',
				'shDrain',
				'shPrompt',
				'gPrompt0',
				'mPromptLvl',
				'gPrompt'
			],
			'#61afef'
		),
		box(
			'g-board',
			'SOUNDBOARD (TRACK)',
			['toBoard', 'fromStr', 'board', 'hands', 'mPedDec', 'mPedLvl', 'gBoard', 'outBoard'],
			'#98c379'
		)
	];

	return {
		rackGraph: { nodes, cables, groups, macros: { string: STRING, case: CASE } },
		graphParams: params
	};
}
