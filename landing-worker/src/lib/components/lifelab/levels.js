// LIFE.LAB — the dish.
//
// There was a 25-level campaign here, and it is gone. The levels were puzzles
// about guessing where to drop a spaceship so its diagonal missed a red
// rectangle, which is a game about arithmetic on coordinates rather than about
// the automaton. A rule this interesting does not need a scoreboard bolted to
// it. What is left is the thing itself: a large grid, every pattern in the
// library, and nothing asking you to do anything in particular.
//
// `done` predicates are handed the live game state, which is main.js's own S --
// too large and too mutable to describe usefully here, so it is named rather
// than typed.
/** @typedef {any} GameState */
export const LEVELS = [
  {
    tab: 'DISH',
    name: 'THE DISH',
    // Big enough that a glider takes a couple of hundred generations to cross
    // and a gun has somewhere to fire into.
    w: 320,
    h: 200,
    sandbox: true,
    accent: '#61afef',
    tools: ['pan', 'draw', 'erase'],
    stamps: 'all',
    intro: ['> B3/S23 — a cell lives on 2 or 3 neighbours, and is born on exactly 3.'],
    steps: [
      { text: 'DRAW paints cells · pick a pattern from the tray · SOUP fills with noise · RUN' },
    ],
  },
];
