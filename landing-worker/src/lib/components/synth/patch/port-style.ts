import type { PortRole } from '../../../stores/graph-model';

/**
 * How a socket of each role is drawn: one shape and one colour per role, and
 * no two roles sharing both.
 *
 * Shape and colour together, because either alone is ambiguous: a round amber
 * dot beside a round white one is two colours of one thing, and shape without
 * colour asks you to compare outlines at 12px. The families read by colour
 * first -- white and cyan are sound, the warm and saturated ones are values,
 * white chevrons are execution -- and the role within a family by shape.
 *
 *   exec    chevron, white        execution: what this note runs
 *   signal  circle, white         ordinary sound, any width
 *   mono    square, white         definitely one channel
 *   stereo  double ring, cyan     definitely two, on one cable
 *   left    half-circle, cyan     one side of a split pair
 *   right   half-circle, cyan
 *   cv      diamond, amber        a control value, untyped
 *   unit    drop, red             an amount, 0..1
 *   hz      triangle, blue        a frequency, pointing along a continuum
 *   pitch   step, green           a note on a scale
 *   index   hexagon, purple       a count
 *   time    capsule, orange       a length of time
 *   bool    tick, pink            true or false
 *
 * TIME and BOOL were a cyan diamond and a yellow circle: the first the cv
 * diamond in stereo's colour, the second the signal circle in cv's colour, so
 * each read as another role until you leaned in. A duration is a length, so
 * it is a capsule; a truth is a tick. UNIT's "drop" was a clipped kite that
 * rendered as a second diamond; it is a real teardrop now, point up.
 *
 * Every socket is filled -- an outlined one read as disabled. `shape` is a
 * class drawn on the socket's visible glyph only; the hit area around it is a
 * plain square, so a shape with little area (the step, the tick) is as easy
 * to aim at as a circle.
 */
export const PORT_STYLE: Record<PortRole, { shape: string; color: string }> = {
	exec: { shape: 'clip-chevron', color: '#ffffff' },
	signal: { shape: 'rounded-full', color: '#ffffff' },
	mono: { shape: 'rounded-[2px]', color: '#ffffff' },
	stereo: { shape: 'rounded-full port-stereo', color: '#56b6c2' },
	left: { shape: 'rounded-l-full', color: '#56b6c2' },
	right: { shape: 'rounded-r-full', color: '#56b6c2' },
	cv: { shape: 'rotate-45 scale-[0.8]', color: '#e5c07b' },
	unit: { shape: 'rounded-[0_50%_50%_50%] rotate-45 scale-[0.8]', color: '#e06c75' },
	hz: { shape: 'clip-triangle', color: '#61afef' },
	pitch: { shape: 'clip-step', color: '#98c379' },
	index: { shape: 'clip-hex', color: '#c678dd' },
	time: { shape: 'clip-capsule', color: '#d19a66' },
	bool: { shape: 'clip-tick', color: '#ff79c6' }
};
