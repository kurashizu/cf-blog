import { redirect } from '@sveltejs/kit';

/** `/linux` was the original path for this view — keep old links working. */
export const prerender = true;

export function load() {
	redirect(308, '/x86sim');
}
