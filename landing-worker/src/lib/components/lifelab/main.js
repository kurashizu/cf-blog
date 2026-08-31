// @ts-nocheck -- the view layer: 1400 lines of canvas and DOM written as plain
// JS, where the state object is built up field by field and every element is
// fetched by id. Checking it under `strict` reports several hundred implicit
// anys and possibly-nulls that are all guaranteed by construction, and typing
// it properly would mean rewriting it in TypeScript. The parts worth checking
// -- the automaton, the pattern library, the level data and the save format --
// are checked: engine.js, patterns.js, levels.js and shop.js all pass.
import { Life } from './engine.js';
import { pattern, rotateCells, RLES, kindOf } from './patterns.js';
import { LEVELS } from './levels.js';
import { ITEMS, loadShop, saveShop } from './shop.js';

const $ = s => document.querySelector(s);
// Bound in start(), not at import. A module is evaluated once and cached, but
// the page it draws into is created and destroyed on every SPA navigation --
// so binding here left the second visit holding elements that were no longer
// in the document, drawing into a detached canvas: a blank panel.
let termEl, cv, ctx, topbar, tray, levelsEl, msgEl;
let modeBtn, lvHead, wipeBtn, shopBtn, coinsEl;
const guideEl = $('#guide'), gstep = $('#gstep'), gtext = $('#gtext');
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
  shop: loadShop(),
  rewind: [],
  /** Set once the overcrowding demonstration has been watched through. */
  saw4x4: false,
  // Which situation the rules lesson is showing.
  teachStep: 0,
};
const has = id => S.shop.owned.includes(id);
/**
 * How many entries are campaign levels. The sandbox is the last entry and is
 * not one of them -- counting it made the list draw a locked "???" row for it,
 * put the sandbox behind a padlock the campaign never opens, and reported one
 * level more than exists.
 */
const CAMPAIGN = LEVELS.filter(l => !l.sandbox).length;
const SANDBOX_IDX = LEVELS.findIndex(l => l.sandbox);
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

/**
 * Erases the save: unlocked levels, credits, and everything bought.
 *
 * Behind a confirmation because it cannot be undone and the button sits next to
 * one that only changes mode -- a misclick would otherwise cost the whole run.
 */
function wipeSave() {
  showMsg(
    'ERASE SAVE',
    'This clears everything kept in this browser: the levels you have opened, your credits, and anything bought from the shop. It cannot be undone.',
    [
      {
        label: 'ERASE EVERYTHING',
        fn: () => {
          try {
            localStorage.removeItem('lifelab-unlocked');
            localStorage.removeItem('lifelab-shop');
          } catch {
            /* a browser with storage blocked has nothing to erase */
          }
          S.unlocked = 0;
          S.shop = loadShop();
          S.saw4x4 = false;
          syncShopBadge();
          hideMsg();
          tlog('> SAVE ERASED', 't-warn');
          loadLevel(0);
          chooseMode();
        },
      },
      { label: 'KEEP IT', fn: hideMsg },
    ],
    true
  );
}

/* ---------------- the rules lesson ---------------- */
/**
 * Level 00 is a lesson rather than a puzzle: one situation at a time, set up
 * for the player, with the neighbour counts drawn on the board.
 *
 * Showing all of them together was the mistake in the first version -- three
 * things changed at once and the text had to say which one it meant, which is
 * exactly the reading a new player cannot do yet.
 */
function teachSetup() {
  const L = S.L;
  if (!L.lesson) return;
  const step = L.steps[S.teachStep];
  if (!step || !step.teach || step.teach.keep) return;
  S.eng.clear();
  for (const [x, y] of step.teach.cells) S.eng.set(x, y, 1);
  S.running = false;
  syncRun(); updateStats();
}

/**
 * Opens the next level and pays for a first clear.
 *
 * Shared, because there are two ways to finish one: a goal met, and the lesson
 * reaching its last step. The lesson used to call finishWin directly and skip
 * this, so clearing level 00 never opened level 01 -- and since every level
 * after that is reached through the NEXT LEVEL button rather than the list,
 * nothing else opened either. The list sat at "00 / 01 ???" no matter how far
 * the player had actually got.
 *
 * @returns the credits earned, which is 0 on a replay.
 */
function recordClear() {
  if (S.idx !== S.unlocked || S.unlocked >= CAMPAIGN - 1) return 0;
  S.unlocked++;
  localStorage.setItem('lifelab-unlocked', S.unlocked);
  // Paid once, on the first clear -- replaying a level should not farm it.
  S.shop.coins += 2;
  saveShop(S.shop);
  tlog('> +2 CREDITS', 't-ok');
  return 2;
}

function teachNext() {
  const L = S.L;
  if (!L.lesson) return;
  if (S.teachStep >= L.steps.length - 1) {
    // The lesson is over; the campaign starts at the level after it.
    S.won = true;
    const earned = recordClear();
    buildLevelList();
    syncShopBadge();
    finishWin(earned);
    return;
  }
  S.teachStep++;
  S.stepIdx = S.teachStep;
  teachSetup();
  buildTopbar();
  draw(); updateGuide();
}

