export const TAB_ROUTES = [
	'/modules',
	'/guestbook',
	'/synth',
	'/utils',
	'/leaderboard',
	'/krsz-vm',
	'/chatbot',
	'/lifelab'
] as const;

export const TAB_TITLES = [
	'KRSZ™ // 0:modules — Live Project Portal',
	'KRSZ™ // 1:guestbook — Edge Packet Messenger',
	'KRSZ™ // 2:synth — WebAudio Modular Synthesizer',
	'KRSZ™ // 3:utils — Hardware Test Bench',
	'KRSZ™ // 4:leaderboard — LLM Model Table',
	'KRSZ™ // 5:krsz-vm — x86 PC Emulator',
	'KRSZ™ // 6:chatbot — In-Browser LLM on WebGPU',
	'KRSZ™ // 7:lifelab — Conway Automaton Laboratory'
];

/** Which of the tabs a pathname belongs to — mirrors the root path ('' / '/') to tab 0. */
export function tabIndexFromPath(pathname: string): number {
	const clean = pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
	const idx = TAB_ROUTES.findIndex((route) => route === `/${clean}`);
	return idx === -1 ? 0 : idx;
}

/**
 * Routes that only work on a cross-origin isolated document.
 *
 * QEMU shares memory with the worker running its CPU, which needs
 * SharedArrayBuffer, which a browser only grants when the page was *delivered*
 * with COOP and COEP. `_headers` sets those on /krsz-vm alone: isolation also
 * requires every cross-origin subresource to opt in, and the chatbot's model
 * host does not send cross-origin-resource-policy, so making the headers
 * site-wide would trade a broken VM for a broken 1.2GB model download.
 *
 * The catch is that COOP and COEP are properties of the document, applied when
 * it is created. A SvelteKit client-side navigation swaps the page contents
 * without creating one, so arriving at /krsz-vm from any other tab -- the usual
 * way in -- left the VM on a document that was never isolated, and it failed
 * with "not cross-origin isolated" while a direct load of the same URL worked.
 */
export const ISOLATED_ROUTES: readonly string[] = ['/krsz-vm'];

/**
 * Navigates to `route`, using a real document load where isolation is needed.
 *
 * Everywhere else keeps the instant client-side transition.
 */
export function navigateTo(route: string, spa: (r: string) => void): void {
	if (ISOLATED_ROUTES.includes(route)) {
		if (typeof location !== 'undefined' && location.pathname !== route) {
			location.assign(route);
			return;
		}
	}
	spa(route);
}
