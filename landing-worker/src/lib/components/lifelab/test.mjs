// LIFE.LAB — the library is checked by simulating it.
//
// This used to test a campaign. It now tests the only claim the app makes:
// that each pattern is what its label says. That claim is easy to get wrong --
// writing these by hand produced an MWSS identical to the LWSS, a "Simkin gun"
// that was a period-2 blinker farm, and three labels naming behaviour the cells
// did not have. Every one was caught here rather than by a reader, which is the
// entire reason this file exists.
import { Life } from './engine.js';
import { pattern, RLES } from './patterns.js';
import { LEVELS } from './levels.js';

let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
}

const MARGIN = 60;
function liveCells(e) {
  const out = [];
  for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) if (e.get(x, y)) out.push([x, y]);
  return out;
}

/**
 * What a pattern actually does, from running it.
 *
 * Positions only: the engine stores a cell's age, so two identical shapes of
 * different ages must still compare equal or every oscillator reads as chaos.
 */
function classify(name, gens = 900) {
  const p = pattern(name);
  const size = MARGIN * 2 + Math.max(p.w, p.h);
  const e = new Life(size, size);
  for (const [x, y] of p.cells) e.set(MARGIN + x, MARGIN + y, 1);

  const seen = new Map();
  let peak = p.cells.length;
  for (let gen = 0; gen <= gens; gen++) {
    const live = liveCells(e);
    if (!live.length) return { kind: 'dies', gen };
    peak = Math.max(peak, live.length);
    const xs = live.map((c) => c[0]);
    const ys = live.map((c) => c[1]);
    const minx = Math.min(...xs);
    const miny = Math.min(...ys);
    // Once it touches the edge the readings mean nothing, and anything that
    // gets that far from a small start is growing or travelling.
    if (minx <= 1 || miny <= 1 || Math.max(...xs) >= size - 2 || Math.max(...ys) >= size - 2)
      return { kind: 'unbounded', gen, peak, start: p.cells.length };
    const key = live.map(([x, y]) => `${x - minx},${y - miny}`).sort().join(';');
    const prev = seen.get(key);
    if (prev) {
      const period = gen - prev.gen;
      const dx = minx - prev.minx;
      const dy = miny - prev.miny;
      if (!dx && !dy)
        return period === 1 ? { kind: 'still', pop: live.length } : { kind: 'oscillator', period, pop: live.length };
      return { kind: 'ship', period, dx, dy };
    }
    seen.set(key, { gen, minx, miny });
    e.step();
  }
  return { kind: 'longrun', peak };
}

// ── the dish ─────────────────────────────────────────────────────────────
check('there is exactly one level', LEVELS.length === 1, LEVELS.length + ' found');
check('it is the sandbox', LEVELS[0].sandbox === true);
check('it offers every pattern', LEVELS[0].stamps === 'all');
check('it can draw and erase', ['pan', 'draw', 'erase'].every((t) => LEVELS[0].tools.includes(t)));

// ── every pattern is distinct ────────────────────────────────────────────
{
  const shapes = new Map();
  let dupes = 0;
  for (const n of Object.keys(RLES)) {
    const key = pattern(n).cells.map(([x, y]) => `${x},${y}`).sort().join(';');
    if (shapes.has(key)) { dupes++; console.log('       ' + n + ' is identical to ' + shapes.get(key)); }
    shapes.set(key, n);
  }
  check('every pattern is a different shape', dupes === 0, shapes.size + ' shapes for ' + Object.keys(RLES).length + ' names');
}

// ── each pattern does what its label says ────────────────────────────────
// The expectation is the behaviour, not the name: a "GUN" must actually grow
// without bound, a "c/7" ship must actually move one cell every 7 generations.
const EXPECT = {
  block: { kind: 'still' }, beehive: { kind: 'still' }, loaf: { kind: 'still' },
  tub: { kind: 'still' }, boat: { kind: 'still' }, pond: { kind: 'still' },
  eater: { kind: 'still' },

  blinker: { kind: 'oscillator', period: 2 }, toad: { kind: 'oscillator', period: 2 },
  beacon: { kind: 'oscillator', period: 2 }, clock: { kind: 'oscillator', period: 2 },
  pulsar: { kind: 'oscillator', period: 3 }, figure8: { kind: 'oscillator', period: 8 },
  pentadec: { kind: 'oscillator', period: 15 },

  glider: { kind: 'ship', period: 4, diagonal: true },
  lwss: { kind: 'ship', period: 4 }, mwss: { kind: 'ship', period: 4 },
  flotilla: { kind: 'ship', period: 4 },
  loafer: { kind: 'ship', period: 7 },      // c/7, as the label claims
  copperhead: { kind: 'ship', period: 10 }, // c/10

  rpent: { kind: 'unbounded' }, acorn: { kind: 'unbounded' },
  bunnies: { kind: 'unbounded' }, rabbits: { kind: 'unbounded' },
  switchEngine: { kind: 'unbounded' }, gosperGun: { kind: 'unbounded' },
  diehard: { kind: 'dies' },
};

for (const [name, want] of Object.entries(EXPECT)) {
  const got = classify(name);
  let ok = got.kind === want.kind;
  if (ok && want.period !== undefined) ok = got.period === want.period;
  if (ok && want.diagonal) ok = Math.abs(got.dx) === Math.abs(got.dy);
  const desc =
    got.kind === 'ship' ? `ship p${got.period} (${got.dx},${got.dy})`
      : got.kind === 'oscillator' ? `oscillator p${got.period}`
        : got.kind === 'dies' ? `dies at gen ${got.gen}`
          : got.kind;
  check(`${RLES[name].label} is ${want.kind}${want.period ? ' period ' + want.period : ''}`, ok, '-> ' + desc);
}

// A methuselah has to run a long time from very little, or it is just noise.
for (const n of ['rpent', 'acorn', 'bunnies', 'rabbits']) {
  const r = classify(n);
  check(`${RLES[n].label} runs a long way from a small start`,
    r.kind === 'unbounded' && r.gen > 200 && r.start <= 10,
    `${r.start} cells, still going at gen ${r.gen}`);
}

// ── the units ────────────────────────────────────────────────────────────
// These are the claims that matter most, because they are what "you can build
// a computer out of this" rests on.
function popAfter(name, gens, size = 260) {
  const p = pattern(name);
  const e = new Life(size, size);
  for (const [x, y] of p.cells) e.set(60 + x, 60 + y, 1);
  const pops = [];
  for (let g = 0; g <= gens; g++) { pops.push(e.pop); e.step(); }
  return { final: e.pop, tail: pops.slice(-80) };
}
{
  const r = popAfter('annihilate', 150);
  check('ANNIHILATE leaves nothing at all', r.final === 0, r.final + ' cells left');
}
{
  const r = popAfter('sink', 220);
  check('GLIDER SINK eats the glider and repairs itself', r.final === 7, r.final + ' cells left (the eater is 7)');
}
{
  const r = popAfter('gunSink', 400);
  const lo = Math.min(...r.tail);
  const hi = Math.max(...r.tail);
  check('GUN + SINK stays bounded while the gun fires for ever',
    hi < 200 && lo > 0, `population settles between ${lo} and ${hi}`);
}

// Every pattern the library lists must exist, or the sidebar renders a gap.
{
  const missing = [];
  for (const n of Object.keys(EXPECT)) if (!RLES[n]) missing.push(n);
  check('every tested pattern exists in the library', missing.length === 0, missing.join(', '));
}

console.log('');
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