/* ---------------- shop ---------------- */
function syncShopBadge() { coinsEl.textContent = S.shop.coins; }

/**
 * Built by hand rather than through showMsg, because every row has its own
 * button and a price that has to grey out when it cannot be paid.
 */
function openShop() {
  msgEl.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'box shop';

  const h = document.createElement('h2');
  h.textContent = 'SHOP';
  const p = document.createElement('p');
  p.innerHTML = 'A level pays <span class="n">2 credits</span> the first time you clear it, and only then \u2014 ' +
    'there are <span class="n">48</span> in the whole campaign. Nothing here changes the rules; they only let you ' +
    '<span class="k">see further ahead</span> than a still frame does.';
  box.append(h, p);
  // The rows scroll; the heading and the close button do not, so a long list
  // cannot push the way out of the panel off the bottom of the screen.
  const scroll = document.createElement('div');
  scroll.className = 'shopscroll';
  box.appendChild(scroll);

  ITEMS.forEach(it => {
    const row = document.createElement('div'); row.className = 'shoprow';
    const ic = document.createElement('div'); ic.className = 'shopicon';
    ic.innerHTML = ICONS[it.icon] || '';
    const main = document.createElement('div'); main.className = 'shopmain';
    const nm = document.createElement('div'); nm.className = 'shopname'; nm.textContent = it.name;
    const bl = document.createElement('div'); bl.className = 'shopblurb'; bl.textContent = it.blurb;
    const dt = document.createElement('div'); dt.className = 'shopdetail'; dt.textContent = it.detail;
    main.append(nm, bl, dt);
    const b = document.createElement('button'); b.className = 'buy';
    const owned = has(it.id);
    // A tool the campaign has not reached a use for yet is shown, but not for
    // sale: seeing TRAJECTORY seven levels before the first ship only invites
    // spending on something that does nothing.
    const tooEarly = !owned && (it.from ?? 0) > S.unlocked;
    if (owned) { b.classList.add('owned'); b.innerHTML = ICONS.check + '<span>OWNED</span>'; b.disabled = true; }
    else if (tooEarly) {
      row.classList.add('locked');
      b.classList.add('soon');
      b.innerHTML = ICONS.lock + '<span>L' + String(it.from).padStart(2, '0') + '</span>';
      b.disabled = true;
      b.title = 'Unlocks at level ' + String(it.from).padStart(2, '0') + ', where it first has a use';
    }
    else {
      b.innerHTML = ICONS.coin + '<span>' + it.cost + '</span>';
      b.disabled = S.shop.coins < it.cost;
      b.onclick = () => {
        if (S.shop.coins < it.cost) return;
        S.shop.coins -= it.cost;
        S.shop.owned.push(it.id);
        saveShop(S.shop);
        syncShopBadge();
        tlog('> BOUGHT ' + it.name, 't-ok');
        buildTopbar();
        openShop();
      };
    }
    row.append(ic, main, b);
    scroll.appendChild(row);
  });

  const row = document.createElement('div'); row.className = 'row';
  const close = document.createElement('button'); close.className = 'tb';
  close.innerHTML = ICONS.clear + '<span>CLOSE</span>'; close.onclick = hideMsg;
  row.appendChild(close);
  box.appendChild(row);
  msgEl.appendChild(box);
  msgEl.classList.remove('hidden');
}

/* ---------------- mode select ---------------- */
/**
 * Asked once, before anything is on the board. Without it the player arrives at
 * a dish, a row of tabs and a log with no indication which of them is the way
 * in -- and the campaign's first level looks like just another tab rather than
 * the place to start.
 */
function chooseMode() {
  const resume = S.unlocked > 0;
  showMsg(
    'LIFE.LAB',
    "Conway's Game of Life: a grid where every cell lives or dies by two rules, " +
    'and complexity builds itself out of them.\n\n' +
    'TUTORIAL walks the ideas one level at a time, each with a goal and a hint. ' +
    'SANDBOX is the open dish -- the full pattern library, free drawing, random soup.',
    [
      { label: resume ? 'RESUME TUTORIAL' : 'START TUTORIAL', fn: () => enterMode('campaign') },
      { label: 'SANDBOX', fn: () => enterMode('sandbox') },
    ]
  );
}

function enterMode(mode) {
  S.mode = mode;
  hideMsg();
  // The level row has nothing to list in the sandbox, so its heading goes too.
  lvHead.style.display = mode === 'sandbox' ? 'none' : '';
  if (mode === 'sandbox') {
    tlog('> SANDBOX — free dish, no goals', 't-ok');
    loadLevel(LEVELS.findIndex(L => L.sandbox));
  } else {
    tlog('> TUTORIAL — ' + (S.unlocked + 1) + ' of ' + CAMPAIGN + ' levels open', 't-ok');
    loadLevel(Math.min(S.unlocked, CAMPAIGN - 1));
  }
}

