/**
 * `use:modal` -- everything a dialog owes the keyboard and a screen reader,
 * attached to the *scrim* element (the fixed inset-0 backdrop that holds the
 * panel), so the six chrome overlays and the synth's own dialogs share one
 * implementation instead of each remembering Escape and nothing else.
 *
 * What it does, for as long as the node is mounted:
 * - role="dialog" aria-modal="true" on the panel (the first element child,
 *   or the node itself when there is none) and `inert` on the app root, so
 *   assistive tech and Tab cannot reach the page behind. Reference-counted:
 *   a dialog opened over another (privacy over welcome) releases its own
 *   claim only.
 * - Moves focus in: to `[data-autofocus]` if present, else the first
 *   focusable element, else the panel itself (given tabindex=-1).
 * - Traps Tab / Shift+Tab inside the panel.
 * - Escape closes (stopping propagation so the layout's own Esc handler does
 *   not also fire), as does a click that lands on the scrim itself and not
 *   on the panel -- the click handler lives here so the scrim needs no
 *   onclick of its own, which is what kept every dialog on a svelte-ignore.
 * - Returns focus to whatever had it before the dialog opened.
 */

export interface ModalOptions {
	onClose?: () => void;
	/** Set false for a full-screen stage (welcome, boot) that closes only by its own controls. */
	closeOnBackdrop?: boolean;
	closeOnEscape?: boolean;
	/** id of the element that names the dialog; falls back to aria-label. */
	labelledBy?: string;
	label?: string;
	/** Skip inerting the page behind -- for non-blocking sheets like the drop-down console. */
	inertPage?: boolean;
}

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

let inertClaims = 0;
function claimInert(): void {
	inertClaims++;
	const root = document.querySelector<HTMLElement>('[data-app-root]');
	if (root) root.inert = true;
}
function releaseInert(): void {
	inertClaims = Math.max(0, inertClaims - 1);
	if (inertClaims === 0) {
		const root = document.querySelector<HTMLElement>('[data-app-root]');
		if (root) root.inert = false;
	}
}

function focusables(panel: HTMLElement): HTMLElement[] {
	return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => el.offsetParent !== null || el === document.activeElement
	);
}

export function modal(node: HTMLElement, opts: ModalOptions = {}) {
	let options = opts;
	const panel = (node.firstElementChild as HTMLElement | null) ?? node;
	const previouslyFocused = document.activeElement as HTMLElement | null;
	const inertPage = options.inertPage !== false;

	panel.setAttribute('role', 'dialog');
	panel.setAttribute('aria-modal', 'true');
	if (options.labelledBy) panel.setAttribute('aria-labelledby', options.labelledBy);
	else if (options.label) panel.setAttribute('aria-label', options.label);
	if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
	if (inertPage) claimInert();

	function focusIn(): void {
		const preferred = panel.querySelector<HTMLElement>('[data-autofocus]');
		const target = preferred ?? focusables(panel)[0] ?? panel;
		target.focus({ preventScroll: true });
	}
	// After the mount transition has had a frame to lay the panel out --
	// focusing a node that is still display:none or mid-scale is a no-op.
	const raf = requestAnimationFrame(focusIn);

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			if (options.closeOnEscape === false) return;
			e.stopPropagation();
			e.preventDefault();
			options.onClose?.();
			return;
		}
		if (e.key !== 'Tab') return;
		const list = focusables(panel);
		if (list.length === 0) {
			e.preventDefault();
			panel.focus();
			return;
		}
		const first = list[0];
		const last = list[list.length - 1];
		const active = document.activeElement as HTMLElement | null;
		if (e.shiftKey && (active === first || !panel.contains(active))) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first.focus();
		}
	}

	function onPointerDown(e: PointerEvent): void {
		if (options.closeOnBackdrop === false) return;
		if (e.target !== node) return;
		e.preventDefault();
		options.onClose?.();
	}

	// Focus that escapes anyway (a click on the inert page cannot, but a
	// programmatic focus elsewhere can) is pulled back.
	function onFocusIn(e: FocusEvent): void {
		if (!panel.contains(e.target as Node)) focusIn();
	}

	node.addEventListener('keydown', onKeydown);
	node.addEventListener('pointerdown', onPointerDown);
	document.addEventListener('focusin', onFocusIn);

	return {
		update(next: ModalOptions) {
			options = next;
		},
		destroy() {
			cancelAnimationFrame(raf);
			node.removeEventListener('keydown', onKeydown);
			node.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('focusin', onFocusIn);
			if (inertPage) releaseInert();
			if (previouslyFocused && previouslyFocused.isConnected) previouslyFocused.focus({ preventScroll: true });
		}
	};
}
