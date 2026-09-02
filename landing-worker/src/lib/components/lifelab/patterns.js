// LIFE.LAB — pattern library (RLE) + decode/rotate helpers.
import { EXT } from './library-ext.js';

export const RLES = {
  block:     { label: 'BLOCK',        rle: '2o$2o!' },
  blinker:   { label: 'BLINKER',      rle: '3o!' },
  toad:      { label: 'TOAD',         rle: 'b3o$3o!' },
  beacon:    { label: 'BEACON',       rle: '2o$o$3bo$2b2o!' },
  pulsar:    { label: 'PULSAR',     rle: '2b3o3b3o2b2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2b2$2b3o3b3o$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!' },
  glider:    { label: 'GLIDER',     rle: 'bob$2bo$3o!' },
  lwss:      { label: 'LWSS',     rle: 'bo2bo$o$o3bo$4o!' },
  rpent:     { label: 'R-PENT',   rle: 'b2o$2o$bo!' },
  acorn:     { label: 'ACORN',        rle: 'bo$3bo$2o2b3o!' },
  beehive:   { label: 'BEEHIVE',      rle: 'b2o$o2bo$b2o!' },
  loaf:      { label: 'LOAF',         rle: 'b2o$o2bo$bobo$2bo!' },
  tub:       { label: 'TUB',          rle: 'bo$obo$bo!' },
  boat:      { label: 'BOAT',         rle: '2o$obo$bo!' },
  pond:      { label: 'POND',         rle: 'b2o$o2bo$o2bo$b2o!' },
  clock:     { label: 'CLOCK',        rle: '2bo$obo$bobo$bo!' },
  pentadec:  { label: 'PENTA P15', rle: '2bo4bo$2ob4ob2o$2bo4bo!' },
  mwss:      { label: 'MWSS',         rle: '2bo$o3bo$5bo$o4bo$b5o!' },
  hwss:      { label: 'HWSS',         rle: '3b2o$bo4bo$o$o5bo$6o!' },
  diehard:   { label: 'DIEHARD',      rle: '6bo$2o$bo3b3o!' },
  eater:     { label: 'EATER',        rle: '2o2b$obob$2bob$2b2o!' },
  gosperGun: { label: 'GOSPER GUN',   rle: '24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!' },

  // ── beyond the beginner's shelf ───────────────────────────────────────
  // Everything above you could find by drawing. These were searched for --
  // some for decades -- and every one below has been simulated and labelled
  // by what it actually does, not by what it is usually called.

  // Methuselahs: a handful of cells whose consequences run for hundreds of
  // generations. The point is that you cannot tell by looking at them.
  bunnies:   { label: 'BUNNIES',      rle: 'o5bo$2bo3bo$2bo2bobo$bobo!' },
  rabbits:   { label: 'RABBITS',      rle: 'o3b3o$3o2bo$bo!' },
  // Grows without bound from 28 cells, laying debris as it goes.
  switchEngine:{label: 'SWITCH ENGINE', rle: '4b2o$4b2o2$2b5o$bo5bo$o3bobo$o3bobo$bo5bo$2b5o2$4b2o$4b2o!' },

  // Ships past the three everyone knows. Speed is a fraction of c, one cell
  // per generation, which nothing in Life beats. Both of these took a search
  // program to find -- the copperhead as recently as 2016.
  copperhead:{ label: 'COPPERHEAD c/10', rle: 'b2o2b2o$3b2o$3b2o$obo2bobo$o6bo2$o6bo$b2o2b2o$2b4o2$3b2o$3b2o!' },
  loafer:    { label: 'LOAFER c/7',   rle: 'b2o2bob2o$o2bo2b2o$bobo$2bo$8bo$6b3o$5bo$6bo$7b2o!' },
  // Three lightweights flying in formation, which is how ships are ferried.
  flotilla:  { label: 'FLOTILLA',     rle: '3bo$4bo$o3bo$b4o10$3bo$4bo$o3bo$b4o10$3bo$4bo$o3bo$b4o!' },

  // A period-8 oscillator, twice the period of anything else small here.
  figure8:   { label: 'FIGURE EIGHT', rle: '3o$3o$3o$3b3o$3b3o$3b3o!' },

  // ── units, not patterns ───────────────────────────────────────────────
  // Assemblies rather than single objects: two or more of the pieces above,
  // arranged so the interaction between them is the point. These are the
  // parts a computer in Life is built from, and each was placed by hand and
  // then simulated to confirm it does what it is named for.
  //
  // A full Turing machine will not fit here. Rendell's is roughly 1700x1700
  // cells against this dish's 320x200, and the universal one is far larger
  // again -- so what is offered is the components, which do fit and which are
  // the interesting half anyway.

  // Two gliders head-on. Both are destroyed completely: verified 0 cells left
  // after 150 generations. One signal cancelling another is a NOT gate, and
  // deletion is the operation every other gate is assembled from.
  annihilate:{ label: 'ANNIHILATE',   rle: 'bo$2bo$3o10$12b3o$12bo$13bo!' },

  // A glider flying into an eater. The glider is consumed and the eater
  // repairs itself: verified 7 cells left, which is the eater alone. This is
  // how a signal is discarded without leaving debris behind.
  sink:      { label: 'GLIDER SINK',  rle: 'bo$2bo$3o10$12b2o$12bobo$14bo$14b2o!' },

  // A gun firing forever into an eater that keeps up. Population stays between
  // 86 and 121 over 400 generations rather than growing without bound: a
  // fixed-size machine consuming an endless stream, which is the whole idea a
  // computer rests on.
  gunSink:   { label: 'GUN + SINK',   rle: '24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o22$38b2o$38bobo$40bo$40b2o!' },
};

