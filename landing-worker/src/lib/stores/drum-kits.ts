/**
 * The built-in kits, as patches.
 *
 * Each drum is its own graph, designed for that drum rather than filled in
 * from a family template: the templates were why both kits sounded wrong --
 * every tom, bongo and conga was the same three modes with a different
 * number, and the 808 was not in the patch bay at all.
 *
 * 808 KIT is the drum machine's circuits: sines swept by an envelope, six
 * detuned squares for the metal, noise for the snare and the clap. JAZZ KIT
 * is acoustic: sticks striking heads that ring at a membrane's inharmonic
 * modes and drop in pitch as they settle, wires under the snare, cymbals as
 * dense metal that rings for seconds.
 *
 * Every voice ends on OUT set to TIME: a drum is struck, not held, so how long
 * the key is down does not decide how long it rings. Hats share a choke group.
 */
import type { GraphCable, GraphNode } from './graph-model';
import type { TrackData } from '../track-data';

type Params = Record<string, number>;

/* CONST's kinds: a plain number, a frequency. */
const F32 = 6;
const FRQ = 7;
/* ENV's curves. */
const EXP = 1;
/* FILTER's types. */
const LP = 0;
const HP = 1;
const BP = 2;
const PEAK = 6;
/* MAP's shapes. */
const M_EXP = 1;

/**
 * A graph under construction: nodes with their knobs, cables in the preset
 * shorthand (`from.port>to:port`), and oscillator shapes by name.
 */
