// LIFE.LAB — tutorial campaign + sandbox. Each level: one concept, stepwise guide.
//
// `done` predicates are handed the live game state, which is main.js's own S --
// too large and too mutable to describe usefully here, so it is named rather
// than typed. What matters at this end is that every predicate takes it.
/** @typedef {any} GameState */
export const LEVELS = [
  {
    tab: '00', name: 'LEVEL 00 · THE RULES', w: 13, h: 9, accent: '#56b6c2',
    tools: ['pan'],
    // A lesson, not a level. Each step clears the board and puts up exactly one
    // situation, because the first version showed three at once and a player
    // who does not know the game cannot tell which of the three moving things a
    // sentence is about. `teach` drives it: the board is set, the counts are
    // drawn on every cell, and the ring marks the cell the step is about.
    lesson: true,
    goal: null,
    intro: ['> Cells live on a grid. Each one counts its 8 touching neighbours.'],
    steps: [
      {
        text: 'This cell has 1 neighbour. Too few — press STEP and watch both die.',
        teach: { cells: [[6, 4], [7, 4]], ring: [6, 4], counts: true },
        done: /** @param {GameState} S */ S => S.eng.gen >= 1,
        anchor: 'step',
      },
      {
        text: 'Gone. Under 2 neighbours is starvation.',
        teach: { keep: true },
        done: /** @param {GameState} S */ S => S.teachStep > 1,
        anchor: 'next',
      },
      {
        text: 'These 4 each have 3 neighbours. 2 or 3 survives — STEP, nothing moves.',
        teach: { cells: [[6, 4], [7, 4], [6, 5], [7, 5]], ring: [6, 4], counts: true },
        done: /** @param {GameState} S */ S => S.eng.gen >= 1,
        anchor: 'step',
      },
      {
        text: 'Unchanged. A shape like this can sit there forever.',
        teach: { keep: true },
        done: /** @param {GameState} S */ S => S.teachStep > 3,
        anchor: 'next',
      },
      {
        text: 'The empty cell in the ring touches exactly 3. STEP — a cell is born there.',
        teach: { cells: [[6, 3], [5, 4], [7, 4]], ring: [6, 4], counts: true, born: [6, 4] },
        done: /** @param {GameState} S */ S => S.eng.gen >= 1,
        anchor: 'step',
      },
      {
        text: 'Born. Exactly 3 neighbours creates a new cell.',
        teach: { keep: true },
        done: /** @param {GameState} S */ S => S.teachStep > 5,
        anchor: 'next',
      },
      {
        text: 'The middle cell has 4. Too many — STEP and it smothers.',
        teach: { cells: [[6, 3], [5, 4], [6, 4], [7, 4], [6, 5]], ring: [6, 4], counts: true },
        done: /** @param {GameState} S */ S => S.eng.gen >= 1,
        anchor: 'step',
      },
      {
        text: 'That is every rule. Under 2 dies, 2 or 3 lives, over 3 dies, exactly 3 is born.',
        teach: { keep: true },
        done: () => false,
        anchor: 'next',
      },
    ],
    winText: 'That is the whole game.\nSURVIVES on 2 or 3 neighbours. BORN on exactly 3. Everything else dies. Every pattern you will ever see follows from those two lines.',
  },
  {
    tab: '01', name: 'LEVEL 01 · FIRST CELLS', w: 20, h: 14, accent: '#98c379',
    tools: ['pan', 'draw'], budget: 12,
    goal: { type: 'survive', gens: 5 },
    intro: ['> Two rules: birth on 3 neighbours, survival on 2 or 3. Everything else dies.'],
    steps: [
      { text: 'Left-click to light up 3 cells in a row', done: /** @param {GameState} S */ S => S.eng.pop >= 3,
        anchor: 'draw', show: [[9, 7], [10, 7], [11, 7]] },
      { text: 'Press SPACE (or RUN) to evolve', done: /** @param {GameState} S */ S => S.phase !== 'edit', anchor: 'run' },
      { text: 'Goal: keep at least one cell alive through gen 5', anchor: 'gen' },
    ],
    winText: 'Cells survived past gen 5.\nSome patterns die, some settle, some pulse forever — next we study each kind.',
  },
  {
    tab: '02', name: 'LEVEL 02 · OVERCROWDING', w: 22, h: 15, accent: '#56b6c2',
    tools: ['pan', 'draw'], budget: 16,
    goal: { type: 'survive', gens: 12 },
    // The level teaches by having the player watch a shape fail first, so that
    // first run must not end the level -- with a plain `survive` goal the 4x4
    // dying at gen 4 popped MISSION FAILED on the step that told them to draw
    // it. `graceGens` holds the goal back until the player has had their look.
    graceGens: 6,
    intro: ['> Too few neighbours starves a cell. Too many smothers it.'],
    steps: [
      { text: 'Draw a solid 4x4 block, then press RUN', anchor: 'draw',
        done: /** @param {GameState} S */ S => S.saw4x4,
        show: [[9,5],[10,5],[11,5],[12,5],[9,6],[10,6],[11,6],[12,6],[9,7],[10,7],[11,7],[12,7],[9,8],[10,8],[11,8],[12,8]] },
      { text: 'All 16 died — the middle cells had 5 neighbours each. Press RESET', anchor: 'reset',
        done: /** @param {GameState} S */ S => S.saw4x4 && S.eng.gen === 0 },
      { text: 'Now draw a 3x3 instead — one cell narrower', anchor: 'draw',
        done: /** @param {GameState} S */ S => S.eng.pop >= 9,
        show: [[9,5],[10,5],[11,5],[9,6],[10,6],[11,6],[9,7],[10,7],[11,7]] },
      { text: 'RUN — this one lives past gen 12', anchor: 'run' },
    ],
    winText: 'The smaller square lived.\nIn a solid 4x4 the middle cells each have 5 neighbours and smother; in a 3x3 they have 3 and survive. One cell of difference decides it.',
  },
  {
    tab: '03', name: 'LEVEL 03 · STILL LIFE', w: 20, h: 14, accent: '#e5c07b',
    tools: ['pan', 'draw'], budget: 6,
    goal: { type: 'still', gens: 10 },
    intro: ['> Some structures are perfectly balanced and never change — still lifes.'],
    steps: [
      { text: 'Build a 2x2 block with 4 cells', done: /** @param {GameState} S */ S => S.eng.pop >= 4,
        anchor: 'draw', show: [[9, 6], [10, 6], [9, 7], [10, 7]] },
      { text: 'RUN — a true still life holds 10 gens without moving', anchor: 'run' },
    ],
    winText: 'Ten generations, zero change — a still life.\nStill lifes are the bricks: large machines use them to pin structure down.',
  },
  {
    tab: '04', name: 'LEVEL 04 · OSCILLATOR', w: 24, h: 16, accent: '#c678dd',
    tools: ['pan', 'draw'], budget: 10,
    goal: { type: 'osc', maxGen: 60 },
    intro: ['> Some structures cycle through shapes forever — oscillators.'],
    steps: [
      { text: 'Place a pattern that loops (a row of 3 works)', done: /** @param {GameState} S */ S => S.eng.pop >= 3,
        anchor: 'draw', show: [[11, 7], [12, 7], [13, 7]] },
      { text: 'RUN — wait for it to return to its starting shape within 60 gens', anchor: 'run' },
    ],
    winText: 'Periodic recurrence detected — an oscillator.\nOscillators are the clocks of Life. Next: a pattern that walks.',
  },
  {
    tab: '05', name: 'LEVEL 05 · THE BRICK', w: 22, h: 15, accent: '#98c379',
    tools: ['pan', 'draw'], budget: 8,
    goal: { type: 'exact', pop: 6, gen: 10 },
    // Exactly 6 alive at gen 10, drawn by hand from a budget of 8. A beehive is
    // 6 and stable; two blocks are 8; a blinker is 3 and never settles. The
    // player has to work out which shape holds, not pick one off a shelf.
    intro: ['> Build something that is exactly 6 cells and never changes.'],
    steps: [
      { text: 'Draw a shape. You have 8 cells to spend', done: /** @param {GameState} S */ S => S.eng.pop >= 4, anchor: 'draw' },
      { text: 'RUN — gen 10 must find exactly 6 cells alive', anchor: 'run' },
    ],
    winText: 'Six cells, holding.\nThat is a beehive. With the block, loaf and boat it is one of the four shapes almost every dead explosion leaves behind.',
  },
  {
    tab: '06', name: 'LEVEL 06 · THE INVENTORY', w: 30, h: 20, accent: '#e5c07b',
    tools: ['pan'], stamps: ['beehive', 'loaf', 'tub', 'boat', 'pond', 'block'], stampBudget: 2,
    goal: { type: 'exact', pop: 13, gen: 12 },
    // Two stamps from six still lifes, and only some pairs add to 13: tub(4) +
    // loaf(7) is 11, pond(8) + boat(5) is 13, beehive(6) + loaf(7) is 13.
    // Reading the shapes for their size is the puzzle.
    intro: ['> Six shapes that never change. Pick two that add up to exactly 13 cells.'],
    steps: [
      { text: 'Stamp two still lifes', done: /** @param {GameState} S */ S => S.stampsUsed >= 2, anchor: 'tray' },
      { text: 'RUN — gen 12 must find exactly 13 cells', anchor: 'run' },
    ],
    winText: 'Thirteen, unchanged.\nBlock 4, boat 5, beehive 6, loaf 7, pond 8, tub 4. Knowing what each one weighs is how larger constructions get planned.',
  },
  {
    tab: '07', name: 'LEVEL 07 · THE RIGHT CLOCK', w: 30, h: 20, accent: '#c678dd',
    tools: ['pan'], stamps: ['blinker', 'toad', 'beacon', 'clock', 'pulsar', 'pentadec'], stampBudget: 1,
    goal: { type: 'period', period: 3, maxGen: 60 },
    // Four of the six stamps are period 2, one is 15, one is 3. Stamping the
    // obvious one loses, which is the point -- the level is a question about
    // the library rather than a placement.
    intro: ['> Six oscillators. Only one of them repeats every 3 generations.'],
    steps: [
      { text: 'Pick the oscillator you think has period 3', done: /** @param {GameState} S */ S => S.stampsUsed >= 1, anchor: 'tray' },
      { text: 'RUN — a wrong period is a loss, so choose before you run', anchor: 'run' },
    ],
    winText: 'Period 3 — the pulsar.\nBlinker, toad, beacon and clock are all period 2; the pentadecathlon takes 15. Period is a property you have to measure, not guess.',
  },
  {
    tab: '08', name: 'LEVEL 08 · GLIDER', w: 64, h: 44, accent: '#56b6c2',
    tools: ['pan'], stamps: ['glider'], stampBudget: 2,
    editable: { x: 3, y: 3, w: 18, h: 18 },
    target: { x: 38, y: 32, w: 8, h: 8 },
    goal: { type: 'reach', maxGen: 400 },
    intro: ['> 1970: a moving pattern is discovered. One diagonal cell every 4 gens.'],
    steps: [
      { text: 'Click the glider stamp in the tray below', done: /** @param {GameState} S */ S => S.stamp === 'glider', anchor: 'tray' },
      { text: 'Place it in the dashed LAUNCH zone (R rotates; default heads down-right)', done: /** @param {GameState} S */ S => S.stampsUsed >= 1 },
      { text: 'RUN — fly it into the TARGET zone within 400 gens' },
    ],
    winText: 'Signal received.\nThe glider lets "here" affect "far away" — the messenger inside every Life computer.',
  },
  {
    tab: '09', name: 'LEVEL 09 · BIGGER SHIPS', w: 60, h: 34, accent: '#61afef',
    tools: ['pan'], stamps: ['lwss', 'mwss'], stampBudget: 2,
    editable: { x: 2, y: 2, w: 20, h: 30 },
    target: { x: 50, y: 12, w: 8, h: 12 },
    goal: { type: 'reach', maxGen: 200 },
    intro: ['> Gliders go diagonally. These go straight, and twice as fast.'],
    steps: [
      { text: 'Stamp an LWSS or MWSS in the launch zone', done: /** @param {GameState} S */ S => S.stampsUsed >= 1, anchor: 'tray' },
      { text: 'R rotates it — aim at the target zone', done: /** @param {GameState} S */ S => S.phase !== 'edit' },
      { text: 'RUN — reach the target within 200 gens' },
    ],
    winText: 'Orthogonal traffic delivered.\nSpaceships move one cell every 2 gens — twice a glider, and they carry more weight.',
  },
  {
    tab: '10', name: 'LEVEL 10 · EXPRESS', w: 62, h: 30, accent: '#61afef',
    tools: ['pan'], stamps: ['glider', 'lwss', 'mwss'], stampBudget: 1,
    editable: { x: 3, y: 10, w: 12, h: 10 },
    target: { x: 52, y: 10, w: 8, h: 10 },
    // A deadline the glider cannot meet. It covers one cell every 4 gens
    // diagonally; the LWSS covers two every 4 straight, so only the straight
    // ships arrive in time. Speed becomes a property worth knowing.
    goal: { type: 'reach', maxGen: 220, byGen: 105 },
    intro: ['> Same distance, half the time. A glider will not make it.'],
    steps: [
      { text: 'Pick a ship — the glider is the slow one', done: /** @param {GameState} S */ S => S.stamp !== null, anchor: 'tray' },
      { text: 'Launch it straight at the target', done: /** @param {GameState} S */ S => S.stampsUsed >= 1, anchor: 'tray' },
      { text: 'RUN — it has to arrive by gen 105', anchor: 'run' },
    ],
    winText: 'Delivered on time.\nA glider moves one cell diagonally every 4 gens. The LWSS and MWSS move two cells straight in the same time — twice the speed, and the reason they carry the long-distance traffic.',
  },
  {
    tab: '11', name: 'LEVEL 11 · TWO TARGETS', w: 60, h: 52, accent: '#61afef',
    tools: ['pan'], stamps: ['glider'], stampBudget: 2,
    editable: { x: 4, y: 20, w: 14, h: 12 },
    zones: [{ x: 34, y: 2, w: 9, h: 9 }, { x: 34, y: 41, w: 9, h: 9 }],
    goal: { type: 'visit', maxGen: 260 },
    // Gliders travel diagonally, so one goes up-right and one goes down-right --
    // which means both rotations are needed and both launch points matter.
    intro: ['> Two zones, two gliders. A glider only goes one way: diagonally.'],
    steps: [
      { text: 'Place a glider aimed at the upper zone', done: /** @param {GameState} S */ S => S.stampsUsed >= 1, anchor: 'tray' },
      { text: 'R rotates it. Place the second one at the lower zone', done: /** @param {GameState} S */ S => S.stampsUsed >= 2, anchor: 'tray' },
      { text: 'RUN — both zones must be reached', anchor: 'run' },
    ],
    winText: 'Both zones reached.\nA glider has one heading and four rotations. Aiming two at once is the first thing that feels like engineering rather than drawing.',
  },
  {
    tab: '12', name: 'LEVEL 12 · THE CORRIDOR', w: 56, h: 32, accent: '#e06c75',
    tools: ['pan'], stamps: ['glider', 'lwss', 'mwss'], stampBudget: 2,
    editable: { x: 3, y: 3, w: 14, h: 26 },
    hazard: { x: 24, y: 0, w: 8, h: 13 },
    target: { x: 46, y: 4, w: 8, h: 10 },
    goal: { type: 'reach', maxGen: 220 },
    // The target is high and the hazard sits between, so the diagonal route is
    // the one that fails: an LWSS travels straight and has to be launched on
    // the right row instead.
    intro: ['> Reach the target. Nothing may enter the red zone on the way.'],
    steps: [
      { text: 'Pick a ship — they do not all travel the same way', done: /** @param {GameState} S */ S => S.stamp !== null, anchor: 'tray' },
      { text: 'Place it so its path misses the red zone', done: /** @param {GameState} S */ S => S.stampsUsed >= 1, anchor: 'tray' },
      { text: 'RUN — touching the red zone loses', anchor: 'run' },
    ],
    winText: 'Through the gap.\nA glider only moves diagonally; the LWSS and MWSS move straight. Which one you need is decided by where the obstacle is.',
  },
  {
    tab: '13', name: 'LEVEL 13 · THE NARROWS', w: 56, h: 40, accent: '#e06c75',
    tools: ['pan'], stamps: ['glider'], stampBudget: 2,
    editable: { x: 3, y: 3, w: 12, h: 14 },
    hazard: { x: 20, y: 0, w: 10, h: 14 },
    target: { x: 42, y: 30, w: 10, h: 9 },
    // The hazard blocks the direct diagonal, so the shot has to be launched
    // from a row that clears its top corner -- a second use of the mechanic
    // where the answer is a position rather than a choice of ship.
    goal: { type: 'reach', maxGen: 240 },
    intro: ['> The wall covers the high road. Go under it.'],
    steps: [
      { text: 'Place a glider so its diagonal clears the red zone', done: /** @param {GameState} S */ S => S.stampsUsed >= 1, anchor: 'tray' },
      { text: 'RUN — the red zone ends the run if anything touches it', anchor: 'run' },
    ],
    winText: 'Around the wall.\nA glider has exactly one heading, so the only thing you control is where it starts. That is enough — the whole diagonal is decided by one cell.',
  },
  {
    tab: '14', name: 'LEVEL 14 · DEMOLITION', w: 72, h: 48, accent: '#e06c75',
    tools: ['pan'], stamps: ['glider'], stampBudget: 3,
    editable: { x: 4, y: 4, w: 24, h: 24 },
    target: { x: 46, y: 35, w: 12, h: 12 },
    presets: [{ name: 'block', x: 52, y: 41 }],
    goal: { type: 'clear', maxGen: 400 },
    intro: ['> Gliders are also projectiles. Collisions are exquisitely position-sensitive.'],
    steps: [
      { text: 'Aim a glider at the block inside the TARGET zone (3 shots)', done: /** @param {GameState} S */ S => S.stampsUsed >= 1 },
      { text: 'RUN — clear the zone; if you miss, RESET and shift one cell' },
    ],
    winText: 'Target zone cleared.\nThis is collision engineering: cell-perfect glider crashes are how every large machine gets synthesized.',
  },
  {
    tab: '15', name: 'LEVEL 15 · THE EATER', w: 50, h: 34, accent: '#e06c75',
    tools: ['pan'], stamps: ['eater'], stampBudget: 2,
    presets: [{ name: 'glider', x: 6, y: 6 }],
    editable: { x: 12, y: 12, w: 14, h: 14 },
    target: { x: 28, y: 28, w: 8, h: 6 },
    // 'guard': the zone must still be empty when the window closes. A 'clear'
    // goal would have been won at gen 0, since nothing is in there to start.
    goal: { type: 'guard', gens: 120 },
    intro: ['> A still life that survives being hit. Put one where the glider is going.'],
    steps: [
      { text: 'Stamp an eater in the glider\'s path', done: /** @param {GameState} S */ S => S.stampsUsed >= 1, anchor: 'tray' },
      { text: 'RUN — stop the glider before it reaches the target zone' },
    ],
    winText: 'Glider absorbed, eater intact.\nThe eater is how a machine deletes a signal: it swallows the glider and repairs itself in 4 gens.',
  },
  {
    tab: '16', name: 'LEVEL 16 · TRAFFIC', w: 46, h: 34, accent: '#61afef',
    tools: ['pan'], stamps: ['blinker'], stampBudget: 4,
    presets: [{ name: 'glider', x: 4, y: 4 }],
    editable: { x: 9, y: 9, w: 13, h: 13 },
    target: { x: 24, y: 24, w: 7, h: 7 },
    goal: { type: 'guard', gens: 100 },
    intro: ['> A blinker in the right place is a wall. In the wrong place it is fuel.'],
    steps: [
      { text: 'Block the glider with blinkers', done: /** @param {GameState} S */ S => S.stampsUsed >= 1, anchor: 'tray' },
      { text: 'RUN — keep the target zone clear for 110 gens', anchor: 'run' },
    ],
    winText: 'Zone held.\nAnything in a glider\'s path changes it. Whether that stops it or scatters it comes down to position.',
  },
  {
    tab: '17', name: 'LEVEL 17 · CHAOS', w: 60, h: 40, accent: '#e5c07b',
    tools: ['pan', 'draw'], budget: 10,
    presets: [{ name: 'rpent', x: 28, y: 18 }],
    goal: { type: 'grow', pop: 190, maxGen: 300 },
    intro: ['> Five cells run for a thousand generations. Feed them.'],
    steps: [
      { text: 'The R-pentomino is placed. Add up to 10 cells of your own', done: /** @param {GameState} S */ S => S.eng.pop > S.presetPop, anchor: 'draw' },
      { text: 'RUN — get the population to 190. Alone it only reaches 164', anchor: 'run' },
    ],
    winText: 'Past one hundred and ninety.\nThe R-pentomino runs 1103 generations from five cells. What you added either fed it or got in its way.',
  },
  {
    tab: '18', name: 'LEVEL 18 · BLOOM', w: 30, h: 20, accent: '#98c379',
    tools: ['pan', 'draw'], budget: 7,
    goal: { type: 'grow', pop: 40, maxGen: 150 },
    // Seven cells is the R-pentomino's budget. Almost every arrangement of
    // seven dies or settles small; a handful explode. That search is the level.
    intro: ['> Seven cells. Get forty out of them.'],
    steps: [
      { text: 'Draw any 7 cells — most arrangements will not work', done: /** @param {GameState} S */ S => S.eng.pop >= 7, anchor: 'draw' },
      { text: 'RUN. Under 40 by gen 150 is a loss — RESET and try another shape', anchor: 'run' },
    ],
    winText: 'Forty from seven.\nMost seven-cell shapes die or settle within a dozen gens. The few that do not are why this game is studied at all.',
  },
  {
    tab: '19', name: 'LEVEL 19 · LIFE SUPPORT', w: 30, h: 20, accent: '#e06c75',
    tools: ['pan', 'draw'], budget: 6,
    presets: [{ name: 'diehard', x: 12, y: 9 }],
    goal: { type: 'survive', gens: 120 },
    intro: ['> The diehard vanishes completely. Stop it.'],
    steps: [
      { text: 'Left alone this dies out. Add up to 6 cells to keep something alive', done: /** @param {GameState} S */ S => S.eng.pop > S.presetPop, anchor: 'draw' },
      { text: 'RUN — anything still alive at gen 120 counts', anchor: 'run' },
    ],
    winText: 'Something survived.\nThe diehard is built to leave nothing behind. A few cells in its path turn it into debris that lasts.',
  },
  {
    tab: '20', name: 'LEVEL 20 · CLEANUP', w: 56, h: 38, accent: '#98c379',
    tools: ['pan', 'draw'], budget: 8,
    presets: [{ name: 'acorn', x: 26, y: 18 }],
    goal: { type: 'settle', maxGen: 260 },
    intro: ['> The acorn runs for five thousand generations. Make it stop sooner.'],
    steps: [
      { text: 'Add up to 8 cells to damp it down', done: /** @param {GameState} S */ S => S.eng.pop > S.presetPop, anchor: 'draw' },
      { text: 'RUN — the whole board must come to rest by gen 260', anchor: 'run' },
    ],
    winText: 'Everything came to rest.\nA few cells in the right place change what an explosion settles into — and how long it takes to get there.',
  },
  {
    tab: '21', name: 'LEVEL 21 · STILLNESS', w: 26, h: 18, accent: '#e5c07b',
    tools: ['pan', 'draw'], budget: 12,
    goal: { type: 'settle', maxGen: 60 },
    // The opposite problem: not survival, but coming completely to rest. An
    // oscillator never settles, so the obvious shapes all fail.
    intro: ['> Make something that stops moving entirely. Oscillators do not count.'],
    steps: [
      { text: 'Draw up to 12 cells', done: /** @param {GameState} S */ S => S.eng.pop >= 4, anchor: 'draw' },
      { text: 'RUN — every cell must be still by gen 60', anchor: 'run' },
    ],
    winText: 'Everything came to rest.\nA settled board is all still lifes. Most starting shapes get there eventually — the debris of any explosion is mostly blocks and beehives.',
  },
  {
    tab: '22', name: 'LEVEL 22 · THE GUN', w: 120, h: 80, accent: '#d19a66',
    tools: ['pan'], stamps: ['eater', 'block'], stampBudget: 3,
    presets: [{ name: 'gosperGun', x: 8, y: 8 }],
    editable: { x: 30, y: 30, w: 40, h: 34 },
    target: { x: 84, y: 62, w: 16, h: 14 },
    goal: { type: 'guard', gens: 260 },
    intro: ['> A glider every 30 generations, forever. Stop them getting through.'],
    steps: [
      { text: 'The gun fires down the diagonal. Place eaters in its way', done: /** @param {GameState} S */ S => S.stampsUsed >= 1, anchor: 'tray' },
      { text: 'RUN — keep the target zone clear for 260 gens', anchor: 'run' },
    ],
    winText: 'The stream was stopped.\nA gun plus an eater is a signal and a receiver. Wire enough of them together and you have a computer — that is not a metaphor, it has been built.',
  },
  {
    tab: '23', name: 'LEVEL 23 · ANNIHILATION', w: 70, h: 44, accent: '#e06c75',
    tools: ['pan'], stamps: ['glider'], stampBudget: 1,
    presets: [{ name: 'glider', x: 4, y: 4 }],
    editable: { x: 14, y: 14, w: 14, h: 14 },
    target: { x: 32, y: 32, w: 8, h: 8 },
    // A head-on pair wipes both out: 46 of 81 offsets leave nothing at all.
    // This is the physical fact every logic gate in Life is built on, so it is
    // shown as a puzzle before anything is built out of it.
    goal: { type: 'guard', gens: 140 },
    intro: ['> Two gliders meeting head-on can leave nothing at all.'],
    steps: [
      { text: 'A glider is heading for the zone. Send one back at it', done: /** @param {GameState} S */ S => S.stampsUsed >= 1, anchor: 'tray' },
      { text: 'R rotates. Aim so they meet — the zone must stay empty', anchor: 'run' },
    ],
    winText: 'Both gone.\nA head-on collision destroys both gliders completely. One signal cancelling another is exactly what a NOT gate does — and that is where computation starts.',
  },
  {
    tab: '24', name: 'LEVEL 24 · THE SINK', w: 120, h: 80, accent: '#56b6c2',
    tools: ['pan'], stamps: ['eater'], stampBudget: 2,
    presets: [{ name: 'gosperGun', x: 6, y: 6 }],
    editable: { x: 30, y: 20, w: 40, h: 40 },
    hazard: { x: 92, y: 58, w: 26, h: 20 },
    // The gun never stops, so the stream has to be absorbed rather than
    // outlasted -- an eater restores itself in 4 gens and can swallow one every
    // 30 forever. Endless input met by a fixed-size machine.
    goal: { type: 'guard', gens: 400 },
    intro: ['> The gun fires forever. Absorb the stream before it reaches the corner.'],
    steps: [
      { text: 'Place an eater on the glider stream', done: /** @param {GameState} S */ S => S.stampsUsed >= 1, anchor: 'tray' },
      { text: 'RUN — nothing may reach the far corner in 400 generations', anchor: 'run' },
    ],
    winText: 'The stream is consumed.\nAn eater repairs itself in 4 generations, so it swallows one glider every 30 forever. A finite machine handling an unbounded input is the whole idea behind a computer.',
  },
  {
    tab: 'SBX', name: 'SANDBOX · FREE DISH', w: 320, h: 200, sandbox: true, accent: '#61afef',
    tools: ['pan', 'draw', 'erase'], stamps: 'all',
    intro: ['> No goals, no budget. Try the R-pentomino and the acorn.'],
    steps: [{ text: 'Brush / pattern stamps / SOUP random fill — go wild' }],
  },
];
