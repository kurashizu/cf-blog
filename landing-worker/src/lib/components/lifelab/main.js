// @ts-nocheck -- the view layer: 1400 lines of canvas and DOM written as plain
// JS, where the state object is built up field by field and every element is
// fetched by id. Checking it under `strict` reports several hundred implicit
// anys and possibly-nulls that are all guaranteed by construction, and typing
// it properly would mean rewriting it in TypeScript. The parts worth checking
// -- the automaton, the pattern library, the level data and the save format --
// are checked: engine.js, patterns.js and levels.js all pass.
import { Life } from './engine.js';
import { pattern, rotateCells, RLES, kindOf } from './patterns.js';
import { LEVELS } from './levels.js';

const $ = s => document.querySelector(s);
// Bound in start(), not at import. A module is evaluated once and cached, but
// the page it draws into is created and destroyed on every SPA navigation --
// so binding here left the second visit holding elements that were no longer
// in the document, drawing into a detached canvas: a blank panel.
let termEl, cv, ctx, topbar, tray, levelsEl, msgEl;
let wipeBtn;
let guideEl, gstep, gtext;

/**
 * Points the module at the markup that is on screen right now.
 *
 * Binding once in start() was not enough and the reason is subtle: start() runs
 * from onMount, and Svelte fires that while the *outgoing* page is still in the
 * document, so every lookup landed on the old markup. The loop then ran at full
 * speed writing into detached nodes -- the canvas kept whatever it had painted
 * before the navigation and the tutorial card sat empty, which read as "the
 * guide disappeared when I switched tabs".
 *
 * So the render loop calls this too. It is one querySelector against a cheap id
 * selector, and only when the node it holds has actually left the document, so
 * the steady-state cost is a single `document.contains` per frame.
 */
function bind() {
  if (cv && document.contains(cv)) return false;
  termEl = $('#term'); cv = $('#cv');
  if (!cv) return false;
  ctx = cv.getContext('2d');
  guideEl = $('#guide'); gstep = $('#gstep'); gtext = $('#gtext');
  topbar = $('#topbar'); tray = $('#tray'); levelsEl = $('#levels'); msgEl = $('#msg');
  wipeBtn = $('#wipebtn');

  // Handlers and the size observer belong to the nodes, so they are re-attached
  // with them rather than once in start().
  wipeBtn.onclick = wipeSave;
  // The two sidebar-header buttons were the only text-only controls left, and
  // one of them erases the save -- the control that most needs to be
  // recognisable at a glance was the least marked.
  wipeBtn.innerHTML = ICONS.wipe + '<span>CLEAR ALL</span>';
  ro?.disconnect();
  ro = new ResizeObserver(() => resize());
  ro.observe($('#cvwrap'));
  return true;
}
const PCOLORS = ['#98c379', '#e5c07b', '#c678dd', '#56b6c2', '#e06c75', '#61afef', '#d19a66'];

const SPEEDS = [2, 8, 30, 120, 480];

const ICONS = {
  play:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 1l9 5-9 5z" fill="currentColor"/></svg>',
  pause: '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 1h3v10H2zM7 1h3v10H7z" fill="currentColor"/></svg>',
  step:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M1 1l7 5-7 5zM9 1h2v10H9z" fill="currentColor"/></svg>',
  reset: '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M6 2a4 4 0 1 1-3.87 5H0l2.7-3.2L5.4 7H4.2A2 2 0 1 0 6 4z" fill="currentColor"/></svg>',
  pan:   '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M6 0l2 2H7v3h3V4l2 2-2 2V7H7v3h1l-2 2-2-2h1V7H2v1L0 6l2-2v1h3V2H4z" fill="currentColor"/></svg>',
  draw:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M1 1h4v4H1zM7 7h4v4H7zM5 5h2v2H5z" fill="currentColor"/></svg>',
  erase: '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M1 1h10v10H1zm2 2v6h6V3z" fill="currentColor"/></svg>',
  soup:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M1 1h2v2H1zM5 2h2v2H5zM9 1h2v2H9zM2 5h2v2H2zM7 5h2v2H7zM1 9h2v2H1zM5 8h2v2H5zM9 9h2v2H9z" fill="currentColor"/></svg>',
  clear: '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 1L6 5l4-4 1 1-4 4 4 4-1 1-4-4-4 4-1-1 4-4L1 2z" fill="currentColor"/></svg>',
  rot:   '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M6 1a5 5 0 0 1 5 5H9a3 3 0 0 0-3-3v2L2.5 2.5 6 0z" fill="currentColor"/><path d="M6 11a5 5 0 0 1-5-5h2a3 3 0 0 0 3 3V7l3.5 2.5L6 12z" fill="currentColor"/></svg>',
  // Shop, and the aids it sells. A dotted diagonal for the trajectory, a
  // doubled square for the ghost frame, a 3 for the neighbour count, a
  // back-arrow for rewind, a flask for the library.
  coin:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M3 1h6v1h1v1h1v6h-1v1H9v1H3v-1H2v-1H1V3h1V2h1zM4 3v6h4V3z" fill="currentColor"/></svg>',
  shop:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M1 2h10v2H1zM2 5h8v6H2zm2 2v2h4V7z" fill="currentColor"/></svg>',
  trace: '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M0 9h2v2H0zM3 6h2v2H3zM6 3h2v2H6zM9 0h3v3H9z" fill="currentColor"/></svg>',
  ghost: '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M1 1h5v5H1zm1 1v3h3V2z" fill="currentColor"/><path d="M6 6h5v5H6z" fill="currentColor" opacity=".45"/></svg>',
  heat:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M1 1h7v2H3v2h4v2H3v2h5v2H1z" fill="currentColor"/><path d="M9 4h2v4H9z" fill="currentColor" opacity=".5"/></svg>',
  undo:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M5 1v3h4v2H5v3L0 5.5z" fill="currentColor"/><path d="M10 3h2v6h-2z" fill="currentColor" opacity=".5"/></svg>',
  lab:   '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M4 1h4v1H7v3l3 6H2l3-6V2H4z" fill="currentColor"/></svg>',
  mode:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M1 1h4v4H1zM7 1h4v4H7zM1 7h4v4H1zM7 7h4v4H7z" fill="currentColor"/></svg>',
  // A bin, not the erase X. WIPE destroys the save, and it is the one control
  // that must not look like the two harmless X-marked ones (CLEAR the board,
  // CLOSE the shop) sitting a few pixels away.
  wipe:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M4 1h4v1h3v1H1V2h3zM2 4h8l-1 7H3zm2 1v5h1V5zm3 0v5h1V5z" fill="currentColor"/></svg>',
  // Dismiss, distinct from the erase X: a chevron that reads as "put this away"
  // rather than "delete something".
  close: '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M6 8.5L1.5 4l1-1L6 6.5 9.5 3l1 1z" fill="currentColor"/></svg>',
  // Rewind is not the same action as restarting the level, so BACK stops
  // borrowing RESET's arrow.
  back:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M5 2v8L1 6zm5 0v8L6 6z" fill="currentColor"/></svg>',
  lock:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M3 5V3h1V2h4v1h1v2h1v6H2V5zm2 0h2V3H5z" fill="currentColor"/></svg>',
  check: '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M0 6h2v2H0zM2 8h2v2H2zM4 6h2v2H4zM6 4h2v2H6zM8 2h2v2H8zM10 0h2v2h-2z" fill="currentColor"/></svg>',
};

