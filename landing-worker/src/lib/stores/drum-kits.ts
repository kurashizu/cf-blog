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
 *
 * A key is held to a kit key's budget (docs/node-graph.md, "The built-in
 * patches"): 24 audio nodes and 2 worklets a hit, of which the voice itself
 * spends eleven. The first rebuild spent up to 38 and 6 -- an EXCITE (six
 * nodes and a worklet) for every stick, an ENV for every settling pitch, a
 * SPACE in the clap -- and a fast roll on the toms was six notes of that at
 * once. What a stick does to a head is a step, and a step is cheap: CONST
 * into TO-SIG, through a filter, is a click whose tone is the filter's
 * (`click`) or, through a very wide, very low bandpass, an exponential decay
 * with no worklet at all (`decay`).
 */
import type { GraphCable, GraphGroup, GraphNode } from './graph-model';
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

/** Box tints for a key's stages, in order -- the ones the AC presets use. */
const TINTS = ['#e06c75', '#e5c07b', '#61afef', '#98c379', '#c678dd', '#56b6c2'];

/**
 * A graph under construction: nodes with their knobs, cables in the preset
 * shorthand (`from.port>to:port`), and oscillator shapes by name.
 */
class Voice {
	nodes: [string, string][] = [];
	cables: string[] = [];
	params: Params = {};
	waves: Record<string, string> = {};
	groups: [string, string[]][] = [];
	notes: [string, string][] = [];
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
	/**
	 * A step from the note on: a number (a CONST, or a value such as velocity's
	 * MAP) made into sound by TO-SIG. Nothing, then `level`, for as long as the
	 * drum rings -- which is what a stick is to a head, before any filter says
	 * what it sounds like.
	 */
	step(id: string, level: number | string): this {
		if (typeof level === 'number') this.k(`${id}k`, level, `${id}:level`);
		else this.w(`${level}>${id}:level`);
		return this.n(id, 'tosig');
	}
	/**
	 * A strike with no worklet: a step through one filter. A step through a
	 * highpass is a spike that rings once at `tone` -- the crack of a stick;
	 * through a bandpass it is a short damped tone -- a felt beater, wood. Two
	 * nodes and a biquad, where EXCITE was six nodes and an ENV worklet.
	 */
	click(id: string, type: number, tone: number, q: number, level: number, to: string[]): this {
		return this.step(`${id}s`, level)
			.n(id, 'filter', { type, cutoff: tone, q })
			.w(`${id}s>${id}`, ...to.map((t) => `${id}>${t}`));
	}
	/**
	 * An exponential decay with time constant `tau`, as a value, from a step:
	 * a bandpass far below the audio band and far wider than it is high has two
	 * real poles, one fast (the rise) and one slow (the fall), so a step
	 * through it rises in a small fraction of `tau` and falls as e^(-t/tau) --
	 * measured against the formula, within 2% from the peak to 4 tau. What an
	 * ENV set to EXP does, without its worklet.
	 */
	decay(id: string, from: string, tau: number, to: string): this {
		const f = Math.max(20, Math.sqrt(40) / (2 * Math.PI * tau));
		const w = 2 * Math.PI * f;
		const q = w / (w * w * tau + 1 / tau);
		return this.n(`${id}f`, 'filter', { type: BP, cutoff: Math.round(f), q: +q.toPrecision(3) })
			.n(id, 'tocv')
			.w(`${from}>${id}f`, `${id}f>${id}`, `${id}>${to}`);
	}
	/** An envelope that opens a VCA: `src` through it to `to`. */
	vca(id: string, src: string, env: Params, to: string | string[]): this {
		return this.n(`${id}e`, 'env', { envCurve: EXP, envS: 0, envR: 0.02, ...env })
			.n(id, 'gain', { level: 0 })
			.w(`${src}>${id}`, `${id}e>${id}:level`, ...[to].flat().map((t) => `${id}>${t}`));
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
	/** Velocity as a number, `lo` for the softest hit: a MAP of ENTRY's VEL, no node of its own. */
	velMap(id: string, lo: number): this {
		return this.n(id, 'map', { shape: M_EXP, inLo: 0, inHi: 1, outLo: lo, outHi: 1 }).w(
			`entry.vel>${id}:a`
		);
	}
	/**
	 * Velocity as a level: soft is quiet. The gain is also where the key's
	 * parts meet -- a GAIN sums whatever arrives, so no SUM in front of it.
	 */
	vel(id: string, lo: number, srcs: string[], to: string): this {
		return this.velMap(`${id}m`, lo)
			.n(id, 'gain', { level: 0 })
			.w(`${id}m>${id}:level`, ...srcs.map((s) => `${s}>${id}`), `${id}>${to}`);
	}
	/**
	 * The canvas: boxes round the stages, in signal order, and NOTE cards
	 * saying what each is. A kit key is read by someone who did not write it,
	 * like every built-in graph (docs/node-graph.md, "The built-in patches").
	 */
	layout(groups: [string, string[]][], notes: [string, string][]): this {
		this.groups = groups;
		this.notes = notes;
		return this;
	}
	/**
	 * The voice as a key's sound. `ring` is how long it lasts, whatever the
	 * key does; `trim` levels it against the rest of the kit.
	 */
	done(ring: number, trim: number, group = 0): Partial<TrackData> {
		const COL = 300;
		const ROW = 200;
		const GAP = 90;
		const TOP = 278;
		const feeders = new Map<string, string[]>();
		for (const c of this.cables) {
			const [lhs, rest] = c.split('>');
			const to = rest.split(':')[0];
			feeders.set(to, [...(feeders.get(to) ?? []), lhs.split('.')[0]]);
		}
		/* Depth along the signal first: each node one column right of the
		   furthest node feeding it, so a cable runs left to right. */
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
		const pos = new Map<string, { x: number; y: number }>();
		/* Then banded by stage, as `patch()` lays out the AC presets: each box
		   takes the columns its own members need, in their order along the
		   signal, and the boxes sit side by side. Laid out by depth alone the
		   stages interleave -- the stick's CONST in the head's column -- and a
		   box drawn round either would enclose the other. */
		let cursor = 48 + COL;
		let tallest = 1;
		const grouped = new Set(this.groups.flatMap(([, m]) => m));
		const bands: [string, string[]][] = [
			...this.groups,
			// Anything left out of a box still gets a place, after the boxes.
			['', this.nodes.map(([id]) => id).filter((id) => !grouped.has(id))]
		];
		for (const [, members] of bands) {
			const own = members.filter((m) => this.nodes.some(([id]) => id === m));
			if (!own.length) continue;
			const cols = [...new Set(own.map((m) => col.get(m) ?? 1))].sort((p, q) => p - q);
			const perCol = new Map<number, number>();
			for (const m of own) {
				const c = cols.indexOf(col.get(m) ?? 1);
				const k = perCol.get(c) ?? 0;
				perCol.set(c, k + 1);
				pos.set(m, { x: cursor + c * COL, y: TOP + k * ROW });
			}
			tallest = Math.max(tallest, ...perCol.values());
			cursor += cols.length * COL + GAP;
		}
		const nodes: GraphNode[] = [
			{ id: 'entry', type: 'in', x: 48, y: TOP + ((tallest - 1) * ROW) / 2 },
			...this.nodes.map(([id, type]) => ({ id, type, ...pos.get(id)! })),
			{ id: 'trim', type: 'gain', x: cursor, y: TOP },
			{ id: 'output', type: 'out', x: cursor + COL, y: TOP }
		];
		const at = new Map(nodes.map((n) => [n.id, n]));
		const groups: GraphGroup[] = this.groups.map(([label, members], i) => {
			const own = members.map((m) => at.get(m)).filter((n): n is GraphNode => !!n);
			const x = Math.min(...own.map((n) => n.x)) - 24;
			const y = Math.min(...own.map((n) => n.y)) - 56;
			return {
				id: `g${i}`,
				label,
				x,
				y,
				w: Math.max(...own.map((n) => n.x)) + COL - x,
				h: Math.max(...own.map((n) => n.y)) + ROW - y,
				color: TINTS[i % TINTS.length],
				members: own.map((n) => n.id)
			};
		});
		const graphLabels: Record<string, string> = {};
		for (const [i, [text, near]] of this.notes.entries()) {
			const box = groups.find((g) => g.members?.includes(near));
			const by = at.get(near);
			const id = `note${i}`;
			// Across the top of the stage it explains, as `patch()` places them.
			nodes.push({
				id,
				type: 'note',
				x: box ? box.x + 24 : (by?.x ?? 48),
				y: box ? box.y + 30 : (by?.y ?? TOP) - 150
			});
			graphLabels[id] = text;
		}
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
			rackGraph: { nodes, cables, ...(groups.length ? { groups } : {}) },
			graphParams: {
				...this.params,
				'trim.level': trim,
				// TIME: the drum rings its own length, however long the key is down.
				'output.dur': 1,
				'output.durSec': ring
			},
			graphWaves: this.waves,
			...(Object.keys(graphLabels).length ? { graphLabels } : {}),
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

/**
 * A bridged-T kick: a sine that starts high and falls to its note, with a
 * click. The fall keeps its ENV: a shelf's settle dips a tenth of the drop
 * under the note, and on a drop of three times that is a fifth of an octave
 * of wobble. The level is the step's decay instead, the step itself at the
 * velocity -- so an accent drives the saturator harder, as the circuit's
 * accent does -- and the same step is the trigger's click.
 */
function kick808(base: number, drop: number, dropTime: number, decay: number, drive: number) {
	return new Voice()
		.velMap('vm', 0.2)
		.step('trg', 'vm')
		.n('clk', 'filter', { type: HP, cutoff: 1500, q: 0.7 })
		.n('clkg', 'gain', { level: 0.25 })
		.w('trg>clk', 'clk>clkg', 'clkg>trim')
		.decay('ampd', 'trg', decay / 9.2, 'amp:level')
		.n('osc', 'osc', {}, 'sine')
		.sweep('pit', base, drop, { envD: dropTime }, 'osc:pitch')
		.n('amp', 'gain', { level: 0 })
		.n('sat', 'shape', { shapeKind: 0, shapeDrive: drive })
		.w('osc>amp', 'amp>sat', 'sat>trim')
		.layout(
			[
				['TRIGGER', ['vm', 'trg', 'clk', 'clkg', 'ampdf', 'ampd']],
				['BRIDGED T', ['pite', 'pitk', 'pitm', 'pitb', 'pita', 'osc', 'amp']],
				['DRIVE', ['sat']]
			],
			[
				[
					'The trigger: a step at the velocity. Through HP it is the click; through the wide low BP it is the decay.',
					'trg'
				],
				['A sine swept down onto its note by ENV, the decay opening it.', 'osc'],
				['Soft clip, after the level: a harder hit is a fatter one.', 'sat']
			]
		);
}

/** The six squares the 808 makes all its metal from, straight into `to`. */
function metal808(v: Voice, to: string): Voice {
	const HZ = [205.3, 304.4, 369.6, 522.7, 540, 800];
	HZ.forEach((f, i) =>
		v.n(`sq${i}`, 'osc', {}, 'square').hz(`f${i}`, f, `sq${i}:pitch`).w(`sq${i}>${to}`)
	);
	return v;
}

function hat808(decay: number, group: number) {
	return metal808(new Voice(), 'bp')
		.n('bp', 'filter', { type: BP, cutoff: 10000, q: 0.9 })
		.n('hp', 'filter', { type: HP, cutoff: 7000, q: 0.7 })
		.w('bp>hp')
		.vca('amp', 'hp', { envA: 0.001, envD: decay }, 'v')
		.vel('v', 0.3, [], 'trim')
		.layout(
			[
				['METAL', ['sq0', 'f0', 'sq1', 'f1', 'sq2', 'f2', 'sq3', 'f3', 'sq4', 'f4', 'sq5', 'f5']],
				['BAND', ['bp', 'hp']],
				['LEVEL', ['ampe', 'amp', 'vm', 'v']]
			],
			[
				['Six detuned squares: the 808 makes every metal from these.', 'sq0'],
				['Only the top is kept: a band at 10 kHz, over 7 kHz.', 'bp'],
				['Open and closed are the same metal, choked by each other.', 'amp']
			]
		)
		.done(Math.max(0.3, decay * 3), 0.9, group);
}

function tom808(hz: number) {
	return new Voice()
		.hz('pitb', hz, 'osc:pitch')
		.step('pits', +(hz * 0.45).toFixed(1))
		.decay('pit', 'pits', 0.013, 'osc:pitch')
		.n('osc', 'osc', {}, 'sine')
		.vca('amp', 'osc', { envA: 0.001, envD: 0.5 }, 'v')
		.n('nz', 'noise')
		.n('nf', 'filter', { type: LP, cutoff: 2500, q: 0.7 })
		.w('nz>nf')
		.vca('nza', 'nf', { envA: 0.001, envD: 0.05 }, 'nzg')
		.n('nzg', 'gain', { level: 0.12 })
		.vel('v', 0.2, ['nzg'], 'trim')
		.layout(
			[
				['SINE', ['pitb', 'pitsk', 'pits', 'pitf', 'pit', 'osc', 'ampe', 'amp']],
				['NOISE', ['nz', 'nf', 'nzae', 'nza', 'nzg']],
				['LEVEL', ['vm', 'v']]
			],
			[
				[
					'A sine that falls a fifth onto its note: the note in Hz, and 45% more that decays (a step through a wide, low BP).',
					'pitf'
				],
				['A breath of noise under the attack.', 'nz']
			]
		)
		.done(1.6, 0.9);
}

export function kit808(): Record<number, Partial<TrackData>> {
	return {
		// C2: the long one, a note more than a thump.
		72: kick808(48, 110, 0.06, 1.1, 20).done(2.5, 0.86),
		// D2: short and hard.
		70: kick808(58, 160, 0.03, 0.35, 45).done(0.9, 0.74),
		// C3
		60: tom808(120),
		/* C4: two tuned heads and the snappy. The heads share one envelope, at
		   the mean of the two they had (0.16 and 0.09 s): two ENVs and the
		   snappy's made three worklets. */
		48: new Voice()
			.n('t1', 'osc', {}, 'sine')
			.hz('t1f', 185, 't1:pitch')
			.n('t2', 'osc', {}, 'sine')
			.hz('t2f', 332, 't2:pitch')
			.vca('ta', 't1', { envA: 0.001, envD: 0.13 }, 'v')
			.w('t2>ta')
			.n('nz', 'noise')
			.n('hp', 'filter', { type: HP, cutoff: 1800, q: 0.7 })
			.n('pk', 'filter', { type: PEAK, cutoff: 5000, q: 0.8, filterGain: 4 })
			.w('nz>hp', 'hp>pk')
			.vca('sn', 'pk', { envA: 0.001, envD: 0.22 }, 'sng')
			.n('sng', 'gain', { level: 0.6 })
			.vel('v', 0.2, ['sng'], 'trim')
			.layout(
				[
					['HEADS', ['t1', 't1f', 't2', 't2f', 'tae', 'ta']],
					['SNAPPY', ['nz', 'hp', 'pk', 'sne', 'sn', 'sng']],
					['LEVEL', ['vm', 'v']]
				],
				[
					['Two sines, 185 and 332 Hz: the heads, as the circuit tunes them.', 't1'],
					['Noise above 1.8 kHz with a lift at 5: the snappy.', 'nz']
				]
			)
			.done(0.8, 0.9),
		// D4: three claps a hair apart, then the room's tail.
		46: new Voice()
			.n('nz', 'noise')
			.n('bp', 'filter', { type: BP, cutoff: 1150, q: 1.6 })
			.w('nz>bp')
			.vca('hit', 'bp', { envA: 0.0005, envD: 0.012 }, ['d1', 'd2', 'hp'])
			.n('d1', 'delay', { delayTime: 0.011 })
			.n('d2', 'delay', { delayTime: 0.023 })
			.w('d1>hp', 'd2>hp')
			.vca('tail', 'bp', { envA: 0.02, envD: 0.22 }, 'tailg')
			.n('tailg', 'gain', { level: 0.6 })
			.n('hp', 'filter', { type: HP, cutoff: 700, q: 0.7 })
			.w('tailg>hp')
			.vel('v', 0.25, ['hp'], 'trim')
			.layout(
				[
					['NOISE', ['nz', 'bp']],
					['CLAPS', ['hite', 'hit', 'd1', 'd2']],
					['TAIL', ['taile', 'tail', 'tailg']],
					['LEVEL', ['hp', 'vm', 'v']]
				],
				[
					['One burst, and the same burst 11 and 23 ms later: three hands.', 'd1'],
					['A slower swell of the same band: the room behind them.', 'tail']
				]
			)
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
			.vca('amp', 'a', { envA: 0.0005, envD: 0.028 }, 'sat')
			.w('b>amp')
			.n('sat', 'shape', { shapeKind: 1, shapeDrive: 40 })
			.n('hp', 'filter', { type: HP, cutoff: 350, q: 0.7 })
			.w('sat>hp')
			.vel('v', 0.25, ['hp'], 'trim')
			.layout(
				[
					['PINGS', ['a', 'af', 'b', 'bf', 'ampe', 'amp']],
					['CRACK', ['sat', 'hp', 'vm', 'v']]
				],
				[
					['1720 and 480 Hz, gone in 30 ms.', 'a'],
					['Clipped hard: the crack is the clipping.', 'sat']
				]
			)
			.done(0.3, 0.8),
		// A4: two squares, a bandpass, a quick drop then a ring.
		39: new Voice()
			.n('a', 'osc', {}, 'square')
			.hz('af', 540, 'a:pitch')
			.n('b', 'osc', {}, 'square')
			.hz('bf', 800, 'b:pitch')
			.n('bp', 'filter', { type: BP, cutoff: 900, q: 1.4 })
			.w('a>bp', 'b>bp')
			.vca('hit', 'bp', { envA: 0.0005, envD: 0.03 }, 'v')
			.vca('ring', 'bp', { envA: 0.0005, envD: 0.28 }, 'rg')
			.n('rg', 'gain', { level: 0.4 })
			.vel('v', 0.25, ['rg'], 'trim')
			.layout(
				[
					['BELL', ['a', 'af', 'b', 'bf', 'bp']],
					['STRIKE', ['hite', 'hit', 'ringe', 'ring', 'rg']],
					['LEVEL', ['vm', 'v']]
				],
				[
					['Two squares, 540 and 800 Hz, through a band: the cowbell.', 'bp'],
					['A hard hit that drops fast, over a ring that lasts.', 'hit']
				]
			)
			.done(0.8, 0.8),
		// B4: the maracas.
		37: new Voice()
			.n('nz', 'noise')
			.n('hp', 'filter', { type: HP, cutoff: 5500, q: 0.7 })
			.w('nz>hp')
			.vca('amp', 'hp', { envA: 0.004, envD: 0.05 }, 'v')
			.vel('v', 0.3, [], 'trim')
			.layout(
				[
					['SHAKE', ['nz', 'hp', 'ampe', 'amp']],
					['LEVEL', ['vm', 'v']]
				],
				[['Noise above 5.5 kHz, 50 ms: the maracas.', 'nz']]
			)
			.done(0.25, 0.9)
	};
}

/* ── JAZZ ────────────────────────────────────────────────────────────────── */

/* A circular membrane's first six modes, which are not a harmonic series:
   that is the difference between a drum and a note. */
const MEMBRANE = [1, 1.59, 2.14, 2.3, 2.65, 2.92];

/**
 * A tom, a conga, a bongo, a timbale: a stick on a head that rings at the
 * membrane's six modes, over the shell.
 *
 * The stick is a burst of noise, its fall the step's decay (no worklet): a
 * click alone left the band above the head's modes empty, and the ear took
 * the key for a drum machine. MODES strikes its own modes when the note
 * starts, so the burst's other job is the colour through the banks'
 * bandpasses. The two banks take the two worklets a key has.
 */
function tom(hz: number, q = 18) {
	return new Voice()
		.velMap('vm', 0.8)
		.step('stks', 1.49)
		.decay('sld', 'stks', 0.1, 'sl:level')
		.n('nz', 'noise')
		.n('sl', 'gain', { level: 0 })
		.n('slf', 'filter', { type: BP, cutoff: 1030, q: 0.44 })
		.w('nz>sl', 'sl>slf', 'slf>m1', 'slf>m2')
		.n('slg', 'gain', { level: 0.11 })
		.w('slf>slg')
		.n('m1', 'modes', {
			modeHz: +(hz * 0.742).toFixed(1),
			mode1: 2.24,
			mode2: 4.64,
			mode3: 5.88,
			modeQ: +(q * 2.6).toFixed(1),
			modeMix: 60
		})
		.n('m2', 'modes', {
			modeHz: +(hz * 0.517).toFixed(1),
			mode1: 3.34,
			mode2: 2.86,
			mode3: 3.37,
			modeQ: +Math.max(1, q * 0.73).toFixed(1),
			modeMix: 63
		})
		.n('body', 'filter', { type: PEAK, cutoff: Math.round(hz * 1.58), q: 1.3, filterGain: 4 })
		.w('m1>body', 'm2>body')
		.n('v', 'gain', { level: 0 })
		.w('vm>v:level', 'body>v', 'slg>v', 'v>trim')
		.layout(
			[
				['STICK', ['stksk', 'stks', 'sldf', 'sld', 'nz', 'sl', 'slf', 'slg']],
				['HEAD', ['m1', 'm2']],
				['SHELL', ['body', 'vm', 'v']]
			],
			[
				[
					'The stick: a burst of noise round 1 kHz falling over 0.1 s, heard, and ringing the head.',
					'sl'
				],
				[
					"The head's modes, as the ear placed them against a recorded tom: 1.66 to 4.4 times the drum's pitch, the lowest ringing longest.",
					'm1'
				],
				['The shell: a lift at 1.6x the head.', 'body']
			]
		)
		.done(Math.min(2.5, q / 8), 0.455);
}

/**
 * Cymbal metal: squares at inharmonic ratios -- the drum machine's trick, and
 * the right one: a plate's modes are too many and too close to count, and
 * squares beating against each other make that density. `pick` chooses which
 * of the six ratios, spread across them, when the budget will not take all.
 */
function metal(v: Voice, base: number, to: string, pick = [0, 1, 2, 3, 4, 5]): Voice {
	const R = [1, 1.483, 1.932, 2.546, 2.63, 3.897];
	for (const i of pick)
		v.n(`sq${i}`, 'osc', {}, 'square')
			.hz(`f${i}`, base * R[i], `sq${i}:pitch`)
			.w(`sq${i}>${to}`);
	return v;
}

interface Cym {
	base: number;
	/** How long it rings, s. */
	decay: number;
	/** Highpass corner: small bright cymbals high, large dark ones low. */
	hp: number;
	/** Metal against wash, 0..1. */
	metal: number;
	/** Trashy: driven (china). */
	drive?: number;
	group?: number;
	/** Seconds the whole voice lasts. */
	ring?: number;
}

/**
 * A ride: the stick on the bow, and a wash that builds under a groove.
 *
 * Its metal is two pairs of squares multiplied -- each pair's sum through
 * TO-CV onto a GAIN's level -- rather than six squares summed. Summed, the
 * squares keep their own harmonic series and the ear hears a horn or a
 * buzzer however they are filtered; multiplied, every partial of one pair
 * sidebands every partial of the other, which is the density a plate has.
 * (Measured offline against a recorded stick-on-cymbal hit: the ear hears a
 * cymbal only in hundreds of partials, never in tens, and never in noise.)
 * Noise in a band above it is the air of the wash. A ping (MODES over the
 * wash) was tried and taken out: in the groove it read less as a kit.
 *
 * Voiced in the groove (tools/ear groove.py) rather than alone: no setting
 * reads as a cymbal struck eight times on its own, but in a swing bar this
 * one is heard as the kit's cymbal, and the kit as a drum kit rather than a
 * drum machine.
 */
function ride(c: { base: number; decay: number; hp: number }) {
	const v = metal(new Voice(), c.base, 'rm', [0, 1]);
	return metal(v, c.base, 'mc', [3, 5])
		.n('mc', 'tocv')
		.w('mc>rm:level')
		.n('rm', 'gain', { level: 0 })
		.n('mhp', 'filter', { type: HP, cutoff: c.hp, q: 0.7 })
		.w('rm>mhp', 'mhp>amp')
		.n('nz', 'noise')
		.n('nlp', 'filter', { type: BP, cutoff: 6000, q: 0.7 })
		.n('ng', 'gain', { level: 0.3 })
		.w('nz>nlp', 'nlp>ng', 'ng>amp')
		.n('amp', 'gain', { level: 0 })
		.n('washe', 'env', { envCurve: EXP, envA: 0.003, envD: c.decay, envS: 0, envR: 0.02 })
		.w('washe>amp:level')
		.vel('v', 0.25, ['amp'], 'trim')
		.layout(
			[
				['METAL', ['sq0', 'f0', 'sq1', 'f1', 'sq3', 'f3', 'sq5', 'f5', 'mc', 'rm', 'mhp']],
				['WASH', ['nz', 'nlp', 'ng', 'washe', 'amp']],
				['LEVEL', ['vm', 'v']]
			],
			[
				[
					"Two pairs of squares multiplied (TO-CV onto GAIN): every partial sidebands every other, a plate's density.",
					'rm'
				],
				['Noise in a band over it, and one long ring for both.', 'nlp']
			]
		)
		.done(c.decay * 1.2, 0.3);
}

/**
 * A crash, a splash, a china: metal and a wash of noise through one VCA, a
 * fast splash on top of a long ring. The two envelopes are summed on the
 * VCA's level rather than given a VCA each. A china's drive takes the
 * splash's worklet, and a square. (The ride's multiplied metal was tried
 * here and sat 10 dB further from a recorded crash, band by band.)
 */
function cymbal(c: Cym) {
	const pick = c.drive ? [0, 1, 3, 5] : [0, 1, 2, 3, 5];
	/* Metal against the wash as it was (metal * 0.35 against 1 - metal * 0.6),
	   with the wash at unity and the difference in the trim. */
	const wash = 1 - c.metal * 0.6;
	const v = metal(new Voice(), c.base, 'mhp', pick)
		.n('mhp', 'filter', { type: HP, cutoff: c.hp, q: 0.7 })
		.n('mg', 'gain', { level: +((c.metal * 0.35) / wash).toFixed(3) })
		.w('mhp>mg')
		.n('nz', 'noise')
		.n('nbp', 'filter', { type: BP, cutoff: c.hp * 1.6, q: 0.5 })
		.w('nz>nbp');
	const src = ['mg', 'nbp'];
	if (c.drive) {
		v.n('tr', 'shape', { shapeKind: 1, shapeDrive: c.drive }).w('mg>tr', 'nbp>tr');
		src.splice(0, 2, 'tr');
	}
	v.n('amp', 'gain', { level: 0 }).w(...src.map((s) => `${s}>amp`));
	// The ring, and (unless the drive has its worklet) the splash over it.
	v.n('washe', 'env', { envCurve: EXP, envA: 0.003, envD: c.decay, envS: 0, envR: 0.02 }).w(
		'washe>amp:level'
	);
	const hit = !c.drive;
	if (hit)
		v.n('hite', 'env', {
			envCurve: EXP,
			envA: 0.0005,
			envD: Math.min(0.25, c.decay * 0.12),
			envS: 0,
			envR: 0.02
		}).w('hite>amp:level');
	const sq = pick.flatMap((i) => [`sq${i}`, `f${i}`]);
	return v
		.vel('v', 0.25, ['amp'], 'trim')
		.layout(
			[
				['METAL', [...sq, 'mhp', 'mg']],
				['WASH', ['nz', 'nbp', ...(c.drive ? ['tr'] : [])]],
				['STROKE', ['washe', ...(hit ? ['hite'] : []), 'amp']],
				['LEVEL', ['vm', 'v']]
			],
			[
				[
					`${pick.length} squares at a plate's inharmonic ratios, above ${c.hp} Hz: too many modes to count, so a density.`,
					'mhp'
				],
				[
					c.drive
						? 'Noise for the wash, and both clipped: a china is trash.'
						: 'Noise in a wide band for the wash.',
					'nbp'
				],
				[
					hit
						? 'Two envelopes summed on one VCA: a splash that falls fast into the long ring.'
						: 'One long ring.',
					'amp'
				]
			]
		)
		.done(c.ring ?? c.decay * 1.2, +(0.9 * wash).toFixed(3), c.group ?? 0);
}

/**
 * A hi-hat: two plates, a stick. Broadband from 250 Hz to 16 kHz and nearly
 * flat -- the VCSL closed hat is within 12 dB across it for its first 30 ms
 * and rings about a tenth of a second. The metal bank under a 6.5 kHz
 * highpass it replaces had nothing under 4 kHz and was over in 5 ms: heard
 * as a clock's tick. The pedal hat has no stick: its strike is the two plates
 * closing, a low thud.
 */
function hat(decay: number, pedal = false) {
	const v = metal(new Voice(), 400, 'bp', [0, 1, 3, 5])
		.n('bp', 'filter', { type: BP, cutoff: 7000, q: 0.5 })
		.n('nz', 'noise')
		.n('ng', 'gain', { level: 0.7 })
		.w('nz>ng')
		.vca('amp', 'bp', { envA: 0.0008, envD: decay }, 'v')
		.w('ng>amp');
	if (pedal) v.click('stk', BP, 900, 0.8, 0.5, ['v']);
	else v.click('stk', BP, 3000, 0.8, 0.5, ['v']);
	return v
		.vel('v', 0.3, [], 'trim')
		.layout(
			[
				[
					'PLATES',
					['sq0', 'f0', 'sq1', 'f1', 'sq3', 'f3', 'sq5', 'f5', 'bp', 'nz', 'ng', 'ampe', 'amp']
				],
				[pedal ? 'CLOSING' : 'STICK', ['stksk', 'stks', 'stk']],
				['LEVEL', ['vm', 'v']]
			],
			[
				['Four squares through a wide band, and noise under them: two plates.', 'bp'],
				[
					pedal
						? 'The plates closing on each other: a low thud (a step through BP at 900 Hz).'
						: 'The stick on the top plate: a knock in the middle of the band.',
					'stk'
				]
			]
		)
		.done(Math.max(0.3, decay * 2.5), 0.9, 1);
}

/**
 * A wood block: a burst of the stick's noise through the hollow slot's two
 * resonances (2.85 and 4.07 kHz on the VCSL block -- a ratio of 1.43), broad
 * and gone in a fifth of a second, over the stick's own click. As three pure
 * modes (BAR) it was a ding whatever their Q: sines ring like metal.
 */
function woodBlock(hz: number) {
	return new Voice()
		.n('nz', 'noise')
		.vca('bst', 'nz', { envA: 0.0003, envD: 0.03 }, ['r1', 'r2'])
		.n('r1', 'filter', { type: BP, cutoff: hz, q: 6 })
		.n('r2', 'filter', { type: BP, cutoff: hz * 1.43, q: 6 })
		.n('r2g', 'gain', { level: 0.7 })
		.w('r2>r2g')
		.click('stk', BP, hz * 1.5, 1, 0.3, ['v'])
		.vel('v', 0.25, ['r1', 'r2g'], 'trim')
		.layout(
			[
				['STICK', ['nz', 'bste', 'bst', 'stksk', 'stks', 'stk']],
				['SLOT', ['r1', 'r2', 'r2g']],
				['LEVEL', ['vm', 'v']]
			],
			[
				["A burst of noise and a click: the stick's contact.", 'bst'],
				["The hollow slot's two resonances, 1.43 apart.", 'r1']
			]
		)
		.done(0.35, 2);
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
		.w('stk>m', 'stk>sg')
		.vel('v', 0.25, ['m', 'sg'], 'trim')
		.layout(
			[
				['STRIKE', ['stk', 'sg']],
				['BAR', ['m', 'vm', 'v']]
			],
			[
				['A hard strike, a little of it heard directly.', 'stk'],
				[`Three modes at the bar's ratios, ${ratios.join(' : ')}.`, 'm']
			]
		)
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
		.vca('amp', src, { envA: attack, envD: decay }, 'v')
		.vel('v', 0.3, [], 'trim')
		.layout(
			[
				['GRAINS', ['nz', 'bp', 'hp']],
				...(rate
					? ([['CHOP', ['ch', 'chr', 'chc', 'chk', 'cha', 'half', 'cho', 'chg']]] as [
							string,
							string[]
						][])
					: []),
				['LEVEL', ['ampe', 'amp', 'vm', 'v']]
			],
			[
				[`Noise in a band at ${band} Hz: the beads, the seeds, the jingles.`, 'bp'],
				...(rate
					? ([[`A square at ${rate} Hz opening and closing it: one grain a ridge.`, 'cha']] as [
							string,
							string
						][])
					: [])
			]
		)
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
		.w('breath>bbp', 'bbp>bg')
		.vca('amp', 'o', { envA: 0.015, envD: length, envCurve: 0 }, 'v')
		.w('bg>amp')
		.vel('v', 0.3, [], 'trim')
		.layout(
			[
				['PEA', ['tr', 'trr', 'trc', 'trk', 'tra', 'c', 'fa']],
				['TONE', ['o', 'breath', 'bbp', 'bg', 'ampe', 'amp']],
				['LEVEL', ['vm', 'v']]
			],
			[
				['The pea in the chamber: a 28 Hz trill of 3% on the pitch.', 'tra'],
				['A sine and a little breath at its pitch.', 'o']
			]
		)
		.done(length + 0.2, 0.5);
}

/** A cuica: a stick rubbed inside the drum, the pitch sliding as it goes. */
function cuica(from: number, to: number, length: number) {
	return new Voice()
		.n('o', 'osc', {}, 'triangle')
		.sweep('gl', to, from - to, { envD: length, envCurve: 0 }, 'o:pitch')
		.n('lp', 'filter', { type: LP, cutoff: 1800, q: 2 })
		.w('o>lp')
		.vca('amp', 'lp', { envA: 0.01, envD: length }, 'v')
		.vel('v', 0.3, [], 'trim')
		.layout(
			[
				['SLIDE', ['gle', 'glk', 'glm', 'glb', 'gla', 'o', 'lp']],
				['LEVEL', ['ampe', 'amp', 'vm', 'v']]
			],
			[[`The rubbed stick: a pitch sliding ${from} to ${to} Hz.`, 'o']]
		)
		.done(length + 0.3, 0.7);
}

/**
 * A kick: the felt beater and the batter head. The beater is a burst of noise
 * below 1.5 kHz -- the recording holds -25 dB from 250 Hz to 2 kHz for its
 * first tenth of a second, and a head's modes alone left that band 50 dB
 * down: the ear heard a heartbeat. Its envelope is the step's decay, so no
 * worklet; both worklets are the head's two banks, the three lowest modes
 * (the boom -- the air in the shell that a low sine used to be is this
 * mode) and three far above them. The burst also rings both banks through
 * their bandpasses.
 */
function kick(hz: number, q: number) {
	return new Voice()
		.step('stks', 1.28)
		.decay('sld', 'stks', 0.1, 'sl:level')
		.n('nz', 'noise')
		.n('sl', 'gain', { level: 0 })
		.n('slf', 'filter', { type: LP, cutoff: 500, q: 0.45 })
		.w('nz>sl', 'sl>slf', 'slf>v', 'slf>m1', 'slf>m2')
		.n('m1', 'modes', {
			modeHz: +(hz * 0.875).toFixed(1),
			mode1: 1,
			mode2: 3.48,
			mode3: 1.96,
			modeQ: +(q * 2.03).toFixed(1),
			modeMix: 94
		})
		.n('m2', 'modes', {
			modeHz: Math.max(20, +(hz * 0.372).toFixed(1)),
			mode1: 1.54,
			mode2: 2.5,
			mode3: 7.9,
			modeQ: 6.4,
			modeMix: 13
		})
		.velMap('vm', 0.75)
		.n('v', 'gain', { level: 0 })
		.w('vm>v:level', 'm1>v', 'm2>v', 'v>trim')
		.layout(
			[
				['BEATER', ['stksk', 'stks', 'sldf', 'sld', 'nz', 'sl', 'slf']],
				['HEAD', ['m1', 'm2']],
				['LEVEL', ['vm', 'v']]
			],
			[
				[
					'The felt beater: noise under 1.5 kHz for 30 ms, its fall the step through a wide, low BP.',
					'sl'
				],
				["The head's three lowest modes, the boom, and three far above them, the thud.", 'm1']
			]
		)
		.done(1.2, 0.78);
}

/**
 * A snare: a stick on the batter head, and the wires under the snare head
 * rattling. The head is one bank (the tuner put the second bank's modes
 * between the first's), so the wires can have the other worklet: a
 * rattle's decay is what the ear takes a snare by.
 */
function snare(hz: number, crack: number, wireDecay: number) {
	return new Voice()
		.click('stk', HP, 5000, 0.7, crack, ['m1', 'v'])
		.n('m1', 'modes', {
			modeHz: hz,
			mode1: MEMBRANE[0],
			mode2: MEMBRANE[1],
			mode3: MEMBRANE[2],
			modeQ: 10,
			modeMix: 100
		})
		.n('body', 'filter', { type: PEAK, cutoff: 900, q: 1.2, filterGain: 4 })
		.w('m1>body')
		.n('nz', 'noise')
		.n('whp', 'filter', { type: HP, cutoff: 1800, q: 0.7 })
		.n('wpk', 'filter', { type: PEAK, cutoff: 4500, q: 0.8, filterGain: 5 })
		.n('wlp', 'filter', { type: LP, cutoff: 11000, q: 0.7 })
		.w('nz>whp', 'whp>wpk', 'wpk>wlp')
		.vca('wa', 'wlp', { envA: 0.001, envD: wireDecay }, 'v')
		.vel('v', 0.2, ['body'], 'trim')
		.layout(
			[
				['STICK', ['stksk', 'stks', 'stk']],
				['HEAD', ['m1', 'body']],
				['WIRES', ['nz', 'whp', 'wpk', 'wlp', 'wae', 'wa']],
				['LEVEL', ['vm', 'v']]
			],
			[
				['The stick: a step through HP, the crack, which also rings the head.', 'stk'],
				["The batter head's modes, over the shell's lift.", 'm1'],
				['The wires: noise from 1.8 to 11 kHz the hit sets rattling.', 'wa']
			]
		)
		.done(0.9, 0.9);
}

/**
 * Knobs the ear moved, by GM number: each key's graph as its builder makes it,
 * then these on top. Tuned (tools/ear/tune_kit.py) against VCSL recordings of
 * the same instrument (CC0), band by band and by what an AudioSet model hears
 * in eight hits -- the builders' own numbers were set by reading, and a kit
 * voiced that way was heard as a heartbeat, a clock and radio static. The
 * score cannot hear how loud a key is against the others, so each TRIM here
 * puts the key back at the peak its builder gave it (0.9 at most).
 */
const JAZZ_TUNED: Record<number, Record<string, number>> = {
	37: {
		'trim.level': 1.867,
		'm.mode1': 1.033,
		'm.mode2': 2.252,
		'm.mode3': 5.132,
		'm.modeHz': 624.7,
		'm.modeMix': 96.13,
		'm.modeQ': 19.88,
		'sg.level': 0.1457,
		'stk.exLength': 1.157,
		'stk.exTone': 5687,
		'stk.hardness': 63.2,
		'vm.outHi': 0.4539,
		'vm.outLo': 0.1782
	},
	38: {
		'trim.level': 1.128,
		'body.cutoff': 3558,
		'body.filterGain': 9.131,
		'body.q': 2.136,
		'm1.mode1': 1.902,
		'm1.mode2': 2.174,
		'm1.mode3': 1.68,
		'm1.modeHz': 111.5,
		'm1.modeMix': 79.48,
		'm1.modeQ': 34.87,
		'stk.cutoff': 2211,
		'stksk.value': 0.7482,
		'vm.outHi': 0.5636,
		'vm.outLo': 0.2791,
		'wae.envA': 0.00154,
		'wae.envD': 0.6484,
		'wae.envR': 0.00784,
		'whp.cutoff': 789,
		'whp.q': 1.268,
		'wlp.cutoff': 16150,
		'wlp.q': 1.323,
		'wpk.cutoff': 1901,
		'wpk.filterGain': 2.839,
		'wpk.q': 0.3547
	},
	39: {
		'trim.level': 1.861,
		'bp.cutoff': 750.1,
		'bp.q': 2.753,
		'd1.delayTime': 0.00686,
		'd2.delayTime': 0.02748,
		'hite.envA': 0.00098,
		'hite.envD': 0.01956,
		'hite.envR': 0.04399,
		'taile.envA': 0.0398,
		'taile.envD': 0.5156,
		'taile.envR': 0.03022,
		'tg.level': 0.4679,
		'vm.outHi': 4.18,
		'vm.outLo': 1.353
	},
	40: {
		'trim.level': 1.32,
		'body.cutoff': 3190,
		'body.filterGain': 25.32,
		'body.q': 2.441,
		'm1.mode1': 2.536,
		'm1.mode2': 2.368,
		'm1.mode3': 2.374,
		'm1.modeHz': 94.74,
		'm1.modeMix': 46.46,
		'm1.modeQ': 13.03,
		'stk.cutoff': 2229,
		'stk.q': 0.3553,
		'stksk.value': 0.277,
		'vm.outHi': 0.8317,
		'vm.outLo': 0.25,
		'wae.envA': 0.00246,
		'wae.envD': 0.5748,
		'wae.envR': 0.00788,
		'whp.cutoff': 265.4,
		'whp.q': 0.7512,
		'wlp.cutoff': 5533,
		'wlp.q': 0.7875,
		'wpk.cutoff': 1104,
		'wpk.filterGain': 3.064,
		'wpk.q': 0.1952
	},
	42: {
		'trim.level': 0.4622,
		'ampe.envA': 0.00069,
		'ampe.envD': 0.03466,
		'ampe.envR': 0.04471,
		'bp.cutoff': 19200,
		'bp.q': 0.3528,
		'f0.value': 590.5,
		'f1.value': 340.8,
		'f3.value': 1832,
		'f5.value': 2583,
		'ng.level': 0.8089,
		'stk.cutoff': 2078,
		'stk.q': 1.338,
		'stksk.value': 0.8202,
		'vm.outHi': 1.237,
		'vm.outLo': 0.3686
	},
	44: {
		'trim.level': 1.085,
		'ampe.envA': 0.00069,
		'ampe.envD': 0.03466,
		'ampe.envR': 0.04471,
		'bp.cutoff': 19200,
		'bp.q': 0.3528,
		'f0.value': 590.5,
		'f1.value': 340.8,
		'f3.value': 1832,
		'f5.value': 2583,
		'ng.level': 0.8089,
		'vm.outHi': 1.237,
		'vm.outLo': 0.3686
	},
	46: {
		'trim.level': 0.85,
		'ampe.envA': 0.00131,
		'ampe.envD': 1,
		'ampe.envR': 0.00817,
		'bp.cutoff': 8617,
		'bp.q': 0.6897,
		'f0.value': 795.7,
		'f1.value': 396.6,
		'f3.value': 481.8,
		'f5.value': 537.3,
		'ng.level': 1,
		'stk.cutoff': 4866,
		'stk.q': 0.3575,
		'stksk.value': 0.5104,
		'vm.outHi': 0.762
	},
	49: {
		'trim.level': 1.032,
		'f0.value': 1042,
		'f1.value': 410.3,
		'f2.value': 1456,
		'f3.value': 415.2,
		'f5.value': 2412,
		'hite.envA': 0.00196,
		'hite.envD': 0.2143,
		'hite.envR': 0.01477,
		'mg.level': 1.554,
		'mhp.cutoff': 16180,
		'mhp.q': 0.47,
		'nbp.cutoff': 1257,
		'nbp.q': 0.2281,
		'vm.outHi': 0.5606,
		'vm.outLo': 0.1007,
		'washe.envA': 0.01273,
		'washe.envD': 4.5,
		'washe.envR': 0.00583
	},
	51: {
		'trim.level': 0.2929,
		'f0.value': 413.3,
		'f1.value': 335.7,
		'f3.value': 1808,
		'f5.value': 4771,
		'mhp.cutoff': 3129,
		'mhp.q': 0.8243,
		'ng.level': 0.6851,
		'nlp.cutoff': 4583,
		'nlp.q': 0.4172,
		'vm.outHi': 0.9189,
		'vm.outLo': 0.1941,
		'washe.envA': 0.01495,
		'washe.envD': 9.563,
		'washe.envR': 0.00698
	},
	55: {
		'trim.level': 0.4201
	},
	56: {
		'trim.level': 2,
		'af.value': 188.1,
		'bf.value': 455.5,
		'bp.cutoff': 1923,
		'bp.q': 2.402,
		'hite.envA': 0.0002,
		'hite.envD': 0.02215,
		'hite.envR': 0.03447,
		'rg.level': 0.2557,
		'ringe.envA': 0.00144,
		'ringe.envD': 0.8332,
		'ringe.envR': 0.03753,
		'vm.outHi': 0.9459,
		'vm.outLo': 0.1838
	},
	57: {
		'trim.level': 0.8519,
		'f0.value': 1166,
		'f1.value': 459.1,
		'f2.value': 1629,
		'f3.value': 464.7,
		'f5.value': 2700,
		'hite.envA': 0.00196,
		'hite.envD': 0.2143,
		'hite.envR': 0.01477,
		'mg.level': 1.554,
		'mhp.cutoff': 16180,
		'mhp.q': 0.47,
		'nbp.cutoff': 1257,
		'nbp.q': 0.2281,
		'vm.outHi': 0.5606,
		'vm.outLo': 0.1007,
		'washe.envA': 0.01273,
		'washe.envD': 4.5,
		'washe.envR': 0.00583
	},
	59: {
		'trim.level': 0.2636,
		'f1.value': 335.7,
		'f3.value': 1808,
		'f5.value': 4771,
		'mhp.cutoff': 3129,
		'mhp.q': 0.8243,
		'ng.level': 0.6851,
		'nlp.cutoff': 4583,
		'nlp.q': 0.4172,
		'vm.outHi': 0.9189,
		'vm.outLo': 0.1941,
		'washe.envA': 0.01495,
		'washe.envD': 9.563,
		'washe.envR': 0.00698
	},
	76: {
		'trim.level': 1.992,
		'bste.envA': 0.00025,
		'bste.envD': 0.08986,
		'bste.envR': 0.03519,
		'r1.cutoff': 1400,
		'r1.q': 14.94,
		'r2.cutoff': 4916,
		'r2.q': 4.763,
		'r2g.level': 0.2352,
		'stk.cutoff': 2782,
		'stk.q': 1.573,
		'stksk.value': 0.1965,
		'vm.outHi': 4.08,
		'vm.outLo': 1.2
	},
	77: {
		'trim.level': 1.861,
		'bste.envA': 0.00025,
		'bste.envD': 0.08986,
		'bste.envR': 0.03519,
		'r1.cutoff': 982.5,
		'r1.q': 14.94,
		'r2.cutoff': 3450,
		'r2.q': 4.763,
		'r2g.level': 0.2352,
		'stk.cutoff': 1953,
		'stk.q': 1.573,
		'stksk.value': 0.1965,
		'vm.outHi': 5.6,
		'vm.outLo': 1.64
	}
};



export function jazzKit(): Record<number, Partial<TrackData>> {
	const gm = (n: number) => 108 - n;
	const keys: Record<number, Partial<TrackData>> = {
		[gm(35)]: kick(52, 30),
		[gm(36)]: kick(60, 24),
		// Side stick: the stick laid across, its shaft cracking on the rim.
		[gm(37)]: bar(1150, [1, 2.2, 3.6], 10, 90, 0.9, 0.3),
		[gm(38)]: snare(195, 0.25, 0.24),
		/* A hand clap: a burst through the cupped hands' band, the same burst
		   again a few ms on (the palms do not meet at once), and a short tail.
		   The SPACE it had was a reverb per clap; the tail is the room now. */
		[gm(39)]: new Voice()
			.n('nz', 'noise')
			.n('bp', 'filter', { type: BP, cutoff: 1300, q: 1.4 })
			.w('nz>bp')
			.vca('hit', 'bp', { envA: 0.0005, envD: 0.014 }, ['d1', 'd2', 'v'])
			.n('d1', 'delay', { delayTime: 0.009 })
			.n('d2', 'delay', { delayTime: 0.021 })
			.w('d1>v', 'd2>v')
			.vca('tail', 'bp', { envA: 0.015, envD: 0.18 }, 'tg')
			.n('tg', 'gain', { level: 0.5 })
			.vel('v', 0.25, ['tg'], 'trim')
			.layout(
				[
					['HANDS', ['nz', 'bp']],
					['CLAP', ['hite', 'hit', 'd1', 'd2']],
					['TAIL', ['taile', 'tail', 'tg']],
					['LEVEL', ['vm', 'v']]
				],
				[
					["Noise in the cupped hands' band.", 'bp'],
					['A burst, and the same burst again: the palms do not meet at once.', 'd1'],
					['A short swell of the same band: the room, in place of a reverb per clap.', 'tail']
				]
			)
			.done(0.8, 2),
		// A tighter, brighter snare: more wire, a harder crack.
		[gm(40)]: snare(230, 0.4, 0.2),
		[gm(41)]: tom(82, 20),
		[gm(42)]: hat(0.09),
		[gm(43)]: tom(98, 20),
		[gm(44)]: hat(0.08, true),
		[gm(45)]: tom(112, 18),
		[gm(46)]: hat(0.9),
		[gm(47)]: tom(132, 16),
		[gm(48)]: tom(155, 16),
		[gm(49)]: cymbal({ base: 420, decay: 4, hp: 3200, metal: 0.55 }),
		[gm(50)]: tom(185, 14),
		[gm(51)]: ride({ base: 380, decay: 5, hp: 4200 }),
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
			.n('bp', 'filter', { type: BP, cutoff: 950, q: 1.2 })
			.w('a>bp', 'b>bp')
			.vca('hit', 'bp', { envA: 0.0005, envD: 0.04 }, 'v')
			.vca('ring', 'bp', { envA: 0.0005, envD: 0.35 }, 'rg')
			.n('rg', 'gain', { level: 0.35 })
			.vel('v', 0.25, ['rg'], 'trim')
			.layout(
				[
					['BELL', ['a', 'af', 'b', 'bf', 'bp']],
					['STRIKE', ['hite', 'hit', 'ringe', 'ring', 'rg']],
					['LEVEL', ['vm', 'v']]
				],
				[
					['Two squares through a band: the bell, a cowbell being two plates bent.', 'bp'],
					['A hard hit that drops fast, over a ring that lasts.', 'hit']
				]
			)
			.done(0.9, 0.6),
		[gm(57)]: cymbal({ base: 470, decay: 4.5, hp: 2800, metal: 0.5 }),
		// Vibraslap: the beads in the box rattling, fast then slowing out.
		[gm(58)]: grains(2600, 1.5, 0.9, 0.001, 32, 1),
		[gm(59)]: ride({ base: 410, decay: 4.5, hp: 4800 }),
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
		[gm(76)]: woodBlock(2850),
		[gm(77)]: woodBlock(2000),
		[gm(78)]: cuica(620, 520, 0.14),
		[gm(79)]: cuica(330, 520, 0.4),
		// The triangle: a steel rod, bright partials that ring and ring -- or a hand stops it.
		[gm(80)]: bar(3800, [1, 1.87, 2.73], 12, 95, 0.4, 0.3),
		[gm(81)]: bar(3800, [1, 1.87, 2.73], 150, 95, 0.4, 3)
	};
	for (const [n, knobs] of Object.entries(JAZZ_TUNED)) {
		const k = keys[gm(+n)];
		k.graphParams = { ...k.graphParams, ...knobs };
	}
	return keys;
}