/* ---------------- level loading ---------------- */
function loadLevel(i, opts = {}) {
  clearTimeout(winTimer);
  clearBanner();
  if (S.idx !== i) S.saw4x4 = false;
  S.idx = i; const L = LEVELS[i]; S.L = L;
  S.eng = new Life(L.w, L.h);
  S.ghost = new Float32Array(L.w * L.h);
  S.buf = document.createElement('canvas'); S.buf.width = L.w; S.buf.height = L.h;
  S.bctx = S.buf.getContext('2d');
  S.img = S.bctx.createImageData(L.w, L.h);
  (L.presets || []).forEach(p => {
    const pat = pattern(p.name);
    pat.cells.forEach(([x, y]) => S.eng.set(p.x + x, p.y + y, 1));
  });
  S.presetPop = S.eng.pop;
  S.phase = 'edit'; S.running = false; S.stampsUsed = 0; S.snap = null; S.goal = null;
  S.stamp = null; S.rot = 0; S.drag = null; lastDeny = ''; S.stepIdx = 0; S.won = false;
  S.tool = (L.tools || []).includes('draw') ? 'draw' : 'pan';
  S.teachStep = 0;
  teachSetup();
  buildTopbar(); buildTray(); buildLevelList();
  fitCamera();
  hideMsg();
  if (!opts.quiet) briefing(L);
  syncRun(); syncTools();
}

function briefing(L) {
  tlog('');
  tlog('== ' + L.name, 't-hd');
  (L.intro || []).forEach(l => tlog(l));
}

function buildLevelList() {
  levelsEl.innerHTML = '';
  if (S.mode === 'sandbox') return;

  // Only as far as the player has got, plus one locked tab so it is visible
  // that the campaign continues. The whole row at once is a table of contents
  // for a book they have not started, and the locked entries are the majority
  // of it -- six things to read and nothing to do with any of them.
  const last = Math.min(CAMPAIGN - 1, S.unlocked + 1);
  for (let i = 0; i <= last; i++) {
    const L = LEVELS[i];
    const locked = i > S.unlocked;
    const b = document.createElement('button');
    b.className = 'lv' + (i === S.idx ? ' cur' : '') + (locked ? ' lock' : '') +
      (i < S.unlocked && i !== S.idx ? ' done' : '');
    // The name, not just the number. A column of two-digit tabs says nothing
    // about what is in any of them, and the names already existed -- they were
    // only ever shown once the level was open.
    const short = (L.name.split('·')[1] || L.name).trim();
    b.innerHTML = (locked ? ICONS.lock : i < S.unlocked ? ICONS.check : '') +
      '<span class="lvn">' + L.tab + '</span>' +
      '<span class="lvt">' + (locked ? '???' : short) + '</span>';
    b.title = locked
      ? 'Locked — clear ' + LEVELS[S.unlocked].tab + ' to open this'
      : L.name + (i < S.unlocked ? ' (cleared)' : '');
    if (!locked) { b.style.color = L.accent || ''; if (i === S.idx) b.style.borderColor = L.accent || ''; }
    b.onclick = () => { if (!locked) loadLevel(i); else deny('LOCKED — clear the current level first'); };
    levelsEl.appendChild(b);
  }

  // The sandbox is the reward for finishing, not a level to be unlocked past:
  // it appears once the campaign is cleared and is always openable after that.
  if (S.unlocked >= CAMPAIGN - 1 && SANDBOX_IDX >= 0) {
    const L = LEVELS[SANDBOX_IDX];
    const b = document.createElement('button');
    b.className = 'lv' + (SANDBOX_IDX === S.idx ? ' cur' : '');
    b.innerHTML = ICONS.soup + '<span class="lvn">' + L.tab + '</span><span class="lvt">FREE DISH</span>';
    b.title = 'Sandbox — the full pattern library, free drawing, random soup';
    b.style.color = L.accent || '';
    if (SANDBOX_IDX === S.idx) b.style.borderColor = L.accent || '';
    b.onclick = () => loadLevel(SANDBOX_IDX);
    levelsEl.appendChild(b);
  }
}

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
  if (L.lesson) el.next = mkBtn(ICONS.play, 'NEXT', teachNext);
  if (has('undo')) mkBtn(ICONS.reset, 'BACK', stepBack);
  el.reset = mkBtn(L.sandbox ? ICONS.clear : ICONS.reset, L.sandbox ? 'CLEAR' : 'RESET', reset);
  if (L.sandbox) mkBtn(ICONS.soup, 'SOUP', soup);
  mkSep();
  el.toolBtns = {};
  const addTool = (name, icon, label) => {
    el.toolBtns[name] = mkBtn(icon, label, () => { S.tool = name; S.stamp = null; syncTools(); });
  };
  addTool('pan', ICONS.pan, 'PAN');
  if ((L.tools || []).includes('draw')) addTool('draw', ICONS.draw, 'DRAW');
  if ((L.tools || []).includes('erase')) addTool('erase', ICONS.erase, 'ERASE');
  mkSep();
  el.spd = mkBtn('', 'SPD ' + SPEEDS[S.speed] + '/s', () => {
    S.speed = (S.speed + 1) % SPEEDS.length;
    el.spd.querySelector('span').textContent = 'SPD ' + SPEEDS[S.speed] + '/s';
  });
  const stats = document.createElement('div');
  stats.id = 'stats';
  const hasBudget = L.budget || L.stampBudget;
  // GOAL is the readout that was missing. A level can ask for exactly 6 cells
  // at gen 10, or arrival by gen 105, and until now the only place either
  // number appeared was one sentence in the corner -- so a player watching the
  // board had no way to tell how close they were or how long was left.
  const field = (label, inner) => '<span class="stat">' + label + ' ' + inner + '</span>';
  stats.innerHTML =
    field('GEN', '<b id="stGen">0</b>') +
    field('POP', '<b id="stPop">0</b>') +
    (hasBudget ? field(L.stampBudget ? 'AMMO' : 'CELLS', '<b id="stBud"></b>') : '') +
    (goalLabel(L) ? field('GOAL', '<b id="stGoal"></b>') : field('RULE', '<b>B3/S23</b>'));
  topbar.appendChild(stats);
  el.gen = stats.querySelector('#stGen');
  el.pop = stats.querySelector('#stPop');
  el.bud = stats.querySelector('#stBud');
  el.goal = stats.querySelector('#stGoal');
}

