// @ts-nocheck -- the view layer: 1400 lines of canvas and DOM written as plain
// JS, where the state object is built up field by field and every element is
// fetched by id. Checking it under `strict` reports several hundred implicit
// anys and possibly-nulls that are all guaranteed by construction, and typing
// it properly would mean rewriting it in TypeScript. The parts worth checking
// -- the automaton, the pattern library, the level data and the save format --
// are checked: engine.js, patterns.js and levels.js all pass.
import { Life } from './engine.js';
import { pattern, transformCells, nextOrientation, sameCells, kindOf, CATEGORIES, patternMeta, custom, parseRLE, decodeRLE, encodeRLE, normalizeCells } from './patterns.js';
import { LEVELS } from './levels.js';

const $ = s => document.querySelector(s);
// Bound in start(), not at import. A module is evaluated once and cached, but
// the page it draws into is created and destroyed on every SPA navigation --
// so binding here left the second visit holding elements that were no longer
// in the document, drawing into a detached canvas: a blank panel.
let termEl, cv, ctx, topbar, tray, msgEl;
let wipeBtn, logWrap, logToggle, tbScroll, pieceBar, traySecs;
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
  topbar = $('#topbar'); tray = $('#tray'); msgEl = $('#msg');
  wipeBtn = $('#wipebtn');
  logWrap = $('#logwrap'); logToggle = $('#logtoggle');
  // Floating bars over the dish, built here rather than in the markup: they
  // are the game's own furniture, and rebuilt with it on every mount.
  pieceBar = document.createElement('div'); pieceBar.id = 'piecebar'; pieceBar.className = 'fbar'; pieceBar.hidden = true;
  $('#cvwrap').appendChild(pieceBar);

  // Handlers and the size observer belong to the nodes, so they are re-attached
  // with them rather than once in start().
  wipeBtn.onclick = wipeSave;
  // The two sidebar-header buttons were the only text-only controls left, and
  // one of them erases the save -- the control that most needs to be
  // recognisable at a glance was the least marked.
  wipeBtn.innerHTML = ICONS.wipe + '<span>CLEAR ALL</span>';
  // Dish size sits with CLEAR ALL: both are about the board itself, not
  // about editing it, and the control row below is full.
  el.dish = document.createElement('button');
  el.dish.id = 'dishbtn';
  el.dish.title = 'Dish size — cycles 320×200, 640×400, 1280×800, 2000×1800. Cells are kept; shrinking asks first if any would be lost.';
  el.dish.onclick = cycleDish;
  wipeBtn.parentNode.insertBefore(el.dish, wipeBtn);
  if (S.L) syncDishBtn();
  /* The log floats over the dish, so it has to be dismissable: on a short
     stage it covers a corner the player may want to draw in. */
  if (logToggle) {
    logToggle.onclick = () => {
      const min = logWrap.classList.toggle('min');
      logToggle.textContent = min ? '\u25A1' : '_';
      logToggle.title = min ? 'Show the log' : 'Hide the log';
    };
  }
  ro?.disconnect();
  ro = new ResizeObserver(() => { resize(); clampCam(); });
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
  sel:   '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M0 0h3v1H1v2H0zM9 0h3v3h-1V1H9zM0 9h1v2h2v1H0zM11 9h1v3H9v-1h2zM5 0h2v1H5zM5 11h2v1H5zM0 5h1v2H0zM11 5h1v2h-1z" fill="currentColor"/></svg>',
  flip:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M5 0h2v12H5zM0 3h3v6H0zM9 3h3v6H9z" fill="currentColor" fill-opacity=".5"/><path d="M5 0h2v12H5z" fill="currentColor"/></svg>',
  dish:  '<svg width="11" height="11" viewBox="0 0 12 12"><path d="M0 0h12v12H0zm1 1v10h10V1z" fill="currentColor"/><path d="M3 3h6v6H3z" fill="currentColor" fill-opacity=".45"/></svg>',
};

/* Dish sizes. The default is big enough for a gun to fire into; the largest
   fits Rendell's Turing machine (1714x1647) with room around it. Anything past
   that is a wall of cells the browser cannot step quickly, so the shelf stops
   there. */
const DISH_SIZES = [[320, 200], [640, 400], [1280, 800], [2000, 1800]];
/** Steps per frame stop once this much of the frame has gone on them. */
const STEP_BUDGET_MS = 12;

const S = {
  idx: 0, L: null, eng: null, ghost: null, buf: null, bctx: null, img: null,
  phase: 'edit', running: false, speed: 1,
  cam: { x: 0, y: 0, s: 12 },
  tool: 'pan',
  /**
   * The one thing that can be in hand: a set of cells at a position on the
   * board, not yet part of it. Comes from the tray or from lifting a
   * selection; moves, turns, drops, or goes away. See the "piece" section.
   */
  piece: null,
  /** The marquee while SELECT is being dragged, in cells, or null. */
  sel: null,
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
  tbScroll.appendChild(b);
  return b;
}
function mkSep() { const d = document.createElement('div'); d.className = 'sep'; tbScroll.appendChild(d); }

function buildTopbar() {
  topbar.innerHTML = '';
  /* The controls live in a scroller so a narrow stage slides them rather than
     dropping their labels or pushing the readouts off the edge. */
  tbScroll = document.createElement('div');
  tbScroll.id = 'tbscroll';
  topbar.appendChild(tbScroll);
  const L = S.L;
  el.run = mkBtn(ICONS.play, 'RUN', startPause);
  // Anchors for the walkthrough. The toolbar is rebuilt per level, so they are
  // set here rather than in the markup.
  el.run.dataset.tour = 'll-run';
  el.step = mkBtn(ICONS.step, 'STEP', stepOnce);
  if (has('undo')) mkBtn(ICONS.back, 'BACK', stepBack);
  el.reset = mkBtn(ICONS.clear, 'CLEAR', reset);
  mkBtn(ICONS.soup, 'SOUP', soup);
  mkSep();
  el.toolBtns = {};
  const addTool = (name, icon, label) => {
    el.toolBtns[name] = mkBtn(icon, label, () => { S.tool = name; syncTools(); });
  };
  addTool('pan', ICONS.pan, 'PAN');
  el.toolBtns.pan.dataset.tour = 'll-tools';
  // No ERASE tool: DRAW clears a live cell it is clicked on, and SELECT +
  // Delete clears any area. A third way to do the same thing was one more
  // button to understand.
  if ((L.tools || []).includes('draw')) {
    addTool('draw', ICONS.draw, 'DRAW');
    el.toolBtns.draw.title = 'Paint cells — click a live cell to clear it. To clear an area, SELECT it and press Delete';
  }
  // SELECT: drag a box; the bar that follows saves it as a pattern of your
  // own, copies it as RLE, or clears it.
  addTool('sel', ICONS.sel, 'SELECT');
  el.toolBtns.sel.title = 'Drag a box around cells to pick them up: then drag to move, R / F to turn, Enter to drop, Delete to remove, Ctrl+S to save';
  // No separator before the speed control: it is part of the same "how you
  // work" half as the tools, and the extra 9px was enough to push it onto a
  // second row of its own at ordinary window widths.
  el.spd = mkBtn('', 'SPD ' + SPEEDS[S.speed] + '/s', () => {
    S.speed = (S.speed + 1) % SPEEDS.length;
    el.spd.querySelector('span').textContent = 'SPD ' + SPEEDS[S.speed] + '/s';
  });

  const stats = document.createElement('div');
  stats.id = 'stats';
  stats.dataset.tour = 'll-stats';
  const field = (label, inner) => '<span class="stat">' + label + ' ' + inner + '</span>';
  // No RULE readout: the brand line already says B3/S23, and the row's width
  // is better spent on the controls.
  stats.innerHTML =
    field('GEN', '<b id="stGen">0</b>') +
    field('POP', '<b id="stPop">0</b>');
  topbar.appendChild(stats);
  el.gen = stats.querySelector('#stGen');
  el.pop = stats.querySelector('#stPop');
}