class Voice {
	nodes: [string, string][] = [];
	cables: string[] = [];
	params: Params = {};
	waves: Record<string, string> = {};
	n(id: string, type: string, p: Params = {}, wave?: string): this {
		this.nodes.push([id, type]);
		for (const [k, v] of Object.entries(p)) this.params[`${id}.${k}`] = v;
		if (wave) this.waves[`${id}.wave`] = wave;
		return this;
	}
	w(...c: string[]): this {
		this.cables.push(...c);
		return this;
	}
	/** A fixed frequency into a port. */
	hz(id: string, v: number, to: string): this {
		return this.n(id, 'const', { kind: FRQ, value: v }).w(`${id}>${to}`);
	}
	/** A plain number into a port. */
	k(id: string, v: number, to: string): this {
		return this.n(id, 'const', { kind: F32, value: v }).w(`${id}>${to}`);
	}
	/** An envelope that opens a VCA: `src` through it to `to`. */
	vca(id: string, src: string, env: Params, to: string): this {
		return this.n(`${id}e`, 'env', { envCurve: EXP, envS: 0, envR: 0.02, ...env })
			.n(id, 'gain', { level: 0 })
			.w(`${src}>${id}`, `${id}e>${id}:level`, `${id}>${to}`);
	}
	/** An envelope swept from `lo` to `lo + span` Hz, into `to`. */
	sweep(id: string, lo: number, span: number, env: Params, to: string): this {
		return this.n(`${id}e`, 'env', { envA: 0, envS: 0, envR: 0.02, envCurve: EXP, ...env })
			.k(`${id}k`, span, `${id}m:b`)
			.n(`${id}m`, 'mul')
			.k(`${id}b`, lo, `${id}a:b`)
			.n(`${id}a`, 'add')
			.w(`${id}e>${id}m:a`, `${id}m>${id}a:a`, `${id}a>${to}`);
	}
	/**
	 * A low-frequency oscillator scaled to +-`amt`, out of `${id}a`: OSC at a
	 * CONST rate, across TO-CV, times a CONST -- there is no LFO module, since
	 * that is what one is.
	 */
	lfo(id: string, rate: number, amt: number, wave: string): this {
		return this.n(id, 'osc', {}, wave)
			.hz(`${id}r`, rate, `${id}:pitch`)
			.n(`${id}c`, 'tocv')
			.k(`${id}k`, amt, `${id}a:b`)
			.n(`${id}a`, 'mul')
			.w(`${id}>${id}c`, `${id}c>${id}a:a`);
	}
	/** Velocity as a level: soft is quiet, and `curve` says how steeply. */
	vel(id: string, lo: number, src: string, to: string): this {
		return this.n(`${id}m`, 'map', { shape: M_EXP, inLo: 0, inHi: 1, outLo: lo, outHi: 1 })
			.n(id, 'gain', { level: 0 })
			.w(`entry.vel>${id}m:a`, `${src}>${id}`, `${id}m>${id}:level`, `${id}>${to}`);
	}
	/**
	 * The voice as a key's sound. `ring` is how long it lasts, whatever the
	 * key does; `trim` levels it against the rest of the kit.
	 */
	done(ring: number, trim: number, group = 0): Partial<TrackData> {
		const COL = 280;
		const ROW = 124;
		const feeders = new Map<string, string[]>();
		for (const c of this.cables) {
			const [lhs, rest] = c.split('>');
			const to = rest.split(':')[0];
			feeders.set(to, [...(feeders.get(to) ?? []), lhs.split('.')[0]]);
		}
		const col = new Map<string, number>([['entry', 0]]);
		const depth = (id: string, seen = new Set<string>()): number => {
			if (col.has(id)) return col.get(id)!;
			if (seen.has(id)) return 1;
			seen.add(id);
			const ins = feeders.get(id) ?? [];
			const d = ins.length ? Math.max(...ins.map((f) => depth(f, seen))) + 1 : 1;
			col.set(id, d);
			return d;
		};
		for (const [id] of this.nodes) depth(id);
		const last = Math.max(1, ...this.nodes.map(([id]) => col.get(id) ?? 1));
		const inCol = new Map<number, string[]>();
		for (const [id] of this.nodes) {
			const c = col.get(id) ?? 1;
			inCol.set(c, [...(inCol.get(c) ?? []), id]);
		}
		const at = (id: string) => {
			const c = col.get(id) ?? 1;
			const peers = inCol.get(c)!;
			return { x: 48 + c * COL, y: 168 + (peers.indexOf(id) - (peers.length - 1) / 2) * ROW };
		};
		const nodes: GraphNode[] = [
			{ id: 'entry', type: 'in', x: 48, y: 168 },
			...this.nodes.map(([id, type]) => ({ id, type, ...at(id) })),
			{ id: 'trim', type: 'gain', x: 48 + (last + 1) * COL, y: 168 },
			{ id: 'output', type: 'out', x: 48 + (last + 2) * COL, y: 168 }
		];
		const cables: GraphCable[] = [
			...this.cables.map((c) => {
				const [lhs, rest] = c.split('>');
				const [from, fromPort] = lhs.split('.');
				const [to, toPort] = rest.split(':');
				return { from, fromPort: fromPort || 'out', to, toPort: toPort || 'in' };
			}),
			{ from: 'trim', fromPort: 'out', to: 'output', toPort: 'in' },
			{ from: 'entry', fromPort: 'then', to: 'output', toPort: 'exec' }
		];
		return {
			advanced: true,
			rackGraph: { nodes, cables },
			graphParams: {
				...this.params,
				'trim.level': trim,
				// TIME: the drum rings its own length, however long the key is down.
				'output.dur': 1,
				'output.durSec': ring
			},
			graphWaves: this.waves,
			presetGain: 1,
			ampAttack: 0.001,
			ampDecay: ring,
			ampSustain: 0,
			ampRelease: 0.02,
			muteGroup: group
		};
	}
}

/* ── 808 ─────────────────────────────────────────────────────────────────── */

/** A bridged-T kick: a sine that starts high and falls to its note, with a click. */
function kick808(base: number, drop: number, dropTime: number, decay: number, drive: number) {
	return (
		new Voice()
			.n('osc', 'osc', {}, 'sine')
			.sweep('pit', base, drop, { envD: dropTime }, 'osc:pitch')
			.vca('amp', 'osc', { envA: 0.001, envD: decay }, 'sat')
			.n('sat', 'shape', { shapeKind: 0, shapeDrive: drive })
			// The click of the trigger pulse through the circuit.
			.n('clk', 'excite', { hardness: 90, exLength: 0.6, exTone: 4000 })
			.n('clkf', 'filter', { type: HP, cutoff: 1500, q: 0.7 })
			.n('clkg', 'gain', { level: 0.25 })
			.n('mix', 'sum')
			.w('sat>mix', 'clk>clkf', 'clkf>clkg', 'clkg>mix')
			.vel('v', 0.2, 'mix', 'trim')
	);
}