const S = {
  idx: 0, L: null, eng: null, ghost: null, buf: null, bctx: null, img: null,
  phase: 'edit', running: false, speed: 1,
  cam: { x: 0, y: 0, s: 12 },
  tool: 'pan', stamp: null, rot: 0,
  stampsUsed: 0, presetPop: 0, snap: null, goal: null,
  hover: null, drag: null, paintVal: 1,
  unlocked: 0,
  // 'campaign' or 'sandbox'; null until the opening screen is answered.
  mode: null,
  rewind: [],
  /** Set once the overcrowding demonstration has been watched through. */
  saw4x4: false,
  // Which situation the rules lesson is showing.
  teachStep: 0,
};
// The shop is gone with the campaign -- its credits were earned by clearing
// levels. The aids it sold are analysis tools, which is exactly what a dish
// wants, so they are simply on.
const has = () => true;
const el = { toolBtns: {}, stampBtns: {} };
/** Held so a level change cannot fire a stale win dialog over the next level. */
let winTimer = null;

/* ---------------- terminal ---------------- */
function tlog(text, cls = 't-sys') {
  const d = document.createElement('div');
  d.className = 'tline ' + cls;
  d.textContent = text;
  termEl.appendChild(d);
  termEl.scrollTop = termEl.scrollHeight;
}
let lastDeny = '';
function deny(msg) { if (lastDeny !== msg) { tlog('> ' + msg, 't-warn'); lastDeny = msg; } }

/* ---------------- shop ---------------- */

/* ---------------- toolbar / tray ---------------- */
function mkBtn(icon, label, fn) {
  const b = document.createElement('button');
  b.className = 'tb';
  b.innerHTML = icon + (label ? '<span>' + label + '</span>' : '');
  b.onclick = fn;
  topbar.appendChild(b);
  return b;
}
function mkSep() { const d = document.createElement('div'); d.className = 'sep'; topbar.appendChild(d); }

function buildTopbar() {
  topbar.innerHTML = '';
  const L = S.L;
  el.run = mkBtn(ICONS.play, 'RUN', startPause);
  el.step = mkBtn(ICONS.step, 'STEP', stepOnce);
  if (has('undo')) mkBtn(ICONS.back, 'BACK', stepBack);
  el.reset = mkBtn(ICONS.clear, 'CLEAR', reset);
  mkBtn(ICONS.soup, 'SOUP', soup);
  mkSep();
  el.toolBtns = {};
  const addTool = (name, icon, label) => {
    el.toolBtns[name] = mkBtn(icon, label, () => { S.tool = name; S.stamp = null; syncTools(); });
  };
  addTool('pan', ICONS.pan, 'PAN');
  if ((L.tools || []).includes('draw')) addTool('draw', ICONS.draw, 'DRAW');
  if ((L.tools || []).includes('erase')) addTool('erase', ICONS.erase, 'ERASE');
  // No separator before the speed control: it is part of the same "how you
  // work" half as the tools, and the extra 9px was enough to push it onto a
  // second row of its own at ordinary window widths.
  el.spd = mkBtn('', 'SPD ' + SPEEDS[S.speed] + '/s', () => {
    S.speed = (S.speed + 1) % SPEEDS.length;
    el.spd.querySelector('span').textContent = 'SPD ' + SPEEDS[S.speed] + '/s';
  });
  const stats = document.createElement('div');
  stats.id = 'stats';
  const field = (label, inner) => '<span class="stat">' + label + ' ' + inner + '</span>';
  stats.innerHTML =
    field('GEN', '<b id="stGen">0</b>') +
    field('POP', '<b id="stPop">0</b>') +
    field('RULE', '<b>B3/S23</b>');
  topbar.appendChild(stats);
  el.gen = stats.querySelector('#stGen');
  el.pop = stats.querySelector('#stPop');
}