/**
 * A thumbnail. A canvas rather than an SVG of one <rect> per cell: the Turing
 * machine has 36,000 cells and an SVG that size is a page of its own. Cached
 * as a data URL so rebuilding the tray does not redraw every shelf.
 */
const thumbCache = new Map();
function thumb(key, color) {
  const ck = key + '|' + color;
  if (thumbCache.has(ck)) return thumbCache.get(ck);
  const html = thumbOf(pattern(key), color);
  thumbCache.set(ck, html);
  return html;
}
function thumbOf(p, color, size = 26) {
  const sc = Math.min(size / p.w, size / p.h, 5);
  const W = Math.max(8, Math.round(p.w * sc)), H = Math.max(8, Math.round(p.h * sc));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = color;
  const ox = (W - p.w * sc) / 2, oy = (H - p.h * sc) / 2;
  const cw = Math.max(sc, 0.35);
  for (const [x, y] of p.cells) g.fillRect(ox + x * sc, oy + y * sc, cw, cw);
  return '<img width="' + W + '" height="' + H + '" src="' + c.toDataURL() + '" alt="">';
}



let trayQuery = '';
/** Which sections are folded. Persisted: a shelf you closed stays closed. */
let trayFolded = null;
function loadFolded() {
  if (trayFolded) return trayFolded;
  try { trayFolded = JSON.parse(localStorage.getItem('lifelab.tray.folded') || '{}') || {}; } catch { trayFolded = {}; }
  return trayFolded;
}
function saveFolded() { try { localStorage.setItem('lifelab.tray.folded', JSON.stringify(trayFolded || {})); } catch {} }

function buildTray() {
  tray.innerHTML = '';
  el.stampBtns = {};
  tray.style.removeProperty('display');
  const search = document.createElement('input');
  search.id = 'trsearch'; search.type = 'search'; search.placeholder = 'search patterns'; search.value = trayQuery;
  search.autocomplete = 'off'; search.spellcheck = false;
  search.oninput = () => { trayQuery = search.value.trim().toLowerCase(); renderTray(); };
  tray.appendChild(search);
  traySecs = document.createElement('div'); traySecs.id = 'trsecs';
  tray.appendChild(traySecs);
  renderTray();
}

function renderTray() {
  if (!traySecs) return;
  traySecs.innerHTML = '';
  el.stampBtns = {};
  const folded = loadFolded();
  const q = trayQuery;
  const sections = CATEGORIES.map(c => ({ ...c, items: c.of }));
  sections.push({ id: 'custom', label: 'CUSTOM', hint: 'yours, kept in this browser', items: custom.list().map(c => c.key), mine: true });
  let colour = 0;
  for (const sec of sections) {
    const items = sec.items.filter(k => {
      if (!q) return true;
      const m = patternMeta(k);
      return (m.label + ' ' + (m.note || '') + ' ' + (m.credit || '') + ' ' + sec.label).toLowerCase().includes(q);
    });
    if (!items.length && !sec.mine) continue;
    const box = document.createElement('div'); box.className = 'trsec';
    const open = q ? true : !folded[sec.id];
    box.classList.toggle('fold', !open);
    const hd = document.createElement('button'); hd.type = 'button'; hd.className = 'trhd';
    hd.innerHTML = '<span class="tcar">' + (open ? '&#9662;' : '&#9656;') + '</span><span class="tlbl">' + sec.label + '</span><small>' + items.length + '</small>';
    hd.title = sec.hint;
    hd.onclick = () => { folded[sec.id] = open; saveFolded(); renderTray(); };
    box.appendChild(hd);
    const grid = document.createElement('div'); grid.className = 'trgrid';
    for (const k of items) grid.appendChild(stampButton(k, PCOLORS[colour++ % PCOLORS.length], sec.mine));
    if (sec.mine) {
      const add = document.createElement('button'); add.className = 'stamp tradd';
      add.innerHTML = ICONS.sel + '<span>FROM SELECTION</span>';
      add.title = 'Switch to SELECT, drag a box on the dish, then SAVE from the bar that appears';
      add.onclick = () => { S.tool = 'sel'; syncTools(); tlog('> SELECT: drag a box around cells to pick them up, then SAVE from the bar', 't-sys'); };
      const paste = document.createElement('button'); paste.className = 'stamp tradd';
      paste.innerHTML = ICONS.draw + '<span>PASTE RLE</span>';
      paste.title = 'Paste a pattern in RLE, the format LifeWiki and Golly use';
      paste.onclick = importRLE;
      grid.append(add, paste);
    }
    box.appendChild(grid);
    traySecs.appendChild(box);
  }
  syncTools();
}

function stampButton(k, color, mine) {
  const m = patternMeta(k);
  const p = pattern(k);
  const b = document.createElement('button');
  b.className = 'stamp';
  b.style.color = color;
  const big = p.w > S.L.w || p.h > S.L.h;
  b.innerHTML = thumb(k, color) + '<span>' + m.label + '</span>' +
    (p.w * p.h >= 2500 ? '<i' + (big ? ' class="big"' : '') + '>' + p.w + '&times;' + p.h + '</i>' : '');
  b.title = m.label + ' — ' + p.w + '×' + p.h + ', ' + p.cells.length + ' cells' +
    (m.note ? '\n' + m.note : '') + (m.credit ? '\n' + m.credit : '') +
    (big ? '\nBigger than the dish — selecting it offers to enlarge the dish' : '');
  b.onclick = () => pickPiece(k);
  if (mine) {
    const x = document.createElement('span'); x.className = 'del'; x.innerHTML = '&#10005;'; x.title = 'Delete this pattern';
    x.onclick = (e) => { e.stopPropagation(); custom.remove(k); renderTray(); tlog('> deleted ' + m.label, 't-warn'); };
    b.appendChild(x);
  }
  el.stampBtns[k] = b;
  return b;
}

/** Picks a stamp, offering to grow the dish first when it would not fit. */
/* ---------------- the piece in hand ---------------- *
 * One model for everything that is not yet on the board. A piece is a set of
 * cells (already turned the way you see them -- there is no hidden rotation
 * state to compose wrongly) at a top-left position, plus how it got here:
 *
 *   from the tray   -> it follows the pointer until a click parks it
 *                      (on touch it parks in the middle of the view at once);
 *   lifted by SELECT-> it is parked where it was, and Esc puts it back.
 *
 * Parked, it is dragged to move, nudged by arrows, turned by R and F about
 * its own centre, dropped by Enter or a click outside it, removed by Delete,
 * copied, saved, or stamped again. Anything that plainly means "I am done
 * with it" -- RUN, STEP, picking another pattern, starting a new selection --
 * drops it first, so it never has to be thought about.
 */
