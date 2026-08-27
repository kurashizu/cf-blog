import { writable } from 'svelte/store';

export type WorkspaceTheme = 'tokyo-matte' | 'gruvbox-dark' | 'nord-terminal' | 'cyber-amber';

export interface ThemeStyle {
	bg: string;
	text: string;
	border: string;
	headerBg: string;
	cardBg: string;
	cursorColor: string;
	accentColor: string;
}

export const THEME_STYLES: Record<WorkspaceTheme, ThemeStyle> = {
	'tokyo-matte': {
		bg: 'bg-[#16171d]',
		text: 'text-[#d8dee9]',
		border: 'border-[#2e3440]',
		headerBg: 'bg-[#1e222b]',
		cardBg: 'bg-[#1b1d24]',
		cursorColor: '#56b6c2',
		accentColor: '#56b6c2'
	},
	'gruvbox-dark': {
		bg: 'bg-[#1d2021]',
		text: 'text-[#ebdbb2]',
		border: 'border-[#3c3836]',
		headerBg: 'bg-[#282828]',
		cardBg: 'bg-[#242728]',
		cursorColor: '#fabd2f',
		accentColor: '#fabd2f'
	},
	'nord-terminal': {
		bg: 'bg-[#1e222a]',
		text: 'text-[#eceff4]',
		border: 'border-[#3b4252]',
		headerBg: 'bg-[#2e3440]',
		cardBg: 'bg-[#242933]',
		cursorColor: '#88c0d0',
		accentColor: '#88c0d0'
	},
	'cyber-amber': {
		bg: 'bg-[#14120e]',
		text: 'text-[#e5be7a]',
		border: 'border-[#3d311c]',
		headerBg: 'bg-[#261f12]',
		cardBg: 'bg-[#1c1710]',
		cursorColor: '#e5be7a',
		accentColor: '#ffd166'
	}
};

const ORDER: WorkspaceTheme[] = ['tokyo-matte', 'gruvbox-dark', 'nord-terminal', 'cyber-amber'];

export const theme = writable<WorkspaceTheme>('tokyo-matte');

export function cycleTheme(): void {
	theme.update((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length]);
}