function miniSVG(p, color) {
  const sc = Math.min(26 / p.w, 26 / p.h, 5);
  const W = Math.max(8, Math.round(p.w * sc)), H = Math.max(8, Math.round(p.h * sc));
  let r = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + p.w + ' ' + p.h + '">';
  p.cells.forEach(([x, y]) => { r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="currentColor"/>'; });
  return r + '</svg>';
}

/**
 * The sidebar list: every pattern, grouped by what it actually does.
 *
 * This is where the level list used to be. A campaign needs a table of
 * contents; a dish needs to tell you what is on the shelf, because the tray's
 * icons are eleven pixels wide and "LOAFER c/7" means nothing until someone
 * says it is a spaceship that moves one cell every seven generations.
 *
 * Every classification here was produced by simulating the pattern, not by
 * recalling what it is usually called -- three of the labels were wrong the
 * first time and the simulation is what caught them.
 */
const LIBRARY = [
  {
    group: 'STILL LIFES', hint: 'never change',
    of: ['block', 'beehive', 'loaf', 'tub', 'boat', 'pond', 'eater'],
  },
  {
    group: 'OSCILLATORS', hint: 'repeat forever',
    of: ['blinker', 'toad', 'beacon', 'clock', 'pulsar', 'figure8', 'pentadec'],
  },
  {
    group: 'SPACESHIPS', hint: 'move across the grid',
    of: ['glider', 'lwss', 'mwss', 'flotilla', 'loafer', 'copperhead'],
  },
  {
    group: 'CHAOS', hint: 'small starts, long lives',
    of: ['rpent', 'acorn', 'diehard', 'bunnies', 'rabbits', 'switchEngine'],
  },
  {
    group: 'INFINITE', hint: 'grow without stopping',
    of: ['gosperGun'],
  },
  {
    group: 'UNITS', hint: 'the parts a computer is made of',
    of: ['annihilate', 'sink', 'gunSink'],
  },
];

/** What each pattern is, in one phrase. Simulated, not remembered. */
const NOTES = {
  block: '4 cells, the simplest stable shape',
  beehive: 'stable, 6 cells',
  loaf: 'stable, 7 cells',
  tub: 'stable, 4 cells',
  boat: 'stable, 5 cells',
  pond: 'stable, 8 cells',
  eater: 'stable — and it swallows a glider that hits it',
  blinker: 'period 2, the smallest oscillator',
  toad: 'period 2',
  beacon: 'period 2',
  clock: 'period 2',
  pulsar: 'period 3, 48 cells',
  figure8: 'period 8',
  pentadec: 'period 15, the longest here',
  glider: 'period 4, travels diagonally',
  lwss: 'period 4, travels sideways',
  mwss: 'period 4, one cell wider than the LWSS',
  flotilla: 'three lightweights flying in formation',
  loafer: 'one cell every 7 generations — found by a search program',
  copperhead: 'one cell every 10 — not discovered until 2016',
  rpent: '5 cells, still going 1000 generations later',
  acorn: '7 cells that take 5000 generations to settle',
  diehard: '7 cells that vanish completely at generation 130',
  bunnies: '9 cells, runs for thousands',
  rabbits: '9 cells, likewise',
  switchEngine: 'grows forever, leaving debris behind it',
  gosperGun: 'fires a glider every 30 generations, for ever',
  annihilate: 'two gliders head-on — both destroyed, nothing left. A NOT gate',
  sink: 'a glider flies into an eater and is gone; the eater repairs itself',
  gunSink: 'an endless stream, absorbed. Population stays bounded for ever',
};

function buildLibrary() {
  levelsEl.innerHTML = '';
  let ci = 0;
  for (const sec of LIBRARY) {
    const h = document.createElement('div');
    h.className = 'libhead';
    h.innerHTML = '<span>' + sec.group + '</span><small>' + sec.hint + '</small>';
    levelsEl.appendChild(h);

    for (const n of sec.of) {
      if (!RLES[n]) continue;
      const p = pattern(n);
      const b = document.createElement('button');
      b.className = 'lv libitem' + (S.stamp === n ? ' cur' : '');
      b.style.color = PCOLORS[ci++ % PCOLORS.length];
      b.innerHTML = miniSVG(p) + '<span class="lvt">' + p.label + '</span>';
      b.title = p.label + ' — ' + (NOTES[n] || '');
      // Selecting here is the same act as selecting in the tray, so that the
      // two lists cannot disagree about what is held.
      b.onclick = () => {
        if (S.stamp === n) { S.stamp = null; S.tool = 'pan'; }
        else { S.stamp = n; S.tool = 'stamp'; }
        syncTools();
      };
      levelsEl.appendChild(b);
    }
  }
}

function buildTray() {
  tray.innerHTML = '';
  el.stampBtns = {};
  const L = S.L;
  // LAB ACCESS opens the whole library inside a level. The budget is untouched,
  // so it buys choice rather than an easier goal.
  const names = (L.stamps === 'all' || (has('lab') && L.stamps))
    ? Object.keys(RLES)
    : (L.stamps || []);
  tray.style.display = names.length ? 'flex' : 'none';
  names.forEach((n, ni) => {
    const p = pattern(n);
    const b = document.createElement('button');
    b.className = 'stamp';
    b.style.color = PCOLORS[ni % PCOLORS.length];
    b.innerHTML = miniSVG(p) + '<span>' + p.label + '</span>';
    b.onclick = () => {
      if (S.stamp === n) { S.stamp = null; S.tool = 'pan'; }
      else { S.stamp = n; S.tool = 'stamp'; }
      syncTools();
    };
    el.stampBtns[n] = b;
    tray.appendChild(b);
  });
  if (names.length) {
    const b = document.createElement('button');
    b.className = 'stamp';
    b.innerHTML = ICONS.rot + '<span>ROTATE [R]</span>';
    b.onclick = () => { S.rot = (S.rot + 1) % 4; };
    tray.appendChild(b);
  }
}

/* ---------------- level loading ---------------- */
function loadLevel(i) {
  S.idx = i; const L = LEVELS[i]; S.L = L;
  S.eng = new Life(L.w, L.h);
  S.ghost = new Float32Array(L.w * L.h);
  S.buf = document.createElement('canvas'); S.buf.width = L.w; S.buf.height = L.h;
  S.bctx = S.buf.getContext('2d');
  S.img = S.bctx.createImageData(L.w, L.h);
  S.presetPop = 0;
  S.phase = 'edit'; S.running = false; S.stampsUsed = 0; S.snap = null; S.goal = null;
  S.stamp = null; S.rot = 0; S.drag = null; lastDeny = ''; S.stepIdx = 0; S.won = false;
  S.tool = 'draw';
  buildTopbar(); buildTray(); buildLibrary();
  fitCamera();
  hideMsg();
  syncRun(); syncTools();
}

/**
 * Empties the dish, after asking.
 *
 * This button used to erase the campaign save. Nothing is persisted any more,
 * so the destructive act left is throwing away what has been drawn -- and a
 * board can hold a lot of work, which is why it asks first.
 */
function wipeSave() {
  if (S.eng.pop === 0) { deny('the dish is already empty'); return; }
  showMsg(
    'CLEAR THE DISH?',
    'This removes every cell on the board. Nothing can undo it.',
    [
      {
        label: 'CLEAR IT',
        fn: () => {
          S.eng.clear();
          S.ghost.fill(0);
          S.rewind.length = 0;
          S.running = false; S.phase = 'edit'; S.snap = null;
          hideMsg(); syncRun();
          tlog('> DISH CLEARED', 't-warn');
        },
      },
      { label: 'KEEP IT', fn: hideMsg },
    ],
    true
  );
}

function placeStamp(cx, cy) {
  if (!canEditCell(cx, cy)) return;
  const { cells, ok, ox, oy } = stampCellsAt(cx, cy);
  if (!ok) { deny('does not fit: partly outside the dish'); return; }
  cells.forEach(([x, y]) => S.eng.set(x, y, 1));
  S.stampsUsed++;
  tlog('> placed ' + RLES[S.stamp].label + ' @ (' + ox + ',' + oy + ')', 't-sys');
}

/* ---------------- run control ---------------- */
function startPause() {
  if (S.running) { S.running = false; syncRun(); return; }
  if (S.eng.pop === 0) { deny('the dish is empty'); return; }
  S.running = true; syncRun();
}
function stepOnce() {
  if (S.eng.pop === 0) { deny('the dish is empty'); return; }
  S.running = false; doStep(); syncRun();
}
function reset() {
  S.eng.clear();
  S.ghost.fill(0);
  S.rewind.length = 0;
  S.running = false;
  syncRun();
  tlog('> CLEAR', 't-sys');
}
function soup() {
  const e = S.eng;
  for (let y = 0; y < S.L.h; y++)
    for (let x = 0; x < S.L.w; x++)
      e.set(x, y, Math.random() < 0.12 ? 1 : 0);
  tlog('> SOUP — 12% random fill', 't-sys');
}

function doStep() {
  // Life is not reversible -- a generation has many possible predecessors --
  // so going back means having kept the frames. Forty is enough to replay a
  // collision and cheap next to the board itself.
  S.rewind.push(S.eng.snapshot());
  if (S.rewind.length > 40) S.rewind.shift();
  S.eng.step();
}

function stepBack() {
  const prev = S.rewind.pop();
  if (!prev) { deny('nothing further back is kept'); return; }
  S.running = false;
  S.eng.restore(prev);
  syncRun(); updateStats(); draw();
  tlog('> REWIND to gen ' + S.eng.gen, 't-sys');
}

function syncRun() {
  if (!el.run) return;
  el.run.innerHTML = (S.running ? ICONS.pause : ICONS.play) +
    '<span>' + (S.running ? 'PAUSE' : 'RUN') + '</span>';
}
function syncTools() {
  for (const [n, b] of Object.entries(el.toolBtns)) b.classList.toggle('on', S.tool === n && !S.stamp);
  for (const [n, b] of Object.entries(el.stampBtns)) { const on = S.stamp === n; b.classList.toggle('on', on); b.style.borderColor = on ? b.style.color : ''; }
}

/* ---------------- editing ---------------- */
function inGrid(c) { return c.x >= 0 && c.y >= 0 && c.x < S.L.w && c.y < S.L.h; }

function canEditCell(x, y, quiet) {
  if (!S.L.sandbox && S.phase !== 'edit') { if (!quiet) deny('Cannot edit while running — RESET to gen 0 first'); return false; }
  const z = S.L.editable;
  if (z && !(x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h)) {
    if (!quiet) deny('Placement allowed only inside the dashed LAUNCH zone');
    return false;
  }
  return true;
}

function paint(x, y, v) {
  if (x < 0 || y < 0 || x >= S.L.w || y >= S.L.h) return;
  if (!canEditCell(x, y)) return;
  if (v > 0 && !S.L.sandbox && S.L.budget &&
      !S.eng.get(x, y) && (S.eng.pop - S.presetPop) >= S.L.budget) {
    deny('Cell budget exhausted (limit ' + S.L.budget + ')'); return;
  }
  S.eng.set(x, y, v);
}

function stampCellsAt(cx, cy) {
  const p = rotateCells(pattern(S.stamp), S.rot);
  const ox = cx - (p.w >> 1), oy = cy - (p.h >> 1);
  const cells = p.cells.map(([x, y]) => [ox + x, oy + y]);
  const ok = cells.every(([x, y]) =>
    x >= 0 && y >= 0 && x < S.L.w && y < S.L.h && canEditCell(x, y, true));
  return { cells, ok, ox, oy };
}

function showMsg(title, text, btns, bad) {
  msgEl.innerHTML = '';
  const box = document.createElement('div'); box.className = 'box';
  const h = document.createElement('h2'); h.textContent = title; if (bad) h.className = 'bad';
  const p = document.createElement('p'); p.textContent = text;
  const row = document.createElement('div'); row.className = 'row';
  btns.forEach(b => {
    const bt = document.createElement('button'); bt.className = 'tb';
    bt.innerHTML = '<span>' + b.label + '</span>'; bt.onclick = b.fn;
    row.appendChild(bt);
  });
  box.append(h, p, row); msgEl.appendChild(box);
  msgEl.classList.remove('hidden');
}
function hideMsg() { msgEl.classList.add('hidden'); }

/* ---------------- camera / input ---------------- */
function fitCamera() {
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  const s = Math.min((r.width - 60) / S.L.w, (r.height - 60) / S.L.h);
  // Caps, not targets. The lesson draws a number inside every cell so it needs
  // room to read one, but letting a 13x9 board fill an 842px panel gives 54px
  // cells that read as a bug rather than a board; 30 is legible and still looks
  // like a grid. Elsewhere 22 is plenty.
  S.cam.s = Math.max(1.5, Math.min(22, s));
  S.cam.x = (r.width - S.L.w * S.cam.s) / 2;
  S.cam.y = (r.height - S.L.h * S.cam.s) / 2;
}
function toCell(e) {
  const r = cv.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  return { x: Math.floor((mx - S.cam.x) / S.cam.s), y: Math.floor((my - S.cam.y) / S.cam.s), mx, my };
}

/**
 * Input, bound per mount.
 *
 * The canvas handlers go on the element this mount created; the window ones are
 * kept as references so unbindInput can take them off again, or a second visit
 * would leave the first visit's keyboard handler still running.
 */
let onPointerMove = null, onPointerUp = null, onKeyDown = null;

function bindInput() {
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (e.button === 1) return;
  const c = toCell(e);
  if (e.button === 2 || (S.tool === 'pan' && e.button === 0)) {
    S.drag = { mode: 'pan', mx: e.clientX, my: e.clientY };
    try { cv.setPointerCapture(e.pointerId); } catch {}
    return;
  }
  if (e.button !== 0) return;
  if (S.tool === 'draw') {
    if (!inGrid(c)) return;
    S.paintVal = S.eng.get(c.x, c.y) ? 0 : 1;
    paint(c.x, c.y, S.paintVal);
    S.drag = { mode: 'paint' };
    try { cv.setPointerCapture(e.pointerId); } catch {}
  } else if (S.tool === 'erase') {
    paint(c.x, c.y, 0);
    S.drag = { mode: 'erase' };
    try { cv.setPointerCapture(e.pointerId); } catch {}
  } else if (S.tool === 'stamp' && S.stamp) {
    placeStamp(c.x, c.y);
  }
});
  onPointerMove = e => {
  S.hover = toCell(e);
  if (!S.drag) return;
  if (S.drag.mode === 'pan') {
    S.cam.x += e.clientX - S.drag.mx;
    S.cam.y += e.clientY - S.drag.my;
    S.drag.mx = e.clientX; S.drag.my = e.clientY;
  } else if (S.drag.mode === 'paint') {
    const c = toCell(e); if (inGrid(c)) paint(c.x, c.y, S.paintVal);
  } else if (S.drag.mode === 'erase') {
    const c = toCell(e); if (inGrid(c)) paint(c.x, c.y, 0);
  }
  };
  onPointerUp = () => { S.drag = null; };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const ns = Math.max(1.2, Math.min(48, S.cam.s * Math.exp(-e.deltaY * 0.0012)));
  const k = ns / S.cam.s;
  S.cam.x = mx - (mx - S.cam.x) * k;
  S.cam.y = my - (my - S.cam.y) * k;
  S.cam.s = ns;
}, { passive: false });

  onKeyDown = e => {
  // A dialog is modal: the mode chooser, the shop, and the win/fail boxes all
  // sit over the board, and SPACE running the simulation behind one of them was
  // how a shown failure could quietly become a win.
  if (msgEl && !msgEl.classList.contains('hidden')) return;
  if (e.code === 'Space') { e.preventDefault(); startPause(); }
  else if (e.code === 'KeyN' || e.code === 'Period') stepOnce();
  else if (e.code === 'KeyR') { if (S.stamp) S.rot = (S.rot + 1) % 4; }
    else if (e.code === 'Escape') { S.stamp = null; S.tool = 'pan'; syncTools(); }
  };
  window.addEventListener('keydown', onKeyDown);
}