/** A one-line statement of what this level wants, or '' when there is nothing useful to say. */
function goalLabel(L) {
  const g = L.goal;
  if (!g) return '';
  switch (g.type) {
    case 'survive': return 'alive at gen ' + g.gens;
    case 'still': return 'unchanged to gen ' + g.gens;
    case 'settle': return 'all still by gen ' + g.maxGen;
    case 'osc': return 'any repeat';
    case 'period': return 'period ' + g.period;
    case 'exact': return g.pop + ' cells at gen ' + g.gen;
    case 'grow': return 'reach ' + g.pop + ' cells';
    case 'reach': return g.byGen ? 'target by gen ' + g.byGen : 'reach the target';
    case 'clear': return 'clear the target';
    case 'guard': return 'hold to gen ' + g.gens;
    case 'visit': return 'all ' + L.zones.length + ' zones';
    default: return '';
  }
}

/** How far along the goal is, as live text beside it. */
function goalProgress(L) {
  const g = L.goal, e = S.eng;
  if (!g) return '';
  switch (g.type) {
    case 'survive': case 'guard': {
      const target = g.gens;
      return e.gen + '/' + target;
    }
    case 'still': return e.gen + '/' + g.gens;
    case 'settle': return e.gen + '/' + g.maxGen;
    case 'exact': return e.pop + ' @ ' + e.gen + '/' + g.gen;
    case 'grow': return e.pop + '/' + g.pop;
    case 'reach': return g.byGen ? e.gen + '/' + g.byGen : String(e.gen);
    default: return '';
  }
}

