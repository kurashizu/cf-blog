import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';

/* A path no route matches used to be server-rendered through the whole root
   layout just to say 404: ~150 ms of CPU each, measured, and scanners probing
   /.env or /wp-login.php make up most of this worker's traffic. The build
   already emits a static 404.html (the SPA shell, which renders the same error
   page client-side), so serve that instead. `platform` is absent under
   `vite dev`, where the normal render is fine. */
export const handle: Handle = async ({ event, resolve }) => {
	if (event.route.id === null && !building && event.platform) {
		const page = await event.platform.env.ASSETS.fetch(new URL('/404.html', event.url));
		return new Response(page.body, {
			status: 404,
			headers: { 'content-type': 'text/html; charset=utf-8' }
		});
	}
	return resolve(event);
};
