export type DragMode = 'relative' | 'absolute-y' | 'absolute-x';

export interface DraggableOptions {
	mode: DragMode;
	min: number;
	max: number;
	step: number;
	/** relative mode only — units per pixel of drag. Defaults to (max-min)/100. */
	sensitivity?: number;
	getValue: () => number;
	onChange: (value: number) => void;
	onDragStart?: () => void;
	onDragEnd?: () => void;
}

/**
 * Unified pointer-drag action for knobs/faders — one code path for mouse, touch and pen via
 * the Pointer Events API, replacing the original's separate (and once-mismatched) mouse/touch handlers.
 */
export function draggable(node: HTMLElement, opts: DraggableOptions) {
	let options = opts;
	let dragStartCoord = 0;
	let startVal = 0;

	function clampStep(raw: number): number {
		const stepped = Math.round(raw / options.step) * options.step;
		return Math.max(options.min, Math.min(options.max, stepped));
	}

	function valueFromEvent(e: PointerEvent): number {
		if (options.mode === 'relative') {
			const delta = dragStartCoord - e.clientY;
			const sensitivity = options.sensitivity ?? (options.max - options.min) / 100;
			return clampStep(startVal + delta * sensitivity);
		}
		const rect = node.getBoundingClientRect();
		if (options.mode === 'absolute-y') {
			const y = e.clientY - rect.top;
			const pct = 1 - Math.max(0, Math.min(1, y / rect.height));
			return clampStep(options.min + pct * (options.max - options.min));
		}
		const x = e.clientX - rect.left;
		const pct = Math.max(0, Math.min(1, x / rect.width));
		return clampStep(options.min + pct * (options.max - options.min));
	}

	function handleMove(e: PointerEvent) {
		options.onChange(valueFromEvent(e));
	}

	function handleUp() {
		window.removeEventListener('pointermove', handleMove);
		window.removeEventListener('pointerup', handleUp);
		options.onDragEnd?.();
	}

	function handleDown(e: PointerEvent) {
		if (!e.isPrimary) return;
		e.preventDefault();
		dragStartCoord = e.clientY;
		startVal = options.getValue();
		options.onDragStart?.();
		if (options.mode !== 'relative') handleMove(e);
		window.addEventListener('pointermove', handleMove);
		window.addEventListener('pointerup', handleUp);
	}

	node.addEventListener('pointerdown', handleDown);

	return {
		update(newOpts: DraggableOptions) {
			options = newOpts;
		},
		destroy() {
			node.removeEventListener('pointerdown', handleDown);
			window.removeEventListener('pointermove', handleMove);
			window.removeEventListener('pointerup', handleUp);
		}
	};
}