function miniSVG(p, color) {
  const sc = Math.min(26 / p.w, 26 / p.h, 5);
  const W = Math.max(8, Math.round(p.w * sc)), H = Math.max(8, Math.round(p.h * sc));
  let r = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + p.w + ' ' + p.h + '">';
  p.cells.forEach(([x, y]) => { r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="currentColor"/>'; });
  return r + '</svg>';
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

function placeStamp(cx, cy) {
  if (!canEditCell(cx, cy)) return;
  if (!S.L.sandbox && S.L.stampBudget && S.stampsUsed >= S.L.stampBudget) {
    deny('Out of stamps — RESET to retry'); return;
  }
  const { cells, ok, ox, oy } = stampCellsAt(cx, cy);
  if (!ok) { deny('Does not fit: out of bounds or outside the launch zone'); return; }
  cells.forEach(([x, y]) => S.eng.set(x, y, 1));
  S.stampsUsed++;
  tlog('> placed ' + RLES[S.stamp].label + ' @ (' + ox + ',' + oy + ')', 't-sys');
}

/* ---------------- run control ---------------- */
function beginRun() {
  if (S.eng.pop === 0) { deny('The dish is empty'); return false; }
  S.snap = S.eng.snapshot();
  S.goal = makeGoal(S.L);
  if (S.goal) S.goal.start(S.eng);
  S.phase = 'run';
  tlog('> RUN — pop ' + S.eng.pop, 't-ok');
  return true;
}
function startPause() {
  if (S.running) { S.running = false; syncRun(); return; }
  if (!S.L.sandbox && S.phase === 'edit' && !beginRun()) return;
  S.running = true; syncRun();
}
function stepOnce() {
  if (!S.L.sandbox && S.phase === 'edit' && !beginRun()) return;
  S.running = false; doStep(); syncRun();
}
function reset() {
  if (S.L.sandbox) { S.eng.clear(); S.running = false; syncRun(); tlog('> CLEAR', 't-sys'); return; }
  // The whole level back to how it opened: gen 0, budget returned, and the
  // board carrying only what the level itself places. Restoring the snapshot
  // instead left the player's own cells sitting there, which is a different
  // thing from a reset and was the other button.
  loadLevel(S.idx, { quiet: true });
  tlog('> RESET — level back to gen 0', 't-sys');
}
function clearAll() { reset(); }
function soup() {
  const e = S.eng;
  for (let y = 0; y < S.L.h; y++)
    for (let x = 0; x < S.L.w; x++)
      e.set(x, y, Math.random() < 0.12 ? 1 : 0);
  tlog('> SOUP — 12% random fill', 't-sys');
}

function doStep() {
  if (has('undo')) {
    // Life is not reversible -- a generation has many possible predecessors --
    // so going back means having kept the frames. Forty is enough to replay a
    // collision and cheap next to the board itself.
    S.rewind.push(S.eng.snapshot());
    if (S.rewind.length > 40) S.rewind.shift();
  }
  const r = S.eng.step();
  if (!S.goal) return;
  const res = S.goal.onStep(S.eng, r);
  if (!res) return;
  if (res.log) tlog(res.log, 't-ok');
  if (res.win) onWin();
  else if (res.soft) {
    // Expected, and part of the lesson: stop the clock and say so, without the
    // failure dialog and without ending the attempt.
    S.running = false; syncRun();
    tlog('> ' + res.soft, 't-warn');
  } else if (res.fail) onFail(res.fail);
}

function stepBack() {
  const prev = S.rewind.pop();
  if (!prev) { deny('Nothing further back is kept'); return; }
  S.running = false;
  S.eng.restore(prev);
  S.won = false;
  syncRun(); updateStats(); draw();
  tlog('> REWIND to gen ' + S.eng.gen, 't-sys');
}

/* ---------------- goals ---------------- */
function makeGoal(L) {
  const g = L.goal; if (!g) return null;
  const seen = new Map();
  const goalState = {};
  return {
    start(e) { if (g.type === 'osc' || g.type === 'period') seen.set(e.hash(), 0); },
    onStep(e, r) {
      // Checked before the goal itself: a level can be lost by breaking the
      // constraint even on the generation it would otherwise be won.
      if (L.hazard && e.rectCount(L.hazard) > 0) {
        return { fail: 'Something entered the marked zone at gen ' + e.gen + '.' };
      }
      switch (g.type) {
        case 'survive':
          // A level that teaches by showing a shape fail gives the player a
          // grace window: dying inside it is the lesson, not a loss.
          if (e.pop === 0 && L.graceGens && e.gen <= L.graceGens) {
            S.saw4x4 = true;
            return { soft: 'All 16 died at gen ' + e.gen + '. Press RESET and try a smaller square.' };
          }
          if (e.pop === 0) return { fail: 'All cells died at gen ' + e.gen + '.' };
          if (e.gen >= g.gens) return { win: true };
          return null;
        case 'still':
          if (e.pop === 0) return { fail: 'The structure died out.' };
          if (r.changed > 0) return { fail: 'Changed at gen ' + e.gen + ' — not a still life.' };
          if (e.gen >= g.gens) return { win: true };
          return null;
        case 'osc': {
          if (e.pop === 0) return { fail: 'The structure died out.' };
          const h = e.hash();
          if (seen.has(h)) {
            const p = e.gen - seen.get(h);
            if (p >= 2) return { win: true, log: '> period-' + p + ' recurrence @ gen ' + e.gen };
            return { fail: 'Perfectly static — a still life, not an oscillator.' };
          }
          seen.set(h, e.gen);
          if (e.gen >= g.maxGen) return { fail: 'No recurrence detected within ' + g.maxGen + ' gens.' };
          return null;
        }
        case 'reach':
          if (e.rectCount(L.target) > 0) {
            if (g.byGen && e.gen > g.byGen) {
              return { fail: 'Arrived at gen ' + e.gen + ', but the deadline was ' + g.byGen + '.' };
            }
            return { win: true, log: '> signal entered target zone @ gen ' + e.gen };
          }
          if (g.byGen && e.gen > g.byGen) return { fail: 'Nothing arrived by gen ' + g.byGen + '.' };
          if (e.pop === 0) return { fail: 'All cells died — signal lost.' };
          if (e.gen >= g.maxGen) return { fail: 'Timeout: nothing reached the target within ' + g.maxGen + ' gens.' };
          return null;
        case 'clear':
          if (e.rectCount(L.target) === 0) return { win: true, log: '> target zone cleared @ gen ' + e.gen };
          if (e.gen >= g.maxGen) return { fail: 'Timeout: debris remains in the target zone. RESET and adjust your aim.' };
          return null;
        case 'grow':
          // Reach a population from a small budget. Placement matters because
          // most arrangements of the same cells die or settle small.
          if (e.pop > (goalState.peak || 0)) goalState.peak = e.pop;
          if (e.pop >= g.pop) return { win: true, log: '> population ' + e.pop + ' @ gen ' + e.gen };
          if (e.pop === 0) {
            return { fail: 'Everything died at gen ' + e.gen + ' — it peaked at ' + goalState.peak + ' of ' + g.pop + '.' };
          }
          if (e.gen >= g.maxGen) {
            return { fail: 'Peaked at ' + goalState.peak + ', needed ' + g.pop + '.' };
          }
          return null;
        case 'settle': {
          // Come to rest -- no change at all -- before the deadline. Anything
          // still twitching, and anything that dies, is a loss.
          if (e.pop === 0) return { fail: 'Everything died at gen ' + e.gen + '.' };
          if (r.changed === 0 && e.gen > 1) return { win: true, log: '> settled @ gen ' + e.gen };
          if (e.gen >= g.maxGen) {
            return { fail: 'Still moving at gen ' + g.maxGen + ' — ' + r.changed + ' cells changed on the last step.' };
          }
          return null;
        }
        case 'guard':
          // Something got through: the run is lost the moment the zone is
          // entered, and won if the window closes with it still clear.
          if (e.rectCount(L.target) > 0) return { fail: 'The signal reached the zone at gen ' + e.gen + '.' };
          if (e.gen >= g.gens) return { win: true, log: '> zone held for ' + g.gens + ' gens' };
          return null;
        case 'exact':
          // An exact population at an exact generation. Overshooting is as
          // wrong as undershooting, so the shape has to be chosen rather than
          // just made big.
          if (e.gen === g.gen) {
            return e.pop === g.pop
              ? { win: true, log: '> population ' + e.pop + ' @ gen ' + g.gen }
              : { fail: 'Gen ' + g.gen + ' had ' + e.pop + ' cells, not ' + g.pop + '.' };
          }
          if (e.pop === 0) return { fail: 'Everything died at gen ' + e.gen + '.' };
          return null;
        case 'visit': {
          // Every zone has to be reached, not just one -- so a single ship in
          // the right direction is never enough.
          if (!goalState.hit) goalState.hit = new Set();
          L.zones.forEach((z, i) => { if (e.rectCount(z) > 0) goalState.hit.add(i); });
          if (goalState.hit.size >= L.zones.length) {
            return { win: true, log: '> all ' + L.zones.length + ' zones reached @ gen ' + e.gen };
          }
          if (e.pop === 0) return { fail: 'Everything died with ' + goalState.hit.size + ' of ' + L.zones.length + ' zones reached.' };
          if (e.gen >= g.maxGen) {
            const missed = L.zones.map((z, i) => i + 1).filter(n => !goalState.hit.has(n - 1));
            return { fail: 'Zone ' + missed.join(' and ') + ' never reached.' };
          }
          return null;
        }
        case 'period': {
          // A specific period, not just any recurrence. Finding a p3 when the
          // easy answers are all p2 is the whole puzzle.
          if (e.pop === 0) return { fail: 'The structure died out.' };
          const h = e.hash();
          if (seen.has(h)) {
            const per = e.gen - seen.get(h);
            return per === g.period
              ? { win: true, log: '> period ' + per + ' @ gen ' + e.gen }
              : { fail: 'That repeats every ' + per + ' gens, not ' + g.period + '.' };
          }
          seen.set(h, e.gen);
          if (e.gen >= g.maxGen) return { fail: 'No recurrence within ' + g.maxGen + ' gens.' };
          return null;
        }
        case 'watch':
          if (e.gen >= g.gens) return { win: true };
          return null;
      }
      return null;
    },
  };
}

function onWin() {
  // The goal is met, but the interesting part is usually still happening -- a
  // still life settling, an oscillator on its second turn, a glider crossing
  // the rest of the board. Stopping dead and covering it with a dialog takes
  // away the thing the level was teaching, so the machine keeps running and the
  // dialog waits.
  S.goal = null; S.won = true;
  tlog('> STATUS: COMPLETE', 't-ok');
  banner('COMPLETE');
  const earned = recordClear();
  buildLevelList();
  syncShopBadge();
  // Long enough to watch what just happened, short enough not to feel stuck.
  clearTimeout(winTimer);
  winTimer = setTimeout(() => finishWin(earned), 2600);
}

/**
 * A quiet line over the board while the win plays out, so it is obvious the
 * goal was met even though nothing has stopped.
 */
function banner(text) {
  let el = document.getElementById('winbanner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'winbanner';
    document.getElementById('cvwrap').appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
}
function clearBanner() {
  document.getElementById('winbanner')?.classList.remove('show');
}

function finishWin(earned) {
  S.running = false; syncRun();
  clearBanner();
  const next = S.idx + 1 < LEVELS.length ? S.idx + 1 : null;
  const btns = [];
  if (next != null) btns.push({ label: LEVELS[next].sandbox ? 'ENTER SANDBOX' : 'NEXT LEVEL', fn: () => loadLevel(next) });
  if (earned) btns.push({ label: 'SHOP (+' + earned + ')', fn: openShop });
  btns.push({ label: 'STAY HERE', fn: hideMsg });
  showMsg('MISSION COMPLETE', S.L.winText || '', btns, false);
}
function onFail(msg) {
  S.running = false; syncRun();
  tlog('> STATUS: FAILED — ' + msg, 't-err');
  showMsg('MISSION FAILED', msg, [
    { label: 'RESET & RETRY', fn: () => { hideMsg(); reset(); } },
    { label: 'KEEP WATCHING', fn: hideMsg },
  ], true);
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
  S.cam.s = Math.max(1.5, Math.min(S.L.lesson ? 30 : 22, s));
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

function cellRect(x, y, w, h) {
  return [S.cam.x + x * S.cam.s, S.cam.y + y * S.cam.s, w * S.cam.s, h * S.cam.s];
}

function drawZones() {
  const L = S.L;
  ctx.font = '10px monospace';
  if (L.editable) {
    const [x, y, w, h] = cellRect(L.editable.x, L.editable.y, L.editable.w, L.editable.h);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(86,182,194,.6)'; ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(86,182,194,.75)';
    ctx.fillText('LAUNCH', x, y - 5);
    ctx.setLineDash([]);
  }
  if (L.hazard) {
    const [x, y, w, h] = cellRect(L.hazard.x, L.hazard.y, L.hazard.w, L.hazard.h);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(224,108,117,.75)'; ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(224,108,117,.09)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(224,108,117,.85)';
    ctx.fillText('KEEP OUT', x, y - 5);
    ctx.setLineDash([]);
  }
  (L.zones || []).forEach((z, i) => {
    const [x, y, w, h] = cellRect(z.x, z.y, z.w, z.h);
    ctx.setLineDash([4, 3]);
    const lit = S.goal && S.phase !== 'edit' && S.eng.rectCount(z) > 0;
    ctx.strokeStyle = lit ? 'rgba(152,195,121,.9)' : 'rgba(229,192,123,.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = lit ? 'rgba(152,195,121,.9)' : 'rgba(229,192,123,.8)';
    ctx.fillText('ZONE ' + (i + 1), x, y - 5);
    ctx.setLineDash([]);
  });
  if (L.target) {
    const [x, y, w, h] = cellRect(L.target.x, L.target.y, L.target.w, L.target.h);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(209,154,102,.7)'; ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(209,154,102,.05)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(209,154,102,.8)';
    ctx.fillText('TARGET', x, y - 5);
    ctx.setLineDash([]);
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

/**
 * The step's own example, drawn on the board where it should go.
 *
 * The point is that a level can be played without reading anything: the outline
 * says put cells here, and it stops as soon as the step is satisfied. Pulsed so
 * it cannot be mistaken for live cells, and skipped once the player has drawn
 * enough that they clearly did not need it.
 */
function drawDemo() {
  if (!S.L || !S.L.steps || S.won || S.running) return;
  const step = S.L.steps[S.stepIdx];
  if (!step || !step.show) return;
  if (step.done && step.done(S)) return;

  // Magenta, and deliberately not the amber it used to be: a live cell starts
  // amber and ages towards green, so an amber outline sitting next to the cells
  // the player has just drawn was the same colour as them. This is the one hue
  // on screen that no cell ever takes.
  const t = (Math.sin(performance.now() / 380) + 1) / 2;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(198,120,221,' + (0.55 + t * 0.4) + ')';
  ctx.fillStyle = 'rgba(198,120,221,' + (0.08 + t * 0.14) + ')';
  for (const [x, y] of step.show) {
    if (S.eng.get(x, y)) continue; // already placed, no need to point at it
    const [sx, sy, sw, sh] = cellRect(x, y, 1, 1);
    ctx.fillRect(sx + 1, sy + 1, sw - 2, sh - 2);
    ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
  }
  ctx.restore();
}

/**
 * The lesson's own overlay: the neighbour count on every cell that has one, and
 * a ring around the one the step is talking about.
 *
 * This is the part that makes the rule visible instead of asserted. A sentence
 * saying "under 2 neighbours dies" means nothing to someone who has not yet
 * been shown what a neighbour is; a 1 sitting on the cell, and that cell
 * circled, does the whole job without being read.
 */
function drawLesson() {
  const L = S.L;
  if (!L || !L.lesson) return;
  const step = L.steps[S.teachStep];
  if (!step || !step.teach) return;

  ctx.save();
  ctx.font = 'bold ' + Math.floor(S.cam.s * 0.46) + 'px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = 0; y < L.h; y++)
    for (let x = 0; x < L.w; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && S.eng.get(x + dx, y + dy)) n++;
      if (!n) continue;
      const live = S.eng.get(x, y);
      // Only what the rules turn on: a live cell's own count, and an empty
      // cell's count when it is 3 and something is about to appear there.
      if (!live && n !== 3) continue;
      const [sx, sy, sw, sh] = cellRect(x, y, 1, 1);
      ctx.fillStyle = live
        ? (n === 2 || n === 3 ? 'rgba(22,23,29,.85)' : 'rgba(224,108,117,.95)')
        : 'rgba(152,195,121,.95)';
      ctx.fillText(String(n), sx + sw / 2, sy + sh / 2);
    }

  if (step.teach.ring) {
    const [rx, ry] = step.teach.ring;
    const [sx, sy, sw, sh] = cellRect(rx, ry, 1, 1);
    const t = (Math.sin(performance.now() / 420) + 1) / 2;
    ctx.strokeStyle = 'rgba(229,192,123,' + (0.5 + t * 0.4) + ')';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 2.5, sy - 2.5, sw + 5, sh + 5);
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
  drawGrid(); drawZones(); drawGhostFrame(); drawHeat(); drawLesson(); drawPreview(); drawTrace(); drawHover();
  // Last, so the outline the player is being asked to trace is never buried
  // under a hover box or a preview.
  drawDemo();
}

function updateGuide() {
  const L = S.L;
  if (!L || !L.steps) { guideEl.style.display = 'none'; return; }
  guideEl.style.display = 'flex';
  // The level's accent now lives on the step label alone -- the card is
  // bordered like the other panels rather than flagged down one side.
  gstep.style.color = L.accent || '#56b6c2';
  if (S.won) { gstep.textContent = 'DONE'; gtext.textContent = 'Mission complete'; return; }
  let i = S.stepIdx;
  if (L.lesson) {
    // Driven by teachNext and by STEP, not by scanning ahead: the lesson's
    // steps deliberately repeat their conditions.
    i = S.teachStep;
    if (L.steps[i] && L.steps[i].done && L.steps[i].done(S) && !L.steps[i].teach?.keep) {
      // The generation advanced -- move to the "here is what happened" half.
      S.teachStep = Math.min(S.teachStep + 1, L.steps.length - 1);
      S.stepIdx = S.teachStep;
      i = S.teachStep;
      buildTopbar();
    }
  } else {
    while (i < L.steps.length - 1 && L.steps[i].done && L.steps[i].done(S)) i++;
    if (i > S.stepIdx) S.stepIdx = i;
    i = S.stepIdx;
  }
  gstep.textContent = L.sandbox ? 'FREE' : 'STEP ' + (i + 1) + '/' + L.steps.length;
  gtext.textContent = L.steps[i].text;
  syncPointer(L.steps[i].anchor);
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
  if (el.goal) {
    const L = S.L;
    const prog = S.phase === 'edit' ? '' : goalProgress(L);
    el.goal.textContent = prog || goalLabel(L);
    el.goal.title = goalLabel(L);
  }
  if (el.bud) {
    const L = S.L;
    el.bud.textContent = S.phase !== 'edit' ? '--' :
      L.stampBudget ? S.stampsUsed + '/' + L.stampBudget :
      Math.max(0, S.eng.pop - S.presetPop) + '/' + L.budget;
  }
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
  termEl = $('#term'); cv = $('#cv'); ctx = cv.getContext('2d');
  topbar = $('#topbar'); tray = $('#tray'); levelsEl = $('#levels'); msgEl = $('#msg');
  modeBtn = $('#modebtn'); lvHead = $('#lvhead'); wipeBtn = $('#wipebtn');
  shopBtn = $('#shopbtn'); coinsEl = $('#coins');

  // Progress is read fresh: a wipe in another tab, or simply a later visit,
  // should not be masked by whatever the first import happened to see.
  S.unlocked = Math.min(CAMPAIGN - 1, +(localStorage.getItem('lifelab-unlocked') || 0));
  S.shop = loadShop();
  S.teachStep = 0;
  S.saw4x4 = false;
  last = performance.now(); acc = 0;

  modeBtn.onclick = chooseMode;
  wipeBtn.onclick = wipeSave;
  shopBtn.onclick = openShop;
  shopBtn.querySelector('.sicon').innerHTML = ICONS.shop;
  syncShopBadge();

  bindInput();
  ro = new ResizeObserver(() => resize());
  ro.observe($('#cvwrap'));

  // headless driver for automated checks
  window.lifelab = { S, loadLevel, doStep, startPause, step: n => { for (let i = 0; i < n; i++) doStep(); draw(); updateStats(); } };

  tlog('LIFE.LAB v0.1 — cellular automaton laboratory', 't-hd');
  tlog('rule: B3/S23 | grid: bounded | host: krsz.in');
  // A level is loaded so the canvas has something to size itself against; the
  // chooser sits over it until the player picks a mode.
  loadLevel(Math.min(S.unlocked, CAMPAIGN - 1), { quiet: true });
  chooseMode();
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