/** The six squares the 808 makes all its metal from, into `to`. */
function metal808(v: Voice, to: string): Voice {
	const HZ = [205.3, 304.4, 369.6, 522.7, 540, 800];
	HZ.forEach((f, i) =>
		v.n(`sq${i}`, 'osc', {}, 'square').hz(`f${i}`, f, `sq${i}:pitch`).w(`sq${i}>${to}`)
	);
	return v.n(to, 'sum');
}

function hat808(decay: number, group: number) {
	const v = metal808(new Voice(), 'bank');
	return v
		.n('bp', 'filter', { type: BP, cutoff: 10000, q: 0.9 })
		.n('hp', 'filter', { type: HP, cutoff: 7000, q: 0.7 })
		.w('bank>bp', 'bp>hp')
		.vca('amp', 'hp', { envA: 0.001, envD: decay }, 'vv')
		.n('vv', 'sum')
		.vel('v', 0.3, 'vv', 'trim')
		.done(Math.max(0.3, decay * 3), 0.9, group);
}

function tom808(hz: number) {
	return new Voice()
		.n('osc', 'osc', {}, 'sine')
		.sweep('pit', hz, hz * 0.45, { envD: 0.12 }, 'osc:pitch')
		.vca('amp', 'osc', { envA: 0.001, envD: 0.5 }, 'mix')
		.n('nz', 'noise')
		.n('nf', 'filter', { type: LP, cutoff: 2500, q: 0.7 })
		.w('nz>nf')
		.vca('nza', 'nf', { envA: 0.001, envD: 0.05 }, 'nzg')
		.n('nzg', 'gain', { level: 0.12 })
		.w('nzg>mix')
		.n('mix', 'sum')
		.vel('v', 0.2, 'mix', 'trim')
		.done(1.6, 0.9);
}

