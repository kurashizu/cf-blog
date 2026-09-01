import { derived, writable } from 'svelte/store';
import { browser } from '$app/environment';

export type FixedTheme = 'tokyo-matte' | 'gruvbox-dark' | 'nord-terminal' | 'cyber-amber';
export type WorkspaceTheme = FixedTheme | 'auto';

export interface ThemeStyle {
	bg: string;
	text: string;
	border: string;
	/** Solid — for surfaces that sit above the background video and must stay fully readable (modals, popovers). */
	headerBg: string;
	/** Solid — same reason. */
	cardBg: string;
	/** headerBg with alpha + blur, for surfaces that should let the background video show through. */
	headerBgVideo: string;
	/** cardBg with alpha + blur, same reason. */
	cardBgVideo: string;
	cursorColor: string;
	accentColor: string;
}

export const THEME_STYLES: Record<FixedTheme, ThemeStyle> = {
	'tokyo-matte': {
		bg: 'bg-[#16171d]',
		text: 'text-[#d8dee9]',
		border: 'border-[#2e3440]',
		headerBg: 'bg-[#1e222b]',
		cardBg: 'bg-[#1b1d24]',
		headerBgVideo: 'bg-[#1e222b]/85 backdrop-blur-sm',
		cardBgVideo: 'bg-[#1b1d24]/82 backdrop-blur-sm',
		cursorColor: '#56b6c2',
		accentColor: '#56b6c2'
	},
	'gruvbox-dark': {
		bg: 'bg-[#1d2021]',
		text: 'text-[#ebdbb2]',
		border: 'border-[#3c3836]',
		headerBg: 'bg-[#282828]',
		cardBg: 'bg-[#242728]',
		headerBgVideo: 'bg-[#282828]/85 backdrop-blur-sm',
		cardBgVideo: 'bg-[#242728]/82 backdrop-blur-sm',
		cursorColor: '#fabd2f',
		accentColor: '#fabd2f'
	},
	'nord-terminal': {
		bg: 'bg-[#1e222a]',
		text: 'text-[#eceff4]',
		border: 'border-[#3b4252]',
		headerBg: 'bg-[#2e3440]',
		cardBg: 'bg-[#242933]',
		headerBgVideo: 'bg-[#2e3440]/85 backdrop-blur-sm',
		cardBgVideo: 'bg-[#242933]/82 backdrop-blur-sm',
		cursorColor: '#88c0d0',
		accentColor: '#88c0d0'
	},
	'cyber-amber': {
		bg: 'bg-[#14120e]',
		text: 'text-[#e5be7a]',
		border: 'border-[#3d311c]',
		headerBg: 'bg-[#261f12]',
		cardBg: 'bg-[#1c1710]',
		headerBgVideo: 'bg-[#261f12]/85 backdrop-blur-sm',
		cardBgVideo: 'bg-[#1c1710]/82 backdrop-blur-sm',
		cursorColor: '#e5be7a',
		accentColor: '#ffd166'
	}
};

/**
 * Raw hex values behind each fixed theme, keyed to the custom-property names
 * app.css declares on :root. Tailwind's arbitrary-value classes in
 * THEME_STYLES above can't be read back out as colors, so anything that
 * needs the actual value (the root layout, to push it onto :root; the
 * lifelab game, which reads these vars directly rather than taking Tailwind
 * classes) goes through this table instead.
 */
export const THEME_CSS_VARS: Record<FixedTheme, Record<string, string>> = {
	'tokyo-matte': {
		'--bg': '#16171d',
		'--bg-card': '#1b1d24',
		'--border': '#2e3440',
		'--text-primary': '#d8dee9',
		'--text-secondary': '#90949d',
		'--text-tertiary': '#545863',
		'--selection': '#56b6c2'
	},
	'gruvbox-dark': {
		'--bg': '#1d2021',
		'--bg-card': '#242728',
		'--border': '#3c3836',
		'--text-primary': '#ebdbb2',
		'--text-secondary': '#a89984',
		'--text-tertiary': '#665c54',
		'--selection': '#fabd2f'
	},
	'nord-terminal': {
		'--bg': '#1e222a',
		'--bg-card': '#242933',
		'--border': '#3b4252',
		'--text-primary': '#eceff4',
		'--text-secondary': '#9aa5b8',
		'--text-tertiary': '#5f6b81',
		'--selection': '#88c0d0'
	},
	'cyber-amber': {
		'--bg': '#14120e',
		'--bg-card': '#1c1710',
		'--border': '#3d311c',
		'--text-primary': '#e5be7a',
		'--text-secondary': '#a8875a',
		'--text-tertiary': '#6b5638',
		'--selection': '#ffd166'
	}
};

/** Looping pixel-art backdrop per theme, muted and silent. See static/theme-bg/. */
export const THEME_VIDEO: Record<FixedTheme, string> = {
	'tokyo-matte': '/theme-bg/tokyo-matte.webm',
	'gruvbox-dark': '/theme-bg/gruvbox-dark.webm',
	'nord-terminal': '/theme-bg/nord-terminal.webm',
	'cyber-amber': '/theme-bg/cyber-amber.webm'
};

/**
 * Which fixed theme `auto` resolves to, by hour of the operator's own day
 * (Sydney, same clock the header already runs on — this is the operator's
 * desk, not a guest's timezone). Small-hours cool, midday the site's own
 * default, evening warming toward the amber terminal look.
 */
const AUTO_SCHEDULE: { fromHour: number; theme: FixedTheme }[] = [
	{ fromHour: 0, theme: 'nord-terminal' },
	{ fromHour: 5, theme: 'tokyo-matte' },
	{ fromHour: 11, theme: 'gruvbox-dark' },
	{ fromHour: 17, theme: 'cyber-amber' },
	{ fromHour: 21, theme: 'nord-terminal' }
];

function themeForHour(hour: number): FixedTheme {
	let picked: FixedTheme = AUTO_SCHEDULE[0].theme;
	for (const slot of AUTO_SCHEDULE) {
		if (hour >= slot.fromHour) picked = slot.theme;
	}
	return picked;
}

function sydneyHour(): number {
	return Number(
		new Intl.DateTimeFormat('en-US', {
			timeZone: 'Australia/Sydney',
			hour: '2-digit',
			hour12: false
		}).format(new Date())
	);
}

export const theme = writable<WorkspaceTheme>('auto');

/** Recomputed on each clock tick so `auto` actually moves across the day rather than freezing at load time. */
export const autoResolvedTheme = writable<FixedTheme>(browser ? themeForHour(sydneyHour()) : 'tokyo-matte');

/** Call once a minute (piggybacking the header clock's own tick is enough — the schedule only changes on the hour). */
export function refreshAutoTheme(): void {
	autoResolvedTheme.set(themeForHour(sydneyHour()));
}

export const resolvedTheme = derived([theme, autoResolvedTheme], ([$theme, $autoResolvedTheme]) =>
	$theme === 'auto' ? $autoResolvedTheme : $theme
);

const ORDER: WorkspaceTheme[] = ['auto', 'tokyo-matte', 'gruvbox-dark', 'nord-terminal', 'cyber-amber'];

export function cycleTheme(): void {
	theme.update((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length]);
}
