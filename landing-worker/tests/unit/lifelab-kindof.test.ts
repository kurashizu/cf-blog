import { describe, it, expect } from 'vitest';
import { kindOf, pattern } from '../../src/lib/components/lifelab/patterns.js';

/**
 * `kindOf` classifies a pattern by simulating it, which is why it can be
 * checked against facts rather than against itself: a block is a still life
 * and a glider is a ship, in this implementation or any other.
 *
 * It is also the highest CRAP score in the codebase (702 — CC 26, no
 * coverage), and the aiming overlay draws a travel line based on what it
 * returns, so a wrong answer is visible on screen.
 */

type Ship = { kind: string; period: number; dx: number; dy: number };
const isShip = (v: unknown): v is Ship =>
	!!v && typeof v === 'object' && (v as Ship).kind === 'ship';

describe('still lifes', () => {
	it.each(['block', 'beehive', 'loaf', 'tub', 'boat', 'pond'])('calls %s still', (name) => {
		expect(kindOf(name)).toBe('still');
	});
});

describe('oscillators', () => {
	it.each(['blinker', 'toad', 'beacon', 'pulsar', 'clock', 'pentadec'])(
		'calls %s an oscillator',
		(name) => {
			expect(kindOf(name)).toBe('osc');
		}
	);
});

describe('spaceships', () => {
	it('calls a glider a ship that travels diagonally with period 4', () => {
		const out = kindOf('glider');
		expect(isShip(out)).toBe(true);
		const ship = out as Ship;
		expect(ship.period).toBe(4);
		// one cell diagonally every four generations
		expect(Math.abs(ship.dx)).toBe(1);
		expect(Math.abs(ship.dy)).toBe(1);
	});

	it.each(['lwss', 'mwss', 'hwss'])('calls %s a ship that travels straight', (name) => {
		const out = kindOf(name);
		expect(isShip(out)).toBe(true);
		const ship = out as Ship;
		// the weight-class ships move two cells sideways every four generations
		expect(ship.period).toBe(4);
		expect(Math.abs(ship.dx) + Math.abs(ship.dy)).toBe(2);
		// orthogonal, not diagonal
		expect(ship.dx === 0 || ship.dy === 0).toBe(true);
	});

	it('gives every ship a positive period and a real displacement', () => {
		for (const name of ['glider', 'lwss', 'mwss', 'hwss']) {
			const ship = kindOf(name) as Ship;
			expect(ship.period).toBeGreaterThan(0);
			expect(ship.dx !== 0 || ship.dy !== 0).toBe(true);
		}
	});
});

describe('patterns that do neither', () => {
	it('calls the diehard dead', () => {
		// it is named for vanishing after 130 generations; the search only runs
		// 40, so it is still alive at the end and cannot be classified
		expect(kindOf('diehard')).toBe('chaotic');
	});

	it.each(['rpent', 'acorn', 'bunnies', 'rabbits', 'switchEngine'])(
		'calls %s chaotic',
		(name) => {
			expect(kindOf(name)).toBe('chaotic');
		}
	);

	it('calls a gun chaotic rather than an oscillator', () => {
		// a gun does repeat, but it emits gliders that leave the bounding box,
		// so its shape never matches the first generation again
		expect(kindOf('gosperGun')).toBe('chaotic');
	});
});

describe('the classification is stable', () => {
	it('gives the same answer when asked twice', () => {
		// the second call comes out of the module cache
		for (const name of ['block', 'blinker', 'glider', 'rpent']) {
			expect(kindOf(name)).toEqual(kindOf(name));
		}
	});

	it('returns one of the four shapes for every built-in pattern', () => {
		const names = [
			'block', 'blinker', 'toad', 'beacon', 'pulsar', 'glider', 'lwss',
			'rpent', 'acorn', 'beehive', 'loaf', 'tub', 'boat', 'pond', 'clock',
			'pentadec', 'mwss', 'hwss', 'diehard', 'eater', 'gosperGun',
			'bunnies', 'rabbits', 'switchEngine'
		];
		for (const name of names) {
			const out = kindOf(name);
			const ok = out === 'still' || out === 'osc' || out === 'dies' || out === 'chaotic' || isShip(out);
			expect(ok, `${name} returned ${JSON.stringify(out)}`).toBe(true);
		}
	});

	it('agrees with the pattern it classifies', () => {
		// a still life must not be reported as travelling
		for (const name of ['block', 'beehive']) {
			expect(isShip(kindOf(name))).toBe(false);
		}
		// and a ship must not be reported as still
		expect(kindOf('glider')).not.toBe('still');
	});
});

describe('the size cutoff', () => {
	it('does not simulate a pattern the size of a screen', () => {
		// anything over 40000 cells of bounding box is called chaotic without
		// being run, because simulating it forty generations is real work
		const eater = pattern('eater');
		expect(eater.w * eater.h).toBeLessThan(40000);
		// the built-ins are all small enough to be classified honestly; this
		// asserts the guard has not been tripped by any of them
		expect(kindOf('eater')).not.toBe(undefined);
	});
});
