/**
 * `use:menu` -- keyboard for a list of choices that opened from a button
 * (the workbench Dropdown, the footer language picker, the synth's LOAD /
 * wave / preset menus). Attach to the list element that holds the item
 * buttons. The caller is responsible for role="menu" on the list and
 * role="menuitem" / "menuitemradio" (+ aria-checked) on each item; this
 * only moves focus and closes.
 *
 * On mount focus lands on the checked item (or the first). Up/Down wrap,
 * Home/End jump, a printable character jumps to the next item whose text
 * starts with it, Escape and Tab close (Tab is not trapped: a menu is not a
 * dialog, and leaving it is closing it). Clicks on a backdrop are the
 * caller's; `onClose` here is only what the keyboard asks for.
 */
export interface MenuOptions {
	onClose: () => void;
	/** Selector for items; defaults to role-based lookup. */
	items?: string;
}

const DEFAULT_ITEMS = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

export function menu(node: HTMLElement, opts: MenuOptions) {
	let options = opts;

	function items(): HTMLElement[] {
		return Array.from(node.querySelectorAll<HTMLElement>(options.items ?? DEFAULT_ITEMS)).filter(
			(el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true'
		);
	}

	function focusAt(i: number): void {
		const list = items();
		if (list.length === 0) return;
		const n = ((i % list.length) + list.length) % list.length;
		list[n].focus({ preventScroll: false });
	}

	function current(): number {
		return items().indexOf(document.activeElement as HTMLElement);
	}

	function onKeydown(e: KeyboardEvent): void {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				focusAt(current() + 1);
				return;
			case 'ArrowUp':
				e.preventDefault();
				focusAt(current() - 1);
				return;
			case 'Home':
				e.preventDefault();
				focusAt(0);
				return;
			case 'End':
				e.preventDefault();
				focusAt(-1);
				return;
			case 'Escape':
				e.preventDefault();
				e.stopPropagation();
				options.onClose();
				return;
			case 'Tab':
				options.onClose();
				return;
		}
		if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
			const list = items();
			const from = current();
			const ch = e.key.toLowerCase();
			for (let k = 1; k <= list.length; k++) {
				const el = list[(from + k) % list.length];
				if ((el.textContent ?? '').trim().toLowerCase().startsWith(ch)) {
					e.preventDefault();
					el.focus();
					return;
				}
			}
		}
	}

	const raf = requestAnimationFrame(() => {
		const list = items();
		const checked = list.findIndex((el) => el.getAttribute('aria-checked') === 'true');
		focusAt(checked >= 0 ? checked : 0);
	});

	node.addEventListener('keydown', onKeydown);
	return {
		update(next: MenuOptions) {
			options = next;
		},
		destroy() {
			cancelAnimationFrame(raf);
			node.removeEventListener('keydown', onKeydown);
		}
	};
}