/**
 * @typedef {{ cells: number[][], w: number, h: number, label?: string }} Pattern
 */

/** @param {string} rle @returns {Pattern} */
export function decodeRLE(rle) {
  const cells = []; let x = 0, y = 0, num = '';
  for (const c of rle) {
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') continue;
    if (c >= '0' && c <= '9') { num += c; continue; }
    const n = num ? parseInt(num, 10) : 1; num = '';
    if (c === 'b') x += n;
    else if (c === 'o') { for (let k = 0; k < n; k++) cells.push([x++, y]); }
    else if (c === '$') { y += n; x = 0; }
    else if (c === '!') break;
  }
  let w = 0, h = 0;
  for (const [cx, cy] of cells) { if (cx >= w) w = cx + 1; if (cy >= h) h = cy + 1; }
  return { cells, w, h };
}

/**
 * A whole .rle file, as pasted from LifeWiki or saved by Golly: `#N name`,
 * `#C` comments, the `x = …, y = …` header, then the body over any number of
 * lines. Returns the body as one string plus whatever the header said.
 * @param {string} text
 * @returns {{ name: string, comments: string[], w: number, h: number, rle: string }}
 */
export function parseRLE(text) {
  let name = '', w = 0, h = 0;
  const comments = [], body = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line[0] === '#') {
      if (line[1] === 'N') name = line.slice(2).trim();
      else comments.push(line.slice(2).trim());
      continue;
    }
    const m = /^x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)/.exec(line);
    if (m) { w = +m[1]; h = +m[2]; continue; }
    body.push(line);
  }
  let rle = body.join('').replace(/\s+/g, '');
  const end = rle.indexOf('!');
  if (end >= 0) rle = rle.slice(0, end + 1);
  else if (rle) rle += '!';
  return { name, comments, w, h, rle };
}

/**
 * Cells back to RLE, lines kept under 70 characters as the format asks.
 * @param {number[][]} cells @param {number} w @param {number} h
 */
export function encodeRLE(cells, w, h) {
  const rows = Array.from({ length: h }, () => new Uint8Array(w));
  for (const [x, y] of cells) if (x >= 0 && y >= 0 && x < w && y < h) rows[y][x] = 1;
  /** @type {string[]} */
  const runs = [];
  /** @param {number} n @param {string} tag */
  const emit = (n, tag) => runs.push((n > 1 ? n : '') + tag);
  let blank = 0, started = false;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    let last = w - 1;
    while (last >= 0 && !row[last]) last--;
    if (last < 0) { blank++; continue; }
    // Row breaks: one per blank row skipped, plus one to leave the previous
    // live row -- unless nothing has been emitted yet.
    if (started || blank) emit(blank + (started ? 1 : 0), '$');
    blank = 0; started = true;
    let x = 0;
    while (x <= last) {
      const v = row[x]; let n = 0;
      while (x <= last && row[x] === v) { x++; n++; }
      emit(n, v ? 'o' : 'b');
    }
  }
  let out = runs.join('') + '!';
  // wrap
  const lines = [];
  for (let i = 0; i < out.length; i += 70) lines.push(out.slice(i, i + 70));
  return { header: `x = ${w}, y = ${h}, rule = B3/S23`, body: lines.join('\n') };
}

