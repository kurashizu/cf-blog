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

const F32 = 6;
const EXP = 1;
const EXP2 = 2;
const LOG = 3;
const INV = 8;
const COL = 260;

const opt = {
	detune: 1.0011,
	detune3: 0.9985,
	third: 0.6,
	decBass: 50,
	decTreble: 2,
	prompt: 0.2,
	stiffBass: 20,
	stiffTreble: 90,
	damp: 2,
	pos: 8,
	cutLongBass: -12,
	cutLongTreble: -4,
	cutPromptBass: -6,
	cutPromptTreble: 0,
	radiate: 120,
	feltSoft: 700,
	feltHard: 4000,
	board: { spaceSize: 12, spaceDecay: 12, spaceMix: 100 },
	boardLevel: 1.5,
	boardPedal: 3,
	decayPedal: 60,
	dryLevel: 0.8,
	riseBass: 0.03,
	riseTreble: 0.003,
	ampLo: 0.03,
	keyBass: 0.6,
	hamDry: 0.25,
	promptLevel: 3.5,
	contactHard: 0.0011,
	contactSoft: 0.004,
	damperRel: 0.3,
	relLevel: 0.05
};

/** One string of the unison: struck at IN, tuned, damped and stiffened from outside. */
const STRING: MacroDef = {
	name: 'STR',
	nodes: [
		{ id: 'in', type: 'nodept', x: 0, y: 0 },
		{ id: 'freq', type: 'nodecv', x: 0, y: 110 },
		{ id: 'dec', type: 'nodecv', x: 0, y: 200 },
		{ id: 'pos', type: 'nodecv', x: 0, y: 290 },
		{ id: 'stif', type: 'nodecv', x: 0, y: 380 },
		{ id: 'w', type: 'wire', x: 240, y: 120 },
		{ id: 'out', type: 'nodept', x: 520, y: 120 }
	],
	cables: [
		{ from: 'in', fromPort: 'out', to: 'w', toPort: 'in' },
		{ from: 'freq', fromPort: 'out', to: 'w', toPort: 'pitch' },
		{ from: 'dec', fromPort: 'out', to: 'w', toPort: 'wireDecay' },
		{ from: 'pos', fromPort: 'out', to: 'w', toPort: 'wirePos' },
		{ from: 'stif', fromPort: 'out', to: 'w', toPort: 'wireStiff' },
		{ from: 'w', fromPort: 'out', to: 'out', toPort: 'in' }
	],
	params: { 'w.wireDecay': 0.8, 'w.wireDamp': opt.damp, 'w.wireStiff': 30, 'w.wirePos': opt.pos },
	labels: { in: 'IN', freq: 'FREQ', dec: 'DCAY', pos: 'POS', stif: 'STIF', out: 'OUT' }
};

/** The case: a radiation highpass, a dip in the middle, a softened top. */
const CASE: MacroDef = {
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
		'mid.cutoff': 500,
		'mid.q': 0.9,
		'mid.filterGain': -2,
		'hi.type': 5,
		'hi.cutoff': 6000,
		'hi.q': 0.7,
		'hi.filterGain': -2
	},
	labels: { in: 'IN', out: 'OUT' }
};

export function grandPiano(): { rackGraph: RackGraph; graphParams: Record<string, number> } {
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
	const byVel = (id: string, shape: number, lo: number, hi: number, at: [number, number]) => {
		node(id, 'map', at, { shape, inLo: 0, inHi: 1, outLo: lo, outHi: hi });
		wire('entry', 'vel', id, 'a');
	};

	node('entry', 'in', [0, 700]);

	// ── the key: pitch, the unison's detuning, decays and the strike position
	node('freq', 'tofreq', [1, 0]);
	wire('entry', 'pitch', 'freq', 'a');
	node('cUp', 'const', [1, 130], { kind: F32, value: opt.detune });
	node('f2', 'mul', [2, 130]);
	wire('freq', 'out', 'f2', 'a');
	wire('cUp', 'out', 'f2', 'b');
	node('cDn', 'const', [0, 0], { kind: F32, value: opt.detune3 });
	node('f3', 'mul', [2, -40]);
	wire('freq', 'out', 'f3', 'a');
	wire('cDn', 'out', 'f3', 'b');
	byPitch('mDec', LOG, opt.decBass, opt.decTreble, [1, 260]);
	node('cPrompt', 'const', [1, 500], { kind: F32, value: opt.prompt });
	node('dec2', 'mul', [2, 400]);
	wire('mDec', 'out', 'dec2', 'a');
	wire('cPrompt', 'out', 'dec2', 'b');
	node('cThird', 'const', [0, 130], { kind: F32, value: opt.third });
	node('dec3', 'mul', [2, 270]);
	wire('mDec', 'out', 'dec3', 'a');
	wire('cThird', 'out', 'dec3', 'b');
	// Where the hammer meets the string: nearer the end in the bass, so its notch sits high.
	byPitch('mPos', INV, 12, 5, [2, 620]);
	byPitch('mStiff', INV, opt.stiffTreble, opt.stiffBass, [1, 640]);

	// ── the hammer: harder and brighter with velocity, heavier and longer in the bass
	byPitch('mExLen', INV, 0.8, 4, [1, 1560]);
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
	node('feltLp', 'filter', [5, 1180], { type: 0, cutoff: 1400, q: 0.5 });
	wire('felt', 'out', 'feltLp', 'in');
	wire('mFelt', 'out', 'feltLp', 'cutoff');
	node('gDry', 'gain', [3, 1760], { level: opt.hamDry });
	wire('ham', 'out', 'gDry', 'in');

	// ── the strings: one definition, three strings
	for (const [id, f, d, y] of [
		['s1', 'freq', 'mDec', 0],
		['s3', 'f3', 'dec3', 240],
		['s2', 'f2', 'dec2', 480]
	] as const) {
		node(id, 'macro', [6, y], {}, 'string');
		wire('feltLp', 'out', id, 'in');
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
	byPitch('mCutLong', INV, opt.cutLongTreble, opt.cutLongBass, [7, 700]);
	byPitch('mCutPrompt', INV, opt.cutPromptTreble, opt.cutPromptBass, [7, 940], -21);
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
	node('gPrompt', 'gain', [10, 380], { level: opt.promptLevel / 2 });
	wire('shPrompt', 'out', 'gPrompt0', 'in');
	wire('gPrompt0', 'out', 'gPrompt', 'in');
	node('sum', 'sum', [11, 420]);
	for (const s of ['shLong', 'gPrompt', 'gDry']) wire(s, 'out', 'sum', 'in');

	// ── the case, and the voice's own level
	node('case', 'macro', [12, 420], {}, 'case');
	wire('sum', 'out', 'case', 'in');
	node('gDryV', 'gain', [13, 420], { level: opt.dryLevel });
	wire('case', 'out', 'gDryV', 'in');
	byVel('mAmp', EXP, opt.ampLo, 1, [13, 160]);
	node('vVel', 'gain', [14, 420], { level: 1 });
	wire('gDryV', 'out', 'vVel', 'in');
	wire('mAmp', 'out', 'vVel', 'level');
	// The treble's short strings and a felt that cannot reach their fundamentals: made up here.
	byPitch('mKey', EXP2, opt.keyBass, 3.9, [14, 160]);
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
				'gDry'
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
				'shPrompt',
				'gPrompt0',
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
