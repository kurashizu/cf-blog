// LIFE.LAB — the shop. Levels pay out; the aids they buy are the ones that
// answer a question the dish will not: where is this thing going, and what will
// it look like when it gets there.
//
// Deliberately not upgrades to the simulation. Nothing here changes a rule or
// makes a level easier to satisfy -- they only let the player see further ahead
// than a still frame does, which is the part that is genuinely hard to eyeball.
/**
 * Two kinds of thing.
 *
 * `tool` is bought once and owned: a way of seeing the dish that stays on. They
 * are the ones worth saving for.
 *
 * `use` is spent. Each buy adds a charge, and a charge is consumed when it is
 * used -- these are the ones that solve a level outright, so paying per use is
 * what keeps them from replacing the puzzle.
 */
export const ITEMS = [
  {
    id: 'trace',
    kind: 'tool',
    icon: 'trace',
    name: 'TRAJECTORY',
    cost: 3,
    blurb: 'Dotted path showing where a stamped ship travels.',
    detail: 'Runs the pattern forward 120 gens on its own and marks where it goes. Aiming stops being guesswork.',
  },
  {
    id: 'ghost',
    kind: 'tool',
    icon: 'ghost',
    name: 'GHOST FRAME',
    cost: 4,
    blurb: 'Faint overlay of the next generation, before you run.',
    detail: 'Shows what one step would produce while you are still editing.',
  },
  {
    id: 'heat',
    kind: 'tool',
    icon: 'heat',
    name: 'NEIGHBOUR COUNT',
    cost: 3,
    blurb: 'Each empty cell shows how many neighbours it has.',
    detail: 'A cell with exactly 3 is about to be born. Makes the rule visible instead of remembered.',
  },
  {
    id: 'undo',
    kind: 'tool',
    icon: 'undo',
    name: 'REWIND',
    cost: 5,
    blurb: 'Step the simulation backwards.',
    detail: 'Keeps the last 40 generations so a collision can be replayed frame by frame.',
  },
  {
    id: 'peek',
    icon: 'trace',
    kind: 'use',
    cost: 2,
    name: 'FAST FORWARD',
    blurb: 'Jump 50 generations instantly.',
    detail: 'Spends one charge. Useful when a pattern needs a long run before anything happens.',
  },
  {
    id: 'wipe',
    icon: 'undo',
    kind: 'use',
    cost: 2,
    name: 'SECOND CHANCE',
    blurb: 'Restore the budget after a failed run.',
    detail: 'Spends one charge and puts the level back to gen 0 with your stamps returned.',
  },
  {
    id: 'lab',
    kind: 'tool',
    icon: 'lab',
    name: 'LAB ACCESS',
    cost: 8,
    blurb: 'The full pattern library in every level.',
    detail: 'Every stamp in the sandbox becomes available while a level is running. Budgets still apply.',
  },
];

const KEY = 'lifelab-shop';

export function loadShop() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      coins: +raw.coins || 0,
      owned: Array.isArray(raw.owned) ? raw.owned : [],
      // id -> charges remaining, for the consumables.
      charges: raw.charges && typeof raw.charges === 'object' ? raw.charges : {},
    };
  } catch {
    return { coins: 0, owned: [], charges: {} };
  }
}

/** @param {{ coins: number, owned: string[], charges: Record<string, number> }} s */
export function saveShop(s) {
  localStorage.setItem(KEY, JSON.stringify({ coins: s.coins, owned: s.owned, charges: s.charges }));
}