function makePiece(cells, w, h, extra) {
  return { cells, w, h, x: 0, y: 0, follow: false, origin: null, key: null, label: 'PIECE', rot: 0, flip: false, ...extra };
}
function isTouch() { return matchMedia('(hover: none)').matches; }
function pieceCenterAt(pc, cx, cy) { pc.x = cx - (pc.w >> 1); pc.y = cy - (pc.h >> 1); }
function pieceHit(c) { const pc = S.piece; return !!(pc && c && c.x >= pc.x && c.y >= pc.y && c.x < pc.x + pc.w && c.y < pc.y + pc.h); }

/** Takes a pattern off the shelf into the hand, offering a bigger dish first if it needs one. */
function pickPiece(k) {
  const p = pattern(k), m = patternMeta(k);
  if (p.w > S.L.w || p.h > S.L.h) {
    const [nw, nh] = fitDish(p.w, p.h);
    showMsg(
      'BIGGER THAN THE DISH',
      m.label + ' is ' + p.w + '×' + p.h + ' cells; the dish is ' + S.L.w + '×' + S.L.h + '.\n' +
      'Enlarge the dish to ' + nw + '×' + nh + '? Everything on it is kept.' +
      (nw * nh > 2e6 ? '\n\nA dish this size steps slowly — expect a few generations a second, not hundreds.' : ''),
      [
        { label: 'ENLARGE & PLACE', fn: () => {
          hideMsg();
          commitPiece();
          resizeDish(nw, nh);
          const pc = makePiece(p.cells.map(c => [c[0], c[1]]), p.w, p.h, { key: k, label: m.label });
          pieceCenterAt(pc, nw >> 1, nh >> 1);
          S.piece = pc;
          // One sensible place for something this size: the middle, down.
          commitPiece();
          fitCamera();
        } },
        { label: 'CANCEL', fn: hideMsg },
      ]
    );
    return;
  }
  commitPiece();
  const pc = makePiece(p.cells.map(c => [c[0], c[1]]), p.w, p.h, { key: k, label: m.label, follow: !isTouch() });
  const r = cv.getBoundingClientRect();
  const c = S.hover && inGrid(S.hover) ? S.hover : screenToCell(r.width / 2, r.height / 2);
  pieceCenterAt(pc, c.x, c.y);
  S.piece = pc;
  if (S.tool === 'sel') S.tool = 'pan';
  syncTools(); syncPieceBar(true);
}

/** Cell under a point on the canvas, in CSS pixels from its top-left. */
function screenToCell(mx, my) {
  return { x: Math.floor((mx - S.cam.x) / S.cam.s), y: Math.floor((my - S.cam.y) / S.cam.s) };
}

/** The marquee, clamped to the board, as a rectangle, or null. */


/** Lifts the cells inside the marquee into the hand. They leave the board
 *  as they do, which is what makes "drag it somewhere else" mean what it says. */
function liftSelection() {
  const r = selRect();
  S.sel = null;
  if (!r) return;
  const raw = [];
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) if (S.eng.get(x, y)) raw.push([x, y]);
  if (!raw.length) { deny('nothing in that box'); return; }
  pushUndo();
  let bx = Infinity, by = Infinity;
  for (const [x, y] of raw) { if (x < bx) bx = x; if (y < by) by = y; }
  for (const [x, y] of raw) S.eng.set(x, y, 0);
  const n = normalizeCells(raw);
  S.piece = makePiece(n.cells, n.w, n.h, { x: bx, y: by, label: 'SELECTION', origin: { x: bx, y: by, cells: n.cells.slice() } });
  syncPieceBar(true);
  tlog('> picked up ' + raw.length + ' cells — drag to move, R/F to turn, Enter to drop, Esc to put back', 't-sys');
}

/** Puts the piece down on the board. With keep, a copy lands and the piece stays in hand. */
function commitPiece(keep) {
  const pc = S.piece; if (!pc) return;
  pushUndo();
  let lost = 0;
  for (const [x, y] of pc.cells) {
    const gx = pc.x + x, gy = pc.y + y;
    if (gx < 0 || gy < 0 || gx >= S.L.w || gy >= S.L.h) { lost++; continue; }
    S.eng.set(gx, gy, 1);
  }
  S.stampsUsed++;
  tlog('> ' + pc.label + ' @ (' + pc.x + ',' + pc.y + ')' + (lost ? ' — ' + lost + ' cells fell off the edge' : ''), lost ? 't-warn' : 't-sys');
  if (!keep) S.piece = null;
  syncPieceBar(true);
}
/** Esc: a lifted selection goes back where it was; a tray piece just vanishes. */
function cancelPiece() {
  const pc = S.piece; if (!pc) return;
  if (pc.origin) for (const [x, y] of pc.origin.cells) S.eng.set(pc.origin.x + x, pc.origin.y + y, 1);
  S.piece = null; syncPieceBar(true);
}
function deletePiece() {
  const pc = S.piece; if (!pc) return;
  tlog('> ' + (pc.origin ? 'deleted ' + pc.cells.length + ' cells' : 'dropped ' + pc.label), 't-sys');
  S.piece = null; syncPieceBar(true);
}
function rotatePiece() {
  const pc = S.piece; if (!pc) return;
  const cx = pc.x + pc.w / 2, cy = pc.y + pc.h / 2;
  const t = transformCells(pc, 1, false);
  pc.cells = t.cells; pc.w = t.w; pc.h = t.h;
  pc.x = Math.round(cx - pc.w / 2); pc.y = Math.round(cy - pc.h / 2);
  ({ rot: pc.rot, flip: pc.flip } = nextOrientation(pc.rot, pc.flip, 'rotate'));
  syncPieceBar(true);
}
function flipPiece() {
  const pc = S.piece; if (!pc) return;
  const t = transformCells(pc, 0, true);
  pc.cells = t.cells;
  ({ rot: pc.rot, flip: pc.flip } = nextOrientation(pc.rot, pc.flip, 'flip'));
  syncPieceBar(true);
}
function nudgePiece(dx, dy) { const pc = S.piece; if (!pc) return; pc.x += dx; pc.y += dy; pc.follow = false; syncPieceBar(); }

