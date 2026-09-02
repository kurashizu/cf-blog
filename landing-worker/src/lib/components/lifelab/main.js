// @ts-nocheck -- the view layer: 1400 lines of canvas and DOM written as plain
// JS, where the state object is built up field by field and every element is
// fetched by id. Checking it under `strict` reports several hundred implicit
// anys and possibly-nulls that are all guaranteed by construction, and typing
// it properly would mean rewriting it in TypeScript. The parts worth checking
// -- the automaton, the pattern library, the level data and the save format --
// are checked: engine.js, patterns.js and levels.js all pass.
import { Life } from './engine.js';
import { pattern, transformCells, kindOf, CATEGORIES, patternMeta, custom, parseRLE, decodeRLE, encodeRLE, normalizeCells } from './patterns.js';
import { LEVELS } from './levels.js';

const $ = s => document.querySelector(s);
// Bound in start(), not at import. A module is evaluated once and cached, but
// the page it draws into is created and destroyed on every SPA navigation --
// so binding here left the second visit holding elements that were no longer
// in the document, drawing into a detached canvas: a blank panel.
let termEl, cv, ctx, topbar, tray, msgEl;
let wipeBtn, logWrap, logToggle, tbScroll, stampBar, selBar, traySecs;
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
  const wrap = $('#cvwrap');
  stampBar = document.createElement('div'); stampBar.id = 'stampbar'; stampBar.className = 'fbar'; stampBar.hidden = true;
  selBar = document.createElement('div'); selBar.id = 'selbar'; selBar.className = 'fbar'; selBar.hidden = true;
  wrap.append(stampBar, selBar);

  // Handlers and the size observer belong to the nodes, so they are re-attached
  // with them rather than once in start().
  wipeBtn.onclick = wipeSave;
  // The two sidebar-header buttons were the only text-only controls left, and
  // one of them erases the save -- the control that most needs to be
  // recognisable at a glance was the least marked.
  wipeBtn.innerHTML = ICONS.wipe + '<span>CLEAR ALL</span>';
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
  tool: 'pan', stamp: null, rot: 0, flip: false,
  /** Rectangle being selected, in cells, or null. */
  sel: null,
  /** On touch, a stamp is previewed at the tapped cell and placed from the bar. */
  pendingTap: null,
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
    el.toolBtns[name] = mkBtn(icon, label, () => { S.tool = name; S.stamp = null; syncTools(); });
  };
  addTool('pan', ICONS.pan, 'PAN');
  el.toolBtns.pan.dataset.tour = 'll-tools';
  if ((L.tools || []).includes('draw')) addTool('draw', ICONS.draw, 'DRAW');
  if ((L.tools || []).includes('erase')) addTool('erase', ICONS.erase, 'ERASE');
  // SELECT: drag a box; the bar that follows saves it as a pattern of your
  // own, copies it as RLE, or clears it.
  addTool('sel', ICONS.sel, 'SELECT');
  el.toolBtns.sel.title = 'Drag a rectangle to save it as a pattern, copy it as RLE, or clear it';
  // No separator before the speed control: it is part of the same "how you
  // work" half as the tools, and the extra 9px was enough to push it onto a
  // second row of its own at ordinary window widths.
  el.spd = mkBtn('', 'SPD ' + SPEEDS[S.speed] + '/s', () => {
    S.speed = (S.speed + 1) % SPEEDS.length;
    el.spd.querySelector('span').textContent = 'SPD ' + SPEEDS[S.speed] + '/s';
  });
  el.dish = mkBtn(ICONS.dish, '', cycleDish);
  el.dish.title = 'Dish size — cycles 320×200, 640×400, 1280×800, 2000×1800. Cells are kept; shrinking asks first if any would be lost.';
  syncDishBtn();
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
  const p = pattern(key);
  const sc = Math.min(26 / p.w, 26 / p.h, 5);
  const W = Math.max(8, Math.round(p.w * sc)), H = Math.max(8, Math.round(p.h * sc));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = color;
  const ox = (W - p.w * sc) / 2, oy = (H - p.h * sc) / 2;
  const cw = Math.max(sc, 0.35);
  for (const [x, y] of p.cells) g.fillRect(ox + x * sc, oy + y * sc, cw, cw);
  const html = '<img width="' + W + '" height="' + H + '" src="' + c.toDataURL() + '" alt="">';
  thumbCache.set(ck, html);
  return html;
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
      add.onclick = () => { S.stamp = null; S.tool = 'sel'; syncTools(); syncStampBar(); tlog('> SELECT: drag a box on the dish, then SAVE', 't-sys'); };
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
  b.onclick = () => selectStamp(k);
  if (mine) {
    const x = document.createElement('span'); x.className = 'del'; x.innerHTML = '&#10005;'; x.title = 'Delete this pattern';
    x.onclick = (e) => { e.stopPropagation(); custom.remove(k); if (S.stamp === k) { S.stamp = null; S.tool = 'pan'; } renderTray(); syncStampBar(); tlog('> deleted ' + m.label, 't-warn'); };
    b.appendChild(x);
  }
  el.stampBtns[k] = b;
  return b;
}

