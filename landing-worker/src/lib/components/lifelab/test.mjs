import { Life } from './engine.js';
import { pattern, rotateCells, RLES } from './patterns.js';
import { LEVELS } from './levels.js';

function place(e, p, x, y) { p.cells.forEach(([cx, cy]) => e.set(x + cx, y + cy, 1)); }
function cellsOf(e) {
  const c = [];
  for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) if (e.get(x, y)) c.push([x, y]);
  return c;
}
let fails = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
}

// blinker period 2
{
  const e = new Life(16, 16); place(e, pattern('blinker'), 6, 6);
  const h0 = e.hash(); e.step(); const h1 = e.hash(); e.step();
  check('blinker period 2', e.hash() === h0 && h1 !== h0);
}
// block still
{
  const e = new Life(16, 16); place(e, pattern('block'), 6, 6);
  const r = e.step();
  check('block still', r.changed === 0 && e.pop === 4);
}
// toad + beacon period 2
for (const n of ['toad', 'beacon']) {
  const e = new Life(16, 16); place(e, pattern(n), 5, 5);
  const h0 = e.hash(); e.step(); const h1 = e.hash(); e.step();
  check(n + ' period 2', e.hash() === h0 && h1 !== h0);
}
// pulsar period 3
{
  const e = new Life(24, 24); place(e, pattern('pulsar'), 5, 5);
  const h0 = e.hash(); e.step(); e.step(); const h2 = e.hash(); e.step();
  check('pulsar period 3', e.hash() === h0 && h2 !== h0);
}
// glider: alive, moves; report direction
{
  const e = new Life(32, 32); place(e, pattern('glider'), 4, 4);
  const b = cellsOf(e);
  for (let i = 0; i < 4; i++) e.step();
  const a = cellsOf(e);
  const dx = a[0][0] - b[0][0], dy = a[0][1] - b[0][1];
  check('glider translates', e.pop === 5 && Math.abs(dx) === 1 && Math.abs(dy) === 1, `dir=(${dx},${dy})`);
  // all 4 rotations translate too
  for (let rot = 0; rot < 4; rot++) {
    const er = new Life(32, 32); const pr = rotateCells(pattern('glider'), rot);
    place(er, pr, 12, 12);
    const br = cellsOf(er); for (let i = 0; i < 4; i++) er.step(); const ar = cellsOf(er);
    const rdx = ar[0][0] - br[0][0], rdy = ar[0][1] - br[0][1];
    check(`glider rot${rot} translates`, er.pop === 5 && Math.abs(rdx) === 1 && Math.abs(rdy) === 1, `dir=(${rdx},${rdy})`);
  }
}
// lwss period 4 translation
{
  const e = new Life(40, 20); place(e, pattern('lwss'), 20, 8);
  const p0 = e.pop;
  for (let i = 0; i < 4; i++) e.step();
  check('lwss survives period 4', e.pop === p0, 'pop=' + e.pop);
}
// gosper gun emits
{
  const e = new Life(120, 80); place(e, pattern('gosperGun'), 8, 8);
  for (let i = 0; i < 150; i++) e.step();
  check('gosper gun emits', e.pop > 60, 'pop@150=' + e.pop);
}
// Every goal level, driven from levels.js rather than from copies of its
// numbers -- the board sizes moved once already and these tests did not notice.
{
  const byTab = Object.fromEntries(LEVELS.map(l => [l.tab, l]));
  // Levels are looked up by name from here on: a tab is a position and moves
  // whenever the campaign is reordered, which has silently repointed these
  // checks at the wrong level four separate times.
  const L = (name) => {
    const lv = LEVELS.find(l => ((l.name.split('·')[1] || l.name).trim()) === name);
    if (!lv) throw new Error('no level named ' + name);
    return lv;
  };
  const seed = (e, lv) => {
    for (const pr of lv.presets || []) place(e, pattern(pr.name), pr.x, pr.y);
  };
  const attempt = (lv, cells) => {
    const e = new Life(lv.w, lv.h);
    seed(e, lv);
    for (const [x, y] of cells) e.set(x, y, 1);
    const limit = lv.goal.maxGen || lv.goal.gens;
    for (let t = 0; t < limit; t++) {
      e.step();
      if (lv.hazard && e.rectCount(lv.hazard) > 0) return false;
      if (lv.goal.type === 'reach' && e.rectCount(lv.target) > 0) {
        return !(lv.goal.byGen && t + 1 > lv.goal.byGen);
      }
      if (lv.goal.type === 'clear' && e.rectCount(lv.target) === 0) return true;
      if (lv.goal.type === 'guard' && e.rectCount(lv.target) > 0) return false;
      if (e.pop === 0) return false;
    }
    return lv.goal.type === 'guard';
  };
  const sweep = (tab, names) => {
    const lv = L(tab), ed = lv.editable;
    let n = 0, first = null;
    for (const name of names) for (let rot = 0; rot < 4; rot++) {
      const pt = rotateCells(pattern(name), rot);
      for (let y = ed.y; y <= ed.y + ed.h - pt.h; y++)
        for (let x = ed.x; x <= ed.x + ed.w - pt.w; x++) {
          if (attempt(lv, pt.cells.map(([cx, cy]) => [x + cx, y + cy]))) { n++; first ||= [name, rot, x, y]; }
        }
    }
    return { n, first };
  };

  for (const [tab, names] of [['GLIDER', ['glider']], ['DEMOLITION', ['glider']], ['BIGGER SHIPS', ['lwss', 'mwss']], ['THE EATER', ['eater']], ['TRAFFIC', ['blinker']]]) {
    const r = sweep(tab, names);
    check(`${tab} solvable`, r.n > 0, `solutions=${r.n} first=${JSON.stringify(r.first)}`);
  }

  // A guard level must also be losable, or doing nothing wins it. This is the
  // check that caught both of them: the target sat off the glider's path and
  // the level was passed by pressing RUN.
  for (const tab of ['THE EATER', 'TRAFFIC']) {
    check(`${tab} is not free`, !attempt(L(tab), []), 'an unguarded glider must reach the zone');
  }

  // Whatever a step draws on the board must actually satisfy the level. L04
  // shipped telling the player to draw a 4x4 that dies at gen 4, on a level
  // asking them to survive to gen 12 -- unwinnable by following its own
  // instructions. Every `show` that is meant to win is checked here.
  for (const lv of LEVELS) {
    if (!lv.goal || !lv.steps) continue;
    if (lv.goal.type !== 'survive' && lv.goal.type !== 'still') continue;
    // The last step carrying cells is the one meant to reach the goal.
    const winning = lv.steps.filter(st => st.show).pop();
    if (!winning) continue;
    const e = new Life(lv.w, lv.h);
    seed(e, lv);
    for (const [x, y] of winning.show) e.set(x, y, 1);
    let ok = true;
    for (let g = 0; g < lv.goal.gens; g++) {
      const r = e.step();
      if (e.pop === 0) { ok = false; break; }
      if (lv.goal.type === 'still' && r.changed > 0) { ok = false; break; }
    }
    check(`L${lv.tab} demo cells satisfy the goal`, ok, `${winning.show.length} cells, ${lv.goal.type} ${lv.goal.gens}`);
  }

  // The two open-ended goals must be reachable inside their own budget, and
  // not reachable by accident -- checked against real patterns rather than
  // asserted in a comment.
  {
    const l17 = L('BLOOM');
    const e = new Life(l17.w, l17.h);
    const acorn = pattern('acorn');
    check('L20 budget covers a solution', acorn.cells.length <= l17.budget,
      `${acorn.cells.length} cells vs budget ${l17.budget}`);
    const ox = (l17.w >> 1) - 3, oy = (l17.h >> 1) - 2;
    for (const [x, y] of acorn.cells) e.set(ox + x, oy + y, 1);
    let hit = 0;
    for (let g = 1; g <= l17.goal.maxGen; g++) { e.step(); if (e.pop >= l17.goal.pop) { hit = g; break; } }
    check('L21 is winnable', hit > 0, `acorn reached ${l17.goal.pop} at gen ${hit}`);

    const l18 = L('STILLNESS');
    const settles = (name) => {
      const g2 = new Life(l18.w, l18.h);
      const p2 = pattern(name);
      for (const [x, y] of p2.cells) g2.set(8 + x, 8 + y, 1);
      for (let g = 1; g <= l18.goal.maxGen; g++) { const r = g2.step(); if (r.changed === 0 && g > 1) return g; }
      return 0;
    };
    check('L21 is winnable', settles('block') > 0, 'a block settles');
    check('L21 is not trivial', settles('blinker') === 0, 'an oscillator never settles');
  }

  // No level may be won by pressing RUN and waiting. These four used to be
  // `watch` goals -- place a pattern, watch it -- and were rewritten as puzzles;
  // this is what keeps them puzzles.
  {
    const play = (lv, add) => {
      const e = new Life(lv.w, lv.h);
      seed(e, lv);
      for (const [x, y] of add) e.set(x, y, 1);
      const g = lv.goal, lim = g.maxGen || g.gens;
      for (let t = 0; t < lim; t++) {
        const r = e.step();
        if (g.type === 'grow') { if (e.pop >= g.pop) return true; if (e.pop === 0) return false; }
        if (g.type === 'survive' && e.pop === 0) return false;
        if (g.type === 'settle') { if (e.pop === 0) return false; if (r.changed === 0 && t > 1) return true; }
        if (g.type === 'guard' && e.rectCount(lv.target) > 0) return false;
      }
      return g.type === 'survive' || g.type === 'guard';
    };
    const SHAPES = [[[0,0],[1,0],[2,0]], [[0,0],[1,0],[0,1],[1,1]], [[0,0],[0,1],[0,2]], [[0,0],[1,1],[2,0]]];
    for (const tab of ['CHAOS', 'LIFE SUPPORT', 'CLEANUP', 'THE GUN']) {
      const lv = L(tab);
      check(`${tab} is not free`, !play(lv, []), 'doing nothing must lose');

      let solved = false;
      if (lv.budget) {
        for (let y = 2; y < lv.h - 4 && !solved; y += 2)
          for (let x = 2; x < lv.w - 4 && !solved; x += 2)
            for (const sh of SHAPES) if (play(lv, sh.map(([a, b]) => [x + a, y + b]))) { solved = true; break; }
      } else if (lv.stamps) {
        const ed = lv.editable;
        for (const name of lv.stamps) for (let rot = 0; rot < 4 && !solved; rot++) {
          const pt = rotateCells(pattern(name), rot);
          for (let y = ed.y; y <= ed.y + ed.h - pt.h && !solved; y += 2)
            for (let x = ed.x; x <= ed.x + ed.w - pt.w; x += 2)
              if (play(lv, pt.cells.map(([a, b]) => [x + a, y + b]))) { solved = true; break; }
        }
      }
      check(`${tab} is solvable`, solved, 'a small addition must be able to win it');
    }
  }

  // The redesigned levels: each must have exactly one right answer among the
  // choices it offers, or it is a placement exercise again.
  {
    const l5 = L('THE BRICK');
    const at = (name, gen) => {
      const e = new Life(l5.w, l5.h);
      const pt = pattern(name);
      for (const [x, y] of pt.cells) e.set(9 + x, 6 + y, 1);
      for (let g = 0; g < gen; g++) e.step();
      return e.pop;
    };
    check('L05 has a solution', at('beehive', l5.goal.gen) === l5.goal.pop, 'a beehive holds 6');
    check('L05 rejects near misses',
      at('block', l5.goal.gen) !== l5.goal.pop && at('boat', l5.goal.gen) !== l5.goal.pop,
      'block and boat are the wrong size');

    // 06 asks for two still lifes summing to an exact population, so some
    // pairs must work and most must not -- otherwise it is a placement again.
    const l6b = L('THE INVENTORY');
    const size = n => pattern(n).cells.length;
    let good = 0, all = 0;
    for (let i = 0; i < l6b.stamps.length; i++)
      for (let j = i; j < l6b.stamps.length; j++) {
        all++;
        if (size(l6b.stamps[i]) + size(l6b.stamps[j]) === l6b.goal.pop) good++;
      }
    check('L06 has a solution', good > 0, `${good} of ${all} pairs sum to ${l6b.goal.pop}`);
    check('L06 is not trivial', good < all / 2, `${all - good} pairs are wrong`);

    const l6 = L('THE RIGHT CLOCK');
    const periodOf = (name) => {
      const e = new Life(l6.w, l6.h);
      const pt = pattern(name);
      for (const [x, y] of pt.cells) e.set(9 + x, 6 + y, 1);
      const seen = new Map([[e.hash(), 0]]);
      for (let g = 1; g <= l6.goal.maxGen; g++) {
        e.step();
        const h = e.hash();
        if (seen.has(h)) return g - seen.get(h);
        seen.set(h, g);
      }
      return 0;
    };
    const rights = l6.stamps.filter(n => periodOf(n) === l6.goal.period);
    check('L07 has exactly one right answer', rights.length === 1, `${rights.join(',') || 'none'} of ${l6.stamps.length}`);

    const l12 = L('TWO TARGETS'), ed12 = l12.editable;
    const zoneHits = (rot, x, y) => {
      const pt = rotateCells(pattern('glider'), rot);
      const e = new Life(l12.w, l12.h);
      for (const [cx, cy] of pt.cells) e.set(x + cx, y + cy, 1);
      const hit = new Set();
      for (let g = 0; g < l12.goal.maxGen; g++) {
        e.step();
        l12.zones.forEach((z, i) => { if (e.rectCount(z) > 0) hit.add(i); });
        if (e.pop === 0) break;
      }
      return hit;
    };
    let a = null, b = null;
    for (let rot = 0; rot < 4 && !(a && b); rot++) {
      const pt = rotateCells(pattern('glider'), rot);
      for (let y = ed12.y; y <= ed12.y + ed12.h - pt.h && !(a && b); y++)
        for (let x = ed12.x; x <= ed12.x + ed12.w - pt.w; x++) {
          const h = zoneHits(rot, x, y);
          if (h.has(0) && !a) a = [rot, x, y];
          if (h.has(1) && !b) b = [rot, x, y];
          if (a && b) break;
        }
    }
    check('L13 both zones are reachable', !!(a && b), `zone1 ${a ? 'ok' : 'UNREACHABLE'}, zone2 ${b ? 'ok' : 'UNREACHABLE'}`);

    const l14 = L('THE CORRIDOR'), ed14 = l14.editable;
    let win14 = null, blocked = 0, tried14 = 0;
    for (const name of l14.stamps) for (let rot = 0; rot < 4; rot++) {
      const pt = rotateCells(pattern(name), rot);
      for (let y = ed14.y; y <= ed14.y + ed14.h - pt.h; y++)
        for (let x = ed14.x; x <= ed14.x + ed14.w - pt.w; x++) {
          tried14++;
          const e = new Life(l14.w, l14.h);
          for (const [cx, cy] of pt.cells) e.set(x + cx, y + cy, 1);
          for (let g = 0; g < l14.goal.maxGen; g++) {
            e.step();
            if (e.rectCount(l14.hazard) > 0) { blocked++; break; }
            if (e.rectCount(l14.target) > 0) { win14 ||= [name, rot, x, y]; break; }
            if (e.pop === 0) break;
          }
        }
    }
    check('L15 is solvable', !!win14, win14 ? JSON.stringify(win14) : 'no route avoids the hazard');
    check('L15 hazard actually constrains', blocked > 0, `${blocked} of ${tried14} placements hit it`);
  }

  // The two newest levels. L16 exists to make speed matter and L17 to make
  // position matter, so each is checked for the property it is built on.
  {
    const shipRun = (lv, name, rot, x, y) => {
      const pt = rotateCells(pattern(name), rot);
      const e = new Life(lv.w, lv.h);
      for (const [cx, cy] of pt.cells) e.set(x + cx, y + cy, 1);
      for (let g = 1; g <= lv.goal.maxGen; g++) {
        e.step();
        if (lv.hazard && e.rectCount(lv.hazard) > 0) return 'hazard';
        if (e.rectCount(lv.target) > 0) return (lv.goal.byGen && g > lv.goal.byGen) ? 'late' : 'win';
        if (lv.goal.byGen && g > lv.goal.byGen) return 'late';
        if (e.pop === 0) return 'died';
      }
      return 'timeout';
    };
    const sweep = (lv, name) => {
      const ed = lv.editable;
      const tally = { win: 0, hazard: 0 };
      for (let rot = 0; rot < 4; rot++) {
        const pt = rotateCells(pattern(name), rot);
        for (let y = ed.y; y <= ed.y + ed.h - pt.h; y++)
          for (let x = ed.x; x <= ed.x + ed.w - pt.w; x++) {
            const r = shipRun(lv, name, rot, x, y);
            if (r === 'win') tally.win++;
            if (r === 'hazard') tally.hazard++;
          }
      }
      return tally;
    };

    const l16 = L('EXPRESS');
    const slow = sweep(l16, 'glider'), fast = sweep(l16, 'lwss');
    check('L16 deadline rules the glider out', slow.win === 0, 'a glider must never make it in time');
    check('L16 is winnable with a fast ship', fast.win > 0, `${fast.win} LWSS placements arrive in time`);

    const l17 = L('THE NARROWS');
    const g17 = sweep(l17, 'glider');
    check('L17 is solvable', g17.win > 0, `${g17.win} placements reach the target`);
    check('L17 hazard constrains', g17.hazard > 0, `${g17.hazard} placements hit the wall`);
  }

  // Every tab a check above refers to, with the level it is meant to be. A
  // level inserted in the middle renumbers the rest, and a check then silently
  // tests something else -- which has happened three times.
  {
    // The campaign is ordered as acts -- rules, then the library, then things
    // that move, then collisions, then populations, then the gun and what it
    // is for. Checked as a sequence so a level cannot be dropped in somewhere
    // that breaks the teaching order.
    const ORDER = [
      'THE RULES', 'FIRST CELLS', 'OVERCROWDING', 'STILL LIFE', 'OSCILLATOR',
      'THE BRICK', 'THE INVENTORY', 'THE RIGHT CLOCK',
      'GLIDER', 'BIGGER SHIPS', 'EXPRESS', 'TWO TARGETS', 'THE CORRIDOR', 'THE NARROWS',
      'DEMOLITION', 'THE EATER', 'TRAFFIC',
      'CHAOS', 'BLOOM', 'LIFE SUPPORT', 'CLEANUP', 'STILLNESS',
      'THE GUN', 'ANNIHILATION', 'THE SINK',
    ];
    const actual = LEVELS.filter(l => !l.sandbox).map(l => (l.name.split('·')[1] || l.name).trim());
    check('campaign order matches the intended acts',
      actual.join('|') === ORDER.join('|'),
      actual.join('|') === ORDER.join('|') ? `${actual.length} levels in order` : `got ${actual.join(' ')}`);

    // Tabs must still be a clean run, since they are what the player sees.
    const tabs = LEVELS.filter(l => !l.sandbox).map(l => l.tab);
    const expectTabs = tabs.map((_, i) => String(i).padStart(2, '0'));
    check('tabs are numbered without gaps', tabs.join() === expectTabs.join(), tabs.join(' '));
  }

  // The computation act. Both are guard levels against a live source, so each
  // must be losable by doing nothing and winnable by one well-placed piece.
  for (const [name, stamp] of [['ANNIHILATION', 'glider'], ['THE SINK', 'eater']]) {
    const lv = L(name), ed = lv.editable;
    const play = (cells) => {
      const e = new Life(lv.w, lv.h);
      seed(e, lv);
      for (const [x, y] of cells) e.set(x, y, 1);
      for (let t = 1; t <= lv.goal.gens; t++) {
        e.step();
        if (lv.hazard && e.rectCount(lv.hazard) > 0) return false;
        if (lv.target && e.rectCount(lv.target) > 0) return false;
      }
      return true;
    };
    check(`${name} is not free`, !play([]), 'the source must get through unopposed');
    let win = 0, tried = 0;
    const stride = lv.w > 90 ? 3 : 1;
    for (let rot = 0; rot < 4; rot++) {
      const pt = rotateCells(pattern(stamp), rot);
      for (let y = ed.y; y <= ed.y + ed.h - pt.h; y += stride)
        for (let x = ed.x; x <= ed.x + ed.w - pt.w; x += stride) {
          tried++;
          if (play(pt.cells.map(([a, b]) => [x + a, y + b]))) win++;
        }
    }
    check(`${name} is solvable`, win > 0, `${win} of ${tried} placements hold`);
    check(`${name} needs aim`, win < tried * 0.6, `${Math.round(100 * win / tried)}% of placements work`);
  }

  // No two library entries may be the same cells. MWSS shipped as a byte-for-
  // byte copy of LWSS: two stamps, one shape, and a level offering a choice
  // that was not one.
  const seen = new Map();
  for (const name of Object.keys(RLES)) {
    const pt = pattern(name);
    const key = pt.w + 'x' + pt.h + ':' + pt.cells.map(c => c.join(',')).sort().join(' ');
    if (seen.has(key)) check(`${name} differs from ${seen.get(key)}`, false, 'identical cells');
    else seen.set(key, name);
  }
  check('every pattern is distinct', seen.size === Object.keys(RLES).length,
    `${seen.size} shapes for ${Object.keys(RLES).length} names`);

  // Every pattern in the library should appear in some level, or it is a stamp
  // nobody ever sees outside the sandbox.
  const used = new Set();
  for (const l of LEVELS) {
    if (Array.isArray(l.stamps)) l.stamps.forEach(n => used.add(n));
    (l.presets || []).forEach(pr => used.add(pr.name));
  }
  const missing = Object.keys(RLES).filter(n => !used.has(n));
  check('every pattern is used by a level', missing.length === 0, missing.join(' ') || 'all covered');
}
// The lesson is finished by walking its steps, not by meeting a goal, so it
// leaves by a different door -- and that door used to skip the unlock, which
// left the level list stuck at "00 / 01 ???" for the whole campaign. This
// checks the shape that made that possible: every campaign level must be
// reachable by clearing the one before it, with no gap at the lesson.
{
  const campaign = LEVELS.filter((l) => !l.sandbox);
  check('the lesson is first', !!campaign[0].lesson, campaign[0].name);
  check('only one lesson', campaign.filter((l) => l.lesson).length === 1, 'the rest must have goals');
  const goalless = campaign.filter((l) => !l.lesson && !l.goal).map((l) => l.tab);
  check('every other level has a goal to clear', goalless.length === 0,
    goalless.length ? `no goal on ${goalless.join(' ')}` : 'all clearable');
  check('the sandbox is last and outside the campaign',
    LEVELS[LEVELS.length - 1].sandbox === true && campaign.length === LEVELS.length - 1,
    `${campaign.length} campaign levels + sandbox`);
}

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