export function kit808(): Record<number, Partial<TrackData>> {
	return {
		// C2: the long one, a note more than a thump.
		72: kick808(48, 110, 0.06, 1.1, 20).done(2.5, 1.1),
		// D2: short and hard.
		70: kick808(58, 160, 0.03, 0.35, 45).done(0.9, 1),
		// C3
		60: tom808(120),
		// C4: two tuned heads and the snappy.
		48: new Voice()
			.n('t1', 'osc', {}, 'sine')
			.hz('t1f', 185, 't1:pitch')
			.n('t2', 'osc', {}, 'sine')
			.hz('t2f', 332, 't2:pitch')
			.vca('t1a', 't1', { envA: 0.001, envD: 0.16 }, 'mix')
			.vca('t2a', 't2', { envA: 0.001, envD: 0.09 }, 'mix')
			.n('nz', 'noise')
			.n('hp', 'filter', { type: HP, cutoff: 1800, q: 0.7 })
			.n('pk', 'filter', { type: PEAK, cutoff: 5000, q: 0.8, filterGain: 4 })
			.w('nz>hp', 'hp>pk')
			.n('lp', 'filter', { type: LP, cutoff: 9000, q: 0.7 })
			.w('pk>lp')
			.vca('sn', 'lp', { envA: 0.001, envD: 0.22 }, 'sng')
			.n('sng', 'gain', { level: 0.6 })
			.w('sng>mix')
			.n('mix', 'sum')
			.vel('v', 0.2, 'mix', 'trim')
			.done(0.8, 0.9),
		// D4: three claps a hair apart, then the room's tail.
		46: new Voice()
			.n('nz', 'noise')
			.n('bp', 'filter', { type: BP, cutoff: 1150, q: 1.6 })
			.w('nz>bp')
			.vca('hit', 'bp', { envA: 0.0005, envD: 0.012 }, 'hits')
			.n('d1', 'delay', { delayTime: 0.011 })
			.n('d2', 'delay', { delayTime: 0.023 })
			.w('hit>d1', 'hit>d2', 'd1>hits', 'd2>hits')
			.n('hits', 'sum')
			.vca('tail', 'bp', { envA: 0.02, envD: 0.22 }, 'tailg')
			.n('tailg', 'gain', { level: 0.6 })
			.n('mix', 'sum')
			.w('hits>mix', 'tailg>mix')
			.n('hp', 'filter', { type: HP, cutoff: 700, q: 0.7 })
			.w('mix>hp')
			.vel('v', 0.25, 'hp', 'trim')
			.done(0.9, 2),
		// E4, F4: the same metal, choked by each other.
		44: hat808(0.045, 1),
		43: hat808(0.45, 1),
		// G4: a high ping and a low one, very short, and a crack.
		41: new Voice()
			.n('a', 'osc', {}, 'sine')
			.hz('af', 1720, 'a:pitch')
			.n('b', 'osc', {}, 'triangle')
			.hz('bf', 480, 'b:pitch')
			.n('ab', 'sum')
			.w('a>ab', 'b>ab')
			.vca('amp', 'ab', { envA: 0.0005, envD: 0.028 }, 'sat')
			.n('sat', 'shape', { shapeKind: 1, shapeDrive: 40 })
			.n('hp', 'filter', { type: HP, cutoff: 350, q: 0.7 })
			.w('sat>hp')
			.vel('v', 0.25, 'hp', 'trim')
			.done(0.3, 0.8),
		// A4: two squares, a bandpass, a quick drop then a ring.
		39: new Voice()
			.n('a', 'osc', {}, 'square')
			.hz('af', 540, 'a:pitch')
			.n('b', 'osc', {}, 'square')
			.hz('bf', 800, 'b:pitch')
			.n('ab', 'sum')
			.w('a>ab', 'b>ab')
			.n('bp', 'filter', { type: BP, cutoff: 900, q: 1.4 })
			.w('ab>bp')
			.vca('hit', 'bp', { envA: 0.0005, envD: 0.03 }, 'mix')
			.vca('ring', 'bp', { envA: 0.0005, envD: 0.28 }, 'rg')
			.n('rg', 'gain', { level: 0.4 })
			.w('rg>mix')
			.n('mix', 'sum')
			.vel('v', 0.25, 'mix', 'trim')
			.done(0.8, 0.8),
		// B4: the maracas.
		37: new Voice()
			.n('nz', 'noise')
			.n('hp', 'filter', { type: HP, cutoff: 5500, q: 0.7 })
			.w('nz>hp')
			.vca('amp', 'hp', { envA: 0.004, envD: 0.05 }, 'vv')
			.n('vv', 'sum')
			.vel('v', 0.3, 'vv', 'trim')
			.done(0.25, 0.9)
	};
}

/* ── JAZZ ────────────────────────────────────────────────────────────────── */

/* A circular membrane's first six modes, which are not a harmonic series:
   that is the difference between a drum and a note. */
const MEMBRANE = [1, 1.59, 2.14, 2.3, 2.65, 2.92];

interface Head {
	/** The head's fundamental, Hz. */
	hz: number;
	/** How long it rings: MODES Q, about q/12 s on the fundamental. */
	q: number;
	/** How far above its note a hard hit starts, as a ratio, before it settles. */
	drop?: number;
	/** The stick: 0 soft to 100 hard, contact in ms, brightness in Hz. */
	hard?: number;
	len?: number;
	tone?: number;
	/** The shell's resonance, Hz, and how much of the strike's own noise is heard. */
	shell?: number;
	slap?: number;
}

/** A struck head: the stick, six membrane modes that settle in pitch, the shell. */
function head(v: Voice, h: Head, to: string): Voice {
	const drop = h.drop ?? 1.06;
	v.n('stk', 'excite', { hardness: h.hard ?? 70, exLength: h.len ?? 2, exTone: h.tone ?? 3000 })
		// A harder hit bends the head sharper for a moment -- the pitch then settles.
		.sweep('bend', h.hz, h.hz * (drop - 1), { envD: 0.06 }, 'm1:pitch')
		.n('m1', 'modes', {
			mode1: MEMBRANE[0],
			mode2: MEMBRANE[1],
			mode3: MEMBRANE[2],
			modeQ: h.q,
			modeMix: 100
		})
		.n('m2', 'modes', {
			mode1: MEMBRANE[3],
			mode2: MEMBRANE[4],
			mode3: MEMBRANE[5],
			modeQ: Math.max(1, h.q * 0.6),
			modeMix: 100
		})
		.n('m2g', 'gain', { level: 0.45 })
		.w('stk>m1', 'stk>m2', 'benda>m2:pitch', 'm2>m2g')
		.n('body', 'filter', { type: PEAK, cutoff: h.shell ?? h.hz * 1.5, q: 1.2, filterGain: 4 })
		.n('hs', 'sum')
		.w('m1>hs', 'm2g>hs', 'hs>body')
		// The stick on the head: the strike itself, heard directly.
		.n('slf', 'filter', { type: BP, cutoff: (h.tone ?? 3000) * 0.7, q: 0.8 })
		.n('slg', 'gain', { level: h.slap ?? 0.15 })
		.w('stk>slf', 'slf>slg', 'body>' + to, 'slg>' + to);
	return v.n(to, 'sum');
}

