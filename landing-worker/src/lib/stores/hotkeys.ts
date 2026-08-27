import { writable } from 'svelte/store';

/**
 * When true, the layout's global nav hotkeys (Ctrl+0-3, T) are ignored.
 * The keyboard tester sets this while mounted — pressing "0" there must
 * light up the key, not navigate away.
 */
export const suspendNavHotkeys = writable<boolean>(false);