/** Picks a stamp, offering to grow the dish first when it would not fit. */
function selectStamp(k) {
  if (S.stamp === k) { S.stamp = null; S.tool = 'pan'; S.pendingTap = null; syncTools(); syncStampBar(); return; }
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
          resizeDish(nw, nh);
          S.stamp = k; S.rot = 0; S.flip = false; S.tool = 'stamp';
          // One sensible place for something this size: the middle.
          placeStamp(nw >> 1, nh >> 1);
          S.stamp = null; S.tool = 'pan';
          fitCamera(); syncTools(); syncStampBar();
        } },
        { label: 'CANCEL', fn: hideMsg },
      ]
    );
    return;
  }
  S.stamp = k; S.tool = 'stamp'; S.pendingTap = null;
  syncTools(); syncStampBar();
}

/** The smallest shelf size with margin around w×h, or a custom one past the shelf. */
function fitDish(w, h) {
  for (const [dw, dh] of DISH_SIZES) if (dw >= w + 40 && dh >= h + 40) return [dw, dh];
  return [w + 80, h + 80];
}

function syncStampBar() {
  if (!stampBar) return;
  if (!S.stamp) { stampBar.hidden = true; return; }
  const m = patternMeta(S.stamp), p = transformCells(pattern(S.stamp), S.rot, S.flip);
  const touch = matchMedia('(hover: none)').matches;
  stampBar.hidden = false;
  stampBar.innerHTML =
    '<b>' + m.label + '</b><small>' + p.w + '&times;' + p.h + (S.rot ? ' &middot; ' + S.rot * 90 + '&deg;' : '') + (S.flip ? ' &middot; mirrored' : '') + '</small>' +
    (S.pendingTap ? '<button class="tb go" id="sb-place">' + ICONS.check + '<span>PLACE HERE</span></button>' : '') +
    '<button class="tb" id="sb-rot" title="Rotate a quarter turn [R]">' + ICONS.rot + '<span>ROTATE</span></button>' +
    '<button class="tb" id="sb-flip" title="Mirror left-to-right [F]">' + ICONS.flip + '<span>FLIP</span></button>' +
    '<button class="tb" id="sb-done" title="Put the stamp down [Esc]">' + ICONS.close + '<span>DONE</span></button>' +
    '<em>' + (touch ? 'tap the dish to aim, then PLACE HERE · drag to pan' : 'click to place · right-drag to pan · R rotate · F flip · Esc done') + '</em>';
  stampBar.querySelector('#sb-rot').onclick = () => { S.rot = (S.rot + 1) % 4; syncStampBar(); };
  stampBar.querySelector('#sb-flip').onclick = () => { S.flip = !S.flip; syncStampBar(); };
  stampBar.querySelector('#sb-done').onclick = () => { S.stamp = null; S.tool = 'pan'; S.pendingTap = null; syncTools(); syncStampBar(); };
  const go = stampBar.querySelector('#sb-place');
  if (go) go.onclick = () => { const c = S.pendingTap; if (c) { placeStamp(c.x, c.y); } S.pendingTap = null; syncStampBar(); };
}