function tom(hz: number, q = 18) {
	const v = head(
		new Voice(),
		{ hz, q, drop: 1.12, hard: 65, len: 2.5, tone: 2600, shell: hz * 1.8 },
		'mix'
	);
	return v.vel('v', 0.2, 'mix', 'trim').done(Math.min(2.5, q / 8), 0.6);
}

/**
 * Cymbal metal: six squares at inharmonic ratios -- the drum machine's trick,
 * and the right one: a plate's modes are too many and too close to count, and
 * squares beating against each other make that density -- through highpasses,
 * with a noise wash on top.
 */
function metal(v: Voice, base: number, to: string): Voice {
	const R = [1, 1.483, 1.932, 2.546, 2.63, 3.897];
	R.forEach((r, i) =>
		v
			.n(`sq${i}`, 'osc', {}, 'square')
			.hz(`f${i}`, base * r, `sq${i}:pitch`)
			.w(`sq${i}>${to}`)
	);
	return v.n(to, 'sum');
}

interface Cym {
	base: number;
	/** How long it rings, s. */
	decay: number;
	/** Highpass corner: small bright cymbals high, large dark ones low. */
	hp: number;
	/** Metal against wash, 0..1. */
	metal: number;
	/** A stick ping on top (ride), Hz and level. */
	ping?: [number, number];
	/** Trashy: driven (china). */
	drive?: number;
	group?: number;
	/** Seconds the whole voice lasts. */
	ring?: number;
}

function cymbal(c: Cym) {
	const v = metal(new Voice(), c.base, 'bank')
		.n('mhp', 'filter', { type: HP, cutoff: c.hp, q: 0.7 })
		.n('mg', 'gain', { level: c.metal * 0.35 })
		.w('bank>mhp', 'mhp>mg')
		.n('nz', 'noise')
		.n('nbp', 'filter', { type: BP, cutoff: c.hp * 1.6, q: 0.5 })
		.n('ng', 'gain', { level: 1 - c.metal * 0.6 })
		.w('nz>nbp', 'nbp>ng')
		.n('src', 'sum')
		.w('mg>src', 'ng>src');
	let into = 'src';
	if (c.drive) {
		v.n('tr', 'shape', { shapeKind: 1, shapeDrive: c.drive }).w('src>tr');
		into = 'tr';
	}
	// The stroke: a bright splash that falls away fast into the long wash.
	v.vca('hit', into, { envA: 0.0005, envD: Math.min(0.25, c.decay * 0.12) }, 'mix')
		.vca('wash', into, { envA: 0.003, envD: c.decay }, 'wg')
		.n('wg', 'gain', { level: 0.5 })
		.w('wg>mix');
	if (c.ping) {
		// The stick's tip on the bow of a ride: a pitched ping over the wash.
		v.n('pe', 'excite', { hardness: 80, exLength: 0.8, exTone: 8000 })
			.n('pm', 'modes', {
				modeHz: c.ping[0],
				mode1: 1,
				mode2: 1.53,
				mode3: 2.31,
				modeQ: 40,
				modeMix: 100
			})
			.n('pg', 'gain', { level: c.ping[1] })
			.w('pe>pm', 'pm>pg', 'pg>mix');
	}
	v.n('mix', 'sum')
		.n('air', 'filter', { type: 5, cutoff: 9000, q: 0.7, filterGain: 3 })
		.w('mix>air')
		.vel('v', 0.25, 'air', 'trim');
	return v.done(c.ring ?? c.decay * 1.2, 0.9, c.group ?? 0);
}

