import { redirect } from '@sveltejs/kit';

/** `/x86sim` was the second name for this view — keep old links working. */
export const prerender = true;

export function load() {
	redirect(308, '/krsz-vm');
}
