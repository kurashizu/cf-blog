import { redirect } from '@sveltejs/kit';

/** `/utilities` was the original path for this view — keep old links working. */
export const prerender = true;

export function load() {
	redirect(308, '/utils');
}
