import { describe, it, expect } from 'vitest';
import {
	decodeRLE,
	encodeRLE,
	parseRLE,
	normalizeCells,
	rotateCells,
	transformCells,
	nextOrientation,
	sameCells
} from '../../src/lib/components/lifelab/patterns.js';

/* The module's JSDoc types a cell as number[], not a fixed pair, so the tests
   use the same shape -- a stricter tuple here would not be assignable. */
type Cell = number[];
const sortCells = (cells: Cell[]) => [...cells].map(([x, y]) => `${x},${y}`).sort();

describe('decodeRLE', () => {
	it('decodes a single cell', () => {
		expect(decodeRLE('o!')).toEqual({ cells: [[0, 0]], w: 1, h: 1 });
	});

	it('decodes runs of live and dead cells', () => {
		// 2 dead, 3 live on row 0
		const { cells, w, h } = decodeRLE('2b3o!');
		expect(sortCells(cells)).toEqual(['2,0', '3,0', '4,0']);
		expect([w, h]).toEqual([5, 1]);
	});

	it('handles row breaks and multi-row skips', () => {
		// row 0: one live; skip to row 2: one live
		const { cells, h } = decodeRLE('o2$o!');
		expect(sortCells(cells)).toEqual(['0,0', '0,2']);
		expect(h).toBe(3);
	});

	it('decodes a blinker', () => {
		const { cells, w, h } = decodeRLE('3o!');
		expect(sortCells(cells)).toEqual(['0,0', '1,0', '2,0']);
		expect([w, h]).toEqual([3, 1]);
	});

	it('decodes a glider', () => {
		const { cells, w, h } = decodeRLE('bob$2bo$3o!');
		expect(sortCells(cells)).toEqual(['0,2', '1,0', '1,2', '2,1', '2,2']);
		expect([w, h]).toEqual([3, 3]);
	});

	it('ignores whitespace and newlines inside the body', () => {
		expect(sortCells(decodeRLE('b o b $\n2 b o !').cells)).toEqual(sortCells(decodeRLE('bob$2bo!').cells));
	});

	it('stops at the terminator', () => {
		expect(sortCells(decodeRLE('o!ooo').cells)).toEqual(['0,0']);
	});

	it('returns an empty pattern for empty input', () => {
		expect(decodeRLE('')).toEqual({ cells: [], w: 0, h: 0 });
		expect(decodeRLE('!')).toEqual({ cells: [], w: 0, h: 0 });
	});
});

describe('encodeRLE', () => {
	it('emits a header stating the size and the Life rule', () => {
		const { header } = encodeRLE([[0, 0]], 3, 3);
		expect(header).toBe('x = 3, y = 3, rule = B3/S23');
	});

	it('encodes a single cell', () => {
		expect(encodeRLE([[0, 0]], 1, 1).body).toBe('o!');
	});

	it('collapses runs', () => {
		const cells: Cell[] = [
			[2, 0],
			[3, 0],
			[4, 0]
		];
		expect(encodeRLE(cells, 5, 1).body).toBe('2b3o!');
	});

	it('drops cells outside the stated bounds', () => {
		const cells: Cell[] = [
			[0, 0],
			[9, 9],
			[-1, 0]
		];
		expect(encodeRLE(cells, 2, 2).body).toBe('o!');
	});

	it('wraps the body at 70 characters', () => {
		// alternate live/dead across a wide row so the encoding is long
		const cells: Cell[] = [];
		for (let x = 0; x < 200; x += 2) cells.push([x, 0]);
		const { body } = encodeRLE(cells, 200, 1);
		for (const line of body.split('\n')) expect(line.length).toBeLessThanOrEqual(70);
	});

	it('round-trips a glider through decode and encode', () => {
		const rle = 'bob$2bo$3o!';
		const { cells, w, h } = decodeRLE(rle);
		// Trailing dead cells are not encoded -- 'bob$' comes back as 'bo$',
		// which is the same pattern written more tersely, so compare cells
		// rather than bytes.
		const body = encodeRLE(cells, w, h).body;
		expect(body).toBe('bo$2bo$3o!');
		expect(sortCells(decodeRLE(body).cells)).toEqual(sortCells(cells));
	});

	it('round-trips patterns with blank rows', () => {
		const original = 'o2$o!';
		const { cells, w, h } = decodeRLE(original);
		const again = decodeRLE(encodeRLE(cells, w, h).body);
		expect(sortCells(again.cells)).toEqual(sortCells(cells));
	});

	it('round-trips a pattern with a gap inside a row', () => {
		const cells: Cell[] = [
			[0, 0],
			[4, 0],
			[2, 1]
		];
		const again = decodeRLE(encodeRLE(cells, 5, 2).body);
		expect(sortCells(again.cells)).toEqual(sortCells(cells));
	});
});