function syncSelBar() {
  if (!selBar) return;
  const r = selRect();
  if (!r || S.tool !== 'sel' || S.drag) { selBar.hidden = true; return; }
  const n = S.eng.rectCount(r);
  selBar.hidden = false;
  selBar.innerHTML =
    '<b>SELECTION</b><small>' + r.w + '&times;' + r.h + ' &middot; ' + n + ' cells</small>' +
    '<button class="tb go" id="sl-save"' + (n ? '' : ' disabled') + '>' + ICONS.check + '<span>SAVE AS PATTERN</span></button>' +
    '<button class="tb" id="sl-copy"' + (n ? '' : ' disabled') + ' title="Copy as RLE, pasteable into Golly or back in here">' + ICONS.draw + '<span>COPY RLE</span></button>' +
    '<button class="tb" id="sl-clear"' + (n ? '' : ' disabled') + '>' + ICONS.clear + '<span>CLEAR</span></button>' +
    '<button class="tb" id="sl-x" title="Drop the selection [Esc]">' + ICONS.close + '</button>';
  selBar.querySelector('#sl-save').onclick = saveSelection;
  selBar.querySelector('#sl-copy').onclick = copySelection;
  selBar.querySelector('#sl-clear').onclick = () => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) S.eng.set(x, y, 0);
    tlog('> cleared ' + n + ' cells', 't-sys'); syncSelBar();
  };
  selBar.querySelector('#sl-x').onclick = () => { S.sel = null; syncSelBar(); };
}