function savePiece() {
  const pc = S.piece; if (!pc) return;
  showPrompt('SAVE AS PATTERN', pc.w + '×' + pc.h + ', ' + pc.cells.length + ' cells. Name it:', pc.key ? pc.label : 'MY PATTERN', (name) => {
    const key = custom.add(name, pc.cells, pc.w, pc.h);
    hideMsg(); renderTray();
    tlog('> saved ' + patternMeta(key).label + ' to CUSTOM', 't-sys');
  });
}
/** The piece as RLE, to the clipboard and to an in-page clip for Ctrl+V. */
let clip = null;
function copyPiece() {
  const pc = S.piece; if (!pc) return;
  clip = { cells: pc.cells.map(c => [c[0], c[1]]), w: pc.w, h: pc.h, label: pc.label };
  const { header, body } = encodeRLE(pc.cells, pc.w, pc.h);
  const text = header + '\n' + body;
  const done = () => tlog('> copied ' + pc.cells.length + ' cells as RLE', 't-sys');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => showPrompt('RLE', 'Clipboard access was refused; copy it from here:', '', null, text));
  else showPrompt('RLE', 'Copy it from here:', '', null, text);
}
/** Ctrl+V: the in-page clip, else whatever RLE the system clipboard holds. */
function pasteClip() {
  const put = (cells, w, h, label) => {
    commitPiece();
    const pc = makePiece(cells, w, h, { label, follow: !isTouch() });
    const r = cv.getBoundingClientRect();
    const c = S.hover && inGrid(S.hover) ? S.hover : screenToCell(r.width / 2, r.height / 2);
    pieceCenterAt(pc, c.x, c.y);
    S.piece = pc; syncPieceBar(true);
  };
  if (clip) { put(clip.cells.map(c => [c[0], c[1]]), clip.w, clip.h, clip.label); return; }
  if (!navigator.clipboard?.readText) { deny('nothing to paste — copy a piece first'); return; }
  navigator.clipboard.readText().then((t) => {
    const parsed = parseRLE(t || '');
    if (!parsed.rle) { deny('the clipboard holds no RLE'); return; }
    const d = normalizeCells(decodeRLE(parsed.rle).cells);
    if (!d.cells.length) { deny('the clipboard holds no RLE'); return; }
    put(d.cells, d.w, d.h, parsed.name || 'PASTED');
  }, () => deny('clipboard access was refused'));
}

/**
 * The bar that rides on the piece: what it is, drawn as it will land, and
 * every thing that can be done to it, each with its key. Sits just above the
 * piece's box while parked (below if there is no room), pinned to the top of
 * the dish while following the pointer so it does not chase the cursor.
 */
function syncPieceBar(rebuild) {
  if (!pieceBar) return;
  const pc = S.piece;
  if (!pc) { pieceBar.hidden = true; return; }
  if (rebuild || pieceBar.hidden) {
    const color = (pc.key && el.stampBtns[pc.key] && el.stampBtns[pc.key].style.color) || (pc.origin ? '#e5c07b' : '#56b6c2');
    const touch = isTouch();
    pieceBar.hidden = false;
    pieceBar.innerHTML =
      '<span class="sbthumb" style="color:' + color + '" title="As it will land">' + thumbOf(pc, color, 30) + '</span>' +
      '<b style="color:' + color + '">' + pc.label + '</b><small>' + pc.w + '&times;' + pc.h + ' &middot; ' + pc.cells.length + '</small>' +
      '<button class="tb" id="pb-rot" title="Turn a quarter turn clockwise [R]">' + ICONS.rot + '<span>ROTATE</span></button>' +
      '<button class="tb" id="pb-flip" title="Mirror left-to-right [F]">' + ICONS.flip + '<span>FLIP</span></button>' +
      '<button class="tb" id="pb-copy" title="Copy as RLE [Ctrl+C]">' + ICONS.draw + '<span>COPY</span></button>' +
      '<button class="tb" id="pb-save" title="Save to the CUSTOM shelf [Ctrl+S]">' + ICONS.lab + '<span>SAVE</span></button>' +
      '<button class="tb go" id="pb-drop" title="Put it down here [Enter, or click outside it]">' + ICONS.check + '<span>DROP</span></button>' +
      '<button class="tb" id="pb-again" title="Put a copy down and keep this one in hand [Ctrl+D]">' + ICONS.soup + '<span>STAMP</span></button>' +
      '<button class="tb bad" id="pb-del" title="' + (pc.origin ? 'Delete these cells [Delete]' : 'Throw it away without placing it [Delete]') + '">' + ICONS.wipe + '<span>DELETE</span></button>' +
      '<em>' + (pc.follow ? 'click to put it down · shift-click to stamp copies' : touch ? 'drag to move · tap outside to drop' : 'drag to move · arrows nudge · click outside or Enter drops · Esc ' + (pc.origin ? 'puts it back' : 'cancels') + ' · Ctrl+Z undoes') + '</em>';
    pieceBar.querySelector('#pb-rot').onclick = rotatePiece;
    pieceBar.querySelector('#pb-flip').onclick = flipPiece;
    pieceBar.querySelector('#pb-copy').onclick = copyPiece;
    pieceBar.querySelector('#pb-save').onclick = savePiece;
    pieceBar.querySelector('#pb-drop').onclick = () => commitPiece();
    pieceBar.querySelector('#pb-again').onclick = () => commitPiece(true);
    pieceBar.querySelector('#pb-del').onclick = deletePiece;
  }
  placePieceBar();
}
function placePieceBar() {
  const pc = S.piece; if (!pc || !pieceBar || pieceBar.hidden) return;
  const wrap = cv.getBoundingClientRect();
  const bw = pieceBar.offsetWidth, bh = pieceBar.offsetHeight;
  let left, top;
  if (pc.follow) { left = (wrap.width - bw) / 2; top = 8; }
  else {
    const [sx, sy, sw, sh] = cellRect(pc.x, pc.y, pc.w, pc.h);
    left = sx + sw / 2 - bw / 2;
    top = sy - bh - 8;
    if (top < 4) top = sy + sh + 8;
    if (top + bh > wrap.height - 4) top = Math.max(4, wrap.height - bh - 4);
  }
  left = Math.max(4, Math.min(wrap.width - bw - 4, left));
  pieceBar.style.left = Math.round(left) + 'px';
  pieceBar.style.top = Math.round(top) + 'px';
}

/* ---------------- undo ---------------- *
 * Every edit -- a drop, a delete, a stroke of DRAW, SOUP, CLEAR -- snapshots
 * the board first. Ctrl+Z walks back. Kept apart from BACK, which rewinds
 * generations: one is "I did not mean that", the other "what just happened".
 */
const undoStack = [];
let undoBytes = 0;
function pushUndo() {
  const snap = S.eng.snapshot();
  undoStack.push(snap); undoBytes += snap.a.byteLength;
  while (undoStack.length > 60 || undoBytes > 4.8e7) undoBytes -= undoStack.shift().a.byteLength;
}
function undoEdit() {
  const snap = undoStack.pop();
  if (!snap) { deny('nothing to undo'); return; }
  undoBytes -= snap.a.byteLength;
  if (S.piece) { S.piece = null; syncPieceBar(true); }
  S.eng.restore(snap);
  S.running = false; syncRun();
  tlog('> undo', 't-sys');
}

/** The smallest shelf size with margin around w×h, or a custom one past the shelf. */
function fitDish(w, h) {
  for (const [dw, dh] of DISH_SIZES) if (dw >= w + 40 && dh >= h + 40) return [dw, dh];
  return [w + 80, h + 80];
}





/** The selection as a clamped rectangle, or null. */
function selRect() {
  const q = S.sel; if (!q) return null;
  const x = Math.max(0, Math.min(q.x0, q.x1)), y = Math.max(0, Math.min(q.y0, q.y1));
  const x2 = Math.min(S.L.w - 1, Math.max(q.x0, q.x1)), y2 = Math.min(S.L.h - 1, Math.max(q.y0, q.y1));
  if (x2 < x || y2 < y) return null;
  return { x, y, w: x2 - x + 1, h: y2 - y + 1 };
}




