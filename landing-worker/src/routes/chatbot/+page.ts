import { redirect } from '@sveltejs/kit';

// The view was called chatbot until Sep 2026; old links and bookmarks land here.
export const prerender = false;
export function load(): never {
	redirect(301, '/web-lm');
}