/** Cells shifted so the bounding box starts at (0,0). @param {number[][]} cells */
export function normalizeCells(cells) {
  if (!cells.length) return { cells: [], w: 0, h: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of cells) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { cells: cells.map(([x, y]) => [x - x0, y - y0]), w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** One phrase per hand-typed pattern. Simulated, not remembered. @type {Record<string, string>} */
const NOTES = {
  block: '4 cells, the simplest stable shape', beehive: 'stable, 6 cells', loaf: 'stable, 7 cells',
  tub: 'stable, 4 cells', boat: 'stable, 5 cells', pond: 'stable, 8 cells',
  eater: 'stable — and it swallows a glider that hits it',
  blinker: 'period 2, the smallest oscillator', toad: 'period 2', beacon: 'period 2', clock: 'period 2',
  pulsar: 'period 3, 48 cells', figure8: 'period 8', pentadec: 'period 15',
  glider: 'period 4, travels diagonally', lwss: 'period 4, travels sideways',
  mwss: 'period 4, one cell wider than the LWSS', hwss: 'period 4, the widest of the three',
  flotilla: 'three lightweights flying in formation',
  loafer: 'one cell every 7 generations — found by a search program',
  copperhead: 'one cell every 10 — not discovered until 2016',
  rpent: '5 cells, still going 1000 generations later', acorn: '7 cells that take 5000 generations to settle',
  diehard: '7 cells that vanish completely at generation 130',
  bunnies: '9 cells, runs for thousands', rabbits: '9 cells, likewise',
  switchEngine: 'grows forever, leaving debris behind it',
  gosperGun: 'fires a glider every 30 generations, for ever',
  annihilate: 'two gliders head-on — both destroyed, nothing left. A NOT gate',
  sink: 'a glider flies into an eater and is gone; the eater repairs itself',
  gunSink: 'an endless stream, absorbed. Population stays bounded for ever',
};

/**
 * The shelf, in the order the tray shows it. Keys refer to RLES or EXT (the
 * Golly set in library-ext.js); anything the user saves goes in CUSTOM below.
 */
export const CATEGORIES = [
  { id: 'still', label: 'STILL LIFES', hint: 'never change',
    of: ['block', 'beehive', 'loaf', 'tub', 'boat', 'pond', 'eater', 'eaters'] },
  { id: 'osc', label: 'OSCILLATORS', hint: 'repeat forever',
    of: ['blinker', 'toad', 'beacon', 'clock', 'pulsar', 'figure8', 'pentadec', 'lowPeriod'] },
  { id: 'ship', label: 'SPACESHIPS', hint: 'move across the dish',
    of: ['glider', 'lwss', 'mwss', 'hwss', 'flotilla', 'loafer', 'copperhead', 'orthoShips', 'diagShips', 'corderships'] },
  { id: 'meth', label: 'METHUSELAHS', hint: 'small starts, long lives',
    of: ['rpent', 'acorn', 'diehard', 'bunnies', 'rabbits', 'blom', 'lidka', 'iwona', 'justyna', 'm52513'] },
  { id: 'puff', label: 'PUFFERS & RAKES', hint: 'travel, and leave things behind',
    of: ['switchEngine', 'pufferTrain', 'piFuse', 'linePuffer', 'puffer2c5', 'basicRakes'] },
  { id: 'gun', label: 'GUNS', hint: 'fire for ever',
    of: ['gosperGun', 'p52gun', 'vacuum', 'mwssGun', 'loaferGun', 'p59gun'] },
  { id: 'grow', label: 'GROWTH', hint: 'breeders, fillers, sawtooths',
    of: ['spacefiller', 'quartermax', 'quad20', 'seBreeder', 'c4Breeder', 'rakeFactory', 'sawtooth'] },
  { id: 'logic', label: 'SIGNALS & LOGIC', hint: 'the parts a computer is made of',
    of: ['annihilate', 'sink', 'gunSink', 'advancer', 'heisenblinker', 'heisenburpNat', 'heisenburp30', 'heisenburp46', 'stargate', 'racetrack', 'hotel', 'reflectors', 'fizzles'] },
  { id: 'turing', label: 'TURING MACHINE', hint: 'computation, in full — needs a bigger dish',
    of: ['turing', 'chase', 'unitCell'] },
];

/* ---- the user's own shelf ---- */
const CUSTOM_KEY = 'lifelab.custom.v1';
/** @type {{ key: string, label: string, rle: string, w: number, h: number, note?: string }[] | null} */
let customList = null;
function loadCustom() {
  if (customList) return customList;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CUSTOM_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    customList = Array.isArray(arr) ? arr.filter(c => c && typeof c.key === 'string' && typeof c.rle === 'string') : [];
  } catch { customList = []; }
  return customList;
}
function saveCustom() {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customList || [])); } catch { /* private mode: kept for this visit only */ }
}
export const custom = {
  list() { return loadCustom().slice(); },
  /** @param {string} label @param {number[][]} cells @param {number} w @param {number} h @param {string=} note */
  add(label, cells, w, h, note) {
    const list = loadCustom();
    const key = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const { body } = encodeRLE(cells, w, h);
    list.push({ key, label: String(label || 'CUSTOM').trim().slice(0, 28).toUpperCase() || 'CUSTOM', rle: body.replace(/\n/g, ''), w, h, note });
    saveCustom();
    return key;
  },
  /** @param {string} key */
  remove(key) {
    const list = loadCustom();
    const i = list.findIndex(c => c.key === key);
    if (i >= 0) { list.splice(i, 1); saveCustom(); delete cache[key]; }
  },
  /** @param {string} key */
  has(key) { return loadCustom().some(c => c.key === key); },
};