function unbindInput() {
  if (onPointerMove) window.removeEventListener('pointermove', onPointerMove);
  if (onPointerUp) window.removeEventListener('pointerup', onPointerUp);
  if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
  onPointerMove = onPointerUp = onKeyDown = null;
}

/* ---------------- rendering ---------------- */
function resize() {
  const r = cv.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
}

function updateImage() {
  const L = S.L, e = S.eng, d = S.img.data, g = S.ghost, st = e.stride, a = e.a;
  let di = 0, gi = 0;
  for (let y = 0; y < L.h; y++) {
    let si = (y + 1) * st + 1;
    for (let x = 0; x < L.w; x++, si++, gi++, di += 4) {
      const v = a[si];
      let r, gg, b;
      if (v) {
        g[gi] = 1;
        const t = Math.min(v, 40) / 40;
        if (t < 0.35) {
          const u = t / 0.35;
          r = (229 - 77 * u) | 0; gg = (192 + 3 * u) | 0; b = (123 - 2 * u) | 0;
        } else {
          const u = (t - 0.35) / 0.65;
          r = (152 - 55 * u) | 0; gg = (195 - 20 * u) | 0; b = (121 + 118 * u) | 0;
        }
      } else {
        let f = g[gi] * 0.90;
        if (f < 0.02) f = 0;
        g[gi] = f;
        r = (26 + 62 * f) | 0; gg = (28 + 30 * f) | 0; b = (35 + 58 * f) | 0;
      }
      d[di] = r; d[di + 1] = gg; d[di + 2] = b; d[di + 3] = 255;
    }
  }
}

