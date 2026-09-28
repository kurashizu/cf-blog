import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/* The audit pages are test benches -- the audio tests and tools/ear drive the
   engine through them against the dev server -- not part of the site. Built
   for production they were a public page handing anyone the engine's
   internals on `window.__audit`, so outside dev they are a 404, rendered on
   the server so the status is one too (not the SPA shell's 200). */
export const prerender = false;

export function load() {
	if (!dev) error(404, 'Not found');
}