function hat(decay: number, chick: number) {
	const v = metal(new Voice(), 400, 'bank')
		.n('bp', 'filter', { type: BP, cutoff: 9000, q: 0.8 })
		.n('hp', 'filter', { type: HP, cutoff: 6500, q: 0.7 })
		.w('bank>bp', 'bp>hp')
		.n('nz', 'noise')
		.n('nhp', 'filter', { type: HP, cutoff: 7000, q: 0.7 })
		.n('ng', 'gain', { level: 0.5 })
		.w('nz>nhp', 'nhp>ng')
		.n('src', 'sum')
		.w('hp>src', 'ng>src')
		.vca('amp', 'src', { envA: 0.0008, envD: decay }, 'mix');
	if (chick) {
		// The two plates closing on each other, a low thud under the hiss.
		v.n('ck', 'excite', { hardness: 40, exLength: 6, exTone: 900 })
			.n('ckg', 'gain', { level: chick })
			.w('ck>ckg', 'ckg>mix');
	}
	return v
		.n('mix', 'sum')
		.vel('v', 0.3, 'mix', 'trim')
		.done(Math.max(0.3, decay * 2.5), 0.9, 1);
}

/** Wood or metal struck: three modes at a bar's ratios, a hard strike, no settling. */
function bar(
	hz: number,
	ratios: [number, number, number],
	q: number,
	hard: number,
	trim: number,
	ring: number
) {
	return new Voice()
		.n('stk', 'excite', { hardness: hard, exLength: 1, exTone: Math.min(12000, hz * 4) })
		.n('m', 'modes', {
			modeHz: hz,
			mode1: ratios[0],
			mode2: ratios[1],
			mode3: ratios[2],
			modeQ: q,
			modeMix: 100
		})
		.n('sg', 'gain', { level: 0.08 })
		.n('mix', 'sum')
		.w('stk>m', 'm>mix', 'stk>sg', 'sg>mix')
		.vel('v', 0.25, 'mix', 'trim')
		.done(ring, trim);
}

/** Shaken or scraped: noise through a band, shaped, optionally chopped into grains. */
function grains(band: number, q: number, decay: number, attack: number, rate = 0, trim = 1) {
	const v = new Voice()
		.n('nz', 'noise')
		.n('bp', 'filter', { type: BP, cutoff: band, q })
		.n('hp', 'filter', { type: HP, cutoff: band * 0.5, q: 0.7 })
		.w('nz>bp', 'bp>hp');
	let src = 'hp';
	if (rate) {
		// The ridges of a guiro, the beads of a vibraslap: the sound chopped at `rate`.
		v.lfo('ch', rate, 0.5, 'square')
			.k('half', 0.5, 'cho:b')
			.n('cho', 'add')
			.w('cha>cho:a')
			.n('chg', 'gain', { level: 0 })
			.w('cho>chg:level', 'hp>chg');
		src = 'chg';
	}
	return v
		.vca('amp', src, { envA: attack, envD: decay }, 'mix')
		.n('mix', 'sum')
		.vel('v', 0.3, 'mix', 'trim')
		.done(Math.max(0.3, decay * 2 + attack), trim);
}

/** A whistle: a pea rattling in the chamber trills the pitch. */
function whistle(hz: number, length: number) {
	return new Voice()
		.n('o', 'osc', {}, 'sine')
		.lfo('tr', 28, hz * 0.03, 'sine')
		.k('c', hz, 'fa:b')
		.n('fa', 'add')
		.w('tra>fa:a', 'fa>o:pitch')
		.n('breath', 'noise')
		.n('bbp', 'filter', { type: BP, cutoff: hz, q: 4 })
		.n('bg', 'gain', { level: 0.2 })
		.n('src', 'sum')
		.w('breath>bbp', 'bbp>bg', 'o>src', 'bg>src')
		.vca('amp', 'src', { envA: 0.015, envD: length, envCurve: 0 }, 'mix')
		.n('mix', 'sum')
		.vel('v', 0.3, 'mix', 'trim')
		.done(length + 0.2, 0.5);
}