function importRLE() {
  showPrompt('PASTE RLE', 'A whole .rle file or just the body (b = dead, o = alive, $ = next row, ! = end).', 'NAME', (name, text) => {
    const parsed = parseRLE(text || '');
    let d;
    try { d = parsed.rle ? normalizeCells(decodeRLE(parsed.rle).cells) : null; } catch { d = null; }
    if (!d || !d.cells.length) { deny('that is not RLE I can read'); return; }
    const key = custom.add(name || parsed.name || 'PASTED', d.cells, d.w, d.h, parsed.comments[0]);
    hideMsg(); renderTray();
    tlog('> imported ' + patternMeta(key).label + ' (' + d.w + '×' + d.h + ', ' + d.cells.length + ' cells)', 't-sys');
    pickPiece(key);
  }, '', true);
}

/* ---------------- level loading ---------------- */
function loadLevel(i) {
  S.idx = i; const L = { ...LEVELS[i] }; S.L = L;
  S.eng = new Life(L.w, L.h);
  S.ghost = new Float32Array(L.w * L.h);
  S.buf = document.createElement('canvas'); S.buf.width = L.w; S.buf.height = L.h;
  S.bctx = S.buf.getContext('2d');
  S.img = S.bctx.createImageData(L.w, L.h);
  S.presetPop = 0;
  S.phase = 'edit'; S.running = false; S.stampsUsed = 0; S.snap = null; S.goal = null;
  S.piece = null; S.sel = null; S.drag = null; lastDeny = ''; S.stepIdx = 0; S.won = false;
  undoStack.length = 0; undoBytes = 0;
  S.tool = 'draw';
  buildTopbar(); buildTray(); syncDishBtn();
  fitCamera();
  hideMsg();
  syncRun(); syncTools(); syncPieceBar(true);
}

/* ---------------- dish size ---------------- */
/** Re-makes the board at w×h, keeping every cell that still fits. */
function resizeDish(w, h) {
  const old = S.eng, L = S.L;
  const eng = new Life(w, h);
  const cw = Math.min(L.w, w), ch = Math.min(L.h, h);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const v = old.get(x, y); if (v) eng.set(x, y, v); }
  eng.gen = old.gen;
  L.w = w; L.h = h;
  S.eng = eng;
  S.ghost = new Float32Array(w * h);
  S.buf = document.createElement('canvas'); S.buf.width = w; S.buf.height = h;
  S.bctx = S.buf.getContext('2d');
  S.img = S.bctx.createImageData(w, h);
  S.rewind.length = 0;
  undoStack.length = 0; undoBytes = 0;
  S.sel = null;
  clampCam();
  syncDishBtn(); renderTray();
  tlog('> DISH ' + w + '×' + h, 't-sys');
}

function syncDishBtn() {
  if (!el.dish) return;
  el.dish.innerHTML = ICONS.dish + '<span>' + S.L.w + '&times;' + S.L.h + '</span>';
}

/** Next size on the shelf; shrinking asks first when cells would fall off. */
function cycleDish() {
  const i = DISH_SIZES.findIndex(([w, h]) => w === S.L.w && h === S.L.h);
  const [w, h] = DISH_SIZES[(i + 1) % DISH_SIZES.length];
  const lost = (w < S.L.w || h < S.L.h) ? S.eng.pop - S.eng.rectCount({ x: 0, y: 0, w: Math.min(w, S.L.w), h: Math.min(h, S.L.h) }) : 0;
  if (lost > 0) {
    showMsg('SHRINK THE DISH?', lost + ' cells lie outside ' + w + '×' + h + ' and would be lost.',
      [{ label: 'SHRINK IT', fn: () => { hideMsg(); resizeDish(w, h); } }, { label: 'KEEP IT', fn: hideMsg }], true);
    return;
  }
  resizeDish(w, h);
}

/** How many snapshots the rewind keeps: forty on a small dish, a few on a huge one. */
function rewindCap() { return Math.max(3, Math.min(40, Math.floor(1.6e7 / (S.L.w * S.L.h)))); }

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
          pushUndo();
          S.piece = null; syncPieceBar(true);
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