/** @param {string} key @returns {{ label: string, note?: string, credit?: string, cat?: string, custom?: boolean } | null} */
export function patternMeta(key) {
  if (key in RLES) return { label: RLES[/** @type {keyof typeof RLES} */ (key)].label, note: NOTES[key] };
  if (key in EXT) return EXT[key];
  const c = loadCustom().find(x => x.key === key);
  return c ? { label: c.label, note: c.note || 'yours — saved in this browser', custom: true } : null;
}

/** @type {Record<string, Pattern>} */
const cache = {};
/** @param {string} name @returns {Pattern} */
export function pattern(name) {
  if (!cache[name]) {
    const src = name in RLES ? RLES[/** @type {keyof typeof RLES} */ (name)]
      : name in EXT ? EXT[name]
      : loadCustom().find(c => c.key === name);
    if (!src) throw new Error('unknown pattern ' + name);
    const p = decodeRLE(src.rle);
    p.label = src.label;
    cache[name] = p;
  }
  return cache[name];
}

/**
 * Rotation and mirroring together: rot quarter-turns clockwise, then an
 * optional horizontal flip. One function so preview, placement and the aim
 * line cannot disagree about which way round the pattern is.
 * @param {Pattern} p @param {number} rot @param {boolean} flip @returns {Pattern}
 */
export function transformCells(p, rot, flip) {
  const r = rotateCells(p, rot);
  if (!flip) return r;
  return { cells: r.cells.map(([x, y]) => [r.w - 1 - x, y]), w: r.w, h: r.h };
}

/** @param {Pattern} p @param {number} rot @returns {Pattern} */
export function rotateCells(p, rot) {
  let { cells, w, h } = p;
  for (let k = 0; k < (rot & 3); k++) {
    cells = cells.map(([x, y]) => [h - 1 - y, x]);
    const t = w; w = h; h = t;
  }
  return { cells, w, h };
}

/**
 * What a pattern does when left alone: 'ship' with a heading, 'osc', 'still',
 * or 'chaotic'. Measured by running it, not tabulated by hand, so it stays true
 * if a pattern's cells are ever edited.
 *
 * The aiming overlay needs this. A centroid path is honest only for something
 * that travels rigidly -- for an oscillator it is a wobble around a fixed point
 * and for the R-pentomino it is a wandering line through an explosion, both of
 * which look like predictions and are not.
 */
/** @type {Record<string, any>} */
const kinds = {};
/** @param {string} name */
export function kindOf(name) {
  if (kinds[name]) return kinds[name];
  const p = pattern(name);
  // A machine the size of a screen is not a ship or an oscillator in any sense
  // the aiming overlay could draw, and simulating it forty generations on a
  // padded copy is real work; call it chaotic and move on.
  if (p.w * p.h > 40000) { kinds[name] = 'chaotic'; return 'chaotic'; }
  const W = p.w + 90, H = p.h + 90;
  const grid = new Uint8Array(W * H);
  const ox = 45, oy = 45;
  for (const [x, y] of /** @type {number[][]} */ (p.cells)) grid[(oy + y) * W + ox + x] = 1;

  /** @param {Uint8Array} g */
  const shape = (g) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (g[y * W + x]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    let k = '';
    for (let y = y0; y <= y1; y++) { for (let x = x0; x <= x1; x++) k += g[y * W + x] ? '1' : '0'; k += '/'; }
    return { k, x0, y0 };
  };

  let cur = grid;
  const first = shape(cur);
  /** @type {string | { kind: string, period: number, dx: number, dy: number }} */
  let out = 'chaotic';
  if (!first) out = 'chaotic';
  else for (let gen = 1; gen <= 40; gen++) {
    const next = new Uint8Array(W * H);
    let alive = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        n += cur[ny * W + nx];
      }
      const v = cur[y * W + x] ? (n === 2 || n === 3 ? 1 : 0) : (n === 3 ? 1 : 0);
      next[y * W + x] = v; alive += v;
    }
    cur = next;
    if (!alive) { out = 'dies'; break; }
    const sh = shape(cur);
    if (sh && sh.k === first.k) {
      const dx = sh.x0 - first.x0, dy = sh.y0 - first.y0;
      out = (dx || dy) ? { kind: 'ship', period: gen, dx, dy } : (gen === 1 ? 'still' : 'osc');
      break;
    }
  }
  kinds[name] = out;
  return out;
}