/** A cuica: a stick rubbed inside the drum, the pitch sliding as it goes. */
function cuica(from: number, to: number, length: number) {
	return new Voice()
		.n('o', 'osc', {}, 'triangle')
		.sweep('gl', to, from - to, { envD: length, envCurve: 0 }, 'o:pitch')
		.n('lp', 'filter', { type: LP, cutoff: 1800, q: 2 })
		.w('o>lp')
		.vca('amp', 'lp', { envA: 0.01, envD: length }, 'mix')
		.n('mix', 'sum')
		.vel('v', 0.3, 'mix', 'trim')
		.done(length + 0.3, 0.7);
}

function kick(hz: number, q: number, boom: number) {
	const v = head(
		new Voice(),
		{ hz, q, drop: 1.05, hard: 30, len: 5, tone: 1400, shell: 90, slap: 0.3 },
		'hd'
	);
	// The air in the shell pushed out the front: a low sine that falls into the note.
	v.n('bo', 'osc', {}, 'sine')
		.sweep('bp', hz, hz * 0.5, { envD: 0.04 }, 'bo:pitch')
		.vca('boa', 'bo', { envA: 0.001, envD: boom }, 'mix')
		.w('hd>mix')
		.n('mix', 'sum');
	return v.vel('v', 0.2, 'mix', 'trim').done(1.2, 0.75);
}

function snare(hz: number, wires: number, wireDecay: number, crack: number) {
	const v = head(
		new Voice(),
		{ hz, q: 10, drop: 1.08, hard: 85, len: 1.2, tone: 5000, shell: 900, slap: crack },
		'hd'
	);
	// The wires under the bottom head: noise the hit sets rattling.
	v.n('nz', 'noise')
		.n('whp', 'filter', { type: HP, cutoff: 1800, q: 0.7 })
		.n('wpk', 'filter', { type: PEAK, cutoff: 4500, q: 0.8, filterGain: 5 })
		.n('wlp', 'filter', { type: LP, cutoff: 11000, q: 0.7 })
		.w('nz>whp', 'whp>wpk', 'wpk>wlp')
		.vca('wa', 'wlp', { envA: 0.001, envD: wireDecay }, 'wg')
		.n('wg', 'gain', { level: wires })
		.w('hd>mix', 'wg>mix')
		.n('mix', 'sum');
	return v.vel('v', 0.2, 'mix', 'trim').done(0.9, 0.9);
}