describe('parseRLE', () => {
	it('reads name, comments, size and body from a full file', () => {
		const text = ['#N Glider', '#C The smallest spaceship.', 'x = 3, y = 3, rule = B3/S23', 'bob$2bo$3o!'].join('\n');
		const out = parseRLE(text);
		expect(out.name).toBe('Glider');
		expect(out.comments).toEqual(['The smallest spaceship.']);
		expect(out.w).toBe(3);
		expect(out.h).toBe(3);
		expect(out.rle).toBe('bob$2bo$3o!');
	});

	it('joins a body split over several lines', () => {
		const text = ['x = 3, y = 3', 'bob$', '2bo$', '3o!'].join('\n');
		expect(parseRLE(text).rle).toBe('bob$2bo$3o!');
	});

	it('appends a terminator when the file omits one', () => {
		expect(parseRLE('x = 1, y = 1\no').rle).toBe('o!');
	});

	it('drops anything after the terminator', () => {
		expect(parseRLE('x = 1, y = 1\no!trailing').rle).toBe('o!');
	});

	it('survives a file with no header line', () => {
		const out = parseRLE('3o!');
		expect(out.rle).toBe('3o!');
		expect(out.w).toBe(0);
		expect(out.h).toBe(0);
	});
});

describe('normalizeCells', () => {
	it('shifts a pattern to the origin and reports its size', () => {
		const out = normalizeCells([
			[5, 7],
			[6, 7],
			[5, 8]
		]);
		expect(sortCells(out.cells)).toEqual(['0,0', '0,1', '1,0']);
		expect([out.w, out.h]).toEqual([2, 2]);
	});

	it('handles negative coordinates', () => {
		const out = normalizeCells([
			[-3, -3],
			[-2, -3]
		]);
		expect(sortCells(out.cells)).toEqual(['0,0', '1,0']);
		expect([out.w, out.h]).toEqual([2, 1]);
	});

	it('returns an empty result for no cells', () => {
		expect(normalizeCells([])).toEqual({ cells: [], w: 0, h: 0 });
	});
});

