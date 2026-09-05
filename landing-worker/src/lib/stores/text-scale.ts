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
 * So it is a setting. 12 and 24 are exact multiples of the face's own design
 * grid; the default sits between them at 14, which is the size this layout
 * actually reads best at -- sharpness is worth less than legibility at the
 * size most people will sit at, and the interpolation is only visible on
 * close inspection.
 *
 * Applied as a root font-size and consumed through rem, so one value scales
 * the whole site proportionally rather than each view needing to know.
 */
const KEY = 'krsz.text.scale';

/** Every step, smallest first. 12 and 24 are grid-exact. */
export const TEXT_SIZES = [12, 14, 16, 20, 24] as const;
export const DEFAULT_TEXT_SIZE = 14;

/* Auto is the default, because one fixed size cannot be right on both a 720p
   laptop and a 4K display: the layout is dense, and a size chosen for either
   end is unreadable or comically large at the other. Sizes come from the same
   ladder the manual buttons use, so switching between auto and a fixed size
   never lands anywhere new.

   The steps are named after physical resolutions, so the panel is measured in
   physical pixels -- screen.width times the device pixel ratio. CSS pixels
   would put a 2x 4K display on the same step as a 1080p one, since both report
   1920, which is the opposite of what a display that large is asking for.

   Each threshold is the width at which that step starts, so a screen exactly as
   wide as a named resolution gets that resolution's size: 1280 is 720p and
   takes 12, and 14 only begins above it. */
const AUTO_STEPS: readonly [number, number][] = [
	[7680, 24], // 8K
	[3840, 20], // 4K
	[2560, 16], // 2K / 1440p
	[1920, 14], // 1080p
	[0, 12] //    720p and below
];

export function autoTextSize(width: number): number {
	for (const [min, px] of AUTO_STEPS) if (width >= min) return px;
	return DEFAULT_TEXT_SIZE;
}

/** The panel's width in its own pixels, which is what the steps are named for. */
export function physicalScreenWidth(): number {
	if (typeof window === 'undefined') return 1920;
	const css = window.screen?.width || window.innerWidth;
	return Math.round(css * (window.devicePixelRatio || 1));
}

function currentAuto(): number {
	if (typeof window === 'undefined') return DEFAULT_TEXT_SIZE;
	return autoTextSize(physicalScreenWidth());
}

/** The resolved px the site renders at. */
export const textSize = writable<number>(DEFAULT_TEXT_SIZE);
/** Whether that value is being derived from the screen rather than chosen. */
export const textSizeAuto = writable<boolean>(true);

/* Re-resolve when the screen changes under us -- dragging the window to a
   second monitor with a different resolution changes which step applies, and a
   value that only settled once at boot would stay wrong for the session.
   Registered once; the guard inside means it costs nothing while a fixed size
   is selected. */
function watch(): void {
	if (typeof window === 'undefined') return;
	window.removeEventListener('resize', onChange);
	window.addEventListener('resize', onChange, { passive: true });
}

function onChange(): void {
	let isAuto = true;
	textSizeAuto.subscribe((v) => (isAuto = v))();
	if (isAuto) textSize.set(currentAuto());
}

export function initTextSize(): void {
	let stored: string | null = null;
	try {
		stored = localStorage.getItem(KEY);
	} catch {
		/* private mode -- fall through to auto */
	}
	const raw = Number(stored);
	if (stored !== null && stored !== 'auto' && (TEXT_SIZES as readonly number[]).includes(raw)) {
		textSizeAuto.set(false);
		textSize.set(raw);
	} else {
		textSizeAuto.set(true);
		textSize.set(currentAuto());
	}
	watch();
}

export function setTextSize(px: number): void {
	const next = (TEXT_SIZES as readonly number[]).includes(px) ? px : DEFAULT_TEXT_SIZE;
	textSizeAuto.set(false);
	textSize.set(next);
	try {
		localStorage.setItem(KEY, String(next));
	} catch {
		/* private mode -- the setting still holds for this visit */
	}
}

export function setTextSizeAuto(): void {
	textSizeAuto.set(true);
	textSize.set(currentAuto());
	try {
		localStorage.setItem(KEY, 'auto');
	} catch {
		/* private mode -- the setting still holds for this visit */
	}
}