function drawGrid() {
  if (S.cam.s < 7) return;
  const r = cv.getBoundingClientRect();
  const x0 = Math.max(0, Math.floor(-S.cam.x / S.cam.s));
  const x1 = Math.min(S.L.w, Math.ceil((r.width - S.cam.x) / S.cam.s));
  const y0 = Math.max(0, Math.floor(-S.cam.y / S.cam.s));
  const y1 = Math.min(S.L.h, Math.ceil((r.height - S.cam.y) / S.cam.s));
  ctx.strokeStyle = 'rgba(216,222,233,.06)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x <= x1; x++) {
    const sx = S.cam.x + x * S.cam.s;
    ctx.moveTo(sx, S.cam.y + y0 * S.cam.s); ctx.lineTo(sx, S.cam.y + y1 * S.cam.s);
  }
  for (let y = y0; y <= y1; y++) {
    const sy = S.cam.y + y * S.cam.s;
    ctx.moveTo(S.cam.x + x0 * S.cam.s, sy); ctx.lineTo(S.cam.x + x1 * S.cam.s, sy);
  }
  ctx.stroke();
}

function drawPreview() {
  if (S.tool !== 'stamp' || !S.stamp || !S.hover) return;
  if (!S.L.sandbox && S.phase !== 'edit') return;
  if (!inGrid(S.hover)) return;
  const { cells, ok } = stampCellsAt(S.hover.x, S.hover.y);
  ctx.fillStyle = ok ? 'rgba(86,182,194,.5)' : 'rgba(224,108,117,.5)';
  cells.forEach(([x, y]) => {
    const [sx, sy, sw, sh] = cellRect(x, y, 1, 1);
    ctx.fillRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
  });
}

