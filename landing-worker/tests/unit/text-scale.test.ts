import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	TEXT_SIZES,
	DEFAULT_TEXT_SIZE,
	autoTextSize,
	physicalScreenWidth,
	setTextSize,
	textSize,
	textSizeAuto
} from '../../src/lib/stores/text-scale';
import { get } from 'svelte/store';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('autoTextSize', () => {
	/* The CFG panel tells the visitor "12 at 720p, 14 at 1080p, 16 at 2K, 20 at
	   4K, 24 at 8K". These are that sentence, as assertions. */
	it.each([
		[1280, 12],
		[1920, 14],
		[2560, 16],
		[3840, 20],
		[7680, 24]
	])('gives %ipx wide a size of %i', (width, expected) => {
		expect(autoTextSize(width)).toBe(expected);
	});

	it('starts each step at the named resolution, not above it', () => {
		// a screen exactly as wide as a named resolution gets that size
		expect(autoTextSize(1920)).toBe(14);
		expect(autoTextSize(1919)).toBe(12);
		expect(autoTextSize(2560)).toBe(16);
		expect(autoTextSize(2559)).toBe(14);
		expect(autoTextSize(3840)).toBe(20);
		expect(autoTextSize(3839)).toBe(16);
		expect(autoTextSize(7680)).toBe(24);
		expect(autoTextSize(7679)).toBe(20);
	});

	it('gives the smallest size to anything below 1080p', () => {
		for (const w of [0, 320, 800, 1024, 1280, 1600]) {
			expect(autoTextSize(w)).toBe(12);
		}
	});

	it('does not exceed the top step on an absurdly wide screen', () => {
		expect(autoTextSize(100000)).toBe(24);
	});

	it('never returns a size outside the ladder', () => {
		for (let w = 0; w <= 9000; w += 37) {
			expect(TEXT_SIZES as readonly number[]).toContain(autoTextSize(w));
		}
	});

	it('never gets smaller as the screen gets wider', () => {
		let last = 0;
		for (let w = 0; w <= 9000; w += 13) {
			const px = autoTextSize(w);
			expect(px).toBeGreaterThanOrEqual(last);
			last = px;
		}
	});

	it('falls back to the default for a width no step can match', () => {
		// the last step is [0, 12], so a negative or NaN width matches nothing
		// and the function returns the default rather than the smallest size.
		// Neither can come from a real screen; this pins the behaviour down
		// rather than endorsing it.
		expect(autoTextSize(-1)).toBe(DEFAULT_TEXT_SIZE);
		expect(autoTextSize(Number.NaN)).toBe(DEFAULT_TEXT_SIZE);
	});
});

describe('physicalScreenWidth', () => {
	it('multiplies the CSS width by the device pixel ratio', () => {
		// a 2x 4K panel reports 1920 CSS px; the steps are named for physical
		// pixels, so it has to come out at 3840
		vi.stubGlobal('window', { screen: { width: 1920 }, devicePixelRatio: 2, innerWidth: 1920 });
		expect(physicalScreenWidth()).toBe(3840);
		expect(autoTextSize(physicalScreenWidth())).toBe(20);
	});

	it('treats a missing ratio as 1', () => {
		vi.stubGlobal('window', { screen: { width: 1280 }, innerWidth: 1280 });
		expect(physicalScreenWidth()).toBe(1280);
	});

	it('falls back to innerWidth when there is no screen', () => {
		vi.stubGlobal('window', { innerWidth: 800, devicePixelRatio: 1 });
		expect(physicalScreenWidth()).toBe(800);
	});

	it('rounds a fractional ratio', () => {
		vi.stubGlobal('window', { screen: { width: 1512 }, devicePixelRatio: 1.5, innerWidth: 1512 });
		expect(physicalScreenWidth()).toBe(2268);
	});
});

describe('setTextSize', () => {
	it('accepts every size on the ladder', () => {
		for (const px of TEXT_SIZES) {
			setTextSize(px);
			expect(get(textSize)).toBe(px);
			expect(get(textSizeAuto)).toBe(false);
		}
	});

	it('falls back to the default for a size that is not on the ladder', () => {
		setTextSize(13);
		expect(get(textSize)).toBe(DEFAULT_TEXT_SIZE);
		setTextSize(999);
		expect(get(textSize)).toBe(DEFAULT_TEXT_SIZE);
		setTextSize(Number.NaN);
		expect(get(textSize)).toBe(DEFAULT_TEXT_SIZE);
	});

	it('turns auto off even when the value is rejected', () => {
		setTextSize(13);
		expect(get(textSizeAuto)).toBe(false);
	});
});

describe('the ladder itself', () => {
	it('is ascending and has no duplicates', () => {
		const sizes = [...TEXT_SIZES];
		expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
		expect(new Set(sizes).size).toBe(sizes.length);
	});

	it('includes the default', () => {
		expect(TEXT_SIZES as readonly number[]).toContain(DEFAULT_TEXT_SIZE);
	});

	it('contains the two sizes that land exactly on the 12px font grid', () => {
		// the typeface is drawn on a 12px grid, so 12 and 24 are the sharp ones
		expect(TEXT_SIZES as readonly number[]).toContain(12);
		expect(TEXT_SIZES as readonly number[]).toContain(24);
	});
});
