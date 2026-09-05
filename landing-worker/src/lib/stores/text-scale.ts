import { writable } from 'svelte/store';

/**
 * Site-wide text size.
 *
 * The site is set in Jelly Pixel, a 12px bitmap face whose cap-height is 8px
 * where the outline mono it replaced gave 10.2px -- so the whole thing reads
 * about a fifth smaller than it used to. Which size is right depends on the
 * screen and the eyes in front of it, and this layout is dense enough that
 * picking one for everybody is the wrong call: 12px fits the most on screen,
 * 24px is comfortable but starts clipping the tighter panels.
 *
 * So it is a setting. Every step is a multiple of the face's own 12px design
 * grid except the 16px default, which is the size the site actually reads
 * best at -- sharpness is worth less than legibility at the size most people
 * will sit at, and the difference is only visible on close inspection.
 *
 * Applied as a root font-size and consumed through rem, so one value scales
 * the whole site proportionally rather than each view needing to know.
 */
const KEY = 'krsz.text.scale';

/** Every step, smallest first. 16 is the default; 12 and 24 are grid-exact. */
export const TEXT_SIZES = [12, 14, 16, 20, 24] as const;
export const DEFAULT_TEXT_SIZE = 16;

function readInitial(): number {
	try {
		const raw = Number(localStorage.getItem(KEY));
		return (TEXT_SIZES as readonly number[]).includes(raw) ? raw : DEFAULT_TEXT_SIZE;
	} catch {
		return DEFAULT_TEXT_SIZE;
	}
}

export const textSize = writable<number>(DEFAULT_TEXT_SIZE);

export function initTextSize(): void {
	textSize.set(readInitial());
}

export function setTextSize(px: number): void {
	const next = (TEXT_SIZES as readonly number[]).includes(px) ? px : DEFAULT_TEXT_SIZE;
	textSize.set(next);
	try {
		localStorage.setItem(KEY, String(next));
	} catch {
		/* private mode -- the setting still holds for this visit */
	}
}
