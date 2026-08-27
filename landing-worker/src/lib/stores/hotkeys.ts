import { writable } from 'svelte/store';

/**
 * When true, the layout's secondary hotkeys (T theme, backquote console) are ignored. Ctrl+0-3 navigation always works.
 * The keyboard tester sets this while mounted — pressing "0" there must
 * light up the key, not navigate away.
 */
export const suspendNavHotkeys = writable<boolean>(false);
