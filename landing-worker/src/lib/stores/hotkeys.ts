import { writable } from 'svelte/store';

/**
 * When true, the layout's secondary hotkeys (T theme, backquote console) are ignored. Ctrl+0-3 navigation always works.
 * The keyboard tester sets this while mounted — pressing "0" there must
 * light up the key, not navigate away.
 */
export const suspendNavHotkeys = writable<boolean>(false);

/** A view that owns the keyboard (suspendNavHotkeys) but does not use the
 *  backquote itself can leave the drop-down console reachable: LIFE.LAB
 *  needs Space / R / F, not `. The VM terminal, the keyboard tester and the
 *  QWERTY piano leave this false, since there ` is a real key. */
export const consoleHotkeyWhileSuspended = writable<boolean>(false);
