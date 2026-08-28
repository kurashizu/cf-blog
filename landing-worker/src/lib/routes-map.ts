export const TAB_ROUTES = ['/modules', '/guestbook', '/synth', '/utils', '/leaderboard', '/x86sim'] as const;

export const TAB_TITLES = [
	'KRSZ™ // 0:modules — Live Project Portal',
	'KRSZ™ // 1:guestbook — Edge Packet Messenger',
	'KRSZ™ // 2:synth — WebAudio Modular Synthesizer',
	'KRSZ™ // 3:utils — Hardware Test Bench',
	'KRSZ™ // 4:leaderboard — LLM Model Table',
	'KRSZ™ // 5:x86sim — x86 PC Emulator'
];

/** Which of the tabs a pathname belongs to — mirrors the root path ('' / '/') to tab 0. */
export function tabIndexFromPath(pathname: string): number {
	const clean = pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
	const idx = TAB_ROUTES.findIndex((route) => route === `/${clean}`);
	return idx === -1 ? 0 : idx;
}
