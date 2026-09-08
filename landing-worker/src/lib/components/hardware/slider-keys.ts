/**
 * Keyboard for the knobs and faders, per the ARIA slider pattern: arrows
 * move one step, PageUp/PageDown ten, Home/End to the ends, and the
 * caller's reset key (Backspace / Delete) snaps to the neutral value when
 * the control has one. Shared by RotaryKnob and both faders so the three
 * cannot drift apart. Returns the new value, or null when the key was not
 * one of ours (so the caller leaves the event alone).
 */
export interface SliderKeyOptions {
	value: number;
	min: number;
	max: number;
	step: number;
	reset?: number;
}

export function sliderKeyValue(e: KeyboardEvent, o: SliderKeyOptions): number | null {
	let delta = 0;
	switch (e.key) {
		case 'ArrowUp':
		case 'ArrowRight':
			delta = 1;
			break;
		case 'ArrowDown':
		case 'ArrowLeft':
			delta = -1;
			break;
		case 'PageUp':
			delta = 10;
			break;
		case 'PageDown':
			delta = -10;
			break;
		case 'Home':
			return o.min;
		case 'End':
			return o.max;
		case 'Backspace':
		case 'Delete':
			return o.reset === undefined ? null : o.reset;
		default:
			return null;
	}
	if (e.shiftKey) delta *= 10;
	const decimals = (String(o.step).split('.')[1] ?? '').length;
	const stepped = Math.round((o.value + o.step * delta) / o.step) * o.step;
	return Math.max(o.min, Math.min(o.max, Number(stepped.toFixed(decimals))));
}
