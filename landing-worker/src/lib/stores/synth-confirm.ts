import { writable, get } from 'svelte/store';

/**
 * One confirmation, shared.
 *
 * NEW throws away whatever is loaded, and there is no undo across a reset --
 * so each of the three NEW buttons asks first. A store rather than a flag in
 * each menu: the menus close before the action runs (they always did, so the
 * click lands on the button and not on the row underneath), which leaves no
 * component alive to own the question. The dialog lives at the workspace root
 * and reads from here.
 *
 * A browser confirm() would block the whole page, and does not speak the
 * site's five languages or wear its font.
 */
export type ConfirmRequest = {
	title: string;
	body: string;
	confirmLabel: string;
	onConfirm: () => void;
};

export const confirmRequest = writable<ConfirmRequest | null>(null);

export function askConfirm(req: ConfirmRequest): void {
	confirmRequest.set(req);
}

export function resolveConfirm(ok: boolean): void {
	const req = get(confirmRequest);
	confirmRequest.set(null);
	if (ok) req?.onConfirm();
}

/**
 * A short-lived status line: "saved", "loaded", "imported".
 *
 * Here rather than in synth-patch because synth-presets needed to say these
 * things too, and importing a toast from the patch module made a cycle --
 * synth-patch imports synth-presets to apply a preset file, synth-presets
 * imported synth-patch for this one function. Neither crashed, because every
 * use was inside a function body, but it was one moved top-level `const` away
 * from a boot-time undefined. Transient synth UI feedback is what this module
 * already holds.
 */
export const saveStatus = writable<string | null>(null);

export function showSaveStatus(msg: string): void {
	saveStatus.set(msg);
	setTimeout(() => saveStatus.set(null), 2000);
}