/* ---------------- run control ---------------- */
function startPause() {
  if (S.running) { S.running = false; syncRun(); return; }
  commitPiece();
  if (S.eng.pop === 0) { deny('the dish is empty'); return; }
  S.running = true; syncRun();
}
function stepOnce() {
  commitPiece();
  if (S.eng.pop === 0) { deny('the dish is empty'); return; }
  S.running = false; doStep(); syncRun();
}
function reset() {
  if (S.eng.pop || S.piece) pushUndo();
  S.piece = null; syncPieceBar(true);
  S.eng.clear();
  S.ghost.fill(0);
  S.rewind.length = 0;
  S.running = false;
  syncRun();
  tlog('> CLEAR', 't-sys');
}
function soup() {
  commitPiece();
  pushUndo();
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
  while (S.rewind.length > rewindCap()) S.rewind.shift();
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
  for (const [n, b] of Object.entries(el.toolBtns)) b.classList.toggle('on', S.tool === n);
  if (S.tool !== 'sel') S.sel = null;
  const held = S.piece && S.piece.key;
  for (const [n, b] of Object.entries(el.stampBtns)) { const on = held === n; b.classList.toggle('on', on); b.style.borderColor = on ? b.style.color : ''; }
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

/**
 * A dialog with a name field and, optionally, a text area. Built in the dish
 * rather than with window.prompt: a native prompt is modal for the whole
 * browser, cannot be styled, and on some setups never returns focus.
 * @param {string} title @param {string} text @param {string} placeholder
 * @param {((name: string, body: string) => void) | null} onOk
 * @param {string=} body @param {boolean=} withBody
 */
function showPrompt(title, text, placeholder, onOk, body = '', withBody = false) {
  msgEl.innerHTML = '';
  const box = document.createElement('div'); box.className = 'box';
  const h = document.createElement('h2'); h.textContent = title;
  const p = document.createElement('p'); p.textContent = text;
  box.append(h, p);
  let input = null, area = null;
  if (onOk) {
    input = document.createElement('input'); input.type = 'text'; input.placeholder = placeholder; input.maxLength = 28; input.className = 'pin';
    box.appendChild(input);
  }
  if (withBody || body) {
    area = document.createElement('textarea'); area.className = 'pta'; area.spellcheck = false;
    area.placeholder = 'x = 3, y = 3\nbob$2bo$3o!';
    if (body) { area.value = body; area.readOnly = true; }
    box.appendChild(area);
  }
  const row = document.createElement('div'); row.className = 'row';
  if (onOk) {
    const ok = document.createElement('button'); ok.className = 'tb'; ok.innerHTML = '<span>OK</span>';
    ok.onclick = () => onOk(input.value.trim(), area ? area.value : '');
    row.appendChild(ok);
  }
  const cancel = document.createElement('button'); cancel.className = 'tb'; cancel.innerHTML = '<span>' + (onOk ? 'CANCEL' : 'CLOSE') + '</span>';
  cancel.onclick = hideMsg;
  row.appendChild(cancel);
  box.appendChild(row); msgEl.appendChild(box);
  msgEl.classList.remove('hidden');
  (area && !body ? area : input || cancel).focus();
  if (input) input.onkeydown = (e) => { if (e.key === 'Enter') onOk(input.value.trim(), area ? area.value : ''); };
}

/* ---------------- camera / input ---------------- */
function fitCamera() {
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  const s = Math.min((r.width - 60) / S.L.w, (r.height - 60) / S.L.h);
  // Caps, not targets. The lesson draws a number inside every cell so it needs
  // room to read one, but letting a 13x9 board fill an 842px panel gives 54px
  // cells that read as a bug rather than a board; 30 is legible and still looks
  // like a grid. Elsewhere 22 is plenty.
  // The floor lets a 2000-cell dish fit on screen as a map; on the default
  // dish the fit is well above it anyway.
  S.cam.s = Math.max(0.3, Math.min(22, s));
  S.cam.x = (r.width - S.L.w * S.cam.s) / 2;
  S.cam.y = (r.height - S.L.h * S.cam.s) / 2;
}

/* ---------------- camera bounds ---------------- *
 * The board is finite, so the view is too. Without this the grid can be panned
 * off the canvas entirely, or zoomed until one cell fills the screen or the
 * whole dish is a speck -- states the player then has to undo by hand before
 * they can carry on.
 *
 * At least a third of the board stays on screen in each axis, and a board that
 * already fits is simply centred. Zoom is held between "a cell is still worth
 * drawing" and "a cell is a fifth of the viewport".
 */
function clampCam() {
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return;

  const minS = Math.max(0.25, Math.min(r.width / S.L.w, r.height / S.L.h) * 0.55);
  const maxS = Math.max(minS + 0.1, Math.min(r.width, r.height) / 5);
  S.cam.s = Math.max(minS, Math.min(maxS, S.cam.s));

  const bw = S.L.w * S.cam.s, bh = S.L.h * S.cam.s;
  const keepX = Math.min(bw, r.width) / 3;
  const keepY = Math.min(bh, r.height) / 3;
  if (bw <= r.width) S.cam.x = (r.width - bw) / 2;
  else S.cam.x = Math.max(r.width - bw - keepX, Math.min(keepX, S.cam.x));
  if (bh <= r.height) S.cam.y = (r.height - bh) / 2;
  else S.cam.y = Math.max(r.height - bh - keepY, Math.min(keepY, S.cam.y));
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

/** Zoom about a canvas-space point by factor k (wheel and pinch share it). */
function zoomAt(mx, my, k) {
  const ns = Math.max(0.25, Math.min(48, S.cam.s * k));
  const kk = ns / S.cam.s;
  S.cam.x = mx - (mx - S.cam.x) * kk;
  S.cam.y = my - (my - S.cam.y) * kk;
  S.cam.s = ns;
  clampCam();
}

/* Touch: pointer events already unify mouse and finger for drawing and
   panning, but a phone has no wheel, so zoom needs two fingers. While two
   are down, the gesture owns the camera -- pinch scales about the midpoint
   and moving both pans -- and whatever single-finger drag was in progress is
   dropped so a second finger never paints a stray line. */
const touches = new Map();
let pinch = null;

function bindInput() {
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { cv.setPointerCapture(e.pointerId); } catch {}
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      S.drag = null;
      return;
    }
    if (touches.size > 2) return;
  }
  if (e.button === 1) return;
  const c = toCell(e);
  const pc = S.piece;
  if (pc && e.button === 0) {
    if (pc.follow) {
      // Following the pointer: this click parks it. Shift stamps a copy and
      // keeps following, for laying down a row of the same thing.
      pieceCenterAt(pc, c.x, c.y);
      if (e.shiftKey) { commitPiece(true); return; }
      pc.follow = false; syncPieceBar(true); return;
    }
    if (pieceHit(c)) {
      S.drag = { mode: 'piece', cx: c.x, cy: c.y, px: pc.x, py: pc.y };
      try { cv.setPointerCapture(e.pointerId); } catch {}
      return;
    }
    // Outside it: that is "done with it". The click is spent on that.
    commitPiece();
    return;
  }
  if (e.button === 2 || (S.tool === 'pan' && e.button === 0)) {
    S.drag = { mode: 'pan', mx: e.clientX, my: e.clientY };
    try { cv.setPointerCapture(e.pointerId); } catch {}
    return;
  }
  if (e.button !== 0) return;
  if (S.tool === 'sel') {
    S.sel = { x0: c.x, y0: c.y, x1: c.x, y1: c.y };
    S.drag = { mode: 'select' };
    try { cv.setPointerCapture(e.pointerId); } catch {}
    return;
  }
  if (S.tool === 'draw') {
    if (!inGrid(c)) return;
    pushUndo();
    S.paintVal = S.eng.get(c.x, c.y) ? 0 : 1;
    paint(c.x, c.y, S.paintVal);
    S.drag = { mode: 'paint' };
    try { cv.setPointerCapture(e.pointerId); } catch {}
  } else if (S.tool === 'erase') {
    if (!inGrid(c)) return;
    pushUndo();
    paint(c.x, c.y, 0);
    S.drag = { mode: 'erase' };
    try { cv.setPointerCapture(e.pointerId); } catch {}
  }
});
  onPointerMove = e => {
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const r = cv.getBoundingClientRect();
      S.cam.x += mx - pinch.mx; S.cam.y += my - pinch.my;
      if (pinch.d > 0) zoomAt(mx - r.left, my - r.top, d / pinch.d);
      pinch = { d, mx, my };
      return;
    }
    if (pinch) return;
  }
  S.hover = toCell(e);
  const pc = S.piece;
  if (pc && pc.follow) pieceCenterAt(pc, S.hover.x, S.hover.y);
  if (!S.drag) return;
  if (S.drag.mode === 'piece') {
    const c = toCell(e);
    pc.x = S.drag.px + (c.x - S.drag.cx); pc.y = S.drag.py + (c.y - S.drag.cy);
    return;
  }
  if (S.drag.mode === 'select') {
    const c = toCell(e);
    S.sel.x1 = Math.max(0, Math.min(S.L.w - 1, c.x)); S.sel.y1 = Math.max(0, Math.min(S.L.h - 1, c.y));
    return;
  }
  if (S.drag.mode === 'pan') {
    S.cam.x += e.clientX - S.drag.mx;
    S.cam.y += e.clientY - S.drag.my;
    S.drag.mx = e.clientX; S.drag.my = e.clientY;
    clampCam();
  } else if (S.drag.mode === 'paint') {
    const c = toCell(e); if (inGrid(c)) paint(c.x, c.y, S.paintVal);
  } else if (S.drag.mode === 'erase') {
    const c = toCell(e); if (inGrid(c)) paint(c.x, c.y, 0);
  }
  };
  onPointerUp = e => {
    const was = S.drag && S.drag.mode;
    S.drag = null;
    if (e && touches.delete(e.pointerId) && touches.size < 2) pinch = null;
    if (was === 'select') liftSelection();
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  /* Trackpad two-finger scroll pans; ctrl/cmd + wheel (which is also what a
     trackpad pinch reports) zooms.
     Every wheel event used to zoom, so a two-finger swipe -- the ordinary way
     to move around anything on a laptop -- shot the board in and out instead
     of moving it, and there was no way to pan on the X axis at all without
     picking up the PAN tool and dragging.
     A mouse wheel still zooms: it reports large deltaY in whole notches with
     no deltaX, which is the shape checked for below. */
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();

    // Pinch on a trackpad arrives as ctrlKey + wheel; cmd is the same gesture
    // by keyboard. Both mean zoom whatever the device.
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0012));
      return;
    }

    /* Anything else pans -- including a plain mouse wheel, which pans
       vertically the way a wheel does over any other scrollable thing.
       Distinguishing wheel from trackpad by delta size was tried and is not
       reliable: Chrome reports deltaMode 0 for both, and a slow wheel notch
       looks exactly like a trackpad swipe. Zoom stays on the gesture that
       unambiguously means zoom: ctrl/cmd + wheel, which is also exactly what
       a trackpad pinch reports, plus the two-finger pinch handled above. */

    S.cam.x -= e.deltaX;
    S.cam.y -= e.deltaY;
    clampCam();
  }, { passive: false });

  onKeyDown = e => {
  // A dialog is modal: the mode chooser, the shop, and the win/fail boxes all
  // sit over the board, and SPACE running the simulation behind one of them was
  // how a shown failure could quietly become a win.
  if (msgEl && !msgEl.classList.contains('hidden')) { if (e.key === 'Escape') hideMsg(); return; }
  // Typing in the tray's search box is not a command.
  const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea') return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && !e.altKey) {
    if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undoEdit(); }
    else if (e.code === 'KeyC' && S.piece) { e.preventDefault(); copyPiece(); }
    else if (e.code === 'KeyV') { e.preventDefault(); pasteClip(); }
    else if (e.code === 'KeyD' && S.piece) { e.preventDefault(); commitPiece(true); }
    else if (e.code === 'KeyS' && S.piece) { e.preventDefault(); savePiece(); }
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); startPause(); }
  else if (e.code === 'KeyN' || e.code === 'Period') stepOnce();
  else if (e.code === 'KeyR') rotatePiece();
  else if (e.code === 'KeyF') flipPiece();
  else if (e.code === 'Enter') { if (S.piece) { e.preventDefault(); commitPiece(); } }
  else if (e.code === 'Delete' || e.code === 'Backspace') { if (S.piece) { e.preventDefault(); deletePiece(); } }
  else if (e.code.startsWith('Arrow') && S.piece) {
    e.preventDefault();
    const n = e.shiftKey ? 10 : 1;
    nudgePiece(e.code === 'ArrowLeft' ? -n : e.code === 'ArrowRight' ? n : 0, e.code === 'ArrowUp' ? -n : e.code === 'ArrowDown' ? n : 0);
  }
  else if (e.code === 'Escape') {
    if (S.piece) { cancelPiece(); return; }
    if (S.sel) { S.sel = null; S.drag = null; return; }
    S.tool = 'pan'; syncTools();
  }
  };
  window.addEventListener('keydown', onKeyDown);
}

