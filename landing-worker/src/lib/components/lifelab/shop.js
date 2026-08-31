// LIFE.LAB — the shop. Levels pay out; the aids they buy are the ones that
// answer a question the dish will not: where is this thing going, and what will
// it look like when it gets there.
//
// Deliberately not upgrades to the simulation. Nothing here changes a rule or
// makes a level easier to satisfy -- they only let the player see further ahead
// than a still frame does, which is the part that is genuinely hard to eyeball.
/**
 * Everything here is bought once and owned: a way of seeing the dish that
 * stays on.
 *
 * There were consumables too, and they were a bad idea. Credits come only from
 * first clears, so the budget is fixed and nothing replenishes it -- a charge
 * that costs 3 of a lifetime 48 to skip fifty generations is a permanent price
 * for a temporary thing, and both of them duplicated a button the toolbar
 * already had: the speed control and RESET.
 *
 * `from` is the level a tool first has anything to do. Without it the cheapest
 * tool was affordable after one clear and the whole set was owned by level 11
 * of 25 -- so the back half of the campaign had a shop with nothing in it, and
 * TRAJECTORY was on sale seven levels before the first ship appeared. A tool
 * shows as locked until the campaign reaches the level that gives it a use.
 */
export const ITEMS = [
  {
    id: 'trace',
    kind: 'tool',
    icon: 'trace',
    name: 'TRAJECTORY',
    cost: 6,
    from: 8,
    blurb: 'Dotted path showing where a stamped ship travels.',
    detail: 'Runs the pattern forward 120 gens on its own and marks where it goes. Aiming stops being guesswork.',
  },
  {
    id: 'ghost',
    kind: 'tool',
    icon: 'ghost',
    name: 'GHOST FRAME',
    cost: 5,
    from: 3,
    blurb: 'Faint overlay of the next generation, before you run.',
    detail: 'Shows what one step would produce while you are still editing.',
  },
  {
    id: 'heat',
    kind: 'tool',
    icon: 'heat',
    name: 'NEIGHBOUR COUNT',
    cost: 4,
    from: 1,
    blurb: 'Each empty cell shows how many neighbours it has.',
    detail: 'A cell with exactly 3 is about to be born. Makes the rule visible instead of remembered.',
  },
  {
    id: 'undo',
    kind: 'tool',
    icon: 'undo',
    name: 'REWIND',
    cost: 8,
    from: 14,
    blurb: 'Step the simulation backwards.',
    detail: 'Keeps the last 40 generations so a collision can be replayed frame by frame.',
  },
  {
    id: 'lab',
    kind: 'tool',
    icon: 'lab',
    name: 'LAB ACCESS',
    cost: 12,
    from: 6,
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
    };
  } catch {
    return { coins: 0, owned: [] };
  }
}

/** @param {{ coins: number, owned: string[] }} s */
export function saveShop(s) {
  localStorage.setItem(KEY, JSON.stringify({ coins: s.coins, owned: s.owned }));
}
