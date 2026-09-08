import { describe, it, expect } from 'vitest';
import { Life } from '../../src/lib/components/lifelab/engine.js';

/** Set every live cell of a pattern given as [x, y] pairs. */
function seed(life: Life, cells: [number, number][]) {
	for (const [x, y] of cells) life.set(x, y, 1);
}

/** The live cells as a sorted "x,y" list, so order never matters to a comparison. */
function liveCells(life: Life): string[] {
	const out: string[] = [];
	for (let y = 0; y < life.h; y++) {
		for (let x = 0; x < life.w; x++) if (life.get(x, y)) out.push(`${x},${y}`);
	}
	return out.sort();
}

describe('Life grid', () => {
	it('starts empty', () => {
		const life = new Life(8, 8);
		expect(life.pop).toBe(0);
		expect(life.gen).toBe(0);
		expect(liveCells(life)).toEqual([]);
	});

	it('tracks population as cells are set and cleared', () => {
		const life = new Life(8, 8);
		life.set(1, 1, 1);
		life.set(2, 2, 1);
		expect(life.pop).toBe(2);
		// setting an already-live cell must not double count
		life.set(1, 1, 1);
		expect(life.pop).toBe(2);
		life.set(1, 1, 0);
		expect(life.pop).toBe(1);
	});

	it('ignores writes outside the grid', () => {
		const life = new Life(4, 4);
		life.set(-1, 0, 1);
		life.set(0, -1, 1);
		life.set(4, 0, 1);
		life.set(0, 4, 1);
		expect(life.pop).toBe(0);
	});

	it('accepts writes on every edge of the grid', () => {
		// the cells just inside each bound must still be writable, which is
		// what separates `x < 0` from `x <= 0` in the guard
		const life = new Life(4, 4);
		for (const [x, y] of [
			[0, 0],
			[3, 0],
			[0, 3],
			[3, 3]
		] as [number, number][]) {
			life.set(x, y, 1);
		}
		expect(life.pop).toBe(4);
		expect(liveCells(life)).toEqual(['0,0', '0,3', '3,0', '3,3']);
	});

	it('reads and writes the last cell of the last row', () => {
		const life = new Life(5, 3);
		life.set(4, 2, 1);
		expect(life.get(4, 2)).toBe(1);
		expect(life.pop).toBe(1);
	});

	it('clear() resets cells, generation and population', () => {
		const life = new Life(6, 6);
		seed(life, [
			[1, 1],
			[2, 1]
		]);
		life.step();
		life.clear();
		expect(life.pop).toBe(0);
		expect(life.gen).toBe(0);
		expect(liveCells(life)).toEqual([]);
	});
});

describe('B3/S23 rules', () => {
	it('kills a lone cell (underpopulation)', () => {
		const life = new Life(6, 6);
		life.set(2, 2, 1);
		life.step();
		expect(life.pop).toBe(0);
	});

	it('kills a cell with four neighbours (overpopulation)', () => {
		const life = new Life(6, 6);
		// centre plus four orthogonal neighbours
		seed(life, [
			[2, 2],
			[1, 2],
			[3, 2],
			[2, 1],
			[2, 3]
		]);
		life.step();
		expect(life.get(2, 2)).toBe(0);
	});

	it('births a dead cell with exactly three neighbours', () => {
		const life = new Life(6, 6);
		seed(life, [
			[1, 1],
			[2, 1],
			[1, 2]
		]);
		life.step();
		// the fourth corner of the square is born
		expect(life.get(2, 2)).toBeGreaterThan(0);
	});

	it('holds a block still (still life)', () => {
		const life = new Life(6, 6);
		const block: [number, number][] = [
			[1, 1],
			[2, 1],
			[1, 2],
			[2, 2]
		];
		seed(life, block);
		const before = liveCells(life);
		life.step();
		expect(liveCells(life)).toEqual(before);
		expect(life.pop).toBe(4);
	});

	it('oscillates a blinker with period 2', () => {
		const life = new Life(7, 7);
		seed(life, [
			[2, 3],
			[3, 3],
			[4, 3]
		]);
		life.step();
		expect(liveCells(life)).toEqual(['3,2', '3,3', '3,4']);
		life.step();
		expect(liveCells(life)).toEqual(['2,3', '3,3', '4,3']);
	});

	it('moves a glider one cell diagonally every four generations', () => {
		const life = new Life(12, 12);
		const glider: [number, number][] = [
			[2, 1],
			[3, 2],
			[1, 3],
			[2, 3],
			[3, 3]
		];
		seed(life, glider);
		for (let i = 0; i < 4; i++) life.step();
		// the same five cells, translated by (+1, +1)
		const shifted = glider.map(([x, y]) => `${x + 1},${y + 1}`).sort();
		expect(liveCells(life)).toEqual(shifted);
		expect(life.pop).toBe(5);
	});
});