describe('geometry', () => {
	const lShape = { cells: [[0, 0], [0, 1], [1, 1]] as Cell[], w: 2, h: 2 };

	it('returns the pattern unchanged at rotation 0', () => {
		const out = rotateCells(lShape, 0);
		expect(sortCells(out.cells)).toEqual(sortCells(lShape.cells));
	});

	it('returns to the original after four quarter turns', () => {
		let p = lShape;
		for (let i = 0; i < 4; i++) p = rotateCells(p, 1);
		expect(sortCells(p.cells)).toEqual(sortCells(lShape.cells));
	});

	it('swaps width and height on a quarter turn', () => {
		const tall = { cells: [[0, 0], [0, 1], [0, 2]] as Cell[], w: 1, h: 3 };
		const turned = rotateCells(tall, 1);
		expect([turned.w, turned.h]).toEqual([3, 1]);
	});

	it('keeps the cell count through any transform', () => {
		for (const rot of [0, 1, 2, 3]) {
			for (const flip of [false, true]) {
				expect(transformCells(lShape, rot, flip).cells).toHaveLength(lShape.cells.length);
			}
		}
	});

	it('mirrors left-to-right when flipped, leaving rows in place', () => {
		// L-shape: (0,0) (0,1) (1,1) in a 2x2 box -> mirrored about x
		const out = transformCells(lShape, 0, true);
		expect(sortCells(out.cells)).toEqual(['0,1', '1,0', '1,1']);
		expect([out.w, out.h]).toEqual([2, 2]);
	});

	it('rotates a quarter turn clockwise', () => {
		// (x, y) -> (h - 1 - y, x)
		const out = transformCells(lShape, 1, false);
		expect(sortCells(out.cells)).toEqual(['0,0', '0,1', '1,0']);
	});

	it('applies the rotation before the mirror', () => {
		const rotatedThenFlipped = transformCells(lShape, 1, true);
		const flippedThenRotated = rotateCells(transformCells(lShape, 0, true), 1);
		// the two orders differ -- this pins down which one the function does
		expect(sortCells(rotatedThenFlipped.cells)).toEqual(['0,0', '1,0', '1,1']);
		expect(sortCells(flippedThenRotated.cells)).not.toEqual(sortCells(rotatedThenFlipped.cells));
	});

	it('returns a half turn for rotation 2', () => {
		const out = transformCells(lShape, 2, false);
		expect(sortCells(out.cells)).toEqual(['0,0', '1,0', '1,1']);
		expect([out.w, out.h]).toEqual([2, 2]);
	});

	it('restores the original when a flip is applied twice', () => {
		const once = transformCells(lShape, 0, true);
		const twice = transformCells(once, 0, true);
		expect(sortCells(twice.cells)).toEqual(sortCells(lShape.cells));
	});

	it('compares two patterns cell by cell', () => {
		const p = (cells: Cell[], w: number, h: number) => ({ cells, w, h });
		expect(sameCells(p([[0, 0], [1, 1]], 2, 2), p([[0, 0], [1, 1]], 2, 2))).toBe(true);
		// same cells, different cell counts
		expect(sameCells(p([[0, 0]], 2, 2), p([[0, 0], [1, 1]], 2, 2))).toBe(false);
	});

	it('ignores the order the cells are listed in', () => {
		const p = (cells: Cell[]) => ({ cells, w: 2, h: 2 });
		expect(sameCells(p([[0, 0], [1, 1]]), p([[1, 1], [0, 0]]))).toBe(true);
	});

	it('separates patterns that differ only in width', () => {
		expect(sameCells({ cells: [[0, 0]], w: 1, h: 1 }, { cells: [[0, 0]], w: 2, h: 1 })).toBe(false);
	});

	it('separates patterns that differ only in height', () => {
		expect(sameCells({ cells: [[0, 0]], w: 1, h: 1 }, { cells: [[0, 0]], w: 1, h: 2 })).toBe(false);
	});

	it('separates patterns with the same count in different places', () => {
		const p = (cells: Cell[]) => ({ cells, w: 2, h: 2 });
		expect(sameCells(p([[0, 0]]), p([[0, 1]]))).toBe(false);
		expect(sameCells(p([[0, 0]]), p([[1, 0]]))).toBe(false);
	});

	it('does not confuse coordinates that share digits', () => {
		// '1,11' and '11,1' must not collide once joined into a key
		const p = (cells: Cell[]) => ({ cells, w: 12, h: 12 });
		expect(sameCells(p([[1, 11]]), p([[11, 1]]))).toBe(false);
	});

	it('treats two empty patterns of the same size as equal', () => {
		expect(sameCells({ cells: [], w: 0, h: 0 }, { cells: [], w: 0, h: 0 })).toBe(true);
	});

	it('steps rotation forwards while unflipped', () => {
		expect(nextOrientation(0, false, 'rotate')).toEqual({ rot: 1, flip: false });
		expect(nextOrientation(1, false, 'rotate')).toEqual({ rot: 2, flip: false });
		expect(nextOrientation(3, false, 'rotate')).toEqual({ rot: 0, flip: false });
	});

	it('steps rotation backwards once flipped', () => {
		// the stored form is "rotate then mirror", so a mirror reverses the
		// sense of any later rotation: on screen the button must still turn
		// clockwise, which means stepping the stored value down.
		expect(nextOrientation(0, true, 'rotate')).toEqual({ rot: 3, flip: true });
		expect(nextOrientation(3, true, 'rotate')).toEqual({ rot: 2, flip: true });
		expect(nextOrientation(1, true, 'rotate')).toEqual({ rot: 0, flip: true });
	});

	it('toggles the flip without touching the rotation', () => {
		expect(nextOrientation(2, false, 'flip')).toEqual({ rot: 2, flip: true });
		expect(nextOrientation(2, true, 'flip')).toEqual({ rot: 2, flip: false });
	});

	it('turns the shape on screen the same way whether or not it is flipped', () => {
		// the real contract: four ROTATE presses return to the start, and one
		// press moves the visible shape one quarter turn in the same direction
		// in both states.
		for (const startFlip of [false, true]) {
			let state = { rot: 0, flip: startFlip };
			for (let i = 0; i < 4; i++) state = nextOrientation(state.rot, state.flip, 'rotate');
			expect(state).toEqual({ rot: 0, flip: startFlip });
		}
	});
});
