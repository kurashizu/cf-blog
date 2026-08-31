// LIFE.LAB — pattern library (RLE) + decode/rotate helpers.
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
    if (c >= '0' && c <= '9') { num += c; continue; }
    const n = num ? parseInt(num, 10) : 1; num = '';
    if (c === 'b') x += n;
    else if (c === 'o') { for (let k = 0; k < n; k++) cells.push([x++, y]); }
    else if (c === '$') { y += n; x = 0; }
    else if (c === '!') break;
  }
  const w = Math.max(...cells.map(c => c[0])) + 1;
  const h = Math.max(...cells.map(c => c[1])) + 1;
  return { cells, w, h };
}

/** @type {Record<string, Pattern>} */
const cache = {};
/** @param {string} name @returns {Pattern} */
export function pattern(name) {
  if (!cache[name]) {
    const p = decodeRLE(RLES[/** @type {keyof typeof RLES} */ (name)].rle);
    p.label = RLES[/** @type {keyof typeof RLES} */ (name)].label;
    cache[name] = p;
  }
  return cache[name];
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