describe('bookkeeping', () => {
	it('increments the generation counter on every step', () => {
		const life = new Life(6, 6);
		life.step();
		life.step();
		expect(life.gen).toBe(2);
	});

	it('reports how many cells flipped', () => {
		const life = new Life(6, 6);
		seed(life, [
			[1, 1],
			[2, 1],
			[1, 2]
		]);
		// one birth, no deaths
		expect(life.step().changed).toBe(1);
		// a block is stable, so nothing flips
		expect(life.step().changed).toBe(0);
	});

	it('ages surviving cells and caps the age', () => {
		const life = new Life(6, 6);
		seed(life, [
			[1, 1],
			[2, 1],
			[1, 2],
			[2, 2]
		]);
		life.step();
		expect(life.get(1, 1)).toBe(2);
		life.step();
		expect(life.get(1, 1)).toBe(3);
	});

	it('round-trips through snapshot and restore', () => {
		const life = new Life(8, 8);
		seed(life, [
			[2, 3],
			[3, 3],
			[4, 3]
		]);
		const snap = life.snapshot();
		const cells = liveCells(life);
		// one step only: a blinker has period 2, so two steps would land back
		// on the starting cells and prove nothing about restore().
		life.step();
		expect(liveCells(life)).not.toEqual(cells);
		life.restore(snap);
		expect(liveCells(life)).toEqual(cells);
		expect(life.pop).toBe(3);
		expect(life.gen).toBe(0);
	});

	it('clear() wipes cells that a step would otherwise bring back', () => {
		const life = new Life(6, 6);
		// a blinker: if clear() left the back buffer dirty, stepping after a
		// clear could resurrect it
		seed(life, [
			[2, 3],
			[3, 3],
			[4, 3]
		]);
		life.step();
		life.clear();
		life.step();
		expect(life.pop).toBe(0);
		expect(liveCells(life)).toEqual([]);
	});

	it('hashes a change in the very last cell', () => {
		// the hash loop must reach the end of the buffer
		const a = new Life(4, 4);
		const b = new Life(4, 4);
		expect(a.hash()).toBe(b.hash());
		b.set(3, 3, 1);
		expect(a.hash()).not.toBe(b.hash());
	});

	it('hashes equal boards alike and different boards apart', () => {
		const a = new Life(6, 6);
		const b = new Life(6, 6);
		seed(a, [
			[1, 1],
			[2, 2]
		]);
		seed(b, [
			[1, 1],
			[2, 2]
		]);
		expect(a.hash()).toBe(b.hash());
		b.set(3, 3, 1);
		expect(a.hash()).not.toBe(b.hash());
	});

	it('counts live cells inside a rectangle only', () => {
		const life = new Life(8, 8);
		seed(life, [
			[1, 1],
			[2, 2],
			[6, 6]
		]);
		expect(life.rectCount({ x: 0, y: 0, w: 4, h: 4 })).toBe(2);
		expect(life.rectCount({ x: 5, y: 5, w: 2, h: 2 })).toBe(1);
		expect(life.rectCount({ x: 3, y: 3, w: 2, h: 2 })).toBe(0);
	});

	it('counts the rectangle half-open: the far edge is outside it', () => {
		const life = new Life(8, 8);
		// a cell exactly on the far edge of a 2x2 box at (1,1)
		seed(life, [
			[1, 1],
			[3, 1],
			[1, 3]
		]);
		// covers x 1..2 and y 1..2, so only (1,1) is inside
		expect(life.rectCount({ x: 1, y: 1, w: 2, h: 2 })).toBe(1);
		// widening by one takes in (3,1)
		expect(life.rectCount({ x: 1, y: 1, w: 3, h: 2 })).toBe(2);
		// heightening by one takes in (1,3)
		expect(life.rectCount({ x: 1, y: 1, w: 2, h: 3 })).toBe(2);
	});

	it('counts nothing for a zero-sized rectangle', () => {
		const life = new Life(6, 6);
		life.set(2, 2, 1);
		expect(life.rectCount({ x: 2, y: 2, w: 0, h: 0 })).toBe(0);
	});

	it('evolves cells in the last row and column', () => {
		// a block straddling the far corner: if step()'s loops stopped one
		// short, these cells would never be visited and the block would decay
		const life = new Life(5, 5);
		seed(life, [
			[3, 3],
			[4, 3],
			[3, 4],
			[4, 4]
		]);
		life.step();
		expect(life.pop).toBe(4);
		expect(life.get(4, 4)).toBeGreaterThan(0);
	});
});