/** The selection as a clamped rectangle, or null. */
function selRect() {
  const q = S.sel; if (!q) return null;
  const x = Math.max(0, Math.min(q.x0, q.x1)), y = Math.max(0, Math.min(q.y0, q.y1));
  const x2 = Math.min(S.L.w - 1, Math.max(q.x0, q.x1)), y2 = Math.min(S.L.h - 1, Math.max(q.y0, q.y1));
  if (x2 < x || y2 < y) return null;
  return { x, y, w: x2 - x + 1, h: y2 - y + 1 };
}
function selectionCells() {
  const r = selRect(); if (!r) return { cells: [], w: 0, h: 0 };
  const cells = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (S.eng.get(x, y)) cells.push([x, y]);
  return normalizeCells(cells);
}
function saveSelection() {
  const { cells, w, h } = selectionCells();
  if (!cells.length) { deny('nothing selected'); return; }
  showPrompt('SAVE AS PATTERN', w + '×' + h + ', ' + cells.length + ' cells. Name it:', 'MY PATTERN', (name) => {
    const key = custom.add(name, cells, w, h);
    hideMsg();
    S.sel = null; syncSelBar();
    renderTray();
    tlog('> saved ' + patternMeta(key).label + ' to CUSTOM', 't-sys');
    selectStamp(key);
  });
}
function copySelection() {
  const { cells, w, h } = selectionCells();
  if (!cells.length) { deny('nothing selected'); return; }
  const { header, body } = encodeRLE(cells, w, h);
  const text = header + '\n' + body;
  const done = () => tlog('> copied ' + cells.length + ' cells as RLE', 't-sys');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => showRLE(text));
  else showRLE(text);
}
function showRLE(text) {
  showPrompt('RLE', 'Clipboard access was refused; copy it from here:', '', null, text);
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
    selectStamp(key);
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
  S.stamp = null; S.rot = 0; S.flip = false; S.sel = null; S.pendingTap = null; S.drag = null; lastDeny = ''; S.stepIdx = 0; S.won = false;
  S.tool = 'draw';
  buildTopbar(); buildTray();
  fitCamera();
  hideMsg();
  syncRun(); syncTools(); syncStampBar(); syncSelBar();
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
  S.sel = null;
  clampCam();
  syncDishBtn(); syncSelBar(); renderTray();
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
  tlog('> placed ' + patternMeta(S.stamp).label + ' @ (' + ox + ',' + oy + ')', 't-sys');
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
  for (const [n, b] of Object.entries(el.toolBtns)) b.classList.toggle('on', S.tool === n && !S.stamp);
  if (S.tool !== 'sel') { S.sel = null; syncSelBar(); }
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
  const p = transformCells(pattern(S.stamp), S.rot, S.flip);
  const ox = cx - (p.w >> 1), oy = cy - (p.h >> 1);
  const cells = p.cells.map(([x, y]) => [ox + x, oy + y]);
  const ok = cells.every(([x, y]) =>
    x >= 0 && y >= 0 && x < S.L.w && y < S.L.h && canEditCell(x, y, true));
  return { cells, ok, ox, oy, w: p.w, h: p.h };
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
    syncSelBar();
    return;
  }
  // A finger cannot hover, so on touch a stamp is aimed by tapping and placed
  // from the bar; a finger that moves instead pans.
  if (S.tool === 'stamp' && S.stamp && e.pointerType === 'touch') {
    S.drag = { mode: 'tap', mx: e.clientX, my: e.clientY, cell: c };
    return;
  }
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
  if (!S.drag) return;
  if (S.drag.mode === 'tap') {
    if (Math.hypot(e.clientX - S.drag.mx, e.clientY - S.drag.my) > 8) S.drag = { mode: 'pan', mx: e.clientX, my: e.clientY };
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
    if (S.drag && S.drag.mode === 'tap') { S.hover = S.drag.cell; S.pendingTap = S.drag.cell; syncStampBar(); }
    const wasSelect = S.drag && S.drag.mode === 'select';
    S.drag = null;
    if (wasSelect) syncSelBar();
    if (e && touches.delete(e.pointerId) && touches.size < 2) pinch = null;
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0012));
}, { passive: false });

  onKeyDown = e => {
  // A dialog is modal: the mode chooser, the shop, and the win/fail boxes all
  // sit over the board, and SPACE running the simulation behind one of them was
  // how a shown failure could quietly become a win.
  if (msgEl && !msgEl.classList.contains('hidden')) { if (e.key === 'Escape') hideMsg(); return; }
  // Typing in the tray's search box is not a command.
  const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea') return;
  if (e.code === 'Space') { e.preventDefault(); startPause(); }
  else if (e.code === 'KeyN' || e.code === 'Period') stepOnce();
  else if (e.code === 'KeyR') { if (S.stamp) { S.rot = (S.rot + 1) % 4; syncStampBar(); } }
  else if (e.code === 'KeyF') { if (S.stamp) { S.flip = !S.flip; syncStampBar(); } }
  else if (e.code === 'Escape') {
    if (S.sel) { S.sel = null; syncSelBar(); return; }
    S.stamp = null; S.pendingTap = null; S.tool = 'pan'; syncTools(); syncStampBar();
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

function drawPreview() {
  if (S.tool !== 'stamp' || !S.stamp || !S.hover) return;
  if (!S.L.sandbox && S.phase !== 'edit') return;
  if (!inGrid(S.hover)) return;
  const { cells, ok, ox, oy, w, h } = stampCellsAt(S.hover.x, S.hover.y);
  // The box first, so a big pattern's footprint reads even where its cells
  // are a few pixels each; then the cells, green when it fits, red when not.
  const [bx, by, bw, bh] = cellRect(ox, oy, w, h);
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = ok ? 'rgba(86,182,194,.55)' : 'rgba(224,108,117,.7)'; ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  ctx.restore();
  ctx.fillStyle = ok ? 'rgba(86,182,194,.5)' : 'rgba(224,108,117,.5)';
  const inset = S.cam.s >= 4 ? 1 : 0;
  cells.forEach(([x, y]) => {
    const [sx, sy, sw, sh] = cellRect(x, y, 1, 1);
    ctx.fillRect(sx + inset * 0.5, sy + inset * 0.5, Math.max(1, sw - inset), Math.max(1, sh - inset));
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
    if (S.flip) dx = -dx;
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
  drawDishFrame(); drawGrid(); drawGhostFrame(); drawHeat(); drawPreview(); drawTrace(); drawHover(); drawSelection();
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
  if (selBar && !selBar.hidden && S.running) syncSelBar();
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