export function jazzKit(): Record<number, Partial<TrackData>> {
	const gm = (n: number) => 108 - n;
	return {
		[gm(35)]: kick(52, 30, 0.45),
		[gm(36)]: kick(60, 24, 0.3),
		// Side stick: the stick laid across, its shaft cracking on the rim.
		[gm(37)]: bar(1150, [1, 2.2, 3.6], 10, 90, 0.9, 0.3),
		[gm(38)]: snare(195, 1.2, 0.24, 0.25),
		[gm(39)]: new Voice()
			.n('nz', 'noise')
			.n('bp', 'filter', { type: BP, cutoff: 1300, q: 1.4 })
			.w('nz>bp')
			.vca('hit', 'bp', { envA: 0.0005, envD: 0.014 }, 'hits')
			.n('d1', 'delay', { delayTime: 0.009 })
			.n('d2', 'delay', { delayTime: 0.021 })
			.w('hit>d1', 'hit>d2', 'd1>hits', 'd2>hits')
			.n('hits', 'sum')
			.vca('tail', 'bp', { envA: 0.015, envD: 0.18 }, 'tg')
			.n('tg', 'gain', { level: 0.5 })
			.n('mix', 'sum')
			.w('hits>mix', 'tg>mix')
			.n('room', 'space', { spaceSize: 25, spaceDecay: 30, spaceMix: 25 })
			.n('lift', 'gain', { level: 2 })
			.w('mix>room', 'room>lift')
			.vel('v', 0.25, 'lift', 'trim')
			.done(0.8, 2),
		// A tighter, brighter snare: more wire, a harder crack.
		[gm(40)]: snare(230, 1.6, 0.2, 0.4),
		[gm(41)]: tom(82, 20),
		[gm(42)]: hat(0.05, 0),
		[gm(43)]: tom(98, 20),
		[gm(44)]: hat(0.07, 0.5),
		[gm(45)]: tom(112, 18),
		[gm(46)]: hat(0.9, 0),
		[gm(47)]: tom(132, 16),
		[gm(48)]: tom(155, 16),
		[gm(49)]: cymbal({ base: 420, decay: 4, hp: 3200, metal: 0.55 }),
		[gm(50)]: tom(185, 14),
		[gm(51)]: cymbal({ base: 380, decay: 5, hp: 4200, metal: 0.4, ping: [3600, 0.35] }),
		[gm(52)]: cymbal({ base: 350, decay: 3, hp: 2200, metal: 0.8, drive: 60 }),
		// The bell of the ride: its dome rings at a few clear, long partials.
		[gm(53)]: bar(720, [1, 2.26, 3.3], 160, 85, 0.6, 3),
		[gm(54)]: grains(7500, 1, 0.22, 0.002, 18, 1.1),
		[gm(55)]: cymbal({ base: 560, decay: 1.5, hp: 5000, metal: 0.55 }),
		[gm(56)]: new Voice()
			.n('a', 'osc', {}, 'square')
			.hz('af', 562, 'a:pitch')
			.n('b', 'osc', {}, 'square')
			.hz('bf', 845, 'b:pitch')
			.n('ab', 'sum')
			.w('a>ab', 'b>ab')
			.n('bp', 'filter', { type: BP, cutoff: 950, q: 1.2 })
			.w('ab>bp')
			.vca('hit', 'bp', { envA: 0.0005, envD: 0.04 }, 'mix')
			.vca('ring', 'bp', { envA: 0.0005, envD: 0.35 }, 'rg')
			.n('rg', 'gain', { level: 0.35 })
			.w('rg>mix')
			.n('mix', 'sum')
			.vel('v', 0.25, 'mix', 'trim')
			.done(0.9, 0.6),
		[gm(57)]: cymbal({ base: 470, decay: 4.5, hp: 2800, metal: 0.5 }),
		// Vibraslap: the beads in the box rattling, fast then slowing out.
		[gm(58)]: grains(2600, 1.5, 0.9, 0.001, 32, 1),
		[gm(59)]: cymbal({ base: 410, decay: 4.5, hp: 4800, metal: 0.35, ping: [4100, 0.3] }),
		[gm(60)]: tom(392, 9),
		[gm(61)]: tom(294, 9),
		// Mute conga: the hand stays on the head.
		[gm(62)]: tom(330, 4),
		[gm(63)]: tom(330, 14),
		[gm(64)]: tom(220, 14),
		// Timbales: thin heads on metal shells -- bright, with a ring.
		[gm(65)]: tom(480, 26),
		[gm(66)]: tom(370, 26),
		[gm(67)]: bar(910, [1, 2.46, 4.2], 90, 80, 0.5, 1.5),
		[gm(68)]: bar(610, [1, 2.46, 4.2], 90, 80, 0.5, 1.5),
		[gm(69)]: grains(5500, 1, 0.12, 0.01, 0, 1),
		[gm(70)]: grains(6500, 1.2, 0.06, 0.004, 0, 1),
		[gm(71)]: whistle(2400, 0.12),
		[gm(72)]: whistle(2250, 0.5),
		[gm(73)]: grains(3000, 2, 0.14, 0.01, 24, 1.2),
		[gm(74)]: grains(3000, 2, 0.42, 0.02, 24, 1.2),
		[gm(75)]: bar(2500, [1, 2.76, 5.4], 30, 95, 0.7, 0.4),
		[gm(76)]: bar(1150, [1, 2.7, 4.8], 12, 90, 0.8, 0.35),
		[gm(77)]: bar(820, [1, 2.7, 4.8], 12, 90, 0.8, 0.35),
		[gm(78)]: cuica(620, 520, 0.14),
		[gm(79)]: cuica(330, 520, 0.4),
		// The triangle: a steel rod, bright partials that ring and ring -- or a hand stops it.
		[gm(80)]: bar(3800, [1, 1.87, 2.73], 12, 95, 0.4, 0.3),
		[gm(81)]: bar(3800, [1, 1.87, 2.73], 150, 95, 0.4, 3)
	};
}