function unbindInput() {
  if (onPointerMove) window.removeEventListener('pointermove', onPointerMove);
  if (onPointerUp) { window.removeEventListener('pointerup', onPointerUp); window.removeEventListener('pointercancel', onPointerUp); }
  touches.clear(); pinch = null;
  if (onKeyDown) window.removeEventListener('keydown', onKeyDown);
  onPointerMove = onPointerUp = onKeyDown = null;
}

/* ---------------- theme ---------------- */
/* The dish takes its colors from the site's theme tokens, read off the canvas'
   own computed style (style.css aliases them as --ll-*). Read once at start
   and again whenever the root layout repaints :root for a theme change --
   never per frame; getComputedStyle inside the draw loop is a layout flush
   per frame for a value that changes a few times a day. Only the game-state
   ramp for live cells (yellow -> green -> blue by age) stays the game's own. */
const THEME = { bg: [22, 23, 29], panel: [27, 29, 36], fg: [216, 222, 233], accent: [86, 182, 194] };
function parseColor(str) {
  const v = (str || '').trim();
  let m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [...m[1]].map(c => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})/i.exec(v);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(([^)]+)\)/.exec(v);
  if (m) return m[1].split(/[\s,/]+/).slice(0, 3).map(Number);
  return null;
}
function readTheme() {
  if (!cv) return;
  const cs = getComputedStyle(cv);
  for (const [k, prop] of [['bg', '--ll-bg'], ['panel', '--ll-panel'], ['fg', '--ll-fg'], ['accent', '--ll-accent']]) {
    const c = parseColor(cs.getPropertyValue(prop));
    if (c) THEME[k] = c;
  }
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
let themeObs = null;

/* ---------------- rendering ---------------- */
function resize() {
  const r = cv.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
}

/** The cells the camera can see, plus one, clamped to the board. */
function visibleRange() {
  const r = cv.getBoundingClientRect();
  return {
    x0: Math.max(0, Math.floor(-S.cam.x / S.cam.s) - 1),
    y0: Math.max(0, Math.floor(-S.cam.y / S.cam.s) - 1),
    x1: Math.min(S.L.w, Math.ceil((r.width - S.cam.x) / S.cam.s) + 1),
    y1: Math.min(S.L.h, Math.ceil((r.height - S.cam.y) / S.cam.s) + 1),
  };
}

/** Repaints the visible part of the board image. Off-screen cells are left
 *  as they were; they are repainted the moment they scroll into view. On a
 *  2000×1800 dish this is the difference between 60 frames a second and 8. */
function updateImage(v) {
  const L = S.L, e = S.eng, d = S.img.data, g = S.ghost, st = e.stride, a = e.a;
  const [pr, pg, pb] = THEME.panel, [ar, ag, ab] = THEME.accent;
  for (let y = v.y0; y < v.y1; y++) {
    let si = (y + 1) * st + v.x0 + 1, gi = y * L.w + v.x0, di = gi * 4;
    for (let x = v.x0; x < v.x1; x++, si++, gi++, di += 4) {
      const v0 = a[si];
      let r, gg, b, al = 255;
      if (v0) {
        g[gi] = 1;
        const t = Math.min(v0, 40) / 40;
        if (t < 0.35) {
          const u = t / 0.35;
          r = (229 - 77 * u) | 0; gg = (192 + 3 * u) | 0; b = (123 - 2 * u) | 0;
        } else {
          const u = (t - 0.35) / 0.65;
          r = (152 - 55 * u) | 0; gg = (195 - 20 * u) | 0; b = (121 + 118 * u) | 0;
        }
      } else {
        // Dead cells are the theme's panel color, left translucent so the
        // board is a faint slab over the same video-lit backdrop as every
        // other panel rather than an opaque hole in it. A fading ghost of a cell
        // that just died tints toward the theme accent.
        let f = g[gi] * 0.90;
        if (f < 0.02) f = 0;
        g[gi] = f;
        const k = f * 0.5;
        r = (pr + (ar - pr) * k) | 0; gg = (pg + (ag - pg) * k) | 0; b = (pb + (ab - pb) * k) | 0;
        al = (90 + 120 * f) | 0;
      }
      d[di] = r; d[di + 1] = gg; d[di + 2] = b; d[di + 3] = al;
    }
  }
}

/** A cell rectangle in screen space, from the camera. */
function cellRect(x, y, w, h) {
  return [S.cam.x + x * S.cam.s, S.cam.y + y * S.cam.s, w * S.cam.s, h * S.cam.s];
}

function drawGrid() {
  if (S.cam.s < 7) return;
  const r = cv.getBoundingClientRect();
  const x0 = Math.max(0, Math.floor(-S.cam.x / S.cam.s));
  const x1 = Math.min(S.L.w, Math.ceil((r.width - S.cam.x) / S.cam.s));
  const y0 = Math.max(0, Math.floor(-S.cam.y / S.cam.s));
  const y1 = Math.min(S.L.h, Math.ceil((r.height - S.cam.y) / S.cam.s));
  ctx.strokeStyle = rgba(THEME.fg, .06); ctx.lineWidth = 1;
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

/** The piece in hand: its footprint, then its cells -- green where they will
 *  land on the board, red where they hang off the edge. */
function drawPiece() {
  const pc = S.piece; if (!pc) return;
  const [bx, by, bw, bh] = cellRect(pc.x, pc.y, pc.w, pc.h);
  ctx.save();
  ctx.fillStyle = 'rgba(86,182,194,.06)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = pc.origin ? 'rgba(229,192,123,.9)' : 'rgba(86,182,194,.8)'; ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(bw) - 1, Math.round(bh) - 1);
  ctx.restore();
  const inset = S.cam.s >= 4 ? 1 : 0;
  const ok = 'rgba(86,182,194,.6)', bad = 'rgba(224,108,117,.6)';
  for (const [x, y] of pc.cells) {
    const gx = pc.x + x, gy = pc.y + y;
    ctx.fillStyle = (gx < 0 || gy < 0 || gx >= S.L.w || gy >= S.L.h) ? bad : ok;
    const [sx, sy, sw, sh] = cellRect(gx, gy, 1, 1);
    ctx.fillRect(sx + inset * 0.5, sy + inset * 0.5, Math.max(1, sw - inset), Math.max(1, sh - inset));
  }
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
  const pc = S.piece;
  if (!pc || !pc.key) return;
  if (!S.L.sandbox && S.phase !== 'edit') return;

  const kind = kindOf(pc.key);
  // Only something that travels rigidly has a path worth drawing. Tracing the
  // centre of an oscillator gives a wobble around a fixed point, and tracing
  // the R-pentomino gives a wandering line through an explosion -- both look
  // like a prediction and neither is one. Those get a mark that says what the
  // pattern does instead, which is the honest version of the same help.
  const cells = pc.cells;
  if (!cells.length) return;
  let cx = 0, cy = 0;
  for (const [x, y] of cells) { cx += pc.x + x; cy += pc.y + y; }
  cx = cx / cells.length + 0.5; cy = cy / cells.length + 0.5;

  ctx.save();
  if (kind && kind.kind === 'ship') {
    // A ship's heading is exact, so the line is drawn from it rather than
    // simulated: one cell per `period / |d|` gens, straight until it leaves
    // the board. The rotation the player has applied turns the vector too.
    let [dx, dy] = [kind.dx, kind.dy];
    for (let r = 0; r < (pc.rot & 3); r++) [dx, dy] = [-dy, dx];
    if (pc.flip) dx = -dx;
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
/** The next generation, faintly, while still editing. Simulated for the
 *  visible cells only: on a big dish the whole board is too much to copy and
 *  step every frame, and nothing off screen can be seen anyway. */
function drawGhostFrame() {
  if (!has('ghost') || S.running || S.phase !== 'edit') return;
  if (S.cam.s < 4) return;
  const v = visibleRange();
  const W = v.x1 - v.x0 + 2, H = v.y1 - v.y0 + 2;
  if (W <= 2 || H <= 2 || W * H > 300000) return;
  const sim = new Life(W, H);
  for (let y = v.y0 - 1; y < v.y1 + 1; y++)
    for (let x = v.x0 - 1; x < v.x1 + 1; x++)
      if (x >= 0 && y >= 0 && x < S.L.w && y < S.L.h && S.eng.get(x, y)) sim.set(x - v.x0 + 1, y - v.y0 + 1, 1);
  if (sim.pop === 0 || sim.pop > 1200) return;
  sim.step();
  ctx.fillStyle = 'rgba(152,195,121,.22)';
  for (let y = v.y0; y < v.y1; y++)
    for (let x = v.x0; x < v.x1; x++) {
      if (!sim.get(x - v.x0 + 1, y - v.y0 + 1) || S.eng.get(x, y)) continue;
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
  const v = visibleRange();
  for (let y = v.y0; y < v.y1; y++)
    for (let x = v.x0; x < v.x1; x++) {
      if (S.eng.get(x, y)) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && S.eng.get(x + dx, y + dy)) n++;
      if (!n) continue;
      const [sx, sy, sw, sh] = cellRect(x, y, 1, 1);
      // Three is the one that matters: that cell is about to be born.
      ctx.fillStyle = n === 3 ? 'rgba(152,195,121,.9)' : rgba(THEME.fg, .35);
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
  // Cleared, not painted: outside the board the container's own translucent
  // theme background (style.css) shows, video and all, same as the chrome.
  ctx.clearRect(0, 0, cv.width, cv.height);
  const v = visibleRange();
  if (v.x1 > v.x0 && v.y1 > v.y0) {
    updateImage(v);
    S.bctx.putImageData(S.img, 0, 0, v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(dpr * S.cam.s, 0, 0, dpr * S.cam.s, dpr * S.cam.x, dpr * S.cam.y);
  ctx.drawImage(S.buf, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawDishFrame(); drawGrid(); drawGhostFrame(); drawHeat(); drawPiece(); drawTrace(); drawHover(); drawSelection();
}

/** The edge of the dish: one faint line, so a translucent board still has a
 *  visible boundary and "does not fit" has something to be measured against. */
function drawDishFrame() {
  const [sx, sy, sw, sh] = cellRect(0, 0, S.L.w, S.L.h);
  ctx.strokeStyle = rgba(THEME.fg, .18); ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, Math.round(sw) - 1, Math.round(sh) - 1);
}

/** The SELECT box: a dashed rectangle over the cells it covers. */
function drawSelection() {
  const r = selRect();
  if (!r || S.tool !== 'sel') return;
  const [sx, sy, sw, sh] = cellRect(r.x, r.y, r.w, r.h);
  ctx.save();
  ctx.fillStyle = 'rgba(229,192,123,.08)';
  ctx.fillRect(sx, sy, sw, sh);
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = 'rgba(229,192,123,.9)'; ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
  ctx.restore();
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
    const t0 = performance.now();
    // A big dish steps slowly; past the budget the rest of this frame's
    // generations are dropped rather than the frame, so the view stays live.
    while (acc >= 1 && n < 120 && S.running) {
      acc -= 1; n++; doStep();
      if (performance.now() - t0 > STEP_BUDGET_MS) { acc = 0; break; }
    }
    if (acc > 4) acc = 0;
  } else acc = 0;
  // The page can be replaced between frames; if it was, take the new nodes and
  // re-fit the camera to them before drawing into a canvas of a different size.
  if (bind()) { buildTopbar(); buildTray(); resize(); }
  draw(); updateStats(); updateGuide();
  if (S.piece) { placePieceBar(); cv.style.cursor = S.piece.follow ? 'copy' : pieceHit(S.hover) ? 'move' : 'default'; }
  else if (cv.style.cursor) cv.style.cursor = '';
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

  readTheme();
  // The root layout pushes theme tokens onto <html style> on every switch.
  themeObs = new MutationObserver(readTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

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
  themeObs?.disconnect();
  themeObs = null;
  unbindInput();
  S.running = false;
  clearTimeout(winTimer);
}