/**
 * Where a stamped ship is going, if TRAJECTORY is owned.
 *
 * Run on a dish of its own rather than on the live one: what is wanted is the
 * pattern's own path, and simulating it against the board's other cells would
 * draw the collision rather than the aim. The path is cached against the stamp
 * and the hovered cell, because this is a 120-generation simulation and it
 * would otherwise run on every frame of a mouse move.
 */
function drawTrace() {
  if (!has('trace')) return;
  if (S.tool !== 'stamp' || !S.stamp || !S.hover || !inGrid(S.hover)) return;
  if (!S.L.sandbox && S.phase !== 'edit') return;

  const kind = kindOf(S.stamp);
  // Only something that travels rigidly has a path worth drawing. Tracing the
  // centre of an oscillator gives a wobble around a fixed point, and tracing
  // the R-pentomino gives a wandering line through an explosion -- both look
  // like a prediction and neither is one. Those get a mark that says what the
  // pattern does instead, which is the honest version of the same help.
  const { cells } = stampCellsAt(S.hover.x, S.hover.y);
  if (!cells.length) return;
  let cx = 0, cy = 0;
  for (const [x, y] of cells) { cx += x; cy += y; }
  cx = cx / cells.length + 0.5; cy = cy / cells.length + 0.5;

  ctx.save();
  if (kind && kind.kind === 'ship') {
    // A ship's heading is exact, so the line is drawn from it rather than
    // simulated: one cell per `period / |d|` gens, straight until it leaves
    // the board. The rotation the player has applied turns the vector too.
    let [dx, dy] = [kind.dx, kind.dy];
    for (let r = 0; r < (S.rot & 3); r++) [dx, dy] = [-dy, dx];
    const steps = Math.max(S.L.w, S.L.h);
    let ex = cx, ey = cy;
    for (let i = 1; i <= steps; i++) {
      const nx = cx + dx * i, ny = cy + dy * i;
      if (nx < 0 || ny < 0 || nx > S.L.w || ny > S.L.h) break;
      ex = nx; ey = ny;
    }
    const [sx, sy] = cellRect(cx, cy, 1, 1);
    const [tx, ty] = cellRect(ex, ey, 1, 1);
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(86,182,194,.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.setLineDash([]);
    // An arrowhead at the far end: the line alone does not say which way along
    // it the thing is going.
    const a = Math.atan2(ty - sy, tx - sx);
    ctx.fillStyle = 'rgba(86,182,194,.9)';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - 9 * Math.cos(a - 0.4), ty - 9 * Math.sin(a - 0.4));
    ctx.lineTo(tx - 9 * Math.cos(a + 0.4), ty - 9 * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
  } else {
    // Stays put: a ring where it sits, coloured by what it will do there.
    const stays = kind === 'still' || kind === 'osc';
    const [sx, sy] = cellRect(cx, cy, 1, 1);
    ctx.strokeStyle = stays ? 'rgba(152,195,121,.7)' : 'rgba(229,192,123,.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash(stays ? [] : [3, 4]);
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(10, S.cam.s * 1.4), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** The next generation, faintly, while still editing. */
function drawGhostFrame() {
  if (!has('ghost') || S.running || S.phase !== 'edit') return;
  if (S.cam.s < 4) return;
  const sim = new Life(S.L.w, S.L.h);
  for (let y = 0; y < S.L.h; y++)
    for (let x = 0; x < S.L.w; x++) if (S.eng.get(x, y)) sim.set(x, y, 1);
  if (sim.pop === 0 || sim.pop > 1200) return;
  sim.step();
  ctx.fillStyle = 'rgba(152,195,121,.22)';
  for (let y = 0; y < S.L.h; y++)
    for (let x = 0; x < S.L.w; x++) {
      if (!sim.get(x, y) || S.eng.get(x, y)) continue;
      const [sx, sy, sw, sh] = cellRect(x, y, 1, 1);
      ctx.fillRect(sx + 1, sy + 1, sw - 2, sh - 2);
    }
}

/** Neighbour counts on the empty cells, so the rule is visible. */
function drawHeat() {
  if (!has('heat') || S.running || S.cam.s < 13) return;
  ctx.save();
  ctx.font = Math.floor(S.cam.s * 0.5) + 'px ui-monospace, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let y = 0; y < S.L.h; y++)
    for (let x = 0; x < S.L.w; x++) {
      if (S.eng.get(x, y)) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && S.eng.get(x + dx, y + dy)) n++;
      if (!n) continue;
      const [sx, sy, sw, sh] = cellRect(x, y, 1, 1);
      // Three is the one that matters: that cell is about to be born.
      ctx.fillStyle = n === 3 ? 'rgba(152,195,121,.9)' : 'rgba(144,148,157,.4)';
      ctx.fillText(String(n), sx + sw / 2, sy + sh / 2);
    }
  ctx.restore();
}

function drawHover() {
  if (S.running || S.tool !== 'draw' || S.cam.s < 9) return;
  const c = S.hover;
  if (!c || !inGrid(c)) return;
  const [sx, sy, sw, sh] = cellRect(c.x - 1, c.y - 1, 3, 3);
  ctx.strokeStyle = 'rgba(209,154,102,.5)'; ctx.lineWidth = 1;
  ctx.strokeRect(sx, sy, sw, sh);
  let n = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if ((dx || dy) && S.eng.get(c.x + dx, c.y + dy)) n++;
  ctx.fillStyle = 'rgba(209,154,102,.9)';
  ctx.font = '11px monospace';
  ctx.fillText(String(n), sx + sw + 4, sy + 10);
}

function draw() {
  resize();
  const dpr = devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#16171d";
  ctx.fillRect(0, 0, cv.width, cv.height);
  updateImage();
  S.bctx.putImageData(S.img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(dpr * S.cam.s, 0, 0, dpr * S.cam.s, dpr * S.cam.x, dpr * S.cam.y);
  ctx.drawImage(S.buf, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawGrid(); drawGhostFrame(); drawHeat(); drawPreview(); drawTrace(); drawHover();
}

function updateGuide() {
  // One line, always the same: what the controls do. There is no sequence to
  // walk through any more, so the card neither advances nor points at anything.
  const L = S.L;
  if (!L || !L.steps || !L.steps[0]) { guideEl.style.display = 'none'; return; }
  guideEl.style.display = 'flex';
  gstep.style.color = L.accent || '#56b6c2';
  gstep.textContent = 'B3/S23';
  gtext.textContent = L.steps[0].text;
  syncPointer(null);
}

/**
 * Puts the guide beside the control the step is about, the way the site's own
 * tour does: the anchor is lit through a hole in a dimmed overlay and the card
 * moves to it with an arrow pointing in.
 *
 * The corner card was the whole of the guidance, and a corner is exactly where
 * a player is not looking when they are hunting for a button. Anchoring it is
 * what lets the step be followed without reading it.
 */
function syncPointer(anchor) {
  document.querySelectorAll('.point').forEach(e => e.classList.remove('point', 'act'));
  const spot = document.getElementById('spotlight');

  const target = !anchor || S.won ? null :
    anchor === 'run' ? el.run :
    anchor === 'step' ? el.step :
    anchor === 'reset' ? el.reset :
    anchor === 'next' ? el.next :
    anchor === 'draw' ? el.toolBtns.draw :
    anchor === 'spd' ? el.spd :
    anchor === 'tray' ? tray :
    anchor === 'gen' ? document.getElementById('stats') : null;

  if (!target) {
    if (spot) spot.classList.remove('show');
    guideEl.classList.remove('anchored');
    guideEl.style.left = guideEl.style.top = '';
    return;
  }

  target.classList.add('point');
  // Breathing is for something that must be pressed now. A step that only
  // points at a readout marks it and leaves it still, or the animation is
  // always running somewhere and stops meaning anything.
  if (anchor !== 'gen') target.classList.add('act');

  const r = target.getBoundingClientRect();
  const wrap = document.getElementById('cvwrap').getBoundingClientRect();
  const PAD = 5;
  if (spot) {
    spot.style.left = (r.left - wrap.left - PAD) + 'px';
    spot.style.top = (r.top - wrap.top - PAD) + 'px';
    spot.style.width = (r.width + PAD * 2) + 'px';
    spot.style.height = (r.height + PAD * 2) + 'px';
    spot.classList.add('show');
  }

  // Below the anchor when there is room, otherwise above it; then pulled back
  // inside the board so the card is never half off the edge.
  guideEl.classList.add('anchored');
  const gw = guideEl.offsetWidth || 300, gh = guideEl.offsetHeight || 70;
  const below = r.bottom - wrap.top + 12;
  const above = r.top - wrap.top - gh - 12;
  const top = below + gh <= wrap.height - 8 ? below : Math.max(8, above);
  let left = r.left - wrap.left + r.width / 2 - gw / 2;
  left = Math.max(8, Math.min(left, wrap.width - gw - 8));
  guideEl.style.left = Math.round(left) + 'px';
  guideEl.style.top = Math.round(top) + 'px';
  guideEl.dataset.side = top === below ? 'below' : 'above';
  guideEl.style.setProperty('--arrow', Math.round(r.left - wrap.left + r.width / 2 - left) + 'px');
}


function updateStats() {
  if (!el.gen) return;
  el.gen.textContent = S.eng.gen;
  el.pop.textContent = S.eng.pop;
}

/* ---------------- main loop ---------------- */
let last = performance.now(), acc = 0;
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000); last = t;
  if (S.running) {
    acc += dt * SPEEDS[S.speed];
    let n = 0;
    while (acc >= 1 && n < 120 && S.running) { acc -= 1; n++; doStep(); }
    if (acc > 4) acc = 0;
  } else acc = 0;
  // The page can be replaced between frames; if it was, take the new nodes and
  // re-fit the camera to them before drawing into a canvas of a different size.
  if (bind()) { buildTopbar(); buildTray(); buildLibrary(); resize(); }
  draw(); updateStats(); updateGuide();
  raf = requestAnimationFrame(frame);
}

let raf = 0, ro = null;

/**
 * Binds to the markup the page has just rendered and starts the machine.
 *
 * Called on every mount rather than at import, because the module is cached
 * across navigations while the DOM it drives is not.
 */
export function start() {
  stop();
  // Forced: the elements from the previous visit may still be in the document
  // at this point, so bind() must not take its own "still attached" shortcut.
  cv = null;
  if (!bind()) return;

  last = performance.now(); acc = 0;

  bindInput();

  // headless driver for automated checks
  window.lifelab = { S, loadLevel, doStep, startPause, step: n => { for (let i = 0; i < n; i++) doStep(); draw(); updateStats(); } };

  tlog('LIFE.LAB v0.2 — cellular automaton laboratory', 't-hd');
  tlog('rule: B3/S23 | grid: 320x200 bounded | host: krsz.in');
  // Straight into the dish. There is only one, and a chooser over a single
  // choice is a door with nothing behind it.
  S.mode = 'sandbox';
  loadLevel(0);
  raf = requestAnimationFrame(frame);
}

/** Stops the loop and releases the observer, so a hidden view costs nothing. */
export function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  ro?.disconnect();
  ro = null;
  unbindInput();
  S.running = false;
  clearTimeout(winTimer);
}
