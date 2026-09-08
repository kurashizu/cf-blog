import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		alias: {
			$shared: '../shared'
		}
	},
	compilerOptions: {
		runes: true
	},
	/* The compiler's accessibility checks are the first line of the a11y gate:
	   an unnamed control, a click handler on a div, an image without alt fail
	   the build instead of scrolling past as warnings. Fix the element; do
	   not add a svelte-ignore (the second line, Playwright + axe in tests/a11y,
	   catches what the compiler cannot see). */
	onwarn(warning, handler) {
		/* One exemption: axe's scrollable-region-focusable (WCAG 2.1.1) wants a
		   scrolling log/list to carry tabindex="0" so the keyboard can scroll
		   it, and Svelte's a11y_no_noninteractive_tabindex flags exactly that.
		   The WCAG side wins; the rule stays a warning. */
		if (warning.code.startsWith('a11y_') && warning.code !== 'a11y_no_noninteractive_tabindex') {
			throw new Error(`[a11y] ${warning.filename ?? ''}:${warning.start?.line ?? '?'} ${warning.message}`);
		}
		handler(warning);
	}
};

export default config;
